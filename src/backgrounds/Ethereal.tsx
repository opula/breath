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
  If,
  Break,
  float,
  vec2,
  vec3,
  sin,
  cos,
  exp,
  fract,
  mix,
  pow,
  smoothstep,
  dot,
  length,
  normalize,
  abs,
  max,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Raymarch tuning ---
const MAX_STEPS = 80;
const MAX_DIST = 50.0;

// --- Tuned for slow, breath-friendly drift ---
const SPEED = 0.34;
const AMPLITUDE = 0.72;
const THICKNESS = 0.075;
const HOLE_RADIUS = 1.42;
const WARP_FREQUENCY = 0.92;
const FLOW_X = 1.3;
const FLOW_Y = -0.05;
const FLOW_Z = 0.7;
const GLOW_INTENSITY = 0.0075;
const GLOW_RADIUS = 8.8;
const COLOR_PHASE_R = 0.4;
const COLOR_PHASE_G = 1.9;
const COLOR_PHASE_B = 3.4;
const BREATH_RESPONSE_RATE = 3.2;

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// Interleaved Gradient Noise — cinematic dither
const IGN = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const magicXY = vec2(0.03711056, 0.00583715);
  const magicZ = float(52.9829189);
  return fract(magicZ.mul(fract(dot(p, magicXY))));
});

export const Ethereal = ({
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
    const amplitudeU = uniform(float(AMPLITUDE));
    const thicknessU = uniform(float(THICKNESS));
    const holeRadiusU = uniform(float(HOLE_RADIUS));
    const warpFrequencyU = uniform(float(WARP_FREQUENCY));
    const flowDirU = uniform(vec3(FLOW_X, FLOW_Y, FLOW_Z));
    const glowIntensityU = uniform(float(GLOW_INTENSITY));
    const glowRadiusU = uniform(float(GLOW_RADIUS));
    const colorOffsetU = uniform(
      vec3(COLOR_PHASE_R, COLOR_PHASE_G, COLOR_PHASE_B),
    );
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    // Raymarcher must live inside Fn for Loop/If/Break/toVar/assign to attach.
    const computeColor = Fn(() => {
      const uvRaw = uv();
      // Symmetric, aspect-corrected uv: uv = (2u-1)*aspect, 2v-1
      const uvAdj = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const time = timeU.mul(speedU);
      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const apertureRadius = holeRadiusU.mul(
        float(0.96).add(breathEase.mul(0.08)),
      );
      const wallThickness = thicknessU.mul(
        float(1.12).sub(breathEase.mul(0.1)),
      );
      const warpAmplitude = amplitudeU.mul(
        float(0.92).add(breathEase.mul(0.1)),
      );
      const warpFrequency = warpFrequencyU.mul(
        float(0.97).add(breathEase.mul(0.04)),
      );
      const glowIntensity = glowIntensityU.mul(
        float(0.9).add(breathEase.mul(0.16)),
      );
      const glowRadius = glowRadiusU.mul(
        float(1.04).sub(breathEase.mul(0.04)),
      );
      const centerCalm = mix(
        float(0.68),
        float(1.0),
        smoothstep(float(0.12), float(0.48), length(uvAdj)),
      );

      // Infinite forward flight along +Z with organic sway
      const ro = vec3(
        sin(time.mul(0.36)).mul(0.42),
        cos(time.mul(0.24)).mul(0.42),
        time.mul(1.45).add(breathEase.mul(0.08)),
      );
      const rd = normalize(vec3(uvAdj.x, uvAdj.y, float(1.0)));

      // Temporal dither seed on fragCoord
      const fragCoord = uvRaw.mul(resolutionU);
      const noiseCoord = fragCoord.add(
        vec2(
          fract(time.mul(1.0 / 1.0)).mul(100.0),
          fract(time.mul(1.0 / 1.0)).mul(100.0),
        ),
      );
      // Reference uses mod(time, 1.0); fract == mod-1 for positive time
      const dither = IGN(noiseCoord).mul(0.4);

      const t = dither.toVar();
      const col = vec3(0.0, 0.0, 0.0).toVar();

      Loop(MAX_STEPS, () => {
        const p = ro.add(rd.mul(t));

        // Flow vector for liquid distortion
        const flow = vec3(
          time.mul(flowDirU.x).add(breathEase.mul(0.05)),
          time.mul(flowDirU.y).sub(breathEase.mul(0.015)),
          time.mul(flowDirU.z).add(breathEase.mul(0.07)),
        );

        // Sine-based domain warp: n = 0.9, 2.0 (two iterations)
        let q: ReturnType<typeof vec3> = p;
        for (const n of [0.9, 2.0]) {
          const qyzx = vec3(q.y, q.z, q.x);
          const warped = sin(qyzx.add(flow).mul(n).mul(warpFrequency))
            .mul(warpAmplitude)
            .div(n);
          q = q.add(warped);
        }

        // Volumetric hollow tube, walled by thickness
        const dRaw = length(vec2(q.x, q.y)).sub(apertureRadius);
        const d = max(abs(dRaw), wallThickness);

        // Cosine palette driven by warped depth + per-channel phase
        const phase = q.z.mul(0.15);
        const rawColor = vec3(
          cos(phase.add(colorOffsetU.x)),
          cos(phase.add(colorOffsetU.y)),
          cos(phase.add(colorOffsetU.z)),
        )
          .mul(0.5)
          .add(0.5);
        const colorLum = dot(rawColor, vec3(0.299, 0.587, 0.114));
        const baseColor = mix(
          vec3(colorLum, colorLum, colorLum),
          rawColor,
          float(0.48).add(breathEase.mul(0.04)),
        );

        // Volumetric glow + near-camera fade + distance falloff
        const glow = glowIntensity.div(d.mul(d).mul(glowRadius).add(0.05));
        const nearFade = smoothstep(float(0.0), float(4.0), t);
        const falloff = exp(t.mul(-0.15));

        col.assign(col.add(baseColor.mul(glow).mul(falloff).mul(nearFade)));

        // Raymarch step
        t.assign(t.add(d.mul(0.4)));

        If(t.greaterThan(float(MAX_DIST)), () => {
          Break();
        });
      });

      // ACES filmic tonemap
      const aces = col
        .mul(col.mul(2.51).add(0.03))
        .div(col.mul(col.mul(2.43).add(0.59)).add(0.14));

      // Gamma correction (sRGB approx)
      const gamma = pow(aces, vec3(0.4545, 0.4545, 0.4545));
      const softened = gamma.mul(centerCalm);

      // Grayscale desaturation
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
    let smoothedBreath = breathRef.current?.value ?? 0;

    function animate() {
      if (disposed) return;
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
      label: "InnerCurrent",
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
