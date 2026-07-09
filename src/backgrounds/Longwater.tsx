import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
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
  normalize,
  abs,
  max,
  min,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// --- Raymarch budget ---
const RAY_STEPS = 110;
const MAX_TRACE_DIST = 48.0;
const FALLBACK_MAX_DIST = 90.0;
const SURFACE_EPSILON = 0.002;
const MIN_STEP = 0.015;
const STEP_RELAX = 0.55;

// --- Motion / speed (deliberately ~1/3 of Endless) ---
const FLOW_SPEED = 0.22; // fbm morph clock accumulation rate
const FLOW_MORPH_RATE = 0.2; // in-shader multiplier on the flow clock
const FLY_SPEED = 0.7; // forward flight, world-units/s
const WAVE_TIME_SCALE = 0.8; // wave phase clock accumulation rate
const CAM_SWAY_RATE = 0.05;
const CAM_SWAY_AMOUNT = 0.35;

// --- Camera ---
const CAM_HEIGHT = 2.4;
const CAM_PITCH = -0.28; // radians; negative looks down at the water
const VIEW_SCALE = 0.85; // ray spread; larger = wider view

// --- Water surface (own height field: two slow crossing swells) ---
const WAVE_AMPLITUDE = 0.14;
const SWELL_A_FREQ = 0.34; // along z (direction of travel)
const SWELL_A_RATE = 0.3;
const SWELL_A_XMOD_FREQ = 0.21; // slow lateral meander of swell A crests
const SWELL_A_XMOD_AMT = 1.15;
const SWELL_A_WEIGHT = 0.62;
const SWELL_B_FREQ_X = 0.47; // crossing swell
const SWELL_B_FREQ_Z = 0.26;
const SWELL_B_RATE = 0.21;
const SWELL_B_CROSS_RATE = 0.16;
const SWELL_B_WEIGHT = 0.38;
const NORMAL_EPSILON = 0.06;

// --- Flow texture (domain-warped fbm on the surface) ---
const TEX_SCALE = 0.14;
const FBM_OCTAVES = 4;
const FBM_GAIN = 0.54;
const WARP_STRENGTH = 1.15;
const FLOW_THRESHOLD_LO = 0.6; // highlight band — keep coverage a minority
const FLOW_THRESHOLD_HI = 0.92;
const FLOW_STRENGTH = 0.85;

// --- Palette (muted, glow-from-dark; WATER_FLOW is the absolute cap) ---
const SKY_TOP = vec3(0.012, 0.025, 0.045);
const SKY_HORIZON = vec3(0.05, 0.1, 0.14);
const HORIZON_GLOW = vec3(0.075, 0.13, 0.165);
const WATER_DEEP = vec3(0.015, 0.06, 0.08);
const WATER_MID = vec3(0.07, 0.18, 0.2);
const WATER_FLOW = vec3(0.5, 0.62, 0.6);

// --- Lighting (flat-ish lambert + gentle horizon fresnel, no specular) ---
const LIGHT_DIRECTION = vec3(0.3, 0.8, -0.5);
const LIGHT_FLOOR = 0.72;
const LIGHT_GAIN = 0.3;
const FRESNEL_POWER = 3.0;
const FRESNEL_STRENGTH = 0.4;

// --- Fog / sky ---
const FOG_DENSITY = 0.0016; // exp(-FOG_DENSITY * t^2)
const SKY_GRADIENT_HEIGHT = 0.45;
const HORIZON_GLOW_WIDTH = 0.16;
const HORIZON_GLOW_STRENGTH = 0.55;

// --- Tone (single soft knee; no grading chain) ---
const TONE_SOFTNESS = 0.22; // c / (1 + TONE_SOFTNESS * c)

// --- Breath ---
const BREATH_WAVE_AMP_GAIN = 0.3; // inhale: wave amplitude +30%
const BREATH_CAM_LIFT = 0.25; // inhale: camera rises
const BREATH_PITCH_LIFT = 0.018; // inhale: horizon rises slightly in frame
const BREATH_WARP_GAIN = 0.1; // inhale: fbm warp intensity +10%
const BREATH_FLOW_BRIGHTNESS = 0.15; // breath-motion energy: flow lift
const BREATH_RESPONSE_RATE = 5.4;
const BREATH_MOTION_GAIN = 3.0;
const BREATH_MOTION_ATTACK_RATE = 5.0;
const BREATH_MOTION_RELEASE_RATE = 2.0;
const AMBIENT_BREATH_RATE = 0.45; // rad/s pseudo-breath when breath is undefined

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash = Fn(([p]: [TSLNode]) => {
  return fract(sin(dot(p, vec2(37.19, 213.53))).mul(25763.331));
});

const valueNoise = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(hash(i), hash(i.add(vec2(1.0, 0.0))), u.x),
    mix(hash(i.add(vec2(0.0, 1.0))), hash(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

// 4-octave fbm with a rotate+scale between octaves (angle ~0.67 rad, scale ~2.02).
const fbm = Fn(([pIn]: [TSLNode]) => {
  const p = pIn.toVar();
  const total = float(0.0).toVar();
  const amp = float(0.5).toVar();

  Loop(FBM_OCTAVES, () => {
    total.assign(total.add(valueNoise(p).mul(amp)));
    p.assign(
      vec2(
        p.x.mul(1.58).sub(p.y.mul(1.26)),
        p.x.mul(1.26).add(p.y.mul(1.58)),
      ).add(vec2(11.7, 5.3)),
    );
    amp.assign(amp.mul(FBM_GAIN));
  });

  return total;
});

// Own surface height: swell A rolls along z with a slow lateral meander,
// swell B crosses it diagonally. Pure trig — the raymarch stays cheap.
const waveHeight = Fn(([xz, time, amp]: [TSLNode, TSLNode, TSLNode]) => {
  const meander = sin(xz.x.mul(SWELL_A_XMOD_FREQ)).mul(SWELL_A_XMOD_AMT);
  const swellA = sin(
    xz.y.mul(SWELL_A_FREQ).add(time.mul(SWELL_A_RATE)).add(meander),
  );
  const swellB = sin(xz.x.mul(SWELL_B_FREQ_X).sub(time.mul(SWELL_B_RATE))).mul(
    cos(xz.y.mul(SWELL_B_FREQ_Z).add(time.mul(SWELL_B_CROSS_RATE))),
  );
  return swellA.mul(SWELL_A_WEIGHT).add(swellB.mul(SWELL_B_WEIGHT)).mul(amp);
});

const surfaceMap = Fn(([p, time, amp]: [TSLNode, TSLNode, TSLNode]) => {
  return p.y.sub(waveHeight(vec2(p.x, p.z), time, amp)).mul(STEP_RELAX);
});

const calcNormal = Fn(([p, time, amp]: [TSLNode, TSLNode, TSLNode]) => {
  const e = float(NORMAL_EPSILON);
  const hL = waveHeight(vec2(p.x.sub(e), p.z), time, amp);
  const hR = waveHeight(vec2(p.x.add(e), p.z), time, amp);
  const hD = waveHeight(vec2(p.x, p.z.sub(e)), time, amp);
  const hU = waveHeight(vec2(p.x, p.z.add(e)), time, amp);
  return normalize(vec3(hL.sub(hR), e.mul(2.0), hD.sub(hU)));
});

// Vertical sky gradient with a soft wide glow hugging the horizon line.
const skyColor = Fn(([dirY]: [TSLNode]) => {
  const grad = mix(
    SKY_HORIZON,
    SKY_TOP,
    smoothstep(float(0.0), float(SKY_GRADIENT_HEIGHT), max(dirY, float(0.0))),
  );
  const glow = smoothstep(float(HORIZON_GLOW_WIDTH), float(0.0), abs(dirY)).mul(
    HORIZON_GLOW_STRENGTH,
  );
  return mix(grad, HORIZON_GLOW, glow);
});

export const Longwater = ({
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
    const flowTimeU = uniform(float(0));
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

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      const waveAmp = float(WAVE_AMPLITUDE).mul(
        float(1.0).add(breathEase.mul(BREATH_WAVE_AMP_GAIN)),
      );

      // Camera: elevated, drifting forward, gentle lateral sway.
      const swayX = sin(timeU.mul(CAM_SWAY_RATE)).mul(CAM_SWAY_AMOUNT);
      const ro = vec3(
        swayX,
        float(CAM_HEIGHT).add(breathEase.mul(BREATH_CAM_LIFT)),
        flyOffsetU,
      );

      const baseRd = normalize(
        vec3(viewUV.x.mul(VIEW_SCALE), viewUV.y.mul(VIEW_SCALE), float(1.0)),
      );
      const tilt = float(CAM_PITCH).sub(breathEase.mul(BREATH_PITCH_LIFT));
      const tiltSin = sin(tilt);
      const tiltCos = cos(tilt);
      const rd = normalize(
        vec3(
          baseRd.x,
          baseRd.y.mul(tiltCos).add(baseRd.z.mul(tiltSin)),
          baseRd.z.mul(tiltCos).sub(baseRd.y.mul(tiltSin)),
        ),
      );

      // Jump straight to the wave bounding plane; upward rays get a huge
      // start distance and break out on the first iteration.
      const descent = max(rd.y.negate(), float(1e-4));
      const boundStart = ro.y.add(waveAmp.mul(1.1).negate()).div(descent);
      const t = min(
        max(boundStart, float(0.0)),
        float(MAX_TRACE_DIST + 1.0),
      ).toVar();
      const hit = float(0.0).toVar();

      Loop(RAY_STEPS, () => {
        const samplePoint = ro.add(rd.mul(t));
        const d = surfaceMap(samplePoint, timeU, waveAmp);

        If(d.lessThan(float(SURFACE_EPSILON)), () => {
          hit.assign(float(1.0));
          Break();
        });

        If(t.greaterThan(float(MAX_TRACE_DIST)), () => {
          Break();
        });

        t.assign(t.add(max(d, float(MIN_STEP))));
      });

      // Grazing rays converge slowly; below the horizon the waves are
      // sub-pixel and fog-dominated, so fall back to the flat plane hit.
      If(hit.lessThan(0.5), () => {
        If(rd.y.lessThan(-0.005), () => {
          t.assign(min(ro.y.div(rd.y.negate()), float(FALLBACK_MAX_DIST)));
          hit.assign(float(1.0));
        });
      });

      const sceneColor = skyColor(rd.y).toVar();
      const fogCol = mix(SKY_HORIZON, HORIZON_GLOW, HORIZON_GLOW_STRENGTH);

      If(hit.greaterThan(0.5), () => {
        const hitP = ro.add(rd.mul(t));

        // Marble-flow field: classic two-stage domain warp, slowly morphing.
        const tTime = flowTimeU.mul(FLOW_MORPH_RATE);
        const warp = float(WARP_STRENGTH).mul(
          float(1.0).add(breathEase.mul(BREATH_WARP_GAIN)),
        );
        const s = vec2(hitP.x, hitP.z).mul(TEX_SCALE);

        const q = vec2(
          fbm(s.add(vec2(tTime, tTime.mul(0.62)))),
          fbm(s.add(vec2(4.8, 1.2)).sub(vec2(tTime.mul(0.8), tTime))),
        );
        const t2 = tTime.mul(1.37);
        const r = vec2(
          fbm(s.add(q.mul(warp)).add(vec2(1.9, 8.4)).add(vec2(t2, t2.mul(0.6)))),
          fbm(s.add(q.mul(warp)).add(vec2(7.2, 2.6)).sub(vec2(t2.mul(0.5), t2))),
        );
        const flowField = fbm(s.add(r.mul(warp.mul(0.9))));

        const baseMask = smoothstep(
          float(0.18),
          float(0.74),
          flowField.add(q.y.mul(0.1)),
        );
        const base = mix(WATER_DEEP, WATER_MID, baseMask);
        const flowMask = smoothstep(
          float(FLOW_THRESHOLD_LO),
          float(FLOW_THRESHOLD_HI),
          flowField.add(r.x.mul(0.18)),
        );
        const flowLift = float(FLOW_STRENGTH).mul(
          float(1.0).add(breathMotionU.mul(BREATH_FLOW_BRIGHTNESS)),
        );
        let water: TSLNode = mix(
          base,
          WATER_FLOW,
          flowMask.mul(flowLift).clamp(0.0, 1.0),
        );

        // Flat-ish lambert + fresnel that leans the water into the horizon.
        const normal = calcNormal(hitP, timeU, waveAmp);
        const lightDir = normalize(LIGHT_DIRECTION);
        const diff = max(dot(normal, lightDir), float(0.0));
        water = water.mul(float(LIGHT_FLOOR).add(diff.mul(LIGHT_GAIN)));

        const facing = max(dot(normal, rd.negate()), float(0.0));
        const fresnel = pow(float(1.0).sub(facing), float(FRESNEL_POWER)).mul(
          FRESNEL_STRENGTH,
        );
        water = mix(water, fogCol, fresnel.clamp(0.0, 1.0));

        const fogAmount = float(1.0).sub(exp(t.mul(t).mul(-FOG_DENSITY)));
        sceneColor.assign(mix(water, fogCol, fogAmount));
      });

      // Honest pipeline: palette -> soft knee -> grayscale. Nothing else.
      const toned = sceneColor.div(
        float(1.0).add(sceneColor.mul(TONE_SOFTNESS)),
      );
      const luma = dot(toned, vec3(0.299, 0.587, 0.114));
      return mix(toned, vec3(luma, luma, luma), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let waveTime = 0;
    let flowTime = 0;
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
      const targetBreath =
        breathRef.current?.value ??
        0.5 + 0.5 * Math.sin(elapsed * AMBIENT_BREATH_RATE);
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

      waveTime += deltaSeconds * WAVE_TIME_SCALE;
      flowTime += deltaSeconds * FLOW_SPEED;
      flyOffset += deltaSeconds * FLY_SPEED;

      (timeU as unknown as { value: number }).value = waveTime;
      (flowTimeU as unknown as { value: number }).value = flowTime;
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
      label: "Longwater",
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
