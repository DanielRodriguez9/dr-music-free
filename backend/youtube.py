"""YouTube en línea: búsqueda y audio sin descargar, con yt-dlp (sin API key).

- search(q): resultados de "ytsearch" en modo plano (rápido, sin resolver cada video).
- resolve(id): dirección del audio en los servidores de YouTube (caduca en unas horas).
- open_stream(id, range): abre ese audio para reenviarlo al reproductor (admite saltos).

Funciona con yt-dlp.exe (app instalada) o con la librería de Python (desarrollo).
"""
import http.client
import json
import os
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable
from urllib.parse import parse_qs, urlparse

from downloader import classify_error, clean_error
from library import canonical_url, parse_title, thumbnail_for

AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio/best"
SEARCH_TTL = 600  # s
ERROR_TTL = 20  # s: no reintentar en bucle un video que falla
_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


class YouTubeError(Exception):
    def __init__(self, message: str, kind: str | None = None):
        super().__init__(message)
        self.message = message
        self.kind = kind  # "outdated" | "offline" | "unavailable" | None


@dataclass
class Stream:
    url: str
    headers: dict
    mime: str
    expires: float
    title: str | None = None
    duration: float | None = None
    # algunas direcciones (cliente TV de YouTube) solo valen unos segundos después de
    # obtenerlas; antes responden 403. yt-dlp también espera ("Sleeping ... as required").
    available_at: float = 0.0


def _expiry(url: str) -> float:
    try:
        exp = float(parse_qs(urlparse(url).query)["expire"][0])
    except (KeyError, ValueError, IndexError):
        exp = time.time() + 3600
    return min(exp, time.time() + 5 * 3600) - 120


def _mime(ext: str | None) -> str:
    return {"m4a": "audio/mp4", "mp4": "audio/mp4", "webm": "audio/webm", "opus": "audio/ogg"}.get(ext or "", "audio/mpeg")


def connect_prefer_ipv4(address, timeout=None, source_address=None, attempt_timeout: float = 4.0):
    """Como socket.create_connection, pero prueba primero IPv4 y con un tiempo límite corto
    por intento. En algunas redes el IPv6 hacia ciertos servidores de YouTube no responde y
    Windows tarda 21 s en rendirse antes de probar IPv4 (Chromium y yt-dlp no lo notan)."""
    host, port = address
    infos = socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM)
    infos.sort(key=lambda i: 0 if i[0] == socket.AF_INET else 1)
    last = None
    for family, type_, proto, _, sockaddr in infos:
        sock = socket.socket(family, type_, proto)
        try:
            sock.settimeout(min(attempt_timeout, timeout) if timeout else attempt_timeout)
            if source_address:
                sock.bind(source_address)
            sock.connect(sockaddr)
            sock.settimeout(timeout)
            return sock
        except OSError as exc:
            last = exc
            sock.close()
    raise last or OSError(f"No se pudo conectar con {host}")


class _HTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = connect_prefer_ipv4


class _HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_HTTPSConnection, req, context=self._context)


_opener = urllib.request.build_opener(_HTTPSHandler())


def open_url(req, timeout=30):
    return _opener.open(req, timeout=timeout)


def is_online(timeout: float = 2.5) -> bool:
    try:
        with connect_prefer_ipv4(("www.youtube.com", 443), timeout=timeout, attempt_timeout=timeout):
            return True
    except OSError:
        return False


def result_from_entry(entry: dict) -> dict | None:
    vid = entry.get("id")
    if not vid or len(vid) != 11 or entry.get("ie_key") not in (None, "Youtube"):
        return None
    if entry.get("live_status") in ("is_live", "is_upcoming"):
        return None
    channel = entry.get("channel") or entry.get("uploader")
    raw = entry.get("title") or ""
    artist, title = parse_title(raw, channel)
    return {
        "youtube_id": vid,
        "title": title,
        "artist": artist,
        "raw_title": raw,
        "channel": channel,
        "duration": entry.get("duration"),
        "thumbnail_url": thumbnail_for(vid),
        "url": canonical_url(vid),
    }


class YouTube:
    def __init__(self, exe_cmd: list[str] | None = None, js_runtime: str | None = None,
                 exe_env: dict | None = None, ydl_factory: Callable | None = None,
                 opener: Callable | None = None):
        self._exe_cmd = exe_cmd
        self._js_runtime = js_runtime
        self._exe_env = exe_env or {}
        self._ydl_factory = ydl_factory
        self._open = opener or open_url
        self._streams: dict[str, Stream] = {}
        self._errors: dict[str, tuple[float, YouTubeError]] = {}
        self._searches: dict[str, tuple[float, list]] = {}
        self._locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        self._active = 0  # resoluciones en curso (cada una es un yt-dlp trabajando)
        self._online: tuple[float, bool] = (0.0, True)

    # ---------- conexión ----------
    def online(self) -> bool:
        checked, value = self._online
        if time.time() - checked > 15:
            value = is_online()
            self._online = (time.time(), value)
        return value

    # ---------- ejecutar yt-dlp ----------
    def _run_exe(self, args: list[str], timeout: int) -> dict:
        env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", **self._exe_env}
        try:
            out = subprocess.run([*self._exe_cmd, *args], capture_output=True, text=True, encoding="utf-8",
                                 errors="replace", timeout=timeout, env=env, creationflags=_FLAGS)
        except subprocess.TimeoutExpired as exc:
            raise YouTubeError("YouTube tardó demasiado en responder") from exc
        if out.returncode != 0 or not out.stdout.strip():
            lines = [ln for ln in out.stderr.splitlines() if ln.startswith("ERROR")] or out.stderr.splitlines()[-1:]
            raise YouTubeError(clean_error(lines[-1] if lines else f"yt-dlp terminó con código {out.returncode}"))
        return json.loads(out.stdout.strip().splitlines()[-1])

    def _ydl(self, opts: dict):
        factory = self._ydl_factory
        if factory is None:
            import yt_dlp
            factory = yt_dlp.YoutubeDL
        return factory({"quiet": True, "no_warnings": True, "noprogress": True, **opts})

    def _wrap(self, fn):
        try:
            return fn()
        except YouTubeError as exc:
            raise self._classified(exc.message) from exc
        except Exception as exc:  # noqa: BLE001 - errores de yt-dlp
            raise self._classified(clean_error(str(exc))) from exc

    def _classified(self, message: str) -> YouTubeError:
        low = message.lower()
        if any(w in low for w in ("getaddrinfo", "failed to resolve", "network is unreachable",
                                  "no address associated", "timed out", "connection refused",
                                  "urlopen error", "tardó demasiado")):
            if not is_online():
                self._online = (time.time(), False)
                return YouTubeError("Sin conexión a internet", "offline")
        if any(w in low for w in ("unavailable", "private video", "has been removed", "not available in your country",
                                  "sign in to confirm your age", "age-restricted", "members-only", "copyright")):
            return YouTubeError(message, "unavailable")
        return YouTubeError(message, classify_error(message))

    # ---------- búsqueda ----------
    def search(self, query: str, limit: int = 12) -> list[dict]:
        key = f"{limit}:{query.strip().lower()}"
        cached = self._searches.get(key)
        if cached and time.time() - cached[0] < SEARCH_TTL:
            return cached[1]
        target = f"ytsearch{limit}:{query.strip()}"

        def run():
            if self._exe_cmd:
                return self._run_exe([target, "--flat-playlist", "-J", "--no-warnings", "--ignore-config"], 60)
            with self._ydl({"extract_flat": "in_playlist", "skip_download": True}) as ydl:
                return ydl.extract_info(target, download=False)

        info = self._wrap(run)
        results = [r for r in (result_from_entry(e) for e in info.get("entries") or [] if e) if r]
        self._searches[key] = (time.time(), results)
        if len(self._searches) > 100:
            self._searches.pop(next(iter(self._searches)))
        return results

    # ---------- audio en línea ----------
    def resolve(self, video_id: str, fresh: bool = False, background: bool = False) -> Stream:
        """background=True: precarga (al pasar el ratón). Si ya hay un yt-dlp trabajando no se
        lanza otro, para no competir por la CPU con lo que el usuario pidió escuchar."""
        cached = self._streams.get(video_id)
        if background and not fresh and cached and cached.expires > time.time():
            return cached
        with self._lock:
            if background and self._active:
                raise YouTubeError("Ocupado preparando otro audio", "busy")
            lock = self._locks.setdefault(video_id, threading.Lock())
        with lock:  # dos peticiones a la vez del mismo video: una sola llamada a yt-dlp
            cached = self._streams.get(video_id)
            if cached and not fresh and cached.expires > time.time():
                return cached
            err = self._errors.get(video_id)
            if err and not fresh and time.time() - err[0] < ERROR_TTL:
                raise err[1]
            with self._lock:
                self._active += 1
            try:
                stream = self._wrap(lambda: self._resolve(video_id))
            except YouTubeError as exc:
                self._errors[video_id] = (time.time(), exc)
                raise
            finally:
                with self._lock:
                    self._active -= 1
            self._errors.pop(video_id, None)
            self._streams[video_id] = stream
            return stream

    def _resolve(self, video_id: str) -> Stream:
        url = canonical_url(video_id)
        if self._exe_cmd:
            args = [url, "-f", AUDIO_FORMAT, "-J", "--no-playlist", "--no-warnings", "--ignore-config"]
            if self._js_runtime:
                args += ["--js-runtimes", self._js_runtime]
            info = self._run_exe(args, 90)
        else:
            with self._ydl({"format": AUDIO_FORMAT, "noplaylist": True}) as ydl:
                info = ydl.extract_info(url, download=False)
        fmt = info
        if not fmt.get("url"):
            fmt = next((f for f in info.get("requested_formats") or [] if f.get("url")), None)
            if fmt is None:
                wanted = info.get("format_id")
                fmt = next((f for f in info.get("formats") or [] if f.get("format_id") == wanted and f.get("url")), None)
        if not fmt or not fmt.get("url"):
            raise YouTubeError("yt-dlp no devolvió el audio del video", "outdated")
        return Stream(url=fmt["url"], headers=dict(fmt.get("http_headers") or info.get("http_headers") or {}),
                      mime=_mime(fmt.get("ext") or fmt.get("audio_ext")), expires=_expiry(fmt["url"]),
                      title=info.get("title"), duration=info.get("duration"),
                      available_at=float(fmt.get("available_at") or info.get("available_at") or 0))

    def last_error(self, video_id: str) -> YouTubeError | None:
        err = self._errors.get(video_id)
        return err[1] if err else None

    def open_stream(self, video_id: str, range_header: str | None):
        """Abre el audio en YouTube. Devuelve (respuesta, Stream).

        Espera a que la dirección esté lista (available_at); si aun así responde 403, reintenta
        la misma tras 2 s y, si sigue fallando (o caducó), la pide de nuevo a yt-dlp.
        """
        for attempt in range(3):
            stream = self.resolve(video_id, fresh=attempt == 2)
            wait = stream.available_at - time.time()
            if wait > 0:
                time.sleep(min(wait + 0.3, 15))
            headers = {k: v for k, v in stream.headers.items() if k.lower() not in ("range", "accept-encoding")}
            if range_header:
                headers["Range"] = range_header
            req = urllib.request.Request(stream.url, headers=headers)
            try:
                return self._open(req, timeout=30), stream
            except urllib.error.HTTPError as exc:
                if exc.code == 416:
                    raise
                if attempt == 0 and exc.code == 403:
                    time.sleep(2)  # la dirección aún no estaba lista: se reintenta la misma
                    continue
                if attempt < 2 and exc.code in (403, 404, 410):
                    self._streams.pop(video_id, None)
                    continue
                error = YouTubeError(f"YouTube rechazó el audio (HTTP {exc.code})", "outdated")
                self._errors[video_id] = (time.time(), error)
                raise error from exc
            except (urllib.error.URLError, OSError) as exc:
                raise self._classified(str(exc)) from exc
        raise YouTubeError("No se pudo abrir el audio", "outdated")
