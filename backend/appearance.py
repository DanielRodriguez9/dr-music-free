"""Fondo personalizado: una imagen elegida por el usuario, guardada en DATA_DIR/appearance.

Se guarda ya reducida (1920 px como mucho, JPEG): la app la muestra oscurecida y difuminada,
así que no hace falta más resolución y se carga al instante.
"""
import io
from pathlib import Path

MAX_SIDE = 1920
MAX_BYTES = 40 * 1024 * 1024
FORMATS = {"JPEG", "PNG", "WEBP"}


class BackgroundError(ValueError):
    pass


class Background:
    def __init__(self, folder: Path):
        self.folder = folder
        self.file = folder / "background.jpg"

    def info(self) -> dict | None:
        if not self.file.is_file():
            return None
        st = self.file.stat()
        # la versión en la URL evita que se vea la imagen anterior guardada en caché
        return {"url": f"/appearance/background?v={st.st_mtime_ns}", "size_kb": round(st.st_size / 1024)}

    def save(self, data: bytes) -> dict:
        from PIL import Image, ImageOps
        if not data:
            raise BackgroundError("No llegó ninguna imagen")
        if len(data) > MAX_BYTES:
            raise BackgroundError("La imagen es demasiado grande (máximo 40 MB)")
        try:
            img = Image.open(io.BytesIO(data))
            fmt = img.format
            img.load()
        except Exception as exc:
            raise BackgroundError("El archivo no es una imagen válida") from exc
        if fmt not in FORMATS:
            raise BackgroundError("Usa una imagen JPG, PNG o WEBP")
        img = ImageOps.exif_transpose(img)  # fotos del celular: girarlas como se ven
        if img.mode in ("RGBA", "LA", "P"):
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (8, 9, 11))  # transparencias sobre el fondo de la app
            flat.paste(rgba, mask=rgba.getchannel("A"))
            img = flat
        else:
            img = img.convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=85, optimize=True, progressive=True)
        self.folder.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_suffix(".tmp")
        tmp.write_bytes(out.getvalue())
        tmp.replace(self.file)
        return {**self.info(), "width": img.width, "height": img.height}

    def remove(self) -> None:
        self.file.unlink(missing_ok=True)
