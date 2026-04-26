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
  sin,
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  pow,
  max,
  abs,
  dot,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const TWO_PI = 6.2831853;
const MAX_DELTA_SECONDS = 0.1;
const BREATH_RESPONSE_RATE = 4.2;
const INHALE_RESPONSE_RATE = 5.0;
const INHALE_FLOW_GAIN = 3.0;

// Paper + wash palette. Paper white only at the very edges; most of the
// frame is a soft cyan wash like the painting's bleed.
const PAPER_BRIGHT = vec3(0.965, 0.972, 0.965);
const PAPER_WARM = vec3(0.93, 0.935, 0.918);
const WASH_LIGHT = vec3(0.78, 0.86, 0.87); // pale cyan, broad area
const WASH_MID = vec3(0.55, 0.72, 0.76); // mid cyan around the bundle
const WASH_DEEP = vec3(0.34, 0.52, 0.6); // deep teal pooling near ink

// Ink: blue-black body, near-pure-black at the densest core.
const INK_BODY = vec3(0.04, 0.07, 0.11);
const INK_CORE = vec3(0.008, 0.012, 0.02);

const FBM_ROT_C = Math.cos(0.62);
const FBM_ROT_S = Math.sin(0.62);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const rand2 = Fn(([n]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(n, vec2(12.9898, 78.233))).mul(43758.5453));
});

const noise2 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const ip = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));

  return mix(
    mix(rand2(ip), rand2(ip.add(vec2(1.0, 0.0))), u.x),
    mix(rand2(ip.add(vec2(0.0, 1.0))), rand2(ip.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fbm2 = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  let p: ReturnType<typeof vec2> = pIn;
  let value: ReturnType<typeof float> = float(0.0);
  let amplitude = 0.5;

  for (let i = 0; i < 4; i++) {
    value = value.add(noise2(p).mul(amplitude));
    const x = p.x.mul(FBM_ROT_C).sub(p.y.mul(FBM_ROT_S)).mul(2.03).add(19.1);
    const y = p.x.mul(FBM_ROT_S).add(p.y.mul(FBM_ROT_C)).mul(2.03).add(71.7);
    p = vec2(x, y);
    amplitude *= 0.5;
  }

  return value;
});

// One brush stroke as a tapered, wavy band. `local` is the point in the
// stroke's frame: x along stroke, y perpendicular. The extra noise terms keep
// strokes from becoming clean vector lines.
const strokeMask = Fn(
  ([local, halfLen, thickness, waveAmp, waveFreq, wavePhase, taper]: [
    ReturnType<typeof vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    // Fade in/out along the length.
    const along = abs(local.x).div(halfLen);
    const lengthEnv = float(1.0).sub(
      smoothstep(float(0.55), float(1.0), along),
    );

    const grainP = vec2(
      local.x.mul(2.2).add(wavePhase.mul(0.17)),
      local.y.mul(18.0).add(wavePhase.mul(0.11)),
    );
    const edgeNoise = fbm2(grainP).sub(0.5);
    const filamentNoise = fbm2(
      vec2(local.x.mul(7.5).add(wavePhase), local.y.mul(31.0)),
    );

    // Curl the stroke perpendicularly, then disturb the centerline so nearby
    // pixels shear like ink in water.
    const wave = sin(local.x.mul(waveFreq).add(wavePhase))
      .mul(waveAmp)
      .add(sin(local.x.mul(waveFreq.mul(0.47)).sub(wavePhase)).mul(waveAmp.mul(0.42)));
    const offsetY = local.y.sub(wave).sub(edgeNoise.mul(thickness).mul(1.7));

    // Tapered thickness — wider at body, pointier at tips.
    const localThickness = thickness.mul(
      float(1.0).sub(taper.mul(smoothstep(float(0.2), float(1.0), along))),
    );
    const raggedThickness = localThickness.mul(
      float(0.54).add(filamentNoise.mul(0.92)),
    );

    const cross = abs(offsetY).div(raggedThickness.add(0.0001));
    const denseBody = float(1.0).sub(
      smoothstep(float(0.42), float(0.86), cross),
    );
    const feather = float(1.0)
      .sub(smoothstep(float(0.68), float(1.9), cross))
      .mul(float(0.28).add(edgeNoise.add(0.5).mul(0.26)));
    const brokenPigment = smoothstep(float(0.16), float(0.72), filamentNoise);

    return max(denseBody.mul(brokenPigment), feather).mul(lengthEnv);
  },
);

// Rotate p by theta.
const rot = Fn(
  ([p, theta]: [ReturnType<typeof vec2>, ReturnType<typeof float>]) => {
    const c = cos(theta);
    const s = sin(theta);
    return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
  },
);

export const InkBloom = ({
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
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clock = new THREE.Clock();

    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const inhaleU = uniform(float(0));

    const computeColor = Fn(() => {
      const rawUv = uv();
      const centered = rawUv.sub(0.5).mul(2.0);
      // Aspect-correct so the painting reads as roughly square on a tall phone.
      const st = vec2(centered.x.mul(aspectU), centered.y);

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const inhaleEase = smoothstep(float(0.02), float(1.0), inhaleU);
      const time = timeU.mul(0.42);

      // ---------- BACKGROUND: paper + broad cyan wash ----------
      const paperGrain = fbm2(st.mul(2.4).add(vec2(7.1, 3.3)));
      const paperBase = mix(PAPER_BRIGHT, PAPER_WARM, paperGrain.mul(0.35));

      // Big wash that fills most of the screen — only outer corners stay paper.
      const washCenter = vec2(
        sin(time.mul(0.18)).mul(0.05),
        cos(time.mul(0.14)).mul(0.04),
      );
      const washVec = st.sub(washCenter);
      const washRadial = length(washVec);

      const washReach = float(1.35)
        .add(breathEase.mul(0.18))
        .add(inhaleEase.mul(0.22));
      const washShape = float(1.0).sub(
        smoothstep(washReach.mul(0.25), washReach, washRadial),
      );
      const washNoise = fbm2(
        washVec.mul(1.4).add(vec2(time.mul(0.04), time.mul(-0.03))),
      );
      const washMask = washShape
        .mul(float(0.55).add(washNoise.mul(0.55)))
        .clamp(0.0, 1.0);

      // Inner deeper pooling near the bundle.
      const innerWash = float(1.0).sub(
        smoothstep(float(0.0), float(0.55), washRadial),
      );
      const innerWashNoise = fbm2(washVec.mul(2.4).add(vec2(11.0, 5.0)));
      const innerWashMask = innerWash
        .mul(float(0.5).add(innerWashNoise.mul(0.55)))
        .clamp(0.0, 1.0);

      const groundLight = mix(paperBase, WASH_LIGHT, washMask.mul(0.85));
      const groundMid = mix(groundLight, WASH_MID, innerWashMask.mul(0.55));
      const ground = mix(
        groundMid,
        WASH_DEEP,
        innerWashMask.mul(innerWashMask).mul(0.32),
      );

      // ---------- INK: directional brush strokes ----------
      // Tiny global drift so the bundle breathes with the wash.
      const drift = vec2(
        sin(time.mul(0.31)).mul(0.018),
        cos(time.mul(0.27)).mul(0.014),
      );
      const inkP = st.sub(drift);

      const t = time;
      // Inhale adds a small, slow flutter to wave phases.
      const wobble = inhaleEase.mul(0.4);

      const buildStroke = (
        ox: number,
        oy: number,
        angleDeg: number,
        halfLen: number,
        thickness: number,
        waveAmp: number,
        waveFreq: number,
        wavePhase: number,
        taper: number,
      ) => {
        const origin = vec2(float(ox), float(oy));
        const local = rot(inkP.sub(origin), float((-angleDeg * Math.PI) / 180));
        return strokeMask(
          local,
          float(halfLen),
          float(thickness),
          float(waveAmp).add(wobble.mul(0.02)),
          float(waveFreq),
          float(wavePhase).add(t.mul(0.15)),
          float(taper),
        );
      };

      // Bundle origin — slightly left and above center, like the painting.
      const bx = -0.12;
      const by = 0.05;

      // Long horizontal sweep to the left
      const s1 = buildStroke(
        bx,
        by - 0.02,
        8,
        0.85,
        0.025,
        0.06,
        4.5,
        0.0,
        0.7,
      );
      // Strong upward-left arching stroke
      const s2 = buildStroke(
        bx + 0.02,
        by + 0.05,
        75,
        0.55,
        0.022,
        0.09,
        5.5,
        1.2,
        0.8,
      );
      // Down-right loop
      const s3 = buildStroke(
        bx + 0.05,
        by - 0.08,
        -35,
        0.55,
        0.02,
        0.1,
        6.2,
        2.4,
        0.85,
      );
      // Down-left loop
      const s4 = buildStroke(
        bx - 0.04,
        by - 0.1,
        -150,
        0.5,
        0.018,
        0.11,
        6.8,
        0.7,
        0.85,
      );
      // Upper-right reach
      const s5 = buildStroke(
        bx + 0.08,
        by + 0.08,
        35,
        0.5,
        0.018,
        0.08,
        5.0,
        3.1,
        0.85,
      );
      // Tight inner curl
      const s6 = buildStroke(bx, by, 110, 0.32, 0.022, 0.07, 7.5, 1.9, 0.6);
      // Long thin whip going right
      const s7 = buildStroke(
        bx + 0.12,
        by - 0.02,
        -10,
        0.6,
        0.014,
        0.08,
        5.2,
        4.4,
        0.95,
      );
      // Hairline downward strand
      const s8 = buildStroke(
        bx + 0.02,
        by - 0.05,
        -90,
        0.45,
        0.01,
        0.06,
        8.0,
        0.5,
        0.9,
      );

      const strokes = max(
        max(max(s1, s2), max(s3, s4)),
        max(max(s5, s6), max(s7, s8)),
      );

      // Dense bundle blob — the painting has a near-black mass at the center
      // of the strokes.
      const bundleP = inkP.sub(vec2(float(bx + 0.02), float(by - 0.04)));
      const bundleNoise = fbm2(bundleP.mul(5.5).add(vec2(t.mul(0.05), 22.0)));
      const bundleEdgeNoise = fbm2(
        bundleP.mul(18.0).add(vec2(37.0, t.mul(0.08))),
      ).sub(0.5);
      const bundleRadius = float(0.095).add(bundleNoise.mul(0.05));
      const bundleDistance = length(bundleP).add(bundleEdgeNoise.mul(0.065));
      const bundle = float(1.0).sub(
        smoothstep(bundleRadius, bundleRadius.add(0.065), bundleDistance),
      );

      // Ink splatters scattered near the bundle.
      const splatterSpace = inkP
        .sub(vec2(float(bx), float(by - 0.05)))
        .mul(7.5);
      const splatCell = floor(splatterSpace);
      const splatLocal = fract(splatterSpace).sub(0.5);
      const splatSeed = rand2(splatCell);
      const splatDot = float(1.0).sub(
        smoothstep(float(0.04), float(0.16), length(splatLocal)),
      );
      const splatGate = smoothstep(float(0.93), float(0.99), splatSeed);
      const splatProximity = float(1.0).sub(
        smoothstep(float(0.05), float(0.42), length(bundleP)),
      );
      const splatter = splatDot.mul(splatGate).mul(splatProximity);

      const pigmentTexture = fbm2(
        inkP.mul(8.5).add(vec2(t.mul(0.08), t.mul(-0.05))),
      );
      const strokeErosion = smoothstep(float(0.12), float(0.78), pigmentTexture);
      const smokyStrokes = strokes.mul(
        float(0.62).add(strokeErosion.mul(0.48)).add(inhaleEase.mul(0.12)),
      );
      const inkDensity = max(max(smokyStrokes, bundle), splatter).clamp(0.0, 1.0);

      // ---------- INK DIFFUSION (cyan bleed around strokes) ----------
      // Soft cyan tint spreading out from the strokes into wet paper.
      const smokeNoise = fbm2(
        inkP.mul(2.1).add(vec2(t.mul(-0.035), t.mul(0.05))),
      );
      const smokeReach = float(1.0).sub(
        smoothstep(float(0.16), float(1.05), length(bundleP)),
      );
      const smokeVeil = smoothstep(float(0.2), float(0.84), smokeNoise)
        .mul(smokeReach)
        .mul(float(0.26).add(breathEase.mul(0.08)).add(inhaleEase.mul(0.12)));
      const diffusion = max(
        pow(inkDensity, float(0.45)).mul(0.32),
        smokeVeil,
      );

      // Extra bleed pooled around the bundle.
      const bundleBleedRadius = float(0.32)
        .add(breathEase.mul(0.05))
        .add(inhaleEase.mul(0.08));
      const bundleBleed = float(1.0)
        .sub(smoothstep(float(0.0), bundleBleedRadius, length(bundleP)))
        .mul(0.55);

      const totalDiffusion = max(diffusion, bundleBleed).clamp(0.0, 1.0);

      // ---------- COMPOSE ----------
      const groundWithDiffusion = mix(
        ground,
        WASH_DEEP,
        totalDiffusion.mul(float(1.0).sub(inkDensity)).mul(0.55),
      );

      const inkColor = mix(
        INK_BODY,
        INK_CORE,
        smoothstep(float(0.4), float(0.95), inkDensity),
      );

      const composed = mix(groundWithDiffusion, inkColor, inkDensity);

      const grain = rand2(rawUv.mul(vec2(1280.0, 720.0)).add(time.mul(TWO_PI)))
        .sub(0.5)
        .mul(0.008);
      const finalColor = composed.add(vec3(grain, grain, grain));

      const lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
      return mix(finalColor, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let inkTime = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let inhalePower = 0;

    function animate() {
      if (disposed) {
        return;
      }

      const delta = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
      const targetBreath = breathRef.current?.value ?? 0.0;
      const breathDelta = targetBreath - smoothedBreath;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        delta,
      );
      inhalePower = damp(
        inhalePower,
        clampNumber(breathDelta * INHALE_FLOW_GAIN, 0.0, 1.0),
        INHALE_RESPONSE_RATE,
        delta,
      );
      inkTime += delta * (1.0 + smoothedBreath * 0.16 + inhalePower * 0.62);

      (timeU as unknown as { value: number }).value = inkTime;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (inhaleU as unknown as { value: number }).value = inhalePower;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "InkBloom",
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
