import yt_dlp
import os

def descargar_musica(url):
    # Usamos 'r' al principio para que Windows no se confunda con las barras \
    # He quitado la barra final para evitar el error de sintaxis
    output_folder = r'C:\Users\DanCode\Documents\mytube_music'  # esta es la ruta donde se guardaran las canciones descargadas
    
    # Creamos la carpeta si no existe
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    ydl_opts = {
        'format': 'bestaudio/best',
        'noplaylist': True,  # IMPORTANTE: Solo baja la canción del link, no la lista entera
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        # El nombre del archivo se guardará en esa carpeta
        'outtmpl': os.path.join(output_folder, '%(title)s.%(ext)s'),
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"--- Iniciando proceso para: {url} ---")
            ydl.download([url])
            print(f"--- ¡MP3 generado con éxito en: {output_folder} ---")
    except Exception as e:
        print(f"Error crítico: {e}")

if __name__ == "__main__":
    link = input("Introduce la URL de YouTube: ")
    descargar_musica(link)
