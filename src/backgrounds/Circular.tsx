import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  vec2,
  vec3,
  fract,
  floor,
  mix,
  smoothstep,
  length,
  min,
  max,
  pow,
  clamp,
  dot,
  atan2,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const TWO_PI = 6.2831853;
const ZOOM = 0.3;
const ROTATION_SPEED = 0.01;
const TRAIL_LENGTH = 0.25;
const TRAIL_SHARPNESS = 14.0;
const MIN_RADIUS = 0.02;
const MAX_RADIUS = 1.5;
const BRIGHTNESS_VARIANCE = 0.5;
const DENSITY_NOISE_SCALE = 3.0;
const DENSITY_THRESHOLD = 0.35;
const DENSITY_SOFTNESS = 0.1;

// --- TSL shader functions ---

// float → float hash
const hash11 = Fn(([pIn]: [ReturnType<typeof float>]) => {
  const a = fract(pIn.mul(0.1031));
  const b = a.mul(a.add(33.33));
  const c = b.mul(b.add(b));
  return fract(c);
});

// float → vec2 hash
const hash12 = Fn(([pIn]: [ReturnType<typeof float>]) => {
  const p3 = fract(
    vec3(pIn.mul(0.1031), pIn.mul(0.103), pIn.mul(0.0973)),
  );
  const dp = dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33));
  const p3b = p3.add(dp);
  return fract(
    vec2(p3b.x, p3b.x).add(vec2(p3b.y, p3b.z)).mul(vec2(p3b.z, p3b.y)),
  );
});

// 1D value noise
const noise1D = Fn(([x]: [ReturnType<typeof float>]) => {
  const i = floor(x);
  const f = fract(x);
  const u = f.mul(f).mul(float(3.0).sub(float(2.0).mul(f)));
  return mix(hash11(i), hash11(i.add(1.0)), u);
});

// --- Component ---

export const Circular = () => {
  const ref = useRef<CanvasRef>(null);

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

    // UV: center, aspect-correct, zoom
    const uvRaw = uv();
    const uvCentered = uvRaw.mul(2.0).sub(1.0);
    const uvZoomed = vec2(uvCentered.x.mul(aspectU), uvCentered.y).mul(ZOOM);

    // Polar coords from pole star center
    const center = vec2(0.0, 0.02);
    const dir = uvZoomed.sub(center);
    const radius = length(dir);
    const angle = atan2(dir.y, dir.x);

    // Radius-based randomization
    const radiusSeed = floor(radius.mul(1000.0)).div(1000.0);
    const rand = hash12(radiusSeed.mul(51.7));
    const angleOffset = rand.x.mul(TWO_PI);
    const brightnessFactor = float(0.5).add(rand.y.mul(BRIGHTNESS_VARIANCE));

    // Animated angular position
    const angularPos = fract(
      angle.div(TWO_PI).add(timeU.mul(ROTATION_SPEED)).add(angleOffset),
    );

    // Streak shape (sharp trail falloff)
    const distFromHead = min(angularPos, float(1.0).sub(angularPos));
    const trailHalf = TRAIL_LENGTH * 0.5;
    const rawShape = max(
      float(0.0),
      float(1.0).sub(distFromHead.div(trailHalf)),
    );
    const streakShape = pow(rawShape, float(TRAIL_SHARPNESS));

    // Density modulation via 1D noise
    const densityNoise = noise1D(radius.mul(DENSITY_NOISE_SCALE).add(23.4));
    const densityFactor = smoothstep(
      float(DENSITY_THRESHOLD - DENSITY_SOFTNESS),
      float(DENSITY_THRESHOLD + DENSITY_SOFTNESS),
      densityNoise,
    );

    // Combined intensity with radius mask (replaces if/else)
    const rawIntensity = streakShape.mul(densityFactor).mul(brightnessFactor);
    const innerMask = smoothstep(float(MIN_RADIUS - 0.005), float(MIN_RADIUS), radius);
    const outerMask = float(1.0).sub(
      smoothstep(float(MAX_RADIUS), float(MAX_RADIUS + 0.05), radius),
    );
    const totalIntensity = clamp(
      rawIntensity.mul(innerMask).mul(outerMask),
      float(0.0),
      float(1.0),
    );

    // Blend sky and trail colors
    const skyColor = vec3(0.0, 0.0, 0.0);
    const trailColor = vec3(0.9, 0.92, 0.96);
    const finalColor = mix(skyColor, trailColor, totalIntensity);

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = finalColor;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Renderer
    const renderer = makeWebGPURenderer(context, { antialias: false });
    renderer.init();

    let disposed = false;

    function animate() {
      if (disposed) {
        return;
      }
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      renderer.render(scene, camera);
      context!.present();
    }

    renderer.setAnimationLoop(animate);

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
