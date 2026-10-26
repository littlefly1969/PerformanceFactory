"use client";

import { API_BASE } from "@/app/lib/api";
import "./club-images.css";

export type ClubImageKind = "logo" | "photo";

/** Lato massimo e peso massimo del data URL, allineati ai limiti dell'API. */
const LIMITS: Record<ClubImageKind, { side: number; length: number }> = {
  logo: { side: 256, length: 200_000 },
  photo: { side: 1200, length: 700_000 },
};

/**
 * Ridimensiona nel browser prima dell'invio: il logo resta trasparente
 * (WebP o PNG), la foto diventa un JPEG. Se il risultato supera il limite
 * prova una qualità più bassa.
 */
export async function resizeClubImage(file: File, kind: ClubImageKind) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error("Usa un'immagine PNG, JPEG o WebP");
  const bitmap = await createImageBitmap(file);
  const { side, length } = LIMITS[kind];
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const attempts: Array<[string, number]> =
    kind === "logo"
      ? [
          ["image/webp", 0.9],
          ["image/png", 1],
          ["image/webp", 0.7],
        ]
      : [
          ["image/jpeg", 0.82],
          ["image/jpeg", 0.65],
          ["image/jpeg", 0.5],
        ];
  for (const [type, quality] of attempts) {
    const dataUrl = canvas.toDataURL(type, quality);
    // Un browser che non codifica WebP restituisce PNG: va bene lo stesso.
    if (dataUrl.length <= length) return dataUrl;
  }
  throw new Error("Immagine troppo pesante anche dopo il ridimensionamento");
}

/** Anteprima e caricamento di logo e foto di un circolo nel back office. */
export function ClubImages({
  name,
  logoUrl,
  photoUrl,
  busy,
  onChange,
}: {
  name: string;
  logoUrl: string | null;
  photoUrl: string | null;
  busy: boolean;
  /** Un file da caricare, oppure null per rimuovere l'immagine. */
  onChange: (kind: ClubImageKind, file: File | null) => void;
}) {
  const slots: Array<[ClubImageKind, string, string | null]> = [
    ["logo", "Logo", logoUrl],
    ["photo", "Foto", photoUrl],
  ];
  return (
    <div className="pf-club-images">
      {slots.map(([kind, label, url]) => (
        <div className="pf-club-image" key={kind}>
          <span className="pf-muted">{label}</span>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- immagine dall'API, già ridimensionata
            <img
              src={`${API_BASE}${url}`}
              alt={`${label} ${name}`}
              className={`pf-club-image-${kind}`}
            />
          ) : (
            <span className={`pf-club-image-${kind} pf-club-image-empty`}>
              Nessuna immagine
            </span>
          )}
          <label className="pf-button-secondary">
            {url ? "Sostituisci" : "Carica"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={busy}
              aria-label={`Carica ${label.toLowerCase()} di ${name}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onChange(kind, file);
              }}
            />
          </label>
          {url && (
            <button
              className="pf-button-secondary"
              type="button"
              disabled={busy}
              onClick={() => onChange(kind, null)}
            >
              Rimuovi
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
