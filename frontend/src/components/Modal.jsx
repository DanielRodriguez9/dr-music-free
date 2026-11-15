import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export default function Modal({ title, onClose, children, footer, size = "md", labelledBy = "modal-title" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const first = el?.querySelector("[autofocus], input, button.btn--primary, button");
    first?.focus();
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <header className="modal__header">
          <h2 id={labelledBy}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)">
            <X size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
