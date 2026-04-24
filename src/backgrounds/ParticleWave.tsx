import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { PointsNodeMaterial } from "three/webgpu";
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
  positionLocal,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  VIEW / ANGLE — tweak these freely
// ────────────────────────────────────────────────────────────

const CAMERA_FOV = 50;
const CAMERA_POS: [number, number, number] = [0, 3.2, 6.5]; // eye position
const LOOK_AT: [number, number, number] = [0, 0, 0];
const PLANE_TILT_X = -Math.PI / 2; // -π/2 = flat (matches reference)
const PLANE_TILT_Z = 0; // base yaw of the field in its own plane

// Slow sway of the field's yaw. Set OSC_AMP to 0 to disable.
const PLANE_TILT_Z_OSC_AMP = 0.3; // radians (~17°)
const PLANE_TILT_Z_OSC_FREQ = 0.25; // radians/sec → period ≈ 25s

// ────────────────────────────────────────────────────────────
//  FIELD / DENSITY
// ────────────────────────────────────────────────────────────

// Plane is oversized so particles fill the viewport even with tilt.
const PLANE_WIDTH = 40;
const PLANE_HEIGHT = 40;
// WebGPU renders each point at 1 pixel, so density matters — crank if the
// field looks sparse, dial back if first-mount compile feels slow.
const PLANE_SEGMENTS_X = 320;
const PLANE_SEGMENTS_Y = 320;

// ────────────────────────────────────────────────────────────
//  WAVE MOTION
// ────────────────────────────────────────────────────────────

const WAVE_AMPLITUDE = 0.55;
const WAVE_XY_SCALE = 0.5; // reference uses x/2, y/2 → 0.5 multiplier
const WAVE_TIME_SCALE = 0.2; // reference uses t/2000; we scale seconds directly

// ────────────────────────────────────────────────────────────
//  LOOK
// ────────────────────────────────────────────────────────────

const BG_COLOR = 0x05080f; // deep navy (almost black)
const PARTICLE_DIM = vec3(0.18, 0.28, 0.45); // valleys
const PARTICLE_BRIGHT = vec3(0.92, 0.97, 1.0); // peaks

// ────────────────────────────────────────────────────────────
//  Noise helpers (quintic 3D gradient, ~[-1, 1] range)
// ────────────────────────────────────────────────────────────

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
  return mix(nXX0, nXX1, c.z).mul(2.0);
});

export const ParticleWave = ({
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
    scene.background = new THREE.Color(BG_COLOR);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(...LOOK_AT);

    const clock = new THREE.Clock();

    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // Wave displacement computed per-vertex in the shader graph — no CPU loop,
    // no storage buffers. Displacement goes along local Z; after the mesh's
    // -π/2 X-rotation, local +Z becomes world +Y, so peaks bob upward.
    const waveZ = gradientNoise3(
      vec3(
        positionLocal.x.mul(WAVE_XY_SCALE),
        positionLocal.y.mul(WAVE_XY_SCALE),
        timeU.mul(WAVE_TIME_SCALE),
      ),
    ).mul(WAVE_AMPLITUDE);

    const displacedPos = positionLocal.add(vec3(float(0), float(0), waveZ));

    // Color by height: valleys dim, peaks bright.
    const heightT = waveZ.div(WAVE_AMPLITUDE).mul(0.5).add(0.5); // [0, 1]
    const particleColor = mix(PARTICLE_DIM, PARTICLE_BRIGHT, heightT);

    const lum = dot(particleColor, vec3(0.299, 0.587, 0.114));
    const finalColor = mix(particleColor, vec3(lum, lum, lum), grayscaleU);

    const material = new PointsNodeMaterial({
      transparent: false,
      depthWrite: true,
    });
    material.positionNode = displacedPos;
    material.colorNode = vec4(finalColor, 1.0);

    const geometry = new THREE.PlaneGeometry(
      PLANE_WIDTH,
      PLANE_HEIGHT,
      PLANE_SEGMENTS_X,
      PLANE_SEGMENTS_Y,
    );

    const points = new THREE.Points(geometry, material);
    points.rotation.x = PLANE_TILT_X;
    points.rotation.z = PLANE_TILT_Z;
    scene.add(points);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      points.rotation.z =
        PLANE_TILT_Z +
        Math.sin(elapsed * PLANE_TILT_Z_OSC_FREQ) * PLANE_TILT_Z_OSC_AMP;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "ParticleWave",
      onReady,
    });

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
