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
  length,
  abs,
  max,
  dot,
  exp,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const TAU = 6.28318;
const STAR_GLOW = 0.025;
const CANVAS_VIEW = 20.0;
const BASE_VELOCITY = 0.025;
const NUM_LAYERS = 6;

// --- TSL shader functions ---

const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  const a = vec3(0.54, 0.288, 0.458);
  const b = vec3(0.408, 0.944, 0.494);
  const c = vec3(1.261, 0.029, 0.33);
  const d = vec3(3.467, 6.147, 5.086);
  return a.add(b.mul(cos(float(TAU).mul(c.mul(t).add(d)))));
});

const hash21 = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  const p = fract(pIn.mul(vec2(123.34, 456.21)));
  const dp = dot(p, p.add(45.32));
  const p2 = p.add(dp);
  return fract(p2.x.mul(p2.y));
});

const starFn = Fn(
  ([uvIn, flare]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    const d = length(uvIn);
    const m = sin(float(STAR_GLOW * 1.2)).div(d);
    const rays = max(
      float(0.0),
      float(0.5).sub(abs(uvIn.x.mul(uvIn.y).mul(1000.0))),
    );
    return m
      .add(rays.mul(flare).mul(2.0))
      .mul(smoothstep(float(1.0), float(0.1), d));
  },
);

const starContribution = Fn(
  ([gv, id, offs, time]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof vec2>,
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
  ]) => {
    const n = hash21(id.add(offs));
    const size = fract(n);
    const p1 = gv.sub(offs).sub(vec2(n, fract(n.mul(34.0)))).add(0.5);
    const flare = smoothstep(float(0.1), float(0.9), size).mul(0.46);
    const star = starFn(p1, flare);

    const colorBase = sin(
      vec3(0.2, 0.3, 0.9).mul(fract(n.mul(2345.2))).mul(TAU),
    )
      .mul(0.25)
      .add(0.75);
    const mixture = palette(time.mul(0.1));
    const color = colorBase
      .mul(vec3(0.45, 0.39, float(0.9).add(size)))
      .mul(mixture)
      .add(0.2);

    const pulsation = sin(time.mul(0.6).add(n.mul(TAU))).mul(0.5).add(0.5);

    return color.mul(star.mul(pulsation).mul(size));
  },
);

const starLayer = Fn(
  ([uvIn, time]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    const gv = fract(uvIn);
    const id = floor(uvIn);

    // Unrolled 3x3 neighbor grid
    let col = starContribution(gv, id, vec2(-1, -1), time);
    col = col.add(starContribution(gv, id, vec2(-1, 0), time));
    col = col.add(starContribution(gv, id, vec2(-1, 1), time));
    col = col.add(starContribution(gv, id, vec2(0, -1), time));
    col = col.add(starContribution(gv, id, vec2(0, 0), time));
    col = col.add(starContribution(gv, id, vec2(0, 1), time));
    col = col.add(starContribution(gv, id, vec2(1, -1), time));
    col = col.add(starContribution(gv, id, vec2(1, 0), time));
    col = col.add(starContribution(gv, id, vec2(1, 1), time));

    return col;
  },
);

// --- Component ---

export const Starfield = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // UV: center to (-1,1) with aspect correction
    const uvRaw = uv();
    const uvCentered = uvRaw.sub(0.5).mul(2.0);
    const uvFinal = vec2(uvCentered.x.mul(aspectU), uvCentered.y);

    // Motion offset
    const M = vec2(sin(timeU.mul(0.22)).negate(), cos(timeU.mul(0.22)));

    // Time advancement
    const t = timeU.mul(BASE_VELOCITY);

    // Accumulate 6 depth layers (unrolled)
    let col = vec3(0.0, 0.0, 0.0);
    for (let layerIdx = 0; layerIdx < NUM_LAYERS; layerIdx++) {
      const i = layerIdx / NUM_LAYERS;
      const depth = fract(float(i).add(t));
      const scale = mix(float(CANVAS_VIEW), float(0.5), depth);
      const fade = depth.mul(smoothstep(float(1.0), float(0.9), depth));
      const layerUV = uvFinal
        .mul(scale)
        .add(i * 453.2)
        .sub(timeU.mul(0.05))
        .add(M);
      col = col.add(starLayer(layerUV, timeU).mul(fade));
    }

    // Fog
    const uvLen = length(uvFinal);
    const fogColor = vec3(0.1, 0.2, 0.4).mul(palette(timeU.mul(0.05)));
    const fogAmount = float(0.1).mul(float(1.0).sub(exp(uvLen.mul(-0.5))));
    col = col.add(fogColor.mul(fogAmount));

    // Center fade vignette
    const centerFade = smoothstep(float(0.01), float(0.25), uvLen.sub(0.02));
    const finalColor = col.mul(centerFade);

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
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;
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
