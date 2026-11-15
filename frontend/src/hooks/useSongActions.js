import { useCallback } from "react";
import toast from "react-hot-toast";
import { audioUrl, errorMessage, isPlayable } from "../api";
import { useLibrary, usePlayer, useUI } from "../context/hooks";
import { downloadErrorToast } from "../lib/ytdlp";

/** Acciones comunes sobre una canción (filas, tarjetas, menú contextual, reproductor). */
export default function useSongActions() {
  const library = useLibrary();
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
      library
        .toggleLike(song)
        .then((liked) => toast.success(liked ? "Añadida a Tus me gusta" : "Quitada de Tus me gusta", { id: "like" }))
        .catch((err) => toast.error(`No se pudo guardar: ${errorMessage(err)}`));
    },
    [library],
  );

  const addToQueue = useCallback(
    (song, next = false) => {
      if (!isPlayable(song)) return;
      (next ? player.playNext : player.addToQueue)(song.id);
      toast.success(next ? "Sonará a continuación" : "Añadida a la cola", { id: "queue" });
    },
    [player],
  );

  const remove = useCallback(
    async (song) => {
      const ok = await ui.confirm({
        title: "¿Eliminar de la biblioteca?",
        message: `"${song.title}" se borrará de la biblioteca y su archivo de audio se eliminará del disco. El historial de escuchas se conserva.`,
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      try {
        await library.deleteSong(song.id);
        toast.success("Canción eliminada");
      } catch (err) {
        toast.error(`No se pudo eliminar: ${errorMessage(err)}`);
      }
    },
    [library, ui],
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

  return { playFrom, playAll, toggleLike, addToQueue, remove, redownload, saveCopy };
}
