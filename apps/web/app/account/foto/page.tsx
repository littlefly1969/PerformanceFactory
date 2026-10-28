"use client";
import Link from "next/link";
import {
  WelcomeIntro,
  WelcomeShell,
} from "../../benvenuto/_components/welcome-shell";
import {
  PhotoTile,
  useProfilePhotoUpload,
} from "../../benvenuto/foto/photo-tile";
import { useAccountGate, useAccountReturn } from "../account-gate";

/**
 * Foto dall'account: la stessa schermata del benvenuto, con la freccia
 * indietro al posto dell'avanzamento e il ritorno alla pagina chiamante,
 * mai allo Spider o al regalo del benvenuto.
 */
export default function AccountPhotoPage() {
  const home = useAccountGate();
  const back = useAccountReturn("/account").href ?? "/account";
  const photo = useProfilePhotoUpload();
  const { image, busy, error } = photo;
  return (
    <WelcomeShell
      back={back}
      footer={
        <Link className="pf-welcome-cta" href={back}>
          Fatto
        </Link>
      }
    >
      <WelcomeIntro kicker="Il tuo account" title="La tua foto.">
        Il coach ti riconosce in campo. Tocca il riquadro per cambiarla.
      </WelcomeIntro>
      <div className="pf-welcome-center">
        {home && <PhotoTile {...photo} />}
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
