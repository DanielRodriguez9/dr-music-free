import { CircleAlert, ClipboardPaste, Download, LoaderCircle, Music2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { downloadErrorToast, updateYtdlp } from "../lib/ytdlp";
import { useLibrary, usePlayer, useUI } from "../context/hooks";
import { SHORTCUTS } from "../hooks/useShortcuts";
import Modal from "./Modal";

const YT_RE = /^(https?:\/\/)?((www|m|music)\.)?(youtube\.com|youtu\.be)\//i;

const STATUS_LABEL = {
  queued: "En cola",
  downloading: "Descargando",
  processing: "Convirtiendo a MP3",
  done: "Lista",
  error: "Error",
};

function DownloadDialog({ onClose }) {
  const { download, downloads } = useLibrary();
  const player = usePlayer();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const value = url.trim();
    if (!YT_RE.test(value)) {
      setError("Pega un enlace de un video de YouTube (youtube.com/watch?v=... o youtu.be/...).");
      return;
    }
    setError("");
    setUrl("");
    try {
      const res = await download(value);
      if (res.status === "exists") {
        toast(`Ya está en tu biblioteca: ${res.song.title}`, { icon: "ℹ️" });
      } else if (res.song) {
        toast.success(
          (t) => (
            <span className="toast-action">
              Descargada: <b>{res.song.title}</b>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  player.playContext([res.song.id], res.song.id, "Descargas");
                  toast.dismiss(t.id);
                }}
              >
                Escuchar
              </button>
            </span>
          ),
          { duration: 6000 },
        );
      }
    } catch (err) {
      downloadErrorToast(err);
    }
  };

  const paste = async () => {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
      setError("");
    } catch {
      setError("No se pudo leer el portapapeles. Pega el enlace con Ctrl + V.");
    }
  };

  return (
    <Modal title="Descargar de YouTube" onClose={onClose}>
      <form className="download-form" onSubmit={submit}>
        <div className="field">
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            aria-label="Enlace de YouTube"
            aria-invalid={Boolean(error)}
          />
          <button type="button" className="icon-btn" onClick={paste} title="Pegar del portapapeles" aria-label="Pegar">
            <ClipboardPaste size={18} />
          </button>
        </div>
        <button type="submit" className="btn btn--primary" disabled={!url.trim()}>
          <Download size={18} /> Descargar
        </button>
      </form>
      {error && (
        <p className="form-error">
          <CircleAlert size={14} /> {error}
        </p>
      )}
      <p className="muted small">
        Se guarda como MP3 con carátula en tu carpeta de música. Puedes seguir usando la app mientras se descarga.
      </p>

      {downloads.length > 0 && (
        <ul className="jobs">
          {downloads.map((job) => (
            <li key={job.id} className={`job job--${job.status}`}>
              <span className="job__icon">
                {["queued", "downloading", "processing"].includes(job.status) ? (
                  <LoaderCircle size={16} className="spin" />
                ) : job.status === "error" ? (
                  <CircleAlert size={16} />
                ) : (
                  <Music2 size={16} />
                )}
              </span>
              <span className="job__text">
                <span className="job__title">{job.title || job.url}</span>
                <span className="job__status">
                  {STATUS_LABEL[job.status]}
                  {job.status === "downloading" && ` · ${Math.round(job.progress)}%`}
                  {job.error && ` · ${job.error}`}
                </span>
                {["queued", "downloading", "processing"].includes(job.status) && (
                  <span className="job__bar" style={{ "--pct": `${job.progress}%` }} />
                )}
                {job.error_kind === "outdated" && (
                  <button type="button" className="btn btn--small job__action" onClick={updateYtdlp}>
                    Actualizar yt-dlp
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Atajos de teclado" onClose={onClose} size="sm">
      <dl className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys} className="shortcuts__row">
            <dt>
              {keys.split(" ").map((k, i) =>
                ["+", "/"].includes(k) ? (
                  <span key={i} className="muted">
                    {" "}
                    {k}{" "}
                  </span>
                ) : (
                  <kbd key={i}>{k}</kbd>
                ),
              )}
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Las teclas multimedia del teclado (▶︎ ⏭ ⏮) también funcionan.</p>
    </Modal>
  );
}

function ConfirmDialog({ dialog, onClose }) {
  return (
    <Modal
      title={dialog.title}
      onClose={() => onClose(false)}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onClose(false)}>
            Cancelar
          </button>
          <button
            type="button"
            autoFocus
            className={`btn ${dialog.danger ? "btn--danger" : "btn--primary"}`}
            onClick={() => onClose(true)}
          >
            {dialog.confirmLabel || "Aceptar"}
          </button>
        </>
      }
    >
      <p>{dialog.message}</p>
    </Modal>
  );
}

function PromptDialog({ dialog, onClose }) {
  const [value, setValue] = useState(dialog.initial || "");
  const clean = value.replace(/\s+/g, " ").trim();
  return (
    <Modal title={dialog.title} onClose={() => onClose(null)} size="sm">
      <form
        className="prompt-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) onClose(clean);
        }}
      >
        <label className="prompt-form__label">
          <span>{dialog.label || "Nombre"}</span>
          <input
            autoFocus
            className="input"
            value={value}
            maxLength={120}
            placeholder={dialog.placeholder || ""}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="modal__footer modal__footer--inline">
          <button type="button" className="btn btn--ghost" onClick={() => onClose(null)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!clean}>
            {dialog.confirmLabel || "Aceptar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Dialogs() {
  const { dialog, closeDialog } = useUI();
  if (!dialog) return null;
  const close = (result) => closeDialog(result);
  if (dialog.type === "download") return <DownloadDialog onClose={() => close(false)} />;
  if (dialog.type === "shortcuts") return <ShortcutsDialog onClose={() => close(false)} />;
  if (dialog.type === "confirm") return <ConfirmDialog dialog={dialog} onClose={close} />;
  if (dialog.type === "prompt") return <PromptDialog dialog={dialog} onClose={close} />;
  return null;
}
