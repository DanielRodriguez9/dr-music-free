# DR Music Free - Backend API
# Creado por Daniel Rodríguez
# Biblioteca local de música + descargas desde YouTube

from contextlib import asynccontextmanager
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from config import Settings, settings as default_settings
from db import (Genre, Play, Playlist, PlaylistItem, Song, counts_as_play, init_db, make_engine,
                make_session_factory, utcnow)
import ytdlp_tool
from downloader import Downloader
from library import is_youtube_url, safe_file, sync_file_status, youtube_id
from youtube import YouTube, YouTubeError

VERSION = "2.1.0"
_VIDEO_ID = re.compile(r"^[0-9A-Za-z_-]{11}$")
log = logging.getLogger("drmusic")


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
    genre: str | None = None
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
    genre: str | None = None
    liked: bool | None = None


class BulkPatch(BaseModel):
    song_ids: list[int] = Field(min_length=1, max_length=20000)
    genre: str | None = None  # "" o null quita el género
    liked: bool | None = None


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PlaylistIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    song_ids: list[int] = []


class SongIdsIn(BaseModel):
    song_ids: list[int] = Field(min_length=1, max_length=20000)


class ItemIdsIn(BaseModel):
    item_ids: list[int] = Field(max_length=20000)


class PlayIn(BaseModel):
    song_id: int | None = None
    # escucha en línea (canción que no está descargada)
    youtube_id: str | None = Field(default=None, pattern=r"^[0-9A-Za-z_-]{11}$")
    title: str | None = Field(default=None, max_length=500)
    artist: str | None = Field(default=None, max_length=300)
    duration: float | None = Field(default=None, ge=0, le=24 * 3600)
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
    youtube_id: str | None = None
    online: bool = False


class DownloadIn(BaseModel):
    url: str


def playlist_out(pl: Playlist, items: list[PlaylistItem]) -> dict:
    return {
        "id": pl.id, "name": pl.name,
        "created_at": pl.created_at.isoformat(), "updated_at": pl.updated_at.isoformat(),
        "items": [{"id": it.id, "song_id": it.song_id} for it in items],
    }


def clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name or "").strip()
    if not name:
        raise HTTPException(400, "El nombre no puede estar vacío")
    return name[:120]


def song_out(song: Song) -> SongOut:
    out = SongOut.model_validate(song)
    out.public_url = f"/songs/{song.id}/audio" if song.status == "ok" else None
    return out


# ==================== APP ====================

def create_app(cfg: Settings | None = None, downloader: Downloader | None = None,
               youtube: YouTube | None = None) -> FastAPI:
    cfg = cfg or default_settings
    cfg.ensure_dirs()
    engine = make_engine(cfg.db_path)
    init_db(engine, cfg.db_path)
    sessions = make_session_factory(engine)
    sync_file_status(sessions, cfg.music_dir)

    # yt-dlp.exe actualizable (app instalada) o librería de Python (desarrollo)
    ytdlp_exe = ytdlp_tool.prepare(cfg.ytdlp_bundled, cfg.ytdlp_path) if cfg.ytdlp_path else None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        app.state.downloader.shutdown()
        engine.dispose()

    app = FastAPI(title="DR Music Free API", version=VERSION, lifespan=lifespan)
    app.state.settings = cfg
    app.state.sessions = sessions
    app.state.ytdlp_exe = ytdlp_exe
    app.state.downloader = downloader or Downloader(
        sessions, cfg.music_dir, cfg.ffmpeg_path,
        exe_cmd=[str(ytdlp_exe)] if ytdlp_exe else None,
        js_runtime=cfg.ytdlp_js_runtime, exe_env=cfg.ytdlp_env,
    )
    app.state.youtube = youtube or YouTube(
        exe_cmd=[str(ytdlp_exe)] if ytdlp_exe else None,
        js_runtime=cfg.ytdlp_js_runtime, exe_env=cfg.ytdlp_env,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    # Se registra después de CORS para envolverlo y llegar también a las consultas previas
    @app.middleware("http")
    async def private_network_access(request: Request, call_next):
        # Chromium pide permiso explícito para que una página llame a 127.0.0.1
        response = await call_next(request)
        if request.headers.get("access-control-request-private-network"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

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
            if key == "genre":
                value = ensure_genre(db, value)
            setattr(song, key, value.strip() if isinstance(value, str) else value)
        db.commit()
        return song_out(song)

    @app.post("/songs/bulk", response_model=list[SongOut])
    def bulk_update(body: BulkPatch, db: Session = Depends(get_db)):
        """Cambia el género o el me gusta de varias canciones a la vez."""
        fields = body.model_dump(exclude_unset=True)
        values = {}
        if "genre" in fields:
            values["genre"] = ensure_genre(db, body.genre)
        if body.liked is not None:
            values["liked"] = body.liked
        if not values:
            raise HTTPException(400, "Nada que cambiar")
        ids = list(dict.fromkeys(body.song_ids))
        db.execute(update(Song).where(Song.id.in_(ids)).values(**values))
        db.commit()
        return [song_out(s) for s in db.scalars(select(Song).where(Song.id.in_(ids)).order_by(Song.id))]

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

    # ---------- géneros ----------
    def ensure_genre(db: Session, name: str | None) -> str | None:
        """Devuelve el nombre del género tal como está guardado; si no existe, lo crea."""
        if name is None or not name.strip():
            return None
        name = clean_name(name)
        existing = db.scalar(select(Genre).where(func.lower(Genre.name) == name.lower()))
        if existing:
            return existing.name
        pos = db.scalar(select(func.coalesce(func.max(Genre.position), -1))) + 1
        db.add(Genre(name=name, position=pos))
        db.flush()
        return name

    def genres_out(db: Session) -> list[dict]:
        counts = dict(db.execute(select(Song.genre, func.count(Song.id)).where(Song.genre.is_not(None))
                                 .group_by(Song.genre)).all())
        return [{"id": g.id, "name": g.name, "count": counts.get(g.name, 0)}
                for g in db.scalars(select(Genre).order_by(Genre.position, Genre.id))]

    @app.get("/genres/")
    def list_genres(db: Session = Depends(get_db)):
        return genres_out(db)

    @app.post("/genres/", status_code=201)
    def create_genre(body: NameIn, db: Session = Depends(get_db)):
        name = clean_name(body.name)
        if db.scalar(select(Genre).where(func.lower(Genre.name) == name.lower())):
            raise HTTPException(409, f"Ya existe el género «{name}»")
        ensure_genre(db, name)
        db.commit()
        return genres_out(db)

    @app.patch("/genres/{genre_id}")
    def rename_genre(genre_id: int, body: NameIn, db: Session = Depends(get_db)):
        genre = db.get(Genre, genre_id)
        if not genre:
            raise HTTPException(404, "Género no encontrado")
        name = clean_name(body.name)
        other = db.scalar(select(Genre).where(func.lower(Genre.name) == name.lower(), Genre.id != genre_id))
        if other:
            raise HTTPException(409, f"Ya existe el género «{name}»")
        db.execute(update(Song).where(Song.genre == genre.name).values(genre=name))
        genre.name = name
        db.commit()
        return genres_out(db)

    @app.delete("/genres/{genre_id}")
    def delete_genre(genre_id: int, db: Session = Depends(get_db)):
        genre = db.get(Genre, genre_id)
        if not genre:
            raise HTTPException(404, "Género no encontrado")
        db.execute(update(Song).where(Song.genre == genre.name).values(genre=None))
        db.delete(genre)
        db.commit()
        return genres_out(db)

    # ---------- listas de reproducción ----------
    def get_playlist_or_404(playlist_id: int, db: Session) -> Playlist:
        pl = db.get(Playlist, playlist_id)
        if not pl:
            raise HTTPException(404, "Lista no encontrada")
        return pl

    def items_of(db: Session, playlist_id: int) -> list[PlaylistItem]:
        return list(db.scalars(select(PlaylistItem).where(PlaylistItem.playlist_id == playlist_id)
                               .order_by(PlaylistItem.position, PlaylistItem.id)))

    def add_items(db: Session, pl: Playlist, song_ids: list[int]) -> tuple[int, int]:
        items = items_of(db, pl.id)
        have = {it.song_id for it in items}
        valid = set(db.scalars(select(Song.id).where(Song.id.in_(song_ids))))
        pos = (items[-1].position + 1) if items else 0
        added = 0
        for sid in dict.fromkeys(song_ids):
            if sid in have or sid not in valid:
                continue
            db.add(PlaylistItem(playlist_id=pl.id, song_id=sid, position=pos))
            pos += 1
            added += 1
        pl.updated_at = utcnow()
        return added, len(song_ids) - added

    @app.get("/playlists/")
    def list_playlists(db: Session = Depends(get_db)):
        pls = list(db.scalars(select(Playlist).order_by(Playlist.created_at, Playlist.id)))
        by_pl: dict[int, list[PlaylistItem]] = {p.id: [] for p in pls}
        for it in db.scalars(select(PlaylistItem).order_by(PlaylistItem.position, PlaylistItem.id)):
            by_pl.setdefault(it.playlist_id, []).append(it)
        return [playlist_out(p, by_pl[p.id]) for p in pls]

    @app.get("/playlists/{playlist_id}")
    def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        return playlist_out(pl, items_of(db, pl.id))

    @app.post("/playlists/", status_code=201)
    def create_playlist(body: PlaylistIn, db: Session = Depends(get_db)):
        pl = Playlist(name=clean_name(body.name))
        db.add(pl)
        db.flush()
        if body.song_ids:
            add_items(db, pl, body.song_ids)
        db.commit()
        return playlist_out(pl, items_of(db, pl.id))

    @app.patch("/playlists/{playlist_id}")
    def rename_playlist(playlist_id: int, body: NameIn, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        pl.name = clean_name(body.name)
        pl.updated_at = utcnow()
        db.commit()
        return playlist_out(pl, items_of(db, pl.id))

    @app.delete("/playlists/{playlist_id}")
    def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        db.execute(delete(PlaylistItem).where(PlaylistItem.playlist_id == pl.id))
        db.delete(pl)
        db.commit()
        return {"status": "success"}

    @app.post("/playlists/{playlist_id}/songs")
    def add_to_playlist(playlist_id: int, body: SongIdsIn, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        added, skipped = add_items(db, pl, body.song_ids)
        db.commit()
        return {"playlist": playlist_out(pl, items_of(db, pl.id)), "added": added, "skipped": skipped}

    @app.post("/playlists/{playlist_id}/remove")
    def remove_from_playlist(playlist_id: int, body: ItemIdsIn, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        db.execute(delete(PlaylistItem).where(PlaylistItem.playlist_id == pl.id,
                                              PlaylistItem.id.in_(body.item_ids)))
        pl.updated_at = utcnow()
        db.commit()
        return playlist_out(pl, items_of(db, pl.id))

    @app.put("/playlists/{playlist_id}/order")
    def reorder_playlist(playlist_id: int, body: ItemIdsIn, db: Session = Depends(get_db)):
        pl = get_playlist_or_404(playlist_id, db)
        items = {it.id: it for it in items_of(db, pl.id)}
        if sorted(body.item_ids) != sorted(items):
            raise HTTPException(409, "La lista cambió mientras la reordenabas; vuelve a intentarlo")
        for pos, item_id in enumerate(body.item_ids):
            items[item_id].position = pos
        pl.updated_at = utcnow()
        db.commit()
        return playlist_out(pl, items_of(db, pl.id))

    # ---------- YouTube en línea ----------
    def yt_error(exc: YouTubeError) -> JSONResponse:
        status = 503 if exc.kind == "offline" else 502
        log.warning("YouTube: %s (%s)", exc.message, exc.kind)  # queda en logs/backend.log
        return JSONResponse({"detail": exc.message, "kind": exc.kind}, status_code=status)

    def check_video_id(video_id: str) -> None:
        if not _VIDEO_ID.match(video_id):
            raise HTTPException(400, "Identificador de video no válido")

    @app.get("/youtube/status")
    def youtube_status(request: Request):
        return {"online": request.app.state.youtube.online()}

    @app.get("/youtube/search")
    def youtube_search(q: str, request: Request, limit: int = 12, db: Session = Depends(get_db)):
        q = q.strip()[:200]
        if len(q) < 2:
            return {"online": True, "results": []}
        yt = request.app.state.youtube
        if not yt.online():
            return {"online": False, "results": []}
        try:
            results = yt.search(q, min(max(limit, 1), 30))
        except YouTubeError as exc:
            if exc.kind == "offline":
                return {"online": False, "results": []}
            return yt_error(exc)
        ids = [r["youtube_id"] for r in results]
        local = dict(db.execute(select(Song.youtube_id, Song.id).where(Song.youtube_id.in_(ids),
                                                                     Song.status == "ok")).all())
        return {"online": True, "results": [{**r, "song_id": local.get(r["youtube_id"])} for r in results]}

    @app.get("/stream/{video_id}/info")
    def stream_info(video_id: str, request: Request, prefetch: bool = False):
        """Prepara el audio en línea (y sirve para saber por qué falló)."""
        check_video_id(video_id)
        try:
            st = request.app.state.youtube.resolve(video_id, background=prefetch)
        except YouTubeError as exc:
            if exc.kind == "busy":
                return JSONResponse({"ok": False, "busy": True}, status_code=202)
            return yt_error(exc)
        return {"ok": True, "title": st.title, "duration": st.duration, "mime": st.mime}

    @app.get("/stream/{video_id}")
    def stream_audio(video_id: str, request: Request):
        """Audio de YouTube sin descargarlo: se reenvía al reproductor por partes."""
        check_video_id(video_id)
        try:
            resp, st = request.app.state.youtube.open_stream(video_id, request.headers.get("range"))
        except YouTubeError as exc:
            return yt_error(exc)
        except Exception as exc:  # noqa: BLE001 - p. ej. 416 fuera de rango
            code = getattr(exc, "code", 502)
            log.warning("Audio en línea %s: %r", video_id, exc)
            return JSONResponse({"detail": str(exc)}, status_code=code if code == 416 else 502)

        headers = {"Accept-Ranges": "bytes", "Cache-Control": "no-store"}
        for name in ("Content-Length", "Content-Range"):
            if resp.headers.get(name):
                headers[name] = resp.headers[name]

        def body():
            try:
                while chunk := resp.read(64 * 1024):
                    yield chunk
            except OSError:
                pass  # el reproductor cerró la conexión (salto o cambio de canción)
            finally:
                resp.close()

        return StreamingResponse(body(), status_code=resp.status, headers=headers,
                                 media_type=resp.headers.get("Content-Type") or st.mime)

    # ---------- historial de reproducción ----------
    @app.post("/plays/", status_code=201)
    async def record_play(request: Request):
        # Se lee el cuerpo a mano: al cerrar la app llega por sendBeacon como text/plain
        try:
            body = PlayIn.model_validate(json.loads(await request.body() or b"{}"))
        except (ValueError, ValidationError) as exc:
            raise HTTPException(422, f"Datos de reproducción no válidos: {exc}") from exc

        if body.song_id is None and body.youtube_id is None:
            raise HTTPException(422, "Falta la canción")

        with request.app.state.sessions() as db:
            online = body.song_id is None
            if online:
                # si ya está en la biblioteca (p. ej. se descargó mientras sonaba), cuenta para ella
                song = db.scalar(select(Song).where(Song.youtube_id == body.youtube_id))
            else:
                song = get_song_or_404(body.song_id, db)
            duration = song.duration if song else body.duration
            listened = body.listened_seconds
            if duration:
                listened = min(listened, duration + 5)
            counted = counts_as_play(listened, duration)
            started = body.started_at if body.started_at.tzinfo else body.started_at.replace(tzinfo=timezone.utc)
            play = Play(
                song_id=song.id if song else None,
                song_title=song.title if song else (body.title or "Canción en línea"),
                song_artist=song.artist if song else body.artist,
                started_at=started, ended_at=utcnow(), listened_seconds=round(listened, 1),
                song_duration=duration, end_reason=body.end_reason,
                skipped=body.end_reason == "skipped", counted=counted,
                youtube_id=song.youtube_id if song else body.youtube_id, online=online,
            )
            db.add(play)
            if song:
                song.last_played_at = play.ended_at
                if counted:
                    song.play_count += 1
            db.commit()
            return {"play": PlayOut.model_validate(play).model_dump(mode="json"),
                    "song": song_out(song).model_dump(mode="json") if song else None}

    @app.get("/plays/", response_model=list[PlayOut])
    def list_plays(limit: int = 200, days: int | None = None, counted_only: bool = False,
                   db: Session = Depends(get_db)):
        q = select(Play).order_by(Play.started_at.desc()).limit(min(max(limit, 1), 5000))
        if days:
            q = q.where(Play.started_at >= utcnow() - timedelta(days=days))
        if counted_only:
            q = q.where(Play.counted.is_(True))
        return db.scalars(q).all()

    # ---------- sistema (Ajustes) ----------
    @app.get("/system/info")
    def system_info(request: Request):
        exe = request.app.state.ytdlp_exe
        ffmpeg_dir = cfg.ffmpeg_path
        return {
            "version": VERSION,
            "music_path": str(cfg.music_dir),
            "data_path": str(cfg.data_dir),
            "db_path": str(cfg.db_path),
            "ytdlp_version": ytdlp_tool.version(exe, fast=True),
            "ytdlp_mode": "exe" if exe else "module",
            "ytdlp_updatable": exe is not None,
            "ffmpeg_path": ffmpeg_dir or "PATH del sistema",
        }

    @app.post("/system/ytdlp/update")
    def update_ytdlp(request: Request):
        busy = [j for j in request.app.state.downloader.list() if j.status in ("queued", "downloading", "processing")]
        if busy:
            raise HTTPException(409, "Espera a que terminen las descargas en curso para actualizar yt-dlp")
        return ytdlp_tool.update(request.app.state.ytdlp_exe)

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


def _watch_parent(pid: int) -> None:
    """Si la app de escritorio se cierra de golpe, el servidor se apaga solo."""
    import threading
    import time

    def alive(p: int) -> bool:
        if os.name == "nt":
            import ctypes
            handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, p)  # QUERY_LIMITED_INFORMATION
            if not handle:
                return False
            code = ctypes.c_ulong()
            ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
            ctypes.windll.kernel32.CloseHandle(handle)
            return code.value == 259  # STILL_ACTIVE
        try:
            os.kill(p, 0)
            return True
        except OSError:
            return False

    def loop() -> None:
        while alive(pid):
            time.sleep(2)
        try:
            app.state.downloader.shutdown()
        finally:
            os._exit(0)

    threading.Thread(target=loop, daemon=True, name="parent-watch").start()


app = create_app()


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="Servidor de DR Music Free")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--parent-pid", type=int, default=None)
    args = parser.parse_args()
    if args.parent_pid:
        _watch_parent(args.parent_pid)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
