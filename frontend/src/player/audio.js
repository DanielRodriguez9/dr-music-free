// Un único elemento de audio para toda la app (vive fuera de React).
export const audio = typeof Audio === "undefined" ? null : new Audio();
if (audio) audio.preload = "auto";

/** Segundo exacto de la canción (para la letra sincronizada, más fino que el estado de React). */
export const audioTime = () => audio?.currentTime ?? 0;
