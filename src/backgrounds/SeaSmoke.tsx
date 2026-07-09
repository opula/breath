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
  abs,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  normalize,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// Sea Smoke — luminous fog rolling over dark unseen hills. A fixed-step
// accumulation raymarch gathers light inversely proportional to the ray's
// distance from an invisible ridged-noise terrain, so the mist glows from
// within while the camera crawls slowly forward.

// --- march ---
const RAY_STEPS = 44;
const SPEED = 1.4; // forward drift, world units / scene-second
const DIST_FLOOR = 0.35; // min ray-to-terrain distance (max glow per step)
const FOG_STEP_SIZE = 1.55; // step length as a multiple of terrain distance
const DITHER_RAY_JITTER = 0.7; // per-fragment ray-start offset (anti-banding)

// --- camera ---
const RAY_START_HEIGHT = 1.0;
const VIEW_Y_OFFSET = 0.42; // screen-space vertical bias before tilt
const FOCAL = 0.5; // smaller = wider field of view
const RAY_X_SPREAD = 0.85;
const CAM_TILT = 0.55; // radians, tips the view down toward the fog field
const SWAY_RATE = 0.021; // very slow lateral drift of the camera path
const SWAY_AMOUNT = 0.3;

// --- terrain (own value-noise lattice; ridged so crests read as hills) ---
const LATTICE_Y = 241.0;
const LATTICE_Z = 137.0;
const HASH_SCALE = 31417.9787;
const TERRAIN_XZ_SCALE = 0.48; // world → noise-space scale
const TERRAIN_FREQ = 1.7;
const TERRAIN_NOISE_AMP = 0.62;
const TERRAIN_HEIGHT = 0.75;
const TERRAIN_LACUNARITY = 2.15;
const TERRAIN_GAIN = 0.55;
const TERRAIN_SLICE = 7.9; // z-slice of the 3D noise used as the height field
const TERRAIN_EVOLVE_RATE = 0.018; // slice drift → fog banks morph very slowly

// --- accumulation → tone response (squared accumulation, soft knee) ---
const NEAR_FALLOFF = 0.06; // per-step exp decay: near steps dominate the glow
const NEAR_NORM = 13.0; // normalizer for the depth-weighted accumulator
const MIST_NORM = 55.0; // normalizer for the total accumulator (crest term)
const SOFT_KNEE = 1.15; // g = x / (1 + SOFT_KNEE * x); caps at ~0.87

// --- palette (3 stops blended by accumulation intensity) ---
const COLOR_SHADOW = vec3(0.02, 0.045, 0.055); // deep slate-teal shadow
const COLOR_MIST = vec3(0.28, 0.42, 0.46); // cyan-gray mist body
const COLOR_CREST = vec3(0.62, 0.72, 0.72); // pale crest glow (cap)
const COLOR_SKY = vec3(0.005, 0.009, 0.011); // near-black sky overhead
const BASE_BLEND_START = 0.02;
const BASE_BLEND_END = 0.72;
const CREST_BLEND_START = 0.28;
const CREST_BLEND_END = 0.78;
const CREST_MAX = 0.9; // never fully reach the crest stop
const SKY_FADE_START = 0.0;
const SKY_FADE_END = 0.85;
const SKY_DARKEN = 0.97;
const FINAL_DITHER = 0.012; // fine grain to break gradient banding

// --- breath ---
const BREATH_RESPONSE_RATE = 4.4;
const BREATH_MOTION_GAIN = 2.4;
const BREATH_MOTION_ATTACK_RATE = 4.2;
const BREATH_MOTION_RELEASE_RATE = 1.55;
const AMBIENT_BREATH_RATE = 0.52; // rad/s pseudo-breath when breath is absent
const BREATH_MIST_THIN = 0.07; // inhale → longer steps → mist thins slightly
const BREATH_RIDGE_CLARIFY = 0.08; // inhale → taller terrain → ridges clarify
const BREATH_CREST_LIFT = 0.1; // inhale → crest glow lifts ~10%
const BREATH_MOTION_GLOW = 0.04; // breath energy → small extra glow lift
const BREATH_MOTION_STEP = 0.02;
const TIME_BREATH_GAIN = 0.05; // scene time runs slightly faster on inhale
const TIME_MOTION_GAIN = 0.04;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const ditherHash = Fn(([p]: [TSLNode]) => {
  const q = fract(p.mul(vec2(0.3183, 0.1847))).toVar();
  q.assign(q.add(dot(q, q.add(vec2(48.51, 27.13)))));
  return fract(q.x.mul(q.y).mul(21.37));
});

const tiltYZ = Fn(([v, angle]: [TSLNode, TSLNode]) => {
  const s = sin(angle);
  const c = cos(angle);
  return vec2(c.mul(v.x).sub(s.mul(v.y)), s.mul(v.x).add(c.mul(v.y)));
});

const latticeHash = Fn(([n]: [TSLNode]) => {
  return fract(sin(n).mul(HASH_SCALE));
});

const valueNoise = Fn(([x]: [TSLNode]) => {
  const p = floor(x);
  const w = fract(x);
  const f = w.mul(w).mul(float(3.0).sub(w.mul(2.0)));
  const n = p.x.add(p.y.mul(LATTICE_Y)).add(p.z.mul(LATTICE_Z));

  const x00 = mix(latticeHash(n), latticeHash(n.add(1.0)), f.x);
  const x10 = mix(
    latticeHash(n.add(LATTICE_Y)),
    latticeHash(n.add(LATTICE_Y + 1.0)),
    f.x,
  );
  const near = mix(x00, x10, f.y);

  const x01 = mix(
    latticeHash(n.add(LATTICE_Z)),
    latticeHash(n.add(LATTICE_Z + 1.0)),
    f.x,
  );
  const x11 = mix(
    latticeHash(n.add(LATTICE_Y + LATTICE_Z)),
    latticeHash(n.add(LATTICE_Y + LATTICE_Z + 1.0)),
    f.x,
  );
  const far = mix(x01, x11, f.y);

  return mix(near, far, f.z);
});

const ridgedFbm = Fn(
  ([pIn, frequency, amplitudeIn]: [TSLNode, TSLNode, TSLNode]) => {
    const p = pIn.mul(frequency).toVar();
    const height = float(0.0).toVar();
    const amplitude = amplitudeIn.toVar();

    Loop(3, () => {
      const n = valueNoise(p);
      const ridge = float(1.0).sub(abs(n.mul(2.0).sub(1.0)));
      height.assign(height.add(ridge.mul(ridge).mul(amplitude)));
      p.assign(p.mul(TERRAIN_LACUNARITY));
      amplitude.assign(amplitude.mul(TERRAIN_GAIN));
    });

    return height;
  },
);

export const SeaSmoke = ({
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

    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const resolutionU = uniform(vec2(width, height));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const computeColor = Fn(() => {
      const uvRaw = uv();
      const fragCoord = uvRaw.mul(resolutionU);
      const screen = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      // breath-shaped knobs (ease = b*b*(3-2b))
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const terrainHeight = float(TERRAIN_HEIGHT).mul(
        float(1.0).add(breathEase.mul(BREATH_RIDGE_CLARIFY)),
      );
      const fogStep = float(FOG_STEP_SIZE).mul(
        float(1.0)
          .add(breathEase.mul(BREATH_MIST_THIN))
          .add(breathMotionU.mul(BREATH_MOTION_STEP)),
      );
      const crestLift = float(1.0)
        .add(breathEase.mul(BREATH_CREST_LIFT))
        .add(breathMotionU.mul(BREATH_MOTION_GLOW));

      // camera: slow forward drift, view tipped down toward the fog field
      const rayDirBase = normalize(
        vec3(
          screen.x.mul(RAY_X_SPREAD),
          screen.y.add(VIEW_Y_OFFSET),
          float(FOCAL),
        ),
      );
      const tilted = tiltYZ(vec2(rayDirBase.y, rayDirBase.z), float(CAM_TILT));
      const rayDir = normalize(vec3(rayDirBase.x, tilted.x, tilted.y));
      const rayPos = vec3(
        sin(timeU.mul(SWAY_RATE)).mul(SWAY_AMOUNT),
        float(RAY_START_HEIGHT),
        timeU.mul(SPEED),
      ).toVar();
      const dither = ditherHash(fragCoord);
      rayPos.assign(rayPos.add(rayDir.mul(dither.mul(DITHER_RAY_JITTER))));

      const terrainSlice = float(TERRAIN_SLICE).add(
        timeU.mul(TERRAIN_EVOLVE_RATE),
      );

      // fog accumulation: light ∝ 1 / distance-to-terrain per step;
      // a depth-weighted copy keeps the glow anchored to nearby banks
      const mist = float(0.0).toVar();
      const nearMist = float(0.0).toVar();

      Loop(RAY_STEPS, ({ i }: { i: TSLNode }) => {
        const sampleXZ = vec2(rayPos.x, rayPos.z).mul(TERRAIN_XZ_SCALE);
        const heightSample = ridgedFbm(
          vec3(sampleXZ.x, sampleXZ.y, terrainSlice),
          float(TERRAIN_FREQ),
          float(TERRAIN_NOISE_AMP),
        ).mul(terrainHeight);
        const dist = max(abs(rayPos.y.sub(heightSample)), float(DIST_FLOOR));
        rayPos.assign(rayPos.add(rayDir.mul(dist).mul(fogStep)));

        const weight = float(1.0).div(dist);
        mist.assign(mist.add(weight));
        nearMist.assign(
          nearMist.add(weight.mul(exp(float(i).mul(-NEAR_FALLOFF)))),
        );
      });

      // squared accumulation → soft-knee tone response (caps below 1)
      const glowRaw = nearMist.div(NEAR_NORM);
      const glowSquared = glowRaw.mul(glowRaw);
      const glow = glowSquared.div(
        float(1.0).add(glowSquared.mul(SOFT_KNEE)),
      );
      const crestRaw = mist.div(MIST_NORM);
      const crestSquared = crestRaw.mul(crestRaw);
      const crestGlow = crestSquared.div(
        float(1.0).add(crestSquared.mul(SOFT_KNEE)),
      );

      // 3-stop palette blended directly by accumulation intensity
      const base = mix(
        COLOR_SHADOW,
        COLOR_MIST,
        smoothstep(float(BASE_BLEND_START), float(BASE_BLEND_END), glow),
      );
      const crestAmount = min(
        smoothstep(float(CREST_BLEND_START), float(CREST_BLEND_END), crestGlow)
          .mul(crestLift),
        float(CREST_MAX),
      );
      const lit = mix(base, COLOR_CREST, crestAmount);

      // near-black sky overhead
      const skyFade = smoothstep(
        float(SKY_FADE_START),
        float(SKY_FADE_END),
        screen.y,
      ).mul(SKY_DARKEN);
      const composed = mix(lit, COLOR_SKY, skyFade);

      // centered fine grain, then grayscale as the very last step
      const grain = dither.sub(0.5).mul(FINAL_DITHER);
      const finalColor = max(
        composed.add(vec3(grain, grain, grain)),
        vec3(0.0, 0.0, 0.0),
      );
      const luma = dot(finalColor, vec3(0.299, 0.587, 0.114));
      return mix(finalColor, vec3(luma, luma, luma), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let sceneTime = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
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
      // ambient pseudo-breath keeps the scene breathing without an exercise
      const targetBreath = breathRef.current
        ? breathRef.current.value
        : 0.5 + 0.5 * Math.sin(elapsed * AMBIENT_BREATH_RATE);
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
      previousElapsed = elapsed;

      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      sceneTime +=
        deltaSeconds *
        (1.0 + breathEase * TIME_BREATH_GAIN + breathMotion * TIME_MOTION_GAIN);

      (timeU as unknown as { value: number }).value = sceneTime;
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
      label: "SeaSmoke",
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
