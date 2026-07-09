import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
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
  vec4,
  sin,
  cos,
  exp,
  fract,
  mix,
  dot,
  cross,
  length,
  normalize,
  abs,
  mod,
  max,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

// --- Raymarch tuning (matches the reference shader) ---
const MAX_STEPS = 120;
const FAR_CLIP = 25.1;
const LIGHT_CUTOFF = 90000.0;

// --- Default params (from reference GUI) ---
const ANIM_SPEED = -0.6;
const FLIGHT_POS = 2.6;
const COLOR_R = 0.1;
const COLOR_G = 0.6;
const COLOR_B = 1.2;
const LIGHT_INTENSITY = 30000.0;
const GRAIN_INTENSITY = 0.02;

// tanh polyfill on vec4 (mirrors the reference shader's `tanh_custom`)
const tanhVec4 = Fn(([x]: [TSLNode]) => {
  const e = exp(x.mul(2.0));
  return e.sub(1.0).div(e.add(1.0));
});

// Vec3 hash for cinematic grain
const hash3 = Fn(([pIn]: [TSLNode]) => {
  const p = fract(pIn.mul(0.9631)).toVar();
  p.assign(p.add(dot(p, vec3(p.y, p.z, p.x).add(33.33))));
  return fract(p.x.add(p.y).mul(p.z));
});

export const Fluid = ({
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
    const animSpeedU = uniform(float(ANIM_SPEED));
    const flightPosU = uniform(float(FLIGHT_POS));
    const colorU = uniform(vec3(COLOR_R, COLOR_G, COLOR_B));
    const lightIntensityU = uniform(float(LIGHT_INTENSITY));
    const grainIntensityU = uniform(float(GRAIN_INTENSITY));
    const grayscaleU = uniform(float(0));

    // Raymarch body must live inside Fn() so Loop/If/Break/toVar/assign
    // have a stack to attach to.
    const computeColor = Fn(() => {
      // --- Reconstruct the reference's asymmetric uv ---
      // Original: uv = (2.1 * fragCoord - iResolution.xy) / iResolution.y
      //        => uv.x = aspect * (2.1 * u - 1), uv.y = 2.1 * v - 1
      const uvRaw = uv();
      const rayUV = vec2(
        uvRaw.x.mul(2.1).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.1).sub(1.0),
      );
      const rayDir = normalize(vec3(rayUV.x, rayUV.y, float(-1.6)));

      // Cinematic grain: hash of (fragCoord, iTime * 5)
      const fragCoord = uvRaw.mul(resolutionU);
      const grain = hash3(vec3(fragCoord.x, fragCoord.y, timeU.mul(5.0)));

      const tAnim = timeU.mul(animSpeedU);
      const tFlight = flightPosU;

      // Loop-carried state
      const totalDist = float(1.2).add(grain.mul(0.13)).toVar();
      const accumulatedLight = vec4(0.4, 0.4, 0.4, 0.4).toVar();

      Loop(MAX_STEPS, () => {
        // pos = totalDist * rayDir; then fold z into a repeating tunnel
        const pxRaw = rayDir.x.mul(totalDist);
        const pyRaw = rayDir.y.mul(totalDist);
        const pzFolded = mod(
          rayDir.z.mul(totalDist).sub(tFlight).add(2.2),
          float(4.0),
        ).sub(2.4);
        const pos = vec3(pxRaw, pyRaw, pzFolded);

        // Twist space around a distance-modulated axis
        const rotAxis = normalize(
          cos(vec3(2.8, 2.0, -0.3).sub(totalDist.mul(1.7))),
        );
        const twistedBase = rotAxis
          .mul(dot(rotAxis, pos))
          .sub(cross(rotAxis, pos));

        // Fractal fold: 4 iterations, scale starts at 14.9, +=7.5 each step.
        const ts = twistedBase.toVar();
        Loop(4, ({ i }: { i: TSLNode }) => {
          const scale = float(14.9).add(float(i).mul(7.5));
          const shifted = sin(ts.mul(scale).add(tAnim));
          const yzx = vec3(shifted.y, shifted.z, shifted.x);
          ts.assign(ts.add(yzx.div(scale)));
        });

        const structuralVal = ts.y;

        // Distance-estimate step
        const stepDist = float(0.57)
          .mul(abs(length(pos).sub(1.2)))
          .add(float(-0.07).mul(abs(structuralVal)));
        totalDist.assign(totalDist.add(stepDist));

        // Shaded palette
        const baseColor = vec4(colorU.x, colorU.y, colorU.z, 1.1);
        const cosArg = vec4(
          structuralVal.add(3.4),
          structuralVal.add(-1.6),
          structuralVal.add(5.3),
          structuralVal.add(-1.0),
        );
        const palette = baseColor.mul(cos(cosArg).mul(0.8).add(1.0));

        // Accumulate light safely (guard against zero step)
        const safeStep = max(stepDist, float(0.01));
        accumulatedLight.assign(
          accumulatedLight.add(palette.div(safeStep).mul(totalDist)),
        );

        // Early exits
        If(accumulatedLight.x.greaterThan(float(LIGHT_CUTOFF)), () => {
          Break();
        });
        If(totalDist.greaterThan(float(FAR_CLIP)), () => {
          Break();
        });
      });

      // Tanh tonemap + grain dither
      const toneMapped = tanhVec4(accumulatedLight.div(lightIntensityU));
      const grainAdd = grain.sub(0.5).mul(grainIntensityU);
      const ditheredRGB = vec3(
        toneMapped.x.add(grainAdd),
        toneMapped.y.add(grainAdd),
        toneMapped.z.add(grainAdd),
      );

      // Grayscale desaturation
      const lum = dot(ditheredRGB, vec3(0.299, 0.587, 0.114));
      return mix(ditheredRGB, vec3(lum, lum, lum), grayscaleU);
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
      label: "Fluid",
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
