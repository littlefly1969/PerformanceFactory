"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { WelcomeIntro, WelcomeShell } from "../_components/welcome-shell";
import {
  FitRankingEditor,
  type PendingFitRanking,
} from "../../components/fit-ranking-editor";
import { PhotoTile, useProfilePhotoUpload } from "./photo-tile";

const NEXT = "/benvenuto/spider";

/** Primo inserimento di foto e classifica FIT; le modifiche dopo sono nell'account. */
export default function WelcomePhotoPage() {
  const photo = useProfilePhotoUpload();
  const { image, busy, error } = photo;
  const router = useRouter();
  const ranking: PendingFitRanking = useRef(null);
  return (
    <WelcomeShell
      step={1}
      skipHref={NEXT}
      footer={
        <Link
          className="pf-welcome-cta"
          href={NEXT}
          onClick={async (event) => {
            // Classifica compilata senza «Salva»: si salva qui, non si perde.
            const save = ranking.current;
            if (!save) return;
            event.preventDefault();
            if (await save()) router.push(NEXT);
          }}
        >
          {image ? "Continua" : "Lo farò dopo"}
        </Link>
      }
    >
      <WelcomeIntro step={1} kicker="Il tuo profilo" title="Mettici la faccia.">
        Aggiungi una tua foto e, se ce l’hai, la tua classifica: il coach ti
        riconosce in campo e l’AI tara subito il livello.
      </WelcomeIntro>
      <div className="pf-welcome-center">
        <PhotoTile {...photo} />
        {busy && image && <p className="pf-welcome-note">Caricamento…</p>}
        {/* Classifica FIT: dato di configurazione del profilo, non una domanda del percorso. */}
        <FitRankingEditor tone="dark" pending={ranking} />
        {error && (
          <p role="alert" className="pf-welcome-error">
            {error}
          </p>
        )}
      </div>
    </WelcomeShell>
  );
}
