"""Fase 4B: artistas, corrección de artistas, mixes, carátulas en disco y carpetas importadas."""
import io
import sqlite3
from datetime import date, timedelta

import pytest

import covers as covers_mod
from db import Play, Song, utcnow
from fixes import FixFinder, best_spelling
from library import clean_channel, parse_title, split_artists
from mixes import build_mixes


# ---------- utilidades de nombres ----------
def test_artist_helpers():
    assert split_artists("Feid, El Americano 4KT, Pirlo") == ["Feid", "El Americano 4KT", "Pirlo"]
    assert split_artists("2Pac ft. Bob Marley") == ["2Pac", "Bob Marley"]
    assert split_artists("Simon & Garfunkel") == ["Simon & Garfunkel"]
    assert clean_channel("De La Ghetto - Topic") == ("De La Ghetto", True)
    assert clean_channel("ArcangelVEVO") == ("Arcangel", True)
    assert clean_channel("touga") == ("touga", False)
    # canal = parte derecha: el título venía invertido
    assert parse_title("La Rebelión - Joe Arroyo", "Joe Arroyo") == ("Joe Arroyo", "La Rebelión")
    assert parse_title("Joe Arroyo - La Rebelión", "Joe Arroyo") == ("Joe Arroyo", "La Rebelión")
    assert parse_title("Esas Cosas", "Doble Porcion - Topic") == ("Doble Porcion", "Esas Cosas")


def test_best_spelling_prefers_accents_and_not_shouting():
    from collections import Counter
    assert best_spelling(Counter({"Willie Colon": 3, "Willie Colón": 1})) == "Willie Colón"
    assert best_spelling(Counter({"CRACK FAMILY": 2, "Crack Family": 1})) == "Crack Family"


# ---------- corregir artistas ----------
def test_fix_proposals_and_apply(client, app, add_song, cfg):
    ids = {
        "topic": add_song(filename=None, content=None, title="Esas Cosas", youtube_id="aaaaaaaaaa1"),
        "titled": add_song(filename=None, content=None, title="Tema", original_title="Grupo Niche - Cali Pachanguero",
                           youtube_id="aaaaaaaaaa2"),
        "label": add_song(filename=None, content=None, title="Beat", youtube_id="aaaaaaaaaa3"),
        "known": add_song(filename=None, content=None, title="Otra", youtube_id="aaaaaaaaaa4"),
        "swapped": add_song(filename=None, content=None, title="Facundo Cabral", artist="Pobrecito mi patrón",
                            youtube_id="aaaaaaaaaa5"),
        "colon1": add_song(filename=None, content=None, title="Idilio", artist="Willie Colon"),
        "colon2": add_song(filename=None, content=None, title="Gitana", artist="Willie Colón"),
        "unknown": add_song(filename=None, content=None, title="Sin pistas"),
    }
    add_song(filename=None, content=None, title="Llorarás", artist="Doble Porción")
    add_song(filename=None, content=None, title="Ruedaz", artist="Crack Family")
    channels = {"aaaaaaaaaa1": "Doble Porcion - Topic", "aaaaaaaaaa2": "Canal X", "aaaaaaaaaa3": "touga",
                "aaaaaaaaaa4": "CRACK FAMILY", "aaaaaaaaaa5": "Facundo Cabral"}
    app.state.fixes = FixFinder(app.state.sessions, cfg.music_dir, channel_lookup=channels.get)
    app.state.fixes._fetch_channels()
    props = {p["song_id"]: p for p in app.state.fixes.proposals()}

    assert props[ids["topic"]]["proposed"]["artist"] == "Doble Porción"  # escritura de la biblioteca
    assert props[ids["topic"]]["confidence"] == "high"
    assert props[ids["titled"]]["proposed"] == {"artist": "Grupo Niche", "title": "Cali Pachanguero"}
    assert props[ids["label"]]["confidence"] == "medium"
    assert props[ids["known"]]["proposed"]["artist"] == "Crack Family"
    assert props[ids["swapped"]]["kind"] == "swapped"
    assert props[ids["swapped"]]["proposed"] == {"artist": "Facundo Cabral", "title": "Pobrecito mi patrón"}
    assert props[ids["colon1"]]["kind"] == "spelling" and props[ids["colon1"]]["proposed"]["artist"] == "Willie Colón"
    assert ids["unknown"] not in props and ids["colon2"] not in props

    # nada cambia hasta aplicar; al aplicar se guarda una copia de la base
    assert client.get(f"/songs/{ids['swapped']}").json()["artist"] == "Pobrecito mi patrón"
    r = client.post("/fixes/apply", json={"items": [
        {"song_id": ids["swapped"], "artist": "Facundo Cabral", "title": "Pobrecito mi patrón"},
        {"song_id": ids["label"], "artist": "Editado a mano", "title": "Beat"},
    ]}).json()
    assert r["changed"] == 2 and r["backup"] and "antes-de-corregir-artistas" in r["backup"]
    s = client.get(f"/songs/{ids['swapped']}").json()
    assert (s["artist"], s["title"]) == ("Facundo Cabral", "Pobrecito mi patrón")
    assert client.get(f"/songs/{ids['label']}").json()["artist"] == "Editado a mano"


# ---------- mixes ----------
def test_mixes(client, app, add_song):
    now = utcnow()
    with app.state.sessions() as db:
        for i in range(12):
            db.add(Song(title=f"Feid {i}", artist="Feid" if i < 6 else "Karol G, Feid" if i < 8 else "Otro",
                        filename=None, status="ok", play_count=i, genre="Reguetón" if i % 2 else None,
                        created_at=now - timedelta(days=90 if i < 6 else 2),
                        last_played_at=now - timedelta(days=40) if i < 6 else None))
        db.commit()
        songs = list(db.query(Song))
        for s in songs[6:]:
            db.add(Play(song_id=s.id, song_title=s.title, started_at=now - timedelta(days=1), ended_at=now,
                        listened_seconds=100, end_reason="ended", counted=True))
        db.commit()

    mixes = {m["id"]: m for m in client.get("/mixes/", params={"day": "2026-11-15"}).json()}
    assert list(mixes)[0] == "daily"
    assert mixes["top"]["song_ids"][0] == songs[11].id  # la más escuchada primero
    assert len(mixes["month"]["song_ids"]) == 6
    assert "artist:feid" in mixes and len(mixes["artist:feid"]["song_ids"]) >= 6  # incluye colaboraciones
    assert "genre:Reguetón" in mixes
    assert set(mixes["forgotten"]["song_ids"]) >= {s.id for s in songs[1:6]}
    assert mixes["new"]["song_ids"][:6] and all(len(m["cover_ids"]) <= 4 for m in mixes.values())
    # el mix diario es estable en el día y cambia otro día
    again = {m["id"]: m for m in client.get("/mixes/", params={"day": "2026-11-15"}).json()}
    other = {m["id"]: m for m in client.get("/mixes/", params={"day": "2026-11-16"}).json()}
    assert again["daily"]["song_ids"] == mixes["daily"]["song_ids"]
    assert other["daily"]["song_ids"] != mixes["daily"]["song_ids"]


def test_mixes_empty_library(client):
    assert client.get("/mixes/").json() == []


# ---------- carátulas en disco ----------
def _jpeg(w, h, color=(200, 30, 30)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "JPEG")
    return buf.getvalue()


def test_cover_cached_on_disk(client, app, add_song, cfg, monkeypatch):
    calls = []

    def fetch(url):
        calls.append(url)
        if "maxresdefault" in url:
            return _jpeg(120, 90)  # la imagen gris de relleno no vale
        return _jpeg(1280, 720)

    app.state.covers = covers_mod.CoverStore(cfg.data_dir / "covers", app.state.sessions, cfg.music_dir, fetch=fetch)
    sid = add_song(youtube_id="bbbbbbbbbbb")
    r = client.get(f"/cover/{sid}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.headers["access-control-allow-origin"] == "*"  # sirve igual para <img> y fetch()
    from PIL import Image
    assert Image.open(io.BytesIO(r.content)).size == (400, 400)  # cuadrada y reducida
    assert (cfg.data_dir / "covers" / "bbbbbbbbbbb.jpg").is_file()
    n = len(calls)
    assert client.get(f"/cover/{sid}").status_code == 200 and len(calls) == n  # ya está en disco

    # sin carátula en ningún sitio: 404 y no se reintenta enseguida
    app.state.covers._fetch = lambda url: None
    monkeypatch.setattr(app.state.covers, "_online_hint", lambda: True)
    other = add_song(filename="b.mp3", youtube_id="ccccccccccc")
    assert client.get(f"/cover/{other}").status_code == 404
    assert (cfg.data_dir / "covers" / "ccccccccccc.none").is_file()
    st = client.get("/covers/status").json()
    assert st["saved"] == 1 and st["without_art"] == 1


def test_cover_status_total_not_overwritten_by_fill_progress(client, app, add_song, cfg):
    """Regresión: tras un relleno en segundo plano sin nada pendiente salía «1 de 0 guardadas»."""
    app.state.covers = covers_mod.CoverStore(cfg.data_dir / "covers", app.state.sessions, cfg.music_dir,
                                             fetch=lambda url: _jpeg(640, 480))
    sid = add_song(youtube_id="ddddddddddd")
    assert client.get(f"/cover/{sid}").status_code == 200
    app.state.covers._fill(0)  # relleno terminado: no quedaba ninguna por guardar
    st = client.get("/covers/status").json()
    assert st["total"] == 1 and st["saved"] == 1 and st["missing"] == 0
    assert st["running"] is False and st["fill_total"] == 0


def test_cover_from_embedded_art(client, app, add_song, cfg, monkeypatch):
    monkeypatch.setattr(covers_mod, "embedded_art", lambda path: _jpeg(500, 500, (10, 200, 10)))
    app.state.covers = covers_mod.CoverStore(cfg.data_dir / "covers", app.state.sessions, cfg.music_dir,
                                             fetch=lambda url: pytest.fail("no debe usar internet"))
    sid = add_song(filename="local.mp3")
    assert client.get(f"/cover/{sid}").status_code == 200


# ---------- carpetas importadas ----------
def test_import_folder(client, app, cfg, tmp_path):
    folder = tmp_path / "Mi música"
    (folder / "Salsa").mkdir(parents=True)
    (folder / "Salsa" / "Joe Arroyo - La Rebelión.mp3").write_bytes(b"x" * 50)
    (folder / "Tema suelto.flac").write_bytes(b"y" * 30)
    (folder / "nota.txt").write_text("no es audio")
    (folder / "a medias.mp3.part").write_bytes(b"z")

    # no se puede importar la propia carpeta de música
    assert client.post("/folders/", json={"path": str(cfg.music_dir)}).status_code == 400
    assert client.post("/folders/", json={"path": str(tmp_path / "no-existe")}).status_code == 400

    r = client.post("/folders/", json={"path": str(folder)})
    assert r.status_code == 201
    fid = r.json()[0]["id"]
    app.state.importer.scan(fid)  # en la app va en segundo plano
    songs = [s for s in client.get("/songs/").json() if s["folder_id"] == fid]
    by_title = {s["title"]: s for s in songs}
    assert set(by_title) == {"La Rebelión", "Tema suelto"}
    assert by_title["La Rebelión"]["artist"] == "Joe Arroyo" and by_title["La Rebelión"]["source"] == "local"
    sid = by_title["La Rebelión"]["id"]
    assert client.get(f"/songs/{sid}/audio").content == b"x" * 50
    assert client.post("/folders/", json={"path": str(folder / "Salsa")}).status_code == 400  # ya importada

    # volver a escanear: no duplica; un archivo borrado queda como "falta archivo"
    (folder / "Tema suelto.flac").unlink()
    app.state.importer.scan(fid)
    songs = [s for s in client.get("/songs/").json() if s["folder_id"] == fid]
    assert len(songs) == 2 and {s["status"] for s in songs} == {"ok", "missing"}

    # eliminar de la biblioteca una canción importada NO borra el archivo
    client.delete(f"/songs/{sid}")
    assert (folder / "Salsa" / "Joe Arroyo - La Rebelión.mp3").is_file()
    # quitar la carpeta saca sus canciones, sin tocar archivos
    out = client.delete(f"/folders/{fid}").json()
    assert out["folders"] == [] and not [s for s in client.get("/songs/").json() if s["folder_id"] == fid]
    assert (folder / "Salsa" / "Joe Arroyo - La Rebelión.mp3").is_file()


def test_schema_upgrade_adds_part_b_columns(tmp_path):
    from db import init_db, make_engine
    db_path = tmp_path / "old.sqlite3"
    con = sqlite3.connect(db_path)
    con.execute("CREATE TABLE songs (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, artist VARCHAR, genre VARCHAR)")
    con.commit()
    con.close()
    engine = make_engine(db_path)
    assert init_db(engine, db_path) is not None  # copia antes de cambiar
    engine.dispose()
    con = sqlite3.connect(db_path)
    cols = {r[1] for r in con.execute("PRAGMA table_info(songs)")}
    assert {"channel", "folder_id", "track_no"} <= cols
    assert "folders" in {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    con.close()


def test_day_param_defaults_to_today(client, add_song):
    add_song(title="Una")
    mixes = client.get("/mixes/").json()
    assert date.today().strftime("%d/%m") in mixes[0]["subtitle"]
