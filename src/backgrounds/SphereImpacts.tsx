import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  attribute,
  clamp,
  dot,
  float,
  fract,
  mix,
  pow,
  sin,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const IMPACT_COUNT = 520;
const TRAIL_SAMPLES = 18;
const BURST_SAMPLES = 12;
const INCOMING_POINT_COUNT = IMPACT_COUNT * TRAIL_SAMPLES;
const BURST_POINT_COUNT = IMPACT_COUNT * BURST_SAMPLES;

const SPHERE_RADIUS = 1.15;
const OUTER_RADIUS = 7.4;
const IMPACT_TIME = 0.54;
const LOOP_SPEED = 0.15;
const TRAIL_WIDTH = 0.22;
const BURST_SPREAD = 1.15;
const BURST_OUTWARD = 0.55;

const BREATH_RESPONSE_RATE = 4.8;
const BREATH_MOTION_GAIN = 1.8;
const BREATH_MOTION_ATTACK_RATE = 4.0;
const BREATH_MOTION_RELEASE_RATE = 1.8;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

function randomUnitVector() {
  const z = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
}

function randomTangent(normal: THREE.Vector3) {
  const candidate = randomUnitVector();
  candidate.addScaledVector(normal, -candidate.dot(normal));
  if (candidate.lengthSq() < 0.0001) {
    candidate.set(-normal.y, normal.x, 0);
  }
  return candidate.normalize();
}

function makeIncomingGeometry(impactDirs: THREE.Vector3[], offsets: Float32Array) {
  const positions = new Float32Array(INCOMING_POINT_COUNT * 3);
  const dirs = new Float32Array(INCOMING_POINT_COUNT * 3);
  const pointOffsets = new Float32Array(INCOMING_POINT_COUNT);
  const trail = new Float32Array(INCOMING_POINT_COUNT);
  const shine = new Float32Array(INCOMING_POINT_COUNT);

  let ptr = 0;
  for (let i = 0; i < IMPACT_COUNT; i++) {
    const dir = impactDirs[i];
    for (let j = 0; j < TRAIL_SAMPLES; j++) {
      const idx3 = ptr * 3;
      dirs[idx3] = dir.x;
      dirs[idx3 + 1] = dir.y;
      dirs[idx3 + 2] = dir.z;
      pointOffsets[ptr] = offsets[i];
      trail[ptr] = j / Math.max(1, TRAIL_SAMPLES - 1);
      shine[ptr] = 0.5 + Math.pow(Math.random(), 2.4) * 1.6;
      ptr++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(pointOffsets, 1));
  geometry.setAttribute("aTrail", new THREE.BufferAttribute(trail, 1));
  geometry.setAttribute("aShine", new THREE.BufferAttribute(shine, 1));
  return geometry;
}

function makeBurstGeometry(impactDirs: THREE.Vector3[], offsets: Float32Array) {
  const positions = new Float32Array(BURST_POINT_COUNT * 3);
  const dirs = new Float32Array(BURST_POINT_COUNT * 3);
  const tangents = new Float32Array(BURST_POINT_COUNT * 3);
  const pointOffsets = new Float32Array(BURST_POINT_COUNT);
  const spread = new Float32Array(BURST_POINT_COUNT);
  const outward = new Float32Array(BURST_POINT_COUNT);
  const shine = new Float32Array(BURST_POINT_COUNT);

  let ptr = 0;
  for (let i = 0; i < IMPACT_COUNT; i++) {
    const dir = impactDirs[i];
    for (let j = 0; j < BURST_SAMPLES; j++) {
      const tangent = randomTangent(dir);
      const idx3 = ptr * 3;
      dirs[idx3] = dir.x;
      dirs[idx3 + 1] = dir.y;
      dirs[idx3 + 2] = dir.z;
      tangents[idx3] = tangent.x;
      tangents[idx3 + 1] = tangent.y;
      tangents[idx3 + 2] = tangent.z;
      pointOffsets[ptr] = offsets[i];
      spread[ptr] = 0.4 + Math.random() * 1.35;
      outward[ptr] = Math.random();
      shine[ptr] = 0.45 + Math.pow(Math.random(), 2.2) * 1.9;
      ptr++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
  geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangents, 3));
  geometry.setAttribute("aOffset", new THREE.BufferAttribute(pointOffsets, 1));
  geometry.setAttribute("aSpread", new THREE.BufferAttribute(spread, 1));
  geometry.setAttribute("aOutward", new THREE.BufferAttribute(outward, 1));
  geometry.setAttribute("aShine", new THREE.BufferAttribute(shine, 1));
  return geometry;
}

export const SphereImpacts = ({
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
    if (!context) return;

    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;

    const impactDirs: THREE.Vector3[] = [];
    const offsets = new Float32Array(IMPACT_COUNT);
    for (let i = 0; i < IMPACT_COUNT; i++) {
      impactDirs.push(randomUnitVector());
      offsets[i] = Math.random();
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 60);
    camera.position.set(0, 0, 6.2);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const sphereMaterial = new MeshBasicNodeMaterial();
    sphereMaterial.colorNode = vec3(0, 0, 0);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS, 42, 28),
      sphereMaterial,
    );
    sphere.renderOrder = 2;
    scene.add(sphere);

    const haloMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMaterial.colorNode = vec4(0.14, 0.24, 0.28, 0.18);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS * 1.08, 42, 28),
      haloMaterial,
    );
    halo.renderOrder = 1;
    scene.add(halo);

    const incomingGeometry = makeIncomingGeometry(impactDirs, offsets);
    const incomingDir = attribute("aDir", "vec3");
    const incomingOffset = attribute("aOffset", "float");
    const incomingTrail = attribute("aTrail", "float");
    const incomingShine = attribute("aShine", "float");
    const incomingPhase = fract(
      timeU
        .mul(LOOP_SPEED)
        .mul(float(1.0).add(breathU.mul(0.12)).add(breathMotionU.mul(0.18)))
        .add(incomingOffset),
    );
    const beforeMask = float(1.0).sub(incomingPhase.step(float(IMPACT_TIME)));
    const qIn = clamp(
      incomingPhase.div(IMPACT_TIME),
      float(0.0),
      float(1.0),
    );
    const trailLag = incomingTrail
      .mul(TRAIL_WIDTH)
      .mul(float(1.0).sub(qIn))
      .mul(sin(qIn.mul(Math.PI)));
    const qTrail = clamp(qIn.sub(trailLag), float(0.0), float(1.0));
    const incomingRadius = mix(float(OUTER_RADIUS), float(SPHERE_RADIUS), qTrail);
    const incomingPos = incomingDir.mul(incomingRadius);
    const trailFade = pow(float(1.0).sub(incomingTrail), float(1.8));
    const incomingEnergy = beforeMask
      .mul(trailFade)
      .mul(smoothstep(0.04, 0.18, qIn))
      .mul(float(1.0).sub(smoothstep(0.88, 1.0, qIn)))
      .mul(incomingShine)
      .mul(float(0.9).add(breathU.mul(0.18)).add(breathMotionU.mul(0.34)));
    const incomingColor = vec3(0.82, 0.96, 1.0).mul(incomingEnergy);
    const incomingLum = dot(incomingColor, vec3(0.299, 0.587, 0.114));
    const incomingOut = mix(
      incomingColor,
      vec3(incomingLum, incomingLum, incomingLum),
      grayscaleU,
    );

    const incomingMaterial = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    incomingMaterial.positionNode = incomingPos;
    incomingMaterial.colorNode = vec4(
      incomingOut,
      incomingEnergy.clamp(0, 1),
    );
    const incomingPoints = new THREE.Points(incomingGeometry, incomingMaterial);
    incomingPoints.renderOrder = 3;
    scene.add(incomingPoints);

    const burstGeometry = makeBurstGeometry(impactDirs, offsets);
    const burstDir = attribute("aDir", "vec3");
    const burstTangent = attribute("aTangent", "vec3");
    const burstOffset = attribute("aOffset", "float");
    const burstSpread = attribute("aSpread", "float");
    const burstOutward = attribute("aOutward", "float");
    const burstShine = attribute("aShine", "float");
    const burstPhase = fract(
      timeU
        .mul(LOOP_SPEED)
        .mul(float(1.0).add(breathU.mul(0.12)).add(breathMotionU.mul(0.18)))
        .add(burstOffset),
    );
    const afterMask = burstPhase.step(float(IMPACT_TIME));
    const qOut = clamp(
      burstPhase.sub(IMPACT_TIME).div(1.0 - IMPACT_TIME),
      float(0.0),
      float(1.0),
    );
    const burstOrigin = burstDir.mul(SPHERE_RADIUS);
    const burstPos = burstOrigin
      .add(burstTangent.mul(qOut).mul(BURST_SPREAD).mul(burstSpread))
      .add(burstDir.mul(qOut).mul(BURST_OUTWARD).mul(burstOutward));
    const burstFade = pow(float(1.0).sub(qOut), float(2.4));
    const burstEnergy = afterMask
      .mul(burstFade)
      .mul(smoothstep(0.0, 0.08, qOut))
      .mul(burstShine)
      .mul(float(1.35).add(breathMotionU.mul(0.5)));
    const burstColor = vec3(1.0, 0.98, 0.9).mul(burstEnergy);
    const burstLum = dot(burstColor, vec3(0.299, 0.587, 0.114));
    const burstOut = mix(
      burstColor,
      vec3(burstLum, burstLum, burstLum),
      grayscaleU,
    );

    const burstMaterial = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    burstMaterial.positionNode = burstPos;
    burstMaterial.colorNode = vec4(burstOut, burstEnergy.clamp(0, 1));
    const burstPoints = new THREE.Points(burstGeometry, burstMaterial);
    burstPoints.renderOrder = 4;
    scene.add(burstPoints);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;

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
      const motionTarget = clampNumber(
        Math.abs(breathDelta) * BREATH_MOTION_GAIN,
        0.0,
        1.0,
      );
      breathMotion = damp(
        breathMotion,
        motionTarget,
        motionTarget > breathMotion
          ? BREATH_MOTION_ATTACK_RATE
          : BREATH_MOTION_RELEASE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;

      const pulse = 1 + smoothedBreath * 0.035 + breathMotion * 0.03;
      sphere.scale.setScalar(pulse);
      halo.scale.setScalar(1 + smoothedBreath * 0.08 + breathMotion * 0.08);
      camera.position.x = Math.sin(elapsed * 0.18) * 0.16;
      camera.position.y = Math.cos(elapsed * 0.14) * 0.12;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "SphereImpacts",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(sphere, halo, incomingPoints, burstPoints);
      sphere.geometry.dispose();
      sphereMaterial.dispose();
      halo.geometry.dispose();
      haloMaterial.dispose();
      incomingGeometry.dispose();
      incomingMaterial.dispose();
      burstGeometry.dispose();
      burstMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
