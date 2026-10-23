/**
 * NeuralScene — the interactive 3D neural network.
 *
 * - depth-separated layers of luminous neurons (instanced rendering)
 * - additive connection lines + particles flowing along edges
 * - pointer parallax camera, hover highlighting, click-to-inspect
 * - pause control; reduced-motion renders a single static frame
 *
 * This is an educational visualization of how information flows through a
 * neural model. It does not represent actual Groq model internals.
 */
import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, Instances, Instance, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { buildNetwork, LAYER_LABELS, layerColor, type NetworkLayout } from "./network";

export interface NodeSelection {
  layer: number;
  index: number;
  label: string;
  position: [number, number, number];
}

interface SceneProps {
  paused: boolean;
  onSelect: (sel: NodeSelection | null) => void;
  selected: NodeSelection | null;
}

const PARTICLE_COUNT = 90;

function NetworkBody({ paused, onSelect, selected }: SceneProps) {
  const layout: NetworkLayout = useMemo(() => buildNetwork(7), []);
  const { nodes, edges } = layout;
  const totalLayers = LAYER_LABELS.length;

  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  /* ---- flowing particles along edges ------------------------------ */
  const particleData = useMemo(() => {
    const rand = (() => {
      let s = 99;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    })();
    const items = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      edge: Math.floor(rand() * edges.length),
      t: rand(),
      speed: 0.08 + rand() * 0.16,
      offset: i,
    }));
    return { items, rand };
  }, [edges.length]);

  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);

  const edgePositions = useMemo(() => {
    const arr = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      const a = nodes[e.a];
      const b = nodes[e.b];
      arr.set([a.x, a.y, a.z], i * 6);
      arr.set([b.x, b.y, b.z], i * 6 + 3);
    });
    return arr;
  }, [edges, nodes]);

  const edgeColors = useMemo(() => {
    const arr = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      const c1 = layerColor(e.layer, totalLayers - 1);
      const c2 = layerColor(e.layer + 1, totalLayers - 1);
      arr.set(c1, i * 6);
      arr.set(c2, i * 6 + 3);
    });
    return arr;
  }, [edges, totalLayers]);
  const colors = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const [r, g, b] = layerColor(edges[particleData.items[i].edge]?.layer ?? 0, totalLayers - 1);
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    return arr;
  }, [edges, particleData, totalLayers]);

  useFrame((state, delta) => {
    const dt = paused ? 0 : Math.min(delta, 0.05);
    const time = state.clock.elapsedTime;

    // Slow orbital drift of the whole network.
    if (groupRef.current && !paused) {
      groupRef.current.rotation.y = Math.sin(time * 0.07) * 0.22;
      groupRef.current.rotation.x = Math.sin(time * 0.05) * 0.05;
    }

    // Pointer parallax (works even when paused — it is input, not animation).
    const cam = state.camera;
    const targetX = state.pointer.x * 0.9;
    const targetY = 0.4 - state.pointer.y * 0.55;
    cam.position.x += (targetX - cam.position.x) * 0.045;
    cam.position.y += (targetY - cam.position.y) * 0.045;
    cam.lookAt(0, 0, 0);

    // Advance particles along their edges.
    if (dt > 0) {
      const geo = particlesRef.current?.geometry;
      const attr = geo?.getAttribute("position") as THREE.BufferAttribute | undefined;
      particleData.items.forEach((p, i) => {
        p.t = (p.t + p.speed * dt) % 1;
        const edge = edges[p.edge];
        if (!edge || !attr) return;
        const a = nodes[edge.a];
        const b = nodes[edge.b];
        const w = Math.sin(p.t * Math.PI); // ease in-out along the edge
        positions[i * 3] = a.x + (b.x - a.x) * p.t;
        positions[i * 3 + 1] = a.y + (b.y - a.y) * p.t + w * 0.02;
        positions[i * 3 + 2] = a.z + (b.z - a.z) * p.t;
      });
      attr?.copyArray(positions);
      if (attr) attr.needsUpdate = true;
    }
  });

  /* ---- interaction -------------------------------------------------- */
  const handleOver = (e: ThreeEvent<PointerEvent>, nodeIdx: number) => {
    e.stopPropagation();
    setHovered(nodeIdx);
    document.body.style.cursor = "pointer";
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(null);
    document.body.style.cursor = "auto";
  };
  const handleClick = (e: ThreeEvent<MouseEvent>, nodeIdx: number) => {
    e.stopPropagation();
    const node = nodes[nodeIdx];
    onSelect({
      layer: node.layer,
      index: node.index,
      label: `${LAYER_LABELS[node.layer]} neuron`,
      position: [node.x, node.y, node.z],
    });
  };

  return (
    <group ref={groupRef}>
      {/* neurons */}
      <Instances limit={nodes.length} range={nodes.length} castShadow={false}>
        <sphereGeometry args={[0.085, 20, 20]} />
        <meshStandardMaterial
          vertexColors={false}
          color="#bfeaff"
          emissive="#37cfe0"
          emissiveIntensity={0.85}
          roughness={0.25}
          metalness={0.1}
        />
        {nodes.map((n, i) => {
          const [r, g, b] = layerColor(n.layer, totalLayers - 1);
          const isHovered = hovered === i;
          const isSelected =
            selected != null && selected.layer === n.layer && selected.index === n.index;
          return (
            <Instance
              key={i}
              color={new THREE.Color(r, g, b)}
              position={[n.x, n.y, n.z]}
              scale={isHovered || isSelected ? 1.65 : 1}
              onPointerOver={(e) => handleOver(e, i)}
              onPointerOut={handleOut}
              onClick={(e) => handleClick(e, i)}
            />
          );
        })}
      </Instances>

      {/* connections */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={edges.length * 2}
            array={edgePositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={edges.length * 2}
            array={edgeColors}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* flowing signal particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-color" count={PARTICLE_COUNT} array={colors} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          size={0.075}
          vertexColors
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* hover tooltip */}
      {hovered != null && (
        <Html position={[nodes[hovered].x + 0.25, nodes[hovered].y + 0.3, nodes[hovered].z]} center={false}>
          <div className="pointer-events-none -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--nv-border-strong)] bg-[rgba(7,10,18,0.92)] px-2.5 py-1.5 text-[11px] text-[var(--nv-text)] shadow-glowCyan backdrop-blur">
            <span className="font-medium">{LAYER_LABELS[nodes[hovered].layer]}</span>
            <span className="text-[var(--nv-text-muted)]"> · neuron #{nodes[hovered].index + 1}</span>
            <span className="ml-1 text-[var(--nv-cyan)]">click to inspect</span>
          </div>
        </Html>
      )}

      {/* atmosphere */}
      <Sparkles count={90} scale={[11, 6.5, 6]} size={1.7} speed={paused ? 0 : 0.22} opacity={0.45} color="#42E8F5" />
      <Grid
        position={[0, -2.6, 0]}
        args={[24, 24]}
        cellSize={0.7}
        cellThickness={0.6}
        cellColor="#12203c"
        sectionSize={3.5}
        sectionThickness={1}
        sectionColor="#1c3355"
        fadeDistance={26}
        fadeStrength={1.4}
        infiniteGrid
      />

      {/* ambient lighting rig */}
      <ambientLight intensity={0.35} />
      <pointLight position={[5, 4, 5]} intensity={30} distance={30} decay={2} color="#42E8F5" />
      <pointLight position={[-5, -2, -4]} intensity={26} distance={30} decay={2} color="#9875FF" />
      <directionalLight position={[0, 6, 8]} intensity={0.5} color="#EAF2FF" />
    </group>
  );
}

export default function NeuralScene(props: SceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.5, 7.6], fov: 50 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-label="Interactive 3D neural network visualization"
      role="img"
    >
      <NetworkBody {...props} />
    </Canvas>
  );
}
