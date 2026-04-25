import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  float,
  vec2,
  vec3,
  sin,
  mix,
  smoothstep,
  length,
  dot,
  uv,
  uniform,
  texture,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ─── Tweakable constants ────────────────────────────────────────────
const TWO_PI = 6.2831853;

// Grid
const GRID_COLS = 104; // cell columns (rows derived from aspect)

// Simulation timing
const BASE_TICK_RATE = 6.5; // GoL updates per second
const INHALE_TICK_BOOST = 5.5;
const INITIAL_DENSITY = 0.18; // fraction of cells alive at start
const MAX_DELTA_SECONDS = 0.1; // clamp large frame gaps (resume/background)
const MAX_STEPS_PER_FRAME = 2; // avoid long catch-up stalls on a single frame

// Energy trail channels (dead cells fade out instead of snapping off)
const ENERGY_DECAY = 16; // red: persistent cellular body
const BIRTH_DECAY = 34; // green: new-cell flash
const INHALE_DECAY = 18; // blue: inhale-seeded bloom

// Random seeding — keeps the board alive forever
const SEED_INTERVAL = 44; // ticks between quiet background injections
const SEED_RADIUS = 2; // half-size of seeded clump
const SEED_DENSITY = 0.34; // fill ratio inside the clump
const INHALE_SEED_RADIUS = 2;
const INHALE_SEED_DENSITY = 0.62;
const INHALE_FLOW_GAIN = 3.2;
const BREATH_RESPONSE_RATE = 5.0;
const INHALE_RESPONSE_RATE = 4.2;

const COLOR_DEEP = vec3(0.006, 0.012, 0.02);
const COLOR_FIELD = vec3(0.026, 0.074, 0.086);
const COLOR_CELL_LOW = vec3(0.07, 0.2, 0.19);
const COLOR_CELL_MID = vec3(0.24, 0.62, 0.55);
const COLOR_CELL_HIGH = vec3(0.82, 0.94, 0.76);
const COLOR_INHALE = vec3(0.72, 0.96, 0.9);
const COLOR_BIRTH = vec3(0.95, 0.55, 0.36);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ─── Component ──────────────────────────────────────────────────────

export const GameOfLife = ({
  grayscale = false,
  breath,
  onReady,
}: {
  grayscale?: boolean;
  breath?: SharedValue<number>;
  onReady?: () => void;
}) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  const breathRef = useRef(breath);
  grayscaleRef.current = grayscale;
  breathRef.current = breath;

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) return;

    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;
    const rows = Math.round(GRID_COLS / aspect);
    const totalCells = GRID_COLS * rows;

    // ── CPU state ──────────────────────────────────────────────────
    const alive = new Uint8Array(totalCells);
    const nextAlive = new Uint8Array(totalCells);
    const texData = new Uint8Array(totalCells * 4); // RGBA

    // Initial random fill
    for (let i = 0; i < totalCells; i++) {
      alive[i] = Math.random() < INITIAL_DENSITY ? 1 : 0;
      const e = alive[i] * 255;
      texData[i * 4] = e;
      texData[i * 4 + 1] = 0;
      texData[i * 4 + 2] = 0;
      texData[i * 4 + 3] = 255;
    }

    const dataTex = new THREE.DataTexture(
      texData,
      GRID_COLS,
      rows,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    dataTex.minFilter = THREE.LinearFilter;
    dataTex.magFilter = THREE.LinearFilter;
    dataTex.needsUpdate = true;

    // ── GoL simulation ─────────────────────────────────────────────
    let tickCounter = 0;
    let inhaleSeedCounter = 0;
    let inhaleSeedPhase = Math.random() * TWO_PI;

    function seedCluster(
      centerX: number,
      centerY: number,
      radius: number,
      density: number,
      inhaleMarked: boolean,
    ) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          const falloff = Math.max(0, 1 - dist / (radius + 1));
          if (Math.random() < density * (0.45 + falloff * 0.75)) {
            const nx = (Math.round(centerX) + dx + GRID_COLS) % GRID_COLS;
            const ny = (Math.round(centerY) + dy + rows) % rows;
            const idx = ny * GRID_COLS + nx;
            alive[idx] = 1;
            texData[idx * 4] = 255;
            texData[idx * 4 + 1] = 255;
            if (inhaleMarked) {
              texData[idx * 4 + 2] = 255;
            }
          }
        }
      }
    }

    function seedInhale(inhalePower: number, breathLevel: number) {
      const clusters = 2 + Math.floor(inhalePower * 3);
      const minAxis = Math.min(GRID_COLS, rows);
      const ringRadius = minAxis * (0.04 + breathLevel * 0.2);
      const jitter = minAxis * 0.028;
      inhaleSeedPhase += 0.33 + inhalePower * 0.24;

      for (let i = 0; i < clusters; i++) {
        const angle = inhaleSeedPhase + (i / clusters) * TWO_PI;
        const cx =
          GRID_COLS * 0.5 +
          Math.cos(angle) * ringRadius +
          (Math.random() - 0.5) * jitter;
        const cy =
          rows * 0.5 +
          Math.sin(angle) * ringRadius +
          (Math.random() - 0.5) * jitter;
        const radius = INHALE_SEED_RADIUS + Math.floor(inhalePower * 2.5);
        seedCluster(cx, cy, radius, INHALE_SEED_DENSITY, true);
      }
    }

    function tick(inhalePower: number, breathLevel: number) {
      // Apply Conway's rules
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < GRID_COLS; x++) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = (x + dx + GRID_COLS) % GRID_COLS;
              const ny = (y + dy + rows) % rows;
              neighbors += alive[ny * GRID_COLS + nx];
            }
          }
          const idx = y * GRID_COLS + x;
          const wasAlive = alive[idx];
          nextAlive[idx] =
            (wasAlive && (neighbors === 2 || neighbors === 3)) ||
            (!wasAlive && neighbors === 3)
              ? 1
              : 0;
        }
      }

      // Update alive state + energy trail
      for (let i = 0; i < totalCells; i++) {
        const wasAlive = alive[i];
        alive[i] = nextAlive[i];
        const born = !wasAlive && alive[i];
        const prevEnergy = texData[i * 4];
        const prevBirth = texData[i * 4 + 1];
        const prevInhale = texData[i * 4 + 2];
        const e = alive[i] ? 255 : Math.max(0, prevEnergy - ENERGY_DECAY);
        const birth = born ? 255 : Math.max(0, prevBirth - BIRTH_DECAY);
        const inhale = Math.max(0, prevInhale - INHALE_DECAY);
        texData[i * 4] = e;
        texData[i * 4 + 1] = birth;
        texData[i * 4 + 2] = inhale;
      }

      if (inhalePower > 0.06) {
        inhaleSeedCounter++;
        if (inhaleSeedCounter >= 2) {
          seedInhale(inhalePower, breathLevel);
          inhaleSeedCounter = 0;
        }
      } else {
        inhaleSeedCounter = 0;
      }

      // Periodic random seeding
      tickCounter++;
      if (tickCounter >= SEED_INTERVAL) {
        tickCounter = 0;
        const cx = Math.floor(Math.random() * GRID_COLS);
        const cy = Math.floor(Math.random() * rows);
        seedCluster(cx, cy, SEED_RADIUS, SEED_DENSITY, false);
      }

      dataTex.needsUpdate = true;
    }

    // ── Three.js scene ─────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const breathU = uniform(float(0));
    const inhaleU = uniform(float(0));

    const uvCoord = uv();
    const cell = texture(dataTex, uvCoord);
    const cellEnergy = cell.r;
    const birthEnergy = cell.g;
    const inhaleEnergy = cell.b;
    const centered = uvCoord.mul(2.0).sub(1.0);
    const radial = length(vec2(centered.x.mul(aspectU), centered.y));
    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const ambientPulse = sin(timeU.mul(0.18).add(radial.mul(1.7)))
      .mul(0.5)
      .add(0.5);
    const centerHalo = float(1.0).sub(
      smoothstep(float(0.08), float(0.72), radial),
    );
    const edgeFade = float(1.0).sub(
      smoothstep(float(0.76), float(1.5), radial),
    );
    const aliveGlow = smoothstep(float(0.02), float(0.78), cellEnergy);
    const birthGlow = smoothstep(float(0.02), float(0.68), birthEnergy);
    const inhaleGlow = smoothstep(float(0.02), float(0.72), inhaleEnergy).mul(
      float(0.68).add(inhaleU.mul(0.42)),
    );
    const ambientBloom = centerHalo.mul(
      float(0.13)
        .add(ambientPulse.mul(0.05))
        .add(breathEase.mul(0.3))
        .add(inhaleU.mul(0.22)),
    );
    const fieldColor = mix(COLOR_DEEP, COLOR_FIELD, ambientBloom);
    const cellColor = mix(COLOR_CELL_LOW, COLOR_CELL_MID, aliveGlow);
    const bornColor = mix(cellColor, COLOR_BIRTH, birthGlow.mul(0.38));
    const inhaleColor = mix(bornColor, COLOR_INHALE, inhaleGlow.mul(0.7));
    const crest = smoothstep(
      float(0.46),
      float(1.0),
      aliveGlow.add(birthGlow.mul(0.36)).add(inhaleGlow.mul(0.42)),
    );
    const litColor = mix(inhaleColor, COLOR_CELL_HIGH, crest.mul(0.54));
    const body = smoothstep(
      float(0.015),
      float(0.78),
      cellEnergy.add(birthEnergy.mul(0.26)).add(inhaleEnergy.mul(0.48)),
    ).mul(edgeFade);
    const finalColor = mix(fieldColor, litColor, body).mul(
      float(0.86)
        .add(ambientPulse.mul(0.03))
        .add(breathEase.mul(0.16))
        .add(inhaleU.mul(0.12)),
    );

    // Grayscale desaturation
    const grayscaleU = uniform(float(0));
    const lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(finalColor, vec3(lum, lum, lum), grayscaleU);

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = outputColor;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Renderer
    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let simulationTime = 0;
    let accumulator = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let inhalePower = 0;

    function animate() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
      const targetBreath = breathRef.current?.value ?? 0.0;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        delta,
      );
      inhalePower = damp(
        inhalePower,
        clampNumber(breathDelta * INHALE_FLOW_GAIN, 0.0, 1.0),
        INHALE_RESPONSE_RATE,
        delta,
      );
      simulationTime += delta;
      (timeU as unknown as { value: number }).value = simulationTime;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (inhaleU as unknown as { value: number }).value = inhalePower;
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;

      // Fixed-step simulation with bounded catch-up to prevent resume stalls.
      const tickRate = BASE_TICK_RATE + inhalePower * INHALE_TICK_BOOST;
      const tickInterval = 1.0 / tickRate;
      accumulator += delta;
      let steps = 0;
      while (accumulator >= tickInterval && steps < MAX_STEPS_PER_FRAME) {
        tick(inhalePower, smoothedBreath);
        accumulator -= tickInterval;
        steps += 1;
      }

      // Drop excess backlog (e.g. after app resumes) instead of stalling.
      if (steps === MAX_STEPS_PER_FRAME && accumulator >= tickInterval) {
        accumulator = 0;
      }

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "LivingBloom",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      dataTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
