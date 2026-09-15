"use client";

import { TestRunHistoryItem, formatDate } from "./test-cases-model";
import type { TestCasesModel } from "./use-test-cases";

export function renderTestHistory(
  model: TestCasesModel,
  {
    title,
    description,
    emptyMessage,
    items,
    showCase,
  }: {
    title: string;
    description: string;
    emptyMessage: string;
    items: TestRunHistoryItem[];
    showCase?: boolean;
  },
) {
  const { removeHistoryItem, openHistoryResult } = model;
  return (
    <section className="pf-panel pf-test-history-panel">
      <div className="pf-panel-header">
        <div>
          <h2>{title}</h2>
          <p className="pf-muted">{description}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="pf-alert warning">{emptyMessage}</div>
      ) : (
        <div className="pf-card pf-test-history-table-wrap">
          <table className="pf-table pf-test-history-table">
            <thead>
              <tr>
                <th>Data</th>
                {showCase && <th>Caso</th>}
                <th>Prompt</th>
                <th>Versione</th>
                <th>Provider / modello</th>
                <th>Tempo</th>
                <th>Token</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="pf-clickable-table-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => openHistoryResult(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openHistoryResult(item);
                    }
                  }}
                >
                  <td>{formatDate(item.createdAt)}</td>
                  {showCase && <td>{item.snapshot.caseLabel}</td>}
                  <td>{item.snapshot.promptName}</td>
                  <td>{item.snapshot.version}</td>
                  <td>
                    {item.result.provider} / {item.result.model}
                  </td>
                  <td>{item.result.latencyMs} ms</td>
                  <td>{item.result.totalTokens ?? "n/d"}</td>
                  <td>
                    <button
                      type="button"
                      className="pf-button-secondary pf-history-remove-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeHistoryItem(item.id);
                      }}
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
