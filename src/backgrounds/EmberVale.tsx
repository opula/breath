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
  cos,
  exp,
  fract,
  floor,
  mix,
  smoothstep,
  dot,
  normalize,
  abs,
  max,
  step,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// Ember Vale — slow flight over canyons made of light. An accumulation
// raymarch over terraced fractal terrain renders the landscape as luminous
// strata: deep indigo base, dusty blue heights, and a single desaturated
// rose-ember accent reserved for the deepest canyon floors.

// — Ray march —
const RAY_STEPS = 88;
const FAR_CLIP = 48.0;
const RAY_START_JITTER = 0.035;
const STEP_BASE = 0.024;
const STEP_GAIN = 0.085;
const WEIGHT_FLOOR = 0.006;

// — Camera & motion —
const FLIGHT_SPEED = 0.55;
const CAM_HEIGHT = 2.35;
const CAM_PITCH_DOWN = 0.14;
const FOV_Z = 1.25;
const SWAY_RATE = 0.05;
const SWAY_AMP = 0.6;

// — Terrain (own fractal: ridged-blend octaves, own rotation matrix, terraced) —
const TERRAIN_OCTAVES = 3;
const TERRAIN_SCALE = 0.5;
const TERRAIN_AMP = 0.85;
const OCTAVE_GAIN = 0.45;
const RIDGE_MIX = 0.35;
// 2.31 rad rotation scaled by 1.93 between octaves
const OCT_M_XX = -1.3026;
const OCT_M_XY = -1.4242;
const OCT_M_YX = 1.4242;
const OCT_M_YY = -1.3026;
const OCT_SHIFT_X = 17.3;
const OCT_SHIFT_Y = -9.8;
const SKY_LEVEL = 5.0;

// — Terracing (quantize-then-soften height → strata of light) —
const TERRACE_DENSITY = 2.6;
const TERRACE_EDGE_LO = 0.18;
const TERRACE_EDGE_HI = 0.82;
const TERRACE_MIX = 0.6;

// — Palette (the set's one warm accent lives here) —
const COLOR_BASE_INDIGO = vec3(0.03, 0.05, 0.14);
const COLOR_MID_DUSTY = vec3(0.1, 0.16, 0.3);
const COLOR_EMBER = vec3(0.42, 0.16, 0.18);
const HEIGHT_COLOR_LO = 0.25;
const HEIGHT_COLOR_HI = 1.05;
const EMBER_FLOOR_LO = 0.12;
const EMBER_FLOOR_HI = 0.55;
const EMBER_STRENGTH = 0.65;

// — Atmosphere & grade —
const FOG_RATE = 0.055;
const SKY_FALLOFF = 4.5;
const SKY_GLOW = 0.4;
const ACC_SCALE = 0.0035;
const ACC_SOFT_SQUARE = 0.6;
const TONE_KNEE = 1.25; // soft knee c/(1 + k·c); caps highlights at 1/k = 0.8
const DITHER_STRENGTH = 0.005;

// — Breath —
const BREATH_RESPONSE_RATE = 3.2;
const AMBIENT_BREATH_PERIOD_SEC = 9.0;
const BREATH_AMP_GAIN = 0.05; // terrain amplitude swell on inhale
const BREATH_CAM_RISE = 0.07; // camera lifts on inhale
const BREATH_EMBER_GAIN = 0.08; // ember accent presence on inhale
const BREATH_GLOW_GAIN = 0.04; // overall glow lift on inhale
const BREATH_TIME_RATE_GAIN = 0.02; // gentle scene-time rate modulation

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const rotate2 = Fn(([v, angle]: [TSLNode, TSLNode]) => {
  const s = sin(angle);
  const c = cos(angle);
  return vec2(c.mul(v.x).sub(s.mul(v.y)), s.mul(v.x).add(c.mul(v.y)));
});

const hash21 = Fn(([pIn]: [TSLNode]) => {
  const q = fract(pIn.mul(vec2(371.19, 219.47))).toVar();
  q.assign(q.add(dot(q, q.add(vec2(61.13, 52.71)))));
  return fract(q.x.mul(q.y).add(q.x));
});

const gradientDitherNoise = Fn(([p]: [TSLNode]) => {
  const magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z.mul(fract(dot(p, vec2(magic.x, magic.y)))));
});

const noise2d = Fn(([x]: [TSLNode]) => {
  const cell = floor(x);
  const fRaw = fract(x);
  // quintic smoothing
  const f = fRaw
    .mul(fRaw)
    .mul(fRaw)
    .mul(fRaw.mul(fRaw.mul(6.0).sub(15.0)).add(10.0));
  const a = hash21(cell);
  const b = hash21(cell.add(vec2(1.0, 0.0)));
  const c = hash21(cell.add(vec2(0.0, 1.0)));
  const d = hash21(cell.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
});

const terrainHeight = Fn(([q, seed, amp]: [TSLNode, TSLNode, TSLNode]) => {
  const pos = q
    .mul(TERRAIN_SCALE)
    .add(vec2(seed.mul(0.913), seed.mul(1.371)))
    .toVar();
  const height = float(0.0).toVar();
  const octaveAmp = float(1.0).mul(amp).toVar();

  Loop(TERRAIN_OCTAVES, () => {
    const n = noise2d(pos);
    const ridge = float(1.0).sub(abs(n.mul(2.0).sub(1.0)));
    const shaped = mix(n, ridge.mul(ridge), RIDGE_MIX);
    height.assign(height.add(shaped.mul(octaveAmp)));
    pos.assign(
      vec2(
        pos.x.mul(OCT_M_XX).add(pos.y.mul(OCT_M_XY)),
        pos.x.mul(OCT_M_YX).add(pos.y.mul(OCT_M_YY)),
      ).add(vec2(OCT_SHIFT_X, OCT_SHIFT_Y)),
    );
    octaveAmp.assign(octaveAmp.mul(OCTAVE_GAIN));
  });

  const terraceValue = height.mul(TERRACE_DENSITY);
  const terraced = floor(terraceValue)
    .add(smoothstep(TERRACE_EDGE_LO, TERRACE_EDGE_HI, fract(terraceValue)))
    .div(TERRACE_DENSITY);
  return mix(height, terraced, TERRACE_MIX);
});

export const EmberVale = ({
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
  const seedRef = useRef(Math.random() * 1000.0);
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
    const seedU = uniform(float(seedRef.current));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    const computeColor = Fn(() => {
      const uvRaw = uv();
      const fragCoord = uvRaw.mul(resolutionU);
      const rayUV = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      const ro = vec3(
        sin(timeU.mul(SWAY_RATE)).mul(SWAY_AMP),
        float(CAM_HEIGHT).add(breathEase.mul(BREATH_CAM_RISE)),
        timeU.mul(FLIGHT_SPEED),
      );
      const rdBase = normalize(vec3(rayUV.x, rayUV.y, float(FOV_Z)));
      const pitchedYZ = rotate2(
        vec2(rdBase.y, rdBase.z),
        float(CAM_PITCH_DOWN),
      );
      const rd = normalize(vec3(rdBase.x, pitchedYZ.x, pitchedYZ.y));

      const terrainAmp = float(TERRAIN_AMP).mul(
        float(0.97).add(breathEase.mul(BREATH_AMP_GAIN)),
      );
      const emberGain = float(EMBER_STRENGTH).mul(
        float(0.96).add(breathEase.mul(BREATH_EMBER_GAIN)),
      );

      const totalDistance = hash21(fragCoord).mul(RAY_START_JITTER).toVar();
      const accumulated = vec3(0.0, 0.0, 0.0).toVar();

      Loop(RAY_STEPS, () => {
        If(totalDistance.greaterThan(float(FAR_CLIP)), () => {
          Break();
        });

        const p = ro.add(rd.mul(totalDistance));
        const h = terrainHeight(p.xz, seedU, terrainAmp);
        const terrainField = p.y.sub(h);
        const field = mix(terrainField, p.y, step(float(SKY_LEVEL), p.y));
        const rayStep = float(STEP_BASE).add(abs(field).mul(STEP_GAIN));

        const heightT = smoothstep(HEIGHT_COLOR_LO, HEIGHT_COLOR_HI, h);
        const emberT = float(1.0)
          .sub(smoothstep(EMBER_FLOOR_LO, EMBER_FLOOR_HI, h))
          .mul(emberGain);
        const strataColor = mix(
          mix(COLOR_BASE_INDIGO, COLOR_MID_DUSTY, heightT),
          COLOR_EMBER,
          emberT,
        );

        const fog = exp(totalDistance.mul(-FOG_RATE));
        accumulated.assign(
          accumulated.add(
            strataColor.mul(fog).div(max(rayStep, float(WEIGHT_FLOOR))),
          ),
        );
        totalDistance.assign(totalDistance.add(rayStep));
      });

      // Own normalization: soft square (blend of linear and quadratic) keeps
      // the desaturated palette from over-saturating, then a soft-knee tone map.
      const normalized = accumulated.mul(ACC_SCALE);
      const softSquared = normalized.mul(
        normalized.mul(ACC_SOFT_SQUARE).add(1.0 - ACC_SOFT_SQUARE),
      );
      const glowLift = float(0.97).add(breathEase.mul(BREATH_GLOW_GAIN));
      const skyT = exp(max(rd.y, float(0.0)).mul(-SKY_FALLOFF));
      const skyBase = COLOR_BASE_INDIGO.add(
        COLOR_MID_DUSTY.mul(skyT).mul(SKY_GLOW),
      );
      const graded = softSquared.mul(glowLift).add(skyBase);
      const toneMapped = graded.div(graded.mul(TONE_KNEE).add(1.0));

      const ditherNoise = gradientDitherNoise(fragCoord)
        .sub(0.5)
        .mul(DITHER_STRENGTH);
      const dithered = toneMapped.add(
        vec3(ditherNoise, ditherNoise, ditherNoise),
      );
      const lum = dot(dithered, vec3(0.299, 0.587, 0.114));
      return mix(dithered, vec3(lum, lum, lum), grayscaleU);
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

    function animate() {
      if (disposed) {
        return;
      }

      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      const targetBreath = breathRef.current
        ? breathRef.current.value
        : 0.5 -
          0.5 * Math.cos((elapsed * Math.PI * 2) / AMBIENT_BREATH_PERIOD_SEC);
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      sceneTime += deltaSeconds * (1.0 + breathEase * BREATH_TIME_RATE_GAIN);

      (timeU as unknown as { value: number }).value = sceneTime;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "EmberVale",
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
