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


def init_db(engine) -> None:
    Base.metadata.create_all(bind=engine)


def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
