import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { MeshBasicNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  Fn,
  Loop,
  If,
  Break,
  float,
  vec2,
  vec3,
  sin,
  cos,
  exp,
  fract,
  floor,
  mix,
  pow,
  smoothstep,
  dot,
  cross,
  length,
  normalize,
  abs,
  max,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

const RAY_STEPS = 180;
const MAX_TRACE_DIST = 30.0;
const SURFACE_EPSILON = 0.001;

const SPEED = 0.6;
const FLY_SPEED = 2.0;
// Primary tuning knobs: speed controls all motion, zoom back widens the view
// and pulls the ray origin away from the water surface.
const SPEED_KNOB = 1.0;
const ZOOM_BACK_KNOB = 8.0;
const NOISE_SCALE = 2.3;
const WARP_INTENSITY = 1.2;
const SPARKLE_INTENSITY = 0.34;
const SPARKLE_FREQUENCY = 0.2;

const BG_TOP = vec3(0.086, 0.557, 0.714);
const BG_BOTTOM = vec3(0.6, 0.882, 0.941);
const WAVE_COLOR_1 = vec3(0.008, 0.373, 0.494);
const WAVE_COLOR_2 = vec3(0.141, 0.827, 1.0);
const WAVE_COLOR_3 = vec3(0.478, 0.965, 1.0);

const HUE = -0.06;
const CONTRAST = 1.0;
const SATURATION = 1.0;
const WAVE_BRIGHTNESS = 0.0;
const SHADOWS = -0.09;
const EXPOSURE = 1.6;
const BG_BRIGHTNESS = 3.2;
const VIGNETTE = 0.16;

const BREATH_RESPONSE_RATE = 5.8;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 5.2;
const BREATH_MOTION_RELEASE_RATE = 2.2;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
});

const noise = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = floor(p);
  const f = fract(p);
  const a = hash(i);
  const b = hash(i.add(vec2(1.0, 0.0)));
  const c = hash(i.add(vec2(0.0, 1.0)));
  const d = hash(i.add(vec2(1.0, 1.0)));
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(a, b, u.x)
    .add(c.sub(a).mul(u.y).mul(float(1.0).sub(u.x)))
    .add(d.sub(b).mul(u.x).mul(u.y));
});

const fbm = Fn(([pIn]: [ReturnType<typeof vec2>]) => {
  const p = pIn.toVar();
  const v = float(0.0).toVar();
  const a = float(0.5).toVar();

  Loop(5, () => {
    v.assign(v.add(noise(p).mul(a)));
    p.assign(p.mul(NOISE_SCALE));
    a.assign(a.mul(0.5));
  });

  return v;
});

const getHDRColor = Fn(([ldrColor]: [ReturnType<typeof vec3>]) => {
  const safeR = max(float(1.0).sub(ldrColor.x), float(0.001));
  const safeG = max(float(1.0).sub(ldrColor.y), float(0.001));
  const safeB = max(float(1.0).sub(ldrColor.z), float(0.001));

  return vec3(
    float(EXPOSURE).mul(ldrColor.x).div(safeR),
    float(EXPOSURE).mul(ldrColor.y).div(safeG),
    float(EXPOSURE).mul(ldrColor.z).div(safeB),
  );
});

const applyHue = Fn(
  ([color, hueAmount]: [ReturnType<typeof vec3>, ReturnType<typeof float>]) => {
    const axis = vec3(0.57735, 0.57735, 0.57735);
    const cosAngle = cos(hueAmount);
    return color
      .mul(cosAngle)
      .add(cross(axis, color).mul(sin(hueAmount)))
      .add(axis.mul(dot(axis, color)).mul(float(1.0).sub(cosAngle)));
  },
);

const palette = Fn(([t]: [ReturnType<typeof float>]) => {
  const v = fract(t);
  const lowMid = mix(WAVE_COLOR_1, WAVE_COLOR_2, smoothstep(0.0, 0.62, v));
  const highlighted = mix(lowMid, WAVE_COLOR_3, smoothstep(0.48, 0.95, v));
  return mix(highlighted, WAVE_COLOR_1, smoothstep(0.82, 1.0, v).mul(0.58));
});

const surfaceMap = Fn(
  ([p, time, breathEase]: [
    ReturnType<typeof vec3>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const waveHeight = float(0.1).add(breathEase.mul(0.045));
    const horizonLift = breathEase.mul(0.18);
    const wave = cos(p.z.mul(0.9).sub(time.mul(1.9))).mul(waveHeight);
    return p.y.add(-2.9).sub(horizonLift).add(wave).mul(0.4);
  },
);

const calcNormal = Fn(
  ([p, time, breathEase]: [
    ReturnType<typeof vec3>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const h = 0.03;
    const dx = surfaceMap(p.add(vec3(h, 0.0, 0.0)), time, breathEase).sub(
      surfaceMap(p.add(vec3(-h, 0.0, 0.0)), time, breathEase),
    );
    const dy = surfaceMap(p.add(vec3(0.0, h, 0.0)), time, breathEase).sub(
      surfaceMap(p.add(vec3(0.0, -h, 0.0)), time, breathEase),
    );
    const dz = surfaceMap(p.add(vec3(0.0, 0.0, h)), time, breathEase).sub(
      surfaceMap(p.add(vec3(0.0, 0.0, -h)), time, breathEase),
    );
    return normalize(vec3(dx, dy, dz));
  },
);

export const Endless = ({
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
    const fractalTimeU = uniform(float(0));
    const flyOffsetU = uniform(float(0));
    const aspectU = uniform(float(aspect));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    const computeColor = Fn(() => {
      const uvRaw = uv();
      const viewUV = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );
      const radial = length(viewUV);
      const zoomBack = float(ZOOM_BACK_KNOB);
      const zoomScale = float(1.0).add(zoomBack.mul(0.14));

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      const topColHDR = getHDRColor(BG_TOP);
      const bottomColHDR = getHDRColor(BG_BOTTOM);
      const bgDim = float(0.9)
        .add(breathEase.mul(0.12))
        .add(breathMotionU.mul(0.08));
      const bgCol = mix(bottomColHDR, topColHDR, uvRaw.y)
        .mul(BG_BRIGHTNESS)
        .mul(bgDim);
      const fogCol = bottomColHDR.mul(BG_BRIGHTNESS).mul(bgDim);

      const cameraSway = vec2(
        sin(timeU.mul(0.13)).mul(0.08).add(breathEase.sub(0.5).mul(0.04)),
        cos(timeU.mul(0.09)).mul(0.05).add(breathMotionU.mul(0.02)),
      );
      const ro = vec3(
        float(-0.3).add(cameraSway.x),
        float(4.0)
          .add(zoomBack.mul(0.24))
          .sub(breathEase.mul(0.22))
          .add(breathMotionU.mul(0.04)),
        float(-8.5).sub(zoomBack.mul(1.6)).add(flyOffsetU),
      );

      const baseRd = normalize(
        vec3(viewUV.x.mul(zoomScale), viewUV.y.mul(zoomScale), float(1.0)),
      );
      const tilt = float(-0.35)
        .sub(breathEase.mul(0.02))
        .sub(breathMotionU.mul(0.01));
      const tiltSin = sin(tilt);
      const tiltCos = cos(tilt);
      const rd = normalize(
        vec3(
          baseRd.x,
          baseRd.y.mul(tiltCos).add(baseRd.z.mul(tiltSin)),
          baseRd.y.mul(tiltSin.negate()).add(baseRd.z.mul(tiltCos)),
        ),
      );

      const t = float(0.0).toVar();
      const hit = float(0.0).toVar();
      const p = vec3(0.0, 0.0, 0.0).toVar();

      Loop(RAY_STEPS, () => {
        const samplePoint = ro.add(rd.mul(t));
        p.assign(samplePoint);
        const d = surfaceMap(samplePoint, timeU, breathEase);

        If(d.lessThan(float(SURFACE_EPSILON)), () => {
          hit.assign(float(1.0));
          Break();
        });

        If(t.greaterThan(float(MAX_TRACE_DIST + ZOOM_BACK_KNOB * 6.0)), () => {
          Break();
        });

        t.assign(t.add(max(d, float(0.012))));
      });

      const sceneColor = bgCol.toVar();

      If(hit.greaterThan(float(0.5)), () => {
        const normal = calcNormal(p, timeU, breathEase);
        const viewDir = rd.negate();

        const lensCenter = vec2(
          sin(timeU.mul(0.11)).mul(0.22).add(breathEase.sub(0.5).mul(0.04)),
          cos(timeU.mul(0.07)).mul(0.14).sub(breathMotionU.mul(0.025)),
        );
        const delta = viewUV.sub(lensCenter);
        const lensEffect = smoothstep(0.48, 0.0, length(delta));
        const depthFade = smoothstep(25.0, 5.0, t);
        const distortion = delta
          .mul(lensEffect)
          .mul(depthFade)
          .mul(float(0.1).add(breathMotionU.mul(0.025)));

        const tTime = fractalTimeU.mul(0.2);
        const texUV = vec2(p.x, p.z).mul(0.17).sub(distortion);
        const warp = float(WARP_INTENSITY).mul(
          float(0.94).add(breathEase.mul(0.18)).add(breathMotionU.mul(0.08)),
        );
        const warpTime = tTime.mul(warp);

        const qCol = vec2(
          texUV.x.add(fbm(texUV.mul(2.0).add(vec2(warpTime, warpTime)))),
          texUV.y.add(fbm(texUV.mul(2.0).sub(vec2(warpTime, warpTime)))),
        );

        const rTime = tTime.mul(1.5).mul(warp);
        const rCol = vec2(
          texUV.x.add(fbm(qCol.mul(3.0).add(vec2(rTime, rTime)))),
          texUV.y.add(fbm(qCol.mul(3.0).sub(vec2(rTime, rTime)))),
        );

        const colorShift = fbm(rCol.mul(-2.7).add(vec2(tTime, tTime)));
        const texColor = palette(
          colorShift.add(rCol.x.mul(0.1)).sub(tTime.mul(0.2)),
        );

        const microNoise = fbm(
          rCol
            .mul(40.0 * SPARKLE_FREQUENCY)
            .add(vec2(tTime.mul(2.0), tTime.mul(2.0))),
        );
        const microLines = pow(
          smoothstep(
            0.65,
            1.0,
            float(1.0).sub(abs(microNoise.mul(2.0).sub(1.0))),
          ),
          float(32.0),
        ).mul(
          float(SPARKLE_INTENSITY).mul(
            float(0.82).add(breathEase.mul(0.18)).add(breathMotionU.mul(0.22)),
          ),
        );

        const lightDir = normalize(vec3(0.9, 1.1, -0.5));
        const diff = max(dot(normal, lightDir), float(0.0));
        const ambient = float(0.2).add(normal.y);
        const fresnel = pow(
          float(1.2).sub(dot(normal, viewDir)).clamp(0.2, 1.1),
          float(2.5),
        );

        let water: ReturnType<typeof vec3> = texColor
          .mul(diff.mul(1.1).add(ambient.mul(3.0)))
          .add(texColor.mul(fresnel).mul(1.1));
        water = water.div(max(float(1.0).sub(microLines), float(0.001)));
        water = applyHue(water, float(HUE));
        water = water.add(float(WAVE_BRIGHTNESS).add(breathMotionU.mul(0.015)));
        water = mix(vec3(0.5, 0.5, 0.5), water, float(CONTRAST));

        const lumaA = dot(water, vec3(0.299, 0.587, 0.114));
        const shadowMask = smoothstep(8.0, 0.0, lumaA);
        water = water.add(float(SHADOWS).mul(shadowMask).mul(4.0));

        const lumaB = dot(water, vec3(0.299, 0.587, 0.114));
        water = mix(vec3(lumaB, lumaB, lumaB), water, float(SATURATION));
        water = vec3(
          max(water.x, float(0.0)),
          max(water.y, float(0.0)),
          max(water.z, float(0.0)),
        );

        const fog = exp(float(-0.00035).mul(t).mul(t));
        sceneColor.assign(mix(fogCol, water, fog));
      });

      const toneMapped = sceneColor.div(float(EXPOSURE).add(sceneColor));
      const vignette = float(1.0).sub(
        smoothstep(float(0.45), float(1.45), radial).mul(VIGNETTE),
      );
      const graded = pow(toneMapped.mul(vignette), vec3(1.0, 1.0, 1.0));
      const lum = dot(graded, vec3(0.299, 0.587, 0.114));
      return mix(graded, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let sceneTime = 0;
    let fractalTime = 0;
    let flyOffset = 0;
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
      const motionPulse = breathMotion;
      const speed = SPEED * SPEED_KNOB;
      const flySpeed = FLY_SPEED * SPEED_KNOB;
      sceneTime +=
        deltaSeconds * speed * (1 + breathEase * 0.08 + motionPulse * 0.08);
      fractalTime +=
        deltaSeconds * speed * (1 + breathEase * 0.12 + motionPulse * 0.14);
      flyOffset +=
        deltaSeconds * flySpeed * (1 + breathEase * 0.06 + motionPulse * 0.12);

      (timeU as unknown as { value: number }).value = sceneTime;
      (fractalTimeU as unknown as { value: number }).value = fractalTime;
      (flyOffsetU as unknown as { value: number }).value = flyOffset;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Endless",
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
