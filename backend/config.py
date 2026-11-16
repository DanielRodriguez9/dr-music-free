"""Configuración central: rutas de datos, música y base de datos.

Todo se puede sobreescribir con variables de entorno (o backend/.env):
  MUSIC_PATH   carpeta de música (relativa a backend/ o absoluta)
  DATA_DIR     carpeta de datos de la app (por defecto %APPDATA%/DR Music Free)
  DB_PATH      archivo SQLite (por defecto DATA_DIR/library.sqlite3)
  FFMPEG_PATH  carpeta bin de ffmpeg (si no, se busca en el PATH)
  CORS_ORIGINS orígenes permitidos separados por comas
  YTDLP_BUNDLED   yt-dlp.exe incluido en la app (solo app instalada)
  YTDLP_PATH      copia actualizable de yt-dlp.exe (por defecto DATA_DIR/bin/yt-dlp.exe)
  YTDLP_JS_RUNTIME motor JavaScript para YouTube, p. ej. "node:C:/ruta/DR Music Free.exe"
  YTDLP_RUN_AS_NODE=1  el motor es el ejecutable de Electron funcionando como Node
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")


def _resolve(value: str, base: Path) -> Path:
    p = Path(os.path.expandvars(os.path.expanduser(value)))
    return (p if p.is_absolute() else base / p).resolve()


def _default_data_dir() -> Path:
    appdata = os.getenv("APPDATA")
    root = Path(appdata) if appdata else Path.home() / ".local" / "share"
    return root / "DR Music Free"


class Settings:
    def __init__(self) -> None:
        self.music_dir = _resolve(os.getenv("MUSIC_PATH", "./music"), BACKEND_DIR)
        self.data_dir = _resolve(os.getenv("DATA_DIR", str(_default_data_dir())), BACKEND_DIR)
        self.db_path = _resolve(os.getenv("DB_PATH", str(self.data_dir / "library.sqlite3")), BACKEND_DIR)
        self.ffmpeg_path = os.getenv("FFMPEG_PATH") or None
        origins = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
        )
        self.cors_origins = [o.strip() for o in origins.split(",") if o.strip()]
        bundled = os.getenv("YTDLP_BUNDLED")
        self.ytdlp_bundled = Path(bundled) if bundled else None
        ytdlp = os.getenv("YTDLP_PATH")
        self.ytdlp_path = Path(ytdlp) if ytdlp else (self.data_dir / "bin" / "yt-dlp.exe" if bundled else None)
        self.ytdlp_js_runtime = os.getenv("YTDLP_JS_RUNTIME") or None
        self.ytdlp_env = {"ELECTRON_RUN_AS_NODE": "1"} if os.getenv("YTDLP_RUN_AS_NODE") == "1" else {}
        # tareas de fondo al arrancar (carátulas, carpetas importadas); los tests las apagan
        self.background = os.getenv("DRMUSIC_BACKGROUND", "1") == "1"

    def ensure_dirs(self) -> None:
        self.music_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)


settings = Settings()
