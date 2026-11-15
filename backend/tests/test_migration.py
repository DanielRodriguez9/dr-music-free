from sqlalchemy import select

from db import LegacyPostgresSong, Song, make_engine, make_session_factory
from migrate_from_postgres import apply, plan

U = "https://www.youtube.com/watch?v="


def rows():
    return [
        dict(id=1, title="A - Uno (Official Video)", file_path="music\\A - Uno (Official Video).mp3", youtube_url=U + "aaaaaaaaaaa"),
        dict(id=2, title="A - Uno (Official Video)", file_path="music\\A - Uno (Official Video).mp3", youtube_url=U + "aaaaaaaaaaa&list=RDx"),
        dict(id=3, title="Video", file_path="music\\Video.mp4", youtube_url=U + "bbbbbbbbbbb"),  # existe como .mp3
        dict(id=4, title="Lost", file_path="music\\Lost.mp3", youtube_url=U + "ccccccccccc"),
        dict(id=5, title="Lost", file_path="music\\Lost.mp3", youtube_url=U + "ddddddddddd"),  # mismo archivo, otro video
        dict(id=6, title="Perdida", file_path="music\\Perdida.mp3", youtube_url=U + "eeeeeeeeeee"),
        dict(id=7, title="X - a/b", file_path="music\\X - a⧸b.mp3", youtube_url=U + "fffffffffff"),
    ]


def make_music(tmp_path):
    music = tmp_path / "music"
    music.mkdir()
    for name in ["A - Uno (Official Video).mp3", "Video.mp3", "Lost.mp3", "X - a⧸b.mp3",
                 "Suelta.webm", "Incompleta.webm.part"]:
        (music / name).write_bytes(b"x")
    return music


def test_plan(tmp_path):
    music = make_music(tmp_path)
    p = plan(rows(), music)
    by_vid = {s["vid"]: s for s in p["songs"]}
    assert len(p["songs"]) == 6
    assert by_vid["aaaaaaaaaaa"]["dup_ids"] == [2]
    assert by_vid["bbbbbbbbbbb"]["filename"] == "Video.mp3"
    assert by_vid["ddddddddddd"]["filename"] == "Lost.mp3"  # el más reciente se queda el archivo
    assert by_vid["ccccccccccc"]["filename"] is None
    assert by_vid["eeeeeeeeeee"]["filename"] is None
    assert by_vid["fffffffffff"]["filename"] == "X - a⧸b.mp3"
    assert [o.name for o in p["orphans"]] == ["Suelta.webm"]  # .part se ignora


def test_apply_keeps_everything_and_never_touches_files(tmp_path):
    music = make_music(tmp_path)
    before = sorted(p.name for p in music.iterdir())
    db_path = tmp_path / "lib.sqlite3"
    apply(rows(), plan(rows(), music), music, db_path)

    with make_session_factory(make_engine(db_path))() as db:
        legacy = db.scalars(select(LegacyPostgresSong)).all()
        songs = db.scalars(select(Song).order_by(Song.id)).all()
    assert len(legacy) == 7
    assert len(songs) == 7  # 6 de YouTube + 1 local
    assert {s.youtube_id for s in songs if s.youtube_id} == {c * 11 for c in "abcdef"}
    first = songs[0]
    assert (first.artist, first.title, first.legacy_id) == ("A", "Uno", 1)
    assert first.youtube_url == U + "aaaaaaaaaaa"
    assert {s.status for s in songs if s.youtube_id in ("c" * 11, "e" * 11)} == {"missing"}
    local = songs[-1]
    assert (local.source, local.filename, local.youtube_id) == ("local", "Suelta.webm", None)
    assert sorted(p.name for p in music.iterdir()) == before
