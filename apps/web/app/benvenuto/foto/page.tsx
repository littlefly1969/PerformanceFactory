"use client";
import Link from "next/link";
import { WelcomeIntro, WelcomeShell } from "../_components/welcome-shell";
import { PhotoTile, useProfilePhotoUpload } from "./photo-tile";

/** Passo 2 della demo PF10: la classifica FIT ha una schermata sua. */
const NEXT = "/benvenuto/classifica";

/** Primo inserimento della foto; le modifiche dopo sono nell'account. */
export default function WelcomePhotoPage() {
  const photo = useProfilePhotoUpload();
  const { image, busy, error } = photo;
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
        Aggiungi una tua foto: il coach ti riconosce in campo prima ancora del
        primo allenamento.
      </WelcomeIntro>
      <div className="pf-welcome-center">
        <PhotoTile {...photo} />
        {busy && image && <p className="pf-welcome-note">Caricamento…</p>}
        {error && (
          <p role="alert" className="pf-welcome-error">
            {error}
          </p>
        )}
      </div>
    </WelcomeShell>
  );
}
