import pytest

from library import canonical_url, is_youtube_url, parse_title, safe_file, youtube_id


@pytest.mark.parametrize("url,expected", [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/watch?v=MYee0_fCzDU&list=RDpbmbFmjEeHY&index=27", "MYee0_fCzDU"),
    ("http://youtube.com/watch?feature=share&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?t=30", "dQw4w9WgXcQ"),
    ("https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://example.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/playlist?list=PL123", None),
    (None, None),
])
def test_youtube_id(url, expected):
    assert youtube_id(url) == expected


def test_is_youtube_url_rejects_other_hosts():
    assert is_youtube_url("https://youtu.be/dQw4w9WgXcQ")
    assert not is_youtube_url("https://example.com/watch?v=dQw4w9WgXcQ")
    assert not is_youtube_url("https://www.youtube.com/playlist?list=PL123")


def test_canonical_url_drops_playlist_params():
    assert canonical_url("MYee0_fCzDU") == "https://www.youtube.com/watch?v=MYee0_fCzDU"


@pytest.mark.parametrize("raw,artist,title", [
    ("Arctic Monkeys - Do I Wanna Know？ (Official Video)", "Arctic Monkeys", "Do I Wanna Know？"),
    ("Aerosmith - Dream On (Audio)", "Aerosmith", "Dream On"),
    ("Adolescent's Orquesta - Anhelo (Letra Oficial)", "Adolescent's Orquesta", "Anhelo"),
    ("Arcangel, Feid - Mírame Baby (Video Oficial) ｜ LA 8VA MARAVILLA", "Arcangel, Feid", "Mírame Baby"),
    ("Antarctica (Original Mix)", None, "Antarctica (Original Mix)"),
    ("6. Magia negra", None, "Magia negra"),
    ("Alek Human – FEEL THE LIFE ｜ Music Video", "Alek Human", "FEEL THE LIFE"),
    ("505", None, "505"),
])
def test_parse_title(raw, artist, title):
    assert parse_title(raw) == (artist, title)


def test_parse_title_uses_uploader_without_separator():
    assert parse_title("Clouds", "Aemone - Topic") == ("Aemone", "Clouds")


def test_safe_file_blocks_path_traversal(tmp_path):
    music = tmp_path / "music"
    music.mkdir()
    (music / "a.mp3").write_bytes(b"x")
    (tmp_path / "secret.txt").write_text("no")
    assert safe_file(music, "a.mp3") == (music / "a.mp3").resolve()
    assert safe_file(music, "../secret.txt") is None
    assert safe_file(music, "no-existe.mp3") is None
    assert safe_file(music, None) is None
