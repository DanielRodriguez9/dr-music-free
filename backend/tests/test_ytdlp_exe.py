import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import ytdlp_tool
from db import init_db, make_engine, make_session_factory
from downloader import Downloader, classify_error
from main import create_app

FAKE = [sys.executable, str(Path(__file__).with_name("fake_ytdlp.py"))]


@pytest.fixture
def exe_client(cfg):
    engine = make_engine(cfg.db_path)
    init_db(engine)
    dl = Downloader(make_session_factory(engine), cfg.music_dir, exe_cmd=FAKE, js_runtime="node:C:/app/DR.exe")
    with TestClient(create_app(cfg, downloader=dl)) as c:
        yield c
    engine.dispose()


def wait(client, job_id):
    for _ in range(300):
        job = client.get(f"/downloads/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.02)
    raise AssertionError("no terminó")


def test_exe_download_parses_progress_and_result(exe_client, cfg):
    r = exe_client.post("/downloads/", json={"url": "https://youtu.be/abcdefghijk"})
    job = wait(exe_client, r.json()["job"]["id"])
    assert job["status"] == "done", job
    song = exe_client.get(f"/songs/{job['song_id']}").json()
    assert (song["artist"], song["title"]) == ("Grupo", "Canción ñ")
    assert song["filename"] == "Grupo - Canción ñ [abcdefghijk].mp3"
    assert (cfg.music_dir / song["filename"]).exists()


def test_exe_outdated_error_is_flagged(exe_client):
    r = exe_client.post("/downloads/", json={"url": "https://youtu.be/errorxxxxxx"})
    job = wait(exe_client, r.json()["job"]["id"])
    assert job["status"] == "error"
    assert job["error_kind"] == "outdated"
    assert "nsig" in job["error"] and not job["error"].startswith("ERROR:")


def test_classify_error():
    assert classify_error("ERROR: Sign in to confirm you're not a bot") == "outdated"
    assert classify_error("HTTP Error 403: Forbidden") == "outdated"
    assert classify_error("Video unavailable. This video is private") is None


def test_prepare_copies_bundled_and_upgrades(tmp_path):
    bundled = tmp_path / "app" / "yt-dlp.exe"
    bundled.parent.mkdir()
    bundled.write_bytes(b"v1")
    bundled.with_suffix(".version").write_text("2026.01.01")
    target = tmp_path / "data" / "bin" / "yt-dlp.exe"

    assert ytdlp_tool.prepare(bundled, target) == target
    assert target.read_bytes() == b"v1"

    # la copia se actualizó sola (yt-dlp -U): no se pisa con una versión más vieja
    target.write_bytes(b"v3")
    target.with_suffix(".version").write_text("2026.06.01")
    bundled.write_bytes(b"v2")
    bundled.with_suffix(".version").write_text("2026.03.01")
    ytdlp_tool.prepare(bundled, target)
    assert target.read_bytes() == b"v3"

    # una app nueva trae un yt-dlp más reciente: se reemplaza
    bundled.write_bytes(b"v4")
    bundled.with_suffix(".version").write_text("2026.09.01")
    ytdlp_tool.prepare(bundled, target)
    assert target.read_bytes() == b"v4"
    assert ytdlp_tool.read_version_file(target) == "2026.09.01"


def test_prepare_without_bundled_returns_none(tmp_path):
    assert ytdlp_tool.prepare(None, tmp_path / "yt-dlp.exe") is None


def test_system_info_dev_mode(client):
    info = client.get("/system/info").json()
    assert info["ytdlp_mode"] == "module" and info["ytdlp_updatable"] is False
    assert info["music_path"] and info["data_path"]


def test_update_blocked_while_downloading(client, app):
    from downloader import Job
    app.state.downloader._jobs["x"] = Job(id="x", url="u", youtube_id="abcdefghijk", status="downloading")
    assert client.post("/system/ytdlp/update").status_code == 409


def test_private_network_preflight_header(client):
    r = client.options("/songs/", headers={
        "Origin": "http://localhost:5174", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true"})
    assert r.headers.get("access-control-allow-private-network") == "true"
