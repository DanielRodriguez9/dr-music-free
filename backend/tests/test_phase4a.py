"""Fase 4A: géneros, listas de reproducción, YouTube en línea y escuchas en línea."""
import io
import sqlite3
import urllib.error

import pytest
from fastapi.testclient import TestClient

import youtube as yt_mod
from db import DEFAULT_GENRES, init_db, make_engine
from main import create_app


# ---------- actualización del esquema ----------
def test_old_database_is_upgraded_with_backup(tmp_path):
    db_path = tmp_path / "library.sqlite3"
    con = sqlite3.connect(db_path)
    con.executescript("""
        CREATE TABLE songs (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, artist VARCHAR, album VARCHAR,
            original_title VARCHAR, duration FLOAT, filename VARCHAR, file_size INTEGER, source VARCHAR,
            status VARCHAR, youtube_id VARCHAR(11) UNIQUE, youtube_url VARCHAR, thumbnail_url VARCHAR,
            liked BOOLEAN, play_count INTEGER, last_played_at DATETIME, created_at DATETIME, legacy_id INTEGER);
        CREATE TABLE plays (id INTEGER PRIMARY KEY, song_id INTEGER, song_title VARCHAR, song_artist VARCHAR,
            started_at DATETIME, ended_at DATETIME, listened_seconds FLOAT, song_duration FLOAT,
            end_reason VARCHAR, skipped BOOLEAN, counted BOOLEAN);
        INSERT INTO songs (id, title, source, status, liked, play_count) VALUES (1, 'Vieja', 'youtube', 'ok', 0, 3);
        INSERT INTO plays (id, song_id, listened_seconds, end_reason, skipped, counted) VALUES (1, 1, 40, 'ended', 0, 1);
    """)
    con.commit()
    con.close()

    engine = make_engine(db_path)
    backup = init_db(engine, db_path)
    engine.dispose()

    assert backup and backup.is_file() and backup.parent.name == "backups"
    # la copia es la base original, sin tocar
    old = sqlite3.connect(backup)
    assert "genre" not in [r[1] for r in old.execute("PRAGMA table_info(songs)")]
    old.close()
    con = sqlite3.connect(db_path)
    assert "genre" in [r[1] for r in con.execute("PRAGMA table_info(songs)")]
    assert {"youtube_id", "online"} <= {r[1] for r in con.execute("PRAGMA table_info(plays)")}
    assert con.execute("SELECT title, play_count FROM songs").fetchone() == ("Vieja", 3)
    assert con.execute("SELECT online FROM plays").fetchone() == (0,)
    assert [r[0] for r in con.execute("SELECT name FROM genres ORDER BY position")] == DEFAULT_GENRES
    con.close()

    # segunda vez: nada que cambiar, sin otra copia
    engine = make_engine(db_path)
    assert init_db(engine, db_path) is None
    engine.dispose()


# ---------- géneros ----------
def test_default_genres_created_once(client):
    names = [g["name"] for g in client.get("/genres/").json()]
    assert names == DEFAULT_GENRES
    gid = client.get("/genres/").json()[0]["id"]
    client.delete(f"/genres/{gid}")
    assert "Salsa" not in [g["name"] for g in client.get("/genres/").json()]


def test_genre_assign_bulk_rename_delete(client, add_song):
    a = add_song(filename="a.mp3", artist="Marc Anthony")
    b = add_song(filename="b.mp3", artist="Marc Anthony")
    c = add_song(filename="c.mp3", artist="Otro")

    r = client.patch(f"/songs/{a}", json={"genre": "salsa"})  # se respeta el nombre guardado
    assert r.json()["genre"] == "Salsa"

    r = client.post("/songs/bulk", json={"song_ids": [b, c], "genre": "Bachata"})  # género nuevo
    assert [s["genre"] for s in r.json()] == ["Bachata", "Bachata"]
    genres = {g["name"]: g for g in client.get("/genres/").json()}
    assert genres["Bachata"]["count"] == 2 and genres["Salsa"]["count"] == 1

    gid = genres["Bachata"]["id"]
    assert client.post("/genres/", json={"name": "bachata"}).status_code == 409
    assert client.patch(f"/genres/{gid}", json={"name": "Pop"}).status_code == 409
    client.patch(f"/genres/{gid}", json={"name": "Bachata romántica"})
    assert client.get(f"/songs/{b}").json()["genre"] == "Bachata romántica"

    client.delete(f"/genres/{gid}")
    assert client.get(f"/songs/{c}").json()["genre"] is None

    r = client.post("/songs/bulk", json={"song_ids": [a], "genre": None})
    assert r.json()[0]["genre"] is None
    assert client.post("/songs/bulk", json={"song_ids": [a]}).status_code == 400


# ---------- listas de reproducción ----------
def test_playlist_lifecycle(client, add_song):
    s1, s2, s3 = (add_song(filename=f"{i}.mp3", title=f"T{i}") for i in range(3))
    pl = client.post("/playlists/", json={"name": "  Para  correr ", "song_ids": [s1]}).json()
    assert pl["name"] == "Para correr" and [i["song_id"] for i in pl["items"]] == [s1]

    r = client.post(f"/playlists/{pl['id']}/songs", json={"song_ids": [s1, s2, s3, 9999]}).json()
    assert r["added"] == 2 and r["skipped"] == 2
    items = r["playlist"]["items"]
    assert [i["song_id"] for i in items] == [s1, s2, s3]

    new_order = [items[2]["id"], items[0]["id"], items[1]["id"]]
    r = client.put(f"/playlists/{pl['id']}/order", json={"item_ids": new_order}).json()
    assert [i["song_id"] for i in r["items"]] == [s3, s1, s2]
    assert client.put(f"/playlists/{pl['id']}/order", json={"item_ids": new_order[:2]}).status_code == 409

    r = client.post(f"/playlists/{pl['id']}/remove", json={"item_ids": [items[0]["id"]]}).json()
    assert [i["song_id"] for i in r["items"]] == [s3, s2]

    assert client.patch(f"/playlists/{pl['id']}", json={"name": "Gym"}).json()["name"] == "Gym"
    assert client.patch(f"/playlists/{pl['id']}", json={"name": "   "}).status_code in (400, 422)

    # borrar una canción la quita de las listas
    client.delete(f"/songs/{s3}")
    assert [i["song_id"] for i in client.get(f"/playlists/{pl['id']}").json()["items"]] == [s2]

    assert [p["name"] for p in client.get("/playlists/").json()] == ["Gym"]
    client.delete(f"/playlists/{pl['id']}")
    assert client.get("/playlists/").json() == []
    assert client.get(f"/songs/{s2}").status_code == 200  # la canción sigue en la biblioteca


# ---------- escuchas en línea ----------
def post_online(client, listened, vid="abcdefghijk", **kw):
    return client.post("/plays/", json={
        "youtube_id": vid, "title": "En línea", "artist": "Canal", "duration": 200,
        "started_at": "2026-11-15T20:00:00Z", "listened_seconds": listened, "end_reason": "ended", **kw,
    })


def test_online_play_is_recorded(client):
    r = post_online(client, 100)
    assert r.status_code == 201
    play = r.json()["play"]
    assert play["online"] is True and play["counted"] is True and play["song_id"] is None
    assert play["youtube_id"] == "abcdefghijk" and play["song_title"] == "En línea"
    assert post_online(client, 10).json()["play"]["counted"] is False
    assert len(client.get("/plays/").json()) == 2
    bad = client.post("/plays/", json={"started_at": "2026-11-15T20:00:00Z", "listened_seconds": 5, "end_reason": "ended"})
    assert bad.status_code == 422


def test_online_play_of_downloaded_song_counts_for_it(client, add_song):
    sid = add_song(youtube_id="abcdefghijk", duration=200)
    r = post_online(client, 120).json()
    assert r["play"]["song_id"] == sid and r["song"]["play_count"] == 1


# ---------- YouTube (falso: sin red) ----------
class FakeSearchYDL:
    calls = 0

    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, target, download=False):
        FakeSearchYDL.calls += 1
        if target.startswith("ytsearch"):
            return {"entries": [
                {"id": "aaaaaaaaaaa", "title": "Artista - Canción (Official Video)", "channel": "ArtistaVEVO", "duration": 210},
                {"id": "bbbbbbbbbbb", "title": "Directo", "channel": "Canal", "live_status": "is_live"},
                {"id": "ccccccccccc", "title": "Sin guion", "channel": "Grupo - Topic", "duration": 95},
            ]}
        if "fail" in target or "zzzzzzzzzzz" in target:
            raise RuntimeError("ERROR: [youtube] zzzzzzzzzzz: Requested format is not available")
        return {"id": target[-11:], "title": "T", "duration": 210, "ext": "m4a",
                "url": "https://rr.googlevideo.com/videoplayback?expire=9999999999&id=1",
                "http_headers": {"User-Agent": "UA"}}


class FakeResp(io.BytesIO):
    def __init__(self, data, status=200, headers=None):
        super().__init__(data)
        self.status = status
        self.headers = headers or {}


@pytest.fixture
def yt_client(cfg, monkeypatch):
    monkeypatch.setattr(yt_mod, "is_online", lambda timeout=2.5: True)
    seen = []

    def opener(req, timeout=30):
        seen.append(req)
        rng = req.headers.get("Range")
        if rng == "bytes=10-":
            return FakeResp(b"x" * 90, 206, {"Content-Type": "audio/mp4", "Content-Length": "90",
                                             "Content-Range": "bytes 10-99/100"})
        return FakeResp(b"x" * 100, 200, {"Content-Type": "audio/mp4", "Content-Length": "100"})

    yt = yt_mod.YouTube(ydl_factory=FakeSearchYDL, opener=opener)
    app = create_app(cfg, youtube=yt)
    with TestClient(app) as c:
        c.seen = seen
        yield c


def test_youtube_search(yt_client, add_song):
    data = yt_client.get("/youtube/search", params={"q": "artista"}).json()
    assert data["online"] is True
    res = data["results"]
    assert [r["youtube_id"] for r in res] == ["aaaaaaaaaaa", "ccccccccccc"]  # sin directos
    assert res[0]["artist"] == "Artista" and res[0]["title"] == "Canción" and res[0]["duration"] == 210
    assert res[1]["artist"] == "Grupo" and res[0]["song_id"] is None
    assert res[0]["thumbnail_url"].endswith("/aaaaaaaaaaa/hqdefault.jpg")
    calls = FakeSearchYDL.calls
    yt_client.get("/youtube/search", params={"q": "Artista "})
    assert FakeSearchYDL.calls == calls  # en caché
    assert yt_client.get("/youtube/search", params={"q": "a"}).json()["results"] == []


def test_youtube_offline_hides_results(yt_client, monkeypatch):
    monkeypatch.setattr(yt_mod, "is_online", lambda timeout=2.5: False)
    yt_client.app.state.youtube._online = (0, True)
    assert yt_client.get("/youtube/search", params={"q": "algo"}).json() == {"online": False, "results": []}
    assert yt_client.get("/youtube/status").json() == {"online": False}


def test_stream_proxy_with_range(yt_client):
    r = yt_client.get("/stream/aaaaaaaaaaa")
    assert r.status_code == 200 and len(r.content) == 100
    assert r.headers["content-type"] == "audio/mp4" and r.headers["accept-ranges"] == "bytes"
    assert yt_client.seen[-1].headers.get("User-agent") == "UA"
    r = yt_client.get("/stream/aaaaaaaaaaa", headers={"Range": "bytes=10-"})
    assert r.status_code == 206 and r.headers["content-range"] == "bytes 10-99/100"
    assert yt_client.get("/stream/aaaaaaaaaaa/info").json()["ok"] is True
    assert yt_client.get("/stream/no-valido").status_code in (400, 404)


def test_stream_error_suggests_update(yt_client):
    r = yt_client.get("/stream/zzzzzzzzzzz")
    assert r.status_code == 502 and r.json()["kind"] == "outdated"
    info = yt_client.get("/stream/zzzzzzzzzzz/info")
    assert info.status_code == 502 and "not available" in info.json()["detail"]


def test_expired_stream_is_resolved_again(cfg, monkeypatch):
    monkeypatch.setattr(yt_mod, "is_online", lambda timeout=2.5: True)
    monkeypatch.setattr(yt_mod.time, "sleep", lambda s: None)
    attempts = []

    def opener(req, timeout=30):
        attempts.append(req.full_url)
        if len(attempts) <= 2:  # la misma dirección falla dos veces: se pide otra a yt-dlp
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)
        return FakeResp(b"ok", 200, {"Content-Type": "audio/mp4"})

    yt = yt_mod.YouTube(ydl_factory=FakeSearchYDL, opener=opener)
    calls = FakeSearchYDL.calls
    with TestClient(create_app(cfg, youtube=yt)) as c:
        r = c.get("/stream/aaaaaaaaaaa")
    assert r.status_code == 200 and r.content == b"ok" and len(attempts) == 3
    assert FakeSearchYDL.calls == calls + 2  # resolvió dos veces


def test_waits_until_url_is_available(cfg, monkeypatch):
    """Cliente TV de YouTube: la dirección da 403 hasta available_at; hay que esperar."""
    monkeypatch.setattr(yt_mod, "is_online", lambda timeout=2.5: True)
    clock = {"now": 1000.0}
    monkeypatch.setattr(yt_mod.time, "time", lambda: clock["now"])
    monkeypatch.setattr(yt_mod.time, "sleep", lambda s: clock.__setitem__("now", clock["now"] + s))

    class TvYDL(FakeSearchYDL):
        def extract_info(self, target, download=False):
            info = super().extract_info(target, download)
            info["available_at"] = clock["now"] + 3
            return info

    def opener(req, timeout=30):
        if clock["now"] < 1003:
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)
        return FakeResp(b"ok", 206, {"Content-Type": "audio/mp4"})

    yt = yt_mod.YouTube(ydl_factory=TvYDL, opener=opener)
    resp, st = yt.open_stream("aaaaaaaaaaa", "bytes=0-")
    assert resp.status == 206 and clock["now"] >= 1003 and st.available_at == 1003


def test_prefetch_does_not_compete_with_running_resolve(cfg, monkeypatch):
    monkeypatch.setattr(yt_mod, "is_online", lambda timeout=2.5: True)
    yt = yt_mod.YouTube(ydl_factory=FakeSearchYDL)
    yt._active = 1  # otro yt-dlp trabajando
    with TestClient(create_app(cfg, youtube=yt)) as c:
        r = c.get("/stream/aaaaaaaaaaa/info", params={"prefetch": 1})
        assert r.status_code == 202 and r.json()["busy"] is True
        yt._active = 0
        assert c.get("/stream/aaaaaaaaaaa/info", params={"prefetch": 1}).json()["ok"] is True
        yt._active = 1
        # ya preparado: la precarga lo devuelve aunque haya otro en curso
        assert c.get("/stream/aaaaaaaaaaa/info", params={"prefetch": 1}).json()["ok"] is True


def test_connect_prefers_ipv4(monkeypatch):
    """Si el IPv6 no responde, no hay que esperar 21 s: se usa IPv4 primero."""
    import socket
    tried = []

    class FakeSock:
        def __init__(self, family, *a):
            self.family = family

        def settimeout(self, t):
            pass

        def connect(self, addr):
            tried.append(self.family)

        def close(self):
            pass

    infos = [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2800::8", 443, 0, 0)),
             (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("179.1.1.1", 443))]
    monkeypatch.setattr(yt_mod.socket, "getaddrinfo", lambda *a, **k: list(infos))
    monkeypatch.setattr(yt_mod.socket, "socket", FakeSock)
    sock = yt_mod.connect_prefer_ipv4(("rr1.googlevideo.com", 443), timeout=30)
    assert sock.family == socket.AF_INET and tried == [socket.AF_INET]
