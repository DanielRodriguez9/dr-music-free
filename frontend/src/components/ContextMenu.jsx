import {
  Check, ChevronLeft, ChevronRight, CloudDownload, Download, ExternalLink, Heart, HeartOff, ListEnd, ListMinus,
  Disc3, ListMusic, ListPlus, ListStart, Pause, Pencil, Play, Plus, RotateCw, Tag, Trash2, User,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { errorMessage, isOnline, isPlayable } from "../api";
import { albumKey, artistKey, splitArtists } from "../lib/artists";
import { useCollections, usePlayer, useUI } from "../context/hooks";
import useSongActions from "../hooks/useSongActions";

const countLabel = (n) => (n === 1 ? "1 canción" : `${n.toLocaleString("es")} canciones`);

function Item({ icon, label, onClick, danger = false, disabled = false, checked = false, submenu = false, close }) {
  return (
    <button
      type="button"
      role={checked !== false ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checked !== false ? Boolean(checked) : undefined}
      className={`menu__item ${danger ? "menu__item--danger" : ""} ${checked ? "is-checked" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!submenu) close();
        onClick();
      }}
    >
      {icon}
      <span className="menu__label">{label}</span>
      {checked && <Check size={16} className="menu__check" />}
      {submenu && <ChevronRight size={16} className="menu__chevron" />}
    </button>
  );
}

/** Páginas del menú de una o varias canciones: principal, "Añadir a lista" y "Género". */
function SongMenu({ menu, close }) {
  const { song, context = {} } = menu;
  const player = usePlayer();
  const actions = useSongActions();
  const { playlists, genres, playlistById } = useCollections();
  const { navigate } = useUI();
  const [page, setPage] = useState(context.page || "main");

  const selection = context.selection?.length > 1 ? context.selection : null;
  const targets = selection ?? [song];
  const playlist = context.playlistId ? playlistById.get(context.playlistId) : null;
  const item = (icon, label, onClick, opts) => <Item icon={icon} label={label} onClick={onClick} close={close} {...opts} />;
  const back = (title) => (
    <button type="button" className="menu__back" onClick={() => setPage("main")}>
      <ChevronLeft size={16} /> {title}
    </button>
  );

  if (page === "playlists") {
    const others = playlists.filter((p) => p.id !== context.playlistId);
    return (
      <>
        {context.page !== "playlists" ? back("Añadir a una lista") : <p className="menu__title">Añadir a una lista</p>}
        {item(<Plus size={16} />, "Nueva lista...", () => actions.createPlaylist(targets))}
        {others.length > 0 && <hr />}
        <div className="menu__scroll">
          {others.map((p) => {
            const has = new Set(p.items.map((it) => it.song_id));
            const all = targets.every((s) => has.has(s.id));
            return (
              <Item
                key={p.id}
                icon={<ListMusic size={16} />}
                label={p.name}
                checked={all}
                onClick={() => actions.addToPlaylist(targets, p)}
                close={close}
              />
            );
          })}
        </div>
      </>
    );
  }

  if (page === "genres") {
    const current = new Set(targets.map((s) => s.genre || null));
    const only = current.size === 1 ? [...current][0] : undefined;
    return (
      <>
        {context.page !== "genres" ? back("Género") : <p className="menu__title">Género de {countLabel(targets.length)}</p>}
        <div className="menu__scroll">
          {genres.map((g) => (
            <Item
              key={g.id}
              icon={<Tag size={16} />}
              label={g.name}
              checked={only === g.name}
              onClick={() => actions.setGenre(targets, g.name)}
              close={close}
            />
          ))}
        </div>
        <hr />
        {item(<Plus size={16} />, "Nuevo género...", () => actions.createGenreFor(targets))}
        {item(<Tag size={16} />, "Sin género", () => actions.setGenre(targets, null), { checked: only === null })}
      </>
    );
  }

  // ---------- varias canciones ----------
  if (selection) {
    const playable = selection.filter(isPlayable);
    const allLiked = selection.every((s) => s.liked);
    return (
      <>
        <p className="menu__title">{countLabel(selection.length)} seleccionadas</p>
        {item(<Play size={16} />, "Reproducir", () => actions.playAll(selection, context.label || "Selección"), {
          disabled: !playable.length,
        })}
        {item(<ListStart size={16} />, "Reproducir después", () => actions.addToQueue(selection, true), { disabled: !playable.length })}
        {item(<ListEnd size={16} />, "Añadir a la cola", () => actions.addToQueue(selection), { disabled: !playable.length })}
        <hr />
        {item(<ListPlus size={16} />, "Añadir a una lista", () => setPage("playlists"), { submenu: true })}
        {item(<Tag size={16} />, "Asignar género", () => setPage("genres"), { submenu: true })}
        {item(
          allLiked ? <HeartOff size={16} /> : <Heart size={16} />,
          allLiked ? "Quitar de Tus me gusta" : "Añadir a Tus me gusta",
          () => actions.setLiked(selection, !allLiked),
        )}
        {playlist && (
          <>
            <hr />
            {item(<ListMinus size={16} />, `Quitar de «${playlist.name}»`, () => actions.removeFromPlaylist(playlist, selection), {
              danger: true,
            })}
          </>
        )}
      </>
    );
  }

  const isCurrent = player.current?.id === song.id;
  const playing = isCurrent && player.isPlaying;

  // ---------- canción en línea (YouTube sin descargar) ----------
  if (isOnline(song)) {
    return (
      <>
        <p className="menu__title">{song.title}</p>
        {item(playing ? <Pause size={16} /> : <Play size={16} />, playing ? "Pausar" : "Escuchar", () =>
          actions.playFrom(song, context.list, context.label),
        )}
        {item(<ListStart size={16} />, "Reproducir después", () => actions.addToQueue(song, true))}
        {item(<ListEnd size={16} />, "Añadir a la cola", () => actions.addToQueue(song))}
        <hr />
        {item(<CloudDownload size={16} />, "Descargar a mi biblioteca", () => actions.downloadOnline(song))}
        {item(<ExternalLink size={16} />, "Abrir en YouTube", () => window.open(song.youtube_url, "_blank", "noopener"))}
      </>
    );
  }

  // ---------- una canción de la biblioteca ----------
  const playable = isPlayable(song);
  return (
    <>
      <p className="menu__title">{song.title}</p>
      {playable ? (
        <>
          {item(playing ? <Pause size={16} /> : <Play size={16} />, playing ? "Pausar" : "Reproducir", () =>
            actions.playFrom(song, context.list, context.label),
          )}
          {item(<ListStart size={16} />, "Reproducir después", () => actions.addToQueue(song, true))}
          {item(<ListEnd size={16} />, "Añadir a la cola", () => actions.addToQueue(song))}
        </>
      ) : (
        song.youtube_url && item(<RotateCw size={16} />, "Volver a descargar", () => actions.redownload(song))
      )}
      <hr />
      {item(<ListPlus size={16} />, "Añadir a una lista", () => setPage("playlists"), { submenu: true })}
      {item(<Tag size={16} />, song.genre ? `Género: ${song.genre}` : "Asignar género", () => setPage("genres"), {
        submenu: true,
      })}
      {playlist &&
        item(<ListMinus size={16} />, `Quitar de «${playlist.name}»`, () => actions.removeFromPlaylist(playlist, [song]))}
      {item(
        <Heart size={16} fill={song.liked ? "currentColor" : "none"} />,
        song.liked ? "Quitar de Tus me gusta" : "Añadir a Tus me gusta",
        () => actions.toggleLike(song),
      )}
      <hr />
      {splitArtists(song.artist)
        .slice(0, 3)
        .map((name) => (
          <Item key={name} icon={<User size={16} />} label={`Ir a ${name}`} onClick={() => navigate(`artist:${artistKey(name)}`)} close={close} />
        ))}
      {song.album && item(<Disc3 size={16} />, `Ir al álbum ${song.album}`, () => navigate(`album:${albumKey(song)}`))}
      {song.youtube_url &&
        item(<ExternalLink size={16} />, "Abrir en YouTube", () => window.open(song.youtube_url, "_blank", "noopener"))}
      {playable && item(<Download size={16} />, "Guardar una copia...", () => actions.saveCopy(song))}
      <hr />
      {item(<Trash2 size={16} />, "Eliminar de la biblioteca", () => actions.remove(song), { danger: true })}
    </>
  );
}

/** Menú de una lista o un género del menú lateral. */
function CollectionMenu({ menu, close }) {
  const actions = useSongActions();
  const { renameGenre, deleteGenre } = useCollections();
  const ui = useUI();
  const { playlist, genre } = menu.context;
  const item = (icon, label, onClick, opts) => <Item icon={icon} label={label} onClick={onClick} close={close} {...opts} />;

  if (playlist) {
    return (
      <>
        <p className="menu__title">{playlist.name}</p>
        {item(<Pencil size={16} />, "Renombrar", () => actions.renamePlaylist(playlist))}
        {item(<Trash2 size={16} />, "Eliminar lista", () => actions.deletePlaylist(playlist), { danger: true })}
      </>
    );
  }

  const rename = async () => {
    const name = await ui.prompt({ title: "Renombrar género", label: "Nombre", initial: genre.name, confirmLabel: "Guardar" });
    if (!name || name === genre.name) return;
    try {
      await renameGenre(genre.id, name);
      if (ui.view === `genre:${genre.name}`) ui.navigate(`genre:${name}`);
    } catch (err) {
      toast.error(`No se pudo renombrar: ${errorMessage(err)}`);
    }
  };
  const remove = async () => {
    const ok = await ui.confirm({
      title: "¿Eliminar el género?",
      message: `Las ${genre.count} canciones de «${genre.name}» quedarán sin género. No se borra ninguna canción.`,
      confirmLabel: "Eliminar género",
      danger: true,
    });
    if (!ok) return;
    await deleteGenre(genre.id);
    if (ui.view === `genre:${genre.name}`) ui.navigate("library");
  };
  return (
    <>
      <p className="menu__title">{genre.name}</p>
      {item(<Pencil size={16} />, "Renombrar", rename)}
      {item(<Trash2 size={16} />, "Eliminar género", remove, { danger: true })}
    </>
  );
}

/** Menú contextual (clic derecho o botón "···"). */
export default function ContextMenu() {
  const { menu, closeMenu } = useUI();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  // Mantener el menú dentro de la ventana (también al cambiar de página del menú)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !menu) return;
    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const x = menu.alignRight ? menu.x - width : menu.x;
      const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
      const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, Math.min(menu.y, window.innerHeight - 8) - height) : menu.y;
      setPos({ left, top: Math.max(8, top) });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [menu]);

  if (!menu) return null;
  const isCollection = menu.context?.playlist || menu.context?.genre;

  return (
    <div className="menu-layer" onMouseDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}>
      <div
        ref={ref}
        className="menu"
        role="menu"
        style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isCollection ? <CollectionMenu key={menu.id} menu={menu} close={closeMenu} /> : <SongMenu key={menu.id} menu={menu} close={closeMenu} />}
      </div>
    </div>
  );
}
