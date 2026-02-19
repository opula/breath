import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  float,
  vec3,
  cos,
  mix,
  dot,
  uv,
  uniform,
  texture,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// ─── Tweakable constants ────────────────────────────────────────────
const TWO_PI = 6.2831853;

// Grid
const GRID_COLS = 96; // cell columns (rows derived from aspect)

// Simulation timing
const TICK_RATE = 10; // GoL updates per second
const INITIAL_DENSITY = 0.3; // fraction of cells alive at start
const MAX_DELTA_SECONDS = 0.1; // clamp large frame gaps (resume/background)
const MAX_STEPS_PER_FRAME = 2; // avoid long catch-up stalls on a single frame

// Energy trail (dead cells fade out instead of snapping off)
const ENERGY_DECAY = 30; // energy lost per tick when dead (out of 255)

// Random seeding — keeps the board alive forever
const SEED_INTERVAL = 25; // ticks between injections
const SEED_RADIUS = 3; // half-size of seeded clump
const SEED_DENSITY = 0.45; // fill ratio inside the clump

// Cosine gradient palette (Echo style)
const COLOR_A = vec3(0.0, 0.5, 0.5);
const COLOR_B = vec3(0.0, 0.5, 0.5);
const COLOR_C = vec3(0.0, 0.5, 0.333);
const COLOR_D = vec3(0.0, 0.5, 0.667);

// ─── Component ──────────────────────────────────────────────────────

export const GameOfLife = ({ grayscale = false }: { grayscale?: boolean }) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

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
      texData[i * 4 + 1] = e;
      texData[i * 4 + 2] = e;
      texData[i * 4 + 3] = 255;
    }

    const dataTex = new THREE.DataTexture(
      texData,
      GRID_COLS,
      rows,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    dataTex.minFilter = THREE.NearestFilter;
    dataTex.magFilter = THREE.NearestFilter;
    dataTex.needsUpdate = true;

    // ── GoL simulation ─────────────────────────────────────────────
    let tickCounter = 0;

    function tick() {
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
        alive[i] = nextAlive[i];
        const prev = texData[i * 4];
        const e = alive[i] ? 255 : Math.max(0, prev - ENERGY_DECAY);
        texData[i * 4] = e;
        texData[i * 4 + 1] = e;
        texData[i * 4 + 2] = e;
      }

      // Periodic random seeding
      tickCounter++;
      if (tickCounter >= SEED_INTERVAL) {
        tickCounter = 0;
        const cx = Math.floor(Math.random() * GRID_COLS);
        const cy = Math.floor(Math.random() * rows);
        for (let dy = -SEED_RADIUS; dy <= SEED_RADIUS; dy++) {
          for (let dx = -SEED_RADIUS; dx <= SEED_RADIUS; dx++) {
            if (Math.random() < SEED_DENSITY) {
              const nx = (cx + dx + GRID_COLS) % GRID_COLS;
              const ny = (cy + dy + rows) % rows;
              const idx = ny * GRID_COLS + nx;
              alive[idx] = 1;
              texData[idx * 4] = 255;
              texData[idx * 4 + 1] = 255;
              texData[idx * 4 + 2] = 255;
            }
          }
        }
      }

      dataTex.needsUpdate = true;
    }

    // ── Three.js scene ─────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const timeU = uniform(float(0));

    // Sample the grid texture — NearestFilter gives crisp square cells
    const cellEnergy = texture(dataTex, uv()).r;

    // Cosine palette slowly shifting over time
    const palT = timeU.mul(0.08);
    const palColor = COLOR_A.add(
      COLOR_B.mul(cos(float(TWO_PI).mul(COLOR_C.mul(palT).add(COLOR_D)))),
    );

    const finalColor = palColor.mul(cellEnergy);

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
    const tickInterval = 1.0 / TICK_RATE;

    function animate() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
      simulationTime += delta;
      (timeU as unknown as { value: number }).value = simulationTime;
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;

      // Fixed-step simulation with bounded catch-up to prevent resume stalls.
      accumulator += delta;
      let steps = 0;
      while (accumulator >= tickInterval && steps < MAX_STEPS_PER_FRAME) {
        tick();
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

    renderer.init().then(() => {
      if (!disposed) {
        renderer.setAnimationLoop(animate);
      }
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
