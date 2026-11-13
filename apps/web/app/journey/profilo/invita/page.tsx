"use client";
import { useResource, type AthleteProfile } from "../../_account/account-data";
import { AccountScreen, AccountTopBar } from "../../_account/account-shell";
import { useProfileOrigin } from "../_profile/profile-origin";
import "../_profile/profile.css";
import "../_profile/fake-pages.css";

/** Codice d'esempio come nella demo: nome in maiuscolo e «-PF». */
const sampleCode = (name: string) =>
  `${(name.toUpperCase().replace(/[^A-Z]/g, "") || "AMICO").slice(0, 7)}-PF`;

/**
 * Invita un amico (S43 della demo PF10): pagina di sola presentazione. Il
 * referral non è ancora attivo, quindi l'unico comando che funziona è la
 * freccia indietro; codice, link e condivisione sono disattivati.
 */
export default function InvitePage() {
  const profile = useResource<AthleteProfile>("/athlete-journey/profile");
  const origin = useProfileOrigin();
  const code = sampleCode(profile.data?.firstName ?? "");
  return (
    <AccountScreen
      top={<AccountTopBar title="Invita un compagno" back={origin.back} />}
      footer={
        <button type="button" className="pf-acc-pill is-lime" disabled>
          <span>Condividi il codice</span>
          <span aria-hidden="true">→</span>
        </button>
      }
    >
      <div className="pf-fake">
        <h1>Invita un compagno e ricevi [N] Token PF.</h1>
        <p className="pf-fake-lead">Il premio matura quando: [da definire].</p>
        <p className="pf-fake-soon" role="note">
          In arrivo: gli inviti non sono ancora attivi.
        </p>
        <section className="pf-fake-box" aria-label="Il tuo codice">
          <span className="pf-prof-kicker">Il tuo codice</span>
          <div className="pf-fake-code">
            <b>{code}</b>
            <button type="button" disabled>
              Copia
            </button>
          </div>
          <button type="button" className="pf-fake-link" disabled>
            <span>performancefactory.app/r/{code}</span>
            <small>Copia il link</small>
          </button>
          <div className="pf-fake-qr">
            <div aria-hidden="true">QR</div>
            <p>
              Fallo inquadrare al tuo compagno: apre la registrazione con il tuo
              codice.
            </p>
          </div>
        </section>
        <button type="button" className="pf-fake-whatsapp" disabled>
          WhatsApp
        </button>
        <section className="pf-fake-list" aria-label="Stato degli inviti">
          <span className="pf-prof-kicker">Stato degli inviti</span>
          <p>Nessun invito ancora.</p>
          <small>
            I Token PF non sono denaro e non riducono il prezzo
            dell&apos;abbonamento.
          </small>
        </section>
      </div>
    </AccountScreen>
  );
}
