"""Versión 2.3.0: letras (LRCLIB) y fondo personalizado."""
import io
import json
import time
import urllib.parse

import pytest

import lyrics as lyrics_mod
from lyrics import LyricsStore, bare_title, clean_title, main_artist, parse_lrc


# ---------- limpiar títulos ----------
@pytest.mark.parametrize("raw, clean", [
    ("Water World (prod. Derek Pope)", "Water World"),
    ("Morning Sunset (Feat.  @Mounika.) Official Video", "Morning Sunset"),
    ("To Whom It May Concern - sub. español - (edit)", "To Whom It May Concern"),
    ("Natural Blues (2006 Remaster)", "Natural Blues"),
    ("Salam Alaykum - (Prod. by Yotto Beatz) #ELEVACIÓN", "Salam Alaykum"),
    ("Another Brick in the Wall HD - Español / Inglés", "Another Brick in the Wall"),
    ("nothing spoil ft. Bella Shmurda", "nothing spoil"),
    ("Bailando con la luna", "Bailando con la luna"),  # "con" no es un featuring
    ("Producto Nacional", "Producto Nacional"),  # "prod" dentro de una palabra no se corta
    ("Ojalá - Silvio Rodríguez", "Ojalá - Silvio Rodríguez"),  # un tramo que no es ruido se queda
    ("Music", "Music"),
])
def test_clean_title(raw, clean):
    assert clean_title(raw) == clean


def test_bare_title_and_main_artist():
    assert bare_title("The Man Who Sold The World (MTV Unplugged)") == "The Man Who Sold The World"
    assert main_artist("Travis Scott x Vizion") == "Travis Scott"
    assert main_artist("Bob Marley & The Wailers") == "Bob Marley"
    assert main_artist("HXSHXR, Devilish Trio") == "HXSHXR"
    assert main_artist(None) is None


def test_parse_lrc():
    text = "[ar:Alguien]\n[offset:+500]\n[00:01.00]Uno\n[00:10.50][01:02.25]Coro\n\n[00:05.00]\nsin marca"
    lines = parse_lrc(text)
    # offset positivo: la letra va 0,5 s antes; varias marcas -> la línea se repite
    assert lines == [
        {"t": 0.5, "text": "Uno"},
        {"t": 4.5, "text": ""},
        {"t": 10.0, "text": "Coro"},
        {"t": 61.75, "text": "Coro"},
    ]
    assert parse_lrc("") == []


# ---------- buscar letras ----------
SYNCED = {"id": 1, "trackName": "La Rebelión", "artistName": "Joe Arroyo", "duration": 285.0,
          "instrumental": False, "plainLyrics": "En los años 1600\nCuando el tirano mandó",
          "syncedLyrics": "[00:12.00] En los años 1600\n[00:15.50] Cuando el tirano mandó"}


class FakeLrclib:
    """Imita LRCLIB: responde según la ruta y guarda cada consulta."""

    def __init__(self, get=None, search=None, offline=False):
        self.calls = []
        self._get = get or {}
        self._search = search or []
        self.offline = offline

    def __call__(self, url):
        if self.offline:
            raise OSError("sin conexión")
        parsed = urllib.parse.urlparse(url)
        q = dict(urllib.parse.parse_qsl(parsed.query))
        self.calls.append((parsed.path.rsplit("/", 1)[-1], q))
        if parsed.path.endswith("/get"):
            return self._get.get((q["artist_name"], q["track_name"]))
        return self._search


def store(tmp_path, fake):
    return LyricsStore(tmp_path / "lyrics", "2.3.0", fetch=fake)


def test_exact_match_is_synced_and_cached(tmp_path):
    fake = FakeLrclib(get={("Joe Arroyo", "La Rebelión"): SYNCED})
    s = store(tmp_path, fake)
    data = s.get("abc", "La Rebelión", "Joe Arroyo", 285.3)
    assert data["status"] == "synced"
    assert data["lines"][1] == {"t": 15.5, "text": "Cuando el tirano mandó"}
    assert fake.calls[0] == ("get", {"artist_name": "Joe Arroyo", "track_name": "La Rebelión", "duration": "285"})
    # segunda vez: del disco, sin internet
    fake.offline = True
    assert s.get("abc", "La Rebelión", "Joe Arroyo", 285.3)["status"] == "synced"
    assert json.loads((tmp_path / "lyrics" / "abc.json").read_text("utf-8"))["source"] == "lrclib"


def test_search_picks_matching_duration_and_artist(tmp_path):
    wrong_version = {**SYNCED, "id": 2, "duration": 377.0}  # otra versión (más larga)
    other_artist = {**SYNCED, "id": 3, "artistName": "Otro Grupo"}
    plain_only = {**SYNCED, "id": 4, "syncedLyrics": None, "duration": 286.0}
    good = {**SYNCED, "id": 5, "trackName": "La Rebelion (No le pegue a la negra)", "duration": 284.0}
    fake = FakeLrclib(search=[wrong_version, other_artist, plain_only, good])
    data = store(tmp_path, fake).get("v1", "La Rebelion (Official Video)", "Joe Arroyo", 285)
    assert data["status"] == "synced" and data["lrclib_id"] == 5
    assert fake.calls[-1] == ("search", {"track_name": "La Rebelion", "artist_name": "Joe Arroyo"})


def test_plain_instrumental_and_none(tmp_path):
    plain = {**SYNCED, "syncedLyrics": ""}
    s = store(tmp_path, FakeLrclib(get={("Joe Arroyo", "La Rebelión"): plain}))
    data = s.get("p", "La Rebelión", "Joe Arroyo", 285)
    assert data["status"] == "plain" and data["plain"].startswith("En los años")

    instr = {**SYNCED, "instrumental": True, "plainLyrics": None, "syncedLyrics": None}
    s2 = store(tmp_path, FakeLrclib(get={("Teho", "Space Explorers"): instr}))
    assert s2.get("i", "Space Explorers (Original mix)", "Teho", 400)["status"] == "instrumental"

    fake = FakeLrclib()
    assert store(tmp_path, fake).get("n", "Tema raro", "Nadie", 200)["status"] == "none"
    assert len(fake.calls) <= 3  # pocas consultas por canción


def test_none_is_retried_after_a_week(tmp_path, monkeypatch):
    fake = FakeLrclib()
    s = store(tmp_path, fake)
    s.get("n", "Tema", "Alguien", 200)
    n = len(fake.calls)
    s.get("n", "Tema", "Alguien", 200)
    assert len(fake.calls) == n  # recordado: no vuelve a preguntar
    later = time.time() + lyrics_mod.NONE_TTL + 60
    monkeypatch.setattr(lyrics_mod.time, "time", lambda: later)
    s.get("n", "Tema", "Alguien", 200)
    assert len(fake.calls) > n


def test_offline_and_disabled_are_not_cached(tmp_path):
    s = LyricsStore(tmp_path / "lyrics", "2.3.0", fetch=FakeLrclib(offline=True), online=lambda: False)
    assert s.get("o", "Tema", "Alguien", 200)["status"] == "offline"
    assert not (tmp_path / "lyrics" / "o.json").exists()
    # con internet pero LRCLIB caído o lento: otro mensaje, y tampoco se guarda
    s2 = LyricsStore(tmp_path / "lyrics", "2.3.0", fetch=FakeLrclib(offline=True), online=lambda: True)
    assert s2.get("o", "Tema", "Alguien", 200)["status"] == "unavailable"
    assert not (tmp_path / "lyrics" / "o.json").exists()
    assert s.get("o", "Tema", "Alguien", 200, fetch=False)["status"] == "disabled"


def test_long_mixes_and_no_artist_without_duration_are_skipped(tmp_path):
    fake = FakeLrclib(search=[SYNCED])
    s = store(tmp_path, fake)
    assert s.get("m", "Chill Session", "Dusk", 1348)["status"] == "none"
    assert s.get("x", "La Rebelión", None, None)["status"] == "none"
    assert fake.calls == []


def test_no_artist_needs_exact_title(tmp_path):
    fake = FakeLrclib(search=[{**SYNCED, "trackName": "La Rebelión del pueblo"}, SYNCED])
    data = store(tmp_path, fake).get("y", "La Rebelión", None, 285)
    assert data["status"] == "synced" and data["track"]["title"] == "La Rebelión"
    assert fake.calls == [("search", {"q": "La Rebelión"})]


# ---------- API ----------
def test_lyrics_endpoints(client, app, add_song, tmp_path):
    fake = FakeLrclib(get={("Joe Arroyo", "La Rebelión"): SYNCED})
    app.state.lyrics = store(tmp_path, fake)
    sid = add_song(title="La Rebelión", artist="Joe Arroyo", duration=285.0, youtube_id="oWBf9hfW_4Y")
    # con "Buscar letras" apagado no se usa internet
    assert client.get(f"/lyrics/song/{sid}", params={"fetch": 0}).json()["status"] == "disabled"
    assert fake.calls == []
    assert client.get(f"/lyrics/song/{sid}").json()["status"] == "synced"
    # la misma canción en línea (mismo video) usa la letra guardada
    n = len(fake.calls)
    r = client.get("/lyrics/online/oWBf9hfW_4Y", params={"title": "Otra cosa", "duration": 1})
    assert r.json()["status"] == "synced" and len(fake.calls) == n
    assert client.get("/lyrics/online/malo", params={"title": "x"}).status_code == 400
    assert client.get("/lyrics/song/9999").status_code == 404


# ---------- fondo personalizado ----------
def _image(fmt, size=(3000, 2000), mode="RGB"):
    from PIL import Image
    out = io.BytesIO()
    Image.new(mode, size, (200, 40, 90) if mode == "RGB" else (200, 40, 90, 120)).save(out, fmt)
    return out.getvalue()


@pytest.mark.parametrize("fmt, mode", [("JPEG", "RGB"), ("PNG", "RGBA"), ("WEBP", "RGB")])
def test_background_upload_resized(client, cfg, fmt, mode):
    from PIL import Image
    assert client.get("/appearance/").json() == {"background": None}
    r = client.put("/appearance/background", content=_image(fmt, mode=mode))
    assert r.status_code == 200, r.text
    info = r.json()
    assert (info["width"], info["height"]) == (1920, 1280)  # reducida, mismas proporciones
    saved = cfg.data_dir / "appearance" / "background.jpg"
    assert Image.open(saved).format == "JPEG"
    img = client.get(info["url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert img.headers["access-control-allow-origin"] == "*"  # se lee el color de acento con canvas
    assert client.get("/appearance/").json()["background"]["url"] == info["url"]


def test_background_rejects_bad_files_and_removes(client, cfg):
    assert client.put("/appearance/background", content=b"no soy una imagen").status_code == 400
    assert client.put("/appearance/background", content=_image("GIF", (50, 50))).status_code == 400
    assert client.put("/appearance/background", content=b"").status_code == 400
    assert client.put("/appearance/background", content=_image("PNG", (800, 600))).status_code == 200
    assert client.delete("/appearance/background").json() == {"background": None}
    assert not (cfg.data_dir / "appearance" / "background.jpg").exists()
    assert client.get("/appearance/background").status_code == 404


# ---------- portadas de los mixes sin repetir ----------
import hashlib  # noqa: E402

import covers as covers_mod  # noqa: E402
from mixes import choose_covers  # noqa: E402


def _fp(n: int) -> int:
    """Huella falsa de 64 bits: imágenes distintas se diferencian en ~32 bits."""
    return int.from_bytes(hashlib.md5(str(n).encode()).digest()[:8], "big")


def test_choose_covers_avoids_repeats_between_consecutive_mixes():
    # 1..4 y 10..13 comparten imagen (la misma portada en canciones distintas)
    fp = {sid: _fp(sid) for sid in (1, 2, 3, 4, 20, 21, 22, 23)}
    fp.update({10: fp[1], 11: fp[2], 12: fp[3], 13: fp[4]})
    mixes = [
        {"song_ids": [1, 2, 3, 4, 5]},
        {"song_ids": [10, 11, 12, 13, 20, 21, 22, 23]},  # sus 4 primeras repetirían el mix anterior
        {"song_ids": [1, 1, 2]},  # pocas canciones distintas: no se inventan portadas
    ]
    choose_covers(mixes, lambda sid: fp.get(sid))
    assert mixes[0]["cover_ids"] == [1, 2, 3, 4]
    assert mixes[1]["cover_ids"] == [20, 21, 22, 23]
    # ya se vieron en el primer mix, pero no en el anterior (el segundo): se pueden usar
    assert mixes[2]["cover_ids"] == [1, 2]


def test_choose_covers_no_duplicates_inside_a_mix_and_near_matches():
    fp = {1: _fp(1), 2: _fp(1) ^ 0b1, 3: _fp(3), 4: None, 5: None, 6: _fp(6)}  # 1 y 2 casi iguales
    mixes = [{"song_ids": [4, 1, 2, 3, 5, 6]}]
    choose_covers(mixes, lambda sid: fp[sid])
    # primero las que tienen carátula (1, 3, 6); la 2 repite a la 1; luego una sin carátula
    assert mixes[0]["cover_ids"] == [1, 3, 6, 4]


def test_cover_fingerprint_matches_same_picture(app, add_song, cfg):
    store = covers_mod.CoverStore(cfg.data_dir / "covers", app.state.sessions, cfg.music_dir,
                                  fetch=lambda url: None)
    from PIL import Image, ImageDraw
    from db import Song

    def save(key, color, shape):
        img = Image.new("RGB", (400, 400), color)
        d = ImageDraw.Draw(img)
        d.ellipse([60, 60, 340, 340] if shape else [0, 150, 400, 250], fill=(255, 255, 255))
        img.save(cfg.data_dir / "covers" / f"{key}.jpg", "JPEG", quality=90 if shape else 70)

    save("aaaaaaaaaaa", (200, 30, 30), True)
    save("bbbbbbbbbbb", (200, 30, 30), True)  # la misma portada en otro video
    save("ccccccccccc", (20, 30, 200), False)
    a, b, c = (Song(id=i, title="x", youtube_id=k) for i, k in
               enumerate(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"], 1))
    fa, fb, fc = store.fingerprint(a), store.fingerprint(b), store.fingerprint(c)
    assert (fa ^ fb).bit_count() <= 6 < (fa ^ fc).bit_count()
    assert store.fingerprint(Song(id=9, title="x", youtube_id="zzzzzzzzzzz")) is None
