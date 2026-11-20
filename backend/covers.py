"""Carátulas guardadas en disco, para que se vean sin internet.

Para cada canción se guarda DATA_DIR/covers/<clave>.jpg (cuadrada, 400 px):
1. la carátula incrustada en el archivo de audio (no necesita internet);
2. si no hay, la miniatura de YouTube (la mejor que exista, sin la imagen gris de relleno).
Si no hay ninguna, se deja una marca <clave>.none para no reintentar durante un día.
Un hilo de fondo completa las que faltan, de una en una, para no cargar el equipo.
"""
import io
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

from sqlalchemy import select

from db import Folder, Song
from library import song_file

SIZE = 400
NONE_TTL = 24 * 3600
YT_SIZES = ("maxresdefault", "hq720", "sddefault", "hqdefault", "mqdefault")


def cover_key(song: Song) -> str:
    return song.youtube_id or f"song-{song.id}"


def embedded_art(path: Path) -> bytes | None:
    """Imagen incrustada en un MP3/M4A/FLAC/OGG (la que guarda yt-dlp con --embed-thumbnail)."""
    try:
        import mutagen
        f = mutagen.File(path)
    except Exception:
        return None
    if f is None or f.tags is None:
        return None
    tags = f.tags
    try:
        for key in list(tags.keys()):  # ID3 (MP3): APIC
            if key.startswith("APIC"):
                return tags[key].data
        if "covr" in tags and tags["covr"]:  # MP4/M4A
            return bytes(tags["covr"][0])
    except Exception:
        pass
    pictures = getattr(f, "pictures", None)  # FLAC
    if pictures:
        return pictures[0].data
    return None


def to_square_jpeg(data: bytes, size: int = SIZE) -> bytes | None:
    """Recorta al centro en cuadrado y reduce a `size` px. None si no es una imagen válida
    o es la miniatura gris de relleno de YouTube (120x90)."""
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None
    if img.size == (120, 90):
        return None
    img = img.convert("RGB")
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
    if side > size:
        img = img.resize((size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue()


class CoverStore:
    def __init__(self, folder: Path, sessions, music_dir: Path,
                 fetch: Callable[[str], bytes | None] | None = None):
        self.folder = folder
        self.sessions = sessions
        self.music_dir = music_dir
        self._fetch = fetch or self._download
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        self._remote = threading.Semaphore(4)  # descargas simultáneas como máximo
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.progress = {"running": False, "done": 0, "total": 0}
        self._fingerprints: dict[str, tuple[int, int]] = {}  # archivo -> (fecha, huella)
        folder.mkdir(parents=True, exist_ok=True)

    # ---------- archivos ----------
    def path(self, key: str) -> Path:
        return self.folder / f"{key}.jpg"

    def _none_marker(self, key: str) -> Path:
        return self.folder / f"{key}.none"

    def cached(self, song: Song) -> Path | None:
        p = self.path(cover_key(song))
        return p if p.is_file() else None

    def _recently_failed(self, key: str) -> bool:
        m = self._none_marker(key)
        return m.is_file() and time.time() - m.stat().st_mtime < NONE_TTL

    # ---------- obtener ----------
    def _download(self, url: str) -> bytes | None:
        from youtube import open_url  # conexión IPv4 primero (evita esperas de 21 s)
        try:
            with self._remote:
                r = open_url(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=15)
                return r.read()
        except (urllib.error.URLError, OSError):
            return None

    def get(self, song: Song, folders: dict[int, Path] | None = None, remote: bool = True) -> Path | None:
        """Ruta de la carátula en disco; si falta, la crea (archivo -> YouTube)."""
        key = cover_key(song)
        p = self.path(key)
        if p.is_file():
            return p
        if self._recently_failed(key):
            return None
        with self._lock:
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            if p.is_file():
                return p
            if folders is None:
                with self.sessions() as db:
                    folders = {f.id: Path(f.path) for f in db.scalars(select(Folder))}
            data = None
            audio = song_file(song, self.music_dir, folders)
            if audio:
                raw = embedded_art(audio)
                data = to_square_jpeg(raw) if raw else None
            if data is None and song.youtube_id and remote:
                for size in YT_SIZES:
                    raw = self._fetch(f"https://i.ytimg.com/vi/{song.youtube_id}/{size}.jpg")
                    data = to_square_jpeg(raw) if raw else None
                    if data:
                        break
                    if raw is None and size == YT_SIZES[0] and not self._online_hint():
                        return None  # sin internet: se reintentará más tarde
            if data is None:
                if remote or not song.youtube_id:
                    self._none_marker(key).touch()
                return None
            tmp = p.with_suffix(".tmp")
            tmp.write_bytes(data)
            tmp.replace(p)
            self._none_marker(key).unlink(missing_ok=True)
            return p

    def _online_hint(self) -> bool:
        from youtube import is_online
        return is_online(timeout=2)

    # ---------- huella visual (para no repetir portadas en los mixes) ----------
    def fingerprint(self, song: Song) -> int | None:
        """dHash de 64 bits de la carátula guardada; None si no hay. Se recuerda por archivo y fecha."""
        p = self.path(cover_key(song))
        try:
            mtime = p.stat().st_mtime_ns
        except OSError:
            return None
        hit = self._fingerprints.get(p.name)
        if hit and hit[0] == mtime:
            return hit[1]
        from PIL import Image
        try:
            with Image.open(p) as img:
                px = list(img.convert("L").resize((9, 8), Image.BILINEAR).getdata())
        except Exception:
            return None
        bits = 0
        for row in range(8):
            for col in range(8):
                bits = (bits << 1) | (px[row * 9 + col] > px[row * 9 + col + 1])
        self._fingerprints[p.name] = (mtime, bits)
        return bits

    # ---------- estado y relleno en segundo plano ----------
    def stats(self) -> dict:
        with self.sessions() as db:
            songs = list(db.scalars(select(Song)))
        keys = {cover_key(s) for s in songs}
        files = {p.stem: p.stat().st_size for p in self.folder.glob("*.jpg")}
        have = keys & files.keys()
        none = {k for k in keys - have if self._none_marker(k).is_file()}
        # el avance del relleno va con nombres propios: su "total" (las que faltaban al empezar)
        # no debe pisar el total de canciones (salía "1 de 0 guardadas")
        return {
            "total": len(keys), "saved": len(have), "without_art": len(none),
            "missing": len(keys) - len(have) - len(none),
            "size_mb": round(sum(files[k] for k in have) / (1024 * 1024), 1),
            "running": self.progress["running"],
            "fill_done": self.progress["done"], "fill_total": self.progress["total"],
        }

    def fill_missing(self, delay: float = 0.15) -> None:
        """Guarda las carátulas que faltan, en un hilo de fondo (si no está ya en marcha)."""
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._fill, args=(delay,), daemon=True, name="covers")
        self._thread.start()

    def _fill(self, delay: float) -> None:
        with self.sessions() as db:
            songs = list(db.scalars(select(Song).order_by(Song.id.desc())))
            folders = {f.id: Path(f.path) for f in db.scalars(select(Folder))}
        todo = [s for s in songs if not self.path(cover_key(s)).is_file() and not self._recently_failed(cover_key(s))]
        self.progress = {"running": True, "done": 0, "total": len(todo)}
        try:
            for song in todo:
                if self._stop.is_set():
                    break
                self.get(song, folders)
                self.progress["done"] += 1
                time.sleep(delay)
        finally:
            self.progress["running"] = False

    def stop(self) -> None:
        self._stop.set()
