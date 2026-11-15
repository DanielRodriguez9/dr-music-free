import time

from tests.conftest import FakeYDL


def wait_job(client, job_id, timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/downloads/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.02)
    raise AssertionError("la descarga no terminó")


def test_home(client):
    assert client.get("/").json()["version"] == "2.0.0"


def test_list_and_get_songs(client, add_song):
    sid = add_song(artist="Alguien", youtube_id="dQw4w9WgXcQ")
    add_song(filename=None, content=None, title="Perdida", status="missing")
    songs = client.get("/songs/").json()
    assert len(songs) == 2
    assert songs[0]["public_url"] == f"/songs/{sid}/audio"
    assert songs[0]["artist"] == "Alguien"
    assert songs[1]["public_url"] is None
    assert client.get(f"/songs/{sid}").json()["title"] == "Tema"
    assert client.get("/songs/9999").status_code == 404


def test_audio_supports_range_requests(client, add_song):
    sid = add_song(content=b"0123456789" * 10)
    full = client.get(f"/songs/{sid}/audio")
    assert full.status_code == 200 and len(full.content) == 100
    part = client.get(f"/songs/{sid}/audio", headers={"Range": "bytes=10-19"})
    assert part.status_code == 206
    assert part.content == b"0123456789"


def test_audio_missing_file_404(client, add_song, cfg):
    sid = add_song()
    (cfg.music_dir / "Tema.mp3").unlink()
    assert client.get(f"/songs/{sid}/audio").status_code == 404


def test_patch_song(client, add_song):
    sid = add_song()
    r = client.patch(f"/songs/{sid}", json={"artist": " Nuevo ", "liked": True})
    assert r.json()["artist"] == "Nuevo" and r.json()["liked"] is True
    assert client.patch(f"/songs/{sid}", json={"title": "  "}).status_code == 400


def post_play(client, song_id, listened, reason="ended"):
    return client.post("/plays/", json={
        "song_id": song_id, "started_at": "2026-11-15T20:00:00Z",
        "listened_seconds": listened, "end_reason": reason,
    })


def test_play_counts_after_30_seconds(client, add_song):
    sid = add_song(duration=240)
    r = post_play(client, sid, 29, "skipped").json()
    assert r["play"]["counted"] is False and r["play"]["skipped"] is True
    assert r["song"]["play_count"] == 0 and r["song"]["last_played_at"]
    r = post_play(client, sid, 30, "skipped").json()
    assert r["play"]["counted"] is True and r["song"]["play_count"] == 1


def test_play_counts_after_half_of_short_song(client, add_song):
    sid = add_song(duration=40)
    assert post_play(client, sid, 19).json()["play"]["counted"] is False
    assert post_play(client, sid, 20).json()["play"]["counted"] is True


def test_play_accepts_text_plain_beacon(client, add_song):
    import json as _json
    sid = add_song(duration=100)
    body = _json.dumps({"song_id": sid, "started_at": "2026-11-15T20:00:00Z",
                        "listened_seconds": 60, "end_reason": "closed"})
    r = client.post("/plays/", content=body, headers={"Content-Type": "text/plain"})
    assert r.status_code == 201 and r.json()["play"]["end_reason"] == "closed"


def test_play_validation(client, add_song):
    sid = add_song()
    assert post_play(client, sid, 10, "otro").status_code == 422
    assert post_play(client, 999, 10).status_code == 404
    assert client.post("/plays/", content="no json").status_code == 422


def test_listened_capped_to_duration(client, add_song):
    sid = add_song(duration=100)
    assert post_play(client, sid, 5000).json()["play"]["listened_seconds"] == 105


def test_list_plays_and_history_survives_delete(client, add_song):
    sid = add_song(duration=100, artist="Yo")
    post_play(client, sid, 10, "skipped")
    post_play(client, sid, 80)
    plays = client.get("/plays/").json()
    assert len(plays) == 2
    assert len(client.get("/plays/?counted_only=true").json()) == 1
    client.delete(f"/songs/{sid}")
    plays = client.get("/plays/").json()
    assert len(plays) == 2 and plays[0]["song_id"] is None and plays[0]["song_title"] == "Tema"


def test_delete_removes_file(client, add_song, cfg):
    sid = add_song()
    assert client.delete(f"/songs/{sid}").status_code == 200
    assert not (cfg.music_dir / "Tema.mp3").exists()
    assert client.get("/songs/").json() == []


def test_delete_keeps_file_shared_by_other_song(client, add_song, cfg):
    a = add_song()
    add_song(content=None, title="Otra")  # mismo archivo
    client.delete(f"/songs/{a}")
    assert (cfg.music_dir / "Tema.mp3").exists()


def test_stats(client, add_song):
    add_song(file_size=1024 * 1024, duration=3600)
    add_song(filename=None, content=None, status="missing")
    s = client.get("/stats/").json()
    assert s["total_songs"] == 2 and s["missing_songs"] == 1
    assert s["total_size_mb"] == 1.0 and s["total_duration_hours"] == 1.0


def test_download_rejects_non_youtube(client):
    assert client.post("/downloads/", json={"url": "https://example.com/x"}).status_code == 400


def test_download_flow_with_progress(client, cfg):
    r = client.post("/downloads/", json={"url": "https://youtu.be/dQw4w9WgXcQ?list=RDx&t=3"})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    job = wait_job(client, r.json()["job"]["id"])
    assert job["status"] == "done" and job["progress"] == 100
    song = client.get(f"/songs/{job['song_id']}").json()
    assert song["artist"] == "Artista" and song["title"] == "Tema"
    assert song["youtube_url"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert song["filename"] == "Artista - Tema (Official Video) [dQw4w9WgXcQ].mp3"
    assert song["duration"] == 123 and song["status"] == "ok"
    assert (cfg.music_dir / song["filename"]).exists()

    # Mismo video con otro formato de enlace -> ya existe
    again = client.post("/downloads/", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&index=2"})
    assert again.json()["status"] == "exists"


def test_download_restores_missing_song(client, add_song):
    sid = add_song(filename=None, content=None, status="missing", youtube_id="dQw4w9WgXcQ")
    r = client.post("/downloads/", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
    job = wait_job(client, r.json()["job"]["id"])
    assert job["song_id"] == sid
    assert client.get(f"/songs/{sid}").json()["status"] == "ok"
    assert len(client.get("/songs/").json()) == 1


def test_download_error_reported(client):
    FakeYDL.fail_with = "Video unavailable"
    r = client.post("/downloads/", json={"url": "https://youtu.be/aaaaaaaaaaa"})
    job = wait_job(client, r.json()["job"]["id"])
    assert job["status"] == "error" and "Video unavailable" in job["error"]
    assert client.get("/songs/").json() == []


def test_cors_only_allows_configured_origins(client):
    ok = client.get("/", headers={"Origin": "http://localhost:5174"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5174"
    bad = client.get("/", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
