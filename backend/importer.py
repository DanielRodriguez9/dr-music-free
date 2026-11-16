"""Importar carpetas de música locales.

Los archivos se quedan donde están: solo se leen sus etiquetas (título, artista, álbum,
género, número de pista y duración). Si no tienen etiquetas, se deduce "Artista - Canción"
del nombre del archivo. Quitar una carpeta solo la saca de la biblioteca: nunca borra archivos.
"""
import os
import threading
from pathlib import Path

from sqlalchemy import func, select

from db import Folder, Genre, Song, utcnow
from library import AUDIO_EXTS, parse_title, read_tags


def scan_files(root: Path):
    """Archivos de audio de la carpeta y sus subcarpetas (ignora ocultas y descargas a medias)."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith((".", "$")))
        for name in sorted(filenames):
            if Path(name).suffix.lower() in AUDIO_EXTS and not name.startswith("."):
                yield Path(dirpath) / name


class Importer:
    def __init__(self, sessions):
        self.sessions = sessions
        self.progress: dict[int, dict] = {}  # folder_id -> {running, done, total, added}
        self._lock = threading.Lock()
        self._scan_locks: dict[int, threading.Lock] = {}

    def add_folder(self, path: str, music_dir: Path) -> Folder:
        root = Path(path).expanduser()
        if not root.is_dir():
            raise ValueError("La carpeta no existe")
        root = root.resolve()
        md = music_dir.resolve()
        if root == md or md in root.parents:
            raise ValueError("Esa carpeta ya es (o está dentro de) tu carpeta de música")
        with self.sessions() as db:
            for f in db.scalars(select(Folder)):
                other = Path(f.path)
                if other == root:
                    raise ValueError("Esa carpeta ya está importada")
                if other in root.parents:
                    raise ValueError(f"Ya está importada dentro de {other}")
            folder = Folder(path=str(root))
            db.add(folder)
            db.commit()
            return folder

    def scan_async(self, folder_id: int) -> None:
        with self._lock:
            if self.progress.get(folder_id, {}).get("running"):
                return
            self.progress[folder_id] = {"running": True, "done": 0, "total": 0, "added": 0, "removed": 0}
        threading.Thread(target=self.scan, args=(folder_id,), daemon=True, name=f"import-{folder_id}").start()

    def scan(self, folder_id: int) -> dict:
        """Añade los archivos nuevos y marca como "missing" los que ya no están."""
        with self._lock:
            scan_lock = self._scan_locks.setdefault(folder_id, threading.Lock())
        with scan_lock:  # dos escaneos a la vez de la misma carpeta duplicarían canciones
            return self._scan(folder_id)

    def _scan(self, folder_id: int) -> dict:
        prog = self.progress.setdefault(folder_id, {"running": True, "done": 0, "total": 0, "added": 0, "removed": 0})
        prog["running"] = True
        try:
            with self.sessions() as db:
                folder = db.get(Folder, folder_id)
                if folder is None:
                    return prog
                root = Path(folder.path)
                files = list(scan_files(root)) if root.is_dir() else []
                prog["total"] = len(files)
                existing = {s.filename: s for s in db.scalars(select(Song).where(Song.folder_id == folder_id))}
                genres = {g.name.lower(): g.name for g in db.scalars(select(Genre))}
                seen = set()
                for i, path in enumerate(files, 1):
                    rel = path.relative_to(root).as_posix()
                    seen.add(rel)
                    song = existing.get(rel)
                    if song is None:
                        db.add(self._song_from_file(path, rel, folder_id, genres))
                        prog["added"] += 1
                    elif song.status != "ok":
                        song.status = "ok"
                    prog["done"] = i
                    if i % 200 == 0:
                        db.commit()
                for rel, song in existing.items():
                    if rel not in seen and song.status != "missing":
                        song.status = "missing"
                        prog["removed"] += 1
                folder.scanned_at = utcnow()
                db.commit()
        finally:
            prog["running"] = False
        return prog

    @staticmethod
    def _song_from_file(path: Path, rel: str, folder_id: int, genres: dict[str, str]) -> Song:
        tags = read_tags(path)
        artist, title = tags.get("artist"), tags.get("title")
        if not title:
            guess_artist, title = parse_title(path.stem)
            artist = artist or guess_artist
        genre = genres.get((tags.get("genre") or "").lower())
        return Song(
            title=title or path.stem, artist=artist, album=tags.get("album"), original_title=path.stem,
            duration=tags.get("duration"), filename=rel, file_size=path.stat().st_size,
            source="local", status="ok", folder_id=folder_id, track_no=tags.get("track_no"), genre=genre,
        )

    def remove_folder(self, folder_id: int) -> int:
        """Saca de la biblioteca las canciones de la carpeta (no borra archivos)."""
        with self.sessions() as db:
            folder = db.get(Folder, folder_id)
            if folder is None:
                return 0
            songs = list(db.scalars(select(Song).where(Song.folder_id == folder_id)))
            for s in songs:
                db.delete(s)
            db.delete(folder)
            db.commit()
            self.progress.pop(folder_id, None)
            return len(songs)

    def folders(self) -> list[dict]:
        with self.sessions() as db:
            counts = dict(db.execute(select(Song.folder_id, func.count(Song.id)).where(Song.folder_id.is_not(None))
                                     .group_by(Song.folder_id)).all())
            return [{
                "id": f.id, "path": f.path, "exists": Path(f.path).is_dir(), "songs": counts.get(f.id, 0),
                "added_at": f.added_at.isoformat(), "scanned_at": f.scanned_at.isoformat() if f.scanned_at else None,
                "progress": self.progress.get(f.id),
            } for f in db.scalars(select(Folder).order_by(Folder.id))]
