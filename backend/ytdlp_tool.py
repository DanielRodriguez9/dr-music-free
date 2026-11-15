"""yt-dlp.exe actualizable sin reinstalar la app.

La app trae una copia de yt-dlp.exe dentro de su carpeta de instalación (YTDLP_BUNDLED).
La primera vez se copia a la carpeta de datos (YTDLP_PATH), que sí se puede modificar;
desde ahí "yt-dlp -U" la actualiza. Si una versión nueva de la app trae un yt-dlp más
reciente que la copia, se reemplaza.
"""
import os
import shutil
import subprocess
from pathlib import Path

_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def _version_file(exe: Path) -> Path:
    return exe.with_suffix(".version")


def read_version_file(exe: Path) -> str | None:
    try:
        return _version_file(exe).read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def prepare(bundled: Path | None, target: Path) -> Path | None:
    """Deja una copia utilizable en `target`. Devuelve la ruta o None si no hay yt-dlp."""
    if bundled and bundled.is_file():
        bundled_ver = read_version_file(bundled)
        target_ver = read_version_file(target)
        # las versiones de yt-dlp son fechas AAAA.MM.DD: se comparan como texto
        if not target.is_file() or (bundled_ver and (not target_ver or bundled_ver > target_ver)):
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(bundled, target)
            if bundled_ver:
                _version_file(target).write_text(bundled_ver, encoding="utf-8")
    return target if target.is_file() else None


def _run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, creationflags=_FLAGS)


def version(exe: Path | None, fast: bool = False) -> str | None:
    """Versión de yt-dlp. Con fast=True usa el archivo .version (sin ejecutar nada)."""
    if fast and exe is not None:
        cached = read_version_file(exe)
        if cached:
            return cached
    if exe is None:
        try:
            import yt_dlp.version  # modo desarrollo
            return yt_dlp.version.__version__
        except ImportError:
            return None
    try:
        out = _run([str(exe), "--version"], timeout=60)
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def update(exe: Path | None) -> dict:
    """Ejecuta "yt-dlp -U". Devuelve {updated, before, after, output}."""
    if exe is None:
        return {"updated": False, "before": version(None), "after": version(None),
                "output": "En modo desarrollo yt-dlp se actualiza con: pip install -U yt-dlp"}
    before = version(exe)
    try:
        out = _run([str(exe), "-U"], timeout=300)
        output = (out.stdout + out.stderr).strip()
    except (OSError, subprocess.SubprocessError) as exc:
        return {"updated": False, "before": before, "after": before, "output": str(exc)}
    after = version(exe)
    if after:
        _version_file(exe).write_text(after, encoding="utf-8")
    return {"updated": bool(after and after != before), "before": before, "after": after, "output": output[-2000:]}
