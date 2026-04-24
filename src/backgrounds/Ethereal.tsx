import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
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

// --- Default params (from reference GUI) ---
const SPEED = 0.5;
const AMPLITUDE = 0.86;
const THICKNESS = 0.06;
const HOLE_RADIUS = 1.3;
const WARP_FREQUENCY = 1.1;
const FLOW_X = 1.7;
const FLOW_Y = -0.1;
const FLOW_Z = 0.9;
const GLOW_INTENSITY = 0.009;
const GLOW_RADIUS = 7.7;
const COLOR_PHASE_R = 0.0;
const COLOR_PHASE_G = 2.0;
const COLOR_PHASE_B = 4.0;

// Interleaved Gradient Noise — cinematic dither
const IGN = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const magicXY = vec2(0.03711056, 0.00583715);
  const magicZ = float(52.9829189);
  return fract(magicZ.mul(fract(dot(p, magicXY))));
});

export const Ethereal = ({
  grayscale = false,
  onReady,
}: {
  grayscale?: boolean;
  onReady?: () => void;
}) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

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

    // Raymarcher must live inside Fn for Loop/If/Break/toVar/assign to attach.
    const computeColor = Fn(() => {
      const uvRaw = uv();
      // Symmetric, aspect-corrected uv: uv = (2u-1)*aspect, 2v-1
      const uvAdj = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const time = timeU.mul(speedU);

      // Infinite forward flight along +Z with organic sway
      const ro = vec3(
        sin(time.mul(0.5)).mul(0.6),
        cos(time.mul(0.3)).mul(0.6),
        time.mul(2.0),
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
          time.mul(flowDirU.x),
          time.mul(flowDirU.y),
          time.mul(flowDirU.z),
        );

        // Sine-based domain warp: n = 0.9, 2.0 (two iterations)
        let q: ReturnType<typeof vec3> = p;
        for (const n of [0.9, 2.0]) {
          const qyzx = vec3(q.y, q.z, q.x);
          const warped = sin(qyzx.add(flow).mul(n).mul(warpFrequencyU))
            .mul(amplitudeU)
            .div(n);
          q = q.add(warped);
        }

        // Volumetric hollow tube, walled by thickness
        const dRaw = length(vec2(q.x, q.y)).sub(holeRadiusU);
        const d = max(abs(dRaw), thicknessU);

        // Cosine palette driven by warped depth + per-channel phase
        const phase = q.z.mul(0.15);
        const baseColor = vec3(
          cos(phase.add(colorOffsetU.x)),
          cos(phase.add(colorOffsetU.y)),
          cos(phase.add(colorOffsetU.z)),
        )
          .mul(0.5)
          .add(0.5);

        // Volumetric glow + near-camera fade + distance falloff
        const glow = glowIntensityU.div(
          d.mul(d).mul(glowRadiusU).add(0.05),
        );
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

      // Grayscale desaturation
      const lum = dot(gamma, vec3(0.299, 0.587, 0.114));
      return mix(gamma, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;

    function animate() {
      if (disposed) return;
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Ethereal",
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
