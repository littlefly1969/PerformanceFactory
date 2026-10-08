import type { Evaluation } from "./journey-types";

/** Etichetta leggibile: la precisione mostrata non supera quella dei dati. */
export function confidenceLabel(confidence: number) {
  if (confidence < 40) return "bassa";
  if (confidence < 70) return "media";
  return "alta";
}

/** Spider della R provvisoria: più la confidence è bassa, più il tratto è tenue. */
function ProvisionalRadar({ evaluation }: { evaluation: Evaluation }) {
  const { drivers, scale } = evaluation;
  const ratio = (score: number) =>
    scale.max > scale.min ? (score - scale.min) / (scale.max - scale.min) : 0;
  const point = (value: number, i: number) => {
    const angle = (i * Math.PI * 2) / drivers.length - Math.PI / 2;
    return [150 + Math.cos(angle) * value * 105, 150 + Math.sin(angle) * value * 105];
  };
  return (
    <svg
      viewBox="0 0 300 300"
      className="pf4-radar"
      role="img"
      aria-label="Performance reale provvisoria per driver"
    >
      {[0.25, 0.5, 0.75, 1].map((s) => (
        <polygon
          key={s}
          points={drivers.map((_, i) => point(s, i).join(",")).join(" ")}
          fill="none"
          stroke="#deded8"
        />
      ))}
      <polygon
        data-testid="provisional-r"
        points={drivers.map((d, i) => point(ratio(d.score), i).join(",")).join(" ")}
        fill="#0b0b0c"
        fillOpacity={0.15 + (0.6 * evaluation.overallConfidence) / 100}
        stroke="#0b0b0c"
        strokeDasharray={evaluation.overallConfidence < 70 ? "4 3" : undefined}
      />
      {drivers.map((d, i) => {
        const [x, y] = point(ratio(d.score), i);
        const [lx, ly] = point(1.24, i);
        return (
          <g key={d.id}>
            <circle cx={x} cy={y} r="4" fill="#0b0b0c" opacity={0.3 + (0.7 * d.confidence) / 100} />
            <text x={lx} y={ly} textAnchor="middle" fontSize="10">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ProvisionalEvaluation({ evaluation }: { evaluation: Evaluation }) {
  return (
    <section className="pf4-body pf4-performance">
      <span className="pf4-kicker">
        {evaluation.status === "CONSOLIDATED"
          ? "Valutazione consolidata"
          : (evaluation.sequence ?? 1) > 1
            ? "Valutazione aggiornata · provvisoria"
            : "Prima valutazione · provvisoria"}
      </span>
      <h1>Ecco dove sei oggi.</h1>
      <p>{evaluation.summary}</p>
      <ProvisionalRadar evaluation={evaluation} />
      <p className="pf4-confidence-note">
        Affidabilità complessiva {confidenceLabel(evaluation.overallConfidence)} (
        {evaluation.overallConfidence}/100). Più il tratto è pieno, più la stima è
        solida.
      </p>
      <div className="pf4-driver-scores pf4-evaluation-drivers">
        {evaluation.drivers.map((d, i) => (
          <div key={d.id}>
            <header>
              <span>
                {String(i + 1).padStart(2, "0")} · {d.name}
              </span>
              <strong>
                {Math.round(d.score)}{" "}
                <small>affidabilità {confidenceLabel(d.confidence)}</small>
              </strong>
            </header>
            <div className="pf4-score-track">
              <span
                style={{
                  width: `${((d.score - evaluation.scale.min) / (evaluation.scale.max - evaluation.scale.min || 1)) * 100}%`,
                }}
              />
            </div>
            <p>{d.rationale}</p>
            {d.evidenceGaps.length > 0 && (
              <p className="pf4-gaps">Per affinare: {d.evidenceGaps.join(" ")}</p>
            )}
          </div>
        ))}
      </div>
      {evaluation.status !== "CONSOLIDATED" && (
        <p>
          È una stima basata sulle tue risposte. Diventerà più precisa con le
          prossime domande; il tuo potenziale verrà calcolato solo quando la
          valutazione sarà consolidata.
        </p>
      )}
    </section>
  );
}
