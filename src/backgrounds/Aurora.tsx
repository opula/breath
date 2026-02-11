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
  smoothstep,
  length,
  pow,
  clamp,
  dot,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- TSL shader functions (pure, stateless) ---

const hash = Fn(([n]: [ReturnType<typeof float>]) => {
  return fract(sin(n).mul(43758.5453));
});

const noise2D = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(float(2.0).mul(f)));

  return mix(
    mix(
      hash(i.x.add(hash(i.y))),
      hash(i.x.add(1.0).add(hash(i.y))),
      u.x,
    ),
    mix(
      hash(i.x.add(hash(i.y.add(1.0)))),
      hash(i.x.add(1.0).add(hash(i.y.add(1.0)))),
      u.x,
    ),
    u.y,
  );
});

const auroraLayer = Fn(
  ([uvCoord, speed, intensity, colorParam, time]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof vec3>,
    ReturnType<typeof float>,
  ]) => {
    const t = time.mul(speed);
    const p = uvCoord.mul(vec2(2.0, 2.0)).add(vec2(2.0, -2.0).mul(t));
    const innerInput = vec2(colorParam.x, colorParam.y).add(p).add(t);
    const n = noise2D(p.add(noise2D(innerInput)));
    const diff = n.sub(uvCoord.y);
    const aurora = smoothstep(float(0.0), float(0.2), diff).mul(
      float(1.0).sub(smoothstep(float(0.0), float(0.6), diff)),
    );
    return colorParam.mul(aurora).mul(intensity);
  },
);

// --- Component ---

export const Aurora = ({ grayscale = false }: { grayscale?: boolean }) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) {
      return;
    }
    const canvas = context.canvas as unknown as { width: number; height: number };
    const { width, height } = canvas;
    const aspect = width / height;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    // Uniforms
    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));

    // Build shader graph
    const uvRaw = uv();
    // Three.js PlaneGeometry UVs: y=0 bottom, y=1 top (matches Skia after flip)
    const uvAspect = vec2(uvRaw.x.mul(aspectU), uvRaw.y);
    const gv = vec2(
      uvRaw.x.sub(0.5).mul(aspectU),
      uvRaw.y.sub(0.5),
    );

    // Aurora layers
    const layer1 = auroraLayer(
      uvAspect, float(0.05), float(0.3), vec3(0.0, 0.2, 0.3), timeU,
    );
    const layer2 = auroraLayer(
      uvAspect, float(0.1), float(0.4), vec3(0.1, 0.5, 0.9), timeU,
    );
    const layer3 = auroraLayer(
      uvAspect, float(0.15), float(0.3), vec3(0.2, 0.1, 0.8), timeU,
    );
    const layer4 = auroraLayer(
      uvAspect, float(0.07), float(0.2), vec3(0.2, 0.1, 0.6), timeU,
    );

    // Sky gradient
    const skyColor1 = vec3(0.2, 0.0, 0.4);
    const skyColor2 = vec3(0.15, 0.2, 0.35);
    const sky1 = skyColor2.mul(
      float(1.0).sub(smoothstep(float(0.0), float(2.0), uvAspect.y)),
    );
    const sky2 = skyColor1.mul(
      float(1.0).sub(smoothstep(float(0.0), float(1.0), uvAspect.y)),
    );

    // Vignette
    const rawMiddle = smoothstep(float(0.25), float(0.001), length(gv))
      .add(0.5)
      .mul(0.7);
    const clampedMiddle = float(1.0).sub(
      clamp(rawMiddle, float(0.0), float(1.0)).mul(0.3),
    );
    const middle = pow(clampedMiddle, float(3.5));

    // Combine
    const color = layer1
      .add(layer2)
      .add(layer3)
      .add(layer4)
      .add(sky1)
      .add(sky2)
      .mul(middle);

    // Grayscale desaturation
    const grayscaleU = uniform(float(0));
    const lum = dot(color, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(color, vec3(lum, lum, lum), grayscaleU);

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = outputColor;

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
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;
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
