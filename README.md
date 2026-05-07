# DR Music Free

Aplicación para gestionar música local. Descarga, organiza y reproduce tu música sin depender de internet.

##  Aviso Legal

**Esta herramienta es para fines EDUCATIVOS y USO PERSONAL.**
- El usuario es el único responsable del uso que le dé
- No fomentamos la piratería
- No descargues contenido con derechos de autor sin permiso

##  Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Backend** | Python, FastAPI, SQLAlchemy, PostgreSQL |
| **Frontend** | React, Vite, Axios, Lucide Icons |
| **Motor** | yt-dlp, FFmpeg |

##  Características

- ✅ Descarga de audio de YouTube
- ✅ Biblioteca local con PostgreSQL
- ✅ Reproductor (play/pause/volumen)
- ✅ Barra de progreso interactiva
- ✅ Búsqueda en tiempo real
- ✅ Thumbnails de YouTube
- ✅ Navegación (Inicio/Buscar/Biblioteca)

##  Instalación rápida revisalo completo en github README

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload