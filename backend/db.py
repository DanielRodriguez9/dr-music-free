"""Base de datos SQLite (SQLAlchemy 2) y modelos."""
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (Boolean, DateTime, Float, ForeignKey, Integer, String,
                        Text, TypeDecorator, create_engine, event)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Fecha y hora siempre en UTC.

    SQLite no guarda la zona horaria: se almacena en UTC sin zona y al leer se
    marca como UTC, para que la API envíe "...+00:00" y el navegador la muestre
    en la hora local del equipo.
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:  # sin zona: se asume que ya es UTC
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


class Base(DeclarativeBase):
    pass


class Folder(Base):
    """Carpeta de música importada (los archivos se quedan donde están)."""
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    added_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    scanned_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    artist: Mapped[str | None] = mapped_column(String, index=True)
    album: Mapped[str | None] = mapped_column(String, index=True)
    original_title: Mapped[str | None] = mapped_column(String)  # título tal cual en YouTube
    duration: Mapped[float | None] = mapped_column(Float)  # segundos
    filename: Mapped[str | None] = mapped_column(String, index=True)  # relativo a la carpeta de música
    file_size: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String, default="youtube")  # youtube | local
    status: Mapped[str] = mapped_column(String, default="ok")  # ok | missing
    youtube_id: Mapped[str | None] = mapped_column(String(11), unique=True, index=True)
    genre: Mapped[str | None] = mapped_column(String, index=True)
    channel: Mapped[str | None] = mapped_column(String)  # canal de YouTube (para deducir el artista)
    # canciones importadas de otra carpeta: filename es relativo a esa carpeta
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"), index=True)
    track_no: Mapped[int | None] = mapped_column(Integer)
    youtube_url: Mapped[str | None] = mapped_column(String)
    thumbnail_url: Mapped[str | None] = mapped_column(String)
    liked: Mapped[bool] = mapped_column(Boolean, default=False)
    play_count: Mapped[int] = mapped_column(Integer, default=0)
    last_played_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    legacy_id: Mapped[int | None] = mapped_column(Integer)  # id original en Postgres


class Play(Base):
    """Una escucha. Cuenta como reproducción si se oyó al menos la mitad o 30 s."""
    __tablename__ = "plays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Si se borra la canción, el historial se conserva con el título guardado
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"), index=True)
    song_title: Mapped[str | None] = mapped_column(String)
    song_artist: Mapped[str | None] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    ended_at: Mapped[datetime] = mapped_column(UTCDateTime)
    listened_seconds: Mapped[float] = mapped_column(Float)
    song_duration: Mapped[float | None] = mapped_column(Float)
    end_reason: Mapped[str] = mapped_column(String)  # ended | skipped | closed
    skipped: Mapped[bool] = mapped_column(Boolean, default=False)
    counted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # escuchas en línea (sin descargar): se guarda el video de YouTube
    youtube_id: Mapped[str | None] = mapped_column(String(11), index=True)
    online: Mapped[bool] = mapped_column(Boolean, default=False)


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    playlist_id: Mapped[int] = mapped_column(ForeignKey("playlists.id", ondelete="CASCADE"), index=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    added_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Meta(Base):
    """Pares clave/valor internos (p. ej. si ya se crearon los géneros iniciales)."""
    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str | None] = mapped_column(String)


DEFAULT_GENRES = ["Salsa", "Reguetón", "Vallenato", "Electrónica", "Popular", "Pop", "Rap"]


COUNT_MIN_SECONDS = 30


def counts_as_play(listened: float, duration: float | None) -> bool:
    threshold = COUNT_MIN_SECONDS if not duration else min(COUNT_MIN_SECONDS, duration / 2)
    return listened >= threshold


class LegacyPostgresSong(Base):
    """Copia literal de la tabla `songs` de Postgres (respaldo, no se usa en la app)."""
    __tablename__ = "legacy_postgres_songs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(Text)
    youtube_url: Mapped[str | None] = mapped_column(Text)


def make_engine(db_path: Path):
    engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    return engine


# Columnas añadidas después de la primera versión: (tabla, columna, definición SQL)
_NEW_COLUMNS = [
    ("songs", "genre", "VARCHAR"),
    ("songs", "channel", "VARCHAR"),
    ("songs", "folder_id", "INTEGER REFERENCES folders(id) ON DELETE SET NULL"),
    ("songs", "track_no", "INTEGER"),
    ("plays", "youtube_id", "VARCHAR(11)"),
    ("plays", "online", "BOOLEAN NOT NULL DEFAULT 0"),
]


def _missing_columns(engine) -> list[tuple[str, str, str]]:
    from sqlalchemy import inspect
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    missing = []
    for table, column, ddl in _NEW_COLUMNS:
        if table in tables and column not in {c["name"] for c in insp.get_columns(table)}:
            missing.append((table, column, ddl))
    return missing


def backup_database(db_path: Path, label: str) -> Path | None:
    """Copia coherente de la base (API de respaldo de SQLite) en DATA_DIR/backups."""
    import sqlite3
    if not db_path.is_file():
        return None
    folder = db_path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{db_path.stem}-{label}-{datetime.now():%Y%m%d-%H%M%S}.sqlite3"
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()
    return target


def init_db(engine, db_path: Path | None = None) -> Path | None:
    """Crea las tablas y añade las columnas nuevas. Antes de modificar una base existente
    guarda una copia en DATA_DIR/backups. Devuelve la ruta de esa copia (o None)."""
    from sqlalchemy import inspect, text
    backup = None
    existing = set(inspect(engine).get_table_names())
    missing = _missing_columns(engine)
    new_tables = {t.name for t in Base.metadata.sorted_tables} - existing
    if db_path and existing and (missing or new_tables):
        backup = backup_database(db_path, "antes-de-actualizar")
    Base.metadata.create_all(bind=engine)
    if missing:
        with engine.begin() as conn:
            for table, column, ddl in missing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    _seed_genres(engine)
    return backup


def _seed_genres(engine) -> None:
    """Crea los géneros iniciales una sola vez (si luego se borran, no vuelven)."""
    from sqlalchemy.orm import Session
    with Session(engine) as db:
        if db.get(Meta, "genres_seeded"):
            return
        have = {g.name for g in db.query(Genre)}
        for i, name in enumerate(DEFAULT_GENRES):
            if name not in have:
                db.add(Genre(name=name, position=i))
        db.add(Meta(key="genres_seeded", value="1"))
        db.commit()


def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
