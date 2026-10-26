import type { Objective } from "../_components/athlete-types";
import {
  objectiveProgress,
  objectiveSources,
  objectiveValue,
} from "../_components/session-format";

export function ObjectiveCard({
  objective,
  compact = false,
}: {
  objective: Objective;
  compact?: boolean;
}) {
  const unit = objective.unit ? ` ${objective.unit}` : "";
  const target =
    objective.target === null
      ? (objective.targetLabel ?? "—")
      : `${objectiveValue(objective.current)} → ${objectiveValue(objective.target)}${unit}`;
  const source = `Fonte: ${objectiveSources[objective.source]}`;
  if (compact)
    return (
      <section className="pfs-card pfs-objective is-compact">
        <div className="pfs-objective-head">
          <span className="pfs-kicker">Obiettivo · {objective.area}</span>
          <small>{objective.deadline}</small>
        </div>
        <strong>
          {objective.title} · {target}
        </strong>
        <small>{source}</small>
      </section>
    );
  return (
    <section className="pfs-card pfs-objective">
      <div className="pfs-objective-head">
        <span className="pfs-kicker">{objective.area}</span>
        <small>{objective.deadline}</small>
      </div>
      <h2>{objective.title}</h2>
      <p className="pfs-objective-value">{target}</p>
      <div
        className="pfs-progress"
        role="progressbar"
        aria-label={`Avanzamento ${objective.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(objectiveProgress(objective) * 100)}
      >
        <i style={{ width: `${objectiveProgress(objective) * 100}%` }} />
      </div>
      <small>{source}</small>
    </section>
  );
}
