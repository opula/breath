import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { PointsNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  float,
  vec3,
  vec4,
  sin,
  fract,
  floor,
  mix,
  smoothstep,
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
const CAMERA_POS: [number, number, number] = [0, 3.0, 6.8]; // eye position
const LOOK_AT: [number, number, number] = [0, 0, 0];
const PLANE_TILT_X = -Math.PI / 2; // -π/2 = flat (matches reference)
const PLANE_TILT_Z = 0; // base yaw of the field in its own plane

// Slow sway of the field's yaw. Set OSC_AMP to 0 to disable.
const PLANE_TILT_Z_OSC_AMP = 0.12; // radians (~7°)
const PLANE_TILT_Z_OSC_FREQ = 0.08; // radians/sec → period ≈ 78s

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

const WAVE_AMPLITUDE = 0.42;
const WAVE_XY_SCALE = 0.36;
const WAVE_TIME_SCALE = 0.11;
const AMBIENT_DRIFT_SPEED = 1.55;
const AMBIENT_DRIFT_SCALE = 0.18;
const AMBIENT_UNDERTOW_SCALE = 0.58;
const AMBIENT_UNDERTOW_AMPLITUDE = 0.3;
const AMBIENT_AMPLITUDE_SWAY = 0.14;
const AMBIENT_PHASE_SWAY = 0.28;
const BREATH_AMPLITUDE = 0.56;
const BREATH_FIELD_SCALE = 0.06;
const BREATH_LIFT = 0.1;
const BREATH_MOTION_AMPLITUDE = 0.72;
const BREATH_MOTION_FIELD_SCALE = 0.08;
const BREATH_MOTION_LIFT = 0.05;
const BREATH_MOTION_PHASE = 0.22;
const BREATH_RESPONSE_RATE = 6.4;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 5.0;
const BREATH_MOTION_RELEASE_RATE = 2.2;
const BREATH_FLOW_GAIN = 2.8;
const BREATH_FLOW_RATE = 3.8;

// ────────────────────────────────────────────────────────────
//  LOOK
// ────────────────────────────────────────────────────────────

const BG_COLOR = 0x02070a; // deep blue-green black
const PARTICLE_DIM = vec3(0.08, 0.16, 0.2); // valleys
const PARTICLE_MID = vec3(0.24, 0.5, 0.52); // body
const PARTICLE_BRIGHT = vec3(0.78, 0.94, 0.88); // peaks

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

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
  breath,
  onReady,
}: {
  grayscale?: boolean;
  breath?: SharedValue<number>;
  onReady?: () => void;
}) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  const breathRef = useRef(breath);
  grayscaleRef.current = grayscale;
  breathRef.current = breath;

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
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const breathFlowU = uniform(float(0));
    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const ambientTime = timeU.mul(AMBIENT_DRIFT_SPEED);
    const ambientPulse = sin(
      ambientTime
        .mul(0.067)
        .add(sin(ambientTime.mul(0.023)).mul(0.8))
        .add(1.2),
    )
      .mul(0.5)
      .add(0.5);
    const ambientDriftX = sin(ambientTime.mul(0.043))
      .mul(0.58)
      .add(sin(ambientTime.mul(0.017).add(2.1)).mul(0.44));
    const ambientDriftY = sin(ambientTime.mul(0.037).add(1.4))
      .mul(0.52)
      .add(sin(ambientTime.mul(0.021).add(4.0)).mul(0.38));
    const fieldScale = float(1.0)
      .sub(breathEase.mul(BREATH_FIELD_SCALE))
      .sub(breathMotionU.mul(BREATH_MOTION_FIELD_SCALE));
    const waveAmp = float(WAVE_AMPLITUDE).mul(
      float(0.72)
        .add(breathEase.mul(BREATH_AMPLITUDE))
        .add(breathMotionU.mul(BREATH_MOTION_AMPLITUDE))
        .mul(
          float(1.0).add(
            ambientPulse.sub(0.5).mul(AMBIENT_AMPLITUDE_SWAY),
          ),
        ),
    );

    // Wave displacement computed per-vertex in the shader graph — no CPU loop,
    // no storage buffers. Displacement goes along local Z; after the mesh's
    // -π/2 X-rotation, local +Z becomes world +Y, so peaks bob upward.
    const primaryWave = gradientNoise3(
      vec3(
        positionLocal.x
          .mul(WAVE_XY_SCALE)
          .mul(fieldScale)
          .add(ambientDriftX.mul(AMBIENT_DRIFT_SCALE)),
        positionLocal.y
          .mul(WAVE_XY_SCALE)
          .mul(fieldScale)
          .add(ambientDriftY.mul(AMBIENT_DRIFT_SCALE)),
        timeU
          .mul(WAVE_TIME_SCALE)
          .add(ambientPulse.mul(AMBIENT_PHASE_SWAY))
          .add(breathEase.mul(0.12))
          .add(breathMotionU.mul(BREATH_MOTION_PHASE))
          .add(breathFlowU.mul(0.08)),
      ),
    );
    const undertowWave = gradientNoise3(
      vec3(
        positionLocal.x
          .mul(WAVE_XY_SCALE * AMBIENT_UNDERTOW_SCALE)
          .sub(ambientDriftY.mul(AMBIENT_DRIFT_SCALE * 0.7)),
        positionLocal.y
          .mul(WAVE_XY_SCALE * AMBIENT_UNDERTOW_SCALE)
          .add(ambientDriftX.mul(AMBIENT_DRIFT_SCALE * 0.7)),
        ambientTime
          .mul(WAVE_TIME_SCALE * 0.54)
          .add(3.7)
          .sub(ambientPulse.mul(AMBIENT_PHASE_SWAY * 0.7))
          .sub(breathFlowU.mul(0.04)),
      ),
    );
    const waveZ = primaryWave
      .add(undertowWave.mul(AMBIENT_UNDERTOW_AMPLITUDE))
      .mul(waveAmp);

    const displacedPos = positionLocal.add(
      vec3(
        float(0),
        float(0),
        waveZ
          .add(breathEase.mul(BREATH_LIFT))
          .add(breathMotionU.mul(BREATH_MOTION_LIFT))
          .add(breathFlowU.mul(0.03)),
      ),
    );

    // Color by height: valleys dim, peaks bright.
    const heightT = waveZ.div(waveAmp).mul(0.5).add(0.5); // [0, 1]
    const lowMid = mix(
      PARTICLE_DIM,
      PARTICLE_MID,
      smoothstep(0.0, 0.62, heightT),
    );
    const particleColor = mix(
      lowMid,
      PARTICLE_BRIGHT,
      smoothstep(0.52, 1.0, heightT).mul(
        float(0.82)
          .add(breathEase.mul(0.18))
          .add(breathMotionU.mul(0.22)),
      ),
    );

    const energizedColor = particleColor.mul(
      float(1.0).add(breathMotionU.mul(0.14)),
    );
    const lum = dot(energizedColor, vec3(0.299, 0.587, 0.114));
    const finalColor = mix(energizedColor, vec3(lum, lum, lum), grayscaleU);

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
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;
    let breathFlow = 0;

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      const targetBreath = breathRef.current?.value ?? 0.0;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );

      const motionTarget = clamp(
        Math.abs(breathDelta) * BREATH_MOTION_GAIN,
        0.0,
        1.0,
      );
      const motionRate =
        motionTarget > breathMotion
          ? BREATH_MOTION_ATTACK_RATE
          : BREATH_MOTION_RELEASE_RATE;
      breathMotion = damp(
        breathMotion,
        motionTarget,
        motionRate,
        deltaSeconds,
      );
      breathFlow = damp(
        breathFlow,
        clamp((targetBreath - smoothedBreath) * BREATH_FLOW_GAIN, -1.0, 1.0),
        BREATH_FLOW_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;
      (breathFlowU as unknown as { value: number }).value = breathFlow;
      points.rotation.z =
        PLANE_TILT_Z +
        Math.sin(elapsed * PLANE_TILT_Z_OSC_FREQ) *
          (PLANE_TILT_Z_OSC_AMP +
            smoothedBreath * 0.025 +
            breathMotion * 0.035) +
        Math.sin(elapsed * 0.031 * AMBIENT_DRIFT_SPEED + 1.8) * 0.024 +
        Math.sin(elapsed * 0.019 * AMBIENT_DRIFT_SPEED + 4.1) * 0.018;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Stillwater",
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
