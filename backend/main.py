# DR Music Free - Backend API
# Creado por Daniel Rodríguez
# Descarga música de YouTube y gestiona biblioteca local

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import yt_dlp
import os
import urllib.parse
import re
from database import SessionLocal, Song, init_db

# ==================== CONFIGURACIÓN INICIAL ====================

app = FastAPI(
    title="DR Music Free API",
    description="Música gratis sin anuncios - Creado por Daniel Rodríguez",
    version="1.0.0"
)

# CORS - Permite conexión desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inicializar base de datos
init_db()

# Ruta donde se guardan las canciones
MUSIC_PATH = r'C:\Users\DanCode\Documents\mytube_music'
os.makedirs(MUSIC_PATH, exist_ok=True)

# Servir archivos MP3 estáticamente
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
    """Descarga una canción de YouTube y la guarda en la biblioteca"""
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(MUSIC_PATH, '%(title)s.%(ext)s'),
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info).replace(".webm", ".mp3").replace(".m4a", ".mp3")
            
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/songs/")
def list_songs(db: Session = Depends(get_db)):
    """Lista todas las canciones de la biblioteca"""
    
    songs = db.query(Song).all()
    
    for song in songs:
        filename = os.path.basename(song.file_path)
        song.public_url = f"/music/{urllib.parse.quote(filename)}"
    
    return songs

@app.get("/songs/{song_id}")
def get_song(song_id: int, db: Session = Depends(get_db)):
    """Obtiene los detalles de una canción específica"""
    
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Canción no encontrada")
    
    filename = os.path.basename(song.file_path)
    song.public_url = f"/music/{urllib.parse.quote(filename)}"
    
    return song

@app.delete("/songs/{song_id}")
def delete_song(song_id: int, db: Session = Depends(get_db)):
    """Elimina una canción de la biblioteca y del disco"""
    
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Canción no encontrada")
    
    # Eliminar archivo físico
    if os.path.exists(song.file_path):
        os.remove(song.file_path)
    
    # Eliminar de la base de datos
    db.delete(song)
    db.commit()
    
    return {"status": "success", "message": "Canción eliminada"}

@app.get("/thumb/{song_id}")
def get_thumbnail(song_id: int, db: Session = Depends(get_db)):
    """Obtiene la miniatura de YouTube de una canción"""
    
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Canción no encontrada")
    
    # Extraer ID de YouTube de la URL
    youtube_id_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11})', song.youtube_url)
    if youtube_id_match:
        youtube_id = youtube_id_match.group(1)
        return {"thumbnail_url": f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"}
    return {"thumbnail_url": None}

@app.get("/stats/")
def get_stats(db: Session = Depends(get_db)):
    """Estadísticas de la biblioteca"""
    
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