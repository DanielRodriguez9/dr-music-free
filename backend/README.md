# DR Music Free - Backend

API REST (FastAPI) para la biblioteca de música local y las descargas desde YouTube.

## Tecnologías

- **FastAPI** + **uvicorn** - API
- **SQLAlchemy** + **SQLite** - biblioteca (`%APPDATA%\DR Music Free\library.sqlite3`)
- **yt-dlp** + **FFmpeg** - descarga y conversión a MP3 (con carátula y metadatos incrustados)
- **mutagen** - duración de los archivos

## Puesta en marcha

```bash
python -m venv venv
venv\Scripts\pip install -r requirements-dev.txt
copy .env.example .env      # opcional: todas las variables tienen valor por defecto
venv\Scripts\python main.py # http://127.0.0.1:8000  (docs en /docs)
```

## Tests

```bash
venv\Scripts\python -m pytest
```

Los tests usan carpetas temporales: nunca tocan tu música ni tu base de datos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `main.py` | Endpoints de la API |
| `config.py` | Rutas y opciones (variables de entorno / `.env`) |
| `db.py` | Modelos y conexión SQLite |
| `library.py` | Enlaces de YouTube, título/artista, archivos de audio |
| `downloader.py` | Cola de descargas con progreso real |
| `migrate_from_postgres.py` | Migración única desde la antigua base PostgreSQL |

## Endpoints principales

- `GET /songs/` · `GET /songs/{id}` · `PATCH /songs/{id}` · `DELETE /songs/{id}`
- `GET /songs/{id}/audio` (admite rangos para poder adelantar)
- `POST /songs/{id}/play` (contador de reproducciones)
- `POST /downloads/` `{ "url": "..." }` → `GET /downloads/{job_id}` para ver el progreso
- `GET /stats/`
