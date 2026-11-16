"""Cola de descargas de YouTube con progreso real (en un hilo de fondo).

Dos formas de ejecutar yt-dlp:
- "exe": el programa yt-dlp.exe (app instalada). Se puede actualizar sin reinstalar.
- "module": la librería de Python yt_dlp (desarrollo y tests).
"""
import json
import os
import queue
import re
import subprocess
import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

from sqlalchemy import select

from db import Song, utcnow
from library import audio_duration, canonical_url, parse_title, thumbnail_for

OUTTMPL = "%(title)s [%(id)s].%(ext)s"

# Errores típicos de un yt-dlp desactualizado frente a cambios de YouTube
_OUTDATED = re.compile(
    r"nsig|n challenge|signature|unable to extract|player response|precondition|"
    r"http error 403|requested format is not available|sign in to confirm|"
    r"please update|confirm you.re not a bot|jsc|js challenge",
    re.I,
)


@dataclass
class Job:
    id: str
    url: str
    youtube_id: str
    status: str = "queued"  # queued | downloading | processing | done | error
    progress: float = 0.0  # 0-100
    title: str | None = None
    song_id: int | None = None
    error: str | None = None
    error_kind: str | None = None  # "outdated" -> sugerir actualizar yt-dlp
    created_at: str = field(default_factory=lambda: utcnow().isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


def classify_error(message: str) -> str | None:
    return "outdated" if _OUTDATED.search(message or "") else None


def clean_error(message: str) -> str:
    text = re.sub(r"\x1b\[[0-9;]*m", "", message or "").strip()
    return text.removeprefix("ERROR: ")[:500]


def build_ydl_opts(music_dir: Path, ffmpeg_path: str | None) -> dict:
    opts = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": str(music_dir / OUTTMPL),
        "writethumbnail": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"},
            {"key": "FFmpegMetadata", "add_metadata": True},
            {"key": "EmbedThumbnail"},
        ],
        "postprocessor_args": {"extractaudio": ["-ar", "44100"]},
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    if ffmpeg_path:
        opts["ffmpeg_location"] = ffmpeg_path
    return opts


def build_exe_args(url: str, music_dir: Path, ffmpeg_path: str | None, js_runtime: str | None) -> list[str]:
    """Argumentos para yt-dlp.exe equivalentes a build_ydl_opts, con progreso legible."""
    args = [
        url,
        "--no-playlist",
        "-f", "bestaudio/best",
        "-x", "--audio-format", "mp3", "--audio-quality", "192K",
        "--postprocessor-args", "ExtractAudio:-ar 44100",
        "--embed-metadata", "--embed-thumbnail",
        "-o", str(music_dir / OUTTMPL),
        "--newline", "--no-colors", "--progress", "--no-simulate",
        "--progress-template",
        "download:DRPROG %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
        "--print", "after_move:DRDONE %()j",
    ]
    if ffmpeg_path:
        args += ["--ffmpeg-location", ffmpeg_path]
    if js_runtime:
        args += ["--js-runtimes", js_runtime]
    return args


def _num(text: str) -> float | None:
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


class Downloader:
    """Procesa las descargas de una en una para no saturar YouTube."""

    def __init__(self, session_factory, music_dir: Path, ffmpeg_path: str | None = None,
                 ydl_factory: Callable | None = None, exe_cmd: list[str] | None = None,
                 js_runtime: str | None = None, exe_env: dict | None = None):
        self._sessions = session_factory
        self._music_dir = music_dir
        self._ffmpeg = ffmpeg_path
        self._ydl_factory = ydl_factory
        self._exe_cmd = exe_cmd  # p. ej. ["C:/.../yt-dlp.exe"]; si es None se usa el módulo
        self._js_runtime = js_runtime
        self._exe_env = exe_env or {}
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
        self._proc: subprocess.Popen | None = None
        self._worker = threading.Thread(target=self._run, daemon=True, name="downloader")
        self._worker.start()

    # ---------- API pública ----------
    def submit(self, youtube_id: str) -> Job:
        with self._lock:
            for job in self._jobs.values():
                if job.youtube_id == youtube_id and job.status in ("queued", "downloading", "processing"):
                    return job
            job = Job(id=uuid.uuid4().hex[:12], url=canonical_url(youtube_id), youtube_id=youtube_id)
            self._jobs[job.id] = job
        self._queue.put(job.id)
        return job

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def wait_idle(self) -> None:
        """Solo para tests: espera a que la cola quede vacía."""
        self._queue.join()

    def shutdown(self) -> None:
        """Al cerrar la app: no dejar un yt-dlp descargando solo."""
        proc = self._proc
        if proc and proc.poll() is None:
            proc.kill()

    # ---------- trabajo en segundo plano ----------
    def _run(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._process(self._jobs[job_id])
            finally:
                self._queue.task_done()

    def _process(self, job: Job) -> None:
        job.status = "downloading"
        try:
            info, final = self._download_exe(job) if self._exe_cmd else self._download_module(job)
            job.title = info.get("title")
            job.song_id = self._save(job, info, final)
            job.progress = 100.0
            job.status = "done"
        except Exception as exc:  # noqa: BLE001 - se informa al usuario
            message = clean_error(str(exc))
            job.status = "error"
            job.error = message
            job.error_kind = classify_error(message)

    def _set_progress(self, job: Job, done, total) -> None:
        if total:
            job.progress = round(min(float(done or 0) / float(total) * 90, 90), 1)
        job.status = "downloading"

    # --- modo librería de Python ---
    def _download_module(self, job: Job) -> tuple[dict, Path]:
        factory = self._ydl_factory
        if factory is None:
            import yt_dlp  # solo en desarrollo; la app instalada usa yt-dlp.exe
            factory = yt_dlp.YoutubeDL

        def hook(d: dict) -> None:
            if d.get("status") == "downloading":
                self._set_progress(job, d.get("downloaded_bytes"), d.get("total_bytes") or d.get("total_bytes_estimate"))
            elif d.get("status") == "finished":
                job.progress = 90.0
                job.status = "processing"

        opts = build_ydl_opts(self._music_dir, self._ffmpeg)
        opts["progress_hooks"] = [hook]
        with factory(opts) as ydl:
            info = ydl.extract_info(job.url, download=True)
        return info, self._final_path(info)

    # --- modo ejecutable (yt-dlp.exe) ---
    def _download_exe(self, job: Job) -> tuple[dict, Path]:
        cmd = [*self._exe_cmd, *build_exe_args(job.url, self._music_dir, self._ffmpeg, self._js_runtime)]
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", **self._exe_env}
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        info = None
        errors: list[str] = []
        self._proc = proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
            encoding="utf-8", errors="replace", creationflags=flags,
        )
        try:
            for line in proc.stdout:
                line = line.strip()
                if line.startswith("DRPROG "):
                    _, done, total, estimate = (line.split(" ") + ["NA"] * 4)[:4]
                    self._set_progress(job, _num(done), _num(total) or _num(estimate))
                elif line.startswith("DRDONE "):
                    info = json.loads(line[len("DRDONE "):])
                elif line.startswith(("[ExtractAudio]", "[Metadata]", "[EmbedThumbnail]", "[ThumbnailsConvertor]")):
                    job.progress = max(job.progress, 90.0)
                    job.status = "processing"
                elif line.startswith("ERROR:"):
                    errors.append(line)
            code = proc.wait()
        finally:
            self._proc = None
        if code != 0 or info is None:
            raise RuntimeError(errors[-1] if errors else f"yt-dlp terminó con código {code}")
        return info, self._final_path(info)

    def _final_path(self, info: dict) -> Path:
        for d in info.get("requested_downloads") or []:
            if d.get("filepath"):
                return Path(d["filepath"])
        if info.get("filepath"):
            return Path(info["filepath"])
        raise RuntimeError("yt-dlp no devolvió la ruta del archivo descargado")

    def _save(self, job: Job, info: dict, path: Path) -> int:
        raw_title = info.get("title") or path.stem
        artist, title = parse_title(raw_title, info.get("uploader") or info.get("channel"))
        artist = info.get("artist") or info.get("creator") or artist
        title = info.get("track") or title
        with self._sessions() as db:
            song = db.scalar(select(Song).where(Song.youtube_id == job.youtube_id))
            if song is None:
                song = Song(youtube_id=job.youtube_id, source="youtube")
                db.add(song)
            song.title = title
            song.artist = artist
            song.album = info.get("album") or song.album
            song.original_title = raw_title
            song.channel = info.get("channel") or info.get("uploader") or song.channel
            song.youtube_url = job.url
            song.thumbnail_url = info.get("thumbnail") or thumbnail_for(job.youtube_id)
            song.filename = path.name
            song.file_size = path.stat().st_size if path.exists() else None
            song.duration = info.get("duration") or audio_duration(path)
            song.status = "ok"
            db.commit()
            return song.id
