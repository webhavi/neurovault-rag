/**
 * Deterministic neural-network layout shared by the 3D scene and the
 * CSS fallback, so the fallback looks like the same "lab".
 *
 * EDUCATIONAL NOTE (surfaced in the UI too): this is an illustrative network
 * geometry — it does NOT depict the internals of the Groq model.
 */
import { mulberry32 } from "@/lib/utils";

export interface Node3 {
  x: number;
  y: number;
  z: number;
  layer: number;
  index: number;
}

export interface Edge3 {
  a: number; // node index
  b: number;
  layer: number;
}

export const LAYER_SIZES = [5, 9, 13, 9, 4];
export const LAYER_LABELS = ["Input", "Hidden 1", "Hidden 2", "Hidden 3", "Output"];

export interface NetworkLayout {
  nodes: Node3[];
  edges: Edge3[];
  layerStart: number[];
}

export function buildNetwork(seed = 7): NetworkLayout {
  const rand = mulberry32(seed);
  const nodes: Node3[] = [];
  const layerStart: number[] = [];
  const L = LAYER_SIZES.length;

  for (let l = 0; l < L; l++) {
    layerStart.push(nodes.length);
    const count = LAYER_SIZES[l];
    const x = (l - (L - 1) / 2) * 2.35;
    const spread = 0.55 + count * 0.155; // ring radius grows with node count
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + l * 0.35;
      const r = count === 1 ? 0 : spread;
      nodes.push({
        x: x + (rand() - 0.5) * 0.22,
        y: Math.sin(angle) * r + (rand() - 0.5) * 0.3,
        z: Math.cos(angle) * r * 0.78 + (rand() - 0.5) * 0.3,
        layer: l,
        index: i,
      });
    }
  }

  const edges: Edge3[] = [];
  for (let l = 0; l < L - 1; l++) {
    const from = layerStart[l];
    const to = layerStart[l + 1];
    const fromCount = LAYER_SIZES[l];
    const toCount = LAYER_SIZES[l + 1];
    for (let i = 0; i < fromCount; i++) {
      const connections = 2 + Math.floor(rand() * 2);
      const chosen = new Set<number>();
      for (let c = 0; c < connections; c++) {
        chosen.add(Math.floor(rand() * toCount));
      }
      for (const j of chosen) {
        edges.push({ a: from + i, b: to + j, layer: l });
      }
    }
  }
  return { nodes, edges, layerStart };
}

/** Blend cyan -> violet across layer depth (returns [r,g,b] 0..1). */
export function layerColor(layer: number, total: number): [number, number, number] {
  const t = total <= 1 ? 0 : layer / (total - 1);
  const cyan = [0.26, 0.91, 0.96];
  const violet = [0.6, 0.46, 1.0];
  return [
    cyan[0] + (violet[0] - cyan[0]) * t,
    cyan[1] + (violet[1] - cyan[1]) * t,
    cyan[2] + (violet[2] - cyan[2]) * t,
  ];
}

/** Hex string version for SVG/CSS fallback. */
export function layerHex(layer: number, total: number): string {
  const [r, g, b] = layerColor(layer, total).map((v) => Math.round(v * 255));
  return `rgb(${r}, ${g}, ${b})`;
}
