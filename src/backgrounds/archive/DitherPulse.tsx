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
  min,
  mix,
  smoothstep,
  length,
  clamp,
  dot,
  exp,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

const COLOR_DEEP = vec3(0.006, 0.01, 0.018);
const COLOR_FIELD = vec3(0.028, 0.08, 0.105);
const COLOR_SIGNAL_LOW = vec3(0.05, 0.22, 0.25);
const COLOR_SIGNAL_MID = vec3(0.28, 0.72, 0.67);
const COLOR_SIGNAL_HIGH = vec3(0.9, 0.96, 0.82);
const COLOR_WARM_TRACE = vec3(0.82, 0.42, 0.34);

const DRIFT_SPEED = 0.34;
const WARP_STRENGTH = 0.26;
const DITHER_SCALE = 0.64;
const BREATH_ZOOM_AMOUNT = 0.12;
const BREATH_RING_OPEN = 0.68;
const BREATH_GLOW_AMOUNT = 0.24;
const BREATH_RESPONSE_RATE = 5.0;
const BREATH_MOTION_GAIN = 3.0;
const BREATH_MOTION_ATTACK_RATE = 4.6;
const BREATH_MOTION_RELEASE_RATE = 2.0;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash = Fn(([n]: [TSLNode]) => {
  return fract(sin(n).mul(43758.5453));
});

const noise2D = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(float(2.0).mul(f)));

  return mix(
    mix(hash(i.x.add(hash(i.y))), hash(i.x.add(1.0).add(hash(i.y))), u.x),
    mix(
      hash(i.x.add(hash(i.y.add(1.0)))),
      hash(i.x.add(1.0).add(hash(i.y.add(1.0)))),
      u.x,
    ),
    u.y,
  );
});

const fbm = Fn(([pIn]: [TSLNode]) => {
  let p: TSLNode = pIn;
  let total: TSLNode = float(0);
  let amp = 0.52;

  total = total.add(noise2D(p).mul(amp));
  p = vec2(
    p.x.mul(1.62).add(p.y.mul(0.58)),
    p.x.mul(-0.58).add(p.y.mul(1.62)),
  ).add(vec2(17.4, 9.1));
  amp *= 0.5;

  total = total.add(noise2D(p).mul(amp));
  p = vec2(
    p.x.mul(1.48).add(p.y.mul(0.42)),
    p.x.mul(-0.42).add(p.y.mul(1.48)),
  ).add(vec2(3.8, 28.6));
  amp *= 0.5;

  total = total.add(noise2D(p).mul(amp));
  p = vec2(
    p.x.mul(1.36).add(p.y.mul(0.36)),
    p.x.mul(-0.36).add(p.y.mul(1.36)),
  ).add(vec2(31.2, 14.7));
  amp *= 0.5;

  return total.add(noise2D(p).mul(amp));
});

const signalColor = Fn(
  ([uvCoord, timeU, aspectU, heightU, breathU, breathMotionU]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
  ]) => {
    const centered = uvCoord.sub(0.5);
    const corrected = vec2(centered.x.mul(aspectU), centered.y).mul(2.0);
    const screenD = length(corrected);

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const time = timeU.mul(DRIFT_SPEED);
    const zoom = float(1.0)
      .sub(breathEase.mul(BREATH_ZOOM_AMOUNT))
      .sub(breathMotionU.mul(0.035));
    const p = corrected.mul(zoom);

    const drift = vec2(
      sin(time.mul(0.33)).mul(0.26).add(sin(time.mul(0.13).add(1.8)).mul(0.16)),
      sin(time.mul(0.27).add(1.2))
        .mul(0.22)
        .add(sin(time.mul(0.1).add(4.3)).mul(0.14)),
    );
    const sourceA = vec2(
      sin(time.mul(0.16).add(0.4)).mul(0.2),
      sin(time.mul(0.12).add(2.1)).mul(0.13),
    );
    const sourceB = vec2(
      sin(time.mul(0.11).add(3.4)).mul(0.18),
      sin(time.mul(0.18).add(0.9)).mul(0.15),
    );

    const flowA = fbm(p.mul(1.08).add(drift).add(vec2(2.4, 7.1)));
    const flowB = fbm(
      p
        .mul(1.42)
        .add(vec2(drift.y.negate(), drift.x))
        .add(vec2(9.2, 3.6)),
    );
    const warpStrength = float(WARP_STRENGTH).mul(
      float(0.82).add(breathEase.mul(0.28)).add(breathMotionU.mul(0.18)),
    );
    const warped = vec2(
      p.x.add(flowA.sub(0.5).mul(warpStrength)),
      p.y.add(flowB.sub(0.5).mul(warpStrength.mul(0.82))),
    );

    const dA = length(warped.sub(sourceA));
    const dB = length(warped.add(sourceB.mul(0.86)));
    const phase = time
      .mul(1.42)
      .add(breathEase.mul(0.72))
      .add(breathMotionU.mul(0.24));
    const ringOpen = breathEase
      .mul(BREATH_RING_OPEN)
      .add(breathMotionU.mul(0.2));
    const waveA = sin(
      dA.mul(float(8.4).sub(ringOpen))
        .sub(phase)
        .add(flowA.mul(2.1)),
    );
    const waveB = sin(
      dB.mul(float(5.8).sub(ringOpen.mul(0.56)))
        .add(phase.mul(0.72))
        .sub(flowB.mul(1.7)),
    );
    const lattice = sin(
      warped.x.mul(8.2).add(warped.y.mul(5.4)).add(time.mul(0.62)),
    )
      .mul(0.5)
      .add(0.5);

    const softRing = smoothstep(float(0.08), float(0.96), waveA).mul(0.46);
    const broadRing = smoothstep(float(-0.28), float(0.82), waveB).mul(0.3);
    const field = fbm(
      warped.mul(0.86).add(vec2(14.2, 5.8)).add(drift.mul(0.55)),
    ).mul(0.26);

    const pixel = vec2(
      floor(uvCoord.x.mul(heightU).mul(aspectU).mul(DITHER_SCALE)),
      floor(uvCoord.y.mul(heightU).mul(DITHER_SCALE)),
    );
    const ditherSeed = pixel.x
      .mul(17.0)
      .add(pixel.y.mul(131.0))
      .add(floor(timeU.mul(3.0)).mul(0.013));
    const dither = hash(ditherSeed).sub(0.5);
    const scanline = sin(uvCoord.y.mul(heightU).mul(1.32))
      .mul(0.5)
      .add(0.5);

    const edgeFade = float(1.0).sub(
      smoothstep(float(0.78), float(1.48), screenD),
    );
    const centerCalm = float(0.58).add(
      smoothstep(float(0.08), float(0.56), screenD).mul(0.42),
    );
    const glow = float(0.78)
      .add(breathEase.mul(BREATH_GLOW_AMOUNT))
      .add(breathMotionU.mul(0.18));
    const ditherGate = smoothstep(float(0.08), float(0.72), softRing.add(field));
    const signal = softRing
      .add(broadRing)
      .add(field)
      .add(lattice.mul(0.06))
      .add(dither.mul(ditherGate).mul(0.12))
      .mul(float(0.92).add(scanline.mul(0.12)))
      .mul(edgeFade)
      .mul(centerCalm)
      .mul(glow);

    const veil = smoothstep(float(0.05), float(0.78), signal);
    const crest = smoothstep(float(0.32), float(0.98), signal);
    const warmTrace = smoothstep(float(0.62), float(1.0), waveB).mul(
      smoothstep(float(0.26), float(0.88), flowA).mul(0.2),
    );

    const edgeDist = min(
      min(uvCoord.x, uvCoord.y),
      min(float(1.0).sub(uvCoord.x), float(1.0).sub(uvCoord.y)),
    );
    const edgeGlow = exp(edgeDist.negate().div(0.09))
      .mul(0.045)
      .mul(float(0.84).add(breathEase.mul(0.28)));

    const bgColor = mix(
      COLOR_DEEP,
      COLOR_FIELD,
      edgeFade.mul(float(0.18).add(field.mul(0.28))),
    );
    const lowSignal = mix(COLOR_SIGNAL_LOW, COLOR_SIGNAL_MID, veil);
    const highSignal = mix(
      lowSignal,
      COLOR_SIGNAL_HIGH,
      crest.mul(float(0.62).add(breathMotionU.mul(0.16))),
    );
    const traced = mix(highSignal, COLOR_WARM_TRACE, warmTrace);
    const color = mix(bgColor, traced, veil)
      .add(COLOR_SIGNAL_MID.mul(edgeGlow))
      .add(COLOR_SIGNAL_HIGH.mul(ditherGate).mul(dither.add(0.5)).mul(0.018));

    return clamp(color, vec3(0, 0, 0), vec3(1, 1, 1));
  },
);

export const DitherPulse = ({
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
    const heightU = uniform(float(height));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const color = signalColor(
      uv(),
      timeU,
      aspectU,
      heightU,
      breathU,
      breathMotionU,
    );
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
      label: "SignalBloom",
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
