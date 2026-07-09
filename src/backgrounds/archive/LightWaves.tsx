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
  float,
  vec2,
  vec3,
  sin,
  cos,
  fract,
  mix,
  pow,
  smoothstep,
  dot,
  length,
  normalize,
  abs,
  min,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

const RAY_STEPS = 38;

const TIME_SCALE = 0.5;
const WAVE_SPEED = 1.0;
const WAVE_HEIGHT = 1.0;
const WAVE_1_FREQ = 4.8;
const WAVE_1_AMP = 0.038;
const WAVE_2_FREQ = 0.3;
const WAVE_2_AMP = -0.09;
const WAVE_3_FREQ_X = -0.6;
const WAVE_3_FREQ_Z = -0.7;
const WAVE_3_AMP = 0.12;

const NOISE_AMOUNT = 0.004;
const FOLDING_OFFSET = 9.291;
const STEP_BASE = 0.146;
const GLOW_INTENSITY = 0.0085;
const GLOW_SPREAD = 5.1;

const BREATH_RESPONSE_RATE = 5.8;
const BREATH_MOTION_GAIN = 3.4;
const BREATH_MOTION_ATTACK_RATE = 5.4;
const BREATH_MOTION_RELEASE_RATE = 2.2;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const generateFineNoise = Fn(([p]: [TSLNode]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(8.6231)).toVar();
  p3.assign(p3.add(dot(p3, vec3(p3.y, p3.z, p3.x).add(67.92))));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

export const LightWaves = ({
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
      const rayUV = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const timeElapsed = timeU.mul(TIME_SCALE);
      const waveDrive = timeElapsed.mul(WAVE_SPEED);
      const waveGain = float(WAVE_HEIGHT).mul(
        float(0.88).add(breathEase.mul(0.22)).add(breathMotionU.mul(0.12)),
      );
      const glowGain = float(0.82)
        .add(breathEase.mul(0.18))
        .add(breathMotionU.mul(0.18));
      const cameraDepth = float(2.0)
        .add(breathEase.mul(0.12))
        .add(breathMotionU.mul(0.05));

      const fragCoord = uvRaw.mul(resolutionU);
      const rayDir = normalize(vec3(rayUV.x, rayUV.y, float(1.0)));
      const pixelNoise = generateFineNoise(fragCoord).mul(NOISE_AMOUNT);
      const totalDistance = float(0.0).toVar();
      const accumulated = vec3(0.0, 0.0, 0.0).toVar();

      Loop(RAY_STEPS, () => {
        const currentPosRaw = rayDir.mul(totalDistance);
        const currentPos = vec3(
          currentPosRaw.x,
          currentPosRaw.y,
          currentPosRaw.z.sub(cameraDepth),
        );
        const waveHeight = sin(currentPos.x.mul(WAVE_1_FREQ).add(waveDrive))
          .mul(WAVE_1_AMP)
          .add(
            sin(currentPos.z.mul(WAVE_2_FREQ).sub(waveDrive.mul(0.6))).mul(
              WAVE_2_AMP,
            ),
          )
          .add(
            sin(
              currentPos.x
                .mul(WAVE_3_FREQ_X)
                .sub(currentPos.z.mul(WAVE_3_FREQ_Z))
                .add(waveDrive.mul(1.6)),
            ).mul(WAVE_3_AMP),
          )
          .mul(waveGain);

        const distToWave = abs(currentPos.y.sub(waveHeight));
        const foldedPos = currentPos.div(FOLDING_OFFSET);
        const stepSize = min(distToWave.sub(0.08), pixelNoise).add(STEP_BASE);
        totalDistance.assign(totalDistance.add(stepSize));

        const patternX = sin(
          foldedPos.x.add(cos(foldedPos.y).mul(cos(foldedPos.z))),
        );
        const patternY = sin(
          foldedPos.z.add(
            sin(foldedPos.y).mul(cos(foldedPos.x.add(timeElapsed))),
          ),
        );
        const basePattern = smoothstep(0.5, 0.7, patternX.mul(patternY));
        const blendFactor = float(0.15).div(
          distToWave.mul(distToWave).add(0.01),
        );
        const mixedPattern = mix(basePattern, float(1.0), blendFactor);
        const glowIntensity = float(GLOW_INTENSITY)
          .mul(glowGain)
          .div(float(GLOW_SPREAD).add(stepSize));
        const distanceFade = smoothstep(36.5, 7.3, totalDistance);
        const paletteColor = vec3(1.0, 1.0, 1.0).add(
          cos(totalDistance.mul(3.0).add(vec3(0.0, 1.0, 2.0))),
        );

        accumulated.assign(
          accumulated.add(
            paletteColor
              .mul(glowIntensity)
              .mul(mixedPattern)
              .mul(distanceFade),
          ),
        );
      });

      const dither = generateFineNoise(fragCoord.add(vec2(12.34, 56.78)))
        .sub(0.5)
        .div(128.0);
      const lit = accumulated.add(vec3(dither, dither, dither));
      const softened = pow(lit.mul(1.18), vec3(0.88, 0.88, 0.88));
      const lum = dot(softened, vec3(0.299, 0.587, 0.114));
      return mix(softened, vec3(lum, lum, lum), grayscaleU);
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
        deltaSeconds * (1.0 + breathEase * 0.04 + breathMotion * 0.08);

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
      label: "LightWaves",
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
