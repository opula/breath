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
  sin,
  fract,
  floor,
  mix,
  dot,
  uv,
  uniform,
  pow,
  clamp,
  abs,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const NOISE_SCALE = 5.5;
const FLOW_STRENGTH = 0.5;
const FLOW_TIME_SCALE = 0.12;
const COLOR_TIME_SCALE = 0.15;
const COLOR_FREQUENCY = 5.0;
const ADVECTION_STEPS = 15;
const STEP_SIZE = 0.04;
const FLOW_STEP = FLOW_STRENGTH * STEP_SIZE;
const PULSE_SPEED = 0.18;
const PULSE_AMOUNT = 0.12;
const DRIFT_STRENGTH = 0.8;

// --- TSL shader functions ---

// 3D hash: vec3 → vec3 in [-1, 1]
const hash3 = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const q = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6)),
  );
  return float(-1.0).add(float(2.0).mul(fract(sin(q).mul(43758.5453123))));
});

// 3D gradient noise
const noise3D = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(float(2.0).mul(f)));

  const v000 = dot(hash3(i), f);
  const v100 = dot(hash3(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  const v010 = dot(hash3(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  const v110 = dot(hash3(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  const v001 = dot(hash3(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  const v101 = dot(hash3(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  const v011 = dot(hash3(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  const v111 = dot(hash3(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));

  return mix(
    mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
    mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
    u.z,
  );
});

// Flow field: 2D vector from 3D noise, rotated 90° for swirl
const getFlow = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const noiseX = noise3D(p.add(vec3(12.3, 5.7, 9.1)));
  const noiseY = noise3D(p);
  return vec2(noiseY.negate(), noiseX.sub(DRIFT_STRENGTH));
});

// --- Component ---

export const Waves = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // UV: center to (-1,1) with aspect correction + slow breathing pulse
    const uvRaw = uv();
    const uvCentered = uvRaw.mul(2.0).sub(1.0);
    const pulse = float(1.0).sub(
      float(PULSE_AMOUNT).mul(sin(timeU.mul(PULSE_SPEED)).mul(0.5).add(0.5)),
    );
    const uvStart = vec2(
      uvCentered.x.mul(aspectU).mul(pulse),
      uvCentered.y.mul(pulse),
    );

    // --- Backward advection (15 steps, unrolled) ---
    const noiseTime = timeU.mul(FLOW_TIME_SCALE);
    let p = uvStart;
    for (let i = 0; i < ADVECTION_STEPS; i++) {
      const samplePos = vec3(
        p.x.mul(NOISE_SCALE),
        p.y.mul(NOISE_SCALE),
        noiseTime,
      );
      const flow = getFlow(samplePos);
      p = p.sub(flow.mul(FLOW_STEP));
    }

    // --- Color calculation from advected position ---
    const blendPhase = p.x
      .mul(COLOR_FREQUENCY * 0.5)
      .add(p.y.mul(COLOR_FREQUENCY * 0.8));
    const timePhase = timeU.mul(COLOR_TIME_SCALE);

    const blend1 = float(0.5).add(
      float(0.5).mul(sin(blendPhase.add(timePhase))),
    );
    const blend2 = float(0.5).add(
      float(0.5).mul(sin(blendPhase.mul(0.8).add(timePhase.mul(1.2)).add(2.0))),
    );
    const blend3 = float(0.5).add(
      float(0.5).mul(sin(blendPhase.mul(1.2).add(timePhase.mul(0.7)).add(4.0))),
    );

    // Normalize blend factors
    const totalBlend = blend1.add(blend2).add(blend3).add(0.00001);
    const b1 = blend1.div(totalBlend);
    const b2 = blend2.div(totalBlend);
    const b3 = blend3.div(totalBlend);

    // Three-color blend — richer, more saturated palette
    const c1 = vec3(0.02, 0.05, 0.25); // Deep ocean
    const c2 = vec3(0.3, 0.55, 1.0); // Electric ice blue
    const c3 = vec3(0.1, 0.95, 0.8); // Bright cyan-mint
    const baseColor = c1.mul(b1).add(c2.mul(b2)).add(c3.mul(b3));

    // Brightness variation — glowing ribbons from flow-distorted noise
    const brightNoise = noise3D(
      vec3(p.x.mul(3.0), p.y.mul(3.0), timeU.mul(0.06)),
    );
    const glow = pow(
      clamp(abs(brightNoise).mul(1.8), float(0.0), float(1.0)),
      float(1.5),
    );
    const finalColor = baseColor.mul(float(0.5).add(glow.mul(0.8)));

    // Grayscale desaturation
    const grayscaleU = uniform(float(0));
    const lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(finalColor, vec3(lum, lum, lum), grayscaleU);

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = outputColor;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Renderer
    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;

    function animate() {
      if (disposed) {
        return;
      }
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    renderer.init().then(() => {
      if (!disposed) {
        renderer.setAnimationLoop(animate);
      }
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
