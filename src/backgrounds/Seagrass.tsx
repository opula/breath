import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  float,
  vec2,
  vec3,
  sin,
  exp,
  pow,
  mix,
  min,
  floor,
  length,
  distance,
  smoothstep,
  normalize,
  cross,
  dot,
  uniform,
  instanceIndex,
  positionGeometry,
  positionWorld,
  cameraPosition,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  SEAGRASS — a night meadow of glowing-tipped reeds riding
//  a slow analytic swell.
//
//  One InstancedMesh of 14,400 slender boxes; every reed's
//  placement, lift, and tilt is derived per-vertex in TSL from
//  instanceIndex — the instance matrices stay identity forever
//  and no CPU matrix work happens per frame. Two directional
//  swells (one crest-sharpened, one plain sine at a different
//  angle) interfere across the grid, plus a slow radial bulge
//  near the origin that only exists while breath is inhaled.
//  Reeds lift with the local wave height and tilt toward the
//  local wave normal (numerical differencing), so a passing
//  swell reads as a wave of pale tip-light rippling through a
//  near-black field. Camera is fully static.
//
//  Breath (Stillwater's conditioning idioms):
//   - breathEase → swell amplitude ×0.7 exhaled → ×1.35 inhaled,
//     the radial bulge term, and a small tip-glow lift.
//   - signed breathFlow → leads the primary swell phase, so an
//     inhale draws the wave across the meadow.
//   - breathMotion → transient extra tilt: a soft ruffle passes
//     through the reeds when the breath changes direction.
// ────────────────────────────────────────────────────────────

// Served-bundle grep marker (unique to this scene build).
export const SEAGRASS_MARKER = "seagrass-nightmeadow-7f3a";

// ── VIEW (static — no orbit, no pan, no breath camera) ──────
const CAMERA_FOV = 35;
const CAMERA_POS: [number, number, number] = [10, 9, 20];
// Slightly ahead of the origin so the field recedes above center.
const LOOK_AT: [number, number, number] = [0, 0.4, -2];

// ── FIELD / REEDS ───────────────────────────────────────────
const GRID_X = 120; // reeds across (world x)
const GRID_Z = 120; // reeds deep (world z)
const REED_COUNT = GRID_X * GRID_Z; // 14,400 — under the 15k cap
const REED_SPACING = 0.32; // world units between reeds (~38-unit field)
const REED_HEIGHT = 1.4; // reed length, base → tip
const REED_THICKNESS = 0.045; // slender square cross-section

// ── WAVES (analytic, evaluated in the vertex stage) ─────────
// Primary swell: crest-sharpened directional wave.
const SWELL1_ANGLE = 0.9; // travel direction in the xz plane (rad)
const SWELL1_FREQ = 0.48; // rad per world unit (wavelength ≈ 13)
const SWELL1_RATE = 0.55; // phase rad/s (temporal period ≈ 11.4 s)
const SWELL1_WEIGHT = 0.62; // share of total height
const CREST_SHARPNESS = 2.2; // pow() shaping — narrow crests, wide troughs
// Second swell: plain sine at a different angle/frequency (interference).
const SWELL2_ANGLE = 2.3;
const SWELL2_FREQ = 0.84; // wavelength ≈ 7.5
const SWELL2_RATE = 0.38; // period ≈ 16.5 s
const SWELL2_WEIGHT = 0.38;
// Radial "breath bulge" — a slow ring near the origin, present
// only while inhaled (scaled by eased breath in the shader).
const BULGE_FREQ = 0.5; // rad per world unit of radius
const BULGE_RATE = 0.4; // phase rad/s → ring drifts outward, ~15.7 s
const BULGE_DECAY = 0.08; // exp falloff of the ring with radius
const BULGE_WEIGHT = 0.4; // share of total height at full inhale
// Peak wave height (world units) at amplitude scale 1.
const SWELL_AMPLITUDE = 0.8;

// ── TILT (reeds lean to the local wave normal) ──────────────
const NORMAL_EPS = 0.3; // finite-difference step for the wave normal
const TILT_AMOUNT = 0.55; // 0 = always vertical, 1 = full normal lean
const TILT_MOTION_GAIN = 0.25; // extra transient lean at full breathMotion
const TILT_MAX = 0.9; // safety cap on the blended tilt amount

// ── LOOK ────────────────────────────────────────────────────
const COLOR_BASE = vec3(0.004, 0.006, 0.01); // near-black fog/sky
const COLOR_BASE_RGB: [number, number, number] = [0.004, 0.006, 0.01];
const COLOR_BODY = vec3(0.012, 0.02, 0.024); // near-black slate reed body
const COLOR_TIP = vec3(0.36, 0.56, 0.53); // muted aqua-moon tip light
const HUE_A = vec3(0.4, 0.36, 0.55); // soft violet field tint
const HUE_B = vec3(0.3, 0.5, 0.48); // sea-teal field tint
const HUE_STRENGTH = 0.65; // how far tip light bends toward the hue field
const HUE_FREQ_X = 0.14; // rad per world unit — low-frequency hue bands
const HUE_FREQ_Z = 0.11;
const HUE_DRIFT_RATE = 0.02; // rad/s — the hue field drifts imperceptibly
const HUE_DRIFT_RATIO = 0.6; // z-band drift speed relative to x-band

// Tip glow: light concentrates in the upper reed.
const TIP_FALLOFF = 3.4; // pow() exponent on base→tip fraction
const TIP_GLOW_GAIN = 0.5; // overall tip-light strength
// Tip-edge taper: the glow dies back to near-dark AT the flat cap, so
// the hardest silhouette edge (bright cap vs black sky) never carries
// full contrast — kills the worst of the geometric aliasing.
const TIP_EDGE_START = 0.86; // height fraction where the taper begins
const TIP_EDGE_FADE = 0.85; // glow reduction at the very cap
// Crest lift: reeds riding a swell crest glow more.
const CREST_GLOW_LO = -0.5; // wave height where the lift starts
const CREST_GLOW_HI = 0.8; // wave height where the lift saturates
const CREST_GLOW_BASE = 0.22; // glow floor in the troughs
const CREST_GLOW_GAIN = 0.95; // extra glow on the crests
// Near-camera dim: the closest rows fall into silhouette so the eye
// rests on the lit mid-field instead of a bright foreground wall.
const NEAR_DIM_START = 6; // fully dimmed inside this camera distance
const NEAR_DIM_END = 14; // undimmed beyond this distance
const NEAR_DIM_AMOUNT = 0.5; // glow reduction at the nearest rows

// Distance fog: the field melts into darkness before its edge.
const FOG_START = 22; // world units from camera — fog begins
const FOG_END = 38; // fully COLOR_BASE (far grid edge is ≥ 41 away)

// Center-UI dimming: the breath ring sits over calm darkness.
const CENTER_DIM_INNER = 2.0; // fully dimmed within this radius of LOOK_AT
const CENTER_DIM_OUTER = 4.5; // undimmed beyond this radius
const CENTER_DIM_AMOUNT = 0.4; // glow reduction at the center

// Per-channel ceiling on the lit color (pre-fog, pre-grayscale).
const HIGHLIGHT_CAP = 0.9;

// ── BREATH (Stillwater conditioning idioms) ─────────────────
const SWELL_EXHALE_SCALE = 0.7; // amplitude multiplier fully exhaled
const SWELL_BREATH_GAIN = 0.65; // + at full inhale (×1.35 total)
const FLOW_PHASE_GAIN = 1.6; // rad of primary-phase lead per unit breathFlow
const TIP_BREATH_LIFT = 1.15; // tip-glow multiplier at full inhale
const BREATH_RESPONSE_RATE = 6.4;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 5.0;
const BREATH_MOTION_RELEASE_RATE = 2.2;
const BREATH_FLOW_GAIN = 2.8; // signed lead of target over smoothed breath
const BREATH_FLOW_RATE = 3.8;
const AMBIENT_BREATH_BASE = 0.4; // pseudo-breath when breath is undefined
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.35; // rad/s → period ≈ 18 s

// Flattened swell directions (plain numbers for the shader).
const SWELL1_DX = Math.cos(SWELL1_ANGLE);
const SWELL1_DZ = Math.sin(SWELL1_ANGLE);
const SWELL2_DX = Math.cos(SWELL2_ANGLE);
const SWELL2_DZ = Math.sin(SWELL2_ANGLE);

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// --- Component ---

export const Seagrass = ({
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
    if (!context) {
      return;
    }
    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(...COLOR_BASE_RGB);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 200);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(...LOOK_AT);

    const clock = new THREE.Clock();

    // ── Uniforms (all CPU-driven; phases are CPU-integrated) ─
    const phase1U = uniform(float(0)); // primary swell phase (+ flow lead)
    const phase2U = uniform(float(0)); // second swell phase
    const bulgePhaseU = uniform(float(0)); // radial bulge phase
    const hueDriftU = uniform(float(0)); // hue-field drift phase
    const swellAmpU = uniform(float(SWELL_AMPLITUDE * SWELL_EXHALE_SCALE));
    const tiltU = uniform(float(TILT_AMOUNT)); // tilt amount (+ motion ruffle)
    const breathEaseU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // Analytic wave height at (x, z) in [-1, 1]-ish units (pre-amplitude).
    // Evaluated 3× per vertex (value + two finite differences) — kept to
    // a handful of sin/pow/exp terms.
    const waveHeight = Fn(([x, z]: [TSLNode, TSLNode]) => {
      // Primary directional swell, crests sharpened then re-centered.
      const d1 = x.mul(SWELL1_DX).add(z.mul(SWELL1_DZ));
      const s1 = sin(d1.mul(SWELL1_FREQ).add(phase1U));
      const crest = pow(s1.mul(0.5).add(0.5), CREST_SHARPNESS)
        .mul(2.0)
        .sub(1.0);
      // Second swell at a different angle/frequency for interference.
      const d2 = x.mul(SWELL2_DX).add(z.mul(SWELL2_DZ));
      const s2 = sin(d2.mul(SWELL2_FREQ).add(phase2U));
      // Slow radial breath bulge near the origin (inhale-only).
      const r = length(vec2(x, z));
      const bulge = sin(r.mul(BULGE_FREQ).sub(bulgePhaseU))
        .mul(exp(r.mul(-BULGE_DECAY)))
        .mul(breathEaseU)
        .mul(BULGE_WEIGHT);
      return crest
        .mul(SWELL1_WEIGHT)
        .add(s2.mul(SWELL2_WEIGHT))
        .add(bulge);
    });

    // Vertex stage: grid placement + wave lift + tilt to the wave
    // normal, all derived from instanceIndex. Instance matrices stay
    // identity — no CPU matrix uploads, ever.
    const reedPosition = Fn(() => {
      const fi = float(instanceIndex);
      const ix = fi.mod(GRID_X);
      const iz = floor(fi.div(GRID_X));
      const gx = ix.sub((GRID_X - 1) / 2).mul(REED_SPACING);
      const gz = iz.sub((GRID_Z - 1) / 2).mul(REED_SPACING);

      const h = waveHeight(gx, gz).mul(swellAmpU);
      const hX = waveHeight(gx.add(NORMAL_EPS), gz).mul(swellAmpU);
      const hZ = waveHeight(gx, gz.add(NORMAL_EPS)).mul(swellAmpU);
      const slopeX = hX.sub(h).div(NORMAL_EPS);
      const slopeZ = hZ.sub(h).div(NORMAL_EPS);
      const waveNormal = normalize(
        vec3(slopeX.negate(), 1.0, slopeZ.negate()),
      );
      // Blend toward straight-up by 1 - tilt, renormalize.
      const n = normalize(mix(vec3(0.0, 1.0, 0.0), waveNormal, tiltU));

      // Orthonormal basis around n (n stays near vertical, so the
      // fixed +z reference never degenerates).
      const tangent = normalize(cross(vec3(0.0, 0.0, 1.0), n));
      const bitangent = cross(n, tangent);
      const v = positionGeometry;
      const displaced = tangent
        .mul(v.x)
        .add(n.mul(v.y))
        .add(bitangent.mul(v.z));

      return vec3(gx, h, gz).add(displaced);
    });

    // Fragment stage: all shading faked from cheap interpolants.
    const reedColor = Fn(() => {
      // 0 at the reed base → 1 at the tip (geometry is base-origin).
      const heightFrac = positionGeometry.y.div(REED_HEIGHT).clamp(0.0, 1.0);
      // Wave height under this reed ≈ world y minus height along the
      // reed (tilt is small, so this stays a good estimate).
      const waveY = positionWorld.y.sub(positionGeometry.y);

      // Tip glow, brighter on swell crests; tapers off again right at
      // the cap so the silhouette edge stays dark (anti-aliasing aid).
      const tipEdge = float(1.0).sub(
        smoothstep(float(TIP_EDGE_START), float(1.0), heightFrac).mul(
          TIP_EDGE_FADE,
        ),
      );
      const tipT = pow(heightFrac, TIP_FALLOFF).mul(tipEdge);
      const crestLift = float(CREST_GLOW_BASE).add(
        smoothstep(float(CREST_GLOW_LO), float(CREST_GLOW_HI), waveY).mul(
          CREST_GLOW_GAIN,
        ),
      );

      // Muted two-tone hue field over world XZ, drifting very slowly.
      const hueMix = sin(positionWorld.x.mul(HUE_FREQ_X).add(hueDriftU))
        .mul(0.25)
        .add(
          sin(
            positionWorld.z
              .mul(HUE_FREQ_Z)
              .sub(hueDriftU.mul(HUE_DRIFT_RATIO)),
          ).mul(0.25),
        )
        .add(0.5);
      const lightColor = mix(COLOR_TIP, mix(HUE_A, HUE_B, hueMix), HUE_STRENGTH);

      // Calm darkness under the centered breath-ring UI.
      const centerDist = length(
        positionWorld.xz.sub(vec2(LOOK_AT[0], LOOK_AT[2])),
      );
      const centerMask = mix(
        1.0 - CENTER_DIM_AMOUNT,
        1.0,
        smoothstep(float(CENTER_DIM_INNER), float(CENTER_DIM_OUTER), centerDist),
      );

      // Inhale lifts the light slightly.
      const breathLift = mix(float(1.0), float(TIP_BREATH_LIFT), breathEaseU);

      // Foreground rows dim toward silhouette.
      const camDist = distance(positionWorld, cameraPosition);
      const nearMask = mix(
        1.0 - NEAR_DIM_AMOUNT,
        1.0,
        smoothstep(float(NEAR_DIM_START), float(NEAR_DIM_END), camDist),
      );

      const glow = lightColor
        .mul(tipT)
        .mul(TIP_GLOW_GAIN)
        .mul(crestLift)
        .mul(centerMask)
        .mul(nearMask)
        .mul(breathLift);
      const lit = min(COLOR_BODY.add(glow), vec3(HIGHLIGHT_CAP));

      // Distance fog into near-black before the grid edge shows.
      const fogT = smoothstep(float(FOG_START), float(FOG_END), camDist);
      const color = mix(lit, COLOR_BASE, fogT);

      // Grayscale desaturation — the very last step.
      const lum = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(color, vec3(lum, lum, lum), grayscaleU);
    });

    const geometry = new THREE.BoxGeometry(
      REED_THICKNESS,
      REED_HEIGHT,
      REED_THICKNESS,
    );
    geometry.translate(0, REED_HEIGHT / 2, 0); // origin at the base

    const material = new MeshBasicNodeMaterial();
    material.positionNode = reedPosition();
    material.colorNode = reedColor();

    const reeds = new THREE.InstancedMesh(geometry, material, REED_COUNT);
    // Placement lives in the vertex stage; the identity-matrix bounds
    // would cull the whole field.
    reeds.frustumCulled = false;
    scene.add(reeds);

    // MSAA on (deviates from the contract's antialias: false): this is
    // the one scene made of real geometry silhouettes — thin bright
    // boxes against dark — where multisampling visibly earns its cost.
    const renderer = makeWebGPURenderer(context, { antialias: true });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? AMBIENT_BREATH_BASE;
    let breathMotion = 0;
    let breathFlow = 0;
    let phase1 = 0;
    let phase2 = 0;
    let bulgePhase = 0;
    let hueDrift = 0;

    function animate() {
      if (disposed) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      previousElapsed = elapsed;

      // Ambient pseudo-breath when no breath value is wired in.
      const targetBreath =
        breathRef.current?.value ??
        AMBIENT_BREATH_BASE +
          AMBIENT_BREATH_AMP * Math.sin(elapsed * AMBIENT_BREATH_RATE);
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      const motionTarget = clampNumber(
        Math.abs(breathDelta) * BREATH_MOTION_GAIN,
        0.0,
        1.0,
      );
      breathMotion = damp(
        breathMotion,
        motionTarget,
        motionTarget > breathMotion
          ? BREATH_MOTION_ATTACK_RATE
          : BREATH_MOTION_RELEASE_RATE,
        deltaSeconds,
      );
      // Signed lead of the breath target over the smoothed value —
      // inhale pulls the primary swell forward, exhale lets it recede.
      breathFlow = damp(
        breathFlow,
        clampNumber(
          (targetBreath - smoothedBreath) * BREATH_FLOW_GAIN,
          -1.0,
          1.0,
        ),
        BREATH_FLOW_RATE,
        deltaSeconds,
      );

      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);

      // CPU-integrated phases (never derived from breath-scaled time).
      phase1 += deltaSeconds * SWELL1_RATE;
      phase2 += deltaSeconds * SWELL2_RATE;
      bulgePhase += deltaSeconds * BULGE_RATE;
      hueDrift += deltaSeconds * HUE_DRIFT_RATE;

      (phase1U as unknown as { value: number }).value =
        phase1 + breathFlow * FLOW_PHASE_GAIN;
      (phase2U as unknown as { value: number }).value = phase2;
      (bulgePhaseU as unknown as { value: number }).value = bulgePhase;
      (hueDriftU as unknown as { value: number }).value = hueDrift;
      (swellAmpU as unknown as { value: number }).value =
        SWELL_AMPLITUDE * (SWELL_EXHALE_SCALE + breathEase * SWELL_BREATH_GAIN);
      (tiltU as unknown as { value: number }).value = clampNumber(
        TILT_AMOUNT + breathMotion * TILT_MOTION_GAIN,
        0.0,
        TILT_MAX,
      );
      (breathEaseU as unknown as { value: number }).value = breathEase;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Seagrass",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(reeds);
      reeds.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
