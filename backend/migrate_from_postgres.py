"""Migra la biblioteca de PostgreSQL a SQLite sin tocar la carpeta de música.

Uso:
    python migrate_from_postgres.py            # simulación: muestra qué haría
    python migrate_from_postgres.py --apply    # escribe la base SQLite
    python migrate_from_postgres.py --apply --from-json respaldo.json

- Copia las filas originales tal cual a la tabla legacy_postgres_songs.
- Crea una canción por cada video de YouTube (quita duplicados por ID).
- Enlaza cada canción con su archivo; si no existe queda con status="missing"
  conservando el enlace para volver a descargarla.
- Importa como canciones locales los audios de la carpeta que no tenían fila.
Solo LEE la carpeta de música: no mueve, renombra ni borra archivos.
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select

from config import settings
from db import LegacyPostgresSong, Song, init_db, make_engine, make_session_factory
from library import (audio_duration, canonical_url, list_audio_files, parse_title,
                     thumbnail_for, youtube_id)


def read_postgres() -> list[dict]:
    import pg8000.dbapi  # solo hace falta para migrar

    conn = pg8000.dbapi.connect(
        user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT") or 5432),
        database=os.getenv("DB_NAME"),
    )
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, title, file_path, youtube_url FROM songs ORDER BY id")
        return [dict(id=r[0], title=r[1], file_path=r[2], youtube_url=r[3]) for r in cur.fetchall()]
    finally:
        conn.close()


def candidate_names(row: dict) -> list[str]:
    base = os.path.basename((row["file_path"] or "").replace("\\", "/"))
    stem = os.path.splitext(base)[0]
    names = [base] + [stem + ext for ext in (".mp3", ".m4a", ".webm", ".opus")]
    if row["title"]:
        t = row["title"].replace("/", "⧸")
        names += [t + ".mp3", t + ".webm"]
    seen, out = set(), []
    for n in names:
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def plan(rows: list[dict], music_dir: Path) -> dict:
    files = {p.name: p for p in list_audio_files(music_dir)}

    groups: dict[str, list[dict]] = defaultdict(list)
    no_id = []
    for r in rows:
        vid = youtube_id(r["youtube_url"])
        (groups[vid].append(r) if vid else no_id.append(r))

    # Archivo candidato para cada video
    wanted: dict[str, str | None] = {}
    for vid, rs in groups.items():
        wanted[vid] = next((n for r in sorted(rs, key=lambda r: -r["id"])
                            for n in candidate_names(r) if n in files), None)

    # Si dos videos distintos reclaman el mismo archivo, se lo queda el más reciente
    claims: dict[str, list[str]] = defaultdict(list)
    for vid, name in wanted.items():
        if name:
            claims[name].append(vid)
    conflicts = []
    for name, vids in claims.items():
        if len(vids) > 1:
            winner = max(vids, key=lambda v: max(r["id"] for r in groups[v]))
            for v in vids:
                if v != winner:
                    wanted[v] = None
                    conflicts.append((name, v, winner))

    songs = []
    for vid, rs in sorted(groups.items(), key=lambda kv: min(r["id"] for r in kv[1])):
        first = min(rs, key=lambda r: r["id"])
        songs.append(dict(vid=vid, row=first, dup_ids=[r["id"] for r in rs if r is not first],
                          filename=wanted[vid]))

    used = {s["filename"] for s in songs if s["filename"]}
    orphans = [files[n] for n in sorted(files) if n not in used]
    return dict(songs=songs, orphans=orphans, conflicts=conflicts, no_id=no_id)


def file_info(path: Path | None) -> dict:
    if not path or not path.exists():
        return dict(file_size=None, duration=None, created_at=None)
    st = path.stat()
    return dict(file_size=st.st_size, duration=audio_duration(path),
                created_at=datetime.fromtimestamp(st.st_mtime, timezone.utc))


def apply(rows: list[dict], p: dict, music_dir: Path, db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = make_engine(db_path)
    init_db(engine)
    sessions = make_session_factory(engine)
    with sessions() as db:
        if db.scalar(select(func.count(Song.id))) or db.scalar(select(func.count(LegacyPostgresSong.id))):
            sys.exit(f"❌ {db_path} ya tiene datos. Bórrala o renómbrala antes de volver a migrar.")

        db.add_all(LegacyPostgresSong(**r) for r in rows)

        for s in p["songs"]:
            r = s["row"]
            artist, title = parse_title(r["title"] or "")
            path = music_dir / s["filename"] if s["filename"] else None
            db.add(Song(
                title=title, artist=artist, original_title=r["title"],
                filename=s["filename"], source="youtube",
                status="ok" if s["filename"] else "missing",
                youtube_id=s["vid"], youtube_url=canonical_url(s["vid"]),
                thumbnail_url=thumbnail_for(s["vid"]), legacy_id=r["id"],
                **{k: v for k, v in file_info(path).items() if v is not None},
            ))

        for path in p["orphans"]:
            artist, title = parse_title(path.stem)
            db.add(Song(title=title, artist=artist, original_title=path.stem,
                        filename=path.name, source="local", status="ok",
                        **{k: v for k, v in file_info(path).items() if v is not None}))
        db.flush()

        # Las canciones sin archivo no tienen fecha propia: toman la de su vecina en Postgres
        dated = [(s.legacy_id, s.created_at) for s in db.scalars(
            select(Song).where(Song.status == "ok", Song.legacy_id.is_not(None)))]
        for song in db.scalars(select(Song).where(Song.status == "missing")):
            if dated:
                song.created_at = min(dated, key=lambda d: abs(d[0] - song.legacy_id))[1]
        db.commit()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="escribir la base SQLite (sin esto solo simula)")
    ap.add_argument("--from-json", type=Path, help="leer las filas de un respaldo JSON en vez de Postgres")
    args = ap.parse_args()

    rows = (json.loads(args.from_json.read_text(encoding="utf-8")) if args.from_json else read_postgres())
    music_dir, db_path = settings.music_dir, settings.db_path
    p = plan(rows, music_dir)

    ok = [s for s in p["songs"] if s["filename"]]
    missing = [s for s in p["songs"] if not s["filename"]]
    print(f"Origen: {'JSON ' + str(args.from_json) if args.from_json else 'PostgreSQL'}")
    print(f"Carpeta de música: {music_dir}")
    print(f"Base SQLite destino: {db_path}\n")
    print(f"Filas en Postgres:                 {len(rows)}")
    print(f"  duplicadas (mismo video):        {sum(len(s['dup_ids']) for s in p['songs'])}")
    print(f"  sin ID de YouTube:               {len(p['no_id'])}")
    print(f"Canciones de YouTube únicas:       {len(p['songs'])}")
    print(f"  con archivo:                     {len(ok)}")
    print(f"  sin archivo (se conserva link):  {len(missing)}")
    for s in missing:
        print(f"      - [{s['row']['id']}] {s['row']['title']}  ->  {canonical_url(s['vid'])}")
    for name, loser, winner in p["conflicts"]:
        print(f"      * '{name}' lo comparten {loser} y {winner}; se asigna a {winner}")
    print(f"Archivos sin fila (se importan como locales): {len(p['orphans'])}")
    for o in p["orphans"]:
        print(f"      + {o.name}")
    print(f"TOTAL canciones en SQLite:         {len(p['songs']) + len(p['orphans'])}")

    if p["no_id"]:
        sys.exit("❌ Hay filas sin ID de YouTube; revisa antes de migrar.")
    if not args.apply:
        print("\n(Simulación. Ejecuta con --apply para escribir la base de datos.)")
        return

    apply(rows, p, music_dir, db_path)
    engine = make_engine(db_path)
    with make_session_factory(engine)() as db:
        legacy = db.scalar(select(func.count(LegacyPostgresSong.id)))
        total = db.scalar(select(func.count(Song.id)))
        ids = set(db.scalars(select(Song.youtube_id)))
    lost = {youtube_id(r["youtube_url"]) for r in rows} - ids
    print(f"\n✅ Migración escrita. legacy_postgres_songs={legacy}, songs={total}, "
          f"enlaces de YouTube perdidos={len(lost)}")
    if lost or legacy != len(rows):
        sys.exit("❌ La verificación falló.")


if __name__ == "__main__":
    main()
