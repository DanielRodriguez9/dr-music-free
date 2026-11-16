import { useCallback } from "react";
import toast from "react-hot-toast";
import { api, audioUrl, errorMessage, isOnline, isPlayable } from "../api";
import { useCollections, useLibrary, usePlayer, useUI } from "../context/hooks";
import { normalize, plural } from "../lib/format";
import { downloadErrorToast } from "../lib/ytdlp";

const many = (songs) => [].concat(songs).filter(Boolean);
const countLabel = (n) => (n === 1 ? "1 canción" : `${n.toLocaleString("es")} canciones`);

/** Acciones comunes sobre una o varias canciones (filas, tarjetas, menú, reproductor). */
export default function useSongActions() {
  const library = useLibrary();
  const collections = useCollections();
  const player = usePlayer();
  const ui = useUI();

  /** Reproduce `song` dentro de la lista `list` (o pausa/reanuda si ya es la actual). */
  const playFrom = useCallback(
    (song, list, label) => {
      if (!isPlayable(song)) {
        toast.error("Falta el archivo de esta canción. Puedes volver a descargarla desde su menú (···).", {
          id: "missing-file",
        });
        return;
      }
      if (player.current?.id === song.id) {
        player.togglePlay();
        return;
      }
      const ids = (list ?? [song]).filter(isPlayable).map((s) => s.id);
      player.playContext(ids, song.id, label);
    },
    [player],
  );

  const playAll = useCallback(
    (list, label, { shuffle = false } = {}) => {
      const ids = list.filter(isPlayable).map((s) => s.id);
      if (!ids.length) return;
      if (shuffle !== player.queue.shuffle) player.toggleShuffle();
      const start = shuffle ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
      player.playContext(ids, start, label);
    },
    [player],
  );

  const toggleLike = useCallback(
    (song) => {
      if (isOnline(song)) {
        toast("Descarga la canción para añadirla a Tus me gusta.", { icon: "ℹ️", id: "like" });
        return;
      }
      library
        .toggleLike(song)
        .then((liked) => toast.success(liked ? "Añadida a Tus me gusta" : "Quitada de Tus me gusta", { id: "like" }))
        .catch((err) => toast.error(`No se pudo guardar: ${errorMessage(err)}`));
    },
    [library],
  );

  /** Me gusta para varias a la vez. */
  const setLiked = useCallback(
    async (songs, liked) => {
      const ids = many(songs).filter((s) => !isOnline(s)).map((s) => s.id);
      if (!ids.length) return;
      try {
        const { data } = await api.post("/songs/bulk", { song_ids: ids, liked });
        library.applySongs(data);
        toast.success(`${countLabel(ids.length)} ${liked ? "en" : "fuera de"} Tus me gusta`, { id: "like" });
      } catch (err) {
        toast.error(`No se pudo guardar: ${errorMessage(err)}`);
      }
    },
    [library],
  );

  /** Una o varias canciones a la cola (al final o a continuación). */
  const addToQueue = useCallback(
    (songs, next = false) => {
      const ids = many(songs).filter(isPlayable).map((s) => s.id);
      if (!ids.length) return;
      if (isOnline(many(songs)[0])) library.registerOnline(many(songs).filter(isOnline));
      (next ? player.playNext : player.addToQueue)(ids);
      const what = ids.length === 1 ? "Sonará" : `${countLabel(ids.length)} sonarán`;
      toast.success(next ? `${what} a continuación` : `${countLabel(ids.length)} en la cola`, { id: "queue" });
    },
    [player, library],
  );

  // ---------- listas de reproducción ----------
  const askName = useCallback(
    (title, initial = "", confirmLabel = "Crear") =>
      ui.prompt({ title, label: "Nombre", initial, confirmLabel, placeholder: "Mi lista" }),
    [ui],
  );

  /** Crea una lista (opcionalmente con canciones) y la abre. */
  const createPlaylist = useCallback(
    async (songs = [], { open = true } = {}) => {
      const name = await askName("Nueva lista de reproducción", "");
      if (!name) return null;
      try {
        const ids = many(songs).filter((s) => !isOnline(s)).map((s) => s.id);
        const pl = await collections.createPlaylist(name, ids);
        toast.success(ids.length ? `Lista «${pl.name}» creada con ${countLabel(ids.length)}` : `Lista «${pl.name}» creada`);
        if (open) ui.navigate(`playlist:${pl.id}`);
        return pl;
      } catch (err) {
        toast.error(`No se pudo crear la lista: ${errorMessage(err)}`);
        return null;
      }
    },
    [askName, collections, ui],
  );

  const addToPlaylist = useCallback(
    async (songs, playlist) => {
      const ids = many(songs).filter((s) => !isOnline(s)).map((s) => s.id);
      if (!ids.length) return;
      try {
        const { added, skipped } = await collections.addToPlaylist(playlist.id, ids);
        if (added && !skipped) toast.success(`${countLabel(added)} en «${playlist.name}»`, { id: "playlist" });
        else if (added) toast.success(`${countLabel(added)} en «${playlist.name}» (${skipped} ya estaban)`, { id: "playlist" });
        else toast(`Ya estaba${ids.length > 1 ? "n" : ""} en «${playlist.name}»`, { icon: "ℹ️", id: "playlist" });
      } catch (err) {
        toast.error(`No se pudo añadir: ${errorMessage(err)}`);
      }
    },
    [collections],
  );

  const removeFromPlaylist = useCallback(
    async (playlist, songs) => {
      const wanted = new Set(many(songs).map((s) => s.id));
      const itemIds = playlist.items.filter((it) => wanted.has(it.song_id)).map((it) => it.id);
      if (!itemIds.length) return;
      try {
        await collections.removeFromPlaylist(playlist.id, itemIds);
        toast.success(`${countLabel(itemIds.length)} fuera de «${playlist.name}»`, { id: "playlist" });
      } catch (err) {
        toast.error(`No se pudo quitar: ${errorMessage(err)}`);
      }
    },
    [collections],
  );

  const renamePlaylist = useCallback(
    async (playlist) => {
      const name = await askName("Renombrar lista", playlist.name, "Guardar");
      if (!name || name === playlist.name) return;
      try {
        await collections.renamePlaylist(playlist.id, name);
      } catch (err) {
        toast.error(`No se pudo renombrar: ${errorMessage(err)}`);
      }
    },
    [askName, collections],
  );

  const deletePlaylist = useCallback(
    async (playlist) => {
      const ok = await ui.confirm({
        title: "¿Eliminar la lista?",
        message: `Se borrará la lista «${playlist.name}». Las canciones siguen en tu biblioteca.`,
        confirmLabel: "Eliminar lista",
        danger: true,
      });
      if (!ok) return;
      try {
        await collections.deletePlaylist(playlist.id);
        if (ui.view === `playlist:${playlist.id}`) ui.navigate("library");
        toast.success(`Lista «${playlist.name}» eliminada`);
      } catch (err) {
        toast.error(`No se pudo eliminar: ${errorMessage(err)}`);
      }
    },
    [collections, ui],
  );

  // ---------- géneros ----------
  /**
   * Asigna el género (null lo quita). Después ofrece aplicarlo a las demás canciones
   * de los mismos artistas que aún no lo tienen.
   */
  const setGenre = useCallback(
    async (songs, genre) => {
      const targets = many(songs).filter((s) => !isOnline(s));
      if (!targets.length) return;
      let saved;
      try {
        saved = await collections.setGenre(targets.map((s) => s.id), genre);
      } catch (err) {
        toast.error(`No se pudo guardar el género: ${errorMessage(err)}`);
        return;
      }
      const name = saved[0]?.genre ?? null;
      toast.success(name ? `${countLabel(targets.length)} en ${name}` : `Género quitado de ${countLabel(targets.length)}`, {
        id: "genre",
      });
      if (!name) return;

      const ids = new Set(targets.map((s) => s.id));
      const artists = new Map();
      for (const s of targets) if (s.artist) artists.set(normalize(s.artist), s.artist);
      if (!artists.size) return;
      const others = library.songs.filter(
        (s) => s.artist && !ids.has(s.id) && artists.has(normalize(s.artist)) && s.genre !== name,
      );
      if (!others.length) return;
      const who = artists.size === 1 ? [...artists.values()][0] : `${artists.size} artistas`;
      const withOther = others.filter((s) => s.genre).length;
      const ok = await ui.confirm({
        title: `¿Aplicar «${name}» al resto de ${who}?`,
        message:
          `Hay ${plural(others.length, "canción más", "canciones más")} de ${who}` +
          (withOther ? ` (${withOther} con otro género, que se cambiaría).` : " sin este género.") +
          ` ¿Les asigno también «${name}»?`,
        confirmLabel: `Aplicar a ${countLabel(others.length)}`,
      });
      if (!ok) return;
      try {
        await collections.setGenre(others.map((s) => s.id), name);
        toast.success(`${countLabel(others.length)} más en ${name}`, { id: "genre" });
      } catch (err) {
        toast.error(`No se pudo guardar el género: ${errorMessage(err)}`);
      }
    },
    [collections, library.songs, ui],
  );

  const createGenreFor = useCallback(
    async (songs) => {
      const name = await ui.prompt({ title: "Nuevo género", label: "Nombre", confirmLabel: "Crear", placeholder: "Bachata" });
      if (!name) return;
      if (many(songs).length) await setGenre(songs, name);
      else {
        try {
          await collections.createGenre(name);
          toast.success(`Género «${name}» creado`);
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }
    },
    [ui, setGenre, collections],
  );

  // ---------- borrar y descargar ----------
  const remove = useCallback(
    async (song) => {
      const ok = await ui.confirm({
        title: "¿Eliminar de la biblioteca?",
        message:
          song.folder_id != null
            ? `"${song.title}" saldrá de la biblioteca. Es de una carpeta importada: el archivo NO se borra. El historial se conserva.`
            : `"${song.title}" se borrará de la biblioteca y su archivo de audio se eliminará del disco. El historial de escuchas se conserva.`,
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      try {
        await library.deleteSong(song.id);
        collections.reloadCollections().catch(() => {});
        toast.success("Canción eliminada");
      } catch (err) {
        toast.error(`No se pudo eliminar: ${errorMessage(err)}`);
      }
    },
    [library, collections, ui],
  );

  const redownload = useCallback(
    (song) => {
      if (!song.youtube_url) return;
      const t = toast.loading(`Descargando "${song.title}"...`);
      library
        .download(song.youtube_url)
        .then(() => toast.success("Canción recuperada", { id: t }))
        .catch((err) => downloadErrorToast(err, t));
    },
    [library],
  );

  /** Descarga una canción en línea; si está sonando o en la cola, pasa a ser la de la biblioteca. */
  const downloadOnline = useCallback(
    async (track) => {
      const t = toast.loading(`Descargando "${track.title}"...`);
      try {
        const res = await library.download(track.youtube_url);
        if (res.song) player.replaceTrack(track.id, res.song.id);
        toast.success(res.status === "exists" ? `Ya estaba en tu biblioteca: ${res.song.title}` : `Descargada: ${track.title}`, {
          id: t,
        });
        return res.song;
      } catch (err) {
        downloadErrorToast(err, t);
        return null;
      }
    },
    [library, player],
  );

  /** Guarda una copia del archivo de audio donde elija el usuario. */
  const saveCopy = useCallback(async (song) => {
    const src = audioUrl(song);
    if (!src) return;
    try {
      const blob = await (await fetch(src)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = song.filename || `${song.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`No se pudo guardar: ${errorMessage(err)}`);
    }
  }, []);

  return {
    playFrom,
    playAll,
    toggleLike,
    setLiked,
    addToQueue,
    createPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    renamePlaylist,
    deletePlaylist,
    setGenre,
    createGenreFor,
    remove,
    redownload,
    downloadOnline,
    saveCopy,
  };
}
