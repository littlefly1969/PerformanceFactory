import Link from "next/link";
import type { Evaluation } from "../journey-types";
import { AccountScreen, PillLink } from "./account-shell";
import { MiniSpider } from "./spiders";

/**
 * Fine dell'assessment (immagine 9): il profilo provvisorio è pronto. È una
 * prima stima, che si affina con micro-test e verifiche nelle singole aree.
 */
export function ProvisionalReady({
  evaluation,
  onHome,
}: {
  evaluation: Evaluation;
  onHome: () => void;
}) {
  return (
    <AccountScreen>
      <section className="pf-acc-ready" aria-labelledby="pf-acc-ready">
        <span className="pf-acc-kicker">Prime domande completate</span>
        <h1 id="pf-acc-ready" className="pf-acc-title">
          Il tuo profilo provvisorio è pronto.
        </h1>
        <div className="pf-acc-ready-spider">
          <MiniSpider
            real={evaluation.drivers.map((d) => d.score)}
            scale={evaluation.scale}
            provisional
            size={200}
          />
        </div>
        <span className="pf-acc-badge">Profilo provvisorio</span>
        <p>
          È una prima stima. Si affina mentre ti alleni, con i micro-test e con
          le verifiche nelle singole aree. Dove sappiamo meno, il tratto è più
          tenue.
        </p>
        <PillLink href="/journey/profilo" tone="lime">
          Vai al tuo profilo
        </PillLink>
        <Link
          href="/journey"
          className="pf-acc-link"
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          Torna alla home
        </Link>
      </section>
    </AccountScreen>
  );
}
