import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { StorageBufferAttribute, PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  vec3,
  vec4,
  sin,
  fract,
  floor,
  mix,
  dot,
  uniform,
  storage,
  instanceIndex,
  attribute,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Constants ---
const PARTICLE_COUNT = 65536;
const SPEED = 0.4;
const CURL_FREQ = 0.3;
const EPSILON = 0.1;
const DT = 0.02;
const BOUNDARY_RADIUS = 3.5;

// --- TSL noise functions ---

const hash31 = Fn(([p]: [ReturnType<typeof vec3>]) => {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
});

const noise3D = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));

  const c000 = hash31(i);
  const c100 = hash31(i.add(vec3(1, 0, 0)));
  const c010 = hash31(i.add(vec3(0, 1, 0)));
  const c110 = hash31(i.add(vec3(1, 1, 0)));
  const c001 = hash31(i.add(vec3(0, 0, 1)));
  const c101 = hash31(i.add(vec3(1, 0, 1)));
  const c011 = hash31(i.add(vec3(0, 1, 1)));
  const c111 = hash31(i.add(vec3(1, 1, 1)));

  const x0 = mix(mix(c000, c100, u.x), mix(c010, c110, u.x), u.y);
  const x1 = mix(mix(c001, c101, u.x), mix(c011, c111, u.x), u.y);

  return mix(x0, x1, u.z);
});

const noiseVec3 = Fn(([p]: [ReturnType<typeof vec3>]) => {
  return vec3(
    noise3D(p),
    noise3D(p.add(vec3(31.416, 47.853, 12.793))),
    noise3D(p.add(vec3(64.127, 13.942, 85.316))),
  );
});

const curlNoise = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const e = float(EPSILON);

  const dx = noiseVec3(p.add(vec3(e, 0, 0))).sub(
    noiseVec3(p.sub(vec3(e, 0, 0))),
  );
  const dy = noiseVec3(p.add(vec3(0, e, 0))).sub(
    noiseVec3(p.sub(vec3(0, e, 0))),
  );
  const dz = noiseVec3(p.add(vec3(0, 0, e))).sub(
    noiseVec3(p.sub(vec3(0, 0, e))),
  );

  return vec3(dy.z.sub(dz.y), dz.x.sub(dx.z), dx.y.sub(dy.x));
});

// --- Component ---

export const Particles = ({ grayscale = false }: { grayscale?: boolean }) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) return;

    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;
    let disposed = false;

    // --- Initialize particles ---
    const posArray = new Float32Array(PARTICLE_COUNT * 3);
    const colArray = new Float32Array(PARTICLE_COUNT * 3);
    const phaseArray = new Float32Array(PARTICLE_COUNT);
    const color = new THREE.Color();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribute in a sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 2.5;

      const sinPhi = Math.sin(phi);
      const idx = i * 3;
      posArray[idx] = r * sinPhi * Math.cos(theta);
      posArray[idx + 1] = r * sinPhi * Math.sin(theta);
      posArray[idx + 2] = r * Math.cos(phi);

      // Nebula color palette: blues, purples, magentas, cyans, with occasional warm accents
      const roll = Math.random();
      let hue: number;
      if (roll < 0.35) {
        hue = 0.55 + Math.random() * 0.1; // blue
      } else if (roll < 0.6) {
        hue = 0.7 + Math.random() * 0.12; // purple / violet
      } else if (roll < 0.8) {
        hue = 0.85 + Math.random() * 0.1; // magenta / pink
      } else if (roll < 0.92) {
        hue = 0.45 + Math.random() * 0.1; // cyan / teal
      } else {
        hue = 0.05 + Math.random() * 0.08; // warm accent (orange / gold)
      }
      const sat = 0.6 + Math.random() * 0.4;
      const lit = 0.4 + Math.random() * 0.4;
      color.setHSL(hue % 1.0, sat, lit);
      colArray[idx] = color.r;
      colArray[idx + 1] = color.g;
      colArray[idx + 2] = color.b;

      // Random phase for twinkle / pulse
      phaseArray[i] = Math.random() * Math.PI * 2;
    }

    // --- Storage buffers ---
    const positionAttribute = new StorageBufferAttribute(posArray, 3);
    const positionStorage = storage(positionAttribute, "vec3", PARTICLE_COUNT);

    // --- Uniforms ---
    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // --- Compute shader ---
    const computeUpdate = Fn(() => {
      const pos = positionStorage.element(instanceIndex);
      const currentPos = vec3(pos.x, pos.y, pos.z);

      const t = timeU.mul(0.15).mul(SPEED);
      const freq = float(CURL_FREQ);
      const dt = float(DT);

      // Three octaves of curl noise for rich, organic flow
      const vel1 = curlNoise(currentPos.mul(freq).add(t));
      const vel2 = curlNoise(currentPos.mul(freq).mul(2.0).add(t.mul(1.4)));
      const vel3 = curlNoise(currentPos.mul(freq).mul(4.0).add(t.mul(0.7)));
      const velocity = vel1.add(vel2.mul(0.5)).add(vel3.mul(0.25));

      // Advect
      const newPos = currentPos.add(velocity.mul(SPEED).mul(dt));

      // Soft spherical boundary
      const dist = newPos.length();
      const overBoundary = dist.div(float(BOUNDARY_RADIUS)).clamp(0, 1);
      const pullback = overBoundary.mul(overBoundary).mul(overBoundary);
      const bounded = mix(
        newPos,
        newPos.mul(float(BOUNDARY_RADIUS).div(dist)),
        pullback,
      );

      pos.assign(bounded);
    })().compute(PARTICLE_COUNT);

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 100);
    camera.position.z = 4.5;

    const clock = new THREE.Clock();

    // --- Geometry ---
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("color", new THREE.BufferAttribute(colArray, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phaseArray, 1));

    // --- Material ---
    const vertexColor = attribute("color", "vec3");
    const aPhase = attribute("aPhase", "float");

    // Grayscale
    const lum = dot(vertexColor, vec3(0.299, 0.587, 0.114));
    const baseColor = mix(vertexColor, vec3(lum, lum, lum), grayscaleU);

    // Twinkle: each particle oscillates brightness at its own phase
    const twinkle = sin(timeU.mul(2.5).add(aPhase)).mul(0.3).add(0.7);

    // Boost color brightness (additive blending means brighter = more glow)
    const boostedColor = baseColor.mul(2.5).mul(twinkle);

    const finalAlpha = float(0.75).mul(twinkle);

    const material = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    material.colorNode = vec4(boostedColor, finalAlpha);

    // --- Points ---
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // --- Renderer ---
    const renderer = makeWebGPURenderer(context, { antialias: false });
    void renderer.init();

    // --- Animation loop ---
    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      renderer.compute(computeUpdate);

      // Gentle lissajous camera orbit
      const cx = Math.sin(elapsed * 0.12) * 2.0;
      const cy = Math.sin(elapsed * 0.08) * Math.cos(elapsed * 0.05) * 1.0;
      const cz = 4.0 + Math.cos(elapsed * 0.1) * 0.5;
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      context!.present();
    }

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(points);
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
