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
  max,
  dot,
  mod,
  abs,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// ─── Tweakable constants ────────────────────────────────────────────
const TWO_PI = 6.2831853;

// Grid
const GRID_COLS = 24; // number of dot columns
const DOT_RADIUS = 0.32; // radius relative to cell size (0–0.5)
const DOT_SOFTNESS = 0.06; // antialiasing edge width

// Ripples
const NUM_RIPPLES = 5; // concurrent ripple sources
const RIPPLE_SPEED = 4.0; // how fast each ripple ring expands (cells/sec)
const RIPPLE_RING_WIDTH = 2.5; // thickness of the bright ring (in cells)
const RIPPLE_LIFETIME = 5.0; // seconds before a ripple fades completely
const RIPPLE_STAGGER = 1.8; // seconds between each ripple spawn

// Brightness
const BASE_BRIGHTNESS = 0.12; // dot brightness at rest
const PEAK_BRIGHTNESS = 1.0; // dot brightness at ripple peak
const SCALE_REST = 0.4; // dot scale at rest
const SCALE_PEAK = 1.0; // dot scale at ripple peak

// Cosine gradient palette (same shape as Echo)
const COLOR_A = vec3(0.0, 0.5, 0.5);
const COLOR_B = vec3(0.0, 0.5, 0.5);
const COLOR_C = vec3(0.0, 0.5, 0.333);
const COLOR_D = vec3(0.0, 0.5, 0.667);

// ─── TSL shader functions ───────────────────────────────────────────

// Cosine color palette (from Echo)
const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  return COLOR_A.add(
    COLOR_B.mul(cos(float(TWO_PI).mul(COLOR_C.mul(t).add(COLOR_D)))),
  );
});

// float → float hash (deterministic pseudo-random)
const hash11 = Fn(([p]: [ReturnType<typeof float>]) => {
  return fract(sin(p.mul(127.1)).mul(43758.5453123));
});

// float → vec2 hash (two independent random values from one seed)
const hash12 = Fn(([p]: [ReturnType<typeof float>]) => {
  return vec2(
    fract(sin(p.mul(127.1)).mul(43758.5453123)),
    fract(sin(p.mul(269.5)).mul(18345.6312)),
  );
});

// ─── Component ──────────────────────────────────────────────────────

export const DotGrid = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // UV → grid space: [0, GRID_COLS] x [0, GRID_ROWS]
    const uvRaw = uv();
    const gridRows = float(GRID_COLS).div(aspectU);
    const gridUV = vec2(
      uvRaw.x.mul(GRID_COLS),
      uvRaw.y.mul(gridRows),
    );

    // Cell coordinate (which dot) and position within cell
    const cellId = floor(gridUV);
    const cellUV = fract(gridUV).sub(0.5); // centered [-0.5, 0.5]
    const cellCenter = cellId.add(0.5);

    // Accumulate ripple intensity from all concurrent sources (unrolled)
    // Each ripple slot i fires every (RIPPLE_LIFETIME) seconds,
    // staggered by i * RIPPLE_STAGGER. The origin is derived from
    // a hash of the "which firing" index, so it jumps to a new
    // random spot each cycle.
    let rippleAccum = float(0.0);

    for (let i = 0; i < NUM_RIPPLES; i++) {
      const offset = i * RIPPLE_STAGGER;
      // Local time within this ripple's current cycle
      const localTime = mod(timeU.sub(offset), float(RIPPLE_LIFETIME));
      // Which firing are we on? Used to seed the random origin
      const firingIndex = floor(timeU.sub(offset).div(RIPPLE_LIFETIME));
      const seed = firingIndex.add(i * 100.0);

      // Random origin for this firing (in grid-cell units)
      const randPos = hash12(seed);
      const origin = vec2(
        randPos.x.mul(GRID_COLS),
        randPos.y.mul(gridRows),
      );

      // Euclidean distance from this cell to the ripple origin
      const dist = length(cellCenter.sub(origin));

      // Current ripple radius
      const currentRadius = localTime.mul(RIPPLE_SPEED);

      // Ring: how close is this cell to the expanding ring edge?
      const ringDist = abs(dist.sub(currentRadius));
      const ring = smoothstep(float(RIPPLE_RING_WIDTH), float(0.0), ringDist);

      // Fade out over the ripple lifetime
      const lifeFade = smoothstep(
        float(RIPPLE_LIFETIME),
        float(RIPPLE_LIFETIME * 0.3),
        localTime,
      );

      rippleAccum = max(rippleAccum, ring.mul(lifeFade));
    }

    // Dot scale and brightness modulated by ripple
    const dotScale = mix(float(SCALE_REST), float(SCALE_PEAK), rippleAccum);
    const brightness = mix(
      float(BASE_BRIGHTNESS),
      float(PEAK_BRIGHTNESS),
      rippleAccum,
    );

    // SDF circle
    const d = length(cellUV);
    const radius = float(DOT_RADIUS).mul(dotScale);
    const circle = smoothstep(radius.add(DOT_SOFTNESS), radius, d);

    // Color: palette driven by ripple intensity + time for shimmer
    const col = palette(rippleAccum.add(timeU.mul(0.06)));
    const finalColor = col.mul(circle).mul(brightness);

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
