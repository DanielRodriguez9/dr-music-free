import toast from "react-hot-toast";
import { api, errorMessage } from "../api";

/** Actualiza yt-dlp mostrando el progreso en avisos. Devuelve el resultado o null. */
export async function updateYtdlp() {
  const t = toast.loading("Buscando actualización de yt-dlp...");
  try {
    const { data } = await api.post("/system/ytdlp/update", null, { timeout: 320000 });
    if (data.updated) toast.success(`yt-dlp actualizado: ${data.before} → ${data.after}`, { id: t, duration: 5000 });
    else toast.success(`yt-dlp ya está al día (${data.after || data.before || "versión desconocida"})`, { id: t });
    return data;
  } catch (err) {
    toast.error(`No se pudo actualizar yt-dlp: ${errorMessage(err)}`, { id: t, duration: 8000 });
    return null;
  }
}

/** Aviso de error de descarga; si parece que yt-dlp está viejo, ofrece actualizarlo. */
export function downloadErrorToast(err, toastId) {
  const message = errorMessage(err);
  if (err?.kind !== "outdated") {
    toast.error(`No se pudo descargar: ${message}`, { id: toastId, duration: 8000 });
    return;
  }
  toast.error(
    (t) => (
      <span className="toast-action toast-action--column">
        <span>
          La descarga falló, probablemente porque YouTube cambió y yt-dlp está desactualizado.
          <small className="toast-detail">{message}</small>
        </span>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            toast.dismiss(t.id);
            updateYtdlp();
          }}
        >
          Actualizar yt-dlp
        </button>
      </span>
    ),
    { id: toastId, duration: 15000 },
  );
}
