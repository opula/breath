import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  Loop,
  If,
  Break,
  float,
  vec2,
  vec3,
  sin,
  exp,
  fract,
  mix,
  smoothstep,
  dot,
  length,
  normalize,
  abs,
  max,
  min,
  clamp,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- March ---
const MAX_STEPS = 80;
const MAX_DIST = 42.0;
const STEP_SCALE = 0.45;
const DITHER_STRENGTH = 0.45;

// --- Flight & sway (slow, no roll) ---
const SPEED = 0.3;
const FLIGHT_SPEED = 1.5;
const SWAY_X_FREQ = 0.29;
const SWAY_X_AMP = 0.3;
const SWAY_Y_FREQ = 0.21;
const SWAY_Y_AMP = 0.24;
const SWAY_Y_PHASE = 1.7;

// --- Veil fields (two interleaved sheet families) ---
// Both families hang PARALLEL to the flight axis (curtains beside the
// path, layers above/below it) so grazing rays accumulate into bright
// ribbons while rays down the open corridor stay dark — that
// directional variance is where all the contrast comes from.
const VEIL_SPACING = 2.7; // curtain-to-curtain spacing across x
const VEIL_SPACING_B_RATIO = 1.45; // horizontal layer family, wider spacing
const VEIL_TILT_COS = 0.97; // family B: near-horizontal layers…
const VEIL_TILT_SIN = 0.24; // …with a slight pitch so flight drifts through
const VEIL_PHASE_B = 1.37;
const VEIL_THICKNESS = 0.085;
const VEIL_THICKNESS_B_RATIO = 1.3; // layers read slightly softer
const FAMILY_B_WEIGHT = 0.7;

// --- Veil patchiness (sheets exist only in drifting patches) ---
// Without this every ray crosses every repeated sheet and the glow
// accumulates to a uniform wash; the sine-lattice mask carves the
// sheets into torn panels with true darkness between them.
const PATCH_FREQ_X = 0.53;
const PATCH_FREQ_Y = 0.41;
const PATCH_FREQ_Z = 0.23;
const PATCH_PHASE_B = 2.1; // decorrelates the drape family's patches
const PATCH_LO = 0.15; // smoothstep window over the sine product
const PATCH_HI = 0.55;

// --- Domain warp ---
const WARP_AMPLITUDE = 0.62;
const WARP_FREQUENCY = 0.78;
const WARP_BASE_N = 1.1;
const WARP_STEP_N = 1.4;
const FLOW_X = 0.9;
const FLOW_Y = 0.22;
const FLOW_Z = 0.55;

// --- Glow accumulation ---
// Tight falloff radius: sheets glow only when a ray passes close,
// so the open corridor stays near-black instead of hazing over.
const GLOW_INTENSITY = 0.0026;
const GLOW_FALLOFF = 26.0;
const GLOW_EPS = 0.06;
const NEAR_FADE_END = 3.5;
const DIST_FALLOFF = 0.18;

// --- Color (two-hue blend over near-black) ---
const COLOR_VIOLET = vec3(0.2, 0.22, 0.52); // blue-violet, committed chroma
const COLOR_TEAL = vec3(0.1, 0.46, 0.47); // sea teal, committed chroma
const COLOR_BASE = vec3(0.006, 0.011, 0.02); // blue-black, not neutral
const SATURATION_KEEP = 1.0; // full chroma; the knee tempers highlights anyway
const HUE_Z_FREQ = 0.075;
const HUE_X_FREQ = 0.11;
const HUE_DRIFT_WEIGHT = 0.62;
const HUE_DEPTH_WEIGHT = 0.4;
const HUE_DEPTH_RANGE = 26.0; // ray distance over which hue leans teal
const DRAPE_TEAL_PUSH = 0.45; // family B leans further teal
const TONE_KNEE = 1.45; // c/(1+kc): caps ~0.69 pre-gamma, ~0.85 post
const CENTER_CALM_FLOOR = 0.72;
const CENTER_CALM_START = 0.1;
const CENTER_CALM_END = 0.52;

// --- Breath (gains are total swing at full inhale) ---
const BREATH_RESPONSE_RATE = 3.4;
const AMBIENT_BREATH_SPEED = 0.52; // rad/s => ~12s pseudo-breath period
const BREATH_SPACING_BASE = 0.985;
const BREATH_SPACING_GAIN = 0.03; // corridor breathes open
const BREATH_OPENNESS_BASE = 1.045;
const BREATH_OPENNESS_GAIN = 0.045; // veils thin slightly on inhale
const BREATH_WARP_BASE = 0.975;
const BREATH_WARP_GAIN = 0.05;
const BREATH_GLOW_BASE = 0.97;
const BREATH_GLOW_GAIN = 0.06;
const BREATH_DRIFT_NUDGE = 0.04; // gentle forward lean on inhale

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// Interleaved Gradient Noise — temporal dither for anti-banding
const IGN = Fn(([p]: [TSLNode]) => {
  const magicXY = vec2(0.05224891, 0.00789319);
  const magicZ = float(47.8536137);
  return fract(magicZ.mul(fract(dot(p, magicXY))));
});

export const Undercurrent = ({
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

    // Uniforms
    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const resolutionU = uniform(vec2(width, height));
    const speedU = uniform(float(SPEED));
    const spacingU = uniform(float(VEIL_SPACING));
    const thicknessU = uniform(float(VEIL_THICKNESS));
    const warpAmplitudeU = uniform(float(WARP_AMPLITUDE));
    const warpFrequencyU = uniform(float(WARP_FREQUENCY));
    const glowIntensityU = uniform(float(GLOW_INTENSITY));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    // Raymarcher must live inside Fn for Loop/If/Break/toVar/assign to attach.
    const computeColor = Fn(() => {
      const uvRaw = uv();
      const uvAdj = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const time = timeU.mul(speedU);
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      // Breath channels — every gain subtle
      const veilSpacing = spacingU.mul(
        float(BREATH_SPACING_BASE).add(breathEase.mul(BREATH_SPACING_GAIN)),
      );
      const veilThickness = thicknessU.mul(
        float(BREATH_OPENNESS_BASE).sub(breathEase.mul(BREATH_OPENNESS_GAIN)),
      );
      const warpAmplitude = warpAmplitudeU.mul(
        float(BREATH_WARP_BASE).add(breathEase.mul(BREATH_WARP_GAIN)),
      );
      const glowIntensity = glowIntensityU.mul(
        float(BREATH_GLOW_BASE).add(breathEase.mul(BREATH_GLOW_GAIN)),
      );

      // Screen center stays slightly calmer so UI text remains readable
      const centerCalm = mix(
        float(CENTER_CALM_FLOOR),
        float(1.0),
        smoothstep(
          float(CENTER_CALM_START),
          float(CENTER_CALM_END),
          length(uvAdj),
        ),
      );

      // Slow forward flight with gentle organic sway (no roll)
      const ro = vec3(
        sin(time.mul(SWAY_X_FREQ)).mul(SWAY_X_AMP),
        sin(time.mul(SWAY_Y_FREQ).add(SWAY_Y_PHASE)).mul(SWAY_Y_AMP),
        time.mul(FLIGHT_SPEED).add(breathEase.mul(BREATH_DRIFT_NUDGE)),
      );
      const rd = normalize(vec3(uvAdj.x, uvAdj.y, float(1.0)));

      // Temporal-dithered ray start (anti-banding)
      const fragCoord = uvRaw.mul(resolutionU);
      const noiseCoord = fragCoord.add(
        vec2(fract(time).mul(71.0), fract(time.mul(0.53)).mul(113.0)),
      );
      const dither = IGN(noiseCoord).mul(DITHER_STRENGTH);

      const t = dither.toVar();
      const acc = vec3(0.0, 0.0, 0.0).toVar();

      Loop(MAX_STEPS, () => {
        const p = ro.add(rd.mul(t));

        // Evolving flow so the veils' gaps open and close over time
        const flow = vec3(
          time.mul(FLOW_X),
          time.mul(FLOW_Y),
          time.mul(FLOW_Z),
        );

        // Sine-based domain warp, two octaves
        const q = p.toVar();
        Loop(2, ({ i }: { i: TSLNode }) => {
          const n = float(WARP_BASE_N).add(float(i).mul(WARP_STEP_N));
          const qzxy = vec3(q.z, q.x, q.y);
          const warped = sin(qzxy.add(flow).mul(n).mul(warpFrequencyU))
            .mul(warpAmplitude)
            .div(n);
          q.assign(q.add(warped));
        });

        // Patch mask: sheets only exist where the slowly-drifting sine
        // lattice is positive enough — torn panels, dark gaps between.
        const patchField = sin(q.x.mul(PATCH_FREQ_X))
          .mul(sin(q.y.mul(PATCH_FREQ_Y)))
          .mul(sin(q.z.mul(PATCH_FREQ_Z)));
        const patchA = smoothstep(
          float(PATCH_LO),
          float(PATCH_HI),
          patchField,
        );
        const patchB = smoothstep(
          float(PATCH_LO),
          float(PATCH_HI),
          patchField.negate().add(sin(q.z.mul(PATCH_FREQ_Z).add(PATCH_PHASE_B)).mul(0.3)),
        );

        // Family A: undulating curtains flanking the corridor (repeat
        // across x, hanging parallel to the flight axis). No half-cell
        // offset: the lattice zero sits at a GAP center, so the camera
        // path (x ≈ 0) flies between curtains, never inside one.
        const cellA = abs(fract(q.x.div(veilSpacing)).sub(0.5)).mul(
          veilSpacing,
        );
        const dA = max(cellA, veilThickness);

        // Family B: soft near-horizontal layers above and below the
        // path, pitched slightly so forward flight drifts through them
        const spacingB = veilSpacing.mul(VEIL_SPACING_B_RATIO);
        const wB = q.y
          .mul(VEIL_TILT_COS)
          .add(q.z.mul(VEIL_TILT_SIN))
          .add(VEIL_PHASE_B);
        const cellB = abs(fract(wB.div(spacingB)).sub(0.5)).mul(spacingB);
        const dB = max(cellB, veilThickness.mul(VEIL_THICKNESS_B_RATIO));

        // Two-hue blend: violet-gray near, leaning soft teal with
        // depth and position; desaturated toward its own luma
        const hueDrift = sin(q.z.mul(HUE_Z_FREQ).add(q.x.mul(HUE_X_FREQ)))
          .mul(0.5)
          .add(0.5);
        const hueDepth = smoothstep(float(0.0), float(HUE_DEPTH_RANGE), t);
        const hueT = clamp(
          hueDrift
            .mul(HUE_DRIFT_WEIGHT)
            .add(hueDepth.mul(HUE_DEPTH_WEIGHT)),
          0.0,
          1.0,
        );
        const rawBlend = mix(COLOR_VIOLET, COLOR_TEAL, hueT);
        const blendLuma = dot(rawBlend, vec3(0.2126, 0.7152, 0.0722));
        const veilColor = mix(
          vec3(blendLuma, blendLuma, blendLuma),
          rawBlend,
          float(SATURATION_KEEP),
        );
        const drapeColor = mix(veilColor, COLOR_TEAL, float(DRAPE_TEAL_PUSH));

        // Glow accumulation: glow ~ 1/d^2, near-camera fade,
        // exponential distance falloff
        const glowA = glowIntensity
          .mul(patchA)
          .div(dA.mul(dA).mul(GLOW_FALLOFF).add(GLOW_EPS));
        const glowB = glowIntensity
          .mul(FAMILY_B_WEIGHT)
          .mul(patchB)
          .div(dB.mul(dB).mul(GLOW_FALLOFF).add(GLOW_EPS));
        const nearFade = smoothstep(float(0.0), float(NEAR_FADE_END), t);
        const falloff = exp(t.mul(-DIST_FALLOFF));

        acc.assign(
          acc.add(
            veilColor
              .mul(glowA)
              .add(drapeColor.mul(glowB))
              .mul(falloff)
              .mul(nearFade),
          ),
        );

        t.assign(t.add(min(dA, dB).mul(STEP_SCALE)));

        If(t.greaterThan(float(MAX_DIST)), () => {
          Break();
        });
      });

      const col = COLOR_BASE.add(acc);

      // Soft tone knee — no white cores. No manual gamma: the renderer
      // sRGB-encodes the output; doing it here too double-lifts the
      // blacks into gray (the parent scene's inherited mistake).
      const knee = col.div(col.mul(TONE_KNEE).add(1.0));
      const calmed = knee.mul(centerCalm);

      // Grayscale desaturation — the very last step
      const lum = dot(calmed, vec3(0.299, 0.587, 0.114));
      return mix(calmed, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0.5;

    function animate() {
      if (disposed) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      // Slow-sine ambient pseudo-breath when no breath source is wired
      const targetBreath =
        breathRef.current?.value ??
        0.5 + 0.5 * Math.sin(elapsed * AMBIENT_BREATH_SPEED);
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Undercurrent",
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
