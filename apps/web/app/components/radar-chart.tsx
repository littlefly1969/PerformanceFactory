import type { CSSProperties } from "react";

type RadarArea = {
  id: string;
  label: string;
  real: number;
  potential: number;
};

type RadarChartProps = {
  areas: RadarArea[];
  max?: number;
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

const pointFor = (index: number, total: number, value: number, max: number, radius: number, center: number) => {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  const scaled = (clamp(value, max) / max) * radius;
  return {
    x: center + Math.cos(angle) * scaled,
    y: center + Math.sin(angle) * scaled,
  };
};

const polygonPoints = (areas: RadarArea[], key: "real" | "potential", max: number, radius: number, center: number) =>
  areas
    .map((area, index) => {
      const point = pointFor(index, areas.length, area[key], max, radius, center);
      return `${point.x},${point.y}`;
    })
    .join(" ");

export function RadarChart({ areas, max = 100 }: RadarChartProps) {
  const center = 150;
  const radius = 104;
  const rings = [0.2, 0.4, 0.6, 0.8, 1];

  if (!areas.length) {
    return (
      <div className="pf-radar-empty">
        <strong>No performance profile yet</strong>
        <span>Close a questionnaire to generate the first spider chart.</span>
      </div>
    );
  }

  return (
    <div className="pf-radar-wrap">
      <div className="pf-radar-stage">
        <svg className="pf-radar" viewBox="0 0 300 300" role="img" aria-label="Performance spider chart">
          {rings.map((ring) => (
            <polygon
              key={ring}
              className="pf-radar-ring"
              points={areas
                .map((_, index) => {
                  const point = pointFor(index, areas.length, max * ring, max, radius, center);
                  return `${point.x},${point.y}`;
                })
                .join(" ")}
            />
          ))}

          {areas.map((area, index) => {
            const outer = pointFor(index, areas.length, max, max, radius, center);
            return (
              <g key={area.id}>
                <line className="pf-radar-axis" x1={center} y1={center} x2={outer.x} y2={outer.y} />
                <circle className="pf-radar-node" cx={outer.x} cy={outer.y} r="6" />
              </g>
            );
          })}

          <polygon className="pf-radar-potential" points={polygonPoints(areas, "potential", max, radius, center)} />
          <polygon className="pf-radar-real" points={polygonPoints(areas, "real", max, radius, center)} />
          {areas.map((area, index) => {
            const real = pointFor(index, areas.length, area.real, max, radius, center);
            const potential = pointFor(index, areas.length, area.potential, max, radius, center);
            return (
              <g key={`${area.id}-points`}>
                <circle className="pf-radar-dot potential" cx={potential.x} cy={potential.y} r="3.5" />
                <circle className="pf-radar-dot real" cx={real.x} cy={real.y} r="4" />
              </g>
            );
          })}
        </svg>
        {areas.map((area, index) => (
          <span
            key={`${area.id}-label`}
            className="pf-radar-pill"
            style={{ "--pf-radar-index": index, "--pf-radar-total": areas.length } as CSSProperties}
          >
            {area.label}
          </span>
        ))}
      </div>
      <div className="pf-radar-legend">
        <span><i className="real" /> Real</span>
        <span><i className="potential" /> Potential</span>
      </div>
    </div>
  );
}
