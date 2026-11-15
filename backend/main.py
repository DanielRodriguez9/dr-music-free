# DR Music Free - Backend API
# Creado por Daniel Rodríguez
# Biblioteca local de música + descargas desde YouTube

from contextlib import asynccontextmanager
import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from config import Settings, settings as default_settings
from db import Play, Song, counts_as_play, init_db, make_engine, make_session_factory, utcnow
from downloader import Downloader
from library import is_youtube_url, safe_file, youtube_id

VERSION = "2.0.0"


# ==================== ESQUEMAS ====================

class SongOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str | None
    album: str | None
    original_title: str | None
    duration: float | None
    filename: str | None
    file_size: int | None
    source: str
    status: str
    youtube_id: str | None
    youtube_url: str | None
    thumbnail_url: str | None
    liked: bool
    play_count: int
    last_played_at: datetime | None
    created_at: datetime
    public_url: str | None = None


class SongPatch(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    liked: bool | None = None


class PlayIn(BaseModel):
    song_id: int
    started_at: datetime
    listened_seconds: float = Field(ge=0, le=24 * 3600)
    end_reason: str = Field(pattern="^(ended|skipped|closed)$")


class PlayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    song_id: int | None
    song_title: str | None
    song_artist: str | None
    started_at: datetime
    ended_at: datetime
    listened_seconds: float
    song_duration: float | None
    end_reason: str
    skipped: bool
    counted: bool


class DownloadIn(BaseModel):
    url: str


def song_out(song: Song) -> SongOut:
    out = SongOut.model_validate(song)
    out.public_url = f"/songs/{song.id}/audio" if song.status == "ok" else None
    return out


# ==================== APP ====================

def create_app(cfg: Settings | None = None, downloader: Downloader | None = None) -> FastAPI:
    cfg = cfg or default_settings
    cfg.ensure_dirs()
    engine = make_engine(cfg.db_path)
    init_db(engine)
    sessions = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        engine.dispose()

    app = FastAPI(title="DR Music Free API", version=VERSION, lifespan=lifespan)
    app.state.settings = cfg
    app.state.sessions = sessions
    app.state.downloader = downloader or Downloader(sessions, cfg.music_dir, cfg.ffmpeg_path)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["*"],
    )

    def get_db(request: Request):
        with request.app.state.sessions() as db:
            yield db

    def get_song_or_404(song_id: int, db: Session) -> Song:
        song = db.get(Song, song_id)
        if not song:
            raise HTTPException(404, "Canción no encontrada")
        return song

    # ---------- general ----------
    @app.get("/")
    def home():
        return {"message": "🎵 DR Music Free API funcionando!", "version": VERSION}

    @app.get("/stats/")
    def get_stats(db: Session = Depends(get_db)):
        total = db.scalar(select(func.count(Song.id)))
        ok = db.scalar(select(func.count(Song.id)).where(Song.status == "ok"))
        size = db.scalar(select(func.coalesce(func.sum(Song.file_size), 0)).where(Song.status == "ok"))
        duration = db.scalar(select(func.coalesce(func.sum(Song.duration), 0)).where(Song.status == "ok"))
        return {
            "total_songs": total,
            "available_songs": ok,
            "missing_songs": total - ok,
            "total_size_mb": round(size / (1024 * 1024), 2),
            "total_duration_hours": round(duration / 3600, 1),
            "music_path": str(cfg.music_dir),
        }

    # ---------- canciones ----------
    @app.get("/songs/", response_model=list[SongOut])
    def list_songs(db: Session = Depends(get_db)):
        return [song_out(s) for s in db.scalars(select(Song).order_by(Song.id))]

    @app.get("/songs/{song_id}", response_model=SongOut)
    def get_song(song_id: int, db: Session = Depends(get_db)):
        return song_out(get_song_or_404(song_id, db))

    @app.patch("/songs/{song_id}", response_model=SongOut)
    def update_song(song_id: int, patch: SongPatch, db: Session = Depends(get_db)):
        song = get_song_or_404(song_id, db)
        for key, value in patch.model_dump(exclude_unset=True).items():
            if key == "title" and not (value or "").strip():
                raise HTTPException(400, "El título no puede estar vacío")
            setattr(song, key, value.strip() if isinstance(value, str) else value)
        db.commit()
        return song_out(song)

    @app.get("/songs/{song_id}/audio")
    def song_audio(song_id: int, db: Session = Depends(get_db)):
        song = get_song_or_404(song_id, db)
        path = safe_file(cfg.music_dir, song.filename)
        if not path:
            raise HTTPException(404, "El archivo de audio no existe")
        return FileResponse(path)

    @app.delete("/songs/{song_id}")
    def delete_song(song_id: int, db: Session = Depends(get_db)):
        song = get_song_or_404(song_id, db)
        shared = db.scalar(
            select(func.count(Song.id)).where(Song.filename == song.filename, Song.id != song.id)
        ) if song.filename else 0
        path = safe_file(cfg.music_dir, song.filename)
        if path and not shared:
            path.unlink()
        db.delete(song)
        db.commit()
        return {"status": "success", "message": "Canción eliminada"}

    @app.get("/thumb/{song_id}")
    def get_thumbnail(song_id: int, db: Session = Depends(get_db)):
        return {"thumbnail_url": get_song_or_404(song_id, db).thumbnail_url}

    # ---------- historial de reproducción ----------
    @app.post("/plays/", status_code=201)
    async def record_play(request: Request):
        # Se lee el cuerpo a mano: al cerrar la app llega por sendBeacon como text/plain
        try:
            body = PlayIn.model_validate(json.loads(await request.body() or b"{}"))
        except (ValueError, ValidationError) as exc:
            raise HTTPException(422, f"Datos de reproducción no válidos: {exc}") from exc

        with request.app.state.sessions() as db:
            song = get_song_or_404(body.song_id, db)
            listened = body.listened_seconds
            if song.duration:
                listened = min(listened, song.duration + 5)
            counted = counts_as_play(listened, song.duration)
            started = body.started_at if body.started_at.tzinfo else body.started_at.replace(tzinfo=timezone.utc)
            play = Play(
                song_id=song.id, song_title=song.title, song_artist=song.artist,
                started_at=started, ended_at=utcnow(), listened_seconds=round(listened, 1),
                song_duration=song.duration, end_reason=body.end_reason,
                skipped=body.end_reason == "skipped", counted=counted,
            )
            db.add(play)
            song.last_played_at = play.ended_at
            if counted:
                song.play_count += 1
            db.commit()
            return {"play": PlayOut.model_validate(play).model_dump(mode="json"),
                    "song": song_out(song).model_dump(mode="json")}

    @app.get("/plays/", response_model=list[PlayOut])
    def list_plays(limit: int = 200, days: int | None = None, counted_only: bool = False,
                   db: Session = Depends(get_db)):
        q = select(Play).order_by(Play.started_at.desc()).limit(min(max(limit, 1), 5000))
        if days:
            q = q.where(Play.started_at >= utcnow() - timedelta(days=days))
        if counted_only:
            q = q.where(Play.counted.is_(True))
        return db.scalars(q).all()

    # ---------- descargas ----------
    @app.post("/downloads/", status_code=202)
    def start_download(body: DownloadIn, request: Request, db: Session = Depends(get_db)):
        if not is_youtube_url(body.url):
            raise HTTPException(400, "Solo se permiten enlaces de videos de YouTube")
        vid = youtube_id(body.url)
        existing = db.scalar(select(Song).where(Song.youtube_id == vid))
        if existing and existing.status == "ok":
            return {"status": "exists", "song": song_out(existing).model_dump(mode="json")}
        job = request.app.state.downloader.submit(vid)
        return {"status": "queued", "job": job.to_dict()}

    @app.get("/downloads/")
    def list_downloads(request: Request):
        return [j.to_dict() for j in request.app.state.downloader.list()]

    @app.get("/downloads/{job_id}")
    def get_download(job_id: str, request: Request):
        job = request.app.state.downloader.get(job_id)
        if not job:
            raise HTTPException(404, "Descarga no encontrada")
        return job.to_dict()

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
