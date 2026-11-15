import os
import sys
import tempfile
from pathlib import Path

# Aislar los tests ANTES de importar la app: nunca tocar la música ni la base real.
_TMP = Path(tempfile.mkdtemp(prefix="drmusic-tests-"))
os.environ["DATA_DIR"] = str(_TMP / "data")
os.environ["MUSIC_PATH"] = str(_TMP / "music")
os.environ.pop("DB_PATH", None)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from config import Settings  # noqa: E402
from db import Song  # noqa: E402
from downloader import Downloader  # noqa: E402
from main import create_app  # noqa: E402


class FakeYDL:
    """Imita yt_dlp.YoutubeDL: 'descarga' escribiendo un archivo en la carpeta destino."""
    fail_with: str | None = None

    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=True):
        if FakeYDL.fail_with:
            raise RuntimeError(FakeYDL.fail_with)
        vid = url.split("v=")[1]
        for hook in self.opts["progress_hooks"]:
            hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100})
            hook({"status": "finished"})
        out = Path(self.opts["outtmpl"].replace("%(title)s", "Artista - Tema (Official Video)")
                   .replace("%(id)s", vid).replace("%(ext)s", "mp3"))
        out.write_bytes(b"ID3fake-audio" * 100)
        return {"id": vid, "title": "Artista - Tema (Official Video)", "uploader": "Canal",
                "duration": 123, "requested_downloads": [{"filepath": str(out)}]}


@pytest.fixture
def cfg(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MUSIC_PATH", str(tmp_path / "music"))
    monkeypatch.delenv("DB_PATH", raising=False)
    s = Settings()
    s.ensure_dirs()
    return s


@pytest.fixture
def app(cfg):
    FakeYDL.fail_with = None
    from db import make_engine, make_session_factory, init_db
    engine = make_engine(cfg.db_path)
    init_db(engine)
    dl = Downloader(make_session_factory(engine), cfg.music_dir, ydl_factory=FakeYDL)
    application = create_app(cfg, downloader=dl)
    yield application
    engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def add_song(app, cfg):
    def _add(filename="Tema.mp3", content=b"0123456789" * 10, **kw):
        if filename and content is not None:
            (cfg.music_dir / filename).write_bytes(content)
        with app.state.sessions() as db:
            song = Song(title=kw.pop("title", "Tema"), filename=filename, **kw)
            db.add(song)
            db.commit()
            return song.id
    return _add
