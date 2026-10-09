"use client";

import Link from "next/link";
import { PromptOverviewGrid } from "./prompt-overview-grid";
import type { PromptManagementModel } from "./use-prompt-management";

export function renderPromptOverview(model: PromptManagementModel) {
  const { openPromptMode, getPromptOverview } = model;
  return (
    <>
      <PromptOverviewGrid
        getOverview={getPromptOverview}
        onOpen={openPromptMode}
      />
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Valutazione dell&apos;assessment</h2>
            <p className="pf-muted">
              Prompt AI_ASSESSMENT che, finite le risposte, stima la R
              provvisoria di ogni driver con confidenza e motivazione.
            </p>
          </div>
          <Link className="pf-button" href="/ai-tuner/prompts/valutazione">
            Apri prompt
          </Link>
        </div>
      </section>
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Domande di calibrazione</h2>
            <p className="pf-muted">
              Prompt che a ogni round della calibrazione gratuita scrive nuove
              domande sui driver con la confidenza più bassa.
            </p>
          </div>
          <Link className="pf-button" href="/ai-tuner/prompts/calibrazione">
            Apri prompt
          </Link>
        </div>
      </section>
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Micro-test su misura</h2>
            <p className="pf-muted">
              Prompt che dopo ogni valutazione scrive per l&apos;atleta un
              micro-test pratico sui driver meno affidabili.
            </p>
          </div>
          <Link className="pf-button" href="/ai-tuner/prompts/micro-test">
            Apri prompt
          </Link>
        </div>
      </section>
      <section className="pf-panel pf-prompt-current-panel">
        <div className="pf-panel-header pf-prompt-current-header">
          <div>
            <h2>Scenari P3/P6/P12</h2>
            <p className="pf-muted">
              Prompt che a R consolidata stima il potenziale a 3, 6 e 12 mesi,
              entro i criteri versionati.
            </p>
          </div>
          <Link className="pf-button" href="/ai-tuner/prompts/potenziale">
            Apri prompt
          </Link>
        </div>
      </section>
    </>
  );
}
