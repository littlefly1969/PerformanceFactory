"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import {
  installPlatform,
  isStandalone,
  useInstallPrompt,
  type InstallPlatform,
} from "../../lib/pwa";
import "../../start/pf4.css";
import "./installa.css";

const HOME = "/journey";

/** Chiude la sequenza lato server: vale anche per l'app installata su iOS. */
async function completeWelcome() {
  const response = await secureFetch(`${API_BASE}/athlete-journey/welcome`, {
    method: "POST",
  });
  if (response.status === 401) window.location.replace("/login");
  return response.ok;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GUIDES: Record<InstallPlatform, React.ReactNode[]> = {
  ios: [
    <>
      Tocca <b>Condividi</b> <ShareIcon /> nella barra di Safari.
    </>,
    <>
      Scegli <b>Aggiungi alla schermata Home</b>, poi <b>Aggiungi</b>.
    </>,
    <>
      Apri <b>PF</b> dalla Home e accedi: ritrovi il percorso da qui.
    </>,
  ],
  android: [
    <>
      Apri il menu <b>⋮</b> del browser.
    </>,
    <>
      Scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>.
    </>,
    <>
      Apri <b>PF</b> dalla Home: ritrovi il percorso da qui.
    </>,
  ],
  other: [
    <>Dal telefono apri questo sito e accedi con il tuo account.</>,
    <>
      Aggiungi <b>PF</b> alla schermata Home dal menu del browser.
    </>,
  ],
};

/** 04 · L'app: dopo il regalo l'atleta porta PF sulla Home del telefono. */
export default function InstallaPage() {
  const install = useInstallPrompt();
  const [platform, setPlatform] = useState<InstallPlatform>();
  const [outcome, setOutcome] = useState<"accepted" | "dismissed">();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Promise<boolean>>();

  useEffect(() => {
    // Già aperta dalla Home: niente da installare, si va alla home.
    if (isStandalone()) {
      void completeWelcome().finally(() => window.location.replace(HOME));
      return;
    }
    setPlatform(installPlatform());
    setSaved(completeWelcome());
  }, []);

  const proceed = async () => {
    // Se il salvataggio non è riuscito si riprova: altrimenti /journey
    // riproporrebbe la sequenza di benvenuto.
    if (!(await saved)) await completeWelcome();
    window.location.assign(HOME);
  };

  const showButton = install.canPrompt && !outcome;
  const done = outcome === "accepted" || install.installed;
  const guide = platform && !showButton && !done ? GUIDES[platform] : null;

  return (
    <main className="pf-welcome">
      <div className="pf-welcome-frame">
        <header className="pf-welcome-top">
          <div
            className="pf-welcome-steps"
            role="progressbar"
            aria-label="Benvenuto"
            aria-valuenow={4}
            aria-valuemin={1}
            aria-valuemax={4}
          >
            {[1, 2, 3, 4].map((step) => (
              <span key={step} className={step === 4 ? "is-current" : ""} />
            ))}
          </div>
          <button type="button" onClick={() => void proceed()}>
            Salta
          </button>
        </header>

        <section className="pf-welcome-body">
          <span className="pf-welcome-kicker">04 · La tua app</span>
          <h1>
            {done ? (
              <>
                Fatto.
                <br />
                PF è sulla tua Home.
              </>
            ) : (
              <>
                Portaci
                <br />
                in tasca.
              </>
            )}
          </h1>
          <p>
            {done
              ? "Aprila dall’icona sul telefono: ti riporta qui, alla tua Home, senza passare dal browser."
              : "Aggiungi PF alla Home del telefono: un tocco e sei nel tuo percorso, tutti i giorni."}
          </p>

          <div className="pf-welcome-app" aria-hidden="true">
            <Image src="/icons/icon-192.png" alt="" width={96} height={96} />
            <span>PF</span>
          </div>

          {guide && (
            <ol className="pf-welcome-guide" aria-label="Come aggiungerla">
              {guide.map((item, index) => (
                <li key={index}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </li>
              ))}
            </ol>
          )}
          {platform === "ios" && !done && (
            <p className="pf-welcome-note">
              Sull’iPhone l’app ha un accesso separato da Safari: al primo avvio
              ti chiediamo e-mail e password una volta.
            </p>
          )}
        </section>

        <footer className="pf-welcome-actions">
          {showButton ? (
            <>
              <button
                type="button"
                className="pf-welcome-cta"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setOutcome(
                    (await install.prompt()) === "accepted"
                      ? "accepted"
                      : "dismissed",
                  );
                  setBusy(false);
                }}
              >
                Installa l’app
              </button>
              <button
                type="button"
                className="pf-welcome-link"
                onClick={() => void proceed()}
              >
                Continua nel browser
              </button>
            </>
          ) : (
            <button
              type="button"
              className="pf-welcome-cta"
              onClick={() => void proceed()}
            >
              {done ? "Continua" : "Continua nel browser"}
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
