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
  mix,
  smoothstep,
  length,
  pow,
  max,
  uv,
  uniform,
} from "three/tsl";
import type { SharedValue } from "react-native-reanimated";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";

// --- TSL shader functions ---

const hashFn = Fn(
  ([a, time]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    return fract(
      sin(a.x.mul(3433.8).add(a.y.mul(3843.98)))
        .mul(45933.8)
        .add(time.mul(0.5)),
    );
  },
);

// How much larger the dark backdrop is compared to the ring (1.0 = same size, 1.5 = 50% larger)
const BACKDROP_SCALE = 1.5;
// Peak opacity of the dark backdrop at center (0.0 = invisible, 1.0 = fully opaque)
const BACKDROP_OPACITY = 0.7;

// --- Component ---

export const BreathRing = ({ breath }: { breath: SharedValue<number> }) => {
  const ref = useRef<CanvasRef>(null);

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    // Uniforms
    const timeU = uniform(float(0));
    const breathU = uniform(float(0));

    // Build shader graph
    const uvRaw = uv();
    // Center UVs: (0,1) → (-0.5, 0.5)
    const uvCentered = vec2(uvRaw.x.sub(0.5), uvRaw.y.sub(0.5));

    // Distance from center
    const d = length(uvCentered);

    // Ring radius driven by breath: mix(0.25, 0.4, breath)
    const r = mix(float(0.25), float(0.4), breathU);

    // Outer edge: soft white disc
    const outerRing = vec3(smoothstep(d.sub(0.03), d, r));

    // Inner cutout: hollow center
    const innerCutout = smoothstep(
      d.sub(max(float(0.8).mul(r), float(0.2))),
      d,
      r.sub(0.1),
    );
    const ringColor = mix(outerRing, vec3(0, 0, 0), innerCutout);

    // Noise texture
    const noiseVal = pow(hashFn(uvCentered, timeU), float(4.0));
    const noisyColor = mix(ringColor, vec3(0, 0, 0), noiseVal).mul(0.5);

    // Blend noise at 20%
    const color = mix(ringColor, noisyColor, float(0.2));

    // Dark backdrop that pulses with breath for text readability
    const bgRadius = r.mul(BACKDROP_SCALE);
    const backdropAlpha = float(1.0)
      .sub(smoothstep(float(0), bgRadius, d))
      .mul(BACKDROP_OPACITY);

    // Ring alpha from original Skia shader's vec4(col, col.x * col.y)
    const ringAlpha = color.x.mul(color.y);

    // Circular edge fade: ensures alpha reaches 0 before canvas edges/corners
    const edgeFade = smoothstep(float(0.5), float(0.45), d);

    // Final alpha: backdrop or ring, whichever is stronger, faded at edges
    const alpha = max(backdropAlpha, ringAlpha).mul(edgeFade);

    // Material + mesh
    const material = new MeshBasicNodeMaterial();
    material.colorNode = color;
    material.opacityNode = alpha;
    material.transparent = true;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Renderer
    const renderer = makeWebGPURenderer(context, {
      antialias: false,
      alpha: true,
    });
    renderer.init();

    let disposed = false;

    function animate() {
      if (disposed) return;
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      (breathU as unknown as { value: number }).value = breath.value;
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
    <View style={{ height: 240, width: 240 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
