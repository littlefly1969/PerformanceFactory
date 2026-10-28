"use client";
import { FitRankingEditor } from "../../components/fit-ranking-editor";
import { AccountFrame } from "../account-frame";

/**
 * Tessera e classifiche FIT: lo stesso editor di prima. Il salvataggio
 * mantiene i suoi effetti lato server (lease, banca, ricalcolo di R); le
 * altre pagine li leggono quando si torna indietro.
 */
export default function AccountFitPage() {
  return (
    <AccountFrame title="Tessera e classifiche FIT">
      {() => (
        <section className="pf-acc-card pf-acc-fit">
          <FitRankingEditor />
        </section>
      )}
    </AccountFrame>
  );
}
