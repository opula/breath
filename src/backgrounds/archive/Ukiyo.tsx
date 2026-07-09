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
  abs,
  dot,
  max,
  clamp,
  exp,
  normalize,
  uniform,
  positionLocal,
  cameraPosition,
  screenUV,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  VIEW
// ────────────────────────────────────────────────────────────

const CAMERA_FOV = 55;
const CAM_HEIGHT = 8.2;
const CAM_Z = 340;
const CAM_DRIFT_X = 1.0;
const CAM_BOB_PRIMARY = 0.22;
const CAM_BOB_SECONDARY = 0.12;
const CAM_BREATH_LIFT = 0.5;
const LOOK_Y = -9;
const LOOK_Z = -620;
const LOOK_DRIFT_X = 3.0;
const LOOK_BREATH_LIFT = 0.7;

// ────────────────────────────────────────────────────────────
//  WATER FIELD (calm 3-wave Gerstner)
// ────────────────────────────────────────────────────────────

const WATER_SIZE = 900;
const WATER_SEGMENTS = 120;
const SKY_RADIUS = 1000;
const GRAVITY = 9.81;
// 0 rad = waves travelling toward the camera (+z).
const WIND_HEADING = 0.18;

const WAVE_SPECS = [
  { wavelength: 130, amplitude: 1.9, steepness: 0.55, headingOffset: 0.0, phaseOffset: 0.0 },
  { wavelength: 72, amplitude: 1.0, steepness: 0.5, headingOffset: 0.4, phaseOffset: 2.1 },
  { wavelength: 42, amplitude: 0.5, steepness: 0.42, headingOffset: -0.33, phaseOffset: 4.4 },
];

// Deep-water dispersion: ω = √(g·k). ΣQ·k·A stays well under 1.
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

// ────────────────────────────────────────────────────────────
//  LOOK — muted dusk woodblock palette (linear; renderer sRGB-encodes)
// ────────────────────────────────────────────────────────────

// Sky bands, horizon → zenith.
const SKY_AMBER = vec3(0.38, 0.24, 0.125);
const SKY_AMBER_WARM = vec3(0.45, 0.265, 0.115);
const SKY_SALMON = vec3(0.255, 0.135, 0.115);
const SKY_PLUM = vec3(0.115, 0.075, 0.125);
const SKY_ZENITH = vec3(0.038, 0.045, 0.085);
const BAND_SOFT = 0.0075; // half-width → ~0.015 total edge
const AMBER_TOP = 0.05;
const AMBER_WIDEN = 0.014; // breath widens the amber band
const SALMON_TOP = 0.16;
const PLUM_TOP = 0.34;

// Sun disc + single halo ring.
const SUN_ELEV_BASE = 0.1;
const SUN_ELEV_LIFT = 0.025; // breath raises the sun slightly
const SUN_CREAM = vec3(0.92, 0.86, 0.74);
const SUN_RADIUS = 0.055;
const SUN_EDGE = 0.002;
const HALO_COLOR = vec3(0.5, 0.3, 0.16);
const HALO_RADIUS = 0.1;
const HALO_HALF_WIDTH = 0.008;
const HALO_EDGE = 0.004;
const HALO_STRENGTH = 0.4;

// Flat cutout clouds.
const CLOUD_SCALE = 0.9;
const CLOUD_DRIFT = vec2(0.004, -0.0026);
const CLOUD_THRESHOLD = 0.56;
const CLOUD_EDGE = 0.008;
const CLOUD_SHADE_OFFSET = 0.14;
const CLOUD_LIT = vec3(0.3, 0.225, 0.22);
const CLOUD_SHADE = vec3(0.165, 0.125, 0.155);

// Water toon bands.
const LIGHT_ELEVATION = 0.305;
const LIGHT_DIR = vec3(
  0,
  Math.sin(LIGHT_ELEVATION),
  -Math.cos(LIGHT_ELEVATION),
);
const WATER_DEEP = vec3(0.035, 0.09, 0.1);
const WATER_MID = vec3(0.075, 0.16, 0.165);
const WATER_LIGHT = vec3(0.13, 0.235, 0.225);
const BAND_LOW = 0.2;
const BAND_HIGH = 0.4;
const BAND_EDGE = 0.025;

// Crest accent band.
const CREST_ACCENT = vec3(0.185, 0.3, 0.27);
const CREST_HEIGHT = 1.05;
const CREST_EDGE = 0.05;

// Foam caps with lace gap.
const FOAM_CREAM = vec3(0.87, 0.85, 0.77);
const FOAM_SCALE = 0.045;
const FOAM_DRIFT_WORLD = 7.0;
const FOAM_HEIGHT_GAIN = 0.3;
const FOAM_NOISE_GAIN = 0.5;
const FOAM_THRESHOLD = 0.84;
const FOAM_BREATH_LOOSEN = 0.07;
const FOAM_EDGE = 0.01; // half-width → ~0.02 total
const FOAM_LACE_OFFSET = 0.05;

// Sun reflection ribbon.
const RIBBON_CREAM = vec3(0.8, 0.66, 0.47);
const RIBBON_INV_TWO_SIGMA_SQ = 1 / 128; // σ ≈ 8 world units
const RIBBON_WOBBLE = 6.0;
const RIBBON_OPACITY = 0.9;

// Crest ink rim.
const RIM_STRENGTH = 0.38;

// Horizon fog + paper.
const FOG_START = 360;
const FOG_END = 740;
const PAPER_SCALE = 0.35;
const PAPER_AMOUNT = 0.016; // ±0.008, static

// ────────────────────────────────────────────────────────────
//  BREATH
// ────────────────────────────────────────────────────────────

const SWELL_BASE = 0.85;
const SWELL_RANGE = 0.17; // ×1.2 amplitude at full inhale
const BREATH_RESPONSE_RATE = 4.4;
const AMBIENT_DRIFT_RATE = 0.4; // used when no breath SharedValue

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ────────────────────────────────────────────────────────────
//  Noise helpers (2D value noise, [0, 1] range)
// ────────────────────────────────────────────────────────────

const valueHash = Fn(([p]: [TSLNode]) => {
  return fract(sin(p.x.mul(127.1).add(p.y.mul(311.7))).mul(43758.5453));
});

const valueNoise = Fn(([p]: [TSLNode]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  return mix(
    mix(valueHash(i), valueHash(i.add(vec2(1.0, 0.0))), u.x),
    mix(valueHash(i.add(vec2(0.0, 1.0))), valueHash(i.add(vec2(1.0, 1.0))), u.x),
    u.y,
  );
});

// Two octaves, ~[0, 0.93].
const valueFbm2 = Fn(([pIn]: [TSLNode]) => {
  const a = valueNoise(pIn);
  const p2 = vec2(
    pIn.x.mul(1.9).add(pIn.y.mul(0.6)),
    pIn.x.mul(-0.6).add(pIn.y.mul(1.9)),
  ).add(vec2(13.5, 7.2));
  return a.mul(0.62).add(valueNoise(p2).mul(0.31));
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

// ────────────────────────────────────────────────────────────
//  Shared tail: static paper hint + grayscale. No tone map, no gamma.
// ────────────────────────────────────────────────────────────

const finalizeFlat = Fn(
  ([color, paperPos, grayscale]: [TSLNode, TSLNode, TSLNode]) => {
    const paper = valueNoise(paperPos.mul(PAPER_SCALE))
      .sub(0.5)
      .mul(PAPER_AMOUNT);
    const c = clamp(color.add(vec3(paper, paper, paper)), 0.0, 1.0);
    const luma = dot(c, vec3(0.299, 0.587, 0.114));
    return mix(c, vec3(luma, luma, luma), grayscale);
  },
);

export const Ukiyo = ({
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
    const resolutionU = uniform(vec2(width, height));

    const breathEase = breathU
      .mul(breathU)
      .mul(float(3.0).sub(breathU.mul(2.0)));
    const swell = float(SWELL_BASE).add(breathEase.mul(SWELL_RANGE));
    const paperPos = screenUV.mul(resolutionU);
    // Horizon amber warms at full inhale; the water fog reuses it so the
    // far edge always dissolves into the same flat band.
    const amber = mix(SKY_AMBER, SKY_AMBER_WARM, breathEase);

    // ── Water ──────────────────────────────────────────────

    const waterColorNode = Fn(() => {
      const p = positionLocal.xz;

      const field = gerstnerField(p, timeU, swell);
      const waveHeight = field.w;
      const normal = normalize(
        vec3(field.x, float(1.0).sub(field.y), field.z),
      );

      const worldPos = vec3(p.x, waveHeight, p.y);
      const toCamera = cameraPosition.sub(worldPos);
      const dist = length(toCamera);
      const viewDir = toCamera.div(max(dist, 0.001));

      // Three flat lighting bands: posterized lambert against a fixed sun.
      const lambert = max(dot(normal, LIGHT_DIR), 0.0);
      const band1 = smoothstep(
        BAND_LOW - BAND_EDGE,
        BAND_LOW + BAND_EDGE,
        lambert,
      );
      const band2 = smoothstep(
        BAND_HIGH - BAND_EDGE,
        BAND_HIGH + BAND_EDGE,
        lambert,
      );
      const color = mix(WATER_DEEP, WATER_MID, band1).toVar();
      color.assign(mix(color, WATER_LIGHT, band2));

      // Flat accent band near crests.
      const crestBand = smoothstep(
        CREST_HEIGHT - CREST_EDGE,
        CREST_HEIGHT + CREST_EDGE,
        waveHeight,
      );
      color.assign(mix(color, CREST_ACCENT, crestBand));

      // Ink rim: grazing normals on high crests darken to a drawn line.
      const ndv = abs(dot(normal, viewDir));
      const rim = float(1.0)
        .sub(smoothstep(0.05, 0.16, ndv))
        .mul(smoothstep(0.85, 1.35, waveHeight))
        .mul(float(1.0).sub(smoothstep(220.0, 420.0, dist)));
      color.assign(color.mul(float(1.0).sub(rim.mul(RIM_STRENGTH))));

      // Sun reflection: wobbled Gaussian corridor thresholded to a flat
      // ribbon, chopped into dashes along z. No specular.
      const wobble = valueNoise(
        vec2(p.y.mul(0.02), timeU.mul(0.05)),
      )
        .sub(0.5)
        .mul(RIBBON_WOBBLE);
      const xw = p.x.add(wobble);
      const corridor = exp(
        xw.mul(xw).negate().mul(RIBBON_INV_TWO_SIGMA_SQ),
      );
      const zone = float(1.0).sub(smoothstep(-140.0, 20.0, p.y));
      const dashes = smoothstep(
        0.4,
        0.46,
        valueNoise(vec2(p.y.mul(0.011).add(timeU.mul(0.02)), 4.7)),
      );
      const ribbon = smoothstep(0.3, 0.4, corridor.mul(zone)).mul(dashes);
      color.assign(mix(color, RIBBON_CREAM, ribbon.mul(RIBBON_OPACITY)));

      // Foam caps: height + drifting noise thresholded into crisp cream,
      // with a thin lace gap just inside the edge.
      const foamNoise = valueFbm2(
        p
          .mul(FOAM_SCALE)
          .sub(
            vec2(
              timeU.mul(Math.sin(WIND_HEADING) * FOAM_DRIFT_WORLD * FOAM_SCALE),
              timeU.mul(Math.cos(WIND_HEADING) * FOAM_DRIFT_WORLD * FOAM_SCALE),
            ),
          ),
      );
      const foamField = waveHeight
        .mul(FOAM_HEIGHT_GAIN)
        .add(foamNoise.mul(FOAM_NOISE_GAIN));
      const foamThresh = float(FOAM_THRESHOLD).sub(
        breathEase.mul(FOAM_BREATH_LOOSEN),
      );
      const foamShape = smoothstep(
        foamThresh.sub(FOAM_EDGE),
        foamThresh.add(FOAM_EDGE),
        foamField,
      );
      const laceCenter = foamThresh.add(FOAM_LACE_OFFSET);
      const lace = smoothstep(
        laceCenter.sub(0.014),
        laceCenter.sub(0.004),
        foamField,
      ).mul(
        float(1.0).sub(
          smoothstep(laceCenter.add(0.004), laceCenter.add(0.014), foamField),
        ),
      );
      const foamMask = foamShape.mul(float(1.0).sub(lace.mul(0.85)));
      color.assign(mix(color, FOAM_CREAM, foamMask));

      // Dissolve the far edge into the flat horizon amber.
      const fogged = mix(color, amber, smoothstep(FOG_START, FOG_END, dist));

      return finalizeFlat(fogged, paperPos, grayscaleU);
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
    waterMaterial.positionNode = positionLocal.add(displaced);
    waterMaterial.colorNode = waterColorNode;

    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.frustumCulled = false;
    scene.add(water);

    // ── Sky ────────────────────────────────────────────────

    const skyColorNode = Fn(() => {
      const dir = normalize(positionLocal.sub(cameraPosition));
      const y = dir.y;

      // Four flat bands with narrow painted edges, horizon → zenith.
      const amberTop = float(AMBER_TOP).add(breathEase.mul(AMBER_WIDEN));
      const color = amber.toVar();
      color.assign(
        mix(
          color,
          SKY_SALMON,
          smoothstep(amberTop.sub(BAND_SOFT), amberTop.add(BAND_SOFT), y),
        ),
      );
      color.assign(
        mix(
          color,
          SKY_PLUM,
          smoothstep(SALMON_TOP - BAND_SOFT, SALMON_TOP + BAND_SOFT, y),
        ),
      );
      color.assign(
        mix(
          color,
          SKY_ZENITH,
          smoothstep(PLUM_TOP - BAND_SOFT, PLUM_TOP + BAND_SOFT, y),
        ),
      );
      // Slight dim below the horizon so the fogged water edge stays darkest.
      color.assign(
        color.mul(float(1.0).sub(smoothstep(0.0, 0.2, y.negate()).mul(0.35))),
      );

      // Sun disc + one concentric halo ring; breath lifts the sun.
      const elev = float(SUN_ELEV_BASE).add(breathEase.mul(SUN_ELEV_LIFT));
      const sunDir = vec3(float(0.0), sin(elev), cos(elev).negate());
      const sunDist = length(dir.sub(sunDir));
      const ring = smoothstep(
        HALO_RADIUS - HALO_HALF_WIDTH - HALO_EDGE,
        HALO_RADIUS - HALO_HALF_WIDTH,
        sunDist,
      ).mul(
        float(1.0).sub(
          smoothstep(
            HALO_RADIUS + HALO_HALF_WIDTH,
            HALO_RADIUS + HALO_HALF_WIDTH + HALO_EDGE,
            sunDist,
          ),
        ),
      );
      color.assign(mix(color, HALO_COLOR, ring.mul(HALO_STRENGTH)));
      const disc = float(1.0).sub(
        smoothstep(SUN_RADIUS - SUN_EDGE, SUN_RADIUS + SUN_EDGE, sunDist),
      );
      color.assign(mix(color, SUN_CREAM, disc));

      // Flat cutout clouds: thresholded 2-octave noise, two tones,
      // drifting very slowly. They may pass in front of the sun.
      const altitude = max(y, 0.02).add(0.08);
      const proj = vec2(dir.x, dir.z).div(altitude).mul(CLOUD_SCALE);
      const drifted = proj.add(CLOUD_DRIFT.mul(timeU));
      const cloudBand = smoothstep(0.07, 0.11, y).mul(
        float(1.0).sub(smoothstep(0.3, 0.4, y)),
      );
      const cloudField = valueFbm2(drifted).mul(cloudBand);
      const cloudMask = smoothstep(
        CLOUD_THRESHOLD - CLOUD_EDGE,
        CLOUD_THRESHOLD + CLOUD_EDGE,
        cloudField,
      );
      // Sample higher in the sky: where cloud continues above, shade the
      // underside for the classic two-tone woodblock cloud.
      const shadeField = valueFbm2(
        drifted.add(vec2(0.0, CLOUD_SHADE_OFFSET)),
      ).mul(cloudBand);
      const shadeMask = smoothstep(
        CLOUD_THRESHOLD + 0.02 - CLOUD_EDGE,
        CLOUD_THRESHOLD + 0.02 + CLOUD_EDGE,
        shadeField,
      ).mul(cloudMask);
      color.assign(mix(color, CLOUD_LIT, cloudMask));
      color.assign(mix(color, CLOUD_SHADE, shadeMask));

      return finalizeFlat(color, paperPos, grayscaleU);
    })();

    const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 12);
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

    function animate() {
      if (disposed) {
        return;
      }
      const elapsed = clock.getElapsedTime();
      const deltaSeconds =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      const targetBreath = breathRef.current
        ? breathRef.current.value
        : 0.4 + 0.25 * Math.sin(elapsed * AMBIENT_DRIFT_RATE);
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
      label: "Ukiyo",
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
