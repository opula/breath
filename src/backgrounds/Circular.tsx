import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  float,
  vec3,
  vec4,
  sin,
  fract,
  mix,
  smoothstep,
  pow,
  dot,
  uv,
  uniform,
  attribute,
  positionLocal,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Geometry & motion params ---
const COUNT = 100;
const RADIUS = 7;
const TURNS = 3;
const TUBE_RADIUS = 0.007;
const TUBULAR_SEGMENTS = 450;
const RADIAL_SEGMENTS = 12;
const CURVE_DIVISIONS = 200;

// Initial mesh transform (from reference example)
// const MESH_ROTATE_X = -1.1;
// const MESH_ROTATE_Y = -0.45;
// const MESH_OFFSET_X = -0.3;
// const MESH_OFFSET_Y = 0.8;

const MESH_ROTATE_X = 0;
const MESH_ROTATE_Y = 0;
const MESH_OFFSET_X = 0;
const MESH_OFFSET_Y = 0;

// Animation
const SPEED = 0.03;
const TRAIL_LENGTH = 0.1;
const WAVE_AMPLITUDE = 0.005;
const BREATH_RESPONSE_RATE = 5.2;
const BREATH_MOTION_GAIN = 3.0;
const BREATH_MOTION_ATTACK_RATE = 4.8;
const BREATH_MOTION_RELEASE_RATE = 2.1;
const BREATH_SPEED_AMOUNT = 0.18;
const BREATH_TRAIL_AMOUNT = 0.055;
const BREATH_WAVE_AMOUNT = 0.72;
const BREATH_SCALE_AMOUNT = 0.04;
const BREATH_GLOW_AMOUNT = 0.24;

// Camera
const CAMERA_FOV = 45;
const CAMERA_Z = 16;

// Trail colors — cyan / magenta / electric blue / white
const COLOR_1 = vec3(0.0, 1.0, 1.0);
const COLOR_2 = vec3(1.0, 0.0, 1.0);
const COLOR_3 = vec3(0.0, 0.333, 1.0);
const COLOR_4 = vec3(1.0, 1.0, 1.0);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// Inward logarithmic-ish spiral with sinusoidal z-wobble (pre-bake)
function buildSpiralCurve(randomOffset: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= CURVE_DIVISIONS; i++) {
    const t = i / CURVE_DIVISIONS;
    const angle = t * Math.PI * 2 * TURNS + randomOffset;
    const r = RADIUS * (1 - t);
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    const z = Math.sin(t * 12.0 + randomOffset) * 0.5 * (1.0 - t);
    points.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

// Merge N TubeGeometries into one BufferGeometry with per-vertex
// aOffset / aSpeed / aColorIdx attributes (avoids needing addons/BufferGeometryUtils).
function buildMergedSpiralGeometry() {
  type Tube = {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    index: ArrayLike<number>;
    offset: number;
    speed: number;
    colorIdx: number;
  };
  const tubes: Tube[] = [];
  let totalVerts = 0;
  let totalIndices = 0;

  for (let i = 0; i < COUNT; i++) {
    const curve = buildSpiralCurve(Math.random() * Math.PI * 2);
    const geo = new THREE.TubeGeometry(
      curve,
      TUBULAR_SEGMENTS,
      TUBE_RADIUS,
      RADIAL_SEGMENTS,
      false,
    );
    const index = geo.index!.array;
    tubes.push({
      position: geo.attributes.position.array as Float32Array,
      normal: geo.attributes.normal.array as Float32Array,
      uv: geo.attributes.uv.array as Float32Array,
      index,
      offset: Math.random() * 100,
      speed: 0.8 + Math.random() * 0.4,
      colorIdx: Math.floor(Math.random() * 4),
    });
    totalVerts += geo.attributes.position.count;
    totalIndices += index.length;
    geo.dispose();
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const aOffsets = new Float32Array(totalVerts);
  const aSpeeds = new Float32Array(totalVerts);
  const aColorIdx = new Float32Array(totalVerts);
  const indices =
    totalVerts > 65535
      ? new Uint32Array(totalIndices)
      : new Uint16Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;
  for (const tube of tubes) {
    const vCount = tube.position.length / 3;
    positions.set(tube.position, vOffset * 3);
    normals.set(tube.normal, vOffset * 3);
    uvs.set(tube.uv, vOffset * 2);
    for (let j = 0; j < vCount; j++) {
      aOffsets[vOffset + j] = tube.offset;
      aSpeeds[vOffset + j] = tube.speed;
      aColorIdx[vOffset + j] = tube.colorIdx;
    }
    for (let k = 0; k < tube.index.length; k++) {
      indices[iOffset + k] = tube.index[k] + vOffset;
    }
    vOffset += vCount;
    iOffset += tube.index.length;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute("aOffset", new THREE.BufferAttribute(aOffsets, 1));
  merged.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeeds, 1));
  merged.setAttribute("aColorIdx", new THREE.BufferAttribute(aColorIdx, 1));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export const Circular = ({
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
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);

    const clock = new THREE.Clock();

    // Uniforms
    const timeU = uniform(float(0));
    const speedU = uniform(float(SPEED));
    const trailLenU = uniform(float(TRAIL_LENGTH));
    const waveAmpU = uniform(float(WAVE_AMPLITUDE));
    const grayscaleU = uniform(float(0));
    const breathGlowU = uniform(float(0));

    // Per-vertex attributes
    const aOffset = attribute("aOffset", "float");
    const aSpeed = attribute("aSpeed", "float");
    const aColorIdx = attribute("aColorIdx", "float");

    // --- Vertex: sine wave along local Z, phased by uv.x, time, and per-trail offset
    const uvCoord = uv();
    const breathGlow = breathGlowU
      .mul(breathGlowU)
      .mul(float(3.0).sub(breathGlowU.mul(2.0)));
    const wave = sin(
      uvCoord.x
        .mul(10.0)
        .add(timeU.mul(2.0))
        .add(aOffset)
        .add(breathGlow.mul(0.45)),
    );
    const displacedPos = positionLocal.add(vec3(0, 0, wave.mul(waveAmpU)));

    // --- Fragment: inward-traveling trail along uv.x
    const localTime = timeU.mul(speedU).mul(aSpeed);
    const trailPos = fract(uvCoord.x.sub(localTime).add(aOffset));

    const minLen = float(0.001);
    const effLen = mix(minLen, float(0.8), trailLenU);
    const rawTrail = smoothstep(float(1.0).sub(effLen), float(1.0), trailPos);
    const trailPower = mix(float(1.0), float(3.0), trailLenU);
    const trail = pow(rawTrail, trailPower);

    // Soft fade at tube start/end
    const edgeFade = smoothstep(float(0.0), float(0.05), uvCoord.x).mul(
      float(1.0).sub(smoothstep(float(0.95), float(1.0), uvCoord.x)),
    );

    // Pick one of 4 colors based on per-vertex integer index (0..3)
    const pickC1to2 = mix(COLOR_1, COLOR_2, aColorIdx.step(float(0.5)));
    const pickC1to3 = mix(pickC1to2, COLOR_3, aColorIdx.step(float(1.5)));
    const baseColor = mix(pickC1to3, COLOR_4, aColorIdx.step(float(2.5)));

    // Brighten toward white at the trail head (pseudo-bloom without post fx)
    const tinted = mix(baseColor, vec3(1.0, 1.0, 1.0), trail.mul(0.8)).mul(
      float(0.92).add(breathGlow.mul(BREATH_GLOW_AMOUNT)),
    );

    // Grayscale desaturation
    const lum = dot(tinted, vec3(0.299, 0.587, 0.114));
    const finalColor = mix(tinted, vec3(lum, lum, lum), grayscaleU);

    const alpha = trail.mul(edgeFade);

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    material.positionNode = displacedPos;
    material.colorNode = vec4(finalColor, alpha);

    const geometry = buildMergedSpiralGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = MESH_ROTATE_X;
    mesh.rotation.y = MESH_ROTATE_Y;
    mesh.position.x = MESH_OFFSET_X;
    mesh.position.y = MESH_OFFSET_Y;
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: true });
    renderer.toneMapping = THREE.ReinhardToneMapping;

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

      const breathEase =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      const scale =
        1 + breathEase * BREATH_SCALE_AMOUNT + breathMotion * 0.018;
      mesh.scale.setScalar(scale);
      mesh.rotation.z =
        Math.sin(elapsed * 0.032) * 0.055 +
        Math.sin(elapsed * 0.019 + 2.4) * 0.035 +
        breathEase * 0.035;

      (timeU as unknown as { value: number }).value = elapsed;
      (speedU as unknown as { value: number }).value =
        SPEED * (1 + breathEase * BREATH_SPEED_AMOUNT + breathMotion * 0.12);
      (trailLenU as unknown as { value: number }).value =
        TRAIL_LENGTH + breathEase * BREATH_TRAIL_AMOUNT + breathMotion * 0.018;
      (waveAmpU as unknown as { value: number }).value =
        WAVE_AMPLITUDE *
        (1 + breathEase * BREATH_WAVE_AMOUNT + breathMotion * 0.45);
      (breathGlowU as unknown as { value: number }).value = clampNumber(
        breathEase + breathMotion * 0.38,
        0.0,
        1.0,
      );
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Circular",
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
