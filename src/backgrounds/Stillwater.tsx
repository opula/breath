import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { PointsNodeMaterial, StorageBufferAttribute } from "three/webgpu";
import {
  dot,
  float,
  mix,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import tgpu from "typegpu";
import type { TgpuGuardedComputePipeline, TgpuRoot, TgpuUniform } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  STILLWATER — a lattice of 1px dots breathing like water.
//
//  A flat ~83k-dot grid seen from a low three-quarter view.
//  Every dot's world position is written each frame by one
//  TypeGPU compute kernel: 2–3 directional sinusoidal swells
//  travel slowly across the field (real waves, not noise), a
//  low-amplitude gradient-noise chop rides on top so the water
//  never reads as synthetic, and a per-dot spring-damped jitter
//  state lets each dot scatter and resettle at its own pace
//  when the breath moves. The camera never moves; the only
//  motion is the water.
//
//  Breath (three CPU channels, parent ParticleWave contract):
//   - breathEase (smoothstepped breath) → swell amplitude
//     ×0.7 exhaled → ×1.35 fully inhaled, plus a slight field
//     lift. The star channel — inhaling visibly raises the sea.
//   - breathFlow (signed lead of target over smoothed breath)
//     → advances the swell travel phase, so an inhale draws the
//     waves across the field and an exhale lets them recede.
//   - breathMotion (|Δbreath| energy, attack/release) → adds
//     transient chop amplitude and kicks every dot with a small
//     hashed random-direction impulse scaled by its sensitivity;
//     the jitter springs back toward the lattice, so the field
//     scatters organically and resettles — water reacting, not
//     a sheet flexing.
//
//  Interop follows Lightstream verbatim: three allocates the
//  storage attributes, TypeGPU adopts the raw GPUBuffers on the
//  same device, the guarded pipeline dispatches before render.
//  Render is one THREE.Points draw (PointsNodeMaterial) colored
//  by wave height — dim teal valleys, mid teal body, pale peaks
//  kept under ~0.85 luminance. No bloom, no sparkle, no gamma.
// ────────────────────────────────────────────────────────────

// ── VIEW (static — no pan, no drift, no rotation) ───────────
const CAMERA_FOV = 50;
const CAMERA_POS: [number, number, number] = [0, 3.0, 6.8];
const LOOK_AT: [number, number, number] = [0, 0, 0];

// ── FIELD / DENSITY ─────────────────────────────────────────
const GRID_X = 288; // dots across (world x)
const GRID_Y = 288; // dots deep (world z)
const DOT_COUNT = GRID_X * GRID_Y; // 82,944 — at the proven budget
const FIELD_WIDTH = 40; // world units, oversized to fill the view
const FIELD_DEPTH = 40;

// ── WAVES (traveling directional swells) ────────────────────
// angle: travel direction in the xz plane (radians; positive z
// components head toward the camera). wavelength: world units.
// weight: share of the swell amplitude (weights sum to 1 so
// SWELL_AMPLITUDE is the true peak height). speed: units/sec.
const WAVE_SPECS = [
  { angle: 1.25, wavelength: 11.0, weight: 0.5, speed: 0.5 },
  { angle: 2.02, wavelength: 6.4, weight: 0.28, speed: 0.85 },
  { angle: 0.58, wavelength: 17.5, weight: 0.22, speed: 0.34 },
] as const;
const SWELL_AMPLITUDE = 0.5; // peak swell height at scale 1
const SWELL_EXHALE_SCALE = 0.7; // amplitude multiplier fully exhaled
const SWELL_INHALE_SCALE = 1.35; // amplitude multiplier fully inhaled
const FLOW_PHASE_GAIN = 1.8; // world units of travel per unit breathFlow

// ── CHOP (gradient-noise layer over the swells) ─────────────
const CHOP_SCALE = 0.55; // spatial frequency of the chop field
const CHOP_TIME_SCALE = 0.35; // how fast the chop evolves
const CHOP_BASE_AMPLITUDE = 0.075; // resting chop height
const CHOP_MOTION_GAIN = 0.22; // extra chop at full breathMotion
const CHOP_PHASE_JITTER = 0.6; // per-dot chop-time decorrelation

// ── JITTER (per-dot spring-damped scatter state) ────────────
const JITTER_KICK = 1.5; // impulse accel (units/s²) at motion=1, sens=1
const JITTER_SPRING = 10.0; // /s² pull back toward the lattice
const JITTER_DAMPING = 3.4; // /s velocity damping
const JITTER_MAX_OFFSET = 0.16; // hard cap on scatter distance
const JITTER_SENS_MIN = 0.6; // per-dot sensitivity spread
const JITTER_SENS_MAX = 1.4;
const JITTER_PACE_MIN = 0.75; // per-dot spring/damping variance —
const JITTER_PACE_MAX = 1.3; //   each dot resettles at its own pace
const IMPULSE_ADVANCE_RATE = 0.9; // impulse-counter speed at motion=1

// ── BREATH (CPU channels — parent ParticleWave contract) ────
const BREATH_RESPONSE_RATE = 6.4;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 5.0;
const BREATH_MOTION_RELEASE_RATE = 2.2;
const BREATH_FLOW_GAIN = 2.8;
const BREATH_FLOW_RATE = 3.8;
const BREATH_LIFT = 0.1; // field rises slightly at full inhale
const MOTION_LIFT = 0.05; // small transient lift on breath motion
const AMBIENT_BREATH_BASE = 0.4; // pseudo-breath when breath is undefined
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.35; // rad/s → period ≈ 18s

// ── LOOK ────────────────────────────────────────────────────
const BG_COLOR = 0x02070a; // deep blue-green black
const PARTICLE_DIM = vec3(0.08, 0.16, 0.2); // valleys
const PARTICLE_MID = vec3(0.24, 0.5, 0.52); // body
const PARTICLE_BRIGHT = vec3(0.62, 0.8, 0.76); // peaks (luma ≈ 0.74)
const MID_BAND_END = 0.62; // heightT where dim→mid saturates
const BRIGHT_BAND_START = 0.52; // heightT where the peak band begins
const BRIGHT_MIX_BASE = 0.82; // peak-band strength at rest…
const BRIGHT_MIX_EASE = 0.18; //   + at full inhale…
const BRIGHT_MIX_MOTION = 0.2; //   + at full breathMotion (clamped to 1)
const BRIGHT_MOTION_LIFT = 0.12; // whole-field lift ≤ luma ≈ 0.83

// Flattened per-wave scalars (plain module numbers — safe to
// reference from inside the TGSL kernel).
const TAU = Math.PI * 2;
const W0_DX = Math.cos(WAVE_SPECS[0].angle);
const W0_DZ = Math.sin(WAVE_SPECS[0].angle);
const W0_K = TAU / WAVE_SPECS[0].wavelength;
const W0_WEIGHT = WAVE_SPECS[0].weight;
const W0_SPEED = WAVE_SPECS[0].speed;
const W1_DX = Math.cos(WAVE_SPECS[1].angle);
const W1_DZ = Math.sin(WAVE_SPECS[1].angle);
const W1_K = TAU / WAVE_SPECS[1].wavelength;
const W1_WEIGHT = WAVE_SPECS[1].weight;
const W1_SPEED = WAVE_SPECS[1].speed;
const W2_DX = Math.cos(WAVE_SPECS[2].angle);
const W2_DZ = Math.sin(WAVE_SPECS[2].angle);
const W2_K = TAU / WAVE_SPECS[2].wavelength;
const W2_WEIGHT = WAVE_SPECS[2].weight;
const W2_SPEED = WAVE_SPECS[2].speed;
const SWELL_BREATH_GAIN = SWELL_INHALE_SCALE - SWELL_EXHALE_SCALE;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ────────────────────────────────────────────────────────────
//  Helpers — TGSL ('use gpu' functions; unplugin-typegpu
//  transpiles them to WGSL, std.* maps 1:1 to builtins). Noise
//  pair copied from Lightstream/ParticlesTG (the duplicated-
//  helper cost noted in SCENES_V2 §5).
// ────────────────────────────────────────────────────────────

const hash11Gpu = (n: number): number => {
  "use gpu";
  return std.fract(std.sin(n * 12.9898) * 43758.5453);
};

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

// Per-frame simulation parameters (single uniform struct write).
const SimParams = d.struct({
  time: d.f32,
  dt: d.f32,
  breathEase: d.f32, // smoothstepped smoothed breath, 0..1
  breathFlow: d.f32, // signed lead of target over smoothed, -1..1
  breathMotion: d.f32, // |Δbreath| energy with attack/release, 0..1
  impulsePhase: d.f32, // slowly-advancing counter; floor() = kick cell
});

// Structural view of three's WebGPU backend internals we rely on.
// Verified against node_modules/three/build/three.webgpu.js:
// WebGPUBackend.createStorageAttribute → attributeUtils.createAttribute
// with STORAGE | VERTEX | COPY_SRC | COPY_DST (itemSize-3 storage
// attributes are repacked to a 16-byte stride; itemSize-4 is already
// 16 bytes), and Backend.get(obj) returns the per-object data map
// holding `.buffer`.
type ThreeWebGPUBackendInternals = {
  device: GPUDevice;
  createStorageAttribute: (attribute: THREE.BufferAttribute) => void;
  get: (object: object) => { buffer?: GPUBuffer };
};

type TypeGPUCompute = {
  root: TgpuRoot;
  simUniform: TgpuUniform<typeof SimParams>;
  pipeline: TgpuGuardedComputePipeline<[number]>;
};

export const Stillwater = ({
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
    let disposed = false;

    // ── Seed the lattice ─────────────────────────────────────
    // Positions: kernel-written world positions, doubling as the
    // Points geometry position attribute. Jitter: per-dot spring
    // state (offsetX, offsetZ, velX, velZ). Traits: static per-dot
    // data read-only by the kernel —
    //   x/y: lattice x/z (home position, world units)
    //   z:   sensitivity (how hard breath impulses kick this dot)
    //   w:   seed in [0,1) (chop decorrelation + impulse hashing)
    const posArray = new Float32Array(DOT_COUNT * 3);
    const jitterArray = new Float32Array(DOT_COUNT * 4); // zero-initialized
    const traitArray = new Float32Array(DOT_COUNT * 4);

    for (let i = 0; i < DOT_COUNT; i++) {
      const col = i % GRID_X;
      const row = Math.floor(i / GRID_X);
      const latticeX = (col / (GRID_X - 1) - 0.5) * FIELD_WIDTH;
      const latticeZ = (row / (GRID_Y - 1) - 0.5) * FIELD_DEPTH;

      posArray[i * 3] = latticeX;
      posArray[i * 3 + 1] = 0;
      posArray[i * 3 + 2] = latticeZ;

      traitArray[i * 4] = latticeX;
      traitArray[i * 4 + 1] = latticeZ;
      traitArray[i * 4 + 2] =
        JITTER_SENS_MIN + Math.random() * (JITTER_SENS_MAX - JITTER_SENS_MIN);
      traitArray[i * 4 + 3] = Math.random();
    }

    // Storage attribute: the compute kernel writes it, and it doubles
    // as the Points geometry's position attribute (Lightstream pattern).
    const positionAttribute = new StorageBufferAttribute(posArray, 3);
    // Kernel-only storage attributes (never vertex inputs).
    const jitterAttribute = new StorageBufferAttribute(jitterArray, 4);
    const traitAttribute = new StorageBufferAttribute(traitArray, 4);

    // ── TSL uniforms (render layer only) ─────────────────────
    const waveAmpU = uniform(float(1)); // current total height amplitude
    const liftU = uniform(float(0)); // current field lift
    const breathEaseU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(...LOOK_AT);

    const clock = new THREE.Clock();

    // ── Geometry + material: one opaque 1px-points draw ──────
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);

    // Color by wave height: the kernel writes world y = height + lift,
    // so (y - lift) / (2·amp) + 0.5 recovers heightT in [0, 1].
    const heightT = positionLocal.y
      .sub(liftU)
      .div(waveAmpU.mul(2.0))
      .add(0.5)
      .clamp(0.0, 1.0);
    const lowMid = mix(
      PARTICLE_DIM,
      PARTICLE_MID,
      smoothstep(0.0, MID_BAND_END, heightT),
    );
    // Peak-band strength breathes with ease/motion but is clamped to 1
    // so peaks never extrapolate past PARTICLE_BRIGHT.
    const brightMix = smoothstep(float(BRIGHT_BAND_START), 1.0, heightT)
      .mul(
        float(BRIGHT_MIX_BASE)
          .add(breathEaseU.mul(BRIGHT_MIX_EASE))
          .add(breathMotionU.mul(BRIGHT_MIX_MOTION)),
      )
      .clamp(0.0, 1.0);
    const particleColor = mix(lowMid, PARTICLE_BRIGHT, brightMix);
    const energizedColor = particleColor.mul(
      float(1.0).add(breathMotionU.mul(BRIGHT_MOTION_LIFT)),
    );

    // Grayscale as the very last step of the color node.
    const luma = dot(energizedColor, vec3(0.299, 0.587, 0.114));
    const finalColor = mix(energizedColor, vec3(luma, luma, luma), grayscaleU);

    const material = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    material.colorNode = vec4(finalColor, 1.0);

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // CPU-side array never learns the GPU heights
    scene.add(points);

    // ── Renderer ─────────────────────────────────────────────
    const renderer = makeWebGPURenderer(context, { antialias: false });

    // ── TypeGPU compute layer ────────────────────────────────
    // Deferred to the first animation frame: the animation loop only
    // runs after renderer.init() resolves, so backend.device exists.
    let tg: TypeGPUCompute | null = null;
    let tgFailed = false;

    const setupTypeGPU = (): TypeGPUCompute => {
      const backend = (
        renderer as unknown as { backend: ThreeWebGPUBackendInternals }
      ).backend;

      // Let three allocate the GPUBuffers exactly like renderer.compute()
      // would (STORAGE | VERTEX usage; strides match array<vec3f> /
      // array<vec4f> exactly).
      backend.createStorageAttribute(positionAttribute);
      backend.createStorageAttribute(jitterAttribute);
      backend.createStorageAttribute(traitAttribute);
      const rawPositions = backend.get(positionAttribute).buffer;
      const rawJitter = backend.get(jitterAttribute).buffer;
      const rawTraits = backend.get(traitAttribute).buffer;
      if (!rawPositions || !rawJitter || !rawTraits) {
        throw new Error("three did not allocate GPUBuffers for the attributes");
      }

      // Adopt three's device — compute and render share one GPUDevice, so
      // queue submission order guarantees compute-before-render each frame.
      const root = tgpu.initFromDevice({ device: backend.device });

      const simUniform = root.createUniform(SimParams);
      // Adopt three's existing GPUBuffers as typed TypeGPU storage buffers.
      const positions = root.createMutable(
        d.arrayOf(d.vec3f, DOT_COUNT),
        rawPositions,
      );
      const jitter = root.createMutable(
        d.arrayOf(d.vec4f, DOT_COUNT),
        rawJitter,
      );
      const traits = root.createReadonly(
        d.arrayOf(d.vec4f, DOT_COUNT),
        rawTraits,
      );

      // Integration kernel (TGSL): traveling swells + noise chop set the
      // height; a spring-damped per-dot jitter state scatters the lattice
      // under breath impulses and resettles at each dot's own pace.
      const integrate = (i: number) => {
        "use gpu";
        const trait = traits.$[i];
        const st = jitter.$[i];
        const t = simUniform.$.time;
        const dt = simUniform.$.dt;
        const ease = simUniform.$.breathEase;
        const flow = simUniform.$.breathFlow;
        const motion = simUniform.$.breathMotion;

        const px = trait.x;
        const pz = trait.y;
        const sens = trait.z;
        const seed = trait.w;

        // Breath-derived layer amplitudes (mirrors the CPU derivation
        // that feeds the TSL height-normalization uniform).
        const swellAmp =
          SWELL_AMPLITUDE * (SWELL_EXHALE_SCALE + ease * SWELL_BREATH_GAIN);
        const chopAmp = CHOP_BASE_AMPLITUDE + motion * CHOP_MOTION_GAIN;
        // breathFlow advances the shared travel term: an inhale draws
        // every swell forward along its direction, an exhale recedes.
        const flowTravel = flow * FLOW_PHASE_GAIN;

        // Traveling directional swells (phase = k·(dir·p − travel)).
        const ph0 = (px * W0_DX + pz * W0_DZ - (t * W0_SPEED + flowTravel)) * W0_K;
        const ph1 = (px * W1_DX + pz * W1_DZ - (t * W1_SPEED + flowTravel)) * W1_K;
        const ph2 = (px * W2_DX + pz * W2_DZ - (t * W2_SPEED + flowTravel)) * W2_K;
        const swell =
          (std.sin(ph0) * W0_WEIGHT +
            std.sin(ph1) * W1_WEIGHT +
            std.sin(ph2) * W2_WEIGHT) *
          swellAmp;

        // Low-amplitude gradient-noise chop; seed decorrelates each
        // dot's chop time slightly so the layer never reads as a sheet.
        const chop =
          gradientNoise3Gpu(
            d.vec3f(
              px * CHOP_SCALE,
              pz * CHOP_SCALE,
              t * CHOP_TIME_SCALE + seed * CHOP_PHASE_JITTER,
            ),
          ) * chopAmp;

        const height = swell + chop + ease * BREATH_LIFT + motion * MOTION_LIFT;

        // Jitter: hashed random-direction impulse while breathMotion is
        // up (the kick cell advances between breaths so successive
        // breaths kick differently), integrated as a damped spring back
        // toward the lattice. Per-dot pace varies the resettle rate.
        const kickCell = std.floor(simUniform.$.impulsePhase);
        const kickAngle = hash11Gpu(seed * 613.11 + kickCell * 19.19) * TAU;
        const pace =
          JITTER_PACE_MIN +
          hash11Gpu(seed * 91.73 + 12.9) * (JITTER_PACE_MAX - JITTER_PACE_MIN);
        const kick = motion * JITTER_KICK * sens;
        const springK = JITTER_SPRING * pace;
        const dampK = JITTER_DAMPING * pace;
        const ax = std.cos(kickAngle) * kick - st.x * springK - st.z * dampK;
        const az = std.sin(kickAngle) * kick - st.y * springK - st.w * dampK;
        const vx = st.z + ax * dt;
        const vz = st.w + az * dt;
        const oxRaw = st.x + vx * dt;
        const ozRaw = st.y + vz * dt;
        // Soft cap: rescale the offset if it exceeds JITTER_MAX_OFFSET.
        const oLen = std.max(std.length(d.vec2f(oxRaw, ozRaw)), 1e-6);
        const oScale = std.min(oLen, JITTER_MAX_OFFSET) / oLen;
        const ox = oxRaw * oScale;
        const oz = ozRaw * oScale;

        jitter.$[i] = d.vec4f(ox, oz, vx, vz);
        positions.$[i] = d.vec3f(px + ox, height, pz + oz);
      };

      // Guarded pipeline: bounds-checked threads (workgroup size 256 for
      // 1D); buffers referenced by the kernel auto-bind.
      const pipeline = root.createGuardedComputePipeline(integrate);

      return { root, simUniform, pipeline };
    };

    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? AMBIENT_BREATH_BASE;
    let breathMotion = 0;
    let breathFlow = 0;
    let impulsePhase = 0;

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const dt =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      previousElapsed = elapsed;

      // Breath channels (parent ParticleWave contract). Ambient slow
      // sine keeps the swells visibly breathing when no exercise drives
      // the scene.
      const ambient =
        AMBIENT_BREATH_BASE +
        AMBIENT_BREATH_AMP * Math.sin(elapsed * AMBIENT_BREATH_RATE);
      const targetBreath = breathRef.current?.value ?? ambient;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        dt,
      );

      const motionTarget = clamp(
        Math.abs(breathDelta) * BREATH_MOTION_GAIN,
        0.0,
        1.0,
      );
      const motionRate =
        motionTarget > breathMotion
          ? BREATH_MOTION_ATTACK_RATE
          : BREATH_MOTION_RELEASE_RATE;
      breathMotion = damp(breathMotion, motionTarget, motionRate, dt);
      breathFlow = damp(
        breathFlow,
        clamp((targetBreath - smoothedBreath) * BREATH_FLOW_GAIN, -1.0, 1.0),
        BREATH_FLOW_RATE,
        dt,
      );
      // Advances while the breath moves → successive breaths land in
      // different kick cells, so each breath scatters dots differently.
      impulsePhase += breathMotion * dt * IMPULSE_ADVANCE_RATE;

      const ease =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      // Mirror of the kernel's amplitude derivation, for color mapping.
      const swellAmp =
        SWELL_AMPLITUDE * (SWELL_EXHALE_SCALE + ease * SWELL_BREATH_GAIN);
      const chopAmp = CHOP_BASE_AMPLITUDE + breathMotion * CHOP_MOTION_GAIN;
      const lift = ease * BREATH_LIFT + breathMotion * MOTION_LIFT;

      (waveAmpU as unknown as { value: number }).value = swellAmp + chopAmp;
      (liftU as unknown as { value: number }).value = lift;
      (breathEaseU as unknown as { value: number }).value = ease;
      (breathMotionU as unknown as { value: number }).value = breathMotion;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      if (!tgFailed) {
        try {
          tg ??= setupTypeGPU();
          tg.simUniform.write({
            time: elapsed,
            dt,
            breathEase: ease,
            breathFlow,
            breathMotion,
            impulsePhase,
          });
          // Compute first, then render, then present.
          tg.pipeline.dispatchThreads(DOT_COUNT);
        } catch (error) {
          tgFailed = true;
          console.warn("[Stillwater] TypeGPU compute failed", error);
        }
      }

      // Camera is fully static — the only motion is the water.
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Stillwater",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      if (tg) {
        // TypeGPU-owned uniforms; the adopted position/jitter/trait
        // buffers stay three's (ownBuffer=false → not destroyed), and
        // initFromDevice roots never destroy the shared device.
        tg.simUniform.buffer.destroy();
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
