import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
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
  length,
  abs,
  dot,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const COLOR_DEEP = vec3(0.012, 0.018, 0.032);
const COLOR_LOW = vec3(0.035, 0.13, 0.18);
const COLOR_MID = vec3(0.2, 0.58, 0.62);
const COLOR_HIGH = vec3(0.86, 0.94, 0.84);
const COLOR_WARM = vec3(0.8, 0.46, 0.32);

const DRIFT_SPEED = 0.36;
const WARP_STRENGTH = 0.24;
const BREATH_ZOOM_AMOUNT = 0.13;
const BREATH_FREQUENCY_OPEN = 0.72;
const BREATH_PHASE_OFFSET = 0.5;
const BREATH_GLOW_AMOUNT = 0.26;
const BREATH_RESPONSE_RATE = 5.2;
const BREATH_MOTION_GAIN = 3.1;
const BREATH_MOTION_ATTACK_RATE = 4.8;
const BREATH_MOTION_RELEASE_RATE = 2.1;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const noise = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(p.x.mul(1234.0).add(p.y.mul(2413.0))).mul(5647.0));
});

const smoothNoise = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(noise(i), noise(i.add(vec2(1.0, 0.0))), u.x),
    mix(noise(i.add(vec2(0.0, 1.0))), noise(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fbm = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  let p: ReturnType<typeof vec2> = pIn;
  let total: ReturnType<typeof float> = float(0);
  let amp = 0.52;

  total = total.add(smoothNoise(p).mul(amp));
  p = vec2(
    p.x.mul(1.74).add(p.y.mul(0.68)),
    p.x.mul(-0.68).add(p.y.mul(1.74)),
  ).add(vec2(19.1, 7.4));
  amp *= 0.5;

  total = total.add(smoothNoise(p).mul(amp));
  p = vec2(
    p.x.mul(1.62).add(p.y.mul(0.52)),
    p.x.mul(-0.52).add(p.y.mul(1.62)),
  ).add(vec2(4.7, 31.3));
  amp *= 0.5;

  total = total.add(smoothNoise(p).mul(amp));
  p = vec2(
    p.x.mul(1.48).add(p.y.mul(0.46)),
    p.x.mul(-0.46).add(p.y.mul(1.48)),
  ).add(vec2(27.8, 13.6));
  amp *= 0.5;

  return total.add(smoothNoise(p).mul(amp));
});

const fragColor = Fn(
  ([uvIn, timeU, aspectU, breathU, breathMotionU]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const centered = uvIn.sub(0.5);
    const corrected = vec2(centered.x.mul(aspectU), centered.y).mul(2.0);
    const screenD = length(corrected);

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const time = timeU.mul(DRIFT_SPEED);
    const drift = vec2(
      sin(time.mul(0.27)).mul(0.32).add(sin(time.mul(0.11).add(2.2)).mul(0.2)),
      sin(time.mul(0.23).add(1.4))
        .mul(0.28)
        .add(sin(time.mul(0.09).add(4.1)).mul(0.18)),
    );
    const zoom = float(1.0)
      .sub(breathEase.mul(BREATH_ZOOM_AMOUNT))
      .sub(breathMotionU.mul(0.03));
    const p = corrected.mul(zoom);

    const flowA = fbm(
      p.mul(1.08).add(drift).add(vec2(time.mul(0.12), time.mul(-0.08))),
    );
    const flowB = fbm(
      vec2(abs(p.x), p.y)
        .mul(1.72)
        .add(vec2(time.mul(-0.07), time.mul(0.1)))
        .add(vec2(7.3, 2.1)),
    );
    const warpStrength = float(WARP_STRENGTH).mul(
      float(0.78).add(breathEase.mul(0.28)).add(breathMotionU.mul(0.18)),
    );
    const warped = vec2(
      p.x.add(flowA.sub(0.5).mul(warpStrength)),
      p.y.add(flowB.sub(0.5).mul(warpStrength.mul(0.74))),
    );
    const d = length(warped);

    const ringFrequency = float(8.8)
      .sub(breathEase.mul(BREATH_FREQUENCY_OPEN))
      .sub(breathMotionU.mul(0.28));
    const phase = time
      .mul(1.14)
      .add(breathEase.mul(BREATH_PHASE_OFFSET))
      .add(breathMotionU.mul(0.26));
    const primaryWave = sin(
      d.mul(ringFrequency).sub(phase).add(flowA.mul(2.2)),
    );
    const secondaryWave = sin(
      d.mul(4.1).add(time.mul(0.48)).sub(flowB.mul(1.55)),
    );
    const diagonalCurrent = sin(
      warped.x.mul(2.1).add(warped.y.mul(0.8)).add(time.mul(0.42)),
    )
      .mul(0.5)
      .add(0.5);

    const softBand = smoothstep(float(0.18), float(0.98), primaryWave).mul(
      0.48,
    );
    const broadBand = smoothstep(float(-0.2), float(0.9), secondaryWave).mul(
      0.3,
    );
    const haze = fbm(
      warped.mul(1.25).add(vec2(12.7, 6.4)).add(drift.mul(0.6)),
    ).mul(0.22);

    const edgeFade = float(1.0).sub(
      smoothstep(float(0.78), float(1.45), screenD),
    );
    const centerCalm = float(0.5).add(
      smoothstep(float(0.08), float(0.58), screenD).mul(0.5),
    );
    const breathGlow = float(0.78)
      .add(breathEase.mul(BREATH_GLOW_AMOUNT))
      .add(breathMotionU.mul(0.16));
    const energy = softBand
      .add(broadBand)
      .add(haze)
      .add(diagonalCurrent.mul(0.08))
      .mul(edgeFade)
      .mul(centerCalm)
      .mul(breathGlow);

    const veil = smoothstep(float(0.04), float(0.72), energy);
    const crest = smoothstep(float(0.32), float(0.98), energy);
    const warmTrace = smoothstep(float(0.65), float(1.0), primaryWave).mul(
      smoothstep(float(0.22), float(0.92), flowB).mul(0.18),
    );
    const bgColor = mix(
      COLOR_DEEP,
      COLOR_LOW,
      edgeFade.mul(float(0.16).add(breathEase.mul(0.08))),
    );
    const waterColor = mix(COLOR_LOW, COLOR_MID, veil);
    const litColor = mix(
      waterColor,
      COLOR_HIGH,
      crest.mul(float(0.64).add(breathMotionU.mul(0.18))),
    );
    const tracedColor = mix(litColor, COLOR_WARM, warmTrace);

    return mix(bgColor, tracedColor, veil);
  },
);

export const SinPulse = ({
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
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const uvRaw = uv();
    const color = fragColor(uvRaw, timeU, aspectU, breathU, breathMotionU);

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
      const motionTarget = clamp(
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
      label: "HarmonicPulse",
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
