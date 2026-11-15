# DR Music Free - Backend API
# Creado por Daniel Rodríguez
# Descarga música de YouTube y gestiona biblioteca local

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import yt_dlp
import os
from dotenv import load_dotenv
import urllib.parse
import re
from database import SessionLocal, Song, init_db

# ==================== CONFIGURACIÓN INICIAL ====================

load_dotenv()

app = FastAPI(
    title="DR Music Free API",
    description="Música gratis sin anuncios - Creado por Daniel Rodríguez",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

MUSIC_PATH = os.getenv("MUSIC_PATH", "./music")
os.makedirs(MUSIC_PATH, exist_ok=True)

app.mount("/music", StaticFiles(directory=MUSIC_PATH), name="music")

# ==================== DEPENDENCIAS ====================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==================== ENDPOINTS ====================

@app.get("/")
def home():
    return {
        "message": "🎵 DR Music Free API funcionando!",
        "version": "1.0.0",
        "author": "Daniel Rodríguez"
    }


@app.post("/download/")
def download_song(url: str, db: Session = Depends(get_db)):

    if not ("youtube.com" in url or "youtu.be" in url):
        raise HTTPException(400, "Solo se permiten URLs de YouTube")

    existing_song = db.query(Song).filter(Song.youtube_url == url).first()
    if existing_song:
        return {
            "status": "exists",
            "message": "La canción ya existe en la biblioteca",
            "song": existing_song.title
        }

    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'ffmpeg_location': r'C:\ffmpeg\ffmpeg-8.1.1-essentials_build\bin',
        
        # Configuración robusta para evitar 403
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Sec-Fetch-Mode': 'navigate',
            'Referer': 'https://www.youtube.com/',
        },
        'extractor_args': {
            'youtube': {
                'player_client': ['web', 'mweb', 'ios', 'android'],
                'player_skip': ['player_response', 'inner_streaming'],
            }
        },
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'postprocessor_args': ['-ar', '44100'],
        'outtmpl': os.path.join(MUSIC_PATH, '%(title)s.%(ext)s'),
        'quiet': False,  # Cambiado a False para ver errores
        'no_warnings': False,
        'force_generic_extractor': True,  # A veces ayuda a evitar bloqueos
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            original_filename = ydl.prepare_filename(info)
            filename = os.path.splitext(original_filename)[0] + ".mp3"

            # Debug: imprime la ruta para verificar
            print(f"Archivo MP3 esperado: {filename}")
            print(f"¿Existe? {os.path.exists(filename)}")

            new_song = Song(
                title=info.get('title'),
                file_path=filename,
                youtube_url=url
            )
            db.add(new_song)
            db.commit()
            db.refresh(new_song)

            return {
                "status": "success",
                "song": info.get('title'),
                "id": new_song.id,
                "filename": os.path.basename(filename)
            }
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(500, detail=str(e))

@app.get("/songs/")
def list_songs(db: Session = Depends(get_db)):
    songs = db.query(Song).all()
    for song in songs:
        filename = os.path.basename(song.file_path)
        song.public_url = f"/music/{urllib.parse.quote(filename)}"
    return songs

@app.get("/songs/{song_id}")
def get_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(404, "Canción no encontrada")
    filename = os.path.basename(song.file_path)
    song.public_url = f"/music/{urllib.parse.quote(filename)}"
    return song

@app.delete("/songs/{song_id}")
def delete_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(404, "Canción no encontrada")
    if os.path.exists(song.file_path):
        os.remove(song.file_path)
    db.delete(song)
    db.commit()
    return {"status": "success", "message": "Canción eliminada"}

@app.get("/thumb/{song_id}")
def get_thumbnail(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(404, "Canción no encontrada")
    youtube_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11})', song.youtube_url)
    if youtube_id_match:
        youtube_id = youtube_id_match.group(1)
        return {"thumbnail_url": f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"}
    return {"thumbnail_url": None}

@app.get("/stats/")
def get_stats(db: Session = Depends(get_db)):
    total_songs = db.query(Song).count()
    total_size = 0
    for song in db.query(Song).all():
        if os.path.exists(song.file_path):
            total_size += os.path.getsize(song.file_path)
    return {
        "total_songs": total_songs,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "music_path": MUSIC_PATH
    }