# Pendientes

## Estado actual: versión 2.2.0

App de escritorio para Windows (Electron + servidor FastAPI empaquetado con PyInstaller + instalador NSIS).

| Versión | Qué trajo |
|---|---|
| 2.0.0 | App de escritorio con Electron, servidor empaquetado con PyInstaller e instalador NSIS |
| 2.1.0 | Listas de reproducción, géneros, búsqueda en YouTube y reproducción en línea |
| 2.2.0 | Páginas de artistas y álbumes, corrección automática de artistas (con revisión antes de aplicar), mixes automáticos en Inicio, carátulas guardadas en disco, importación de carpetas locales y saludo con nombre |

Ya funciona:
- Biblioteca local en SQLite con cola, favoritas, historial de escuchas y atajos de teclado.
- Tests del servidor (pytest) y de la interfaz (Vitest), y lint sin errores.

## Ideas futuras

- [ ] **Interfaz en inglés con selector de idioma.** Hoy todos los textos están en español.
- [ ] **Ecualizador o normalización de volumen.** Que todas las canciones suenen a un volumen parecido, y quizá un ecualizador con preajustes.
- [ ] **Letras** de la canción que está sonando.
- [ ] **Mini reproductor.** Una ventana pequeña siempre visible con los controles básicos.
- [ ] **Descargar listas completas de YouTube.** Una lista o un álbum entero de una vez, con progreso por canción.
- [ ] **Sincronizar con el celular.** Llevar la biblioteca o algunas listas al teléfono.
