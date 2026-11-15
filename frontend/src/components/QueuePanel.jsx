import { X } from "lucide-react";
import { artistLabel } from "../api";
import { useLibrary, usePlayer, useUI } from "../context/hooks";
import Cover from "./Cover";
import Equalizer from "./Equalizer";

function QueueItem({ song, onPlay, onRemove, active, playing, onMenu }) {
  if (!song) return null;
  return (
    <div className={`qitem ${active ? "is-current" : ""}`} onContextMenu={onMenu}>
      <button type="button" className="qitem__main" onClick={onPlay} title={active ? "" : "Reproducir ahora"}>
        <Cover song={song} size="sm" />
        <span className="qitem__text">
          <span className="qitem__title">{song.title}</span>
          <span className="qitem__artist">{artistLabel(song)}</span>
        </span>
        {active && <Equalizer playing={playing} />}
      </button>
      {onRemove && (
        <button type="button" className="icon-btn qitem__remove" onClick={onRemove} aria-label="Quitar de la cola" title="Quitar de la cola">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Panel lateral "Cola": sonando ahora, tu cola y lo que sigue de la lista. */
export default function QueuePanel() {
  const { byId } = useLibrary();
  const player = usePlayer();
  const { toggleQueue, openMenu } = useUI();
  const { current, queue, upcoming, isPlaying } = player;
  const menu = (song) => (e) => openMenu(e, song, { list: [song], label: "Cola" });

  return (
    <aside className="queue" aria-label="Cola de reproducción">
      <header className="queue__header">
        <h2>Cola</h2>
        <button type="button" className="icon-btn" onClick={toggleQueue} aria-label="Cerrar cola" title="Cerrar (Q)">
          <X size={18} />
        </button>
      </header>

      <div className="queue__scroll">
        <section>
          <h3 className="queue__label">Sonando ahora</h3>
          {current ? (
            <QueueItem song={current} active playing={isPlaying} onPlay={player.togglePlay} onMenu={menu(current)} />
          ) : (
            <p className="muted queue__empty">Nada sonando todavía.</p>
          )}
        </section>

        {queue.userQueue.length > 0 && (
          <section>
            <div className="queue__row">
              <h3 className="queue__label">Siguientes en tu cola</h3>
              <button type="button" className="link link--muted" onClick={player.clearQueue}>
                Vaciar
              </button>
            </div>
            {queue.userQueue.map((id, i) => (
              <QueueItem
                key={`${id}-${i}`}
                song={byId.get(id)}
                onPlay={() => player.jumpToQueue(i)}
                onRemove={() => player.removeFromQueue(i)}
                onMenu={menu(byId.get(id))}
              />
            ))}
          </section>
        )}

        <section>
          <h3 className="queue__label">
            A continuación{queue.context.label ? ` · ${queue.context.label}` : ""}
            {queue.shuffle && <span className="badge">Aleatorio</span>}
          </h3>
          {upcoming.length ? (
            upcoming.map(({ id, pos }) => (
              <QueueItem key={`${id}-${pos}`} song={byId.get(id)} onPlay={() => player.jumpToContext(pos)} onMenu={menu(byId.get(id))} />
            ))
          ) : (
            <p className="muted queue__empty">
              {queue.repeat === "all" ? "Vuelve a empezar desde el principio." : "No hay más canciones en esta lista."}
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
