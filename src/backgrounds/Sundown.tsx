import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import {
  MeshBasicNodeMaterial,
  PointsNodeMaterial,
  StorageBufferAttribute,
} from "three/webgpu";
import {
  abs,
  attribute,
  dot,
  float,
  fract,
  length,
  max,
  mix,
  oneMinus,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  vec2,
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
//  SUNDOWN — a muted vaporwave drive, rendered entirely in
//  1px dots.
//
//  A flat valley corridor runs straight to the vanishing
//  point; rugged ridged-noise mountains flank it on both
//  sides. The whole height field scrolls toward the viewer at
//  a constant meditative pace — the ~83k-dot lattice never
//  moves in x/z (except breath jitter); one TypeGPU kernel
//  just resamples the terrain at a scrolled coordinate each
//  frame, so the ground streams past a fully static camera.
//  A retro grid accent — world-space lines every few units,
//  both directions — travels with the ground: the rungs rush
//  toward the camera, the long lines converge on the horizon.
//  At the far end a large dotted sun sits low over the
//  corridor, its lower half cut by the iconic horizontal slice
//  bands (gaps widening toward the bottom), pale amber fading
//  to dusty rose. Everything is desaturated vaporwave — dusty
//  violets, muted magentas, a rose haze where the corridor
//  meets the sun — nothing neon, nothing near white.
//
//  Breath (three CPU channels, Stillwater contract):
//   - breathEase (smoothstepped breath) → mountain amplitude
//     ×(1 + 0.12·ease) so the ranges swell gently on inhale;
//     the sun brightens ~+10% and rises ~0.3 units; the
//     corridor haze lifts a few percent.
//   - breathFlow (signed lead of target over smoothed breath)
//     → nudges the grid-accent phase only. The drive speed is
//     NEVER breath-modulated — no lurching.
//   - breathMotion (|Δbreath| energy, attack/release) → per-dot
//     spring-damped jitter kicks (hashed sensitivity, per-breath
//     kick cells) and a transient chop on the corridor floor;
//     the landscape shivers on breath transitions and resettles.
//
//  Interop follows Stillwater verbatim: three allocates the
//  storage attributes, TypeGPU adopts the raw GPUBuffers on the
//  same device, the guarded pipeline dispatches before render.
//  Render is two opaque THREE.Points draws (PointsNodeMaterial):
//  the terrain lattice colored by height/grid/distance in TSL,
//  and a static plain-BufferAttribute sun disc (no compute).
//  No bloom, no sparkle, no gamma.
// ────────────────────────────────────────────────────────────

// ── VIEW (static — no pan, no drift, no rotation) ───────────
const CAMERA_FOV = 55;
const CAMERA_POS: [number, number, number] = [0, 2.4, 5.0];
// Slightly downward gaze: pushes the horizon (and the sun) into the
// upper third of the frame, clear of the breath-ring UI at screen center.
const LOOK_AT: [number, number, number] = [0, 0.1, -40];

// ── FIELD / DENSITY ─────────────────────────────────────────
const LATTICE_X = 288; // dots across (world x)
const LATTICE_Z = 288; // dots deep (world z)
const DOT_COUNT = LATTICE_X * LATTICE_Z; // 82,944 — the proven budget
const FIELD_WIDTH = 40; // world units, oversized to fill the view
const FIELD_DEPTH = 46;
const FIELD_NEAR_Z = 2; // lattice spans z ∈ [NEAR - DEPTH, NEAR]

// ── CORRIDOR (the flat "road" down the middle) ──────────────
const CORRIDOR_HALF_WIDTH = 2.6; // dead-flat inside this |x|
const MOUNTAIN_RAMP = 3.0; // smoothstep width of the flank rise
const FLOOR_CHOP_SCALE = 0.5; // spatial freq of the corridor chop
const FLOOR_CHOP_TIME_SCALE = 0.3; // how fast the chop evolves
const FLOOR_CHOP_BASE = 0.045; // resting chop height — not dead, not busy
const FLOOR_CHOP_MOTION_GAIN = 0.14; // extra chop at full breathMotion
const FLOOR_CHOP_PHASE_JITTER = 0.6; // per-dot chop-time decorrelation
const FLOOR_CHOP_MOUNTAIN_FACTOR = 0.35; // chop share left on the flanks

// ── MOUNTAINS (ridged two-octave noise, both flanks) ────────
const MTN_FREQ_1 = 0.16; // base octave — ~6-unit features
const MTN_WEIGHT_1 = 0.65;
const MTN_SLICE_1 = 3.7; // fixed y-slice through the 3D noise
const MTN_FREQ_2 = 0.34; // detail octave (max frequency — see DRIVE)
const MTN_WEIGHT_2 = 0.35;
const MTN_SLICE_2 = 17.2;
const MOUNTAIN_AMPLITUDE = 4.3; // peak height at rest (ridge² ≤ 1)
// Massif envelope: a very-large-scale noise that modulates the whole
// range's amplitude, so the skyline alternates between tall peak
// clusters and low passes (where sky and stars show through) instead
// of holding one constant ridge height.
const MASSIF_FREQ = 0.05; // ~20-unit massifs
const MASSIF_BASE = 0.6; // envelope midpoint
const MASSIF_RANGE = 0.45; // envelope swing around the midpoint
const MASSIF_SLICE = 8.3; // fixed y-slice through the 3D noise
const MASSIF_MIN = 0.08; // lowest pass — nearly down to the valley
const MASSIF_MAX = 1.15; // tallest cluster

// ── DRIVE (constant forward scroll — never breath-modulated) ─
const DRIVE_SPEED = 1.5; // world units/s toward the camera
// fp32 hygiene: travel grows unboundedly. With DRIVE_SPEED 1.5 and the
// largest noise frequency 0.34, kernel noise inputs grow ~0.51/s and
// reach ~1e4 after ≈5.5 h of continuous drive — fract/floor quantization
// is still invisible there (<0.1% of a noise cell), but that is also
// where some GPUs' fast-sin range reduction can start correlating the
// lattice hash (hash-dot magnitudes ~1e5+). Sessions are hours, not
// days, so we keep the offset unbounded rather than wrap.

// ── GRID (retro world-space accent lines, both directions) ──
const GRID_SPACING = 2.0; // world units between accent lines
const GRID_LINE_HALF_WIDTH = 0.1; // ~one lattice row lights per line
const GRID_ACCENT_MIX = 0.45; // mix toward GRID_LINE_COLOR — the radial
// fan converging under the UI dominated the frame at 0.6
const GRID_FADE_START = 24; // accent fades out before the horizon —
const GRID_FADE_END = 38; //   compressed far rows would shimmer
const GRID_FLOW_PHASE_GAIN = 0.35; // breathFlow leads/lags the rungs a touch

// ── SUN (static dotted disc, banded lower half — no compute) ─
const SUN_Z = -47; // just past the terrain's far edge
// High enough that the whole disc floats in the upper third, fully
// clear of the breath-ring UI at screen center — the old half-overlap
// (disc eclipsed by the ring) is what read as "off".
const SUN_CENTER_Y = 9.4;
const SUN_RADIUS = 5.0;
const SUN_DOT_SPACING = 0.105; // row + in-row spacing → ~6.2k dots
const SUN_BAND_FREQ = 5.0; // slice bands across the lower half
const SUN_BAND_GAP_MIN = 0.06; // gap share at the disc's equator…
const SUN_BAND_GAP_MAX = 0.55; //   …widening toward the bottom rim
const SUN_EDGE_DIM_START = 0.82; // radius fraction where the rim dims
const SUN_EDGE_DIM = 0.35; // how much the rim dims (soft disc edge)

// ── STARS (static cosmic backdrop — plain attributes, no compute) ─
const STAR_COUNT = 2000;
const STAR_Z = -58; // far plane behind the sun (depth-occluded by it)
const STAR_FIELD_WIDTH = 44; // spans past the frustum at that depth
const STAR_BASE_Y = 2.6; // sprinkles right down toward the ridge line
const STAR_FIELD_HEIGHT = 32;
const STAR_HORIZON_BIAS = 1.35; // >1 packs more stars low near the horizon
const STAR_CLUSTER_FRACTION = 0.3; // share of stars born inside clusters
const STAR_CLUSTER_COUNT = 4; // loose "cosmic" clumps per session
const STAR_CLUSTER_RADIUS = 3.2;
const STAR_BRIGHT_MIN = 0.16; // per-star brightness spread —
const STAR_BRIGHT_MAX = 0.62; //   most dim, a hashed few brighter
const STAR_BRIGHT_POW = 3.0;
const STAR_BREATH_GAIN = 0.05; // stars lift a hair at full inhale
const STAR_COOL_COLOR = [0.5, 0.62, 0.75] as const; // faint cyan-white
const STAR_WARM_COLOR = [0.68, 0.45, 0.62] as const; // faint pink
// Occasional shimmer: a share of stars each carry a hashed slow sine;
// brightness pulses briefly when the sine crests — a few seconds of
// gentle brightening every minute or two per star, never all at once.
const STAR_TWINKLE_FRACTION = 0.3; // share of stars that ever shimmer
const STAR_TWINKLE_RATE_MIN = 0.05; // rad/s → one pulse per ~2 min…
const STAR_TWINKLE_RATE_MAX = 0.16; //   …up to one per ~40 s
const STAR_TWINKLE_THRESHOLD = 0.95; // sine crest where the pulse begins
const STAR_TWINKLE_PEAK = 0.998; // crest top = full pulse
const STAR_TWINKLE_GAIN = 1.1; // extra brightness at pulse peak

// ── FOG (static mist banks at the horizon — plain attributes) ──
// Fills the band between the ridge line and the sun's lowest slices;
// drawn nearer than the sun, so the disc sinks into mist.
const FOG_COUNT = 2600;
const FOG_BANK_COUNT = 8; // loose elongated banks; bank 0 pinned center
const FOG_WIDTH = 44; // x span of bank centers
const FOG_Z_MIN = -46; // depth range (just in front of the sun at z -47)
const FOG_Z_MAX = -28;
const FOG_BASE_Y = 0.3; // banks hug the ridge line
const FOG_BANK_LIFT = 2.0; // random extra bank height
const FOG_BANK_RX = 5.5; // bank half-extents (elongated in x)
const FOG_BANK_RY = 0.7;
const FOG_BANK_RZ = 2.5;
const FOG_BRIGHT_MIN = 0.08; // per-dot brightness spread —
const FOG_BRIGHT_MAX = 0.3; //   most dim, a hashed few brighter
const FOG_BRIGHT_POW = 2.0;
const FOG_COLOR_A = [0.5, 0.38, 0.52] as const; // pale lavender mist
const FOG_COLOR_B = [0.56, 0.32, 0.4] as const; // rose mist
const FOG_BREATH_GAIN = 0.06; // mist lifts a hair at full inhale
const FOG_DRIFT_AMP = 1.6; // whole-layer lateral sway (world units)
const FOG_DRIFT_RATE = 0.015; // rad/s → ~7 min period; alive, not busy

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

// ── BREATH (CPU channels — Stillwater contract) ─────────────
const BREATH_RESPONSE_RATE = 6.4;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 5.0;
const BREATH_MOTION_RELEASE_RATE = 2.2;
const BREATH_FLOW_GAIN = 2.8;
const BREATH_FLOW_RATE = 3.8;
const MOUNTAIN_BREATH_GAIN = 0.12; // amplitude ×(1 + gain·ease) at full inhale
const SUN_BREATH_BRIGHT_GAIN = 0.1; // sun brightness +10% at full inhale
const SUN_RISE_LIFT = 0.3; // sun rises this many units at full inhale
const HAZE_BREATH_GAIN = 0.06; // corridor haze lift at full inhale
const AMBIENT_BREATH_BASE = 0.4; // pseudo-breath when breath is undefined
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.35; // rad/s → period ≈ 18s

// ── LOOK ────────────────────────────────────────────────────
const BG_COLOR = 0x050310; // clear color under the sky quad
const FLOOR_COLOR = vec3(0.13, 0.08, 0.26); // valley floor — rich indigo
const GRID_LINE_COLOR = vec3(0.26, 0.22, 0.42); // accent — luminous lavender
// Ridge color plays on HEIGHT and DEPTH only — both flanks identical.
// Height: dark plum silhouette low, luminous rose-magenta crests (the
// sun's family) up high. Depth: near ranges saturated over a dark base,
// far ranges lift toward a soft hazy violet — atmospheric perspective.
const MOUNTAIN_LOW_NEAR = vec3(0.08, 0.045, 0.15); // near slopes, silhouette
const MOUNTAIN_LOW_FAR = vec3(0.17, 0.12, 0.28); // far slopes, hazier
const MOUNTAIN_PEAK_NEAR = vec3(0.66, 0.26, 0.42); // near crests, rose-magenta
const MOUNTAIN_PEAK_FAR = vec3(0.4, 0.32, 0.56); // far crests, soft violet
const RIDGE_DEPTH_START = 16; // camera distance where the depth shift begins
const RIDGE_DEPTH_END = 42; //   …and saturates
const HAZE_COLOR = vec3(0.5, 0.22, 0.32); // vanishing-point rose glow

// ── SKY (gradient quad behind everything — the immersion layer) ──
const SKY_Z = -90; // beyond the stars (z -58)
const SKY_CENTER_Y = 10;
const SKY_WIDTH = 140; // covers the frustum at that depth with margin
const SKY_HEIGHT = 130;
const SKY_HORIZON_COLOR = vec3(0.05, 0.03, 0.11); // indigo-plum at the ridge line
const SKY_ZENITH_COLOR = vec3(0.012, 0.05, 0.075); // teal-ink up high
const SKY_GRAD_TOP = 52; // world y where the zenith color saturates
// Below the ridge line the quad falls to near-black so the floor dots
// pop off darkness instead of swimming in a bright wash.
const SKY_GROUND_COLOR = vec3(0.008, 0.006, 0.022);
const SKY_GROUND_FADE_LO = -6; // fully dark below this world y
const SKY_GROUND_FADE_HI = 3; // horizon brightness returns by here
// A soft teal bloom high on one side (the reference's off-axis glow).
const SKY_BLOOM_X = 16;
const SKY_BLOOM_Y = 38;
const SKY_BLOOM_RADIUS = 34;
const SKY_BLOOM_COLOR = vec3(0.008, 0.045, 0.05);
// A magenta aura around the sun's line of sight — atmosphere, not bloom.
const SUN_AURA_Y = 15.2; // sun's screen position projected onto the sky
const SUN_AURA_RADIUS = 17;
const SUN_AURA_COLOR = vec3(0.11, 0.02, 0.06);
const FADE_COLOR = vec3(0.07, 0.04, 0.11); // distance-dim target, just above sky
const FLOOR_BLEND_START = 0.02; // heightT band: floor → slope
const FLOOR_BLEND_END = 0.22;
const PEAK_BLEND_START = 0.42; // heightT where slope → peak begins
// Depth is drawn in COLOR, not just brightness: near ground sinks toward
// a cool indigo, far ground warms toward rose as it approaches the sun.
const DEPTH_NEAR_COLOR = vec3(0.09, 0.07, 0.19); // cool indigo, up close
const DEPTH_FAR_COLOR = vec3(0.46, 0.21, 0.24); // warm sunset rose, at the horizon
const DEPTH_NEAR_END = 16; // cool tint fades out by this camera distance
const DEPTH_NEAR_STRENGTH = 0.5;
const DEPTH_FAR_START = 16; // warm ramp spans mid-field → horizon
const DEPTH_FAR_END = 42;
const DEPTH_FAR_STRENGTH = 0.65;
const DIM_START = 26; // camera distance where the far dim begins…
const DIM_END = 46; //   …and saturates
const DIM_MAX = 0.45; // far dots soften into the sky but keep their warmth
const HAZE_DIST_START = 32; // rose haze ramps over the last stretch —
const HAZE_DIST_END = 49; //   strongest where the corridor meets the sun
const HAZE_HALF_WIDTH = 10; // a broad warm pool below the sun
const HAZE_STRENGTH = 0.62;
// Sun gradient (plain tuples — baked into a color attribute).
// Hot magenta-pink per the reference — the scene's emotional center.
// Top luma ≈ 0.46 (×1.1 breath ≈ 0.51), comfortably under the cap.
const SUN_TOP_COLOR = [0.95, 0.22, 0.45] as const; // hot magenta-pink
const SUN_BOTTOM_COLOR = [0.58, 0.1, 0.28] as const; // deep rose ember

// Derived module scalars (plain numbers — safe inside the TGSL kernel).
const TAU = Math.PI * 2;
const MTN_RAMP_END = CORRIDOR_HALF_WIDTH + MOUNTAIN_RAMP;
const FLOOR_CHOP_MTN_ATTEN = 1 - FLOOR_CHOP_MOUNTAIN_FACTOR;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const smoothstepJs = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ────────────────────────────────────────────────────────────
//  Helpers — TGSL ('use gpu' functions; unplugin-typegpu
//  transpiles them to WGSL, std.* maps 1:1 to builtins). Noise
//  pair copied from Stillwater/Lightstream (the duplicated-
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
  travel: d.f32, // DRIVE_SPEED · elapsed — constant-speed scroll offset
  breathEase: d.f32, // smoothstepped smoothed breath, 0..1
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

export const Sundown = ({
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

    // ── Seed the terrain lattice ─────────────────────────────
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
      const col = i % LATTICE_X;
      const row = Math.floor(i / LATTICE_X);
      const latticeX = (col / (LATTICE_X - 1) - 0.5) * FIELD_WIDTH;
      const latticeZ = FIELD_NEAR_Z - (row / (LATTICE_Z - 1)) * FIELD_DEPTH;

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
    // as the Points geometry's position attribute (Stillwater pattern).
    const positionAttribute = new StorageBufferAttribute(posArray, 3);
    // Kernel-only storage attributes (never vertex inputs).
    const jitterAttribute = new StorageBufferAttribute(jitterArray, 4);
    const traitAttribute = new StorageBufferAttribute(traitArray, 4);

    // ── Seed the sun disc (static — plain attributes, no compute) ──
    // Rows of dots on a vertical plane, local to the disc center. Rows
    // in the LOWER half are skipped inside horizontal slice bands whose
    // gaps widen toward the bottom rim — the iconic cut sun. Colors are
    // baked per dot: amber→rose vertical gradient with a soft rim dim.
    const sunPos: number[] = [];
    const sunCol: number[] = [];
    const sunRowCount = Math.floor((SUN_RADIUS * 2) / SUN_DOT_SPACING) + 1;
    for (let row = 0; row < sunRowCount; row++) {
      const yLocal = -SUN_RADIUS + row * SUN_DOT_SPACING;
      if (yLocal < 0) {
        const u = -yLocal / SUN_RADIUS; // 0 at the equator → 1 at the bottom
        const gapFrac =
          SUN_BAND_GAP_MIN + (SUN_BAND_GAP_MAX - SUN_BAND_GAP_MIN) * u;
        if ((u * SUN_BAND_FREQ) % 1 < gapFrac) continue; // inside a slice gap
      }
      const halfChord = Math.sqrt(
        Math.max(SUN_RADIUS * SUN_RADIUS - yLocal * yLocal, 0),
      );
      const cols = Math.floor((halfChord * 2) / SUN_DOT_SPACING) + 1;
      const xStart = (-(cols - 1) * SUN_DOT_SPACING) / 2;
      const tGrad = (yLocal + SUN_RADIUS) / (SUN_RADIUS * 2);
      const rowR =
        SUN_BOTTOM_COLOR[0] + (SUN_TOP_COLOR[0] - SUN_BOTTOM_COLOR[0]) * tGrad;
      const rowG =
        SUN_BOTTOM_COLOR[1] + (SUN_TOP_COLOR[1] - SUN_BOTTOM_COLOR[1]) * tGrad;
      const rowB =
        SUN_BOTTOM_COLOR[2] + (SUN_TOP_COLOR[2] - SUN_BOTTOM_COLOR[2]) * tGrad;
      for (let c = 0; c < cols; c++) {
        const xLocal = xStart + c * SUN_DOT_SPACING;
        const rim =
          Math.sqrt(xLocal * xLocal + yLocal * yLocal) / SUN_RADIUS;
        const edge = 1 - smoothstepJs(SUN_EDGE_DIM_START, 1, rim) * SUN_EDGE_DIM;
        sunPos.push(xLocal, yLocal, 0);
        sunCol.push(rowR * edge, rowG * edge, rowB * edge);
      }
    }

    // ── Seed the starfield (static — plain attributes, no compute) ──
    // Random dots on a far plane above the horizon: most scattered
    // uniformly (packed slightly denser near the horizon), a share born
    // inside a few loose clusters so the sky reads cosmic rather than
    // uniform. Brightness is power-distributed: most stars dim, a few
    // brighter; color splits between faint blue-white and faint mauve.
    const starPos: number[] = [];
    const starCol: number[] = [];
    const starTw: number[] = [];
    const clusterCenters: [number, number][] = [];
    for (let c = 0; c < STAR_CLUSTER_COUNT; c++) {
      clusterCenters.push([
        (Math.random() - 0.5) * STAR_FIELD_WIDTH,
        STAR_BASE_Y + Math.random() * STAR_FIELD_HEIGHT * 0.7,
      ]);
    }
    for (let i = 0; i < STAR_COUNT; i++) {
      let x: number;
      let y: number;
      if (Math.random() < STAR_CLUSTER_FRACTION) {
        const [cx, cy] =
          clusterCenters[Math.floor(Math.random() * STAR_CLUSTER_COUNT)];
        const r = Math.sqrt(Math.random()) * STAR_CLUSTER_RADIUS;
        const a = Math.random() * TAU;
        x = cx + Math.cos(a) * r;
        y = Math.max(cy + Math.sin(a) * r, STAR_BASE_Y);
      } else {
        x = (Math.random() - 0.5) * STAR_FIELD_WIDTH;
        y =
          STAR_BASE_Y +
          Math.pow(Math.random(), STAR_HORIZON_BIAS) * STAR_FIELD_HEIGHT;
      }
      const bright =
        STAR_BRIGHT_MIN +
        Math.pow(Math.random(), STAR_BRIGHT_POW) *
          (STAR_BRIGHT_MAX - STAR_BRIGHT_MIN);
      const warmMix = Math.random();
      starPos.push(x, y, STAR_Z);
      starCol.push(
        (STAR_COOL_COLOR[0] +
          (STAR_WARM_COLOR[0] - STAR_COOL_COLOR[0]) * warmMix) * bright,
        (STAR_COOL_COLOR[1] +
          (STAR_WARM_COLOR[1] - STAR_COOL_COLOR[1]) * warmMix) * bright,
        (STAR_COOL_COLOR[2] +
          (STAR_WARM_COLOR[2] - STAR_COOL_COLOR[2]) * warmMix) * bright,
      );
      // Twinkle traits: phase, rate, amplitude (0 = never shimmers).
      starTw.push(
        Math.random() * TAU,
        STAR_TWINKLE_RATE_MIN +
          Math.random() * (STAR_TWINKLE_RATE_MAX - STAR_TWINKLE_RATE_MIN),
        Math.random() < STAR_TWINKLE_FRACTION ? 1 : 0,
      );
    }

    // ── Seed the fog (static mist banks — plain attributes) ──
    // Elongated soft-edged dot banks along the horizon. Bank 0 is
    // pinned near x = 0 so the stretch under the sun is never empty.
    const fogBanks: [number, number, number][] = [];
    for (let b = 0; b < FOG_BANK_COUNT; b++) {
      fogBanks.push([
        b === 0 ? (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * FOG_WIDTH,
        FOG_BASE_Y + Math.random() * FOG_BANK_LIFT,
        FOG_Z_MIN + Math.random() * (FOG_Z_MAX - FOG_Z_MIN),
      ]);
    }
    const fogPos: number[] = [];
    const fogCol: number[] = [];
    for (let i = 0; i < FOG_COUNT; i++) {
      const [bx, by, bz] = fogBanks[i % FOG_BANK_COUNT];
      // Sum of two randoms ≈ triangular falloff — soft-edged banks.
      const gx = (Math.random() + Math.random() - 1) * FOG_BANK_RX;
      const gy = (Math.random() + Math.random() - 1) * FOG_BANK_RY;
      const gz = (Math.random() + Math.random() - 1) * FOG_BANK_RZ;
      const bright =
        FOG_BRIGHT_MIN +
        Math.random() ** FOG_BRIGHT_POW * (FOG_BRIGHT_MAX - FOG_BRIGHT_MIN);
      const mixT = Math.random();
      fogPos.push(bx + gx, Math.max(by + gy, 0.05), bz + gz);
      fogCol.push(
        (FOG_COLOR_A[0] + (FOG_COLOR_B[0] - FOG_COLOR_A[0]) * mixT) * bright,
        (FOG_COLOR_A[1] + (FOG_COLOR_B[1] - FOG_COLOR_A[1]) * mixT) * bright,
        (FOG_COLOR_A[2] + (FOG_COLOR_B[2] - FOG_COLOR_A[2]) * mixT) * bright,
      );
    }

    // ── TSL uniforms (render layer only) ─────────────────────
    const mountainAmpU = uniform(float(MOUNTAIN_AMPLITUDE)); // current peak height
    const gridPhaseU = uniform(float(0)); // travel + breathFlow lead
    const breathEaseU = uniform(float(0));
    const sunBrightU = uniform(float(1));
    const starBrightU = uniform(float(1));
    const fogBrightU = uniform(float(1));
    const timeU = uniform(float(0)); // drives the star shimmer only
    const grayscaleU = uniform(float(0)); // shared by all three materials

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 120);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(...LOOK_AT);

    const clock = new THREE.Clock();

    // ── Terrain: one opaque 1px-points draw ──────────────────
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);

    // Color by terrain height (kernel writes world y ∈ [~0, mountainAmp]):
    // dusty-violet floor → magenta slopes → muted rose peaks.
    const heightT = positionLocal.y.div(mountainAmpU).clamp(0.0, 1.0);
    // Ridge color = height × depth, identical on both flanks: silhouette
    // low / rose-magenta crests high, shifting toward hazy violet with
    // distance (atmospheric perspective).
    const ridgeCamDist = float(CAMERA_POS[2]).sub(positionLocal.z);
    const ridgeDepthT = smoothstep(
      float(RIDGE_DEPTH_START),
      float(RIDGE_DEPTH_END),
      ridgeCamDist,
    );
    const lowColor = mix(MOUNTAIN_LOW_NEAR, MOUNTAIN_LOW_FAR, ridgeDepthT);
    const peakColor = mix(MOUNTAIN_PEAK_NEAR, MOUNTAIN_PEAK_FAR, ridgeDepthT);
    const slopeColor = mix(
      lowColor,
      peakColor,
      smoothstep(float(PEAK_BLEND_START), 1.0, heightT),
    );
    const baseColor = mix(
      FLOOR_COLOR,
      slopeColor,
      smoothstep(float(FLOOR_BLEND_START), float(FLOOR_BLEND_END), heightT),
    );

    // Retro grid accent from the SCROLLED world coordinate — the same
    // sz = z - travel convention as the kernel, so the rungs travel
    // with the ground. Static x-lines converge on the vanishing point;
    // z-rungs rush toward the camera. Jitter wobbles the lines a touch
    // during breath transitions — organic, not a defect.
    const scrolledZ = positionLocal.z.sub(gridPhaseU);
    const cellX = fract(positionLocal.x.div(GRID_SPACING));
    const distX = float(0.5).sub(abs(cellX.sub(0.5))).mul(GRID_SPACING);
    const cellZ = fract(scrolledZ.div(GRID_SPACING));
    const distZ = float(0.5).sub(abs(cellZ.sub(0.5))).mul(GRID_SPACING);
    const lineX = oneMinus(
      smoothstep(float(0.0), float(GRID_LINE_HALF_WIDTH), distX),
    );
    const lineZ = oneMinus(
      smoothstep(float(0.0), float(GRID_LINE_HALF_WIDTH), distZ),
    );
    const camDist = float(CAMERA_POS[2]).sub(positionLocal.z);
    const gridFade = oneMinus(
      smoothstep(float(GRID_FADE_START), float(GRID_FADE_END), camDist),
    );
    const gridFactor = max(lineX, lineZ).mul(gridFade);
    const gridded = mix(
      baseColor,
      GRID_LINE_COLOR,
      gridFactor.mul(GRID_ACCENT_MIX),
    );

    // Depth in color: near ground sinks toward cool indigo, far ground
    // warms toward rose as it approaches the sun — distance reads
    // chromatically, not just by brightness.
    const nearCool = oneMinus(
      smoothstep(float(0.0), float(DEPTH_NEAR_END), camDist),
    ).mul(DEPTH_NEAR_STRENGTH);
    const cooled = mix(gridded, DEPTH_NEAR_COLOR, nearCool);
    // Attenuated with height so the distant rose wash warms the FLOOR
    // but never overrides the crests' own two-tone light.
    const farWarm = smoothstep(
      float(DEPTH_FAR_START),
      float(DEPTH_FAR_END),
      camDist,
    )
      .mul(DEPTH_FAR_STRENGTH)
      .mul(oneMinus(heightT.mul(0.75)));
    const depthColored = mix(cooled, DEPTH_FAR_COLOR, farWarm);

    // Atmosphere: far dots soften into the sky (gently — the warm depth
    // tint survives), then a dusty-rose haze lifts the corridor's end
    // where it meets the sun (breath adds a few percent).
    const dim = smoothstep(float(DIM_START), float(DIM_END), camDist);
    const dimmed = mix(depthColored, FADE_COLOR, dim.mul(DIM_MAX));
    const hazeDist = smoothstep(
      float(HAZE_DIST_START),
      float(HAZE_DIST_END),
      camDist,
    );
    const hazeCenter = oneMinus(
      smoothstep(float(0.0), float(HAZE_HALF_WIDTH), abs(positionLocal.x)),
    );
    const hazeT = hazeDist
      .mul(hazeCenter)
      .mul(float(HAZE_STRENGTH).add(breathEaseU.mul(HAZE_BREATH_GAIN)))
      .clamp(0.0, 1.0);
    const hazed = mix(dimmed, HAZE_COLOR, hazeT);

    // Grayscale as the very last step of the color node.
    const luma = dot(hazed, vec3(0.299, 0.587, 0.114));
    const finalColor = mix(hazed, vec3(luma, luma, luma), grayscaleU);

    const material = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    material.colorNode = vec4(finalColor, 1.0);

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // CPU-side array never learns the GPU heights
    scene.add(points);

    // ── Sun: one opaque 1px-points draw (depth-tested against the
    //    terrain, so the horizon's dot rows occlude the low disc) ──
    const sunGeometry = new THREE.BufferGeometry();
    sunGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(Float32Array.from(sunPos), 3),
    );
    sunGeometry.setAttribute(
      "aSunColor",
      new THREE.BufferAttribute(Float32Array.from(sunCol), 3),
    );

    const sunTint = attribute("aSunColor", "vec3");
    const sunLit = sunTint.mul(sunBrightU);
    // Grayscale as the very last step of the color node.
    const sunLuma = dot(sunLit, vec3(0.299, 0.587, 0.114));
    const sunFinal = mix(sunLit, vec3(sunLuma, sunLuma, sunLuma), grayscaleU);

    const sunMaterial = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    sunMaterial.colorNode = vec4(sunFinal, 1.0);

    const sunPoints = new THREE.Points(sunGeometry, sunMaterial);
    sunPoints.position.set(0, SUN_CENTER_Y, SUN_Z);
    sunPoints.frustumCulled = false;
    scene.add(sunPoints);

    // ── Stars: one opaque 1px-points draw behind everything ─────
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(Float32Array.from(starPos), 3),
    );
    starGeometry.setAttribute(
      "aStarColor",
      new THREE.BufferAttribute(Float32Array.from(starCol), 3),
    );
    starGeometry.setAttribute(
      "aTwinkle",
      new THREE.BufferAttribute(Float32Array.from(starTw), 3),
    );

    const starTint = attribute("aStarColor", "vec3");
    // Occasional shimmer: brief smooth pulse when each star's slow
    // hashed sine crests; amp 0 keeps most stars steady.
    const twinkle = attribute("aTwinkle", "vec3");
    const twinklePulse = smoothstep(
      float(STAR_TWINKLE_THRESHOLD),
      float(STAR_TWINKLE_PEAK),
      sin(timeU.mul(twinkle.y).add(twinkle.x)),
    );
    const starLit = starTint
      .mul(starBrightU)
      .mul(
        float(1.0).add(twinklePulse.mul(twinkle.z).mul(STAR_TWINKLE_GAIN)),
      );
    // Grayscale as the very last step of the color node.
    const starLuma = dot(starLit, vec3(0.299, 0.587, 0.114));
    const starFinal = mix(
      starLit,
      vec3(starLuma, starLuma, starLuma),
      grayscaleU,
    );

    const starMaterial = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    starMaterial.colorNode = vec4(starFinal, 1.0);

    const starPoints = new THREE.Points(starGeometry, starMaterial);
    starPoints.frustumCulled = false;
    scene.add(starPoints);

    // ── Fog: one opaque 1px-points draw of horizon mist banks ──
    const fogGeometry = new THREE.BufferGeometry();
    fogGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(Float32Array.from(fogPos), 3),
    );
    fogGeometry.setAttribute(
      "aFogColor",
      new THREE.BufferAttribute(Float32Array.from(fogCol), 3),
    );

    const fogTint = attribute("aFogColor", "vec3");
    const fogLit = fogTint.mul(fogBrightU);
    // Grayscale as the very last step of the color node.
    const fogLuma = dot(fogLit, vec3(0.299, 0.587, 0.114));
    const fogFinal = mix(fogLit, vec3(fogLuma, fogLuma, fogLuma), grayscaleU);

    const fogMaterial = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    fogMaterial.colorNode = vec4(fogFinal, 1.0);

    const fogPoints = new THREE.Points(fogGeometry, fogMaterial);
    fogPoints.frustumCulled = false;
    scene.add(fogPoints);

    // ── Sky: one gradient quad behind everything (the immersion
    //    layer) — indigo at the horizon rising to teal-ink, a soft
    //    off-axis teal bloom, and a magenta aura around the sun's line
    //    of sight. Draws first, writes no depth; everything else
    //    renders over it. ──
    const skyWorldY = positionLocal.y.add(SKY_CENTER_Y);
    const skyAbove = mix(
      SKY_HORIZON_COLOR,
      SKY_ZENITH_COLOR,
      smoothstep(float(-2.0), float(SKY_GRAD_TOP), skyWorldY),
    );
    const skyGrad = mix(
      SKY_GROUND_COLOR,
      skyAbove,
      smoothstep(
        float(SKY_GROUND_FADE_LO),
        float(SKY_GROUND_FADE_HI),
        skyWorldY,
      ),
    );
    const bloomDist = length(
      vec2(positionLocal.x.sub(SKY_BLOOM_X), skyWorldY.sub(SKY_BLOOM_Y)),
    );
    const bloom = oneMinus(
      smoothstep(float(0.0), float(SKY_BLOOM_RADIUS), bloomDist),
    );
    const auraDist = length(vec2(positionLocal.x, skyWorldY.sub(SUN_AURA_Y)));
    const aura = oneMinus(
      smoothstep(float(0.0), float(SUN_AURA_RADIUS), auraDist),
    );
    const skyColor = skyGrad
      .add(SKY_BLOOM_COLOR.mul(bloom.mul(bloom)))
      .add(SUN_AURA_COLOR.mul(aura.mul(aura)));
    // Grayscale as the very last step of the color node.
    const skyLuma = dot(skyColor, vec3(0.299, 0.587, 0.114));
    const skyFinal = mix(skyColor, vec3(skyLuma, skyLuma, skyLuma), grayscaleU);

    const skyMaterial = new MeshBasicNodeMaterial({ depthWrite: false });
    skyMaterial.colorNode = vec4(skyFinal, 1.0);

    const skyGeometry = new THREE.PlaneGeometry(SKY_WIDTH, SKY_HEIGHT);
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.position.set(0, SKY_CENTER_Y, SKY_Z);
    skyMesh.renderOrder = -1;
    skyMesh.frustumCulled = false;
    scene.add(skyMesh);

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

      // Terrain kernel (TGSL): resamples the corridor/mountain height
      // field at a scrolled coordinate (constant-speed drive), then
      // integrates the per-dot spring-damped jitter state so the
      // landscape shivers under breath impulses and resettles.
      const integrate = (i: number) => {
        "use gpu";
        const trait = traits.$[i];
        const st = jitter.$[i];
        const t = simUniform.$.time;
        const dt = simUniform.$.dt;
        const ease = simUniform.$.breathEase;
        const motion = simUniform.$.breathMotion;
        const travel = simUniform.$.travel;

        const px = trait.x;
        const pz = trait.y;
        const sens = trait.z;
        const seed = trait.w;

        // Scrolled sample coordinate. The camera faces -z, so sampling
        // the height field at (px, pz - travel) makes every feature
        // march toward +z — toward the viewer — at DRIVE_SPEED.
        const sz = pz - travel;

        // Side mask: ~0 inside the corridor, ramps to 1 up the flanks.
        const sideMask = std.smoothstep(
          CORRIDOR_HALF_WIDTH,
          MTN_RAMP_END,
          std.abs(px),
        );

        // Ridged two-octave noise → craggy flanking ranges. Squaring
        // the ridge sharpens crests and deepens the gullies. Breath
        // ease swells the amplitude gently on inhale.
        const r1 =
          1 -
          std.abs(
            gradientNoise3Gpu(
              d.vec3f(px * MTN_FREQ_1, sz * MTN_FREQ_1, MTN_SLICE_1),
            ),
          );
        const r2 =
          1 -
          std.abs(
            gradientNoise3Gpu(
              d.vec3f(px * MTN_FREQ_2, sz * MTN_FREQ_2, MTN_SLICE_2),
            ),
          );
        const ridge = r1 * MTN_WEIGHT_1 + r2 * MTN_WEIGHT_2;
        const mtnAmp = MOUNTAIN_AMPLITUDE * (1 + ease * MOUNTAIN_BREATH_GAIN);
        // Massif envelope: very-large-scale amplitude modulation so the
        // skyline alternates tall peak clusters with low passes.
        const massif = std.clamp(
          MASSIF_BASE +
            MASSIF_RANGE *
              gradientNoise3Gpu(
                d.vec3f(px * MASSIF_FREQ, sz * MASSIF_FREQ, MASSIF_SLICE),
              ),
          MASSIF_MIN,
          MASSIF_MAX,
        );
        const mountain = ridge * ridge * sideMask * mtnAmp * massif;

        // Corridor chop: a tiny evolving ripple so the road isn't dead;
        // breathMotion adds a transient. Attenuated on the flanks where
        // the mountains dwarf it anyway.
        const chopAmp =
          (FLOOR_CHOP_BASE + motion * FLOOR_CHOP_MOTION_GAIN) *
          (1 - sideMask * FLOOR_CHOP_MTN_ATTEN);
        const chop =
          gradientNoise3Gpu(
            d.vec3f(
              px * FLOOR_CHOP_SCALE,
              sz * FLOOR_CHOP_SCALE,
              t * FLOOR_CHOP_TIME_SCALE + seed * FLOOR_CHOP_PHASE_JITTER,
            ),
          ) * chopAmp;

        const height = mountain + chop;

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

      // Breath channels (Stillwater contract). Ambient slow sine keeps
      // the scene visibly breathing when no exercise drives it.
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

      const ease = smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      // Constant-speed drive — the breath never touches the throttle.
      const travel = DRIVE_SPEED * elapsed;
      // Mirror of the kernel's amplitude derivation, for color mapping.
      const mountainAmp = MOUNTAIN_AMPLITUDE * (1 + ease * MOUNTAIN_BREATH_GAIN);

      (mountainAmpU as unknown as { value: number }).value = mountainAmp;
      // breathFlow only leads/lags the grid rungs a touch — never the drive.
      (gridPhaseU as unknown as { value: number }).value =
        travel + breathFlow * GRID_FLOW_PHASE_GAIN;
      (breathEaseU as unknown as { value: number }).value = ease;
      (sunBrightU as unknown as { value: number }).value =
        1 + ease * SUN_BREATH_BRIGHT_GAIN;
      (starBrightU as unknown as { value: number }).value =
        1 + ease * STAR_BREATH_GAIN;
      (fogBrightU as unknown as { value: number }).value =
        1 + ease * FOG_BREATH_GAIN;
      (timeU as unknown as { value: number }).value = elapsed;
      // The mist sways laterally on a minutes-long period.
      fogPoints.position.x =
        Math.sin(elapsed * FOG_DRIFT_RATE) * FOG_DRIFT_AMP;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      // The sun rises gently at full inhale (object transform — cheap).
      sunPoints.position.y = SUN_CENTER_Y + ease * SUN_RISE_LIFT;

      if (!tgFailed) {
        try {
          tg ??= setupTypeGPU();
          tg.simUniform.write({
            time: elapsed,
            dt,
            travel,
            breathEase: ease,
            breathMotion,
            impulsePhase,
          });
          // Compute first, then render, then present.
          tg.pipeline.dispatchThreads(DOT_COUNT);
        } catch (error) {
          tgFailed = true;
          console.warn("[Sundown] TypeGPU compute failed", error);
        }
      }

      // Camera is fully static — the only motion is the ground streaming by.
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Sundown",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(points);
      scene.remove(sunPoints);
      scene.remove(starPoints);
      scene.remove(fogPoints);
      scene.remove(skyMesh);
      geometry.dispose();
      material.dispose();
      sunGeometry.dispose();
      sunMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      fogGeometry.dispose();
      fogMaterial.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
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
