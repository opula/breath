import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { StorageBufferAttribute, PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  vec3,
  vec4,
  sin,
  fract,
  floor,
  mix,
  smoothstep,
  pow,
  dot,
  uniform,
  attribute,
  positionLocal,
} from "three/tsl";
import tgpu from "typegpu";
import type { TgpuGuardedComputePipeline, TgpuRoot, TgpuUniform } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  COSMIC FLIGHT (TypeGPU proof-of-concept) — same scene as
//  Particles.tsx, but the per-frame advection compute pass is
//  authored and dispatched with TypeGPU instead of three's TSL
//  compute. Rendering stays in TSL (PointsNodeMaterial) so the
//  render cost is identical; only the compute layer differs.
//
//  Interop path (b): three allocates the GPUBuffer for the
//  StorageBufferAttribute (backend.createStorageAttribute →
//  usage STORAGE | VERTEX | COPY_SRC | COPY_DST, and itemSize-3
//  storage attributes are repacked to a 16-byte stride), then
//  TypeGPU adopts that existing GPUBuffer via
//  root.createMutable(d.arrayOf(d.vec3f, N), rawBuffer) on the
//  SAME device (tgpu.initFromDevice with the renderer's device).
//  The 16-byte three stride matches WGSL array<vec3f> exactly.
// ────────────────────────────────────────────────────────────

const PARTICLE_COUNT = 80_000;

// Field geometry
const FIELD_RADIUS = 6.0;
const FIELD_LENGTH = 24.0;

// Motion
const FLIGHT_SPEED = 0.6; // units/sec forward drift
const LATERAL_DRIFT = 0.06; // small swirling in xy
const LATERAL_SCALE = 0.35; // freq of lateral swirl field
const LATERAL_TIME = 0.05;
const DT = 0.016; // compute integration step

// Density field — where the nebula filaments and voids live
const DENSITY_SCALE = 0.18;
const DENSITY_TIME = 0.015; // slow evolution so it's not static
const DENSITY_POWER = 2.2; // raise to power → sharper filaments, wider voids

// Depth fog (kills the pop when particles wrap)
const FOG_NEAR_END = 1.0; // fully faded closer than this
const FOG_NEAR_START = 3.0; // fully visible beyond this (from camera)
const FOG_FAR_START = 16.0; // fully visible up to this
const FOG_FAR_END = FIELD_LENGTH; // fully faded past this

// Twinkle
const TWINKLE_AMP = 0.25;
const TWINKLE_RATE = 1.8;

// Brightness
const BASE_INTENSITY = 2.8;

// Camera
const CAMERA_FOV = 65;
const CAMERA_SWAY_AMP_X = 0.35;
const CAMERA_SWAY_AMP_Y = 0.25;
const CAMERA_SWAY_FREQ_X = 0.07;
const CAMERA_SWAY_FREQ_Y = 0.09;
const CAMERA_LOOKAT_Z = -10; // camera gazes this far into the tunnel

// ────────────────────────────────────────────────────────────
//  PALETTE — nebula temperature gradient (render layer, TSL)
// ────────────────────────────────────────────────────────────
const COLOR_VOID = vec3(0.04, 0.06, 0.18); // deep indigo
const COLOR_MID = vec3(0.35, 0.22, 0.62); // violet
const COLOR_WARM = vec3(0.95, 0.45, 0.25); // orange
const COLOR_HOT = vec3(1.0, 0.88, 0.7); // warm white

// ────────────────────────────────────────────────────────────
//  Noise helpers — TSL versions (render: density field sampling)
//  NOTE: the same noise exists twice in this file — once as TSL
//  Fn for the material, once as TGSL for the compute kernel. In
//  Particles.tsx a single TSL Fn serves both stages.
// ────────────────────────────────────────────────────────────

const random3 = Fn(([i]: [TSLNode]) => {
  const seed1 = vec3(31.06, 19.86, 30.19);
  const seed2 = vec3(6640.0, 5790.4, 10798.861);
  return fract(sin(dot(i, seed1)).mul(seed2)).sub(0.5);
});

const gradientNoise3 = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const c = f
    .mul(f)
    .mul(f)
    .mul(f.mul(float(6.0).mul(f).sub(15.0)).add(10.0));
  const n000 = dot(random3(i), f);
  const n100 = dot(random3(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  const n010 = dot(random3(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  const n110 = dot(random3(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  const n001 = dot(random3(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  const n101 = dot(random3(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  const n011 = dot(random3(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  const n111 = dot(random3(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));
  const nX00 = mix(n000, n100, c.x);
  const nX01 = mix(n001, n101, c.x);
  const nX10 = mix(n010, n110, c.x);
  const nX11 = mix(n011, n111, c.x);
  const nXX0 = mix(nX00, nX10, c.y);
  const nXX1 = mix(nX01, nX11, c.y);
  return mix(nXX0, nXX1, c.z).mul(2.0);
});

// ────────────────────────────────────────────────────────────
//  Noise helpers — TGSL versions (compute: lateral drift field).
//  Plain TS functions; the 'use gpu' directive makes the babel
//  plugin (unplugin-typegpu) transpile them to WGSL-generating
//  ASTs. std.* calls map 1:1 to WGSL builtins/operators.
// ────────────────────────────────────────────────────────────

const random3Gpu = (i: d.v3f): d.v3f => {
  "use gpu";
  const h = std.dot(i, d.vec3f(31.06, 19.86, 30.19));
  return std.sub(
    std.fract(std.mul(std.sin(h), d.vec3f(6640.0, 5790.4, 10798.861))),
    d.vec3f(0.5, 0.5, 0.5),
  );
};

const gradientNoise3Gpu = (p: d.v3f): number => {
  "use gpu";
  const i = std.floor(p);
  const f = std.fract(p);
  // Quintic fade: f*f*f*(f*(6f - 15) + 10)
  const c = std.mul(
    std.mul(f, std.mul(f, f)),
    std.add(
      std.mul(f, std.sub(std.mul(f, 6), d.vec3f(15, 15, 15))),
      d.vec3f(10, 10, 10),
    ),
  );
  const n000 = std.dot(random3Gpu(i), f);
  const n100 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 0, 0))),
    std.sub(f, d.vec3f(1, 0, 0)),
  );
  const n010 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 1, 0))),
    std.sub(f, d.vec3f(0, 1, 0)),
  );
  const n110 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 1, 0))),
    std.sub(f, d.vec3f(1, 1, 0)),
  );
  const n001 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 0, 1))),
    std.sub(f, d.vec3f(0, 0, 1)),
  );
  const n101 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 0, 1))),
    std.sub(f, d.vec3f(1, 0, 1)),
  );
  const n011 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 1, 1))),
    std.sub(f, d.vec3f(0, 1, 1)),
  );
  const n111 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 1, 1))),
    std.sub(f, d.vec3f(1, 1, 1)),
  );
  const nX00 = std.mix(n000, n100, c.x);
  const nX01 = std.mix(n001, n101, c.x);
  const nX10 = std.mix(n010, n110, c.x);
  const nX11 = std.mix(n011, n111, c.x);
  const nXX0 = std.mix(nX00, nX10, c.y);
  const nXX1 = std.mix(nX01, nX11, c.y);
  return std.mix(nXX0, nXX1, c.z) * 2;
};

// Structural view of three's WebGPU backend internals we rely on.
// Verified against node_modules/three/build/three.webgpu.js:
// WebGPUBackend.createStorageAttribute → attributeUtils.createAttribute
// with STORAGE | VERTEX | COPY_SRC | COPY_DST, and Backend.get(obj)
// returns the per-object data map holding `.buffer`.
type ThreeWebGPUBackendInternals = {
  device: GPUDevice;
  createStorageAttribute: (attribute: THREE.BufferAttribute) => void;
  get: (object: object) => { buffer?: GPUBuffer };
};

type TypeGPUCompute = {
  root: TgpuRoot;
  timeUniform: TgpuUniform<d.F32>;
  pipeline: TgpuGuardedComputePipeline<[number]>;
};

export const ParticlesTG = ({
  grayscale = false,
  onReady,
}: {
  grayscale?: boolean;
  breath?: SharedValue<number>; // ambient scene — accepted but unused (same as Particles)
  onReady?: () => void;
}) => {
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
    let disposed = false;

    // ── Initialize particles in a tube ────────────────────────
    const posArray = new Float32Array(PARTICLE_COUNT * 3);
    const phaseArray = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Uniform point in a disc of radius FIELD_RADIUS
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
      const idx = i * 3;
      posArray[idx] = r * Math.cos(theta);
      posArray[idx + 1] = r * Math.sin(theta);
      // Uniform z in [-FIELD_LENGTH, 0]
      posArray[idx + 2] = -Math.random() * FIELD_LENGTH;

      phaseArray[i] = Math.random() * Math.PI * 2;
    }

    // ── Storage buffer attribute (TypeGPU compute writes, vertex reads)
    const positionAttribute = new StorageBufferAttribute(posArray, 3);

    // ── TSL uniforms (render layer only) ──────────────────────
    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030a); // near-black deep space

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 200);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, CAMERA_LOOKAT_Z);

    const clock = new THREE.Clock();

    // ── Geometry ─────────────────────────────────────────────
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phaseArray, 1));

    // ── Material: density-field color + depth fog + twinkle ──
    // (identical to Particles.tsx — render cost is the control variable)
    const aPhase = attribute("aPhase", "float");

    // Sample the density field at this particle's current world position.
    const densityRaw = gradientNoise3(
      vec3(
        positionLocal.x.mul(DENSITY_SCALE),
        positionLocal.y.mul(DENSITY_SCALE),
        positionLocal.z.mul(DENSITY_SCALE).add(timeU.mul(DENSITY_TIME)),
      ),
    );
    // Remap noise [-1,1] → [0,1] and power-curve for sharp filaments.
    const density = pow(
      densityRaw.mul(0.5).add(0.5).clamp(0, 1),
      float(DENSITY_POWER),
    );

    // Color ramp: void → mid → warm → hot
    const cVoidMid = mix(COLOR_VOID, COLOR_MID, smoothstep(0.0, 0.35, density));
    const cWithWarm = mix(
      cVoidMid,
      COLOR_WARM,
      smoothstep(0.35, 0.65, density),
    );
    const particleColor = mix(
      cWithWarm,
      COLOR_HOT,
      smoothstep(0.7, 0.95, density),
    );

    // Depth fog — both near (so camera-passing particles fade) and far (atmospheric).
    const zDist = positionLocal.z.negate(); // camera at 0, particles at negative z
    const nearFade = smoothstep(
      float(FOG_NEAR_END),
      float(FOG_NEAR_START),
      zDist,
    );
    const farFade = float(1.0).sub(
      smoothstep(float(FOG_FAR_START), float(FOG_FAR_END), zDist),
    );

    // Twinkle: each particle oscillates with its own phase.
    const twinkle = sin(timeU.mul(TWINKLE_RATE).add(aPhase))
      .mul(TWINKLE_AMP)
      .add(float(1.0).sub(float(TWINKLE_AMP)));

    // Intensity gates brightness by density × fog × twinkle
    const intensity = density
      .mul(nearFade)
      .mul(farFade)
      .mul(twinkle)
      .mul(BASE_INTENSITY);

    const litColor = particleColor.mul(intensity);

    // Grayscale
    const lum = dot(litColor, vec3(0.299, 0.587, 0.114));
    const outColor = mix(litColor, vec3(lum, lum, lum), grayscaleU);

    const material = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // Alpha channel mirrors intensity so overlapping particles additively
    // reinforce filament brightness.
    material.colorNode = vec4(outColor, intensity.clamp(0, 1));

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Renderer ─────────────────────────────────────────────
    const renderer = makeWebGPURenderer(context, { antialias: false });

    // ── TypeGPU compute layer ─────────────────────────────────
    // Deferred to the first animation frame: the animation loop only runs
    // after renderer.init() resolves, so backend.device exists by then.
    let tg: TypeGPUCompute | null = null;
    let tgFailed = false;

    const setupTypeGPU = (): TypeGPUCompute => {
      const backend = (
        renderer as unknown as { backend: ThreeWebGPUBackendInternals }
      ).backend;

      // Let three allocate the GPUBuffer exactly like renderer.compute()
      // would (STORAGE | VERTEX usage; itemSize-3 storage attributes get
      // repacked to a 16-byte stride, matching WGSL array<vec3f>).
      backend.createStorageAttribute(positionAttribute);
      const rawBuffer = backend.get(positionAttribute).buffer;
      if (!rawBuffer) {
        throw new Error("three did not allocate a GPUBuffer for the attribute");
      }

      // Adopt three's device — compute and render share one GPUDevice, so
      // queue submission order guarantees compute-before-render each frame.
      const root = tgpu.initFromDevice({ device: backend.device });

      const timeUniform = root.createUniform(d.f32);
      // Adopt three's existing GPUBuffer as a typed TypeGPU storage buffer.
      const positions = root.createMutable(
        d.arrayOf(d.vec3f, PARTICLE_COUNT),
        rawBuffer,
      );

      // Advection kernel (TGSL): lateral noise drift + forward wrap.
      const advect = (x: number) => {
        "use gpu";
        const pos = positions.$[x];

        // Small lateral drift — samples a slow 3D noise field in xy so nearby
        // particles drift together (coherent swirl, not per-particle noise).
        const driftSeed = d.vec3f(
          pos.x * LATERAL_SCALE,
          pos.y * LATERAL_SCALE,
          timeUniform.$ * LATERAL_TIME,
        );
        const dx = gradientNoise3Gpu(driftSeed);
        const dy = gradientNoise3Gpu(std.add(driftSeed, d.vec3f(19.3, 7.1, 11.5)));

        const newX = pos.x + dx * LATERAL_DRIFT * DT;
        const newY = pos.y + dy * LATERAL_DRIFT * DT;

        // Forward advection + wrap: keep z in [-FIELD_LENGTH, 0).
        // Floor-mod maps any z past 0 back to the far end smoothly.
        const shifted = pos.z + FLIGHT_SPEED * DT + FIELD_LENGTH;
        const wrappedZ =
          shifted - FIELD_LENGTH * std.floor(shifted / FIELD_LENGTH) - FIELD_LENGTH;

        positions.$[x] = d.vec3f(newX, newY, wrappedZ);
      };

      // Guarded pipeline: bounds-checked threads (workgroup size 256 for 1D);
      // buffers referenced by the kernel auto-bind via a catch-all bind group.
      const pipeline = root.createGuardedComputePipeline(advect);

      return { root, timeUniform, pipeline };
    };

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      if (!tgFailed) {
        try {
          tg ??= setupTypeGPU();
          tg.timeUniform.write(elapsed);
          // Compute first, then render, then present (same ordering as
          // Particles' renderer.compute()).
          tg.pipeline.dispatchThreads(PARTICLE_COUNT);
        } catch (error) {
          tgFailed = true;
          console.warn("[ParticlesTG] TypeGPU compute failed", error);
        }
      }

      // Gentle ship-in-currents sway; look direction stays fixed down the tunnel.
      camera.position.x =
        Math.sin(elapsed * CAMERA_SWAY_FREQ_X) * CAMERA_SWAY_AMP_X;
      camera.position.y =
        Math.sin(elapsed * CAMERA_SWAY_FREQ_Y) * CAMERA_SWAY_AMP_Y;
      camera.lookAt(0, 0, CAMERA_LOOKAT_Z);

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "ParticlesTG",
      onReady,
      // Benchmark scene: run uncapped-ish and emit [frame-stats] Metro logs.
      targetFps: 120,
      logFrameStats: true,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      if (tg) {
        // TypeGPU-owned uniforms; the adopted position buffer stays three's
        // (ownBuffer=false → not destroyed), and initFromDevice roots never
        // destroy the shared device.
        tg.timeUniform.buffer.destroy();
        tg.pipeline.sizeUniform.buffer.destroy();
        tg.root.destroy();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
