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
  exp,
  fract,
  floor,
  mix,
  smoothstep,
  dot,
  length,
  normalize,
  max,
  clamp,
  abs,
  pow,
  uv,
  uniform,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

// --- View ---
// Slightly telephoto ray fan keeps the drift calm; the frame offset
// pushes the corridor's dark vanishing point off exact screen center
// so the breath ring never sits on the composition's focal anchor.
const FOCAL_SCALE = 0.85;
const FRAME_OFFSET_X = 0.13;
const FRAME_OFFSET_Y = -0.09;

// --- March ---
const MAX_STEPS = 96;
const MAX_DIST = 34.0;
const STEP_SCALE = 0.5; // conservative: the sine warp steepens gradients
const MIN_STEP = 0.012;
const HIT_EPS = 0.009;
const START_T = 0.18;
const DITHER_STRENGTH = 0.3;

// --- Field (metaballs: two smin-blended animated sphere lattices) ---
const CELL_RADIUS = 0.78; // big gooey wax blobs
const RADIUS_B_RATIO = 0.55; // interstitial blobs are smaller
const SMIN_BLEND = 0.8; // very wide blend => wax merges and necks apart
const RADIUS_HASH_VAR = 0.25; // per-blob size spread (±)
// Smooth-carved clearance cylinder around the camera path so the drift
// axis is guaranteed an open matter-free corridor.
const TUNNEL_RADIUS = 0.55;
const TUNNEL_BLEND = 0.35;

// --- Fold (domain repetition — cells at half-integer lattice points,
// so the camera path at x=y=0 travels the corner gap between cells) ---
const CELL_X = 3.0;
const CELL_Y = 3.5;
const CELL_Z = 3.8;
// Lattice B interleaves between A cells so its blobs pass close enough
// to A's for the smin to merge them while staying clear of the corridor.
const LATTICE_B_SHIFT_X = 1.5;
const LATTICE_B_SHIFT_Y = 0.6;
const LATTICE_B_SHIFT_Z = 1.7;

// --- Lava motion (each cell's blob rises, sinks, wobbles, pulses on
// its own hashed cycle; neighbours merging and splitting via the smin
// is the metaball/lava-lamp behaviour) ---
const RISE_AMP = 0.85; // vertical travel of each blob within its cell
const RISE_SPEED_BASE = 0.1; // rad/s — full rise/sink cycle ≈ 1 min
const RISE_SPEED_VAR = 0.08; // per-blob spread so cycles never sync
const WOBBLE_AMP = 0.18; // small sideways sway while rising
const WOBBLE_SPEED = 0.07;
const PULSE_AMP = 0.06; // gentle radius pulsation
const PULSE_SPEED = 0.16;
const TAU = Math.PI * 2;

// --- Drift (constant, never breath-modulated) ---
const DRIFT_SPEED = 0.14; // ~18s per cell layer

// --- Breath (gains are total swing at full inhale / full motion) ---
const BREATH_RESPONSE_RATE = 4.6;
const BREATH_MOTION_GAIN = 3.2;
const BREATH_MOTION_ATTACK_RATE = 4.5;
const BREATH_MOTION_RELEASE_RATE = 1.9;
const BREATH_SWELL_GAIN = 0.1; // tissue plumps ~10% on inhale
const BREATH_LIFT_GAIN = 0.04; // palette luminance lifts a few %
const BREATH_PULSE_MOTION_GAIN = 0.6; // transitions quiver the wax pulse
const AMBIENT_BREATH_BASE = 0.4;
const AMBIENT_BREATH_AMP = 0.25;
const AMBIENT_BREATH_SPEED = 0.35;

// --- Look (3D lava lamp: glowing wax in dark liquid, lit from below) ---
// Wax glows from WITHIN: camera-facing surfaces are the hot core
// (facing^CORE_POWER), edges fall to deep red-violet. A vertical heat
// gradient warms low blobs toward ember and cools high ones toward
// magenta — the lamp's bulb is below the frame.
const LIQUID_TOP = vec3(0.006, 0.004, 0.02); // deep indigo liquid, top
const LIQUID_BOTTOM = vec3(0.028, 0.012, 0.05); // faint bulb glow, bottom
const WAX_EDGE = vec3(0.16, 0.05, 0.13); // blob edges, deep red-violet
const WAX_CORE = vec3(0.62, 0.24, 0.1); // molten core, ember orange
const WAX_HOT = vec3(0.78, 0.36, 0.12); // extra heat near the bottom
const WAX_COOL = vec3(0.34, 0.12, 0.3); // cooled wax near the top
const CORE_POWER = 1.6; // how tightly the glow hugs facing surfaces
const HEAT_LOW_Y = -6.0; // world y where the heat gradient saturates…
const HEAT_HIGH_Y = 4.0; //   …and where it has fully cooled
const HEAT_GAIN = 0.4;
const COOL_GAIN = 0.35;
const DIST_FADE = 0.12; // exp depth falloff: far wax sinks into liquid
const AO_STRENGTH = 0.4; // step-count darkening keeps crevice depth
const NORMAL_EPS = 0.02; // tetrahedral normal-estimate offset
const TONE_KNEE = 0.3; // gentle: palette is pre-capped well under 0.8
const CENTER_CALM_FLOOR = 0.78;
const CENTER_CALM_START = 0.12;
const CENTER_CALM_END = 0.55;

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// Interleaved Gradient Noise — temporal dither for anti-banding
const IGN = Fn(([p]: [TSLNode]) => {
  const magicXY = vec2(0.05224891, 0.00789319);
  const magicZ = float(47.8536137);
  return fract(magicZ.mul(fract(dot(p, magicXY))));
});

// Polynomial smooth-min: soft unions everywhere, nothing crunchy
const smin = Fn(([a, b, k]: [TSLNode, TSLNode, TSLNode]) => {
  const h = clamp(float(0.5).add(b.sub(a).mul(0.5).div(k)), 0.0, 1.0);
  return mix(b, a, h).sub(k.mul(h).mul(float(1.0).sub(h)));
});

// Three decorrelated hashes per lattice cell — each blob's rise phase,
// wobble phase, and size/pulse seed.
const cellHash = Fn(([id]: [TSLNode]) => {
  return fract(
    sin(dot(id, vec3(17.13, 31.7, 11.9))).mul(
      vec3(43758.55, 28001.3, 19349.7),
    ),
  );
});

export const Coral = ({
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
    const resolutionU = uniform(vec2(width, height));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));
    const breathMotionU = uniform(float(0));

    // Raymarcher must live inside Fn for Loop/If/Break/toVar/assign to attach.
    const computeColor = Fn(() => {
      const uvRaw = uv();
      const uvAdj = vec2(
        uvRaw.x.mul(2.0).sub(1.0).mul(aspectU),
        uvRaw.y.mul(2.0).sub(1.0),
      );

      const breathEase = breathU
        .mul(breathU)
        .mul(float(3.0).sub(breathU.mul(2.0)));

      // Breath channels — every gain subtle
      const cellRadius = float(CELL_RADIUS).mul(
        float(1.0).add(breathEase.mul(BREATH_SWELL_GAIN)),
      );
      const pulseAmp = float(PULSE_AMP).mul(
        float(1.0).add(breathMotionU.mul(BREATH_PULSE_MOTION_GAIN)),
      );

      // Screen center stays slightly calmer so the breath ring reads
      const centerCalm = mix(
        float(CENTER_CALM_FLOOR),
        float(1.0),
        smoothstep(
          float(CENTER_CALM_START),
          float(CENTER_CALM_END),
          length(uvAdj),
        ),
      );

      // Fixed camera; the field drifts past it along z. No rotation.
      const rd = normalize(
        vec3(
          uvAdj.x.mul(FOCAL_SCALE).add(FRAME_OFFSET_X),
          uvAdj.y.mul(FOCAL_SCALE).add(FRAME_OFFSET_Y),
          float(1.0),
        ),
      );
      const driftZ = timeU.mul(DRIFT_SPEED);

      // Temporal-dithered ray start (anti-banding)
      const fragCoord = uvRaw.mul(resolutionU);
      const noiseCoord = fragCoord.add(
        vec2(fract(timeU.mul(0.37)).mul(89.0), fract(timeU.mul(0.61)).mul(101.0)),
      );
      const dither = IGN(noiseCoord).mul(DITHER_STRENGTH);

      // The wax field, reused by the march loop and the post-hit normal
      // estimate. Each lattice cell holds one metaball on its own hashed
      // rise/wobble/pulse cycle; the wide smin merges neighbours as they
      // drift close and necks them apart as they separate — the
      // lava-lamp behaviour. Plain closures: each call instantiates the
      // subgraph (once in the loop + 4 normal taps).
      const blobLattice = (q: TSLNode, radiusScale: number): TSLNode => {
        const cellId = floor(
          vec3(q.x.div(CELL_X), q.y.div(CELL_Y), q.z.div(CELL_Z)),
        );
        const h = cellHash(cellId);
        const rise = sin(
          timeU
            .mul(float(RISE_SPEED_BASE).add(h.x.mul(RISE_SPEED_VAR)))
            .add(h.y.mul(TAU)),
        ).mul(RISE_AMP);
        const wobble = sin(timeU.mul(WOBBLE_SPEED).add(h.z.mul(TAU))).mul(
          WOBBLE_AMP,
        );
        const pulse = sin(timeU.mul(PULSE_SPEED).add(h.x.mul(TAU))).mul(
          pulseAmp,
        );
        const radius = cellRadius
          .mul(radiusScale)
          .mul(float(1.0).add(h.z.sub(0.5).mul(2.0 * RADIUS_HASH_VAR)))
          .mul(float(1.0).add(pulse));
        const local = vec3(
          q.x.sub(cellId.x.add(0.5).mul(CELL_X)).sub(wobble),
          q.y.sub(cellId.y.add(0.5).mul(CELL_Y)).sub(rise),
          q.z.sub(cellId.z.add(0.5).mul(CELL_Z)),
        );
        return length(local).sub(radius);
      };

      const fieldAt = (pp: TSLNode): TSLNode => {
        const dA = blobLattice(pp, 1.0);
        const dB = blobLattice(
          pp.add(
            vec3(LATTICE_B_SHIFT_X, LATTICE_B_SHIFT_Y, LATTICE_B_SHIFT_Z),
          ),
          RADIUS_B_RATIO,
        );
        const wax = smin(dA, dB, float(SMIN_BLEND));

        // Smooth-carve the clearance corridor (smax = -smin(-a,-b)) so
        // the camera path is guaranteed open even at full swell + rise.
        const tunnel = float(TUNNEL_RADIUS).sub(length(vec2(pp.x, pp.y)));
        return smin(
          wax.negate(),
          tunnel.negate(),
          float(TUNNEL_BLEND),
        ).negate();
      };

      const t = float(START_T).add(dither).toVar();
      const steps = float(0.0).toVar();
      const hit = float(0.0).toVar();

      Loop(MAX_STEPS, () => {
        steps.assign(steps.add(1.0));
        const p = vec3(rd.x.mul(t), rd.y.mul(t), rd.z.mul(t).add(driftZ));

        const d = fieldAt(p);

        If(d.lessThan(float(HIT_EPS)), () => {
          hit.assign(1.0);
          Break();
        });
        t.assign(t.add(max(d.mul(STEP_SCALE), float(MIN_STEP))));
        If(t.greaterThan(float(MAX_DIST)), () => {
          Break();
        });
      });

      // Lava shading: wax glows from within — facing surfaces are the
      // molten core, silhouette edges cool to deep red-violet. A
      // vertical heat gradient (the bulb sits below the frame) warms
      // low wax toward ember and cools high wax toward magenta; the
      // liquid itself carries a faint bulb glow at the frame's bottom.
      const hitP = vec3(rd.x.mul(t), rd.y.mul(t), rd.z.mul(t).add(driftZ));
      const depthFade = exp(t.mul(-DIST_FADE));
      const stepsNorm = steps.div(MAX_STEPS);
      const aoLin = float(1.0).sub(stepsNorm.mul(AO_STRENGTH));
      const ao = aoLin.mul(aoLin);

      // Tetrahedral normal estimate at the hit point (4 field taps,
      // once per pixel) → fresnel drives the bioluminescent edge light.
      const f1 = fieldAt(hitP.add(vec3(NORMAL_EPS, -NORMAL_EPS, -NORMAL_EPS)));
      const f2 = fieldAt(hitP.add(vec3(-NORMAL_EPS, -NORMAL_EPS, NORMAL_EPS)));
      const f3 = fieldAt(hitP.add(vec3(-NORMAL_EPS, NORMAL_EPS, -NORMAL_EPS)));
      const f4 = fieldAt(hitP.add(vec3(NORMAL_EPS, NORMAL_EPS, NORMAL_EPS)));
      const normal = normalize(
        vec3(1, -1, -1)
          .mul(f1)
          .add(vec3(-1, -1, 1).mul(f2))
          .add(vec3(-1, 1, -1).mul(f3))
          .add(vec3(1, 1, 1).mul(f4)),
      );
      const facing = abs(dot(normal, rd.negate()));
      const coreGlow = pow(facing, float(CORE_POWER));

      const heat = float(1.0).sub(
        smoothstep(float(HEAT_LOW_Y), float(HEAT_HIGH_Y), hitP.y),
      );
      const wax = mix(WAX_EDGE, WAX_CORE, coreGlow).toVar();
      wax.assign(mix(wax, WAX_HOT, heat.mul(HEAT_GAIN).mul(coreGlow)));
      wax.assign(mix(wax, WAX_COOL, float(1.0).sub(heat).mul(COOL_GAIN)));
      const surface = wax.mul(ao);

      const liquid = mix(
        LIQUID_BOTTOM,
        LIQUID_TOP,
        smoothstep(float(-1.1), float(0.9), uvAdj.y),
      );
      const col = mix(
        liquid,
        surface,
        hit.mul(clamp(depthFade.mul(1.2), 0.0, 1.0)),
      ).mul(float(1.0).add(breathEase.mul(BREATH_LIFT_GAIN)));

      // Soft tone knee — no white cores. No manual gamma: the renderer
      // sRGB-encodes the output already.
      const knee = col.div(col.mul(TONE_KNEE).add(1.0));
      const calmed = knee.mul(centerCalm);

      // Grayscale desaturation — the very last step
      const lum = dot(calmed, vec3(0.299, 0.587, 0.114));
      return mix(calmed, vec3(lum, lum, lum), grayscaleU);
    });

    const material = new MeshBasicNodeMaterial();
    material.colorNode = computeColor();

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = makeWebGPURenderer(context, { antialias: false });

    let disposed = false;
    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? AMBIENT_BREATH_BASE;
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
      // Slow-sine ambient pseudo-breath when no breath source is wired
      const targetBreath =
        breathRef.current?.value ??
        AMBIENT_BREATH_BASE +
          AMBIENT_BREATH_AMP * Math.sin(elapsed * AMBIENT_BREATH_SPEED);
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
      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Coral",
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
