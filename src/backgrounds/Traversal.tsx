import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  fract,
  floor,
  mix,
  pow,
  smoothstep,
  dot,
  length,
  abs,
  max,
  uv,
  uniform,
  attribute,
  normalView,
  positionViewDirection,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode";
import { pass } from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const LINES_COUNT = 100;
const PATH_SEGMENTS = 200;
const RADIAL_SEGMENTS = 8;

const SPEED_MULTIPLIER = 0.1;
const DOT_DENSITY = 70;
const DOT_SIZE = 0.25;
const DOT_SPEED = 1.5;
const TRAIL_BRIGHTNESS = 4.0131;
const MAIN_INTENSITY = 1.0;
const REFLECTION_INTENSITY = 0.4;

const ARC_RADIUS = 10.0;
const BEND_START_Z = -150.0;
const FLOOR_LENGTH = 132.75;
const WALL_HEIGHT = 200.0;
const FLOOR_WIDTH = 1000.0;

const COLOR_0 = vec3(0.0, 0.298, 0.58);
const COLOR_1 = vec3(0.18, 0.537, 1.0);
const COLOR_2 = vec3(0.0, 0.224, 0.58);
const COLOR_3 = vec3(0.0, 0.294, 0.678);
const COLOR_4 = vec3(1.0, 0.349, 0.0);

const BREATH_RESPONSE_RATE = 5.6;
const BREATH_MOTION_GAIN = 1.8;
const BREATH_MOTION_ATTACK_RATE = 3.6;
const BREATH_MOTION_RELEASE_RATE = 1.6;

type TrailBuild = {
  geometry: THREE.BufferGeometry;
  bendUv: number;
};

class TraversalCurve extends THREE.Curve<THREE.Vector3> {
  private readonly flatLength: number;
  private readonly arcLength: number;
  private readonly upLength: number;
  private readonly totalLength: number;

  constructor(
    private readonly x: number,
    private readonly zStart: number,
    private readonly zBend: number,
    private readonly radius: number,
    private readonly yEnd: number,
  ) {
    super();

    this.flatLength = Math.abs(zStart - (zBend + radius));
    this.arcLength = Math.PI * radius * 0.5;
    this.upLength = Math.max(0.1, yEnd - radius);
    this.totalLength = this.flatLength + this.arcLength + this.upLength;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const distance = t * this.totalLength;
    let y = 0;
    let z = 0;

    if (distance <= this.flatLength) {
      z = this.zStart - distance;
    } else if (distance <= this.flatLength + this.arcLength) {
      const progress = (distance - this.flatLength) / this.arcLength;
      const eased = progress * progress * (3.0 - 2.0 * progress);
      const angle = (progress * 0.4 + eased * 0.6) * Math.PI * 0.5;
      y = this.radius * (1.0 - Math.cos(angle));
      z = this.zBend + this.radius - Math.sin(angle) * this.radius;
    } else {
      y = this.radius + distance - (this.flatLength + this.arcLength);
      z = this.zBend;
    }

    return target.set(this.x, y, z);
  }
}

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const createRandom = (seed: number) => {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const buildFloorGeometry = () => {
  const geometry = new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_WIDTH, 1, 700);
  geometry.rotateX(-Math.PI * 0.5);

  const position = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < position.length; i += 3) {
    if (position[i + 2] >= BEND_START_Z) {
      continue;
    }

    const distance = BEND_START_Z - position[i + 2];
    const maxArc = ARC_RADIUS * Math.PI * 0.5;

    if (distance < maxArc) {
      const progress = distance / maxArc;
      const eased = progress * progress * (3.0 - 2.0 * progress);
      const angle = (progress * 0.4 + eased * 0.6) * Math.PI * 0.5;
      position[i + 1] = ARC_RADIUS * (1.0 - Math.cos(angle));
      position[i + 2] = BEND_START_Z - Math.sin(angle) * ARC_RADIUS;
    } else {
      position[i + 1] = ARC_RADIUS + (distance - maxArc);
      position[i + 2] = BEND_START_Z - ARC_RADIUS;
    }
  }

  geometry.computeVertexNormals();
  return geometry;
};

const buildTrailGeometry = (): TrailBuild => {
  const random = createRandom(0x71c3a5);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const speeds: number[] = [];
  const offsets: number[] = [];
  const tailLengths: number[] = [];
  const colorIndices: number[] = [];
  const indices: number[] = [];

  let vertexOffset = 0;
  const bendUv =
    Math.abs(FLOOR_LENGTH - BEND_START_Z) /
    (Math.abs(FLOOR_LENGTH - BEND_START_Z) +
      Math.PI * ARC_RADIUS * 0.5 +
      Math.max(0.1, WALL_HEIGHT - ARC_RADIUS));

  for (let i = 0; i < LINES_COUNT; i++) {
    const normIdx = (i / (LINES_COUNT - 1)) * 2 - 1;
    const linearPos = normIdx;
    const expPos = Math.sign(normIdx) * Math.pow(Math.abs(normIdx), 1.2);
    const startX = (linearPos * 0.5 + expPos * 0.5) * 80 + (random() - 0.5) * 2;
    const thickness = random() * 0.2 + 0.1;
    const colorIdx = Math.floor(random() * 5);
    const speed = random() * 0.5 + 0.2;
    const offset = random();
    const tailLength = random() * 0.4 + 0.3;
    const path = new TraversalCurve(
      startX,
      FLOOR_LENGTH,
      BEND_START_Z - ARC_RADIUS,
      ARC_RADIUS,
      WALL_HEIGHT,
    );
    const geometry = new THREE.TubeGeometry(
      path,
      PATH_SEGMENTS,
      thickness,
      RADIAL_SEGMENTS,
      false,
    );
    const positionAttr = geometry.attributes.position;
    const normalAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    for (let j = 0; j < positionAttr.count; j++) {
      positions.push(
        positionAttr.getX(j),
        positionAttr.getY(j),
        positionAttr.getZ(j),
      );
      normals.push(normalAttr.getX(j), normalAttr.getY(j), normalAttr.getZ(j));
      uvs.push(uvAttr.getX(j), uvAttr.getY(j));
      speeds.push(speed);
      offsets.push(offset);
      tailLengths.push(tailLength);
      colorIndices.push(colorIdx);
    }

    const index = geometry.getIndex();
    if (index) {
      for (let j = 0; j < index.count; j++) {
        indices.push(index.getX(j) + vertexOffset);
      }
    }

    vertexOffset += positionAttr.count;
    geometry.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute("aOffset", new THREE.Float32BufferAttribute(offsets, 1));
  geometry.setAttribute(
    "aTailLength",
    new THREE.Float32BufferAttribute(tailLengths, 1),
  );
  geometry.setAttribute(
    "aColorIdx",
    new THREE.Float32BufferAttribute(colorIndices, 1),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeBoundingSphere();

  return { geometry, bendUv };
};

const hash = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
});

const selectTrailColor = Fn(([colorIndex]: [ReturnType<typeof float>]) => {
  const color01 = mix(COLOR_0, COLOR_1, colorIndex.step(float(0.5)));
  const color012 = mix(color01, COLOR_2, colorIndex.step(float(1.5)));
  const color0123 = mix(color012, COLOR_3, colorIndex.step(float(2.5)));
  return mix(color0123, COLOR_4, colorIndex.step(float(3.5)));
});

export const Traversal = ({
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

    const camera = new THREE.PerspectiveCamera(55, aspect, 1, 2000);
    camera.position.set(0, 20, 140);
    camera.lookAt(0, 20, -50);

    const clock = new THREE.Clock();

    const floorGeometry = buildFloorGeometry();
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.position.set(0, -0.5, -0.5);
    floorMesh.renderOrder = 1;
    scene.add(floorMesh);

    const { geometry, bendUv } = buildTrailGeometry();

    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const createTrailMaterial = (reflection: boolean) => {
      const reflectionU = uniform(float(reflection ? 1.0 : 0.0));
      const intensityU = uniform(
        float(reflection ? REFLECTION_INTENSITY : MAIN_INTENSITY),
      );
      const uvCoord = uv();
      const aSpeed = attribute("aSpeed", "float");
      const aOffset = attribute("aOffset", "float");
      const aTailLength = attribute("aTailLength", "float");
      const aColorIdx = attribute("aColorIdx", "float");

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const trailTime = timeU.mul(aSpeed);
      const t = fract(trailTime.add(aOffset));
      const dist = fract(t.sub(uvCoord.x).add(1.0));
      const tailLength = aTailLength.add(breathEase.mul(0.018));
      const baseTrail = pow(
        max(float(0.0), smoothstep(tailLength, 0.0, dist)),
        float(1.2),
      );

      const viewFacing = abs(
        dot(normalView.normalize(), positionViewDirection.normalize()),
      );
      const edgeSoftness = smoothstep(float(0.0), float(0.02), viewFacing);
      const tubeCross = abs(fract(uvCoord.y.add(0.5)).sub(0.5)).mul(2.0);
      const tubeFill = smoothstep(float(1.0), float(0.18), tubeCross);
      let baseAlpha: ReturnType<typeof float> =
        baseTrail.mul(edgeSoftness).mul(tubeFill);
      let core: ReturnType<typeof float> = pow(
        max(float(0.0), baseAlpha),
        float(3.0),
      ).mul(1.5);

      const movingUV = uvCoord.x
        .sub(trailTime.mul(DOT_SPEED))
        .sub(aOffset)
        .sub(breathMotionU.mul(0.012));
      const signalPos = movingUV.mul(DOT_DENSITY);
      const dotId = floor(signalPos);
      const dotLocal = fract(signalPos);
      const distToCenter = length(
        vec2(
          dotLocal.sub(0.5).mul(2.0),
          fract(uvCoord.y.add(0.5)).sub(0.5).mul(6.0),
        ),
      );
      const dotShape = float(1.0).sub(
        smoothstep(float(0.0), float(DOT_SIZE), distToCenter),
      );
      const dotGate = smoothstep(
        float(0.58),
        float(0.62),
        hash(vec2(dotId, aOffset)),
      );
      let dotFinal: ReturnType<typeof float> = dotShape
        .mul(dotGate)
        .mul(
          sin(timeU.mul(4.0).add(hash(vec2(dotId, aOffset)).mul(6.28)))
            .mul(0.3)
            .add(0.7),
        )
        .mul(baseAlpha)
        .mul(float(1.0).add(breathMotionU.mul(0.16)));

      const reflectionFade = float(1.0).sub(
        smoothstep(float(bendUv - 0.015), float(bendUv), uvCoord.x),
      );
      const fade = mix(float(1.0), reflectionFade, reflectionU);
      baseAlpha = baseAlpha.mul(fade);
      core = mix(core, core.mul(0.3), reflectionU).mul(fade);
      dotFinal = mix(dotFinal, dotFinal.mul(0.1), reflectionU).mul(fade);

      const reflectionFlicker = float(0.7).add(
        hash(uvCoord.mul(300.0).add(vec2(timeU.mul(0.05), timeU.mul(0.05)))).mul(
          0.3,
        ),
      );
      baseAlpha = mix(
        baseAlpha,
        pow(max(float(0.0), baseAlpha), float(0.5)).mul(reflectionFlicker),
        reflectionU,
      );

      const trailColor = selectTrailColor(aColorIdx);
      const brightness = float(TRAIL_BRIGHTNESS).mul(
        float(0.82).add(breathEase.mul(0.12)).add(breathMotionU.mul(0.12)),
      );
      const colorBase = trailColor
        .mul(baseAlpha.add(core.mul(1.5)))
        .mul(intensityU)
        .mul(brightness);
      const dodge = float(1.0).sub(dotFinal.mul(1.8).clamp(0.0, 0.95));
      const rgb = colorBase
        .div(max(dodge, float(0.001)))
        .add(trailColor.mul(dotFinal).mul(2.5).mul(intensityU).mul(brightness));
      const alpha = baseAlpha.add(dotFinal).mul(intensityU).clamp(0.0, 1.0);
      const lum = dot(rgb, vec3(0.299, 0.587, 0.114));
      const finalColor = mix(rgb, vec3(lum, lum, lum), grayscaleU);

      const material = new MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      material.colorNode = vec4(finalColor, alpha);
      return material;
    };

    const trailMaterial = createTrailMaterial(false);
    const reflectionMaterial = createTrailMaterial(true);
    const trailMesh = new THREE.Mesh(geometry, trailMaterial);
    trailMesh.frustumCulled = false;
    const reflectionMesh = new THREE.Mesh(geometry, reflectionMaterial);
    reflectionMesh.frustumCulled = false;
    reflectionMesh.scale.y = -1;
    reflectionMesh.position.y = -1;
    scene.add(trailMesh, reflectionMesh);

    const renderer = makeWebGPURenderer(context, { antialias: true });
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 3.6505;

    const postProcessing = new THREE.PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");
    const bloomPass = bloom(scenePassColor);
    postProcessing.outputNode = scenePassColor.add(bloomPass.mul(0.36));

    let disposed = false;
    let sceneTime = 0;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;

    function animate() {
      if (disposed) {
        return;
      }

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
      sceneTime +=
        deltaSeconds *
        SPEED_MULTIPLIER *
        (1.0 + breathEase * 0.04 + breathMotion * 0.08);

      camera.position.x = Math.sin(sceneTime * 0.34) * 2.2;
      camera.position.y = 20 + breathEase * 0.45 + breathMotion * 0.25;
      camera.position.z = 140 - breathEase * 1.2 - breathMotion * 0.8;
      camera.lookAt(0, 20 + breathEase * 0.4, -50);

      (timeU as unknown as { value: number }).value = sceneTime;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;

      postProcessing.render();
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Traversal",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(floorMesh, trailMesh, reflectionMesh);
      floorGeometry.dispose();
      floorMaterial.dispose();
      geometry.dispose();
      trailMaterial.dispose();
      reflectionMaterial.dispose();
      (postProcessing as { dispose?: () => void }).dispose?.();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
