/**
 * 3D Embedding Space — optional vector-space explorer.
 *
 * When real trace data exists, points are a PCA projection of the ACTUAL
 * embeddings returned by the backend. Without data, an explicitly-labelled
 * conceptual illustration is shown. The two modes are never mixed.
 */
import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { api } from "@/lib/api";
import { useToasts } from "@/hooks/useToasts";
import { Badge, Panel } from "@/components/ui/Primitives";
import { Button } from "@/components/ui/Button";
import { mulberry32 } from "@/lib/utils";
import type { TraceResponse } from "@/types";

interface PointSpec {
  position: [number, number, number];
  color: string;
  label: string;
  selected: boolean;
  similarity: number | null;
}

/* --------------------------- 3D primitives --------------------------- */

function DataPoint({ spec, onHover }: { spec: PointSpec; onHover: (s: PointSpec | null) => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const selected = spec.selected;
  useFrame(({ clock }) => {
    if (mesh.current && selected) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.18;
      mesh.current.scale.setScalar(s);
    }
  });
  return (
    <mesh
      ref={mesh}
      position={spec.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(spec);
      }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[selected ? 0.22 : 0.14, 20, 20]} />
      <meshStandardMaterial
        color={spec.color}
        emissive={spec.color}
        emissiveIntensity={selected ? 1.4 : 0.7}
        roughness={0.3}
      />
      <Html distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-md border border-[var(--nv-border)] bg-[rgba(7,10,18,0.85)] px-1.5 py-0.5 text-[10px] text-[var(--nv-text)]">
          {spec.label}
          {spec.similarity != null && (
            <span className="ml-1 font-mono text-[var(--nv-cyan)]">{spec.similarity.toFixed(3)}</span>
          )}
        </div>
      </Html>
    </mesh>
  );
}

function Scene({ points, queryPoint, autoRotate }: { points: PointSpec[]; queryPoint: PointSpec | null; autoRotate: boolean }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[6, 6, 6]} intensity={40} distance={40} decay={2} color="#42E8F5" />
      <pointLight position={[-6, -4, -6]} intensity={30} distance={40} decay={2} color="#9875FF" />
      {queryPoint && <DataPoint spec={queryPoint} onHover={() => undefined} />}
      {points.map((p, i) => (
        <DataPoint key={i} spec={p} onHover={() => undefined} />
      ))}
      {/* connect the query to its retrieved chunks */}
      {queryPoint &&
        points
          .filter((p) => p.selected)
          .map((p, i) => (
            <Line
              key={i}
              points={[queryPoint.position, p.position]}
              color="#42E8F5"
              lineWidth={1.4}
              transparent
              opacity={0.65}
            />
          ))}
      <gridHelper args={[16, 16, "#16305a", "#0c1a33"]} position={[0, -3.2, 0]} />
      <OrbitControls
        enablePan={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        minDistance={4}
        maxDistance={18}
        makeDefault
      />
    </>
  );
}

/* --------------------------- conceptual fallback --------------------------- */

function conceptualPoints(): { points: PointSpec[]; query: PointSpec } {
  const rand = mulberry32(42);
  const clusters = [
    { center: [2.2, 1.4, 0.8], color: "#42E8F5", name: "cnn-papers" },
    { center: [-2.0, 0.6, 1.8], color: "#9875FF", name: "rnn-family" },
    { center: [0.4, -1.8, -1.6], color: "#5EEAD4", name: "optimizers" },
  ];
  const points: PointSpec[] = [];
  clusters.forEach((c) => {
    for (let i = 0; i < 7; i++) {
      points.push({
        position: [
          c.center[0] + (rand() - 0.5) * 2.4,
          c.center[1] + (rand() - 0.5) * 2.2,
          c.center[2] + (rand() - 0.5) * 2.4,
        ],
        color: c.color,
        label: `${c.name} · chunk ${i + 1}`,
        selected: i < 2,
        similarity: null,
      });
    }
  });
  const query: PointSpec = {
    position: [0.6, 0.4, 0.5],
    color: "#EAF2FF",
    label: "question (illustrative)",
    selected: false,
    similarity: null,
  };
  return { points, query };
}

/* --------------------------- page --------------------------- */

export default function EmbeddingSpacePage() {
  const [question, setQuestion] = useState("What is the difference between RNNs and GRUs?");
  const [trace, setTrace] = useState<TraceResponse | null>(null);
  const [running, setRunning] = useState(false);
  const { push } = useToasts();

  const run = async () => {
    const q = question.trim();
    if (!q || running) return;
    setRunning(true);
    try {
      const res = await api.trace({ question: q });
      setTrace(res);
      if (res.status !== "ok") push("info", res.status === "empty" ? "Nothing to retrieve" : "Trace unavailable", res.detail ?? undefined);
    } catch (e) {
      push("error", "Trace failed", e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setRunning(false);
    }
  };

  const { points, query, real } = useMemo(() => {
    if (trace?.status === "ok" && trace.candidates.length > 0 && trace.query_point) {
      const pts: PointSpec[] = trace.candidates.map((c, i) => ({
        position: [
          c.projection?.[0] ?? 0,
          c.projection?.[1] ?? 0,
          c.projection?.[2] ?? 0,
        ] as [number, number, number],
        color: c.selected_by_mmr ? "#42E8F5" : "#6c7ba6",
        label: `${c.document}${c.page != null ? ` · p.${c.page}` : ""} · #${i + 1}`,
        selected: c.selected_by_mmr,
        similarity: c.similarity,
      }));
      return {
        points: pts,
        query: {
          position: trace.query_point as [number, number, number],
          color: "#EAF2FF",
          label: "your question",
          selected: false,
          similarity: null,
        } as PointSpec,
        real: true,
      };
    }
    const c = conceptualPoints();
    return { points: c.points, query: c.query, real: false };
  }, [trace]);

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--nv-text)]">3D Embedding Space</h2>
          <p className="mt-0.5 text-xs text-[var(--nv-text-muted)]">
            {real
              ? `Live PCA projection of ${trace?.query_embedding_dim}-dimensional embeddings — an approximation of the original space.`
              : "Conceptual illustration — run a trace to project REAL embeddings from your vector store."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {real ? <Badge tone="ok">real embeddings (PCA)</Badge> : <Badge tone="warn">conceptual illustration</Badge>}
        </div>
      </div>

      <Panel bright className="flex gap-2 p-2">
        <label htmlFor="embed-question" className="sr-only">
          Question to project
        </label>
        <input
          id="embed-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          maxLength={4000}
          className="h-10 flex-1 rounded-xl border border-transparent bg-transparent px-3 text-sm text-[var(--nv-text)] focus:outline-none"
        />
        <Button onClick={() => void run()} loading={running}>
          Project & retrieve
        </Button>
      </Panel>

      <Panel className="relative min-h-[320px] flex-1 overflow-hidden">
        <Canvas dpr={[1, 1.75]} camera={{ position: [7, 5, 8], fov: 48 }} gl={{ antialias: true, alpha: true }}>
          <Scene points={points} queryPoint={query} autoRotate={!running} />
        </Canvas>
        {/* legend */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 rounded-xl border border-[var(--nv-border)] bg-[rgba(7,10,18,0.72)] p-2.5 text-[10.5px] text-[var(--nv-text-muted)] backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#EAF2FF]" /> your question
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#42E8F5]" /> MMR-selected chunk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#6c7ba6]" /> candidate chunk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-[#42E8F5]" /> retrieved link
          </span>
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 max-w-[60%] rounded-lg border border-[var(--nv-border)] bg-[rgba(7,10,18,0.72)] px-2.5 py-1.5 text-[10.5px] text-[var(--nv-text-muted)] backdrop-blur">
          Drag to orbit · scroll to zoom. 3D positions are PCA-compressed; true distances live in the
          original high-dimensional space.
        </p>
      </Panel>
    </div>
  );
}
