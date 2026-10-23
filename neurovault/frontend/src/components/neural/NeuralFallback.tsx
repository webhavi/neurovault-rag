/**
 * Static SVG neural-network fallback used when WebGL is unavailable or the
 * user disabled 3D. Mirrors the same layered layout as the 3D scene.
 */
import { LAYER_LABELS, LAYER_SIZES, layerHex, type NetworkLayout } from "./network";

interface Props {
  layout: NetworkLayout;
  onSelect?: (layer: number, index: number) => void;
  reducedMotion?: boolean;
}

export default function NeuralFallback({ layout, onSelect, reducedMotion }: Props) {
  const { nodes, edges, layerStart } = layout;
  const totalLayers = LAYER_LABELS.length;

  // Project 3D layout to a 2D viewBox.
  const project = (x: number, y: number, z: number) => ({
    cx: 300 + x * 62 - z * 14,
    cy: 170 + y * 40 - z * 8,
  });

  return (
    <div className="relative h-full w-full lab-grid" aria-label="Static neural network illustration" role="img">
      <svg viewBox="0 0 600 340" className="h-full w-full">
        <defs>
          <radialGradient id="nvGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#42E8F5" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#42E8F5" stopOpacity="0" />
          </radialGradient>
        </defs>
        {edges.map((e, i) => {
          const a = project(nodes[e.a].x, nodes[e.a].y, nodes[e.a].z);
          const b = project(nodes[e.b].x, nodes[e.b].y, nodes[e.b].z);
          return (
            <line
              key={i}
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              stroke={layerHex(e.layer, totalLayers - 1)}
              strokeOpacity={0.22}
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n, i) => {
          const p = project(n.x, n.y, n.z);
          const color = layerHex(n.layer, totalLayers - 1);
          return (
            <g
              key={i}
              transform={`translate(${p.cx}, ${p.cy})`}
              className={reducedMotion ? undefined : "nv-fallback-node"}
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={() => onSelect?.(n.layer, n.index)}
            >
              <circle r={11} fill="url(#nvGlow)" opacity={0.5} />
              <circle r={4.2} fill={color} />
            </g>
          );
        })}
        {LAYER_LABELS.map((label, l) => {
          const start = layerStart[l];
          const end = layerStart[l + 1] ?? nodes.length;
          const mid = nodes[Math.floor((start + end) / 2)];
          if (!mid) return null;
          const p = project(mid.x, mid.y, mid.z);
          return (
            <text
              key={label}
              x={p.cx}
              y={318}
              textAnchor="middle"
              fontSize={10.5}
              fill="var(--nv-text-muted)"
              fontFamily="Inter, sans-serif"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="absolute left-3 top-3 rounded-lg border border-[var(--nv-border)] bg-[rgba(7,10,18,0.7)] px-2.5 py-1.5 text-[11px] text-[var(--nv-text-muted)]">
        Static fallback {LAYER_SIZES.join("·")} — enable 3D for the full scene
      </div>
    </div>
  );
}
