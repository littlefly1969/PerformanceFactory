import { AccountScreen, AccountTopBar } from "../../_account/account-shell";
import "../_profile/profile.css";
import "../_profile/fake-pages.css";

/**
 * Unisciti alla community: pagina di sola presentazione. Il gruppo non è
 * ancora attivo, quindi l'unico comando che funziona è la freccia indietro.
 */
export default function CommunityPage() {
  return (
    <AccountScreen
      top={<AccountTopBar title="Community" back="/journey/profilo" />}
      footer={
        <button type="button" className="pf-acc-pill is-lime" disabled>
          <span>Entra nel gruppo</span>
          <span aria-hidden="true">→</span>
        </button>
      }
    >
      <div className="pf-fake">
        <h1>Unisciti alla community</h1>
        <p className="pf-fake-lead">
          Atleti, coach e circoli Performance Factory in un unico gruppo:
          domande, partite da organizzare e novità dal programma.
        </p>
        <p className="pf-fake-soon" role="note">
          In arrivo: il gruppo non è ancora aperto.
        </p>
      </div>
    </AccountScreen>
  );
}
