import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  vec3,
  vec2,
  sin,
  fract,
  floor,
  mix,
  smoothstep,
  abs,
  max,
  dot,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Parameters ---
const SEED = 42.17;
const SCALE = 3.0;
const SHARPNESS = 0.03; // near-binary ink edges
const THRESHOLD = 0.48; // ~50% ink coverage, balanced with gentle edge mask
const SYMMETRY = 0.95; // 1.0 = perfect symmetry, 0.0 = full asymmetry

// FBM: 5 octaves, base scale 2.5, lacunarity 2.3, gain 0.5
const FBM_SCALE = [2.5, 5.75, 13.225, 30.4175, 69.96025];
const FBM_AMP = [0.5, 0.25, 0.125, 0.0625, 0.03125];

// --- TSL shader functions ---

// Simpler hash: vec3 → vec3 in [-0.5, 0.5]^3
const random3 = Fn(([i]: [ReturnType<typeof vec3>]) => {
  const seed1 = vec3(31.06, 19.86, 30.19);
  const seed2 = vec3(6640.0, 5790.4, 10798.861);
  return fract(sin(dot(i, seed1)).mul(seed2)).sub(0.5);
});

// 3D gradient noise with quintic Hermite interpolation
const gradientNoise = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const i = floor(p);
  const f = fract(p);

  // Quintic Hermite: f^3 * (f * (6f - 15) + 10)
  const c = f
    .mul(f)
    .mul(f)
    .mul(f.mul(float(6.0).mul(f).sub(15.0)).add(10.0));

  // 8 corner gradient evaluations
  const n000 = dot(random3(i), f);
  const n100 = dot(random3(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  const n010 = dot(random3(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  const n110 = dot(random3(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  const n001 = dot(random3(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  const n101 = dot(random3(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  const n011 = dot(random3(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  const n111 = dot(random3(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));

  // Trilinear interpolation
  const nX00 = mix(n000, n100, c.x);
  const nX01 = mix(n001, n101, c.x);
  const nX10 = mix(n010, n110, c.x);
  const nX11 = mix(n011, n111, c.x);
  const nXX0 = mix(nX00, nX10, c.y);
  const nXX1 = mix(nX01, nX11, c.y);
  return mix(nXX0, nXX1, c.z);
});

// 5-octave FBM (unrolled)
const layeredNoise = Fn(([p]: [ReturnType<typeof vec3>]) => {
  let total = gradientNoise(p.mul(FBM_SCALE[0])).mul(FBM_AMP[0]);
  total = total.add(gradientNoise(p.mul(FBM_SCALE[1])).mul(FBM_AMP[1]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[2])).mul(FBM_AMP[2]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[3])).mul(FBM_AMP[3]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[4])).mul(FBM_AMP[4]));
  return total;
});

// --- Component ---

export const Rorschach = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // UV: center to (-1,1)
    const uvRaw = uv();
    const uvCentered = uvRaw.mul(2.0).sub(1.0);
    // Aspect-corrected UV for ink computation
    const uvInk = vec2(uvCentered.x.mul(aspectU), uvCentered.y);
    // Non-corrected UV for edge mask
    const uvCanvas = uvCentered;

    // --- Noise mask: gently fade ink near canvas borders ---
    // Gentle mask (from reference) — only ~0.2 subtraction at screen edges
    const noiseMask = smoothstep(
      float(0.6),
      float(2.0),
      max(abs(uvCanvas.x), abs(uvCanvas.y)),
    );

    // --- Scale UV for ink ---
    const scaledUV = uvInk.mul(SCALE);

    // --- Primary Rorschach noise (symmetric) ---
    const coordsRorschach = vec3(
      abs(scaledUV.x),
      scaledUV.y.add(SEED),
      timeU.mul(0.02),
    );
    const noiseRorschach = layeredNoise(coordsRorschach).add(0.5);

    // --- Symmetry-breaking support noise ---
    const coordsSupport = vec3(scaledUV.x, scaledUV.y, timeU.mul(0.001));
    const noiseSupport = gradientNoise(coordsSupport.mul(25.0));
    // Stronger near center axis, weaker at edges
    const supportFactor = float(0.03)
      .add(
        float(0.08).mul(
          float(1.0).sub(smoothstep(float(0.0), float(0.08), abs(scaledUV.x))),
        ),
      )
      .mul(1.0 - SYMMETRY);

    // --- Combine into ink intensity ---
    const inkNoise = noiseRorschach
      .add(supportFactor.mul(noiseSupport))
      .sub(noiseMask);
    const inkIntensity = smoothstep(
      float(-SHARPNESS),
      float(0.0),
      inkNoise.sub(THRESHOLD),
    );

    // Inverted Rorschach: dark bg + light ink
    const bgColor = vec3(0.02, 0.02, 0.03);
    const inkColor = vec3(0.97, 0.97, 0.96);
    const finalColor = mix(bgColor, inkColor, inkIntensity);

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
