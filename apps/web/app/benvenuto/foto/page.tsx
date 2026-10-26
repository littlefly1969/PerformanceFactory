"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { API_BASE, secureFetch } from "../../lib/api";
import { WelcomeIntro, WelcomeShell } from "../_components/welcome-shell";
import { resizePhoto } from "./resize-photo";
import { FitRankingEditor } from "../../components/fit-ranking-editor";

const NEXT = "/benvenuto/spider";

async function readJson(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/login");
    return null;
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : data.message || "Operazione non riuscita. Riprova.",
    );
  return data as { image: string | null };
}

export default function WelcomePhotoPage() {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    secureFetch(`${API_BASE}/athlete/profile/photo`)
      .then(readJson)
      .then((data) => {
        if (active && data) setImage(data.image);
      })
      .catch(() => {
        /* Senza foto salvata si parte dal riquadro vuoto. */
      });
    return () => {
      active = false;
    };
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const resized = await resizePhoto(file);
      const data = await readJson(
        await secureFetch(`${API_BASE}/athlete/profile/photo`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: resized }),
        }),
      );
      if (data) setImage(data.image);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Caricamento non riuscito. Riprova.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <WelcomeShell
      step={1}
      skipHref={NEXT}
      footer={
        <Link className="pf-welcome-cta" href={NEXT}>
          {image ? "Continua" : "Lo farò dopo"}
        </Link>
      }
    >
      <WelcomeIntro step={1} kicker="Il tuo profilo" title="Mettici la faccia.">
        Aggiungi una tua foto e, se ce l’hai, la tua classifica: il coach ti
        riconosce in campo e l’AI tara subito il livello.
      </WelcomeIntro>
      <div className="pf-welcome-center">
        <div className="pf-photo">
          <button
            type="button"
            className="pf-photo-tile"
            disabled={busy}
            onClick={() => input.current?.click()}
            aria-label={image ? "Cambia foto profilo" : "Carica foto profilo"}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL dall'API
              <img src={image} alt="La tua foto profilo" />
            ) : (
              <>
                <CameraIcon />
                <span>{busy ? "Caricamento…" : "Tocca per caricare"}</span>
              </>
            )}
          </button>
          <span className="pf-photo-add" aria-hidden="true">
            {image ? "✓" : "+"}
          </span>
          <input
            ref={input}
            type="file"
            accept="image/*"
            aria-label="Scegli una foto"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
        {busy && image && <p className="pf-welcome-note">Caricamento…</p>}
        {/* Classifica FIT: dato di configurazione del profilo, non una domanda del percorso. */}
        <FitRankingEditor tone="dark" />
        {error && (
          <p role="alert" className="pf-welcome-error">
            {error}
          </p>
        )}
      </div>
    </WelcomeShell>
  );
}

function CameraIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8h5.4L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12.5"
        r="3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
