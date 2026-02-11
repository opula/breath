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
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  dot,
  atan2,
  abs,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const TWO_PI = 6.2831853;

// Cosine gradient palette colors
const COLOR_A = vec3(0.0, 0.5, 0.5);
const COLOR_B = vec3(0.0, 0.5, 0.5);
const COLOR_C = vec3(0.0, 0.5, 0.333);
const COLOR_D = vec3(0.0, 0.5, 0.667);

// --- TSL shader functions ---

// Cosine color palette
const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  return COLOR_A.add(COLOR_B.mul(cos(float(TWO_PI).mul(COLOR_C.mul(t).add(COLOR_D)))));
});

// vec2 → vec2 hash
const hash = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const q = vec2(
    dot(p, vec2(127.1, 311.7)),
    dot(p, vec2(269.5, 183.3)),
  );
  return fract(sin(q).mul(43758.5453123));
});

// 2D gradient noise
const noise = Fn(([st]: [ReturnType<typeof vec2>]) => {
  const i = floor(st);
  const f = fract(st);

  const a = dot(hash(i), f);
  const b = dot(hash(i.add(vec2(1.0, 0.0))), f.sub(vec2(1.0, 0.0)));
  const c = dot(hash(i.add(vec2(0.0, 1.0))), f.sub(vec2(0.0, 1.0)));
  const d = dot(hash(i.add(vec2(1.0, 1.0))), f.sub(vec2(1.0, 1.0)));

  const ux = smoothstep(float(0.0), float(1.0), f.x);
  const uy = smoothstep(float(0.0), float(1.0), f.y);

  return mix(mix(a, b, ux), mix(c, d, ux), uy);
});

// --- Component ---

export const Echo = () => {
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

    // UV: center to [-0.5, 0.5], aspect-correct
    const uvRaw = uv();
    const uvCentered = uvRaw.sub(0.5);
    const uvAspect = vec2(uvCentered.x.mul(aspectU), uvCentered.y);

    // Save for center fade
    const ov = uvAspect;

    // Scale
    const uvScaled = uvAspect.mul(0.25);
    const t = timeU.mul(0.3);

    // Polar coords (abs for quadrant symmetry)
    const arc = atan2(abs(uvScaled.y), abs(uvScaled.x));
    const rad = length(uvScaled);

    // Tunnel mapping
    const st = vec2(arc.div(TWO_PI), float(0.5).div(rad)).add(t);

    // Color from noise + palette
    const noiseVal = noise(st).mul(7.0);
    const palCol = palette(t.add(rad));
    const colored = palCol.mul(noiseVal).mul(rad.mul(4.0));

    // Center fade
    const fade = smoothstep(float(0.01), float(0.35), length(ov).sub(0.02));
    const finalColor = colored.mul(fade);

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
