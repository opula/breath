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
  clamp,
  max,
  dot,
  normalize,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Shared physics params (Blue/Cyan preset from reference) ---
const DEPTH = 0.04;
const SPEED = 0.1148;
const NOISE_SCALE = 0.714;
const WARP_AMOUNT = 4.0;
const FOLD_FREQUENCY = 1.865;
const ANGLE = 1.08699;
const CONNECTIONS = 0.8715;
const SHADOW_WIDTH = 0.01;
const NORMAL_EPSILON = 0.09;

// Uniform zoom — scales screen-space p. >1 = zoomed out (more pattern visible),
// <1 = zoomed in. Keeps the look identical, just changes how much fits on screen.
const ZOOM = 2;

// Baked rotation (ANGLE is compile-time constant)
const ANGLE_COS = Math.cos(ANGLE);
const ANGLE_SIN = Math.sin(ANGLE);

// Prenormalized light direction (lightX=0.968, lightY=-0.36, lightZ=1.0)
const _LX = 0.968;
const _LY = -0.36;
const _LZ = 1.0;
const _LLEN = Math.hypot(_LX, _LY, _LZ);
const LIGHT_DIR = vec3(_LX / _LLEN, _LY / _LLEN, _LZ / _LLEN);

// Palette (Aurora Borealis)
const C1 = vec3(0.0, 10 / 255, 20 / 255); // #000a14 night-sky navy
const C2 = vec3(0.0, 89 / 255, 77 / 255); // #00594d deep teal
const C3 = vec3(0.0, 1.0, 136 / 255); // #00ff88 neon aurora green
const C4 = vec3(170 / 255, 1.0, 1.0); // #aaffff bright cyan glow

// --- Noise helpers (Rorschach-style quintic 3D gradient noise) ---

const random3 = Fn(([i]: [ReturnType<typeof vec3>]) => {
  const seed1 = vec3(31.06, 19.86, 30.19);
  const seed2 = vec3(6640.0, 5790.4, 10798.861);
  return fract(sin(dot(i, seed1)).mul(seed2)).sub(0.5);
});

const gradientNoise3 = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const i = floor(p);
  const f = fract(p);
  const c = f
    .mul(f)
    .mul(f)
    .mul(f.mul(float(6.0).mul(f).sub(15.0)).add(10.0));
  const n000 = dot(random3(i), f);
  const n100 = dot(random3(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  const n010 = dot(random3(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  const n110 = dot(random3(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  const n001 = dot(random3(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  const n101 = dot(random3(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  const n011 = dot(random3(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  const n111 = dot(random3(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));
  const nX00 = mix(n000, n100, c.x);
  const nX01 = mix(n001, n101, c.x);
  const nX10 = mix(n010, n110, c.x);
  const nX11 = mix(n011, n111, c.x);
  const nXX0 = mix(nX00, nX10, c.y);
  const nXX1 = mix(nX01, nX11, c.y);
  // Scale x2 so output range matches simplex's approx [-1, 1].
  return mix(nXX0, nXX1, c.z).mul(2.0);
});

// --- Surface field (ported from reference's getSurface) ---

const getSurface = Fn(
  ([p, time]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    // Rotate p by ANGLE (rot = [[c, s], [-s, c]])
    const rp = vec2(
      p.x.mul(ANGLE_COS).add(p.y.mul(ANGLE_SIN)),
      p.x.mul(-ANGLE_SIN).add(p.y.mul(ANGLE_COS)),
    );

    const tScaled = time.mul(SPEED);
    const nScale = NOISE_SCALE * 0.25; // reference's buttery-smooth multiplier

    // Two macro noises, offset in xy
    const n1 = gradientNoise3(
      vec3(rp.x.mul(nScale), rp.y.mul(nScale), tScaled.mul(0.7)),
    );
    const n2 = gradientNoise3(
      vec3(
        rp.x.mul(nScale).add(21.4),
        rp.y.mul(nScale).add(15.2),
        tScaled.mul(0.9),
      ),
    );

    // Sine injections keep the flow perfectly round (prevents sharp ridges)
    const trig1 = sin(rp.x.mul(NOISE_SCALE * 0.5).add(tScaled)).mul(0.3);
    const trig2 = cos(rp.y.mul(NOISE_SCALE * 0.5).sub(tScaled)).mul(0.3);

    const flow = vec2(n1.add(trig1), n2.add(trig2));

    // Smooth domain warping
    const wp = rp.add(flow.mul(WARP_AMOUNT * 0.12));

    // Harmonious waves: phase modulation (bends waves instead of crossing them)
    const freq = float(FOLD_FREQUENCY * 0.5);
    const phase = sin(wp.y.mul(freq).add(flow.y.mul(2.0))).mul(CONNECTIONS);
    const mainWave = sin(wp.x.mul(freq).add(phase.mul(WARP_AMOUNT * 0.3)));

    // Subtle depth variation so it doesn't look flat
    const n3 = gradientNoise3(
      vec3(wp.x.mul(0.5), wp.y.mul(0.5), tScaled.mul(0.5)),
    );

    return mainWave.mul(0.85).add(n3.mul(0.15)).mul(0.5);
  },
);

export const Aurora = ({
  grayscale = false,
  onReady,
}: {
  grayscale?: boolean;
  onReady?: () => void;
}) => {
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

    const computeColor = Fn(() => {
      const uvRaw = uv();
      // Centered, aspect-corrected screen coords in [-aspect, aspect] x [-1, 1]
      const p = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU).mul(ZOOM),
        uvRaw.y.mul(2.0).sub(1.0).mul(ZOOM),
      );

      // Central differences for normals (4 extra surface evaluations).
      const sCenter = getSurface(p, timeU);
      const sPx = getSurface(vec2(p.x.add(NORMAL_EPSILON), p.y), timeU);
      const sNx = getSurface(vec2(p.x.sub(NORMAL_EPSILON), p.y), timeU);
      const sPy = getSurface(vec2(p.x, p.y.add(NORMAL_EPSILON)), timeU);
      const sNy = getSurface(vec2(p.x, p.y.sub(NORMAL_EPSILON)), timeU);

      const dx = sPx.sub(sNx).div(NORMAL_EPSILON * 2);
      const dy = sPy.sub(sNy).div(NORMAL_EPSILON * 2);

      // Never collapse to a zero normal (prevents sharp-dot singularities)
      const safeDepth = max(float(DEPTH), float(0.02));
      const normal = normalize(vec3(dx.negate(), dy.negate(), safeDepth));

      // Soft diffuse (bias so t ∈ [0, 1])
      const diffuse = dot(normal, LIGHT_DIR).mul(0.5).add(0.5);

      // Blend a tiny bit of raw surface to de-flatten, clamp, extra Hermite smoothing
      let t: ReturnType<typeof float> = diffuse.add(sCenter.mul(0.04));
      t = clamp(t, float(0.0), float(1.0));
      t = t.mul(t).mul(float(3.0).sub(t.mul(2.0)));

      // 4-color gradient mapping (soft overlapping smoothsteps = no harsh seams)
      let color: ReturnType<typeof vec3> = mix(
        C1,
        C2,
        smoothstep(float(0.0), float(SHADOW_WIDTH + 0.15), t),
      );
      color = mix(
        color,
        C3,
        smoothstep(float(SHADOW_WIDTH + 0.05), float(0.65), t),
      );
      color = mix(color, C4, smoothstep(float(0.55), float(1.05), t));

      // Hash dither (kills smoothstep banding)
      const grain = fract(
        sin(dot(uvRaw, vec2(12.9898, 78.233))).mul(43758.5453),
      );
      const dither = grain.sub(0.5).mul(0.03);
      color = color.add(vec3(dither, dither, dither));

      // Grayscale desaturation
      const lum = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(color, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;

    function animate() {
      if (disposed) return;
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Aurora",
      onReady,
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
