/**
 * SceneHost — picks the 3D scene or the static fallback and owns the
 * node-inspector panel + pause control.
 */
import { useMemo, useState } from "react";
import NeuralScene, { type NodeSelection } from "./NeuralScene";
import NeuralFallback from "./NeuralFallback";
import { buildNetwork, LAYER_LABELS, LAYER_SIZES } from "./network";
import { hasWebGL } from "@/lib/utils";
import { Badge } from "@/components/ui/Primitives";
import { useSettings } from "@/hooks/useSettings";

const LAYER_EXPLANATIONS: Record<number, string> = {
  0: "The input layer receives the encoded question. In a real language model this is where tokenized text becomes numeric vectors that the network can process.",
  1: "Early hidden layers capture simple patterns and activations. Stacking many such layers is what makes a network deep.",
  2: "Middle hidden layers combine lower-level signals into increasingly abstract features — the depth where most representation learning happens.",
  3: "Later hidden layers prepare a task-specific representation, compressing what matters for the prediction and discarding noise.",
  4: "The output layer produces the final prediction — for a language model, a probability distribution over the next token.",
};

export interface SceneHostProps {
  className?: string;
}

export default function SceneHost({ className }: SceneHostProps) {
  const { settings, reducedMotion } = useSettings();
  const [selected, setSelected] = useState<NodeSelection | null>(null);
  const [paused, setPaused] = useState(false);

  const webglAvailable = useMemo(() => hasWebGL(), []);
  const layout = useMemo(() => buildNetwork(7), []);
  const use3D = settings.enable3D && webglAvailable;

  const onSelectNode = (sel: NodeSelection | null) => setSelected(sel);
  const onSelectFallback = (layer: number, index: number) =>
    setSelected({ layer, index, label: `${LAYER_LABELS[layer]} neuron`, position: [0, 0, 0] });

  return (
    <div className={className}>
      <div className="scanlines relative h-full w-full overflow-hidden rounded-2xl">
        {use3D ? (
          <NeuralScene paused={paused} onSelect={onSelectNode} selected={selected} />
        ) : (
          <NeuralFallback layout={layout} onSelect={onSelectFallback} reducedMotion={reducedMotion} />
        )}

        {/* scene controls */}
        <div className="absolute right-3 top-3 flex items-center gap-2">
          {!webglAvailable && <Badge tone="warn">WebGL unavailable — static fallback</Badge>}
          {!settings.enable3D && webglAvailable && <Badge tone="muted">3D disabled</Badge>}
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="rounded-lg border border-[var(--nv-border-strong)] bg-[rgba(7,10,18,0.72)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--nv-text)] backdrop-blur transition hover:border-[var(--nv-cyan)]"
            aria-pressed={paused}
          >
            {paused ? "Resume animation" : "Pause animation"}
          </button>
        </div>

        {/* educational disclaimer */}
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(60%,380px)]">
          <p className="rounded-lg border border-[var(--nv-border)] bg-[rgba(7,10,18,0.62)] px-2.5 py-1.5 text-[10.5px] leading-snug text-[var(--nv-text-muted)] backdrop-blur">
            Educational visualization of a {LAYER_SIZES.join("-")} network — it does not depict
            actual Groq model internals.
          </p>
        </div>

        {/* node inspector */}
        {selected && (
          <aside
            role="dialog"
            aria-label="Selected node details"
            className="glass glass-bright absolute bottom-3 right-3 w-[min(88%,320px)] rounded-xl p-3.5"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--nv-text)]">{selected.label}</p>
              <button
                type="button"
                className="rounded-md p-1 text-[var(--nv-text-muted)] hover:text-[var(--nv-text)]"
                onClick={() => setSelected(null)}
                aria-label="Close node inspector"
              >
                ✕
              </button>
            </div>
            <Badge tone={selected.layer === 0 ? "cyan" : selected.layer === LAYER_LABELS.length - 1 ? "violet" : "muted"}>
              Layer {selected.layer} · {LAYER_LABELS[selected.layer]}
            </Badge>
            <p className="mt-2 text-xs leading-relaxed text-[var(--nv-text-muted)]">
              {LAYER_EXPLANATIONS[selected.layer]}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
