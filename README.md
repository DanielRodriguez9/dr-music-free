# 🎵 DR Music Free

Aplicación para gestionar música local. Descarga, organiza y reproduce tu música sin depender de internet.

![Versión](https://img.shields.io/badge/version-1.0.0-blue)
![Python](https://img.shields.io/badge/python-3.12-green)
![React](https://img.shields.io/badge/react-18-blue)
![FastAPI](https://img.shields.io/badge/fastapi-0.115-green)

---

## ⚠️ Aviso Legal

**Esta herramienta es para fines EDUCATIVOS y USO PERSONAL.**

- El usuario es el único responsable del uso que le dé
- No fomentamos la piratería
- No descargues contenido con derechos de autor sin permiso

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Backend** | Python, FastAPI, SQLAlchemy, PostgreSQL |
| **Frontend** | React, Vite, Axios, Lucide Icons |
| **Motor** | yt-dlp, FFmpeg |

---

## ✨ Características

| Funcionalidad | Estado |
|--------------|--------|
| Descarga de audio de YouTube | ✅ |
| Biblioteca local con PostgreSQL | ✅ |
| Reproductor (play/pause/volumen) | ✅ |
| Barra de progreso interactiva | ✅ |
| Búsqueda en tiempo real | ✅ |
| Thumbnails de YouTube | ✅ |
| Navegación (Inicio/Buscar/Biblioteca) | ✅ |
| Eliminar canciones | ✅ |
| Paginación | 🔄 Próximamente |
| Modo aleatorio (Shuffle) | 🔄 Próximamente |
| Playlists | 🔄 Próximamente |

---

## 🚀 Instalación

### Requisitos previos

- Python 3.12+
- Node.js 18+
- PostgreSQL 15+
- FFmpeg (instalado en el sistema)

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload



Frontend

cd frontend
npm install
npm run dev

Variables de entorno
Crea un archivo .env en backend/ con:

DB_HOST=localhost
DB_PORT=5432
DB_NAME=tu_base_datos
DB_USER=postgres
DB_PASSWORD=tu_contraseña



Estructura del proyecto

dr-music-free/
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── index.css
│   ├── package.json
│   └── README.md
└── README.md




Capturas de pantalla

Próximamente



Roadmap

v1.1.0 (Próxima versión)
Paginación en biblioteca

Botón "Ver todas" en inicio

Modo aleatorio (shuffle)

v1.2.0
Repetir canción (repeat)

Siguiente/Anterior automático

Eliminar canciones desde interfaz

v2.0.0
Playlists personalizadas

Exportar/Importar biblioteca

Modo claro/oscuro




-------------

 Autor
Daniel Rodríguez

GitHub: @DanielRodriguez9


---------------

Licencia
MIT - Uso personal y educativo.

-----------------

⭐ Si te gusta el proyecto, ¡dale una estrella!


-------------------
Contacto
¿Preguntas o sugerencias? Abre un Issue en GitHub o contáctame directamente.




