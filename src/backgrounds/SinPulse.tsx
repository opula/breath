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
  mix,
  length,
  abs,
  dot,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// Echo cosine gradient palette
const TWO_PI = 6.2831853;
const PAL_A = vec3(0.0, 0.5, 0.5);
const PAL_B = vec3(0.0, 0.5, 0.5);
const PAL_C = vec3(0.0, 0.5, 0.333);
const PAL_D = vec3(0.0, 0.5, 0.667);

const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  return PAL_A.add(PAL_B.mul(cos(float(TWO_PI).mul(PAL_C.mul(t).add(PAL_D)))));
});

const noise = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(p.x.mul(1234.0).add(p.y.mul(2413.0))).mul(5647.0));
});

const fragColor = Fn(
  ([uvIn, timeU, aspectU]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const centered = uvIn.sub(0.5);
    const corrected = vec2(centered.x.mul(aspectU), centered.y).mul(2.0);

    const d = length(corrected);

    // Pulsing sin rings
    const rings = sin(d.mul(12.0).sub(timeU.mul(0.25))).div(12.0);
    const sharpRings = float(0.004).div(abs(rings));

    // Modulate with noise for organic feel
    const noiseVal = noise(corrected.add(timeU.mul(0.15))).add(0.4);
    const modulated = mix(float(0.05), sharpRings, noiseVal);

    // Fade to black at edges
    const edgeFade = float(1.0).sub(d.div(0.9));
    const intensity = mix(float(0.0), modulated, edgeFade);

    // Tint with cosine palette based on distance + time
    const col = palette(d.add(timeU.mul(0.05)));
    return col.mul(intensity);
  },
);

export const SinPulse = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));

    const uvRaw = uv();
    const color = fragColor(uvRaw, timeU, aspectU);

    const lum = dot(color, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(color, vec3(lum, lum, lum), grayscaleU);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = outputColor;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

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
