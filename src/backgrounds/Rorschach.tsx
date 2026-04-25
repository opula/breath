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
  vec3,
  vec2,
  sin,
  fract,
  floor,
  mix,
  smoothstep,
  abs,
  dot,
  length,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Parameters ---
const SEED = 42.17;
const SCALE = 1.82;
const DRIFT_SPEED = 0.42;
const WARP_STRENGTH = 0.34;
const BREATH_ZOOM_AMOUNT = 0.14;
const BREATH_WARP_AMOUNT = 0.2;
const BREATH_THRESHOLD_AMOUNT = 0.12;
const BREATH_GLOW_AMOUNT = 0.22;
const BREATH_RESPONSE_RATE = 4.8;
const EDGE_FADE_INNER = 0.66;
const EDGE_FADE_OUTER = 1.58;
const CENTER_DIM = 0.72;

const COLOR_BG_DEEP = vec3(0.01, 0.015, 0.026);
const COLOR_BG_HALO = vec3(0.035, 0.075, 0.09);
const COLOR_INK_LOW = vec3(0.055, 0.16, 0.18);
const COLOR_INK_MID = vec3(0.22, 0.58, 0.56);
const COLOR_INK_HIGH = vec3(0.88, 0.88, 0.76);
const COLOR_WARM_TRACE = vec3(0.74, 0.42, 0.31);

// FBM: 5 octaves, base scale 2.5, lacunarity 2.3, gain 0.5
const FBM_SCALE = [2.5, 5.75, 13.225, 30.4175, 69.96025];
const FBM_AMP = [0.5, 0.25, 0.125, 0.0625, 0.03125];

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// --- TSL shader functions ---

// Simpler hash: vec3 → vec3 in [-0.5, 0.5]^3
const random3 = Fn(([i]: [ReturnType<typeof vec3>]) => {
  const seed1 = vec3(31.06, 19.86, 30.19);
  const seed2 = vec3(6640.0, 5790.4, 10798.861);
  return fract(sin(dot(i, seed1)).mul(seed2)).sub(0.5);
});

// 3D gradient noise with quintic Hermite interpolation
const gradientNoise = Fn(([p]: [ReturnType<typeof vec3>]) => {
  const i = floor(p);
  const f = fract(p);

  // Quintic Hermite: f^3 * (f * (6f - 15) + 10)
  const c = f
    .mul(f)
    .mul(f)
    .mul(f.mul(float(6.0).mul(f).sub(15.0)).add(10.0));

  // 8 corner gradient evaluations
  const n000 = dot(random3(i), f);
  const n100 = dot(random3(i.add(vec3(1, 0, 0))), f.sub(vec3(1, 0, 0)));
  const n010 = dot(random3(i.add(vec3(0, 1, 0))), f.sub(vec3(0, 1, 0)));
  const n110 = dot(random3(i.add(vec3(1, 1, 0))), f.sub(vec3(1, 1, 0)));
  const n001 = dot(random3(i.add(vec3(0, 0, 1))), f.sub(vec3(0, 0, 1)));
  const n101 = dot(random3(i.add(vec3(1, 0, 1))), f.sub(vec3(1, 0, 1)));
  const n011 = dot(random3(i.add(vec3(0, 1, 1))), f.sub(vec3(0, 1, 1)));
  const n111 = dot(random3(i.add(vec3(1, 1, 1))), f.sub(vec3(1, 1, 1)));

  // Trilinear interpolation
  const nX00 = mix(n000, n100, c.x);
  const nX01 = mix(n001, n101, c.x);
  const nX10 = mix(n010, n110, c.x);
  const nX11 = mix(n011, n111, c.x);
  const nXX0 = mix(nX00, nX10, c.y);
  const nXX1 = mix(nX01, nX11, c.y);
  return mix(nXX0, nXX1, c.z);
});

// 5-octave FBM (unrolled)
const layeredNoise = Fn(([p]: [ReturnType<typeof vec3>]) => {
  let total = gradientNoise(p.mul(FBM_SCALE[0])).mul(FBM_AMP[0]);
  total = total.add(gradientNoise(p.mul(FBM_SCALE[1])).mul(FBM_AMP[1]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[2])).mul(FBM_AMP[2]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[3])).mul(FBM_AMP[3]));
  total = total.add(gradientNoise(p.mul(FBM_SCALE[4])).mul(FBM_AMP[4]));
  return total;
});

// --- Component ---

export const Rorschach = ({
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

    // Uniforms
    const timeU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const driftTime = timeU.mul(DRIFT_SPEED);
    const breathZoom = float(1.0).sub(breathEase.mul(BREATH_ZOOM_AMOUNT));
    const breathWarp = float(WARP_STRENGTH).mul(
      float(0.88).add(breathEase.mul(BREATH_WARP_AMOUNT)),
    );

    // UV: center to (-1,1)
    const uvRaw = uv();
    const uvCentered = uvRaw.mul(2.0).sub(1.0);
    const stRaw = vec2(uvCentered.x.mul(aspectU), uvCentered.y);
    const radial = length(stRaw);
    const st = stRaw.mul(SCALE).mul(breathZoom);
    const mirrored = vec2(abs(st.x), st.y);

    const ambientPulse = sin(
      driftTime
        .mul(0.37)
        .add(sin(driftTime.mul(0.13)).mul(0.7))
        .add(1.9),
    )
      .mul(0.5)
      .add(0.5);
    const driftX = sin(driftTime.mul(0.31))
      .mul(0.26)
      .add(sin(driftTime.mul(0.17).add(2.4)).mul(0.18));
    const driftY = sin(driftTime.mul(0.27).add(1.1))
      .mul(0.24)
      .add(sin(driftTime.mul(0.11).add(3.6)).mul(0.16));

    const flowX = layeredNoise(
      vec3(
        mirrored.x.mul(0.66).add(driftX),
        mirrored.y.mul(0.66).add(SEED * 0.03),
        driftTime.mul(0.18),
      ),
    );
    const flowY = layeredNoise(
      vec3(
        mirrored.x.mul(0.62).add(SEED * 0.05),
        mirrored.y.mul(0.62).add(driftY),
        driftTime.mul(0.15).add(7.3),
      ),
    );
    const warped = vec2(
      mirrored.x.add(flowX.mul(breathWarp)),
      mirrored.y.add(flowY.mul(breathWarp)),
    );

    const body = layeredNoise(
      vec3(
        warped.x.mul(0.82).add(driftX.mul(0.4)),
        warped.y.mul(0.82).add(SEED),
        driftTime.mul(0.13).add(breathEase.mul(0.18)),
      ),
    ).add(0.5);
    const undertow = layeredNoise(
      vec3(
        warped.x.mul(0.38).sub(driftY.mul(0.35)).add(8.2),
        warped.y.mul(0.5).add(driftX.mul(0.25)).sub(4.1),
        driftTime.mul(0.08).sub(breathEase.mul(0.09)),
      ),
    ).add(0.5);
    const lace = gradientNoise(
      vec3(
        warped.x.mul(3.2).add(12.7),
        warped.y.mul(2.8).sub(6.4),
        driftTime.mul(0.22),
      ),
    ).add(0.5);

    const edgeFade = float(1.0).sub(
      smoothstep(float(EDGE_FADE_INNER), float(EDGE_FADE_OUTER), radial),
    );
    const axisGlow = float(1.0)
      .sub(smoothstep(float(0.0), float(0.16), abs(stRaw.x)))
      .mul(0.12);
    const density = body
      .mul(0.74)
      .add(undertow.mul(0.34))
      .add(lace.mul(0.12))
      .add(axisGlow)
      .mul(edgeFade);

    const threshold = float(0.52)
      .sub(breathEase.mul(BREATH_THRESHOLD_AMOUNT))
      .add(ambientPulse.sub(0.5).mul(0.08));
    const veil = smoothstep(threshold.sub(0.32), threshold.add(0.22), density);
    const core = smoothstep(threshold.add(0.02), threshold.add(0.36), density);
    const highlight = smoothstep(
      threshold.add(0.2),
      threshold.add(0.52),
      density.add(lace.mul(0.12)),
    ).mul(float(0.68).add(breathEase.mul(BREATH_GLOW_AMOUNT)));

    const centerDim = float(CENTER_DIM).add(
      smoothstep(float(0.15), float(0.56), radial).mul(1.0 - CENTER_DIM),
    );
    const bgColor = mix(
      COLOR_BG_DEEP,
      COLOR_BG_HALO,
      smoothstep(float(0.08), float(1.08), radial).mul(0.58),
    );
    const inkBase = mix(COLOR_INK_LOW, COLOR_INK_MID, veil);
    const inkColor = mix(inkBase, COLOR_INK_HIGH, highlight);
    const warmTrace = smoothstep(float(0.52), float(0.92), undertow).mul(
      core.mul(0.2),
    );
    const livingInk = mix(inkColor, COLOR_WARM_TRACE, warmTrace);
    const finalColor = mix(bgColor, livingInk, veil.mul(centerDim));

    // Grayscale desaturation
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

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;

    function animate() {
      if (disposed) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      smoothedBreath = damp(
        smoothedBreath,
        breathRef.current?.value ?? 0.0,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value =
        grayscaleRef.current ? 1.0 : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "MirrorBloom",
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
