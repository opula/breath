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
  abs,
  length,
  min,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  TERRAIN FIELD — flowing 3-octave value-noise FBM
// ────────────────────────────────────────────────────────────

// Noise features per screen height; ~2.6 large hills fill the frame.
const FIELD_SCALE = 2.6;
// Rate the noise z-slice evolves (units/s) — the terrain slowly reshapes.
// CPU-integrated so nothing can ever scrub it backwards.
const FIELD_EVOLVE_SPEED = 0.04;
// Whole-terrain migration across the frame (uv units/s) — imperceptible
// per second, unmistakable per minute. Integrated on CPU.
const DRIFT_SPEED = 0.008;
// Fixed (pre-normalized) migration heading — a lazy diagonal.
const DRIFT_DIR_X = 0.83;
const DRIFT_DIR_Y = 0.55;
// Octave frequency step and per-octave lattice shift (decorrelation).
const FBM_LACUNARITY = 2.07;
const FBM_OCTAVE_SHIFT = vec3(13.7, 7.9, 5.3);
// Octave weights; FBM_NORM rescales the sum back to ~[0, 1].
const FBM_W1 = 0.5;
const FBM_W2 = 0.25;
const FBM_W3 = 0.125;
const FBM_NORM = FBM_W1 + FBM_W2 + FBM_W3;

// ────────────────────────────────────────────────────────────
//  CELL LATTICE — one shape (a circle), repeated
// ────────────────────────────────────────────────────────────

// Cells per screen height (portrait: ~52 rows, ~24 columns).
const CELL_DENSITY = 52.0;
// Field weight of the per-cell circle SDF. Lower = steeper radius response
// to the noise, so crest cells OVERFLOW their cell and weld into the
// neighbors' arcs — the merged-blob look of the reference.
const SHAPE_WEIGHT = 0.45;
// Field weight of the centered FBM. High values steepen the shore: crest
// cells overflow well past their corners (merged mesh + dark voids) and
// troughs go truly black, with only a few graded dot-rows between.
const NOISE_WEIGHT = 1.25;
// Baseline radius push: the median cell shows a small dot instead of
// nothing, and high-terrain cells blow past the cell corner entirely
// (reading as organic dark voids inside merged blobs).
const RING_BIAS = 0.045;

// ────────────────────────────────────────────────────────────
//  LINE EXTRACTION — thin soft ring where noise cancels circle
// ────────────────────────────────────────────────────────────

// Half-width of the zero-crossing band, in field units. Bolder than the
// first cut so overlapping arcs fuse visually where cells merge.
const LINE_HALF_WIDTH = 0.034;
// Soft edge width beyond the half-width (anti-alias skirt).
const LINE_SOFTNESS = 0.03;
// Extra half-width at full breath-motion energy — a brief soft
// shimmer when breath direction changes. Kept subtle.
const LINE_MOTION_WIDEN = 0.01;

// ────────────────────────────────────────────────────────────
//  COMPOSITION — dark center eye for the UI ring, soft corners
// ────────────────────────────────────────────────────────────

// Contours fade to near-black inside this radius (breath ring sits here).
const EYE_INNER = 0.1;
const EYE_OUTER = 0.3;
// Gentle corner falloff so focus stays on the mid annulus.
const VIGNETTE_START = 0.4;
const VIGNETTE_END = 0.72;
const VIGNETTE_AMOUNT = 0.3;

// ────────────────────────────────────────────────────────────
//  LOOK — one color over near-black (linear; renderer sRGB-encodes)
// ────────────────────────────────────────────────────────────

const COLOR_BASE = vec3(0.004, 0.007, 0.008); // near-black ground
const LINE_COLOR = vec3(0.4, 0.6, 0.5); // muted sea-glass green
// Ceiling on the composed color — no channel may approach white.
const HIGHLIGHT_CAP = 0.9;

// ────────────────────────────────────────────────────────────
//  BREATH — inhale re-pressurizes the map, sweeping the contours
// ────────────────────────────────────────────────────────────

// Uniform field offset at full breath swing: inhale blooms contours
// across the map, exhale recedes them like a tide. The heart of the
// scene. Keep modest — large values empty/flood the whole frame.
const BREATH_PRESSURE_GAIN = 0.12;
// Line luminance multiplier at full inhale (~+12%).
const LINE_BREATH_LIFT = 1.12;
const BREATH_RESPONSE_RATE = 4.2;
const BREATH_MOTION_GAIN = 2.6;
const BREATH_MOTION_ATTACK_RATE = 4.0;
const BREATH_MOTION_RELEASE_RATE = 1.6;
// Ambient pseudo-breath when no breath value is provided (~18 s period).
const AMBIENT_BREATH_BASE = 0.4;
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.35;

const clampNumber = (value: number, min_: number, max_: number) =>
  Math.max(min_, Math.min(max_, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// --- TSL shader functions ---

const hash3 = Fn(([p]: [TSLNode]) => {
  return fract(sin(dot(p, vec3(17.912, 59.437, 33.751))).mul(43141.593));
});

const valueNoise3 = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const bottom = mix(
    mix(hash3(i), hash3(i.add(vec3(1.0, 0.0, 0.0))), u.x),
    mix(
      hash3(i.add(vec3(0.0, 1.0, 0.0))),
      hash3(i.add(vec3(1.0, 1.0, 0.0))),
      u.x,
    ),
    u.y,
  );
  const top = mix(
    mix(
      hash3(i.add(vec3(0.0, 0.0, 1.0))),
      hash3(i.add(vec3(1.0, 0.0, 1.0))),
      u.x,
    ),
    mix(
      hash3(i.add(vec3(0.0, 1.0, 1.0))),
      hash3(i.add(vec3(1.0, 1.0, 1.0))),
      u.x,
    ),
    u.y,
  );
  return mix(bottom, top, u.z);
});

const fbm3 = Fn(([p]: [TSLNode]) => {
  const o1 = valueNoise3(p);
  const o2 = valueNoise3(p.mul(FBM_LACUNARITY).add(FBM_OCTAVE_SHIFT));
  const o3 = valueNoise3(
    p.mul(FBM_LACUNARITY * FBM_LACUNARITY).add(FBM_OCTAVE_SHIFT.mul(2.0)),
  );
  return o1.mul(FBM_W1).add(o2.mul(FBM_W2)).add(o3.mul(FBM_W3)).div(FBM_NORM);
});

const fragColor = Fn(
  ([uvIn, aspectU, fieldPhaseU, driftXU, driftYU, breathU, breathMotionU]: [
    TSLNode,
    TSLNode,
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

    // Smoothstep-eased breath.
    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));

    // Flowing terrain: FBM over the migrated plane at the evolving z-slice.
    const noisePos = pos.add(vec2(driftXU, driftYU));
    const terrain = fbm3(vec3(noisePos.mul(FIELD_SCALE), fieldPhaseU));

    // One shape: a circle SDF in every lattice cell.
    const cellUv = fract(pos.mul(CELL_DENSITY)).sub(0.5);
    const d = length(cellUv);

    // Falling field on inhale → rings grow and multiply (the map fills
    // as the lungs do); exhale sweeps them back out.
    const pressure = float(0.5).sub(breathEase).mul(BREATH_PRESSURE_GAIN);

    // The visible line is the zero set: noise cancelling the circle.
    // RING_BIAS shifts the whole map toward fuller rings so crests merge.
    const field = d
      .mul(SHAPE_WEIGHT)
      .add(terrain.sub(0.5).mul(NOISE_WEIGHT))
      .add(pressure)
      .sub(RING_BIAS);

    // Thin soft-edged contour; breath-motion energy widens it briefly.
    const halfWidth = float(LINE_HALF_WIDTH).add(
      breathMotionU.mul(LINE_MOTION_WIDEN),
    );
    const line = float(1.0).sub(
      smoothstep(halfWidth, halfWidth.add(LINE_SOFTNESS), abs(field)),
    );

    // Calm dark eye at center (UI ring home) + gentle corner vignette.
    const eye = smoothstep(float(EYE_INNER), float(EYE_OUTER), screenRad);
    const vignette = float(1.0).sub(
      smoothstep(float(VIGNETTE_START), float(VIGNETTE_END), screenRad).mul(
        VIGNETTE_AMOUNT,
      ),
    );
    const lift = mix(float(1.0), float(LINE_BREATH_LIFT), breathEase);

    const color = COLOR_BASE.add(
      LINE_COLOR.mul(line).mul(lift).mul(eye).mul(vignette),
    );
    return min(color, vec3(HIGHLIGHT_CAP, HIGHLIGHT_CAP, HIGHLIGHT_CAP));
  },
);

// --- Component ---

export const Isobar = ({
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
    const fieldPhaseU = uniform(float(0));
    const driftXU = uniform(float(0));
    const driftYU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    const color = fragColor(
      uv(),
      aspectU,
      fieldPhaseU,
      driftXU,
      driftYU,
      breathU,
      breathMotionU,
    );

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
    let fieldPhase = 0;
    let driftX = 0;
    let driftY = 0;

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

      // CPU-integrated drifts: constant rates, never scrubbed by breath.
      fieldPhase += deltaSeconds * FIELD_EVOLVE_SPEED;
      driftX += deltaSeconds * DRIFT_SPEED * DRIFT_DIR_X;
      driftY += deltaSeconds * DRIFT_SPEED * DRIFT_DIR_Y;

      (fieldPhaseU as unknown as { value: number }).value = fieldPhase;
      (driftXU as unknown as { value: number }).value = driftX;
      (driftYU as unknown as { value: number }).value = driftY;
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
      label: "Isobar",
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
