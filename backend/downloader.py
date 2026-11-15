"""Cola de descargas de YouTube con progreso real (yt-dlp en un hilo de fondo)."""
import queue
import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable

import yt_dlp
from sqlalchemy import select

from db import Song, utcnow
from library import audio_duration, canonical_url, parse_title, thumbnail_for


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
    created_at: str = field(default_factory=lambda: utcnow().isoformat())

    def to_dict(self) -> dict:
        return asdict(self)


def build_ydl_opts(music_dir: Path, ffmpeg_path: str | None) -> dict:
    opts = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": str(music_dir / "%(title)s [%(id)s].%(ext)s"),
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


class Downloader:
    """Procesa las descargas de una en una para no saturar YouTube."""

    def __init__(self, session_factory, music_dir: Path, ffmpeg_path: str | None = None,
                 ydl_factory: Callable[[dict], yt_dlp.YoutubeDL] = yt_dlp.YoutubeDL):
        self._sessions = session_factory
        self._music_dir = music_dir
        self._ffmpeg = ffmpeg_path
        self._ydl_factory = ydl_factory
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[str]" = queue.Queue()
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

    def wait_idle(self, timeout: float | None = None) -> None:
        """Solo para tests: espera a que la cola quede vacía."""
        self._queue.join()

    # ---------- trabajo en segundo plano ----------
    def _run(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                self._process(self._jobs[job_id])
            finally:
                self._queue.task_done()

    def _progress_hook(self, job: Job):
        def hook(d: dict) -> None:
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                if total:
                    job.progress = round(min(d.get("downloaded_bytes", 0) / total * 90, 90), 1)
                job.status = "downloading"
            elif d.get("status") == "finished":
                job.progress = 90.0
                job.status = "processing"
        return hook

    def _process(self, job: Job) -> None:
        job.status = "downloading"
        opts = build_ydl_opts(self._music_dir, self._ffmpeg)
        opts["progress_hooks"] = [self._progress_hook(job)]
        try:
            with self._ydl_factory(opts) as ydl:
                info = ydl.extract_info(job.url, download=True)
            final = self._final_path(info)
            job.title = info.get("title")
            job.song_id = self._save(job, info, final)
            job.progress = 100.0
            job.status = "done"
        except Exception as exc:  # noqa: BLE001 - se informa al usuario
            job.status = "error"
            job.error = str(exc).replace("\x1b[0;31m", "").replace("\x1b[0m", "")[:500]

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
            song.youtube_url = job.url
            song.thumbnail_url = info.get("thumbnail") or thumbnail_for(job.youtube_id)
            song.filename = path.name
            song.file_size = path.stat().st_size if path.exists() else None
            song.duration = info.get("duration") or audio_duration(path)
            song.status = "ok"
            db.commit()
            return song.id
