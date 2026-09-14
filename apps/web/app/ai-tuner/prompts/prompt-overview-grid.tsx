"use client";

import { promptModes, type PromptMode } from "./prompt-model";

export type PromptOverview = {
  title: string;
  description: string;
  where: string;
  version: string;
  updatedAt: string;
};

type PromptOverviewGridProps = {
  getOverview: (mode: PromptMode) => PromptOverview;
  onOpen: (mode: PromptMode) => void;
};

export function PromptOverviewGrid({
  getOverview,
  onOpen,
}: PromptOverviewGridProps) {
  return (
    <section className="pf-panel pf-prompt-current-panel">
      <div className="pf-panel-header pf-prompt-current-header">
        <div>
          <h2>Prompt in uso</h2>
          <p className="pf-muted">
            Vedi solo i prompt attualmente usati dal sistema. Aprine uno per i
            dettagli completi e le opzioni di modifica.
          </p>
        </div>
      </div>

      <div className="pf-grid pf-prompt-overview-grid">
        {promptModes.map((item) => {
          const overview = getOverview(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className="pf-card pf-prompt-preview-card pf-prompt-overview-card"
              onClick={() => onOpen(item.id)}
            >
              <div className="pf-prompt-card-title">
                <h3>{overview.title}</h3>
              </div>
              <p>{overview.description}</p>
              <div className="pf-prompt-overview-meta">
                <span>
                  Dove viene usato
                  <strong>{overview.where}</strong>
                </span>
                <span>
                  Versione
                  <strong>{overview.version}</strong>
                </span>
                <span>
                  Ultima modifica
                  <strong>{overview.updatedAt}</strong>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
