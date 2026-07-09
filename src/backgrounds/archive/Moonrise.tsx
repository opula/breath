import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import {
  MeshBasicNodeMaterial,
  PointsNodeMaterial,
  StorageBufferAttribute,
} from "three/webgpu";
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
  pow,
  exp,
  sqrt,
  max,
  abs,
  dot,
  length,
  normalize,
  cross,
  reflect,
  mod,
  step,
  uniform,
  storage,
  instanceIndex,
  attribute,
  varying,
  positionLocal,
  positionWorld,
  cameraPosition,
  screenUV,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode";
import { pass } from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";
import { filmicFinish } from "./finish";

// ────────────────────────────────────────────────────────────
//  MOONRISE — a moonlit night ocean
// ────────────────────────────────────────────────────────────
// Three draws + bloom: a distant sky plane (night gradient, hash-cell
// starfield, phase-shaded moon with halo), a calm Gerstner-displaced water
// plane (Beer-Lambert depth color, dielectric fresnel reflecting the same
// procedural sky, and a soft broken specular corridor under the moon), and
// a compute-advected cloud of luminous motes rising off the swell.
// Sky/moon shading re-derived from the licensed threejs-sky-pro pack;
// water shading (fresnel / Beer-Lambert / Gerstner / specular / SSS)
// re-derived from the licensed threejs-water-pro pack.
// ────────────────────────────────────────────────────────────

const TWO_PI = 6.2831853;

// Camera
const CAMERA_FOV = 60;
const CAM_Y = 2.6;
const CAM_Z = 16;
const LOOK_Y = 4.6;
const LOOK_Z = -140;

// Moon (phase-shaded gibbous, low over the horizon)
const MOON_ELEVATION_DEG = 11.0;
const MOON_RISE_DEG = 2.0; // extra elevation at full inhale
const MOON_AZIMUTH_DEG = 7.0;
const MOON_PHASE = 0.56; // 0.5 = full; slight terminator only
const MOON_ANGULAR = 0.0012; // 1 - cos(theta), ~2.8 deg radius (stylized)
const MOON_DISC_BRIGHTNESS = 5.0;
const MOON_AMBIENT = 0.012;
const CRATER_SCALE = 2.6;
const CRATER_DEPTH = 0.24;
const HALO_TIGHT = 900.0;
const HALO_WIDE = 120.0;
const HALO_TIGHT_GAIN = 0.62;
const HALO_WIDE_GAIN = 0.09;

// Derived moon-phase constants (synthetic sun direction in the moon frame)
const MOON_PSI = (MOON_PHASE - 0.5) * TWO_PI;
const MOON_COS_PSI = Math.cos(MOON_PSI);
const MOON_SIN_PSI = Math.sin(MOON_PSI);
const MOON_SIN_THETA_MAX = Math.sqrt(
  Math.max(1 - (1 - MOON_ANGULAR) * (1 - MOON_ANGULAR), 1e-6),
);

// Starfield
const STAR_GRID = 70.0;
const STAR_INTENSITY = 1.0;

// Water
const WATER_SIZE = 620;
const WATER_SEGMENTS = 144; // 145 x 145 = 21,025 vertices
const WATER_Z_CENTER = -270;
const WAVE_TIME_SCALE = 0.6;
const FD_EPSILON = 1.4; // finite-difference step for noise normals
const SWELL_BREATH_GAIN = 0.15; // swell amplitude x1.15 at full inhale
const FRESNEL_FADE_START = 40.0;
const FRESNEL_FADE_END = 420.0;
const FRESNEL_FADE_POWER = 1.1;
const FRESNEL_NORMAL_STRENGTH = 0.55;
const WATER_IOR = 1.33;
const WATER_DEPTH_UNITS = 12.0;

// Moonlit specular corridor (the centerpiece)
const SPEC_POWER = 150.0;
const SPEC_INTENSITY = 0.65;
const SPEC_BREAK_SCALE = 0.16;
const CORRIDOR_BASE_WIDTH = 2.1;
const CORRIDOR_SPREAD = 0.075; // widens with distance from camera
const CORRIDOR_WIDEN = 0.35; // +35% width at full inhale
const SSS_POWER = 2.0;
const SSS_INTENSITY = 2.2;

// Tone
const TONE_EXPOSURE = 1.0;

// Breath dynamics
const BREATH_RESPONSE_RATE = 5.2;
const BREATH_MOTION_GAIN = 3.0;
const BREATH_MOTION_ATTACK_RATE = 4.6;
const BREATH_MOTION_RELEASE_RATE = 2.0;
const BREATH_FLOW_GAIN = 48.0;
const BREATH_FLOW_RATE = 4.2;

// Gerstner swell bank — calm, long, slow (baked; dirs normalized below)
const GERSTNER_WAVES = [
  { dir: [0.94, -0.34], amplitude: 0.42, wavelength: 46.0, steepness: 0.22, phase: 0.0 },
  { dir: [-0.7, -0.71], amplitude: 0.27, wavelength: 27.0, steepness: 0.3, phase: 2.1 },
  { dir: [0.35, -0.94], amplitude: 0.16, wavelength: 14.0, steepness: 0.35, phase: 4.4 },
].map((w) => {
  const len = Math.hypot(w.dir[0], w.dir[1]);
  const k = TWO_PI / w.wavelength;
  return {
    ...w,
    dir: [w.dir[0] / len, w.dir[1] / len],
    k,
    omega: Math.sqrt(9.81 * k) * WAVE_TIME_SCALE,
  };
});

// Palette
const SKY_ZENITH = vec3(0.0016, 0.0028, 0.008);
const SKY_HORIZON = vec3(0.013, 0.018, 0.042);
const MOONRISE_GLOW = vec3(0.028, 0.032, 0.062);
const MOON_COL = vec3(0.7, 0.78, 0.95);
const STAR_COL = vec3(0.78, 0.84, 1.0);
const WATER_DEEP = vec3(0.005, 0.01, 0.022);
const WATER_TRANSMISSION = vec3(0.03, 0.095, 0.145);
const WATER_ABSORPTION = vec3(0.3, 0.16, 0.09);
const SSS_TINT = vec3(0.1, 0.2, 0.3);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ── TSL noise helpers ────────────────────────────────────────

const hash2 = Fn(([p]: [TSLNode]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

const valueNoise = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(hash2(i), hash2(i.add(vec2(1.0, 0.0))), u.x),
    mix(hash2(i.add(vec2(0.0, 1.0))), hash2(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

// Full dielectric Fresnel for the air-water interface (above-water branch;
// eta = 1.33 keeps sin2T < 1, so no TIR case is needed here).
const fresnelDielectric = Fn(([cosThetaI, eta]: [TSLNode, TSLNode]) => {
  const sin2T = float(1.0).sub(cosThetaI.mul(cosThetaI)).div(eta.mul(eta));
  const cosT = sqrt(max(float(0.0), float(1.0).sub(sin2T)));
  const eCi = eta.mul(cosThetaI);
  const eCt = eta.mul(cosT);
  const rParl = eCi.sub(cosT).div(eCi.add(cosT));
  const rPerp = cosThetaI.sub(eCt).div(cosThetaI.add(eCt));
  return rParl.mul(rParl).add(rPerp.mul(rPerp)).mul(0.5).clamp(0.0, 1.0);
});

export const Moonrise = ({
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

    let disposed = false;

    // ── Uniforms ─────────────────────────────────────────────
    const timeU = uniform(float(0));
    const dtU = uniform(float(1 / 30));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));
    const breathFlowU = uniform(float(0)); // signed: + inhaling, - exhaling
    const moonDirU = uniform(new THREE.Vector3(0.12, 0.19, -0.97));
    const resolutionU = uniform(vec2(width, height));

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));

    // ── Shared sky shading (also sampled by the water reflection) ──
    // Night gradient + residual moonrise horizon glow + moon halo + ambient
    // lift. Stars and the disc live only on the sky plane.
    const skyBase = Fn(([dirIn]: [TSLNode]) => {
      const y = max(dirIn.y, float(0.0));
      const gradient = SKY_ZENITH.add(
        SKY_HORIZON.sub(SKY_ZENITH).mul(exp(y.mul(-4.2))),
      );

      const flatDir = normalize(vec3(dirIn.x, float(0.0), dirIn.z));
      const flatMoon = normalize(vec3(moonDirU.x, float(0.0), moonDirU.z));
      const azAlign = pow(max(dot(flatDir, flatMoon), float(0.0)), float(3.0));
      const moonriseGlow = MOONRISE_GLOW.mul(exp(y.mul(-3.4)))
        .mul(azAlign)
        .mul(float(1.0).add(breathEase.mul(0.25)));

      const w = dot(dirIn, moonDirU);
      const haloBoost = float(1.0)
        .add(breathEase.mul(0.45))
        .add(breathMotionU.mul(0.3));
      const halo = MOON_COL.mul(
        exp(w.sub(1.0).mul(HALO_TIGHT))
          .mul(HALO_TIGHT_GAIN)
          .add(exp(w.sub(1.0).mul(HALO_WIDE)).mul(HALO_WIDE_GAIN)),
      ).mul(haloBoost);

      const ambientLift = MOON_COL.mul(MOON_AMBIENT);
      return gradient.add(moonriseGlow).add(halo).add(ambientLift);
    });

    // Hash-cell starfield with per-star twinkle + brightness tiers, on a
    // stereographic projection of the view ray (stable above the horizon).
    const starField = Fn(([dirIn]: [TSLNode]) => {
      const st = vec2(dirIn.x, dirIn.z).div(dirIn.y.add(1.25));
      const gp = st.mul(STAR_GRID);
      const cell = floor(gp);
      const f = fract(gp);
      const h1 = hash2(cell);
      const h2 = hash2(cell.add(vec2(11.3, 7.9)));
      const h3 = hash2(cell.add(vec2(3.1, 17.7)));
      const h4 = hash2(cell.add(vec2(23.7, 5.3)));

      const starPos = vec2(h2, h3).mul(0.6).add(0.2);
      const spot = smoothstep(float(0.14), float(0.02), length(f.sub(starPos)));
      const presence = step(float(0.66), h1);
      // Brightness tiers: mostly dim, a few brilliant.
      const tier = mix(float(0.3), float(1.0), pow(h4, float(6.0))).add(
        step(float(0.988), h4).mul(1.1),
      );
      const twinkle = sin(
        timeU.mul(float(0.9).add(h3.mul(2.4))).add(h2.mul(TWO_PI)),
      )
        .mul(0.3)
        .add(0.7);
      const horizonFade = smoothstep(float(0.02), float(0.12), dirIn.y);
      return spot.mul(presence).mul(tier).mul(twinkle).mul(horizonFade);
    });

    // ── Scene + camera ───────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010208);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.5, 5000);
    camera.position.set(0, CAM_Y, CAM_Z);
    camera.lookAt(0, LOOK_Y, LOOK_Z);

    const clock = new THREE.Clock();

    // ── 1. Sky plane (distant, drawn first, no depth write) ──
    const skyGeometry = new THREE.PlaneGeometry(4000, 2400);
    const skyMaterial = new MeshBasicNodeMaterial({ depthWrite: false });
    {
      const dir = normalize(positionWorld.sub(cameraPosition));
      const base = skyBase(dir);

      const wSky = dot(dir, moonDirU);
      // Dim stars inside the halo so the moon reads clean.
      const starMask = float(1.0).sub(
        exp(wSky.sub(1.0).mul(90.0)).mul(2.2).clamp(0.0, 1.0),
      );
      const stars = STAR_COL.mul(starField(dir))
        .mul(starMask)
        .mul(STAR_INTENSITY);

      // Moon frame: stable basis around moonDir (tilted refUp avoids a
      // degenerate cross at the zenith).
      const moonRight = normalize(
        cross(vec3(0.0, 0.99999999, 0.0001), moonDirU),
      );
      const moonUp = cross(moonDirU, moonRight);
      const du = dot(dir, moonRight).div(MOON_SIN_THETA_MAX);
      const dv = dot(dir, moonUp).div(MOON_SIN_THETA_MAX);
      const insideDisc = smoothstep(
        float(1.0 - MOON_ANGULAR),
        float(1.0 - MOON_ANGULAR * 0.88),
        wSky,
      );

      // Sphere normal reconstructed inside the disc, lit by a synthetic sun
      // direction in the moonDir/moonRight plane (phase shading).
      const r2 = du.mul(du).add(dv.mul(dv));
      const sphereNormal = normalize(
        moonRight
          .mul(du)
          .add(moonUp.mul(dv))
          .sub(moonDirU.mul(sqrt(max(float(1.0).sub(r2), float(0.0))))),
      );
      const sunInMoon = normalize(
        moonDirU.mul(-MOON_COS_PSI).add(moonRight.mul(MOON_SIN_PSI)),
      );
      const lit = max(dot(sphereNormal, sunInMoon), float(0.0));

      // 2-octave value-noise crater mottling.
      const craterP = vec2(du, dv).mul(CRATER_SCALE).add(vec2(4.7, 8.1));
      const mottle = float(1.0).sub(
        valueNoise(craterP)
          .mul(0.62)
          .add(valueNoise(craterP.mul(2.3).add(vec2(11.1, 3.7))).mul(0.38))
          .mul(CRATER_DEPTH),
      );
      // Small lit floor keeps the dark limb from cutting to black.
      const disc = MOON_COL.mul(mottle)
        .mul(lit.mul(MOON_DISC_BRIGHTNESS).add(0.1))
        .mul(insideDisc);

      skyMaterial.colorNode = vec4(
        filmicFinish(
          base.add(stars).add(disc),
          timeU,
          screenUV.mul(resolutionU),
          grayscaleU,
        ),
        float(1.0),
      );
    }
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.position.set(0, 700, -1400);
    skyMesh.renderOrder = -1;
    scene.add(skyMesh);

    // ── 2. Water plane ───────────────────────────────────────
    const waterGeometry = new THREE.PlaneGeometry(
      WATER_SIZE,
      WATER_SIZE,
      WATER_SEGMENTS,
      WATER_SEGMENTS,
    );
    waterGeometry.rotateX(-Math.PI / 2); // bake into attributes: local == XZ

    const waterMaterial = new MeshBasicNodeMaterial();
    {
      // Undisplaced grid coords ("position" attribute == positionGeometry).
      const positionAttr = attribute("position", "vec3");
      const gx = positionAttr.x;
      const gz = positionAttr.z;
      const swellScale = float(1.0).add(breathEase.mul(SWELL_BREATH_GAIN));

      // 3 Gerstner waves: displacement + analytic normal accumulators.
      let dx: TSLNode = float(0.0);
      let dy: TSLNode = float(0.0);
      let dz: TSLNode = float(0.0);
      let nx: TSLNode = float(0.0);
      let nySub: TSLNode = float(0.0);
      let nz: TSLNode = float(0.0);
      for (const wave of GERSTNER_WAVES) {
        const phase = gx
          .mul(wave.dir[0] * wave.k)
          .add(gz.mul(wave.dir[1] * wave.k))
          .sub(timeU.mul(wave.omega))
          .add(wave.phase);
        const c = cos(phase);
        const s = sin(phase);
        const amp = float(wave.amplitude).mul(swellScale);
        dx = dx.add(amp.mul(-wave.steepness * wave.dir[0]).mul(s));
        dy = dy.add(amp.mul(c));
        dz = dz.add(amp.mul(-wave.steepness * wave.dir[1]).mul(s));
        nx = nx.add(amp.mul(wave.k * wave.dir[0]).mul(s));
        nySub = nySub.add(amp.mul(wave.k * wave.steepness).mul(c));
        nz = nz.add(amp.mul(wave.k * wave.dir[1]).mul(s));
      }

      // 2 scrolling noise octaves; normal via finite differences.
      const heightNoise = Fn(([p]: [TSLNode]) => {
        const drift1 = vec2(timeU.mul(0.055), timeU.mul(0.032));
        const drift2 = vec2(timeU.mul(-0.042), timeU.mul(0.061));
        const n1 = valueNoise(p.mul(0.11).add(drift1)).sub(0.5).mul(0.42);
        const n2 = valueNoise(p.mul(0.33).add(drift2).add(vec2(7.7, 3.1)))
          .sub(0.5)
          .mul(0.17);
        return n1.add(n2);
      });
      const hC = heightNoise(vec2(gx, gz)).mul(swellScale);
      const hX = heightNoise(vec2(gx.add(FD_EPSILON), gz)).mul(swellScale);
      const hZ = heightNoise(vec2(gx, gz.add(FD_EPSILON))).mul(swellScale);
      dy = dy.add(hC);
      nx = nx.add(hC.sub(hX).div(FD_EPSILON));
      nz = nz.add(hC.sub(hZ).div(FD_EPSILON));

      waterMaterial.positionNode = positionAttr.add(vec3(dx, dy, dz));

      // Vertex-stage varyings interpolated into the fragment.
      const vNormal = varying(vec3(nx, float(1.0).sub(nySub), nz));
      const vCrest = varying(dy);

      const n = normalize(vNormal);
      const viewVec = cameraPosition.sub(positionWorld);
      const viewDir = normalize(viewVec);
      const dist = length(viewVec);

      // Dielectric fresnel with distance-faded normal detail (clean horizon).
      const distanceFade = pow(
        float(1.0).sub(
          smoothstep(float(FRESNEL_FADE_START), float(FRESNEL_FADE_END), dist),
        ),
        float(FRESNEL_FADE_POWER),
      );
      const fresnelNormal = normalize(
        mix(
          vec3(0.0, 1.0, 0.0),
          n,
          float(FRESNEL_NORMAL_STRENGTH).mul(distanceFade),
        ),
      );
      const fresnel = fresnelDielectric(
        max(dot(viewDir, fresnelNormal), float(0.0)),
        float(WATER_IOR),
      );

      // Reflection: same procedural sky, reflected ray clamped above horizon.
      const reflectRaw = reflect(viewDir.negate(), fresnelNormal);
      const reflectDir = normalize(
        vec3(reflectRaw.x, max(reflectRaw.y, float(0.015)), reflectRaw.z),
      );
      const reflectionColor = skyBase(reflectDir);

      // Beer-Lambert to a deep blue-black (no seabed: fallback column depth).
      const columnDepth = float(WATER_DEPTH_UNITS).div(
        max(abs(viewDir.y), float(0.08)),
      );
      const clearFactor = exp(WATER_ABSORPTION.negate().mul(columnDepth));
      const waterBase = mix(WATER_DEEP, WATER_TRANSMISSION, clearFactor);

      // Moonlit SSS: faint cool backlit scatter on crest tops facing the moon.
      const backlit = dot(viewDir, moonDirU.negate())
        .add(0.5)
        .div(1.5)
        .clamp(0.0, 1.0);
      const waveTransmission = dot(n, moonDirU.negate())
        .add(0.3)
        .clamp(0.0, 1.0);
      const crestGate = smoothstep(float(0.15), float(0.75), vCrest);
      const sssFactor = pow(backlit.mul(waveTransmission), float(SSS_POWER))
        .mul(SSS_INTENSITY)
        .mul(crestGate)
        .mul(distanceFade)
        .mul(float(1.0).add(breathEase.mul(0.25)));
      const sssWater = mix(waterBase, SSS_TINT, sssFactor.clamp(0.0, 1.0));

      // ── Moonlit specular corridor (centerpiece) ────────────
      // Stretched Gaussian corridor along the moon azimuth from the camera.
      const flatMoon = normalize(vec2(moonDirU.x, moonDirU.z));
      const rel = vec2(positionWorld.x, positionWorld.z.sub(CAM_Z));
      const along = dot(rel, flatMoon);
      const lateral = abs(rel.x.mul(flatMoon.y).sub(rel.y.mul(flatMoon.x)));
      const widthScale = float(1.0).add(breathEase.mul(CORRIDOR_WIDEN));
      const corridorWidth = float(CORRIDOR_BASE_WIDTH)
        .add(max(along, float(0.0)).mul(CORRIDOR_SPREAD))
        .mul(widthScale);
      const lw = lateral.div(corridorWidth);
      const corridor = exp(lw.mul(lw).negate()).mul(
        smoothstep(float(2.0), float(14.0), along),
      );

      // Broad elongated specular toward the moon, broken up by the drifting
      // surface noise so it reads as a soft interrupted reflection.
      const halfVec = normalize(viewDir.add(moonDirU));
      const specBase = pow(
        max(dot(n, halfVec), float(0.0)),
        float(SPEC_POWER),
      );
      const specBreak = valueNoise(
        vec2(positionWorld.x, positionWorld.z)
          .mul(SPEC_BREAK_SCALE)
          .add(vec2(timeU.mul(0.05), timeU.mul(-0.034))),
      );
      const pathGlow = MOON_COL.mul(specBase)
        .mul(float(0.3).add(corridor.mul(0.7)))
        .mul(SPEC_INTENSITY)
        .mul(float(0.55).add(specBreak.mul(0.45)))
        .mul(float(1.0).add(breathEase.mul(0.4)).add(breathMotionU.mul(0.25)));

      const waterCol = mix(sssWater, reflectionColor, fresnel).add(pathGlow);
      waterMaterial.colorNode = vec4(
        filmicFinish(waterCol, timeU, screenUV.mul(resolutionU), grayscaleU),
        float(1.0),
      );
    }
    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.position.set(0, 0, WATER_Z_CENTER);
    scene.add(waterMesh);

    // ── 3. Motes: slow-rising luminous compute particles ─────

    // ── Renderer (direct — halo/glow painted in-shader) ──
    const renderer = makeWebGPURenderer(context, { antialias: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = TONE_EXPOSURE;


    // ── Animation loop ───────────────────────────────────────
    const moonVec = new THREE.Vector3();
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;
    let breathMotion = 0;
    let breathFlow = 0;

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
      breathFlow = damp(
        breathFlow,
        clampNumber(breathDelta * BREATH_FLOW_GAIN, -1.0, 1.0),
        BREATH_FLOW_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      const breathEaseJS =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);

      // Gentle moonrise on inhale — drives disc, halo, and glitter azimuth.
      const elevRad =
        ((MOON_ELEVATION_DEG + breathEaseJS * MOON_RISE_DEG) * Math.PI) / 180;
      const azRad = (MOON_AZIMUTH_DEG * Math.PI) / 180;
      moonVec.set(
        Math.sin(azRad) * Math.cos(elevRad),
        Math.sin(elevRad),
        -Math.cos(azRad) * Math.cos(elevRad),
      );
      (moonDirU as unknown as { value: THREE.Vector3 }).value.copy(moonVec);

      (timeU as unknown as { value: number }).value = elapsed;
      (dtU as unknown as { value: number }).value = deltaSeconds;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      (breathMotionU as unknown as { value: number }).value = breathMotion;
      (breathFlowU as unknown as { value: number }).value = breathFlow;

      // Subtle lift with the breath; scene otherwise holds still.
      camera.position.y = CAM_Y + breathEaseJS * 0.3;
      camera.lookAt(0, LOOK_Y + breathEaseJS * 0.15, LOOK_Z);

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Moonrise",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(skyMesh, waterMesh);
      skyGeometry.dispose();
      skyMaterial.dispose();
      waterGeometry.dispose();
      waterMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
