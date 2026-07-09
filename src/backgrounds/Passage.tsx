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
  floor,
  mix,
  smoothstep,
  step,
  dot,
  length,
  max,
  min,
  normalize,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- View ---
// Fixed camera at the origin looking down +z. The corridor's vanishing
// point sits exactly at screen center so the gates stay concentric with
// the breath-ring UI; a gentle center calm keeps the nearest glow soft.
const FOCAL = 1.3; // ray z component; larger = narrower FOV
const CENTER_CALM_FLOOR = 0.8;
const CENTER_CALM_START = 0.06;
const CENTER_CALM_END = 0.42;

// --- March ---
const MAX_STEPS = 72;
const MAX_DIST = 34.0; // ~7 gates visible at GATE_SPACING
const STEP_SCALE = 0.5;
const MIN_STEP = 0.06; // rays grazing a tube keep moving
const DITHER_STRENGTH = 0.4;

// --- Gates (tori in xy-planes, repeated along z) ---
const GATE_SPACING = 5.0; // one gate every ~5 s at drift speed
const RING_RADIUS = 1.25;
const TUBE_RADIUS = 0.11;
const RING_RADIUS_JITTER = 0.12; // per-gate radius swing (fraction)
const TUBE_RADIUS_JITTER = 0.2; // per-gate tube swing (fraction)
// Corridor meander: smooth sine of the gate index plus a small hash
// jitter, so consecutive gates flow rather than jump. Total offset
// stays within ±(MEANDER_AMP + CENTER_JITTER) ≈ ±0.35.
const MEANDER_X_FREQ = 0.6;
const MEANDER_Y_FREQ = 0.43;
const MEANDER_Y_PHASE = 2.4;
const MEANDER_AMP = 0.24;
const CENTER_JITTER = 0.11;
const GATE_HASH_SEED = 3.7;
const MAJOR_GATE_CHANCE = 0.25; // ~1 in 4 gates read slightly brighter
const MAJOR_GATE_GAIN = 1.35;

// --- Glow accumulation ---
// Tuned so empty-corridor rays accumulate almost nothing: sRGB encoding
// lifts raw values hard (raw 0.05 displays near 0.25), so the darkness
// between gates must stay truly dark.
const GLOW_INTENSITY = 0.0028;
const GLOW_FALLOFF = 30.0;
const GLOW_EPS = 0.05;
const NEAR_FADE_END = 2.2; // gates dissolve as the camera passes through
const DIST_FALLOFF = 0.085;

// --- Drift (constant speed, NEVER breath-modulated) ---
const DRIFT_SPEED = 1.0;

// --- Breath (gains are total swing at full inhale) ---
const BREATH_RESPONSE_RATE = 4.0;
const BREATH_MOTION_GAIN = 2.6;
const BREATH_MOTION_ATTACK_RATE = 4.5;
const BREATH_MOTION_RELEASE_RATE = 1.6;
// Ambient pseudo-breath when no breath value is wired (~18 s period).
const AMBIENT_BREATH_BASE = 0.4;
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_RATE = 0.35;
const BREATH_RADIUS_BASE = 0.96; // gates dilate ~+8% at full inhale
const BREATH_RADIUS_GAIN = 0.08;
const BREATH_GLOW_BASE = 0.97; // glow lifts ~+6% at full inhale
const BREATH_GLOW_GAIN = 0.06;
const MOTION_TUBE_GAIN = 0.1; // tube quivers transiently on breath motion

// --- Look (pale moon-silver ↔ faint lavender over near-black) ---
const COLOR_SILVER = vec3(0.5, 0.54, 0.62);
const COLOR_LAVENDER = vec3(0.44, 0.4, 0.58);
const COLOR_BASE = vec3(0.004, 0.005, 0.009);
const HAZE_TINT = vec3(0.012, 0.014, 0.022); // faint cool lift, far depths
const HAZE_INNER = 0.12; // screen radius where the haze peaks
const HAZE_OUTER = 0.55; // screen radius where the haze is gone
const TONE_KNEE = 1.3; // c/(1+kc): caps ~0.77 pre-encode

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// Interleaved Gradient Noise — temporal dither for anti-banding
const IGN = Fn(([p]: [TSLNode]) => {
  const magicXY = vec2(0.06711056, 0.00583715);
  const magicZ = float(52.9829189);
  return fract(magicZ.mul(fract(dot(p, magicXY))));
});

export const Passage = ({
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
    const glowIntensityU = uniform(float(GLOW_INTENSITY));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    // Raymarcher must live inside Fn for Loop/If/Break/toVar/assign to attach.
    const computeColor = Fn(() => {
      const uvRaw = uv();
      const uvAdj = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      // Breath channels — every gain subtle
      const radiusFactor = float(BREATH_RADIUS_BASE).add(
        breathEase.mul(BREATH_RADIUS_GAIN),
      );
      const glowIntensity = glowIntensityU.mul(
        float(BREATH_GLOW_BASE).add(breathEase.mul(BREATH_GLOW_GAIN)),
      );
      const tubeFactor = float(1.0).add(breathMotionU.mul(MOTION_TUBE_GAIN));

      // Screen center stays slightly calmer so the breath-ring UI reads
      // over the corridor's dark hole.
      const centerCalm = mix(
        float(CENTER_CALM_FLOOR),
        float(1.0),
        smoothstep(
          float(CENTER_CALM_START),
          float(CENTER_CALM_END),
          length(uvAdj),
        ),
      );

      // Fixed camera; forward drift lives in the ray origin's z.
      // Constant speed — drift is never breath-modulated.
      const ro = vec3(0.0, 0.0, timeU.mul(DRIFT_SPEED));
      const rd = normalize(vec3(uvAdj.x, uvAdj.y, float(FOCAL)));

      // Torus gate for one repetition cell. Neighboring gates sit a full
      // GATE_SPACING apart and glow falls off as 1/d², so evaluating only
      // the sample's own cell (plus the next, so approaching gates glow
      // before their boundary) is seamless — the dropped cell behind
      // contributes ~1e-5 per step at the crossover.
      const evalGate = (pxy: TSLNode, zWorld: TSLNode, cellIndex: TSLNode) => {
        const h0 = fract(
          sin(cellIndex.mul(127.1).add(GATE_HASH_SEED)).mul(43758.5453),
        );
        const h1 = fract(h0.mul(41.13));
        const h2 = fract(h0.mul(89.53));
        const h3 = fract(h0.mul(23.71));
        const h4 = fract(h0.mul(57.29));
        const h5 = fract(h0.mul(9.37));

        const ringRadius = float(RING_RADIUS)
          .mul(float(1.0).add(h0.sub(0.5).mul(2.0 * RING_RADIUS_JITTER)))
          .mul(radiusFactor);
        const tubeRadius = float(TUBE_RADIUS)
          .mul(float(1.0).add(h1.sub(0.5).mul(2.0 * TUBE_RADIUS_JITTER)))
          .mul(tubeFactor);
        const gateCenter = vec2(
          sin(cellIndex.mul(MEANDER_X_FREQ))
            .mul(MEANDER_AMP)
            .add(h2.sub(0.5).mul(2.0 * CENTER_JITTER)),
          sin(cellIndex.mul(MEANDER_Y_FREQ).add(MEANDER_Y_PHASE))
            .mul(MEANDER_AMP)
            .add(h3.sub(0.5).mul(2.0 * CENTER_JITTER)),
        );

        const zLocal = zWorld.sub(cellIndex.add(0.5).mul(GATE_SPACING));
        const radial = length(pxy.sub(gateCenter)).sub(ringRadius);
        const d = length(vec2(radial, zLocal)).sub(tubeRadius);

        // ~1 in 4 gates carries a slightly brighter cadence
        const majorGain = mix(
          float(1.0),
          float(MAJOR_GATE_GAIN),
          step(h5, float(MAJOR_GATE_CHANCE)),
        );
        const tint = mix(COLOR_SILVER, COLOR_LAVENDER, h4).mul(majorGain);

        return { d, tint };
      };

      // Temporal-dithered ray start (anti-banding)
      const fragCoord = uvRaw.mul(resolutionU);
      const noiseCoord = fragCoord.add(
        vec2(fract(timeU).mul(59.0), fract(timeU.mul(0.61)).mul(97.0)),
      );
      const dither = IGN(noiseCoord).mul(DITHER_STRENGTH);

      const t = dither.toVar();
      const acc = vec3(0.0, 0.0, 0.0).toVar();

      Loop(MAX_STEPS, () => {
        const p = ro.add(rd.mul(t));
        const zWorld = p.z;
        const cell = floor(zWorld.div(GATE_SPACING));

        // Current cell's gate plus the one ahead — 2 field evals/step
        const gateA = evalGate(p.xy, zWorld, cell);
        const gateB = evalGate(p.xy, zWorld, cell.add(1.0));

        // Glow accumulation: glow ~ 1/d², near-camera fade so passing
        // gates dissolve instead of flaring, exponential depth falloff
        const glowA = glowIntensity.div(
          gateA.d.mul(gateA.d).mul(GLOW_FALLOFF).add(GLOW_EPS),
        );
        const glowB = glowIntensity.div(
          gateB.d.mul(gateB.d).mul(GLOW_FALLOFF).add(GLOW_EPS),
        );
        const nearFade = smoothstep(float(0.0), float(NEAR_FADE_END), t);
        const falloff = exp(t.mul(-DIST_FALLOFF));

        acc.assign(
          acc.add(
            gateA.tint
              .mul(glowA)
              .add(gateB.tint.mul(glowB))
              .mul(falloff)
              .mul(nearFade),
          ),
        );

        t.assign(
          t.add(max(min(gateA.d, gateB.d).mul(STEP_SCALE), float(MIN_STEP))),
        );

        If(t.greaterThan(float(MAX_DIST)), () => {
          Break();
        });
      });

      // Faint cool haze lifting the corridor's far depths — the deep
      // hole at screen center — just above true black.
      const haze = HAZE_TINT.mul(
        float(1.0).sub(
          smoothstep(float(HAZE_INNER), float(HAZE_OUTER), length(uvAdj)),
        ),
      );

      const col = COLOR_BASE.add(haze).add(acc.mul(centerCalm));

      // Soft tone knee — no white cores. No manual gamma: the renderer
      // sRGB-encodes the output; encoding here too double-lifts the
      // blacks into gray.
      const knee = col.div(col.mul(TONE_KNEE).add(1.0));

      // Grayscale desaturation — the very last step
      const lum = dot(knee, vec3(0.299, 0.587, 0.114));
      return mix(knee, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? AMBIENT_BREATH_BASE;
    let breathMotion = 0;

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

      // Slow-sine ambient pseudo-breath when no breath source is wired
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

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Passage",
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
