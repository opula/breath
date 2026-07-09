import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
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
  cos,
  fract,
  floor,
  mix,
  smoothstep,
  length,
  dot,
  max,
  min,
  clamp,
  exp,
  pow,
  sqrt,
  normalize,
  reflect,
  uniform,
  positionLocal,
  cameraPosition,
  screenUV,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";
import { filmicFinish } from "./finish";

// ────────────────────────────────────────────────────────────
//  VIEW
// ────────────────────────────────────────────────────────────

const CAMERA_FOV = 55;
const CAM_HEIGHT = 8.2;
const CAM_Z = 340;
const CAM_DRIFT_X = 1.2;
const CAM_BOB_PRIMARY = 0.3;
const CAM_BOB_SECONDARY = 0.2;
const CAM_BREATH_LIFT = 0.6;
const LOOK_Y = -9;
const LOOK_Z = -620;
const LOOK_DRIFT_X = 4.0;
const LOOK_BREATH_LIFT = 0.9;

// ────────────────────────────────────────────────────────────
//  WATER FIELD
// ────────────────────────────────────────────────────────────

const WATER_SIZE = 900;
const WATER_SEGMENTS = 180;
const SKY_RADIUS = 1000;
const GRAVITY = 9.81;
// 0 rad = waves travelling toward the camera (+z), so dusk light backlights crests.
const WIND_HEADING = 0.18;

const WAVE_SPECS = [
  { wavelength: 118, amplitude: 2.25, steepness: 0.9, headingOffset: 0.0, phaseOffset: 0.0 },
  { wavelength: 74, amplitude: 1.3, steepness: 0.8, headingOffset: 0.46, phaseOffset: 2.3 },
  { wavelength: 46, amplitude: 0.68, steepness: 0.72, headingOffset: -0.38, phaseOffset: 4.1 },
  { wavelength: 29, amplitude: 0.34, steepness: 0.6, headingOffset: 0.21, phaseOffset: 1.2 },
];

// Deep-water dispersion: ω = √(g·k). Keeps ΣQ·k·A well under 1 so crests never fold.
const WAVES = WAVE_SPECS.map((spec) => {
  const heading = WIND_HEADING + spec.headingOffset;
  const k = (2 * Math.PI) / spec.wavelength;
  return {
    dirX: Math.sin(heading),
    dirZ: Math.cos(heading),
    amplitude: spec.amplitude,
    k,
    omega: Math.sqrt(GRAVITY * k),
    steepness: spec.steepness,
    phaseOffset: spec.phaseOffset,
  };
});

const DETAIL_SCALE_PRIMARY = 0.035;
const DETAIL_AMP_PRIMARY = 0.32;
const DETAIL_SCALE_SECONDARY = 0.071;
const DETAIL_AMP_SECONDARY = 0.16;
const RIPPLE_SCALE = 0.16;
const RIPPLE_AMPLITUDE = 0.085;
const DETAIL_NORMAL_EPSILON = 0.75;
const DETAIL_NORMAL_STRENGTH = 1.4;

// ────────────────────────────────────────────────────────────
//  LOOK
// ────────────────────────────────────────────────────────────

const SUN_ELEVATION = 0.1;
const SUN_DIR = vec3(0, Math.sin(SUN_ELEVATION), -Math.cos(SUN_ELEVATION));

const SKY_ZENITH = vec3(0.05, 0.062, 0.11);
const SKY_MID = vec3(0.26, 0.19, 0.27);
const SKY_HORIZON = vec3(0.5, 0.27, 0.13);
const SUN_GLOW_COLOR = vec3(0.78, 0.44, 0.24);
const SUN_CORE_COLOR = vec3(2.2, 1.6, 1.1);
const CIRRUS_COLOR = vec3(1.25, 0.72, 0.5);
const CIRRUS_SCALE = 1.1;
const CIRRUS_INTENSITY = 0.14;

const WATER_DEEP = vec3(0.02, 0.05, 0.062);
const WATER_SHALLOW = vec3(0.19, 0.4, 0.38);
const ABSORPTION = vec3(0.62, 0.32, 0.22);
const DEPTH_BASE = 1.15;
const DEPTH_MAX = 24.0;
const CREST_THINNING = 0.6;
const CREST_MASK_LOW = 0.3;
const CREST_MASK_HIGH = 3.0;

const WATER_IOR = 1.33;
const NORMAL_STRENGTH = 0.7;
const NORMAL_FADE_START = 60;
const NORMAL_FADE_END = 540;
const NORMAL_FADE_POWER = 1.6;
const REFLECTED_SUN_DISC = 0.3;

const SSS_TINT = vec3(0.25, 0.48, 0.4);
const SSS_WRAP = 0.5;
const SSS_POWER = 2.2;
const SSS_INTENSITY = 0.85;
const SSS_BREATH_GAIN = 0.4;
const SSS_FADE_START = 80;
const SSS_FADE_END = 480;

const SUN_SPEC_COLOR = vec3(1.3, 0.88, 0.58);
const SPEC_POWER = 220;
const SPEC_STRETCH = 2.6;
const SPEC_INTENSITY = 0.21;
const SPEC_BREAK_SCALE = 0.05;

const FOG_START = 300;
const FOG_END = 720;

// ────────────────────────────────────────────────────────────
//  BREATH
// ────────────────────────────────────────────────────────────

const SWELL_BASE = 0.75;
const SWELL_RANGE = 0.5;
const BREATH_RESPONSE_RATE = 4.4;
const BREATH_MOTION_GAIN = 3.1;
const BREATH_MOTION_ATTACK_RATE = 4.8;
const BREATH_MOTION_RELEASE_RATE = 2.1;

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ────────────────────────────────────────────────────────────
//  Noise helpers (2D gradient noise, ~[-1, 1] range)
// ────────────────────────────────────────────────────────────

const hash2 = Fn(([p]: [TSLNode]) => {
  const px = dot(p, vec2(127.1, 311.7));
  const py = dot(p, vec2(269.5, 183.3));
  return fract(sin(vec2(px, py)).mul(43758.5453)).mul(2.0).sub(1.0);
});

const gradientNoise2 = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const n00 = dot(hash2(i), f);
  const n10 = dot(hash2(i.add(vec2(1.0, 0.0))), f.sub(vec2(1.0, 0.0)));
  const n01 = dot(hash2(i.add(vec2(0.0, 1.0))), f.sub(vec2(0.0, 1.0)));
  const n11 = dot(hash2(i.add(vec2(1.0, 1.0))), f.sub(vec2(1.0, 1.0)));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y).mul(1.6);
});

const fbm2 = Fn(([pIn]: [TSLNode]) => {
  let p: TSLNode = pIn;
  let total: TSLNode = float(0.0);
  let amp = 0.55;

  total = total.add(gradientNoise2(p).mul(amp));
  p = vec2(
    p.x.mul(1.72).add(p.y.mul(0.62)),
    p.x.mul(-0.62).add(p.y.mul(1.72)),
  ).add(vec2(9.2, 3.1));
  amp *= 0.5;

  total = total.add(gradientNoise2(p).mul(amp));
  p = vec2(
    p.x.mul(1.66).add(p.y.mul(0.54)),
    p.x.mul(-0.54).add(p.y.mul(1.66)),
  ).add(vec2(21.4, 14.7));
  amp *= 0.5;

  return total.add(gradientNoise2(p).mul(amp));
});

// ────────────────────────────────────────────────────────────
//  Gerstner waves (compile-time unrolled)
// ────────────────────────────────────────────────────────────

const gerstnerDisplacement = Fn(
  ([p, time, swell]: [TSLNode, TSLNode, TSLNode]) => {
    let dx: TSLNode = float(0.0);
    let dy: TSLNode = float(0.0);
    let dz: TSLNode = float(0.0);
    for (const wave of WAVES) {
      const amplitude = swell.mul(wave.amplitude);
      const phase = p.x
        .mul(wave.dirX)
        .add(p.y.mul(wave.dirZ))
        .mul(wave.k)
        .sub(time.mul(wave.omega))
        .add(wave.phaseOffset);
      const sinPhase = sin(phase);
      dx = dx.add(amplitude.mul(sinPhase).mul(-wave.steepness * wave.dirX));
      dy = dy.add(amplitude.mul(cos(phase)));
      dz = dz.add(amplitude.mul(sinPhase).mul(-wave.steepness * wave.dirZ));
    }
    return vec3(dx, dy, dz);
  },
);

// Analytic normal accumulators + height: (nx, Q·k·A·cos Σ, nz, h).
const gerstnerField = Fn(([p, time, swell]: [TSLNode, TSLNode, TSLNode]) => {
  let nx: TSLNode = float(0.0);
  let nySub: TSLNode = float(0.0);
  let nz: TSLNode = float(0.0);
  let height: TSLNode = float(0.0);
  for (const wave of WAVES) {
    const amplitude = swell.mul(wave.amplitude);
    const phase = p.x
      .mul(wave.dirX)
      .add(p.y.mul(wave.dirZ))
      .mul(wave.k)
      .sub(time.mul(wave.omega))
      .add(wave.phaseOffset);
    const kA = amplitude.mul(wave.k);
    nx = nx.add(kA.mul(sin(phase)).mul(wave.dirX));
    nySub = nySub.add(kA.mul(cos(phase)).mul(wave.steepness));
    nz = nz.add(kA.mul(sin(phase)).mul(wave.dirZ));
    height = height.add(amplitude.mul(cos(phase)));
  }
  return vec4(nx, nySub, nz, height);
});

const detailHeight = Fn(([p, time]: [TSLNode, TSLNode]) => {
  const a = gradientNoise2(
    p.mul(DETAIL_SCALE_PRIMARY).add(vec2(time.mul(0.052), time.mul(0.037))),
  );
  const b = gradientNoise2(
    p
      .mul(DETAIL_SCALE_SECONDARY)
      .add(vec2(time.mul(-0.041), time.mul(0.058)))
      .add(vec2(13.7, 41.3)),
  );
  return a.mul(DETAIL_AMP_PRIMARY).add(b.mul(DETAIL_AMP_SECONDARY));
});

const rippleHeight = Fn(([p, time]: [TSLNode, TSLNode]) => {
  const ripple = gradientNoise2(
    p.mul(RIPPLE_SCALE).add(vec2(time.mul(-0.11), time.mul(0.14))),
  );
  return detailHeight(p, time).add(ripple.mul(RIPPLE_AMPLITUDE));
});

// ────────────────────────────────────────────────────────────
//  Shading helpers
// ────────────────────────────────────────────────────────────

// Dielectric Fresnel (unpolarized, air→water). Above-water only, so no TIR branch.
const fresnelDielectric = Fn(([cosTheta]: [TSLNode]) => {
  const eta = float(WATER_IOR);
  const sin2T = float(1.0).sub(cosTheta.mul(cosTheta)).div(eta.mul(eta));
  const cosT = sqrt(max(float(0.0), float(1.0).sub(sin2T)));
  const etaCosI = eta.mul(cosTheta);
  const etaCosT = eta.mul(cosT);
  const rParl = etaCosI.sub(cosT).div(etaCosI.add(cosT));
  const rPerp = cosTheta.sub(etaCosT).div(cosTheta.add(etaCosT));
  return clamp(rParl.mul(rParl).add(rPerp.mul(rPerp)).mul(0.5), 0.0, 1.0);
});

const skyBase = Fn(([dir, discAmount]: [TSLNode, TSLNode]) => {
  const elevation = dir.y;
  const low = mix(SKY_HORIZON, SKY_MID, smoothstep(0.012, 0.15, elevation));
  const dome = mix(low, SKY_ZENITH, smoothstep(0.13, 0.56, elevation));
  const belowDim = float(1.0).sub(
    smoothstep(0.0, 0.22, elevation.negate()).mul(0.42),
  );
  const sunAmount = max(dot(dir, SUN_DIR), 0.0);
  const glow = SUN_GLOW_COLOR.mul(
    pow(sunAmount, 9.0).mul(0.28).add(pow(sunAmount, 28.0).mul(0.55)),
  );
  const disc = SUN_CORE_COLOR.mul(
    smoothstep(0.99952, 0.99987, sunAmount),
  ).mul(discAmount);
  return dome.mul(belowDim).add(glow).add(disc);
});

const cirrus = Fn(([dir, time]: [TSLNode, TSLNode]) => {
  // Guarded projection keeps the divide finite below the horizon band mask.
  const altitude = max(dir.y, 0.02).add(0.08);
  const proj = vec2(dir.x, dir.z).div(altitude).mul(CIRRUS_SCALE);
  const drift = vec2(time.mul(0.0052), time.mul(-0.0034));
  const wisps = smoothstep(
    float(0.16),
    float(0.74),
    fbm2(proj.add(drift)).mul(0.5).add(0.5),
  );
  const band = smoothstep(0.025, 0.1, dir.y).mul(
    float(1.0).sub(smoothstep(0.24, 0.55, dir.y)),
  );
  const sunBoost = float(0.55).add(max(dot(dir, SUN_DIR), 0.0).mul(0.85));
  return CIRRUS_COLOR.mul(wisps.mul(band).mul(sunBoost).mul(CIRRUS_INTENSITY));
});

const finalizeColor = Fn(
  ([color, time, grayscale, resolution]: [
    TSLNode,
    TSLNode,
    TSLNode,
    TSLNode,
  ]) => {
    const mapped = color
      .mul(color.mul(2.51).add(0.03))
      .div(color.mul(color.mul(2.43).add(0.59)).add(0.14));
    // No manual gamma - the renderer's sRGB output transform handles encode.
    const graded = max(mapped, vec3(0.0, 0.0, 0.0));
    // Shared 16mm tail: desaturate, lift, cap, grain, vignette, grayscale.
    return filmicFinish(graded, time, screenUV.mul(resolution), grayscale);
  },
);

export const OpenWater = ({
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
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.5, 2400);
    camera.position.set(0, CAM_HEIGHT, CAM_Z);
    camera.lookAt(0, LOOK_Y, LOOK_Z);

    const clock = new THREE.Clock();

    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const resolutionU = uniform(vec2(width, height));

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const swell = float(SWELL_BASE).add(breathEase.mul(SWELL_RANGE));

    // ── Water ──────────────────────────────────────────────

    const waterColorNode = Fn(() => {
      const p = positionLocal.xz;

      const field = gerstnerField(p, timeU, swell);

      const heightC = rippleHeight(p, timeU);
      const heightX = rippleHeight(
        p.add(vec2(DETAIL_NORMAL_EPSILON, 0.0)),
        timeU,
      );
      const heightZ = rippleHeight(
        p.add(vec2(0.0, DETAIL_NORMAL_EPSILON)),
        timeU,
      );
      const detailGradX = heightX.sub(heightC).div(DETAIL_NORMAL_EPSILON);
      const detailGradZ = heightZ.sub(heightC).div(DETAIL_NORMAL_EPSILON);

      const normalRaw = normalize(
        vec3(
          field.x.sub(detailGradX.mul(DETAIL_NORMAL_STRENGTH)),
          float(1.0).sub(field.y),
          field.z.sub(detailGradZ.mul(DETAIL_NORMAL_STRENGTH)),
        ),
      );

      const waveHeight = field.w.add(heightC);
      const worldPos = vec3(p.x, waveHeight, p.y);
      const toCamera = cameraPosition.sub(worldPos);
      const dist = length(toCamera);
      const viewDir = toCamera.div(max(dist, 0.001));

      // Fade normal detail with distance so the horizon flattens to a mirror.
      const normalFade = pow(
        float(1.0).sub(smoothstep(NORMAL_FADE_START, NORMAL_FADE_END, dist)),
        float(NORMAL_FADE_POWER),
      );
      const normal = normalize(
        mix(vec3(0.0, 1.0, 0.0), normalRaw, normalFade.mul(NORMAL_STRENGTH)),
      );

      const fresnel = fresnelDielectric(max(dot(viewDir, normal), 0.0));

      const reflDirRaw = reflect(viewDir.negate(), normal);
      const reflDir = normalize(
        vec3(reflDirRaw.x, max(reflDirRaw.y, 0.02), reflDirRaw.z),
      );
      const reflection = skyBase(reflDir, float(REFLECTED_SUN_DISC));

      // Beer-Lambert body color; crests read thinner so light warms through them.
      const crest = smoothstep(CREST_MASK_LOW, CREST_MASK_HIGH, waveHeight);
      const depthProxy = min(
        float(DEPTH_BASE)
          .div(max(viewDir.y, 0.06))
          .mul(float(1.0).sub(crest.mul(CREST_THINNING))),
        float(DEPTH_MAX),
      );
      const clearFactor = exp(ABSORPTION.negate().mul(depthProxy));
      const body = mix(WATER_DEEP, WATER_SHALLOW, clearFactor).toVar();

      const backlit = clamp(
        dot(viewDir, SUN_DIR.negate()).add(SSS_WRAP).div(1.0 + SSS_WRAP),
        0.0,
        1.0,
      );
      const sssAmount = pow(backlit.mul(crest), float(SSS_POWER))
        .mul(SSS_INTENSITY)
        .mul(float(1.0).add(breathEase.mul(SSS_BREATH_GAIN)))
        .mul(float(1.0).sub(smoothstep(SSS_FADE_START, SSS_FADE_END, dist)));
      body.assign(mix(body, SSS_TINT, clamp(sssAmount, 0.0, 0.85)));

      const composite = mix(body, reflection, fresnel).toVar();

      // Stretched Blinn sun path, muted and broken up by the drifting noise
      // field so it reads as a soft interrupted reflection, not glitter.
      const halfVec = normalize(viewDir.add(SUN_DIR));
      const stretched = normalize(
        vec3(normal.x.mul(SPEC_STRETCH), normal.y, normal.z),
      );
      const specBreak = fbm2(
        p
          .mul(SPEC_BREAK_SCALE)
          .add(vec2(timeU.mul(0.045), timeU.mul(-0.032))),
      )
        .mul(0.5)
        .add(0.5);
      const specular = pow(max(dot(stretched, halfVec), 0.0), float(SPEC_POWER))
        .mul(SPEC_INTENSITY)
        .mul(float(0.55).add(specBreak.mul(0.45)))
        .mul(float(1.0).add(breathMotionU.mul(0.3)));
      composite.assign(composite.add(SUN_SPEC_COLOR.mul(specular)));

      // Fade into the sky actually behind the fragment for a seamless horizon.
      const rayDir = viewDir.negate();
      const horizonRay = normalize(vec3(rayDir.x, float(0.012), rayDir.z));
      const horizonSky = skyBase(horizonRay, float(0.0));
      const fogged = mix(
        composite,
        horizonSky,
        smoothstep(FOG_START, FOG_END, dist),
      );

      return finalizeColor(fogged, timeU, grayscaleU, resolutionU);
    })();

    const waterGeometry = new THREE.PlaneGeometry(
      WATER_SIZE,
      WATER_SIZE,
      WATER_SEGMENTS,
      WATER_SEGMENTS,
    );
    // Bake the rotation so local space == world space in the shader graph.
    waterGeometry.rotateX(-Math.PI / 2);

    const waterMaterial = new MeshBasicNodeMaterial();
    const displaced = gerstnerDisplacement(positionLocal.xz, timeU, swell);
    const vertexDetail = detailHeight(positionLocal.xz, timeU);
    waterMaterial.positionNode = positionLocal.add(
      vec3(displaced.x, displaced.y.add(vertexDetail), displaced.z),
    );
    waterMaterial.colorNode = waterColorNode;

    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.frustumCulled = false;
    scene.add(water);

    // ── Sky ────────────────────────────────────────────────

    const skyColorNode = Fn(() => {
      const dir = normalize(positionLocal.sub(cameraPosition));
      const base = skyBase(dir, float(1.0)).add(cirrus(dir, timeU));
      return finalizeColor(base, timeU, grayscaleU, resolutionU);
    })();

    const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 20);
    const skyMaterial = new MeshBasicNodeMaterial();
    skyMaterial.side = THREE.BackSide;
    skyMaterial.colorNode = skyColorNode;

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    // Draw after the water so most sky fragments fail the depth test.
    sky.renderOrder = 1;
    scene.add(sky);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
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

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;

      const ease =
        smoothedBreath * smoothedBreath * (3.0 - 2.0 * smoothedBreath);
      camera.position.set(
        Math.sin(elapsed * 0.037) * CAM_DRIFT_X,
        CAM_HEIGHT +
          ease * CAM_BREATH_LIFT +
          Math.sin(elapsed * 0.11) * CAM_BOB_PRIMARY +
          Math.sin(elapsed * 0.047 + 1.9) * CAM_BOB_SECONDARY,
        CAM_Z,
      );
      camera.lookAt(
        Math.sin(elapsed * 0.029 + 0.8) * LOOK_DRIFT_X,
        LOOK_Y + ease * LOOK_BREATH_LIFT,
        LOOK_Z,
      );

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "OpenWater",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(water, sky);
      waterGeometry.dispose();
      waterMaterial.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
