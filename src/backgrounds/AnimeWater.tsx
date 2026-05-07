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
  pow,
  clamp,
  max,
  min,
  abs,
  dot,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const DEEP_WATER = vec3(0.055, 0.18, 0.32);
const MID_WATER = vec3(0.24, 0.7, 0.84);
const HIGHLIGHT_WATER = vec3(0.96, 1.0, 0.98);
const SEABED_LOW = vec3(0.02, 0.09, 0.16);
const SEABED_HIGH = vec3(0.18, 0.58, 0.72);

const SURFACE_SCALE = 0.92;
const SURFACE_SMOOTHNESS = 0.46;
const SURFACE_EDGE_THRESHOLD = 0.085;
const SURFACE_EDGE_SOFTNESS = 0.048;
const SURFACE_NOISE_SCALE = 0.72;
const SURFACE_DISTORT = 0.25;
const SURFACE_CELL_SPEED = 0.34;
const SURFACE_FLOW_X = 0.035;
const SURFACE_FLOW_Y = -0.115;
const MID_POS = 0.32;

const SEABED_SCALE = 0.42;
const SEABED_EDGE_THRESHOLD = 0.092;
const SEABED_EDGE_SOFTNESS = 0.09;

const VIEW_WIDTH = 6.35;
const VIEW_LENGTH = 10.6;
const VIEW_FORWARD_PITCH = 1.55;
const VIEW_UPSTREAM_SKEW = 0.18;
const VIEW_FLOW_DRIFT = 0.42;

const BREATH_RESPONSE_RATE = 4.8;
const BREATH_MOTION_GAIN = 1.25;
const BREATH_MOTION_ATTACK_RATE = 3.4;
const BREATH_MOTION_RELEASE_RATE = 1.6;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash2 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const q = vec2(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
  );
  return fract(sin(q).mul(43758.5453));
});

const smin = Fn(
  ([a, b, k]: [
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const h = max(k.sub(abs(a.sub(b))), float(0.0)).div(max(k, float(0.0001)));
    return min(a, b).sub(h.mul(h).mul(h).mul(k).div(6.0));
  },
);

const cellPoint = Fn(
  ([seed, time, speed]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    return vec2(0.5, 0.5).add(
      sin(seed.mul(6.2831).add(time.mul(speed))).mul(0.5),
    );
  },
);

const voronoiF1 = Fn(
  ([p, time, speed]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const i = floor(p);
    const f = fract(p);
    const md = float(8.0).toVar();

    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const n = vec2(x, y);
        const pt = cellPoint(hash2(i.add(n)), time, speed);
        md.assign(min(md, length(n.add(pt).sub(f))));
      }
    }

    return md;
  },
);

const voronoiSmoothF1 = Fn(
  ([p, time, speed, smoothness]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const i = floor(p);
    const f = fract(p);
    const result = float(8.0).toVar();

    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const n = vec2(x, y);
        const pt = cellPoint(hash2(i.add(n)), time, speed);
        const d = length(n.add(pt).sub(f));
        result.assign(smin(result, d, smoothness));
      }
    }

    return result;
  },
);

const nHash = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const q = fract(p.mul(vec2(127.1, 311.7)));
  return fract(q.x.mul(q.y).mul(45.32).add(q.x).add(q.y));
});

const noise2 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(nHash(i), nHash(i.add(vec2(1.0, 0.0))), u.x),
    mix(nHash(i.add(vec2(0.0, 1.0))), nHash(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fbm2 = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  let p: ReturnType<typeof vec2> = pIn;
  let value: ReturnType<typeof float> = float(0.0);
  let amplitude = 0.5;

  for (let i = 0; i < 3; i++) {
    value = value.add(noise2(p).mul(amplitude));
    p = p.mul(2.03).add(vec2(7.1, 3.4));
    amplitude *= 0.5;
  }

  return value;
});

const animeWaterMask = Fn(
  ([
    worldPos,
    time,
    scale,
    smoothness,
    threshold,
    softness,
    noiseScale,
    distort,
    speed,
    flow,
  ]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof vec2>,
  ]) => {
    const noiseUV = worldPos
      .mul(noiseScale)
      .add(vec2(time.mul(0.08), time.mul(-0.035)));
    const noiseFacX = fbm2(noiseUV);
    const noiseFacY = fbm2(noiseUV.add(vec2(13.2, 7.7)));
    const distortion = vec2(noiseFacX.sub(0.5), noiseFacY.sub(0.5)).mul(
      distort,
    );
    const cellUV = worldPos.mul(scale).add(flow.mul(time)).add(distortion);
    const f1 = voronoiF1(cellUV, time, speed);
    const sf1 = voronoiSmoothF1(cellUV, time, speed, smoothness);
    const edge = f1.sub(sf1);

    return smoothstep(threshold.sub(softness), threshold.add(softness), edge);
  },
);

export const AnimeWater = ({
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

    const computeColor = Fn(() => {
      const uvRaw = uv();
      const centered = uvRaw.mul(2.0).sub(1.0);
      const screen = vec2(centered.x.mul(aspectU), centered.y);
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const breathEnergy = breathEase.mul(0.5).add(breathMotionU.mul(0.5));
      const flowTime = timeU.mul(
        float(0.72).add(breathEase.mul(0.035)).add(breathMotionU.mul(0.05)),
      );
      const zoom = float(1.18).add(breathEase.mul(0.03));
      const perspective = float(1.0).div(
        float(1.52).sub(screen.y.mul(0.58)).add(breathMotionU.mul(0.012)),
      );
      const upstreamScreen = screen.x.add(screen.y.mul(VIEW_UPSTREAM_SKEW));
      const world = vec2(
        upstreamScreen.mul(float(VIEW_WIDTH).mul(perspective)).mul(zoom),
        perspective
          .mul(VIEW_LENGTH)
          .sub(screen.y.mul(VIEW_FORWARD_PITCH))
          .add(flowTime.mul(VIEW_FLOW_DRIFT)),
      );

      const surfaceT = animeWaterMask(
        world,
        flowTime,
        float(SURFACE_SCALE).mul(float(1.0).add(breathEase.mul(0.025))),
        float(SURFACE_SMOOTHNESS),
        float(SURFACE_EDGE_THRESHOLD),
        float(SURFACE_EDGE_SOFTNESS),
        float(SURFACE_NOISE_SCALE),
        float(SURFACE_DISTORT).mul(float(1.0).add(breathEnergy.mul(0.18))),
        float(SURFACE_CELL_SPEED),
        vec2(SURFACE_FLOW_X, SURFACE_FLOW_Y),
      );

      const seabedT = animeWaterMask(
        world.add(vec2(1.7, -0.9)),
        flowTime.mul(0.44),
        float(SEABED_SCALE),
        float(0.42),
        float(SEABED_EDGE_THRESHOLD),
        float(SEABED_EDGE_SOFTNESS),
        float(0.42),
        float(0.08),
        float(0.16),
        vec2(-0.018, -0.036),
      );

      const seg0 = clamp(surfaceT.div(MID_POS), float(0.0), float(1.0));
      const seg1 = clamp(
        surfaceT.sub(MID_POS).div(1.0 - MID_POS),
        float(0.0),
        float(1.0),
      );
      const lowerRamp = mix(DEEP_WATER, MID_WATER, seg0);
      const upperRamp = mix(MID_WATER, HIGHLIGHT_WATER, seg1);
      const waterColor = mix(
        lowerRamp,
        upperRamp,
        surfaceT.step(float(MID_POS)),
      );

      const seabedColor = mix(SEABED_LOW, SEABED_HIGH, seabedT.mul(0.78));
      const depthTint = mix(seabedColor, DEEP_WATER, float(0.42));
      const waterOpacity = float(0.58).add(surfaceT.mul(0.38));
      const causticNoise = fbm2(world.mul(2.2).add(flowTime.mul(0.2)));
      const caustic = pow(
        smoothstep(0.58, 0.95, causticNoise.mul(seabedT.add(0.35))),
        float(2.2),
      );
      const shimmer = pow(surfaceT, float(4.0)).mul(
        float(0.42).add(breathEnergy.mul(0.18)),
      );
      const horizonFade = smoothstep(-1.05, 0.95, centered.y);
      const vignette = float(1.0).sub(
        smoothstep(0.55, 1.85, length(screen)).mul(0.34),
      );

      const baseColor = mix(
        depthTint.add(SEABED_HIGH.mul(caustic.mul(0.18))),
        waterColor,
        waterOpacity,
      );
      const highlightedColor = baseColor.add(HIGHLIGHT_WATER.mul(shimmer));
      const horizonColor = mix(
        highlightedColor.mul(0.72),
        highlightedColor,
        horizonFade,
      );
      const color = horizonColor
        .mul(vignette)
        .mul(float(0.88).add(breathEase.mul(0.08)));

      const lum = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(color, vec3(lum, lum, lum), grayscaleU);
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
      sceneTime += deltaSeconds;

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
      label: "AnimeWater",
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
