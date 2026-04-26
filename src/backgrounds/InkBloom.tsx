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

const WATER_CLEAR = vec3(0.62, 0.74, 0.76);
const WATER_DEPTH = vec3(0.12, 0.18, 0.2);
const INK_DENSE = vec3(0.006, 0.008, 0.014);
const INK_EDGE = vec3(0.045, 0.075, 0.1);
const INK_MILK = vec3(0.84, 0.9, 0.88);

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
      const st = vec2(centered.x.mul(aspectU), centered.y);
      const radial = length(st);

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      const inhaleEase = smoothstep(float(0.02), float(1.0), inhaleU);
      const time = timeU.mul(0.42);

      const waterNoise = fbm2(
        st.mul(1.35).add(vec2(time.mul(0.035), time.mul(-0.025))),
      );
      const vignette = smoothstep(float(0.12), float(1.45), radial);
      const waterMix = vignette.add(waterNoise.mul(0.18)).clamp(0.0, 1.0);
      const water = mix(WATER_CLEAR, WATER_DEPTH, waterMix);

      const lift = time.mul(float(0.17).add(breathEase.mul(0.08)));
      let p = vec2(
        st.x.mul(float(1.0).sub(breathEase.mul(0.08))),
        st.y.sub(lift).add(breathEase.mul(0.12)),
      );

      const slowCurl = vec2(
        fbm2(p.mul(1.1).add(vec2(time.mul(0.17), 12.4))),
        fbm2(p.mul(1.1).add(vec2(47.2, time.mul(-0.14)))),
      ).sub(0.5);
      const curlStrength = float(0.55)
        .add(breathEase.mul(0.22))
        .add(inhaleEase.mul(0.28));
      p = p.add(slowCurl.mul(curlStrength));

      const fineCurl = vec2(
        fbm2(p.mul(2.8).add(vec2(31.2, time.mul(0.22)))),
        fbm2(p.mul(2.8).add(vec2(time.mul(-0.18), 83.7))),
      ).sub(0.5);
      p = p.add(fineCurl.mul(float(0.16).add(inhaleEase.mul(0.16))));

      const sway = sin(p.y.mul(2.2).add(time.mul(0.9))).mul(
        float(0.09).add(breathEase.mul(0.08)),
      );
      const columnWidth = float(0.2)
        .add(breathEase.mul(0.14))
        .add(inhaleEase.mul(0.13))
        .add(p.y.add(1.0).mul(0.055));
      const column = float(1.0).sub(
        smoothstep(columnWidth, columnWidth.add(0.5), abs(p.x.add(sway))),
      );
      const vertical = smoothstep(float(-1.05), float(-0.38), p.y).mul(
        float(1.0).sub(smoothstep(float(1.04), float(1.48), p.y)),
      );

      const bodyNoise = fbm2(
        vec2(p.x.mul(1.45), p.y.mul(2.7)).add(
          vec2(time.mul(0.08), time.mul(-0.12)),
        ),
      );
      const threadNoise = fbm2(
        vec2(p.x.mul(4.2), p.y.mul(8.2)).add(
          vec2(time.mul(-0.15), time.mul(0.18)),
        ),
      );
      const softBody = pow(
        smoothstep(float(0.24), float(0.92), bodyNoise),
        float(0.7),
      );
      const tendrils = smoothstep(float(0.52), float(0.93), threadNoise).mul(
        float(0.35).add(inhaleEase.mul(0.35)),
      );

      const sourcePoint = vec2(st.x.mul(0.8), st.y.add(0.72));
      const source = float(1.0)
        .sub(
          smoothstep(
            float(0.06),
            float(0.36).add(inhaleEase.mul(0.18)),
            length(sourcePoint),
          ),
        )
        .mul(float(0.42).add(inhaleEase.mul(0.6)));

      const plume = column
        .mul(vertical)
        .mul(softBody.add(tendrils))
        .mul(float(0.78).add(breathEase.mul(0.22)).add(inhaleEase.mul(0.32)));
      const density = max(source, plume).clamp(0.0, 1.0);

      const speckSpace = p.mul(42.0).add(vec2(time.mul(2.0), time.mul(-1.3)));
      const speckCell = floor(speckSpace);
      const speckUv = fract(speckSpace).sub(0.5);
      const speckSeed = rand2(speckCell);
      const suspendedDot = float(1.0).sub(
        smoothstep(float(0.018), float(0.095), length(speckUv)),
      );
      const suspendedPigment = suspendedDot
        .mul(smoothstep(float(0.78), float(0.995), speckSeed))
        .mul(density)
        .mul(float(0.18).add(inhaleEase.mul(0.28)));

      const inkCore = pow(density, float(1.18));
      const inkColor = mix(INK_EDGE, INK_DENSE, inkCore);
      const baseInkColor = mix(water, inkColor, density.mul(0.92));

      const bloomEdge = smoothstep(float(0.16), float(0.56), density).mul(
        float(1.0).sub(smoothstep(float(0.58), float(0.98), density)),
      );
      const milkyInkColor = mix(
        baseInkColor,
        INK_MILK,
        bloomEdge.mul(float(0.09).add(inhaleEase.mul(0.08))),
      );
      const pigmentColor = mix(
        milkyInkColor,
        INK_DENSE,
        suspendedPigment.mul(0.55),
      );

      const breathGlow = float(0.96).add(breathEase.mul(0.08)).add(
        inhaleEase.mul(0.05),
      );
      const clearCenter = float(1.0).sub(
        smoothstep(float(0.04), float(0.42), radial),
      );
      const centerLitColor = pigmentColor.add(
        INK_MILK.mul(clearCenter.mul(0.035)),
      );
      const color = centerLitColor.mul(breathGlow);

      const grain = rand2(rawUv.mul(vec2(1280.0, 720.0)).add(time.mul(TWO_PI)))
        .sub(0.5)
        .mul(0.01);
      const finalColor = color.add(vec3(grain, grain, grain));

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
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;

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
