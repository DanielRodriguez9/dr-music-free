"""Propuestas para corregir artistas (se aplican solo después de que el usuario las revise).

Tipos:
- missing:  canciones sin artista. Fuentes, de más a menos fiable:
            etiquetas del archivo, título "Artista - Canción", canal automático
            "Artista - Topic"/VEVO, canal que coincide con un artista de la biblioteca,
            y por último el nombre del canal (confianza media: puede ser un sello o recopilador).
- swapped:  artista y título invertidos ("La Rebelión" como artista y "Joe Arroyo" como título).
- spelling: el mismo artista escrito de varias formas ("CRACK FAMILY" / "Crack Family").

El canal de cada video se consulta con oEmbed de YouTube (sin API key) y se guarda en la
canción para no volver a pedirlo.
"""
import json
import threading
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import select

from db import Folder, Song
from library import clean_channel, normalize, parse_title, read_tags, song_file, split_artists


def oembed_channel(video_id: str, opener=None) -> str | None:
    from youtube import open_url
    url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode(
        {"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"})
    try:
        r = (opener or open_url)(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=10)
        return (json.loads(r.read()).get("author_name") or "").strip() or None
    except Exception:  # noqa: BLE001 - video privado/borrado o sin conexión
        return None


def best_spelling(counter: Counter) -> str:
    """Entre varias escrituras del mismo nombre: con tildes antes que sin ellas, y no todo en
    mayúsculas; si empatan, la más usada."""
    def score(name):
        accents = any(not ch.isascii() and ch.isalpha() for ch in name)
        shouting = name.isupper() and len(name) > 3
        return (accents, not shouting, counter[name])
    return max(counter, key=score)


class FixFinder:
    def __init__(self, sessions, music_dir: Path, channel_lookup=None):
        self.sessions = sessions
        self.music_dir = music_dir
        self.lookup = channel_lookup or oembed_channel
        self.state = {"status": "idle", "done": 0, "total": 0, "proposals": [], "error": None}
        self._thread = None

    # ---------- análisis en segundo plano ----------
    def start(self) -> dict:
        if self._thread and self._thread.is_alive():
            return self.state
        self.state = {"status": "running", "done": 0, "total": 0, "proposals": [], "error": None}
        self._thread = threading.Thread(target=self._run, daemon=True, name="fixes")
        self._thread.start()
        return self.state

    def _run(self) -> None:
        try:
            self._fetch_channels()
            self.state["proposals"] = self.proposals()
            self.state["status"] = "done"
        except Exception as exc:  # noqa: BLE001 - se muestra en la pantalla de revisión
            self.state["status"] = "error"
            self.state["error"] = str(exc)

    def _fetch_channels(self) -> None:
        """Pide el canal de los videos que aún no lo tienen (4 a la vez)."""
        with self.sessions() as db:
            todo = [(s.id, s.youtube_id) for s in db.scalars(select(Song).where(
                Song.youtube_id.is_not(None), Song.channel.is_(None)))]
        self.state["total"] = len(todo)
        found: dict[int, str] = {}

        def one(item):
            sid, vid = item
            ch = self.lookup(vid)
            self.state["done"] += 1
            return sid, ch

        with ThreadPoolExecutor(max_workers=4) as pool:
            for sid, ch in pool.map(one, todo):
                if ch:
                    found[sid] = ch
        if found:
            with self.sessions() as db:
                for s in db.scalars(select(Song).where(Song.id.in_(found))):
                    s.channel = found[s.id]
                db.commit()

    # ---------- reglas ----------
    def proposals(self) -> list[dict]:
        with self.sessions() as db:
            songs = list(db.scalars(select(Song)))
            folders = {f.id: Path(f.path) for f in db.scalars(select(Folder))}

        # artistas conocidos: forma más usada de cada nombre y cuántas canciones tiene
        spellings: dict[str, Counter] = defaultdict(Counter)
        for s in songs:
            for a in split_artists(s.artist):
                spellings[normalize(a)][a] += 1
        known = {k: best_spelling(c) for k, c in spellings.items() if k}
        count = {k: sum(c.values()) for k, c in spellings.items()}

        def canonical(name: str) -> str:
            return known.get(normalize(name), name)

        out = []
        for s in songs:
            p = self._missing(s, known, canonical, folders) if not (s.artist or "").strip() else self._swapped(s, count, canonical)
            if p:
                out.append(p)

        # la misma persona escrita de varias formas
        for key, c in spellings.items():
            if len(c) < 2:
                continue
            best = best_spelling(c)
            for s in songs:
                if not s.artist:
                    continue
                parts = split_artists(s.artist)
                if any(normalize(a) == key and a != best for a in parts) and len(parts) == 1:
                    uses = c[best]
                    out.append(self._item(s, "spelling", best, s.title, "high",
                                          f"Misma persona: «{best}» ({uses} {'canción' if uses == 1 else 'canciones'})"))
        return sorted(out, key=lambda p: ({"swapped": 0, "missing": 1, "spelling": 2}[p["kind"]], p["confidence"] != "high",
                                          (p["proposed"]["artist"] or "").lower()))

    def _item(self, s: Song, kind: str, artist: str | None, title: str, confidence: str, reason: str) -> dict:
        return {
            "song_id": s.id, "kind": kind, "confidence": confidence, "reason": reason,
            "current": {"artist": s.artist, "title": s.title},
            "proposed": {"artist": artist, "title": title},
            "channel": s.channel, "original_title": s.original_title,
        }

    def _missing(self, s: Song, known, canonical, folders) -> dict | None:
        audio = song_file(s, self.music_dir, folders) if s.filename else None
        tags = read_tags(audio) if audio else {}
        if tags.get("artist"):
            return self._item(s, "missing", tags["artist"], tags.get("title") or s.title, "high", "Etiquetas del archivo")
        raw = s.original_title or s.title
        artist, title = parse_title(raw)
        if artist:
            return self._item(s, "missing", canonical(artist), title, "high", "Título del video «Artista - Canción»")
        name, auto = clean_channel(s.channel)
        if name and auto:
            return self._item(s, "missing", canonical(name), s.title, "high", f"Canal oficial del artista: {s.channel}")
        if name and normalize(name) in known:
            return self._item(s, "missing", known[normalize(name)], s.title, "high",
                              f"El canal «{s.channel}» es un artista de tu biblioteca")
        if name:
            return self._item(s, "missing", name, s.title, "medium",
                              f"Nombre del canal «{s.channel}» (puede ser un sello o una recopilación)")
        return None

    def _swapped(self, s: Song, count, canonical) -> dict | None:
        artist, title = (s.artist or "").strip(), (s.title or "").strip()
        if not artist or not title or normalize(artist) == normalize(title):
            return None
        name, _ = clean_channel(s.channel)
        if name and normalize(name) == normalize(title) and normalize(name) != normalize(artist):
            return self._item(s, "swapped", canonical(title), artist, "high",
                              f"El canal «{s.channel}» coincide con el título")
        # el título es un artista que ya tienes y el "artista" no aparece en ninguna otra canción
        t, a = normalize(title), normalize(artist)
        if count.get(t, 0) >= 2 and count.get(a, 0) <= 1 and not split_artists(artist)[1:]:
            return self._item(s, "swapped", canonical(title), artist, "medium",
                              f"«{canonical(title)}» es artista de otras {count[t]} canciones")
        return None
