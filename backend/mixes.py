"""Mixes automáticos para Inicio, calculados en el equipo a partir del historial.

- Tus favoritas de siempre (más escuchadas)
- Lo más escuchado del mes (escuchas que contaron en los últimos 30 días)
- Mix de <artista> (los artistas que más escuchas, con canciones de su género)
- Mix <género>
- Hace rato no escuchas (te gustaban y no suenan desde hace un mes)
- Recién agregadas
- Mix diario (cambia cada día: favoritas, olvidadas y descubrimientos)
"""
import random
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from db import Play, Song
from library import normalize, split_artists

MAX = 50
MIN = 5


def _ids(songs) -> list[int]:
    return [s.id for s in songs]


def _mix(mix_id, title, subtitle, songs, kind, **extra) -> dict:
    ids = _ids(songs)[:MAX]
    return {"id": mix_id, "kind": kind, "title": title, "subtitle": subtitle, "song_ids": ids,
            "count": len(ids), **extra}


def build_mixes(db, today: date | None = None) -> list[dict]:
    now = datetime.now(timezone.utc)
    today = today or date.today()  # fecha local del equipo (la interfaz manda la suya)
    songs = list(db.scalars(select(Song).where(Song.status == "ok")))
    if not songs:
        return []
    by_id = {s.id: s for s in songs}
    month_ago = now - timedelta(days=30)

    # escuchas que contaron en los últimos 30 días, por canción
    month = Counter(dict(db.execute(
        select(Play.song_id, func.count(Play.id))
        .where(Play.counted.is_(True), Play.song_id.is_not(None), Play.started_at >= month_ago)
        .group_by(Play.song_id)).all()))
    month = Counter({k: v for k, v in month.items() if k in by_id})

    def recent(s):
        return s.last_played_at or datetime.min.replace(tzinfo=timezone.utc)

    mixes = []

    # ---------- más escuchadas ----------
    top = sorted((s for s in songs if s.play_count > 0), key=lambda s: (-s.play_count, -recent(s).timestamp()))
    if len(top) >= MIN:
        mixes.append(_mix("top", "Tus favoritas de siempre", "Las que más has escuchado", top, "top"))

    top_month = [by_id[i] for i, _ in month.most_common()]
    if len(top_month) >= MIN:
        mixes.append(_mix("month", "Lo más escuchado del mes", "Tus últimos 30 días", top_month, "month"))

    # ---------- por artista ----------
    artist_songs: dict[str, list[Song]] = defaultdict(list)
    artist_name: dict[str, Counter] = defaultdict(Counter)
    for s in songs:
        for a in split_artists(s.artist):
            key = normalize(a)
            if key:
                artist_songs[key].append(s)
                artist_name[key][a] += 1
    score = Counter()
    for key, lst in artist_songs.items():
        if len(lst) < 4:
            continue
        score[key] = sum(month.get(s.id, 0) * 3 + s.play_count for s in lst) + (1 if any(s.liked for s in lst) else 0)
    # primero los artistas que más escuchas; con poco historial, los que más canciones tienen
    candidates = [k for k, v in score.most_common() if v > 0]
    candidates += sorted((k for k in score if k not in candidates), key=lambda k: -len(artist_songs[k]))
    rng = random.Random(f"{today.isoformat()}-artists")
    made = 0
    for key in candidates:
        if made >= 4:
            break
        own = list(artist_songs[key])
        rng.shuffle(own)
        genres = {s.genre for s in own if s.genre}
        others = [s for s in songs if s.genre in genres and s not in own] if genres else []
        rng.shuffle(others)
        mix = own[:35] + others[: max(0, min(15, len(own) // 2))]
        if len(mix) < 6:
            continue
        rng.shuffle(mix)
        name = artist_name[key].most_common(1)[0][0]
        mixes.append(_mix(f"artist:{key}", f"Mix de {name}", f"{name} y canciones parecidas", mix, "artist", artist=name))
        made += 1

    # ---------- por género ----------
    by_genre: dict[str, list[Song]] = defaultdict(list)
    for s in songs:
        if s.genre:
            by_genre[s.genre].append(s)
    rng = random.Random(f"{today.isoformat()}-genres")
    for genre, lst in sorted(by_genre.items(), key=lambda kv: -len(kv[1])):
        if len(lst) < MIN:
            continue
        lst = list(lst)
        rng.shuffle(lst)
        mixes.append(_mix(f"genre:{genre}", f"Mix {genre}", f"Lo mejor de tu {genre.lower()}", lst, "genre", genre=genre))

    # ---------- hace rato no escuchas ----------
    def forgotten_score(s):
        return s.play_count * 2 + (3 if s.liked else 0)

    forgotten = [s for s in songs if (s.play_count > 0 or s.liked) and recent(s) < month_ago]
    if len(forgotten) < 10:
        # el historial es reciente: también las agregadas hace más de dos meses que no suenan
        old = now - timedelta(days=60)
        forgotten += [s for s in songs if s not in forgotten and s.id not in month
                      and s.created_at and s.created_at < old and recent(s) < month_ago]
    rng = random.Random(f"{today.isoformat()}-forgotten")
    forgotten.sort(key=lambda s: (-forgotten_score(s), rng.random()))
    if len(forgotten) >= MIN:
        mixes.append(_mix("forgotten", "Hace rato no escuchas", "Canciones que hace un mes no suenan", forgotten, "forgotten"))

    # ---------- recién agregadas ----------
    newest = sorted(songs, key=lambda s: s.created_at or now, reverse=True)
    fresh = [s for s in newest if s.created_at and s.created_at >= month_ago]
    if len(fresh) < 15:
        fresh = newest[:30]
    mixes.append(_mix("new", "Recién agregadas", "Lo último que añadiste", fresh, "new"))

    # ---------- mix diario ----------
    rng = random.Random(f"daily-{today.isoformat()}")
    favs = [s for s in songs if s.play_count > 0 or s.liked or month.get(s.id)]
    fav_set = set(_ids(favs))
    rest = [s for s in songs if s.id not in fav_set]
    rng.shuffle(favs)
    rng.shuffle(rest)
    olds = [s for s in forgotten if s.id not in fav_set]
    daily = favs[:12] + olds[:8]
    daily += [s for s in rest if s not in daily][: 30 - len(daily)]
    rng.shuffle(daily)
    mixes.insert(0, _mix("daily", "Mix diario", f"Cambia cada día · {today.strftime('%d/%m')}", daily, "daily"))

    # portada: hasta 4 canciones distintas
    for m in mixes:
        m["cover_ids"] = m["song_ids"][:4]
    return mixes
