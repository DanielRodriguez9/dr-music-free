"""Genera el icono de DR Music Free (icon.ico y icon.png) con Pillow.

Uso: python make_icon.py <carpeta_salida> [<otra_carpeta> ...]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # se dibuja grande y se reduce: bordes suaves


def gradient(size: int) -> Image.Image:
    top, bottom = (77, 188, 248), (27, 111, 181)  # acento claro -> azul profundo
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    return img


def make() -> Image.Image:
    base = gradient(256).resize((S, S), Image.BICUBIC)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(base, (0, 0), mask)

    # nota musical: misma forma que el logo de la app (rejilla de 24 px)
    d = ImageDraw.Draw(icon)
    k = S * 0.68 / 24
    ox, oy = S * 0.5 - 13 * k, S * 0.5 - 11.5 * k

    def p(x, y):
        return (ox + x * k, oy + y * k)

    w = int(2.4 * k)
    white = (255, 255, 255, 255)
    d.line([p(9, 18), p(9, 6), p(20, 4), p(20, 16)], fill=white, width=w, joint="curve")
    for cx, cy in ((6, 18), (17, 16)):
        r = 3.2 * k
        x, y = p(cx, cy)
        d.ellipse((x - r, y - r, x + r, y + r), fill=white)
    for x, y in (p(9, 6), p(20, 4)):  # extremos redondeados
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=white)
    return icon


if __name__ == "__main__":
    img = make()
    for out in map(Path, sys.argv[1:]):
        out.mkdir(parents=True, exist_ok=True)
        img.resize((512, 512), Image.LANCZOS).save(out / "icon.png")
        img.save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        print("icono ->", out)
