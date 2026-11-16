"""Utilidades de biblioteca: enlaces de YouTube, metadatos y escaneo de archivos."""
import re
import unicodedata
from pathlib import Path

AUDIO_EXTS = {".mp3", ".m4a", ".webm", ".opus", ".ogg", ".flac", ".wav", ".aac"}

_YT_ID = re.compile(r"(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/)([0-9A-Za-z_-]{11})")
_YT_HOST = re.compile(r"^(?:https?://)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)/", re.I)

# Paréntesis/corchetes con "ruido" típico de YouTube que no forma parte del título
_NOISE_WORDS = (
    r"official|oficial|video|v[íi]deo|audio|lyrics?|letra|visuali[sz]er|mv|hd|hq|4k|"
    r"clip|videoclip|en vivo|live session|music video|full album"
)
_NOISE = re.compile(r"\s*[\(\[][^\)\]]*\b(?:" + _NOISE_WORDS + r")\b[^\)\]]*[\)\]]", re.I)
_TRACK_NO = re.compile(r"^\s*\d{1,2}\s*[.)\-]\s+")
_SEPARATORS = (" - ", " – ", " — ")


def youtube_id(url: str | None) -> str | None:
    if not url:
        return None
    m = _YT_ID.search(url)
    return m.group(1) if m else None


def is_youtube_url(url: str) -> bool:
    return bool(_YT_HOST.match(url.strip())) and youtube_id(url) is not None


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def thumbnail_for(video_id: str | None) -> str | None:
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None


def normalize(text: str | None) -> str:
    """Minúsculas, sin tildes ni signos: para comparar nombres."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^0-9a-z]+", " ", text).strip()


_CHANNEL_SUFFIX = re.compile(r"\s*(?:-\s*topic|vevo|tv|official|oficial|music|musica|música|channel|records?)\s*$", re.I)


def clean_channel(channel: str | None) -> tuple[str | None, bool]:
    """("De La Ghetto - Topic") -> ("De La Ghetto", True). El bool indica canal automático
    de artista ("- Topic") o VEVO, que son del propio artista."""
    if not channel:
        return None, False
    name = channel.strip()
    auto = bool(re.search(r"(-\s*topic|vevo)\s*$", name, re.I))
    for _ in range(2):
        name = _CHANNEL_SUFFIX.sub("", name).strip(" -")
    return (name or None), auto


_ARTIST_SPLIT = re.compile(r"\s*(?:,|;|\s/\s|\s+(?:feat\.?|ft\.?|featuring|x|vs\.?)\s+)\s*", re.I)


def split_artists(artist: str | None) -> list[str]:
    """"Feid, El Americano 4KT" -> ["Feid", "El Americano 4KT"]; "2Pac ft. Bob Marley" -> ["2Pac", "Bob Marley"].
    No separa "&" ni "y" (romperían nombres como "Simon & Garfunkel")."""
    if not artist:
        return []
    parts = [p.strip(" -") for p in _ARTIST_SPLIT.split(artist)]
    return [p for p in parts if p]


def parse_title(raw: str, uploader: str | None = None) -> tuple[str | None, str]:
    """Devuelve (artista, título) a partir de un título de YouTube.

    "Arctic Monkeys - Do I Wanna Know? (Official Video)" -> ("Arctic Monkeys", "Do I Wanna Know?")
    Si el canal coincide con la parte derecha ("La Rebelión - Joe Arroyo" en el canal de
    Joe Arroyo), se entiende que el orden está invertido.
    """
    text = raw.strip()
    # Lo que va después de " | " suele ser el nombre del álbum o canal
    text = re.split(r"\s+[|｜]\s+", text)[0]
    text = _NOISE.sub("", text).strip()
    text = _TRACK_NO.sub("", text)

    artist = None
    for sep in _SEPARATORS:
        if sep in text:
            left, right = text.split(sep, 1)
            if left.strip() and right.strip():
                artist, text = left.strip(), right.strip()
                channel, _ = clean_channel(uploader)
                if channel and normalize(channel) == normalize(text) and normalize(channel) != normalize(artist):
                    artist, text = text, artist  # "Canción - Artista"
            break

    if artist is None and uploader:
        artist = clean_channel(uploader)[0] or uploader.strip() or None

    title = text.strip(" -–—") or raw.strip()
    return artist, title


def audio_duration(path: Path) -> float | None:
    try:
        import mutagen
        f = mutagen.File(path)
        return round(float(f.info.length), 2) if f and f.info else None
    except Exception:
        return None


def read_tags(path: Path) -> dict:
    """Etiquetas de un archivo de audio (título, artista, álbum, género, pista, duración)."""
    out: dict = {}
    try:
        import mutagen
        f = mutagen.File(path, easy=True)
    except Exception:
        return out
    if not f:
        return out

    def first(*keys):
        for k in keys:
            v = f.get(k) if hasattr(f, "get") else None
            if v:
                return str(v[0]).strip() or None
        return None

    out["title"] = first("title")
    out["artist"] = first("artist", "albumartist", "performer")
    out["album"] = first("album")
    out["genre"] = first("genre")
    track = first("tracknumber")
    if track:
        m = re.match(r"\d+", track)
        out["track_no"] = int(m.group()) if m else None
    if f.info and getattr(f.info, "length", None):
        out["duration"] = round(float(f.info.length), 2)
    return {k: v for k, v in out.items() if v}


def list_audio_files(music_dir: Path) -> list[Path]:
    """Archivos de audio completos (ignora descargas a medias .part/.ytdl)."""
    if not music_dir.exists():
        return []
    return sorted(
        p for p in music_dir.iterdir()
        if p.is_file() and p.suffix.lower() in AUDIO_EXTS
    )


def safe_file(music_dir: Path, filename: str | None) -> Path | None:
    """Ruta absoluta del archivo solo si está dentro de la carpeta de música y existe."""
    if not filename:
        return None
    path = (music_dir / filename).resolve()
    try:
        path.relative_to(music_dir.resolve())
    except ValueError:
        return None
    return path if path.is_file() else None


def song_file(song, music_dir: Path, folders: dict[int, Path]) -> Path | None:
    """Archivo de una canción: en su carpeta importada o en la carpeta de música."""
    base = folders.get(song.folder_id) if song.folder_id else music_dir
    return safe_file(base, song.filename) if base else None


def sync_file_status(session_factory, music_dir: Path) -> dict:
    """Marca cada canción como "ok" o "missing" según exista su archivo en la carpeta de música.

    Se ejecuta al arrancar: si se cambia la carpeta, las canciones cuyo archivo no esté
    aparecen como "Falta archivo" (y vuelven a "ok" si el archivo aparece). No toca archivos.
    """
    from sqlalchemy import select

    from db import Folder, Song

    changed = {"ok": 0, "missing": 0}
    with session_factory() as db:
        folders = {f.id: Path(f.path) for f in db.scalars(select(Folder))}
        for song in db.scalars(select(Song)):
            exists = song_file(song, music_dir, folders) is not None
            status = "ok" if exists else "missing"
            if song.status != status:
                song.status = status
                changed[status] += 1
        db.commit()
    return changed
