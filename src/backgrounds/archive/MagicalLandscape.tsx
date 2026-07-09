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
  length,
  normalize,
  abs,
  max,
  step,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

const RAY_STEPS = 88;
const FAR_CLIP = 60.0;

const SPEED = 2.0;
const FRACTAL_STEP = 0.020531;
const FRACTAL_AMP = 0.06688;
const TERRAIN_SCALE = 0.64;
const TERRAIN_BASE_HEIGHT = 0.8;
const TERRAIN_AMP = 0.9;
const GROUND_OFFSET = 2.3;

const COLOR_1 = vec3(0.039, 0.624, 0.741);
const COLOR_2 = vec3(0.0, 0.824, 1.0);
const COLOR_3 = vec3(0.0, 0.102, 0.859);
const COLOR_4 = vec3(1.0, 0.0, 0.333);

const BREATH_RESPONSE_RATE = 3.0;

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const tanhVec3 = Fn(([x]: [TSLNode]) => {
  const e = exp(x.mul(2.0));
  return e.sub(1.0).div(e.add(1.0));
});

const rotate2 = Fn(
  ([v, angle]: [TSLNode, TSLNode]) => {
    const s = sin(angle);
    const c = cos(angle);
    return vec2(c.mul(v.x).sub(s.mul(v.y)), s.mul(v.x).add(c.mul(v.y)));
  },
);

const hash12 = Fn(([pIn]: [TSLNode]) => {
  const p = fract(pIn.mul(vec2(125.86, 458.36))).toVar();
  p.assign(p.add(dot(p, p.add(44.21))));
  return fract(p.x.mul(p.y));
});

const interleavedGradientNoise = Fn(([p]: [TSLNode]) => {
  const magic = vec3(0.02711056, 0.00583715, 52.9829189);
  return fract(magic.z.mul(fract(dot(p, vec2(magic.x, magic.y)))));
});

const noise2d = Fn(([x]: [TSLNode]) => {
  const p = floor(x);
  const fRaw = fract(x);
  const f = fRaw.mul(fRaw).mul(float(3.0).sub(fRaw.mul(2.0)));
  const a = hash12(p.add(vec2(0.0, 0.0)));
  const b = hash12(p.add(vec2(1.0, 0.0)));
  const c = hash12(p.add(vec2(0.0, 1.0)));
  const d = hash12(p.add(vec2(1.0, 1.0)));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
});

const terrainMatrix = Fn(([v]: [TSLNode]) => {
  return vec2(
    v.x.mul(-0.163296).add(v.y.mul(2.54316)),
    v.x.mul(8.20684).add(v.y.mul(5.356704)),
  );
});

const gradient4 = Fn(([tIn]: [TSLNode]) => {
  const t = fract(tIn);
  const color12 = mix(COLOR_1, COLOR_2, smoothstep(0.0, 0.25, t));
  const color23 = mix(COLOR_2, COLOR_3, smoothstep(0.25, 0.5, t));
  const color34 = mix(COLOR_3, COLOR_4, smoothstep(0.5, 0.75, t));
  const color41 = mix(COLOR_4, COLOR_1, smoothstep(0.75, 1.0, t));
  const firstBlend = mix(color12, color23, step(0.25, t));
  const secondBlend = mix(firstBlend, color34, step(0.5, t));
  return mix(secondBlend, color41, step(0.75, t));
});

const getTerrain = Fn(
  ([p, travelDistance, seed, breathEase]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
  ]) => {
    const uvPos = p.xz.mul(TERRAIN_SCALE).add(vec2(seed, seed)).toVar();
    const height = float(TERRAIN_BASE_HEIGHT).toVar();
    const amplitude = float(TERRAIN_AMP).mul(
      float(0.96).add(breathEase.mul(0.06)),
    ).toVar();

    Loop(3, ({ i }: { i: TSLNode }) => {
      const octaveMask = mix(
        float(1.0),
        step(21.6, travelDistance).mul(
          float(1.0).sub(step(33.1, travelDistance)),
        ),
        step(1.5, float(i)),
      );
      height.assign(height.add(noise2d(uvPos).mul(amplitude).mul(octaveMask)));
      uvPos.assign(terrainMatrix(uvPos).add(vec2(-4.8, 11.5)));
      amplitude.assign(amplitude.mul(0.3));
    });

    const terrain = p.y
      .add(height)
      .sub(float(GROUND_OFFSET).add(breathEase.mul(0.035)));
    return mix(terrain, p.y, step(6.0, p.y));
  },
);

export const MagicalLandscape = ({
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
      const time = timeU.mul(0.3);

      const ro = vec3(
        0.0,
        float(2.7).add(breathEase.mul(0.08)),
        time.mul(SPEED),
      );
      const rdBase = normalize(vec3(rayUV.x, rayUV.y, float(1.0)));
      const pitchedYZ = rotate2(vec2(rdBase.y, rdBase.z), float(0.17));
      const rd = normalize(vec3(rdBase.x, pitchedYZ.x, pitchedYZ.y));

      const totalDistance = hash12(fragCoord).mul(0.03).toVar();
      const accumulatedColor = vec3(3.0, 3.0, 3.0).toVar();

      Loop(RAY_STEPS, ({ i }: { i: TSLNode }) => {
        If(totalDistance.greaterThan(float(FAR_CLIP)), () => {
          Break();
        });

        const iter = float(i).add(1.0);
        const p = ro.add(rd.mul(totalDistance));
        const terrainDist = getTerrain(p, totalDistance, seedU, breathEase);
        const p3 = p.mul(2.5).add(seedU);
        const structuralNoise = dot(
          sin(p3),
          cos(vec3(p3.y, p3.z, p3.x)),
        ).mul(0.5);
        const terrainShape = max(structuralNoise, terrainDist);
        const shape = mix(terrainShape, terrainDist, step(4.0, terrainDist));
        const rayStep = float(FRACTAL_STEP).add(
          float(FRACTAL_AMP).mul(abs(shape.sub(iter.mul(0.02)))),
        );
        totalDistance.assign(totalDistance.add(rayStep));

        const baseColor = gradient4(iter.mul(0.04))
          .mul(1.24)
          .mul(float(0.96).add(breathEase.mul(0.08)));
        const dampening = totalDistance
          .mul(totalDistance)
          .mul(-0.42)
          .sub(breathEase.mul(0.025));
        const contribution = max(
          baseColor.div(max(rayStep, float(0.004))),
          vec3(dampening, dampening, dampening),
        );
        accumulatedColor.assign(accumulatedColor.add(contribution));
      });

      const finalOutputColor = accumulatedColor
        .mul(accumulatedColor)
        .mul(0.00000125);
      const toneMapped = tanhVec3(finalOutputColor);
      const ditherNoise = interleavedGradientNoise(fragCoord);
      const dithered = toneMapped.add(
        vec3(
          ditherNoise.sub(0.5).mul(0.004),
          ditherNoise.sub(0.5).mul(0.004),
          ditherNoise.sub(0.5).mul(0.004),
        ),
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
      smoothedBreath = damp(
        smoothedBreath,
        breathRef.current?.value ?? 0.0,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      sceneTime += deltaSeconds * (1.0 + breathEase * 0.025);

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
      label: "MagicalLandscape",
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
