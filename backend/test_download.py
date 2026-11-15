import yt_dlp
import os

def descargar_musica(url):
    # Ruta donde se guardan las canciones
    output_folder = os.getenv("MUSIC_PATH", "./music")
    
    # Creamos la carpeta si no existe
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        # AÑADIDO: Headers para simular un navegador real y evitar el 403
        'headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Referer': 'https://www.youtube.com/',
        },
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
        'quiet': False,  # Para ver logs detallados
        'no_warnings': False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"--- Iniciando proceso para: {url} ---")
            # Extraemos primero la info para ver el título antes de descargar
            info = ydl.extract_info(url, download=False)
            print(f"Canción detectada: {info.get('title')}")
            
            ydl.download([url])
            print(f"--- ¡MP3 generado con éxito en: {output_folder} ---")
    except Exception as e:
        print(f"❌ Error crítico: {e}")
        print("Verifica que FFmpeg esté instalado y en tu PATH.")

if __name__ == "__main__":
    link = input("Introduce la URL de YouTube: ")
    descargar_musica(link)