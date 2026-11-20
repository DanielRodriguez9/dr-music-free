# Pendientes

## Estado actual: versión 2.3.0

App de escritorio para Windows (Electron + servidor FastAPI empaquetado con PyInstaller + instalador NSIS).

| Versión | Qué trajo |
|---|---|
| 2.0.0 | App de escritorio con Electron, servidor empaquetado con PyInstaller e instalador NSIS |
| 2.1.0 | Listas de reproducción, géneros, búsqueda en YouTube y reproducción en línea |
| 2.2.0 | Páginas de artistas y álbumes, corrección automática de artistas (con revisión antes de aplicar), mixes automáticos en Inicio, carátulas guardadas en disco, importación de carpetas locales y saludo con nombre |
| 2.3.0 | Letras (LRCLIB, guardadas para usarlas sin internet), modo karaoke, fondo personalizado, bienvenida para usuarios nuevos y pantalla vacía con accesos directos |

Ya funciona:
- Biblioteca local en SQLite con cola, favoritas, historial de escuchas y atajos de teclado.
- Tests del servidor (pytest) y de la interfaz (Vitest), y lint sin errores.

## Hecho en la 2.3.0

- [x] **Letras** de la canción que está sonando, desde LRCLIB (gratis, sin clave). Sincronizadas: se resalta la línea, se desplazan solas y un clic salta a ese momento. Se guardan en `%APPDATA%\DR Music Free\lyrics` y funcionan sin internet y con canciones en línea. Tecla `T`. En la biblioteca de prueba (817 canciones) encontró letra para 350, 321 de ellas sincronizadas.
- [x] **Modo karaoke**: pantalla completa, letra grande con la línea actual resaltada y la siguiente en gris. Tecla `K`, `Esc` para salir.
- [x] **Fondo personalizado**: imagen propia o carátula de la canción actual, con intensidad, difuminado y color de acento tomado de la imagen.
- [x] **Bienvenida** la primera vez (nombre y carpeta de música), en lugar de la ventana suelta de "¿Dónde está tu música?".
- [x] Pantalla de biblioteca vacía con "Buscar en YouTube", "Importar carpeta" y "Pegar enlace".
- [x] Portadas de los mixes sin carátulas repetidas y títulos legibles.
- [x] Corregido el contador de carátulas guardadas ("1 de 0").

## Ideas futuras

- [ ] **Interfaz en inglés con selector de idioma.** Hoy todos los textos están en español.
- [ ] **Ecualizador o normalización de volumen.** Que todas las canciones suenen a un volumen parecido, y quizá un ecualizador con preajustes.
- [ ] **Mini reproductor.** Una ventana pequeña siempre visible con los controles básicos.
- [ ] **Descargar listas completas de YouTube.** Una lista o un álbum entero de una vez, con progreso por canción.
- [ ] **Sincronizar con el celular.** Llevar la biblioteca o algunas listas al teléfono.
