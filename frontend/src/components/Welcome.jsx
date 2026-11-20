import { ArrowRight, Check, FolderOpen, LoaderCircle, Music2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { desktop, errorMessage } from "../api";
import { useUI } from "../context/hooks";

function Steps({ step }) {
  return (
    <p className="welcome__steps" aria-label={`Paso ${step} de 2`}>
      <span className={step >= 1 ? "is-on" : ""} />
      <span className={step >= 2 ? "is-on" : ""} />
      Paso {step} de 2
    </p>
  );
}

/** Primera vez en este equipo: nombre para el saludo y carpeta de música. */
export default function Welcome() {
  const { welcome, setWelcome, setUserName, userName, navigate } = useUI();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(userName);
  const [choice, setChoice] = useState("default"); // "default" | "custom"
  const [customDir, setCustomDir] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const defaultDir = welcome?.defaultMusicDir;

  useEffect(() => {
    if (step === 1) inputRef.current?.focus();
  }, [step]);

  const saveName = async (value) => {
    try {
      await setUserName(value);
    } catch (err) {
      toast.error(`No se pudo guardar el nombre: ${errorMessage(err)}`);
    }
    setStep(2);
  };

  const pickFolder = async () => {
    const dir = await desktop.chooseWelcomeDir();
    if (dir) {
      setCustomDir(dir);
      setChoice("custom");
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const dir = choice === "custom" && customDir ? customDir : defaultDir;
      const { reloaded } = await desktop.finishWelcome(dir);
      if (reloaded) return; // otra carpeta: la app se recarga sola y abre Inicio
      navigate("home");
      setWelcome(null);
    } catch (err) {
      toast.error(`No se pudo guardar la carpeta: ${errorMessage(err)}`);
      setBusy(false);
    }
  };

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div className="welcome__card">
        <div className="welcome__brand">
          <span className="welcome__logo" aria-hidden="true">
            <Music2 size={22} />
          </span>
          DR Music
        </div>

        {step === 1 ? (
          <form
            className="welcome__body"
            onSubmit={(e) => {
              e.preventDefault();
              saveName(name);
            }}
          >
            <Steps step={1} />
            <h1>¿Cómo te llamas?</h1>
            <p className="welcome__lead">Lo usaremos para saludarte al abrir la app. Puedes cambiarlo en Ajustes.</p>
            <input
              ref={inputRef}
              className="input welcome__input"
              value={name}
              maxLength={40}
              placeholder="Tu nombre"
              aria-label="Tu nombre"
              onChange={(e) => setName(e.target.value)}
            />
            <div className="welcome__actions">
              <button type="button" className="link-btn" onClick={() => saveName("")}>
                Omitir
              </button>
              <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
                Continuar <ArrowRight size={17} />
              </button>
            </div>
          </form>
        ) : (
          <div className="welcome__body">
            <Steps step={2} />
            <h1>¿Dónde guardamos tu música?</h1>
            <p className="welcome__lead">Aquí quedan las canciones que descargues. La app no mueve ni borra tus archivos.</p>

            <div className="welcome__options" role="radiogroup" aria-label="Carpeta de música">
              <div className={`welcome__option ${choice === "default" ? "is-selected" : ""}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === "default"}
                  className="welcome__option-main"
                  onClick={() => setChoice("default")}
                >
                  <span className="welcome__radio">{choice === "default" && <Check size={14} />}</span>
                  <span className="welcome__option-text">
                    <span className="welcome__option-title">
                      {/* en disco es "Music", pero Windows la muestra como "Música" */}
                      Música\DR Music Free <span className="badge badge--accent">Recomendado</span>
                    </span>
                    <span className="welcome__path" title={defaultDir}>
                      {defaultDir}
                    </span>
                  </span>
                </button>
              </div>
              <div className={`welcome__option welcome__option--split ${choice === "custom" ? "is-selected" : ""}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={choice === "custom"}
                  className="welcome__option-main"
                  onClick={customDir ? () => setChoice("custom") : pickFolder}
                >
                  <span className="welcome__radio">{choice === "custom" && <Check size={14} />}</span>
                  <span className="welcome__option-text">
                    <span className="welcome__option-title">Otra carpeta</span>
                    {customDir ? (
                      <span className="welcome__path" title={customDir}>
                        {customDir}
                      </span>
                    ) : (
                      <span className="welcome__hint">Por ejemplo, donde ya guardas tus canciones</span>
                    )}
                  </span>
                </button>
                <button type="button" className="btn btn--ghost btn--compact" onClick={pickFolder}>
                  <FolderOpen size={15} /> {customDir ? "Cambiar..." : "Elegir..."}
                </button>
              </div>
            </div>

            <div className="welcome__actions">
              <button type="button" className="link-btn" onClick={() => setStep(1)} disabled={busy}>
                Atrás
              </button>
              <button type="button" className="btn btn--primary" onClick={finish} disabled={busy}>
                {busy ? <LoaderCircle size={17} className="spin" /> : null}
                Empezar <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
