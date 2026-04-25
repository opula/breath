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

// --- Theme: moonlit water and warm vapor ---
const C_MAIN = vec3(0.48, 0.68, 0.78);
const C_LOW = vec3(0.08, 0.14, 0.22);
const C_MID = vec3(0.34, 0.7, 0.66);
const C_HIGH = vec3(0.98, 0.9, 0.74);

// Highlight coverage: lower = more white showing. 1.0 = original behavior.
const WHITE_GATE = 0.82;

// --- Tunable params ---
const WIND_SPEED = 0.026;
const WARP_POWER = 0.21;
const FBM_STRENGTH = 0.86;
const BLUR_RADIUS = 1.45;
const ZOOM = 0.45;
const GRAIN_STRENGTH = 0.008;
const NOISE_SCALE = 0.8673;
const SPEED = 0.42;

// Breath response: low amplitude, layered in several places so it feels like
// the whole veil is breathing instead of one obvious slider moving.
const BREATH_ZOOM_AMOUNT = 0.1;
const BREATH_WARP_AMOUNT = 0.2;
const BREATH_LIFT_AMOUNT = 0.08;
const BREATH_GLOW_AMOUNT = 0.2;

// fbm rotation matrix baked (angle = 0.5 rad)
const FBM_ROT_C = Math.cos(0.5);
const FBM_ROT_S = Math.sin(0.5);

// --- Shader helpers ---

// Hash: vec2 -> float in [0, 1)
const rand2 = Fn(([n]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))).mul(43758.5453));
});

// 2D value noise (matches reference's `noise`)
const noise2 = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const ip = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const res = mix(
    mix(rand2(ip), rand2(ip.add(vec2(1.0, 0.0))), u.x),
    mix(rand2(ip.add(vec2(0.0, 1.0))), rand2(ip.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
  return res.mul(res);
});

// 4-octave fbm (unrolled) — reference uses mat2 rotation + shift per octave
const fbm2 = Fn(([xIn]: [ReturnType<typeof vec2>]) => {
  let x: ReturnType<typeof vec2> = xIn;
  let v: ReturnType<typeof float> = float(0);
  let a = 0.5;
  for (let i = 0; i < 4; i++) {
    v = v.add(noise2(x).mul(a));
    const nx = x.x.mul(FBM_ROT_C).add(x.y.mul(FBM_ROT_S)).mul(2.0).add(100.0);
    const ny = x.x.mul(-FBM_ROT_S).add(x.y.mul(FBM_ROT_C)).mul(2.0).add(100.0);
    x = vec2(nx, ny);
    a *= 0.5;
  }
  return v;
});

// Hash: vec3 -> vec3 in [-0.5, 0.5]^3 (Rorschach-style)
const random3 = Fn(([i]: [ReturnType<typeof vec3>]) => {
  const seed1 = vec3(31.06, 19.86, 30.19);
  const seed2 = vec3(6640.0, 5790.4, 10798.861);
  return fract(sin(dot(i, seed1)).mul(seed2)).sub(0.5);
});

// 3D gradient noise (quintic Hermite) — substitute for classic cnoise.
// Scaled 2x so output range approximates cnoise's [-1, 1].
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

// Linear burn blend (reference's `blendLinearBurn_13_5`)
const blendLinearBurn = Fn(
  ([base, blend, opacity]: [
    ReturnType<typeof vec3>,
    ReturnType<typeof vec3>,
    ReturnType<typeof float>,
  ]) => {
    const burn = max(
      base.add(blend).sub(vec3(1.0, 1.0, 1.0)),
      vec3(0.0, 0.0, 0.0),
    );
    return burn.mul(opacity).add(base.mul(float(1.0).sub(opacity)));
  },
);

export const DreamSmoke = ({
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

    const computeColor = Fn(() => {
      // --- Centered, aspect-corrected, horizontally-mirrored UV ---
      // Folds top & bottom halves into each other (line of symmetry = horizontal axis).
      const threeUV = uv();
      const centeredY = threeUV.y.sub(0.5);
      const breathZoom = float(1.0).sub(breathU.mul(BREATH_ZOOM_AMOUNT));
      const stX = threeUV.x.sub(0.5).mul(aspectU).mul(breathZoom);
      const stY = abs(centeredY).mul(breathZoom);
      const st = vec2(stX, stY);
      const radial = length(vec2(stX, centeredY));

      const time = timeU.mul(SPEED);
      const breathGlow = float(0.86).add(breathU.mul(BREATH_GLOW_AMOUNT));
      const breathWarp = float(WARP_POWER).mul(
        float(0.9).add(breathU.mul(BREATH_WARP_AMOUNT)),
      );

      // --- getFluidColor body (inlined; st is already centered) ---
      const scaleFactor = float(1.0 / (2.0 * ZOOM));
      // uv = st * scaleFactor + 0.5, then y-flip
      let fuv = vec2(
        st.x.mul(scaleFactor).add(0.5),
        float(1.0).sub(st.y.mul(scaleFactor).add(0.5)),
      );

      const verticalOffset = float(0.09).add(breathU.mul(BREATH_LIFT_AMOUNT));
      const t = time.mul(0.85);

      // --- Domain warp via 3D gradient noise ---
      const noiseX = gradientNoise3(
        vec3(fuv.x, fuv.y, float(0))
          .mul(vec3(NOISE_SCALE, NOISE_SCALE, 1))
          .add(vec3(0.0, 74.8572, t.mul(0.3))),
      );
      const noiseY = gradientNoise3(
        vec3(fuv.x, fuv.y, float(0))
          .mul(vec3(NOISE_SCALE, NOISE_SCALE, 1))
          .add(vec3(203.91282, 10.0, t.mul(0.3))),
      );
      fuv = fuv.add(vec2(noiseX.mul(2.0), noiseY).mul(breathWarp));

      // Water-color wobble (two octaves)
      const waterScale = 18.0;
      const noiseA1 = gradientNoise3(
        vec3(
          fuv.x.mul(waterScale).add(344.91282),
          fuv.y.mul(waterScale),
          t.mul(0.3),
        ),
      );
      const noiseA2 = gradientNoise3(
        vec3(
          fuv.x.mul(waterScale * 2.2).add(723.937),
          fuv.y.mul(waterScale * 2.2),
          t.mul(0.4),
        ),
      );
      const noiseA = noiseA1.add(noiseA2.mul(0.5));
      fuv = fuv.add(noiseA.mul(0.02));
      fuv = vec2(fuv.x, fuv.y.sub(verticalOffset));

      // --- Procedural grain displacements (substitute for texture samples) ---
      const grainMix = sin(time).add(1.0).mul(0.5);
      const grainAt = (offset: ReturnType<typeof vec2>) => {
        const p = fuv.add(offset);
        const r = noise2(p).sub(0.5);
        const g = noise2(vec2(p.x.add(17.3), p.y.add(91.1))).sub(0.5);
        return mix(r, g, grainMix).mul(GRAIN_STRENGTH);
      };
      const disp0 = grainAt(vec2(0, 0));
      const disp1 = grainAt(vec2(63.861, 368.937));
      const disp3 = grainAt(vec2(516.025, 2017.745)); // sum of ref's cumulative offsets
      fuv = vec2(fuv.x.add(disp0), fuv.y.add(disp0));

      // --- FBM of fbm (reference's flow field) ---
      const stFbm = fuv.mul(NOISE_SCALE);

      const qx = fbm2(
        stFbm.mul(0.5).add(vec2(WIND_SPEED * 1.0, WIND_SPEED * 1.0).mul(time)),
      );
      const qy = fbm2(
        stFbm.mul(0.5).add(vec2(WIND_SPEED * 1.0, WIND_SPEED * 1.0).mul(time)),
      );
      const q = vec2(qx, qy);

      const rx = fbm2(
        stFbm
          .add(q)
          .add(vec2(0.3, 9.2))
          .add(vec2(time.mul(0.15), time.mul(0.15))),
      );
      const ry = fbm2(
        stFbm
          .add(q)
          .add(vec2(8.3, 0.8))
          .add(vec2(time.mul(0.126), time.mul(0.126))),
      );
      const r = vec2(rx, ry);

      const f = fbm2(stFbm.add(r).sub(q));

      // Reference's compound curve: (f + 0.6*f*f + 0.7*f + 0.5) * 0.5
      // = (1.7*f + 0.6*f*f + 0.5) * 0.5
      const fCompound = f.mul(1.7).add(f.mul(f).mul(0.6)).add(0.5).mul(0.5);
      const fullFbm = pow(fCompound, float(0.55)).mul(FBM_STRENGTH);

      const blur = float(BLUR_RADIUS * 1.5).mul(
        float(0.95).add(breathU.mul(0.18)),
      );

      // --- Wave Layer 1 ---
      const snUv1 = fuv
        .add(vec2(fullFbm.sub(0.5).mul(1.2), fullFbm.sub(0.5).mul(1.2)))
        .add(vec2(0.0, 0.025))
        .add(vec2(disp0, disp0));
      const sn1 = noise2(snUv1.mul(2.0).add(vec2(0, time.mul(0.5))))
        .mul(2.0)
        .mul(1.5); // layer1Amplitude
      const sn2 = smoothstep(
        sn1.sub(blur.mul(1.2)),
        sn1.add(blur.mul(1.2)),
        snUv1.y.sub(0.5).mul(5.0).add(0.5),
      );

      // --- Wave Layer 2 ---
      const snUv2 = fuv
        .add(vec2(fullFbm.sub(0.5).mul(0.85), fullFbm.sub(0.5).mul(0.85)))
        .add(vec2(0.0, 0.025))
        .add(vec2(disp1, disp1));
      const snB = noise2(snUv2.mul(4.0).add(vec2(293.0, time.mul(1.0))))
        .mul(2.0)
        .mul(1.4); // layer2Amplitude
      const sn2Bis = smoothstep(
        snB.sub(blur.mul(0.9)),
        snB.add(blur.mul(0.9)),
        snUv2.y.sub(0.6).mul(5.0).add(0.5),
      );

      // --- Wave Layer 3 ---
      const snUv3 = fuv
        .add(vec2(fullFbm.sub(0.5).mul(1.1), fullFbm.sub(0.5).mul(1.1)))
        .add(vec2(disp3, disp3));
      const snC = noise2(snUv3.mul(6.0).add(vec2(153.0, time.mul(1.2))))
        .mul(2.0)
        .mul(1.3); // layer3Amplitude
      const sn2Third = smoothstep(
        snC.sub(blur.mul(0.7)),
        snC.add(blur.mul(0.7)),
        snUv3.y.sub(0.9).mul(6.0).add(0.5),
      );

      const sn2P = pow(sn2, float(0.8));
      const sn2BisP = pow(sn2Bis, float(0.9));

      // --- Color blending (linear burn + palette mix) ---
      const step1 = blendLinearBurn(C_MAIN, C_LOW, float(1.0).sub(sn2P));
      const midBlend = mix(C_MAIN, C_MID, float(1.0).sub(sn2BisP));
      const step2 = blendLinearBurn(step1, midBlend, sn2P);
      const highBlend = mix(C_MAIN, C_HIGH, float(1.0).sub(sn2Third));
      // pow() with exponent < 1 pulls the (sn2P * sn2BisP) mask toward 1,
      // so the white highlight shows across a much larger area.
      const highMask = pow(
        sn2P.mul(sn2BisP),
        float(WHITE_GATE).sub(breathU.mul(0.18)),
      );
      const sinColor = mix(step2, highBlend, highMask);

      const centerDim = mix(
        float(0.62),
        float(1.0),
        smoothstep(float(0.1), float(0.42), radial),
      );
      const edgeFade = float(1.0).sub(
        smoothstep(float(0.82), float(1.22), radial),
      );
      const finalColor = sinColor.mul(centerDim).mul(edgeFade).mul(breathGlow);

      // Grayscale
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

    function animate() {
      if (disposed) return;
      (timeU as unknown as { value: number }).value = clock.getElapsedTime();
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value =
        breathRef.current?.value ?? 0.0;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "TidalVeil",
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
