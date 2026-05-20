import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
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
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const RAY_STEPS = 44;

const SPEED = 3.0;
const TERRAIN_HEIGHT = 0.5;
const FOG_STEP_SIZE = 1.9;
const NOISE_FREQ = 2.0;
const NOISE_AMP = 0.27;
const COLOR_PHASE = vec3(3.7, 1.5, 1.0);
const VIEW_Y_OFFSET = 0.55;
const ATMOSPHERE_GRADE_MIX = 0.9;
const SKY_FADE_START = -0.2;
const SKY_FADE_END = 0.92;
const SKY_DARKEN_AMOUNT = 0.985;

const BREATH_RESPONSE_RATE = 4.8;
const BREATH_MOTION_GAIN = 1.8;
const BREATH_MOTION_ATTACK_RATE = 3.8;
const BREATH_MOTION_RELEASE_RATE = 1.7;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash12 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.assign(p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33))));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

const rotate2 = Fn(
  ([v, angle]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    const s = sin(angle);
    const c = cos(angle);
    return vec2(c.mul(v.x).sub(s.mul(v.y)), s.mul(v.x).add(c.mul(v.y)));
  },
);

const toneMap = Fn(([color]: [ReturnType<typeof vec3>]) => {
  const v = vec3(
    color.x.mul(0.59719).add(color.y.mul(0.176)).add(color.z.mul(0.0284)),
    color.x.mul(0.35458).add(color.y.mul(0.90834)).add(color.z.mul(0.13383)),
    color.x.mul(0.04823).add(color.y.mul(0.01566)).add(color.z.mul(0.83777)),
  );
  const a = v.mul(v.sub(0.3254214)).sub(0.000090537);
  const b = v.mul(v.mul(0.973729).add(0.342951)).add(0.018081);
  const mapped = a.div(b);

  return vec3(
    mapped.x
      .mul(1.60475)
      .add(mapped.y.mul(-0.10208))
      .add(mapped.z.mul(-0.00327)),
    mapped.x
      .mul(-0.53108)
      .add(mapped.y.mul(1.10813))
      .add(mapped.z.mul(-0.07276)),
    mapped.x
      .mul(-0.07367)
      .add(mapped.y.mul(-0.00605))
      .add(mapped.z.mul(1.07602)),
  );
});

const hash1 = Fn(([n]: [ReturnType<typeof float>]) => {
  return fract(sin(n).mul(43758.7253));
});

const valueNoise = Fn(([x]: [ReturnType<typeof vec3>]) => {
  const p = floor(x);
  const fRaw = fract(x);
  const f = fRaw.mul(fRaw).mul(float(3.0).sub(fRaw.mul(2.0)));
  const n = p.x.add(p.y.mul(157.0)).add(p.z.mul(113.0));

  const x00 = mix(hash1(n), hash1(n.add(1.0)), f.x);
  const x10 = mix(hash1(n.add(157.0)), hash1(n.add(158.0)), f.x);
  const xy0 = mix(x00, x10, f.y);

  const x01 = mix(hash1(n.add(113.0)), hash1(n.add(114.0)), f.x);
  const x11 = mix(hash1(n.add(270.0)), hash1(n.add(271.0)), f.x);
  const xy1 = mix(x01, x11, f.y);

  return mix(xy0, xy1, f.z).mul(1.8).add(1.7);
});

const fineNoise = Fn(
  ([pIn, frequency, amplitudeIn]: [
    ReturnType<typeof vec3>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const p = pIn.mul(frequency).toVar();
    const value = float(-1.1).toVar();
    const amplitude = amplitudeIn.toVar();

    Loop(3, () => {
      value.assign(value.add(valueNoise(p).mul(amplitude)));
      p.assign(p.mul(1.8));
      amplitude.assign(amplitude.mul(0.9));
    });

    return value;
  },
);

export const Atmosphere = ({
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
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const breathEnergy = breathEase.mul(0.5).add(breathMotionU.mul(0.5));
      const speed = float(SPEED);
      const terrainHeight = float(TERRAIN_HEIGHT).mul(
        float(0.9).add(breathEase.mul(0.14)).add(breathMotionU.mul(0.06)),
      );
      const fogStep = float(FOG_STEP_SIZE).mul(
        float(1.0).add(breathEnergy.mul(0.08)),
      );
      const noiseAmp = float(NOISE_AMP).mul(
        float(0.94).add(breathEnergy.mul(0.12)),
      );

      const rayPos = vec3(-1.0, 0.8, timeU.mul(speed)).toVar();
      const rayDirBase = normalize(
        vec3(screen.x, screen.y.add(VIEW_Y_OFFSET), float(0.3)),
      );
      const tiltedYZ = rotate2(vec2(rayDirBase.y, rayDirBase.z), float(0.76));
      const rayDir = normalize(vec3(rayDirBase.x, tiltedYZ.x, tiltedYZ.y));
      const dither = hash12(fragCoord);
      rayPos.assign(rayPos.add(rayDir.mul(dither.mul(0.8))));

      const accumulatedLight = vec3(27.2, 27.2, 27.2).toVar();

      Loop(RAY_STEPS, ({ i }) => {
        const rayXZ = vec2(rayPos.x, rayPos.z).mul(0.52);
        const heightSample = fineNoise(
          vec3(rayXZ.x, rayXZ.y, float(4.3)),
          float(NOISE_FREQ),
          noiseAmp,
        ).mul(terrainHeight);
        const distRaw = rayPos.y.sub(heightSample);
        const dist = max(abs(distRaw), float(0.4));
        rayPos.assign(rayPos.add(rayDir.mul(dist).mul(fogStep)));

        const phase = float(i)
          .add(8.8)
          .mul(0.12)
          .add(length(vec2(rayPos.x, rayPos.z).mul(0.15)));
        const color = vec3(1.0, 1.0, 1.0).add(sin(phase.add(COLOR_PHASE)));
        accumulatedLight.assign(accumulatedLight.add(color.div(dist)));
      });

      const finalColor = accumulatedLight
        .mul(accumulatedLight)
        .div(3009.0)
        .add(vec3(dither.mul(0.0425), dither.mul(0.0425), dither.mul(0.0425)));
      const mapped = pow(max(toneMap(finalColor), vec3(0, 0, 0)), vec3(0.92));
      const lum = dot(mapped, vec3(0.299, 0.587, 0.114));
      const brightMist = smoothstep(float(0.35), float(0.95), lum);
      const atmosphericGrade = mix(
        vec3(lum.mul(0.1), lum.mul(0.36), lum.mul(0.44)),
        vec3(lum.mul(0.72), lum.mul(0.9), lum.mul(0.96)),
        brightMist,
      );
      const graded = mix(mapped, atmosphericGrade, float(ATMOSPHERE_GRADE_MIX));
      const skyFade = smoothstep(
        float(SKY_FADE_START),
        float(SKY_FADE_END),
        screen.y,
      ).mul(SKY_DARKEN_AMOUNT);
      const composed = mix(graded, vec3(0.004, 0.009, 0.01), skyFade);
      const composedLum = dot(composed, vec3(0.299, 0.587, 0.114));
      return mix(composed, vec3(composedLum, composedLum, composedLum), grayscaleU);
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
      const targetBreath = breathRef.current?.value ?? 0.0;
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
        deltaSeconds * (1.0 + breathEase * 0.04 + breathMotion * 0.06);

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
      label: "Atmosphere",
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
