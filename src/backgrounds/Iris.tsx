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
  fract,
  floor,
  mix,
  smoothstep,
  dot,
  atan,
  abs,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  VIEW — polar tunnel mapping
// ────────────────────────────────────────────────────────────

// Tunnel depth = TUNNEL_DEPTH_SCALE / radius; bigger = deeper-feeling tunnel.
const TUNNEL_DEPTH_SCALE = 0.32;
// Keeps depth finite at the exact center (hidden inside the dark pupil).
const RADIUS_EPS = 0.004;
// Maps quadrant-mirrored atan output [0, π/2] to [0, 1].
const ANGLE_NORM = 2 / Math.PI;
// Base inward drift, integrated on CPU (rad/s of shared flow phase).
// Slowest ring completes a band cycle in ~15 s at rest.
const FLOW_SPEED = 0.42;

// ────────────────────────────────────────────────────────────
//  RIPPLE SYSTEMS — 3 concentric band systems that interfere
// ────────────────────────────────────────────────────────────

// freq: bands per depth unit · speedMul: inward drift vs shared flow phase ·
// angWaves/angAmp: low-frequency angular wobble (organic, non-circular rings) ·
// wobDriftMul: slow rotation of the wobble (sign = direction) ·
// phaseSeed: decorrelates systems · weight: contribution to the field.
const RING_SPECS = [
  { freq: 6.2, speedMul: 1.0, angWaves: 3, angAmp: 0.5, wobDriftMul: 0.11, phaseSeed: 0.0, weight: 0.4 },
  { freq: 10.7, speedMul: 0.68, angWaves: 5, angAmp: 0.34, wobDriftMul: -0.07, phaseSeed: 2.4, weight: 0.28 },
  { freq: 3.6, speedMul: 1.31, angWaves: 2, angAmp: 0.62, wobDriftMul: 0.05, phaseSeed: 4.8, weight: 0.26 },
];

// Soft band shaping: smoothstep window over each ring's sine.
const BAND_LO = -0.45;
const BAND_HI = 0.9;

// ────────────────────────────────────────────────────────────
//  NOISE TEXTURE — value-noise breakup in tunnel space
// ────────────────────────────────────────────────────────────

const NOISE_ANG_SCALE = 4.0;
const NOISE_DEPTH_SCALE = 1.6;
// Texture drifts inward with the bands (fraction of shared flow phase).
const NOISE_DRIFT_MUL = 0.85;
// Additive texture amount (centered noise, so ±half of this).
const NOISE_AMOUNT = 0.16;
// Same noise perturbs ring phases so bands waver organically.
const PHASE_NOISE_AMOUNT = 0.6;
// Second octave: relative scale / lattice offset / blend weights.
const NOISE_OCTAVE_SCALE = 2.13;
const NOISE_OCTAVE_OFFSET = vec2(11.7, 5.3);
const NOISE_OCTAVE_MIX = 0.32;

// ────────────────────────────────────────────────────────────
//  LOOK — three fixed tones mixed by field intensity (linear)
// ────────────────────────────────────────────────────────────

const COLOR_BASE = vec3(0.01, 0.02, 0.028); // deep near-black teal
const COLOR_MID = vec3(0.075, 0.21, 0.23); // mid sea-teal
const COLOR_HIGH = vec3(0.44, 0.58, 0.56); // pale seafoam-gray ceiling

// Field thresholds for the base→mid and mid→high mixes.
const MID_LO = 0.08;
const MID_HI = 0.72;
const HIGH_LO = 0.58;
const HIGH_HI = 1.02;
// Cap on how far bands can reach toward COLOR_HIGH.
const HIGHLIGHT_MAX = 0.8;

// ────────────────────────────────────────────────────────────
//  PUPIL & VIGNETTE — dark center, soft frame edges
// ────────────────────────────────────────────────────────────

const PUPIL_INNER = 0.035;
const PUPIL_OUTER = 0.3;
const EDGE_FADE_START = 0.38;
const EDGE_FADE_END = 0.62;
const EDGE_FADE_AMOUNT = 0.3;

// ────────────────────────────────────────────────────────────
//  BREATH — inhale slows the flow, opens the pupil, lifts light
// ────────────────────────────────────────────────────────────

const BREATH_RESPONSE_RATE = 4.6;
// Inward flow eases down 15% at full inhale.
const BREATH_FLOW_SLOWDOWN = 0.15;
// Dark center aperture opens 20% wider at full inhale.
const BREATH_APERTURE_OPEN = 0.2;
// Overall luminance lifts 8% at full inhale.
const BREATH_LUMINANCE_LIFT = 0.08;
// Tiny extra lift from breath-motion energy (contract wiring, kept subtle).
const BREATH_MOTION_LIFT = 0.03;
const BREATH_MOTION_GAIN = 2.8;
const BREATH_MOTION_ATTACK_RATE = 4.2;
const BREATH_MOTION_RELEASE_RATE = 1.8;
// Ambient pseudo-breath when no breath value is provided (~21 s period).
const AMBIENT_BREATH_BASE = 0.4;
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.3;

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// --- TSL shader functions ---

const hash = Fn(([p]: [TSLNode]) => {
  return fract(sin(dot(p, vec2(37.549, 151.237))).mul(21873.613));
});

const valueNoise = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(hash(i), hash(i.add(vec2(1.0, 0.0))), u.x),
    mix(hash(i.add(vec2(0.0, 1.0))), hash(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fragColor = Fn(
  ([uvIn, aspectU, flowPhaseU, breathU, breathMotionU]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
  ]) => {
    // Centered, aspect-correct screen position.
    const centered = uvIn.sub(0.5);
    const pos = vec2(centered.x.mul(aspectU), centered.y);
    const screenRad = length(pos);

    // Quadrant-mirrored polar mapping (mandala symmetry).
    const arc = atan(abs(pos.y), abs(pos.x));
    const angle01 = arc.mul(ANGLE_NORM);
    const depth = float(TUNNEL_DEPTH_SCALE).div(screenRad.add(RADIUS_EPS));

    // Smoothstep-eased breath.
    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));

    // Value-noise texture, drifting inward with the field (2 octaves).
    const noiseUv = vec2(
      angle01.mul(NOISE_ANG_SCALE),
      depth.mul(NOISE_DEPTH_SCALE).sub(flowPhaseU.mul(NOISE_DRIFT_MUL)),
    );
    const texNoise = valueNoise(noiseUv)
      .mul(1.0 - NOISE_OCTAVE_MIX)
      .add(
        valueNoise(
          noiseUv.mul(NOISE_OCTAVE_SCALE).add(NOISE_OCTAVE_OFFSET),
        ).mul(NOISE_OCTAVE_MIX),
      )
      .sub(0.5);

    // Three interfering ripple-band systems, drifting inward.
    let field: TSLNode = texNoise.mul(NOISE_AMOUNT);
    for (const spec of RING_SPECS) {
      const wobble = sin(
        angle01
          .mul(spec.angWaves * Math.PI)
          .add(flowPhaseU.mul(spec.wobDriftMul))
          .add(spec.phaseSeed),
      ).mul(spec.angAmp);
      const wave = sin(
        depth
          .mul(spec.freq)
          .sub(flowPhaseU.mul(spec.speedMul))
          .add(wobble)
          .add(texNoise.mul(PHASE_NOISE_AMOUNT)),
      );
      const band = smoothstep(float(BAND_LO), float(BAND_HI), wave);
      field = field.add(band.mul(spec.weight));
    }

    // Three fixed tones mixed by field intensity.
    const midMix = smoothstep(float(MID_LO), float(MID_HI), field);
    const highMix = smoothstep(float(HIGH_LO), float(HIGH_HI), field).mul(
      HIGHLIGHT_MAX,
    );
    const toned = mix(mix(COLOR_BASE, COLOR_MID, midMix), COLOR_HIGH, highMix);

    // Dark center pupil; inhale opens the aperture wider.
    const aperture = float(1.0).add(breathEase.mul(BREATH_APERTURE_OPEN));
    const pupil = smoothstep(
      float(PUPIL_INNER).mul(aperture),
      float(PUPIL_OUTER).mul(aperture),
      screenRad,
    );
    const vignette = float(1.0).sub(
      smoothstep(float(EDGE_FADE_START), float(EDGE_FADE_END), screenRad).mul(
        EDGE_FADE_AMOUNT,
      ),
    );
    const lift = float(1.0)
      .add(breathEase.mul(BREATH_LUMINANCE_LIFT))
      .add(breathMotionU.mul(BREATH_MOTION_LIFT));

    return toned.mul(pupil).mul(vignette).mul(lift);
  },
);

// --- Component ---

export const Iris = ({
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
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const aspectU = uniform(float(aspect));
    const flowPhaseU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    const color = fragColor(uv(), aspectU, flowPhaseU, breathU, breathMotionU);

    // Grayscale desaturation — the very last step.
    const lum = dot(color, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(color, vec3(lum, lum, lum), grayscaleU);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = outputColor;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;
    let flowPhase = 0;

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

      // Integrate inward flow so breath slowdown never scrubs the phase.
      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      flowPhase +=
        deltaSeconds * FLOW_SPEED * (1 - BREATH_FLOW_SLOWDOWN * breathEase);

      (flowPhaseU as unknown as { value: number }).value = flowPhase;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Iris",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(mesh);
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
