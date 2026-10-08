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
    </>
  );
}
