"""Imita yt-dlp.exe para los tests: imprime progreso y el JSON final como el real."""
import json
import sys
from pathlib import Path

args = sys.argv[1:]
if args == ["--version"]:
    print("2026.01.01")
    sys.exit(0)
if args == ["-U"]:
    print("Updated yt-dlp to 2026.12.31")
    sys.exit(0)

url = args[0]
vid = url.split("v=")[1]
if vid.startswith("err"):
    print("ERROR: [youtube] " + vid + ": nsig extraction failed: Some formats may be missing")
    sys.exit(1)

outtmpl = args[args.index("-o") + 1]
print(f"[youtube] Extracting URL: {url}")
for done in (0, 50, 100):
    print(f"DRPROG {done} 100 NA", flush=True)
print("[ExtractAudio] Destination: x.mp3")
out = Path(outtmpl.replace("%(title)s", "Grupo - Canción ñ").replace("%(id)s", vid).replace("%(ext)s", "mp3"))
out.write_bytes(b"ID3" * 50)
info = {"id": vid, "title": "Grupo - Canción ñ", "uploader": "Canal", "duration": 61,
        "filepath": str(out), "requested_downloads": [{"filepath": str(out)}],
        "js": "--js-runtimes" in args and args[args.index("--js-runtimes") + 1]}
print("DRDONE " + json.dumps(info, ensure_ascii=False))
