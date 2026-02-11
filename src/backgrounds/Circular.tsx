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
  min,
  max,
  pow,
  clamp,
  abs,
  dot,
  atan2,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const TWO_PI = 6.2831853;
const ZOOM = 0.4;
const BASE_SPEED = 0.024;
const SPEED_VARIANCE = 0.008;
const BAND_COUNT = 250.0;
const MIN_RADIUS = 0.02;
const MAX_RADIUS = 1.5;
const CENTER_DRIFT = 0.1;

// Cosine gradient palette (from Echo)
const PAL_A = vec3(0.0, 0.5, 0.5);
const PAL_B = vec3(0.0, 0.5, 0.5);
const PAL_C = vec3(0.0, 0.5, 0.333);
const PAL_D = vec3(0.0, 0.5, 0.667);

// --- TSL shader functions ---

// Cosine color palette: cycles through harmonious cool tones
const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  return PAL_A.add(PAL_B.mul(cos(float(TWO_PI).mul(PAL_C.mul(t).add(PAL_D)))));
});

// float → float hash
const hash11 = Fn(([pIn]: [ReturnType<typeof float>]) => {
  const a = fract(pIn.mul(0.1031));
  const b = a.mul(a.add(33.33));
  const c = b.mul(b.add(b));
  return fract(c);
});

// float → vec2 hash
const hash12 = Fn(([pIn]: [ReturnType<typeof float>]) => {
  const p3 = fract(vec3(pIn.mul(0.1031), pIn.mul(0.103), pIn.mul(0.0973)));
  const dp = dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33));
  const p3b = p3.add(dp);
  return fract(
    vec2(p3b.x, p3b.x).add(vec2(p3b.y, p3b.z)).mul(vec2(p3b.z, p3b.y)),
  );
});

// Compute 3 stars for one band, returns vec3 colored intensity
const bandContribution = Fn(
  ([bandIdx, angle, radius, timeU]: [
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    // Band center and radial falloff
    const bandCenter = bandIdx.add(0.5).div(BAND_COUNT);
    const bandWidth = float(1.0 / BAND_COUNT);
    const radialDist = abs(radius.sub(bandCenter)).div(bandWidth.mul(0.5));
    const radialFalloff = float(1.0).sub(
      smoothstep(float(0.0), float(1.0), radialDist),
    );

    // 3 stars per band (unrolled)
    let colorAccum = vec3(0.0, 0.0, 0.0);
    for (let s = 0; s < 3; s++) {
      const seed = bandIdx.mul(51.7).add(s * 137.3);
      const rand = hash12(seed);
      const angleOffset = rand.x.mul(TWO_PI);
      const brightness = float(0.3).add(rand.y.mul(0.7));
      const trailLen = float(0.08).add(hash11(seed.add(7.7)).mul(0.3));
      const speed = float(BASE_SPEED).add(
        hash11(seed.add(19.3)).mul(SPEED_VARIANCE),
      );

      // Per-star color from palette
      const starColor = palette(hash11(seed.add(42.0)));

      // Animated angular position (per-star speed)
      const angularPos = fract(
        angle.div(TWO_PI).add(timeU.mul(speed)).add(angleOffset),
      );

      // Streak shape with sharp falloff
      const distFromHead = min(angularPos, float(1.0).sub(angularPos));
      const rawShape = max(
        float(0.0),
        float(1.0).sub(distFromHead.div(trailLen.mul(0.5))),
      );
      const streak = pow(rawShape, float(10.0));

      colorAccum = colorAccum.add(starColor.mul(streak.mul(brightness)));
    }

    return colorAccum.mul(radialFalloff);
  },
);

// --- Component ---

export const Circular = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // UV: center, aspect-correct, zoom
    const uvRaw = uv();
    const uvCentered = uvRaw.mul(2.0).sub(1.0);
    const uvZoomed = vec2(uvCentered.x.mul(aspectU), uvCentered.y).mul(ZOOM);

    // Drifting pole star center (slow Lissajous motion)
    const center = vec2(
      sin(timeU.mul(0.03)).mul(CENTER_DRIFT),
      cos(timeU.mul(0.02)).mul(CENTER_DRIFT).add(0.02),
    );
    const dir = uvZoomed.sub(center);
    const radius = length(dir);
    const angle = atan2(dir.y, dir.x);

    // Sample 3 neighboring bands for smooth blending
    const baseBand = floor(radius.mul(BAND_COUNT));
    let totalColor = vec3(0.0, 0.0, 0.0);
    for (let b = -1; b <= 1; b++) {
      const band = baseBand.add(b);
      totalColor = totalColor.add(
        bandContribution(band, angle, radius, timeU),
      );
    }

    // Radius masks
    const innerMask = smoothstep(
      float(MIN_RADIUS - 0.005),
      float(MIN_RADIUS),
      radius,
    );
    const outerMask = float(1.0).sub(
      smoothstep(float(MAX_RADIUS), float(MAX_RADIUS + 0.05), radius),
    );
    const finalColor = clamp(
      totalColor.mul(innerMask).mul(outerMask),
      float(0.0),
      float(1.0),
    );

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
