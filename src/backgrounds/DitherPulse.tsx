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
  min,
  mix,
  smoothstep,
  length,
  pow,
  clamp,
  dot,
  max,
  abs,
  exp,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- TSL shader functions ---

const hash = Fn(([n]: [ReturnType<typeof float>]) => {
  return fract(sin(n).mul(43758.5453));
});

const noise2D = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(float(2.0).mul(f)));

  return mix(
    mix(hash(i.x.add(hash(i.y))), hash(i.x.add(1.0).add(hash(i.y))), u.x),
    mix(
      hash(i.x.add(hash(i.y.add(1.0)))),
      hash(i.x.add(1.0).add(hash(i.y.add(1.0)))),
      u.x,
    ),
    u.y,
  );
});

const expandingRing = Fn(
  ([uvCoord, center, aspectVal, time, resolutionY]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const ringSpeed = float(0.2);
    const warpStrength = float(0.22);

    // Aspect-correct UV and center
    const uvA = vec2(uvCoord.x.mul(aspectVal), uvCoord.y);
    const cA = vec2(center.x.mul(aspectVal), center.y);

    // Max radius to 4 corners (unrolled)
    const d0 = length(vec2(cA.x.negate(), cA.y.negate()));
    const d1 = length(vec2(float(1.0).mul(aspectVal).sub(cA.x), cA.y.negate()));
    const d2 = length(vec2(cA.x.negate(), float(1.0).sub(cA.y)));
    const d3 = length(
      vec2(float(1.0).mul(aspectVal).sub(cA.x), float(1.0).sub(cA.y)),
    );
    const maxRadius = max(max(d0, d1), max(d2, d3));

    // Noise warp — low-frequency, high-amplitude for blobby organic shape
    const noiseScale = float(1.8);
    const n1 = noise2D(
      vec2(
        uvA.x.mul(noiseScale).add(time.mul(0.3)),
        uvA.y.mul(noiseScale).add(time.mul(0.2)),
      ),
    );
    const n2 = noise2D(
      vec2(
        uvA.x.mul(noiseScale).add(time.mul(0.25)).add(50.0),
        uvA.y.mul(noiseScale).add(time.mul(0.15)).add(50.0),
      ),
    );
    // Layer a second octave for richer distortion
    const n3 = noise2D(
      vec2(
        uvA.x.mul(3.5).add(time.mul(0.4)),
        uvA.y.mul(3.5).sub(time.mul(0.35)),
      ),
    );
    const warpOffset = vec2(
      n1.sub(0.5).add(n3.sub(0.5).mul(0.3)),
      n2.sub(0.5).add(n3.sub(0.5).mul(0.3)),
    ).mul(warpStrength);
    const warpedUV = uvA.add(warpOffset);

    // Distance from warped position to center
    const dist = length(warpedUV.sub(cA));

    // Expanding ring — faithful port of original GLSL
    const progress = fract(time.mul(ringSpeed));
    const currentRadius = maxRadius.mul(progress);
    const ringDist = abs(dist.sub(currentRadius));

    // Original glow formula: lineRadius / smoothstep denominator
    // lineRadius GROWS with progress — this creates the "liquid bleeding"
    const lineRad = float(0.5).mul(progress).add(0.1);
    // Reversed smoothstep(0.2, 0.002, x) = 1 - smoothstep(0.002, 0.2, x)
    // So denominator = 1 - (1 - smoothstep(0.002,0.2,x)) = smoothstep(0.002,0.2,x)
    const denom = smoothstep(float(0.002), float(0.2), ringDist.add(0.02));
    const brightness = lineRad.div(denom.add(0.001)).mul(0.5);

    // Fade as cycle completes
    const fade = max(float(0.0), float(1.0).sub(progress));

    // Cubic falloff (clamp base to prevent pow of negative)
    const falloff = pow(
      clamp(float(1.0).sub(ringDist), float(0.0), float(1.0)),
      float(3.0),
    );

    const glow = brightness.mul(fade).mul(falloff);

    // Dither — only visible where the ring is bright
    const pixelY = uvCoord.y.mul(resolutionY);
    const scanline = sin(pixelY.mul(float(Math.PI / 3.0)))
      .mul(0.4)
      .add(0.5);
    const ditherMask = smoothstep(float(0.1), float(0.5), glow);
    const dithered = glow.mul(mix(float(1.0), scanline, ditherMask.mul(0.4)));

    return dithered;
  },
);

const borderBeam = Fn(
  ([uvCoord, time]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    const thickness = float(0.05);

    // Edge SDF: distance to nearest viewport edge
    const edgeDist = min(
      min(uvCoord.x, uvCoord.y),
      min(float(1.0).sub(uvCoord.x), float(1.0).sub(uvCoord.y)),
    );

    // Soft exponential glow from edges inward
    const glow = exp(edgeDist.negate().div(thickness)).mul(0.25);

    // Subtle dither noise
    const seed = uvCoord.x
      .mul(1234.5)
      .add(uvCoord.y.mul(6789.1))
      .add(time.mul(17.3));
    const dither = hash(seed).sub(0.5).mul(0.015);

    return clamp(glow.add(dither), float(0.0), float(1.0));
  },
);

// --- Component ---

export const DitherPulse = ({ grayscale = false }: { grayscale?: boolean }) => {
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
    const heightU = uniform(float(height));

    // Build shader graph
    const uvRaw = uv();
    const center = vec2(0.5, 0.5);

    // Effects
    const ring = expandingRing(uvRaw, center, aspectU, timeU, heightU);
    const border = borderBeam(uvRaw, timeU);

    // Colors — matching original: color="#4599ff"
    const ringColor = vec3(0.271, 0.6, 1.0);
    const borderColor = vec3(0.1, 0.2, 0.6);
    const bgColor = vec3(0.005, 0.005, 0.01);

    // Compose — original formula naturally saturates to white at core
    const color = bgColor
      .add(ringColor.mul(ring))
      .add(borderColor.mul(border).mul(0.15));

    const clamped = clamp(color, vec3(0, 0, 0), vec3(1, 1, 1));

    // Grayscale desaturation
    const grayscaleU = uniform(float(0));
    const lum = dot(clamped, vec3(0.299, 0.587, 0.114));
    const outputColor = mix(clamped, vec3(lum, lum, lum), grayscaleU);

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
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
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
