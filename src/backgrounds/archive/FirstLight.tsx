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
  PI,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  normalize,
  pow,
  sin,
  smoothstep,
  sqrt,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";
import { filmicFinish } from "./finish";

// Physically-grounded dawn: a single-scatter Rayleigh/Mie march through a
// spherical atmosphere shell, sun easing across the horizon with the breath.
// Units are km and km⁻¹ throughout the scattering math.

// ── Atmosphere shell (physical constants) ────────────────────────────────
const EARTH_RADIUS_KM = 6371.0;
const ATMOSPHERE_RADIUS_KM = 6471.0;
const RAYLEIGH_SCALE_HEIGHT_KM = 8.0;
const MIE_SCALE_HEIGHT_KM = 1.2;
const CAMERA_ALTITUDE_KM = 0.2;
const RAYLEIGH_STRENGTH = 2.87;
const TURBIDITY = 2.4;
const MIE_EXTINCTION_FACTOR = 1.1;
const MIE_G = 0.78;
const MIE_STRENGTH_BASE = 0.75;
const MIE_STRENGTH_BREATH_GAIN = 0.2;
const SUN_INTENSITY = 14.0;
const SUN_DISC_SIZE = 0.0006;

// ── March budget ─────────────────────────────────────────────────────────
const VIEW_MARCH_STEPS = 12;
const SUN_MARCH_STEPS = 3;
// Clamp sun-path sample altitude so underground rays saturate to opaque
// without overflowing exp().
const SUN_PATH_MIN_ALTITUDE_KM = -12.0;

// ── Framing ──────────────────────────────────────────────────────────────
const VIEW_FOV_SCALE = 0.62;
// Horizon sits 35% up from the bottom of the frame.
const HORIZON_SCREEN_BIAS = 0.3;
const HORIZON_RAY_CLAMP = 0.0015;

// ── Breath → dawn mapping ────────────────────────────────────────────────
const SUN_ELEVATION_EXHALED_RAD = (-1.5 * Math.PI) / 180;
const SUN_ELEVATION_INHALED_RAD = (4.0 * Math.PI) / 180;
const EXPOSURE_BASE = 1.05;
const EXPOSURE_BREATH_GAIN = 0.18;
const BREATH_RESPONSE_RATE = 1.9;
const AUTONOMOUS_BREATH_PERIOD_S = 45.0;

// ── Cirrus deck ──────────────────────────────────────────────────────────
const CIRRUS_ALTITUDE_A_KM = 6.5;
const CIRRUS_ALTITUDE_B_KM = 9.5;
const CIRRUS_SCALE_A_KM = 30.0;
const CIRRUS_SCALE_B_KM = 64.0;
const CIRRUS_STREAK_STRETCH = 2.6;
const CIRRUS_COVER_THRESHOLD_A = 0.52;
const CIRRUS_COVER_THRESHOLD_B = 0.56;
const CIRRUS_STRENGTH_A = 1.1;
const CIRRUS_STRENGTH_B = 0.8;
const CIRRUS_HORIZON_FADE = 0.12;
const CIRRUS_G = 0.55;
const CIRRUS_ISOTROPIC_LIGHT = 0.035;
const CIRRUS_FORWARD_GAIN = 0.12;
const CIRRUS_AMBIENT_GAIN = 0.42;
const CIRRUS_ROT_COS = Math.cos(0.55);
const CIRRUS_ROT_SIN = Math.sin(0.55);

// ── Stars ────────────────────────────────────────────────────────────────
const STAR_GRID_SCALE = 22.0;
const STAR_PROJECTION_BIAS = 0.35;
const STAR_CORE_RADIUS = 0.055;
const STAR_INTENSITY = 0.55;
const STAR_TWINKLE_SPEED = 1.4;
const STAR_ZENITH_START = 0.25;
const STAR_ZENITH_END = 0.55;
const STAR_LUM_FADE_LO = 0.002;
const STAR_LUM_FADE_HI = 0.02;

// ── Sea band / tone map ──────────────────────────────────────────────────
const SEA_GLOW_FALLOFF = 22.0;
const SEA_REFLECTANCE = 0.45;
const SEA_HORIZON_SOFTNESS = 0.004;
const TONEMAP_GAMMA = 0.9;

const CAM_RADIUS_KM = EARTH_RADIUS_KM + CAMERA_ALTITUDE_KM;
// 4c of the atmosphere-exit quadratic |cam + t·rd|² = R²; negative (inside shell).
const ATMO_QUADRATIC_4C =
  4.0 * (CAM_RADIUS_KM * CAM_RADIUS_KM - ATMOSPHERE_RADIUS_KM * ATMOSPHERE_RADIUS_KM);

const CAM_POS = vec3(0.0, CAM_RADIUS_KM, 0.0);
// Rayleigh sea-level scattering coefficients (km⁻¹), λ⁻⁴, density-scaled.
const BETA_R = vec3(
  5.802e-3 * RAYLEIGH_STRENGTH,
  13.558e-3 * RAYLEIGH_STRENGTH,
  33.1e-3 * RAYLEIGH_STRENGTH,
);
// Mie base scattering magnitude (km⁻¹), turbidity-scaled.
const BETA_M_KM = 21.0e-3 * TURBIDITY;

const NIGHT_FLOOR = vec3(0.0012, 0.0022, 0.0045);
const SEA_DEEP = vec3(0.0012, 0.0026, 0.0045);
const SUN_TINT = vec3(1.0, 0.95, 0.85);
const CIRRUS_TINT = vec3(1.0, 0.96, 0.9);
const STAR_TINT = vec3(0.82, 0.89, 1.0);
const LUMA = vec3(0.299, 0.587, 0.114);
const CIRRUS_DRIFT_A = vec2(0.0016, 0.0005);
const CIRRUS_DRIFT_B = vec2(-0.0007, 0.0011);

const clampNumber = (value: number, minValue: number, maxValue: number) =>
  Math.max(minValue, Math.min(maxValue, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

const hash21 = Fn(([p]: [TSLNode]) => {
  return fract(sin(p.x.mul(127.1).add(p.y.mul(311.7))).mul(43758.5453));
});

const smoothNoise = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(hash21(i), hash21(i.add(vec2(1.0, 0.0))), u.x),
    mix(hash21(i.add(vec2(0.0, 1.0))), hash21(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

const fbm3 = Fn(([pIn]: [TSLNode]) => {
  let p: TSLNode = pIn;
  let total: TSLNode = float(0);
  let amp = 0.55;

  total = total.add(smoothNoise(p).mul(amp));
  p = vec2(
    p.x.mul(1.86).add(p.y.mul(0.62)),
    p.x.mul(-0.62).add(p.y.mul(1.86)),
  ).add(vec2(11.3, 5.9));
  amp *= 0.52;

  total = total.add(smoothNoise(p).mul(amp));
  p = vec2(
    p.x.mul(1.7).add(p.y.mul(0.54)),
    p.x.mul(-0.54).add(p.y.mul(1.7)),
  ).add(vec2(23.9, 17.2));
  amp *= 0.52;

  return total.add(smoothNoise(p).mul(amp));
});

const toneMap = Fn(([color]: [TSLNode]) => {
  const v = vec3(
    color.x.mul(0.59719).add(color.y.mul(0.176)).add(color.z.mul(0.0284)),
    color.x.mul(0.35458).add(color.y.mul(0.90834)).add(color.z.mul(0.13383)),
    color.x.mul(0.04823).add(color.y.mul(0.01566)).add(color.z.mul(0.83777)),
  );
  const a = v.mul(v.add(0.0245786)).sub(0.000090537);
  const b = v.mul(v.mul(0.983729).add(0.432951)).add(0.238081);
  const mapped = a.div(b);

  return vec3(
    mapped.x
      .mul(1.60475)
      .add(mapped.y.mul(-0.10208))
      .add(mapped.z.mul(-0.00327)),
    mapped.x
      .mul(-0.53108)
      .add(mapped.y.mul(1.10813))
      .add(mapped.z.mul(-0.07276)),
    mapped.x
      .mul(-0.07367)
      .add(mapped.y.mul(-0.00605))
      .add(mapped.z.mul(1.07602)),
  );
});

// Cornette-Shanks phase; the base floor guards the g → 1, view → sun spike.
const csPhase = Fn(([cosA, g]: [TSLNode, TSLNode]) => {
  const g2 = g.mul(g);
  const base = max(
    float(1.0).add(g2).sub(g.mul(cosA).mul(2.0)),
    float(0.001),
  );
  return float(3.0)
    .mul(float(1.0).sub(g2))
    .div(float(8.0).mul(PI).mul(float(2.0).add(g2)))
    .mul(float(1.0).add(cosA.mul(cosA)))
    .div(base.mul(sqrt(base)));
});

// Sun-path optical depths (Rayleigh in .x, Mie in .y) from `p` to the top of
// the atmosphere: a 3-sample quadratic-biased inner march of the exponential
// densities replaces the baked transmittance LUT of the source material.
const sunOpticalDepth = Fn(([p, sunDir]: [TSLNode, TSLNode]) => {
  const b = dot(p, sunDir);
  const tExit = b
    .negate()
    .add(
      sqrt(
        max(
          b
            .mul(b)
            .sub(dot(p, p).sub(ATMOSPHERE_RADIUS_KM * ATMOSPHERE_RADIUS_KM)),
          float(0.0),
        ),
      ),
    );
  const dtCoef = tExit.mul(2.0 / SUN_MARCH_STEPS);
  const depths = vec2(0.0, 0.0).toVar();

  Loop(SUN_MARCH_STEPS, ({ i }: { i: TSLNode }) => {
    const u = float(i).add(0.5).div(SUN_MARCH_STEPS);
    const t = u.mul(u).mul(tExit);
    const dtSun = u.mul(dtCoef);
    const h = max(
      length(p.add(sunDir.mul(t))).sub(EARTH_RADIUS_KM),
      float(SUN_PATH_MIN_ALTITUDE_KM),
    );
    depths.assign(
      depths.add(
        vec2(
          exp(h.negate().div(RAYLEIGH_SCALE_HEIGHT_KM)).mul(dtSun),
          exp(h.negate().div(MIE_SCALE_HEIGHT_KM)).mul(dtSun),
        ),
      ),
    );
  });

  return depths;
});

const sunTransmittance = Fn(([p, sunDir]: [TSLNode, TSLNode]) => {
  const depths = sunOpticalDepth(p, sunDir);
  const tau = BETA_R.mul(depths.x).add(
    depths.y.mul(BETA_M_KM * MIE_EXTINCTION_FACTOR),
  );
  return exp(tau.negate());
});

// Hash-cell starfield on a zenith-facing gnomonic projection; one candidate
// star per cell, sparsely populated, gently twinkling.
const starField = Fn(([dir, timeNode]: [TSLNode, TSLNode]) => {
  const proj = vec2(dir.x, dir.z)
    .div(max(dir.y.add(STAR_PROJECTION_BIAS), float(0.15)))
    .mul(STAR_GRID_SCALE);
  const cell = floor(proj);
  const f = fract(proj);
  const h1 = hash21(cell);
  const h2 = hash21(cell.add(vec2(41.7, 17.3)));
  const h3 = hash21(cell.add(vec2(9.2, 63.1)));
  const starPos = vec2(h1.mul(0.6).add(0.2), h2.mul(0.6).add(0.2));
  const core = smoothstep(
    float(0.0),
    float(STAR_CORE_RADIUS),
    length(f.sub(starPos)),
  ).oneMinus();
  const populated = smoothstep(float(0.78), float(0.95), h3);
  const twinkle = sin(timeNode.mul(STAR_TWINKLE_SPEED).add(h1.mul(31.4)))
    .mul(0.3)
    .add(0.7);
  return core.mul(core).mul(populated).mul(twinkle);
});

export const FirstLight = ({
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
    const resolutionU = uniform(vec2(width, height));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    const computeColor = Fn(() => {
      const uvRaw = uv();
      const fragCoord = uvRaw.mul(resolutionU);
      const screen = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));
      // Breathing the dawn: exhaled blue hour → inhaled first light.
      const sunElevation = mix(
        float(SUN_ELEVATION_EXHALED_RAD),
        float(SUN_ELEVATION_INHALED_RAD),
        breathEase,
      );
      const sunDir = vec3(0.0, sin(sunElevation), cos(sunElevation));
      const mieStrength = float(MIE_STRENGTH_BASE).mul(
        float(1.0).add(breathEase.mul(MIE_STRENGTH_BREATH_GAIN)),
      );
      const exposure = float(EXPOSURE_BASE).mul(
        float(1.0).add(breathEase.mul(EXPOSURE_BREATH_GAIN)),
      );

      // View ray toward the horizon, biased so ~35% of frame is below it.
      const rd = normalize(
        vec3(
          screen.x.mul(VIEW_FOV_SCALE),
          screen.y.add(HORIZON_SCREEN_BIAS).mul(VIEW_FOV_SCALE),
          float(1.0),
        ),
      );
      // Below-horizon rays march the horizon-grazing sky instead; the sea
      // band re-uses that radiance as its reflected glow.
      const rdSky = normalize(
        vec3(rd.x, max(rd.y, float(HORIZON_RAY_CLAMP)), rd.z),
      );

      // Atmosphere shell exit distance along the view ray.
      const bV = rdSky.y.mul(2.0 * CAM_RADIUS_KM);
      const tAtmo = bV
        .negate()
        .add(sqrt(max(bV.mul(bV).sub(ATMO_QUADRATIC_4C), float(0.0))))
        .div(2.0);

      // Single-scatter view march, quadratic-biased toward the camera:
      // t = u²·tAtmo, dt = 2u·tAtmo/N, so Σdt = tAtmo.
      const dtCoef = tAtmo.mul(2.0 / VIEW_MARCH_STEPS);
      const accumR = vec3(0.0, 0.0, 0.0).toVar();
      const accumM = vec3(0.0, 0.0, 0.0).toVar();
      const optR = float(0.0).toVar();
      const optM = float(0.0).toVar();

      Loop(VIEW_MARCH_STEPS, ({ i }: { i: TSLNode }) => {
        const u = float(i).add(0.5).div(VIEW_MARCH_STEPS);
        const t = u.mul(u).mul(tAtmo);
        const dtView = u.mul(dtCoef);
        const p = CAM_POS.add(rdSky.mul(t));
        const h = max(length(p).sub(EARTH_RADIUS_KM), float(0.0));
        const densR = exp(h.negate().div(RAYLEIGH_SCALE_HEIGHT_KM));
        const densM = exp(h.negate().div(MIE_SCALE_HEIGHT_KM));
        optR.addAssign(densR.mul(dtView));
        optM.addAssign(densM.mul(dtView));

        const tauView = BETA_R.mul(optR).add(
          optM.mul(BETA_M_KM * MIE_EXTINCTION_FACTOR),
        );
        const tView = exp(tauView.negate());
        const tSun = sunTransmittance(p, sunDir);
        const transmittance = tView.mul(tSun);
        accumR.addAssign(transmittance.mul(densR).mul(dtView));
        accumM.addAssign(transmittance.mul(densM).mul(dtView));
      });

      const cosTheta = dot(rdSky, sunDir);
      // Rayleigh phase (3/16π)(1 + cos²θ).
      const phaseR = float(1.0)
        .add(cosTheta.mul(cosTheta))
        .mul(3.0 / (16.0 * Math.PI));
      const phaseM = csPhase(cosTheta, float(MIE_G));
      const sky = BETA_R.mul(accumR)
        .mul(phaseR)
        .add(accumM.mul(BETA_M_KM).mul(phaseM).mul(mieStrength))
        .mul(SUN_INTENSITY)
        .add(NIGHT_FLOOR);

      // Sun disc, reddened and dimmed by the same transmittance estimate.
      const sunTintCam = sunTransmittance(CAM_POS, sunDir);
      const sunDot = dot(rd, sunDir);
      const disc = smoothstep(
        float(1.0 - SUN_DISC_SIZE),
        float(1.0 - SUN_DISC_SIZE * 0.5),
        sunDot,
      );
      const sunDisc = SUN_TINT.mul(sunTintCam).mul(disc).mul(SUN_INTENSITY);

      // Last stars at the zenith, gated by sky darkness and the breath.
      const skyLum = dot(sky, LUMA);
      const zenithGate = smoothstep(
        float(STAR_ZENITH_START),
        float(STAR_ZENITH_END),
        rd.y,
      );
      const darknessGate = smoothstep(
        float(STAR_LUM_FADE_LO),
        float(STAR_LUM_FADE_HI),
        skyLum,
      ).oneMinus();
      const breathGate = smoothstep(
        float(0.15),
        float(0.55),
        breathEase,
      ).oneMinus();
      const stars = starField(rd, timeU)
        .mul(zenithGate)
        .mul(darknessGate)
        .mul(breathGate)
        .mul(STAR_INTENSITY);
      const starsColor = STAR_TINT.mul(stars);

      // Two thin cirrus decks: flat high-shell projection, drifting fbm,
      // Beer-Lambert combined and lit by the camera's sun transmittance.
      const tCirrusA = float(CIRRUS_ALTITUDE_A_KM - CAMERA_ALTITUDE_KM).div(
        max(rd.y, float(0.02)),
      );
      const posA = vec2(rd.x, rd.z).mul(tCirrusA).div(CIRRUS_SCALE_A_KM);
      const uvA = vec2(posA.x, posA.y.mul(CIRRUS_STREAK_STRETCH)).add(
        CIRRUS_DRIFT_A.mul(timeU),
      );
      const covA = smoothstep(
        float(CIRRUS_COVER_THRESHOLD_A),
        float(CIRRUS_COVER_THRESHOLD_A + 0.3),
        fbm3(uvA),
      );

      const tCirrusB = float(CIRRUS_ALTITUDE_B_KM - CAMERA_ALTITUDE_KM).div(
        max(rd.y, float(0.02)),
      );
      const posB = vec2(rd.x, rd.z).mul(tCirrusB).div(CIRRUS_SCALE_B_KM);
      const rotB = vec2(
        posB.x.mul(CIRRUS_ROT_COS).sub(posB.y.mul(CIRRUS_ROT_SIN)),
        posB.x.mul(CIRRUS_ROT_SIN).add(posB.y.mul(CIRRUS_ROT_COS)),
      );
      const uvB = vec2(rotB.x, rotB.y.mul(CIRRUS_STREAK_STRETCH))
        .add(CIRRUS_DRIFT_B.mul(timeU))
        .add(vec2(7.7, 2.9));
      const covB = smoothstep(
        float(CIRRUS_COVER_THRESHOLD_B),
        float(CIRRUS_COVER_THRESHOLD_B + 0.34),
        fbm3(uvB),
      );

      const cirrusDepth = covA
        .mul(CIRRUS_STRENGTH_A)
        .add(covB.mul(CIRRUS_STRENGTH_B));
      const horizonFade = smoothstep(
        float(0.015),
        float(CIRRUS_HORIZON_FADE),
        rd.y,
      );
      const cirrusCoverage = float(1.0)
        .sub(exp(cirrusDepth.negate()))
        .mul(horizonFade);
      const cirrusPhase = csPhase(sunDot, float(CIRRUS_G));
      const cirrusRadiance = CIRRUS_TINT.mul(sunTintCam)
        .mul(float(CIRRUS_ISOTROPIC_LIGHT).add(cirrusPhase.mul(CIRRUS_FORWARD_GAIN)))
        .mul(SUN_INTENSITY)
        .add(sky.mul(CIRRUS_AMBIENT_GAIN));

      const skyTotal = sky.add(sunDisc).add(starsColor);
      const withCirrus = mix(skyTotal, cirrusRadiance, cirrusCoverage);

      // Dark sea silhouette carrying the atmosphere's own reflected glow.
      const seaBlend = smoothstep(
        float(-SEA_HORIZON_SOFTNESS),
        float(SEA_HORIZON_SOFTNESS),
        rd.y,
      ).oneMinus();
      const seaGlow = exp(rd.y.mul(SEA_GLOW_FALLOFF));
      const sea = sky.mul(seaGlow).mul(SEA_REFLECTANCE).add(SEA_DEEP);
      const hdr = mix(withCirrus, sea, seaBlend);

      const mapped = pow(
        max(toneMap(hdr.mul(exposure)), vec3(0.0, 0.0, 0.0)),
        vec3(TONEMAP_GAMMA),
      );
      // Shared 16mm tail: desaturate, lift, cap, grain, vignette, grayscale.
      return filmicFinish(mapped, timeU, fragCoord, grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

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
      // Without a breath source the dawn breathes on its own (~45 s cycle).
      const autonomousBreath =
        0.5 -
        0.5 * Math.cos((2 * Math.PI * elapsed) / AUTONOMOUS_BREATH_PERIOD_S);
      const targetBreath = clampNumber(
        breathRef.current?.value ?? autonomousBreath,
        0.0,
        1.0,
      );
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        deltaSeconds,
      );
      previousElapsed = elapsed;

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value = smoothedBreath;
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "FirstLight",
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
