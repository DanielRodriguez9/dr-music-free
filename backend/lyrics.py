"""Letras de canciones desde LRCLIB (lrclib.net: gratis, sin clave).

Cada letra encontrada (o la marca de que no hay) se guarda en DATA_DIR/lyrics/<clave>.json
para usarla sin internet. La clave es la misma que la de las carátulas: el video de YouTube
si lo hay (así una canción en línea y su versión descargada comparten la letra) o song-<id>.

Búsqueda, de más exacta a más amplia:
1. /api/get con artista, título y duración (LRCLIB exige que la duración coincida ±2 s);
2. lo mismo con el título limpio ("(Official Video)", "ft. ...", "[Prod. ...]" fuera);
3. /api/search y se elige el resultado que coincide en artista, título y duración.
Una letra con la duración muy distinta casi siempre es de otra versión: no se usa.
"""
import json
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

API = "https://lrclib.net/api"
USER_AGENT = "DR Music Free/{version}"
NONE_TTL = 7 * 24 * 3600  # "sin letra": se vuelve a buscar pasada una semana
MAX_DURATION = 20 * 60  # mezclas y sesiones largas: no se buscan
DURATION_TOLERANCE = 4.0  # segundos

_NOISE = re.compile(
    r"official|oficial|video|v[ií]deo|audio|lyric|letra|visuali[sz]er|visual\b|\bhd\b|\bhq\b|\b4k\b|"
    r"remaster|prod\.?|produced|slowed|reverb|sped ?up|bass ?boost|explicit|clean|en vivo|live|"
    r"\bsub\b|subtitulad|espa[ñn]ol|ingl[ée]s|english|\bmv\b|\bm/v\b|color coded|extended|original mix|radio edit|"
    r"\bedit\b|\d{4}",
    re.I,
)
# "con" no: rompería títulos como "Bailando con la luna"
_FEAT = re.compile(r"\s*[\(\[]?\s*\b(?:ft|feat|featuring)\.?\s+[^\)\]\-|]*[\)\]]?", re.I)
_BRACKETS = re.compile(r"\s*[\(\[\{]([^\)\]\}]*)[\)\]\}]")
# ruido suelto al final: "Tema Official Video", "Tema HD", "Tema (Letra)"
_TRAILING = re.compile(
    r"(?:\s+(?:official|oficial|music|lyrics?|letra|video|v[ií]deo|audio|clip|visualizer|hd|hq|4k|mv))+\s*$", re.I)
_TIMESTAMP = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
_OFFSET = re.compile(r"^\[offset:\s*([+-]?\d+)\s*\]", re.I | re.M)


def lyrics_key(youtube_id: str | None, song_id: int | None) -> str:
    return youtube_id or f"song-{song_id}"


# ---------- limpiar títulos y artistas ----------
def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def clean_title(title: str) -> str:
    """'Tema (Official Video) [Prod. X] ft. Y #hashtag' -> 'Tema'."""
    t = title or ""
    t = re.sub(r"#\S+", " ", t)
    t = re.sub(r"[^\w\s\(\)\[\]\{\}'’&,.!?¿¡:/+-]", " ", t)  # emojis y adornos
    t = _BRACKETS.sub(lambda m: "" if _NOISE.search(m.group(1)) or _FEAT.match("(" + m.group(1)) else m.group(0), t)
    t = _FEAT.sub(" ", t)
    t = re.split(r"\s+\|\s+|\s+//\s+", t)[0]  # "Tema | Canal"
    # tramos finales tras " - " que son ruido ("- sub. español - (edit)"), de atrás hacia delante
    parts = re.split(r"\s+[-–—]\s+", t)
    while len(parts) > 1 and (not parts[-1].strip(" ()[]") or _NOISE.search(parts[-1])):
        parts.pop()
    t = " - ".join(parts)
    t = re.sub(r"\b(?:prod\.?|produced by)\s.*$", "", t, flags=re.I)
    t = _TRAILING.sub("", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—_.,")
    return t or (title or "").strip()


def bare_title(title: str) -> str:
    """Sin nada entre paréntesis ni corchetes: 'Tema (MTV Unplugged)' -> 'Tema'."""
    t = re.sub(r"\s+", " ", _BRACKETS.sub("", clean_title(title))).strip(" -–—_.,")
    return t or clean_title(title)


def main_artist(artist: str | None) -> str | None:
    """'A, B' / 'A & B' / 'A x B' / 'A ft. B' -> 'A'."""
    if not artist:
        return None
    first = re.split(r"\s*(?:,|&|\+|/|;|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing|\by\b|\band\b|\bvs\.?)\s*", artist, flags=re.I)[0]
    return first.strip(" @-") or artist.strip()


# ---------- formato LRC ----------
def parse_lrc(text: str) -> list[dict]:
    """'[01:02.50] hola' -> [{"t": 62.5, "text": "hola"}], ordenado (admite varias marcas por línea)."""
    offset = 0.0
    m = _OFFSET.search(text or "")
    if m:
        offset = int(m.group(1)) / 1000  # positivo: la letra va antes
    lines = []
    for raw in (text or "").splitlines():
        stamps = list(_TIMESTAMP.finditer(raw))
        if not stamps:
            continue
        words = _TIMESTAMP.sub("", raw).strip()
        for s in stamps:
            secs = int(s.group(1)) * 60 + float(s.group(2).replace(":", "."))
            lines.append({"t": round(max(0.0, secs - offset), 2), "text": words})
    lines.sort(key=lambda x: x["t"])
    return lines


# ---------- almacén ----------
class LyricsStore:
    def __init__(self, folder: Path, version: str = "",
                 fetch: Callable[[str], object] | None = None,
                 online: Callable[[], bool] | None = None):
        self.folder = folder
        self.user_agent = USER_AGENT.format(version=version).strip("/")
        self._fetch = fetch or self._get_json
        self._online = online or self._online_hint
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        folder.mkdir(parents=True, exist_ok=True)

    def path(self, key: str) -> Path:
        return self.folder / f"{key}.json"

    def cached(self, key: str) -> dict | None:
        try:
            data = json.loads(self.path(key).read_text("utf-8"))
        except (OSError, ValueError):
            return None
        if data.get("status") == "none" and time.time() - data.get("fetched_at", 0) > NONE_TTL:
            return None  # se vuelve a intentar: a lo mejor alguien la subió
        return data

    def _save(self, key: str, data: dict) -> None:
        tmp = self.path(key).with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
        tmp.replace(self.path(key))

    # ---------- red ----------
    @staticmethod
    def _online_hint() -> bool:
        from youtube import is_online
        return is_online(timeout=2)

    def _get_json(self, url: str):
        """JSON de LRCLIB; None si no existe (404). Lanza OSError si no hay conexión."""
        from youtube import open_url  # IPv4 primero (evita esperas largas)
        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        try:
            with open_url(req, timeout=12) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            raise OSError(f"LRCLIB respondió {exc.code}") from exc

    # ---------- búsqueda ----------
    def get(self, key: str, title: str, artist: str | None, duration: float | None,
            fetch: bool = True) -> dict:
        """Letra de una canción. status: synced | plain | instrumental | none | offline | unavailable | disabled."""
        data = self.cached(key)
        if data:
            return data
        if not fetch:
            return {"status": "disabled"}
        with self._lock:
            lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            data = self.cached(key)
            if data:
                return data
            try:
                found = self._lookup(title, artist, duration)
            except OSError:
                # no se guarda: se reintentará. Si hay internet, el que falla es LRCLIB (lento o caído)
                return {"status": "unavailable" if self._online() else "offline"}
            data = self._result(found)
            data.update(fetched_at=time.time(), query={"title": title, "artist": artist, "duration": duration})
            self._save(key, data)
            return data

    @staticmethod
    def _result(found: dict | None) -> dict:
        if not found:
            return {"status": "none"}
        base = {"source": "lrclib", "lrclib_id": found.get("id"),
                "track": {"title": found.get("trackName"), "artist": found.get("artistName")}}
        if found.get("instrumental"):
            return {**base, "status": "instrumental"}
        synced = parse_lrc(found.get("syncedLyrics") or "")
        plain = (found.get("plainLyrics") or "").strip()
        if synced and any(line["text"] for line in synced):
            return {**base, "status": "synced", "lines": synced,
                    "plain": plain or "\n".join(x["text"] for x in synced)}
        if plain:
            return {**base, "status": "plain", "plain": plain}
        return {"status": "none"}

    def _lookup(self, title: str, artist: str | None, duration: float | None) -> dict | None:
        if duration and duration > MAX_DURATION:
            return None
        title = (title or "").strip()
        if not title:
            return None
        clean, bare = clean_title(title), bare_title(title)
        main = main_artist(artist)
        artists = [a for a in dict.fromkeys([artist and artist.strip(), main]) if a]

        # 1-2. coincidencia exacta (con duración): como mucho dos consultas
        if duration and artists:
            for a, t in dict.fromkeys([(artists[0], title), (main, bare)]):
                q = {"artist_name": a, "track_name": t, "duration": round(duration)}
                hit = self._fetch(f"{API}/get?{urllib.parse.urlencode(q)}")
                if isinstance(hit, dict) and self._usable(hit):
                    return hit

        # 3. búsqueda amplia: se elige la mejor que coincida en título, artista y duración
        if artists:
            q = {"track_name": bare, "artist_name": main}
        elif duration:
            q = {"q": bare}  # sin artista solo se acepta con título y duración casi iguales
        else:
            return None
        results = self._fetch(f"{API}/search?{urllib.parse.urlencode(q)}")
        return self._pick(results if isinstance(results, list) else [], [clean, bare], artists, duration)

    @staticmethod
    def _usable(hit: dict) -> bool:
        return bool(hit.get("instrumental") or hit.get("syncedLyrics") or hit.get("plainLyrics"))

    @staticmethod
    def _pick(results: list[dict], titles: list[str], artists: list[str], duration: float | None) -> dict | None:
        want_ts = {_norm(t) for t in titles} - {""}
        want_a = {_norm(a) for a in artists} - {""}

        def contains(a: str, b: str) -> bool:  # palabra completa y de al menos 4 letras
            return len(b) >= 4 and f" {b} " in f" {a} "

        best, best_score = None, -1.0
        for r in results:
            if not LyricsStore._usable(r):
                continue
            got_t = _norm(r.get("trackName") or "")
            got_a = _norm(r.get("artistName") or "")
            exact = got_t in want_ts
            # sin artista solo vale el título exacto; con artista, también uno que contenga al otro
            if not got_t or not (exact or (want_a and any(contains(got_t, w) or contains(w, got_t) for w in want_ts))):
                continue
            if want_a and not any(a == got_a or contains(got_a, a) or contains(a, got_a) for a in want_a):
                continue
            diff = abs((r.get("duration") or 0) - duration) if duration else 0
            if duration and diff > DURATION_TOLERANCE:
                continue
            # con artista y duración ya comprobados, una letra sincronizada vale más que el título exacto
            score = (3 if r.get("syncedLyrics") else 1) + (1 if exact else 0) - diff / 10
            if score > best_score:
                best, best_score = r, score
        return best
