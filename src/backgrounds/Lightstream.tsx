import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { PointsNodeMaterial, StorageBufferAttribute } from "three/webgpu";
import {
  attribute,
  float,
  fract,
  vec3,
  vec4,
  dot,
  min,
  mix,
  oneMinus,
  positionLocal,
  smoothstep,
  step,
  uniform,
} from "three/tsl";
import tgpu from "typegpu";
import type { TgpuGuardedComputePipeline, TgpuRoot, TgpuUniform } from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  LIGHTSTREAM — a pointillist corridor of drifting light.
//
//  Tens of thousands of soft glowing particles cluster around a
//  tube shell that winds through darkness along an analytic
//  centerline. The camera flies forward at a slow, constant,
//  meditative pace; the particles themselves only circulate
//  gently around the corridor (helical drift + coherent noise
//  swirl), so depth comes from parallax, not rushing motion.
//
//  Compute (TypeGPU, stateful integration): a TGSL kernel
//  advances every particle each frame — angular circulation
//  around the centerline, slow relaxation toward a
//  breath-scaled shell radius, coherent noise swirl, and
//  recycling of particles that fall behind the camera to the
//  far end of the z-window. Interop follows ParticlesTG: three
//  allocates the storage attributes (16-byte-stride packed),
//  TypeGPU adopts the raw GPUBuffers zero-copy on the same
//  device, and the guarded pipeline dispatches before render.
//
//  Render (TSL): one THREE.Points draw over the same storage
//  attribute (the proven pattern from Particles/ParticlesTG —
//  WebGPU points are 1px, so the pointillist body comes from
//  70k additive points, not sprite size). Muted deep
//  blue-violet with a hashed minority of dim cyan accents,
//  distance-fogged to black at both ends of the corridor.
//  Additive but capped — no white cores, no sparkle.
// ────────────────────────────────────────────────────────────

// ── PARTICLES ───────────────────────────────────────────────
const PARTICLE_COUNT = 70_000;
const INTERIOR_FRACTION = 0.16; // share of particles drifting inside the tube
const INTERIOR_RADIUS_MIN = 0.1; // interior drifters' radius range (fraction of R)
const INTERIOR_RADIUS_MAX = 0.8;
const INTERIOR_BIAS = 0.7; // <1 biases interior drifters outward
const SHELL_RADIUS_MIN = 0.86; // soft shell band (fraction of R)
const SHELL_RADIUS_MAX = 1.12;
const SPEED_FACTOR_MIN = 0.5; // per-particle angular-speed spread
const SPEED_FACTOR_MAX = 1.5;

// ── PATH (corridor centerline + tube) ───────────────────────
const TUBE_RADIUS = 3.0;
const PATH_AMP_X = 2.6; // gentle winding: long wavelengths, small amplitudes
const PATH_FREQ_X = 0.045;
const PATH_PHASE_X = 0.0;
const PATH_AMP_Y = 1.9;
const PATH_FREQ_Y = 0.031;
const PATH_PHASE_Y = 1.3;

// ── WINDOW (particle z-range around the camera) ─────────────
const WINDOW_LENGTH = 60; // corridor depth kept alive around the camera
const WINDOW_BEHIND = 4; // how far behind the camera before recycling ahead

// ── MOTION (compute kernel) ─────────────────────────────────
const ANGULAR_SPEED = 0.09; // rad/s base helical circulation
const RADIAL_RELAX_RATE = 0.4; // /s pull toward the breath-scaled shell radius
const SWIRL_SCALE = 0.3; // spatial freq of the coherent swirl field
const SWIRL_TIME_SCALE = 0.05; // how fast the swirl field evolves
const SWIRL_PHASE_GAIN = 0.12; // per-particle decorrelation of the swirl
const SWIRL_STRENGTH = 0.28; // units/s lateral swirl drift
const Z_DRIFT_STRENGTH = 0.35; // units/s longitudinal drift

// ── CAMERA ──────────────────────────────────────────────────
const CAMERA_SPEED = 3.5; // units/s, constant — never breath-modulated
const CAMERA_FOV = 66;
const LOOK_AHEAD = 13; // camera gazes at the centerline this far ahead
const CAMERA_SWAY_AMP_X = 0.22;
const CAMERA_SWAY_FREQ_X = 0.11;
const CAMERA_SWAY_AMP_Y = 0.16;
const CAMERA_SWAY_FREQ_Y = 0.073;
const CAMERA_SWAY_PHASE_Y = 1.7;

// ── FOG (distance ahead of the camera, world units) ─────────
const FOG_NEAR_END = 0.6; // fully faded closer than this
const FOG_NEAR_START = 2.4; // fully visible beyond this
const FOG_FAR_START = 26; // fully visible up to this
const FOG_FAR_END = 46; // fully faded past this (< window far end: no pop-in)

// ── LOOK (points + palette) ─────────────────────────────────
const ACCENT_FRACTION = 0.15; // hashed minority of dim cyan particles
const LUM_VAR_MIN = 0.75; // per-particle luminance spread
const LUM_VAR_MAX = 1.25;
const BASE_INTENSITY = 0.55;
const HIGHLIGHT_CAP = 0.85; // per-sprite output cap — keeps highlights muted
const BACKGROUND_COLOR = 0x04050c; // very dark blue-violet, fog-consistent

const COLOR_VIOLET_A = vec3(0.09, 0.1, 0.22); // muted deep blue-violet family
const COLOR_VIOLET_B = vec3(0.12, 0.12, 0.28);
const COLOR_CYAN = vec3(0.14, 0.32, 0.38); // dim cyan accent

// ── BREATH ──────────────────────────────────────────────────
const BREATH_RESPONSE_RATE = 5.0;
const RADIUS_BREATH_GAIN = 0.1; // tube radius ±10% (exhale 0.9R → inhale 1.1R)
const LUMA_BREATH_GAIN = 0.08; // particle luminance +8% at full inhale
const AMBIENT_BREATH_PERIOD = 9.0; // s, pseudo-breath when breath is undefined

// ────────────────────────────────────────────────────────────
//  Helpers — JS side (camera path + breath smoothing)
// ────────────────────────────────────────────────────────────

const centerlineX = (z: number) =>
  Math.sin(z * PATH_FREQ_X + PATH_PHASE_X) * PATH_AMP_X;
const centerlineY = (z: number) =>
  Math.sin(z * PATH_FREQ_Y + PATH_PHASE_Y) * PATH_AMP_Y;

const damp = (
  current: number,
  target: number,
  rate: number,
  deltaSeconds: number,
) => current + (target - current) * (1 - Math.exp(-rate * deltaSeconds));

// ────────────────────────────────────────────────────────────
//  Helpers — TGSL (compute kernel). 'use gpu' functions are
//  transpiled to WGSL by unplugin-typegpu; std.* maps 1:1 to
//  WGSL builtins. Noise pair copied from ParticlesTG (the
//  duplicated-helper cost noted in SCENES_V2 §5).
// ────────────────────────────────────────────────────────────

const random3Gpu = (i: d.v3f): d.v3f => {
  "use gpu";
  const h = std.dot(i, d.vec3f(31.06, 19.86, 30.19));
  return std.sub(
    std.fract(std.mul(std.sin(h), d.vec3f(6640.0, 5790.4, 10798.861))),
    d.vec3f(0.5, 0.5, 0.5),
  );
};

const gradientNoise3Gpu = (p: d.v3f): number => {
  "use gpu";
  const i = std.floor(p);
  const f = std.fract(p);
  // Quintic fade: f*f*f*(f*(6f - 15) + 10)
  const c = std.mul(
    std.mul(f, std.mul(f, f)),
    std.add(
      std.mul(f, std.sub(std.mul(f, 6), d.vec3f(15, 15, 15))),
      d.vec3f(10, 10, 10),
    ),
  );
  const n000 = std.dot(random3Gpu(i), f);
  const n100 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 0, 0))),
    std.sub(f, d.vec3f(1, 0, 0)),
  );
  const n010 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 1, 0))),
    std.sub(f, d.vec3f(0, 1, 0)),
  );
  const n110 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 1, 0))),
    std.sub(f, d.vec3f(1, 1, 0)),
  );
  const n001 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 0, 1))),
    std.sub(f, d.vec3f(0, 0, 1)),
  );
  const n101 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 0, 1))),
    std.sub(f, d.vec3f(1, 0, 1)),
  );
  const n011 = std.dot(
    random3Gpu(std.add(i, d.vec3f(0, 1, 1))),
    std.sub(f, d.vec3f(0, 1, 1)),
  );
  const n111 = std.dot(
    random3Gpu(std.add(i, d.vec3f(1, 1, 1))),
    std.sub(f, d.vec3f(1, 1, 1)),
  );
  const nX00 = std.mix(n000, n100, c.x);
  const nX01 = std.mix(n001, n101, c.x);
  const nX10 = std.mix(n010, n110, c.x);
  const nX11 = std.mix(n011, n111, c.x);
  const nXX0 = std.mix(nX00, nX10, c.y);
  const nXX1 = std.mix(nX01, nX11, c.y);
  return std.mix(nXX0, nXX1, c.z) * 2;
};

const centerlineGpu = (z: number): d.v2f => {
  "use gpu";
  return d.vec2f(
    std.sin(z * PATH_FREQ_X + PATH_PHASE_X) * PATH_AMP_X,
    std.sin(z * PATH_FREQ_Y + PATH_PHASE_Y) * PATH_AMP_Y,
  );
};

// Per-frame simulation parameters (single uniform struct write).
const SimParams = d.struct({
  time: d.f32,
  dt: d.f32,
  camZ: d.f32,
  radius: d.f32, // breath-scaled tube radius
});

// Structural view of three's WebGPU backend internals we rely on.
// Verified against node_modules/three/build/three.webgpu.js:
// WebGPUBackend.createStorageAttribute → attributeUtils.createAttribute
// with STORAGE | VERTEX | COPY_SRC | COPY_DST (itemSize-3 storage
// attributes are repacked to a 16-byte stride), and Backend.get(obj)
// returns the per-object data map holding `.buffer`.
type ThreeWebGPUBackendInternals = {
  device: GPUDevice;
  createStorageAttribute: (attribute: THREE.BufferAttribute) => void;
  get: (object: object) => { buffer?: GPUBuffer };
};

type TypeGPUCompute = {
  root: TgpuRoot;
  simUniform: TgpuUniform<typeof SimParams>;
  pipeline: TgpuGuardedComputePipeline<[number]>;
};

export const Lightstream = ({
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
    if (!context) return;

    const canvas = context.canvas as unknown as {
      width: number;
      height: number;
    };
    const { width, height } = canvas;
    const aspect = width / height;
    let disposed = false;

    // ── Seed particles around the winding tube shell ─────────
    // Positions: adopted by the compute kernel (read-write) and read
    // per-instance by the sprite vertex stage. Traits: static
    // per-particle state read-only by the kernel —
    //   x: rFrac (target radius as a fraction of the tube radius)
    //   y: angular-speed factor
    //   z: swirl phase (per-particle decorrelation)
    const posArray = new Float32Array(PARTICLE_COUNT * 3);
    const traitArray = new Float32Array(PARTICLE_COUNT * 3);
    const seedArray = new Float32Array(PARTICLE_COUNT);
    const restRadius = TUBE_RADIUS * (1 - RADIUS_BREATH_GAIN); // breath=0 rest

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const idx = i * 3;
      seedArray[i] = Math.random();
      const z = WINDOW_BEHIND - Math.random() * WINDOW_LENGTH;
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random();
      const rFrac =
        Math.random() < INTERIOR_FRACTION
          ? INTERIOR_RADIUS_MIN +
            Math.pow(u, INTERIOR_BIAS) *
              (INTERIOR_RADIUS_MAX - INTERIOR_RADIUS_MIN)
          : SHELL_RADIUS_MIN + u * (SHELL_RADIUS_MAX - SHELL_RADIUS_MIN);
      const r = rFrac * restRadius;

      posArray[idx] = centerlineX(z) + Math.cos(theta) * r;
      posArray[idx + 1] = centerlineY(z) + Math.sin(theta) * r;
      posArray[idx + 2] = z;

      traitArray[idx] = rFrac;
      traitArray[idx + 1] =
        SPEED_FACTOR_MIN + Math.random() * (SPEED_FACTOR_MAX - SPEED_FACTOR_MIN);
      traitArray[idx + 2] = Math.random() * Math.PI * 2;
    }

    // Storage attribute: the compute kernel writes it, and it doubles as
    // the Points geometry's position attribute (Particles.tsx pattern).
    const positionAttribute = new StorageBufferAttribute(posArray, 3);
    // Kernel-only storage attribute (never a vertex input).
    const traitAttribute = new StorageBufferAttribute(traitArray, 3);

    // ── TSL uniforms (render layer only) ─────────────────────
    const camZU = uniform(float(0));
    const breathLumU = uniform(float(1));
    const grayscaleU = uniform(float(0));

    // ── Scene ────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 200);

    const clock = new THREE.Clock();

    // ── Material: additive 1px points (Particles.tsx pattern) ─
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seedArray, 1));

    // Static per-particle look traits from one seed attribute.
    const aSeed = attribute("aSeed", "float");
    const hAccent = fract(aSeed.mul(13.73));
    const hTint = fract(aSeed.mul(5.31));
    const hLum = fract(aSeed.mul(29.17));

    // Distance fog along the corridor: near fade kills the pop as
    // particles pass the camera, far fade sinks the corridor into
    // darkness before the recycle plane, so respawns are never visible.
    const distAhead = camZU.sub(positionLocal.z);
    const nearFade = smoothstep(
      float(FOG_NEAR_END),
      float(FOG_NEAR_START),
      distAhead,
    );
    const farFade = oneMinus(
      smoothstep(float(FOG_FAR_START), float(FOG_FAR_END), distAhead),
    );
    const fade = nearFade.mul(farFade);

    // Muted violet family with a hashed minority of dim cyan accents.
    const baseTint = mix(COLOR_VIOLET_A, COLOR_VIOLET_B, hTint);
    const accentFlag = step(float(1.0 - ACCENT_FRACTION), hAccent);
    const tint = mix(baseTint, COLOR_CYAN, accentFlag);

    const lumVar = mix(float(LUM_VAR_MIN), float(LUM_VAR_MAX), hLum);
    const intensity = fade.mul(lumVar).mul(breathLumU).mul(BASE_INTENSITY);

    // Cap per-point output well below white; additive accumulation
    // stays muted because individual contributions are dim.
    const lit = min(tint.mul(intensity), vec3(HIGHLIGHT_CAP));

    // Grayscale as the very last step of the color node.
    const luma = dot(lit, vec3(0.299, 0.587, 0.114));
    const outColor = mix(lit, vec3(luma, luma, luma), grayscaleU);

    const material = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // Alpha mirrors intensity so overlapping points reinforce additively.
    material.colorNode = vec4(outColor, fade.mul(breathLumU).clamp(0, 1));

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false; // positions live far from the object origin
    scene.add(points);

    // ── Renderer ─────────────────────────────────────────────
    const renderer = makeWebGPURenderer(context, { antialias: false });

    // ── TypeGPU compute layer ────────────────────────────────
    // Deferred to the first animation frame: the animation loop only
    // runs after renderer.init() resolves, so backend.device exists.
    let tg: TypeGPUCompute | null = null;
    let tgFailed = false;

    const setupTypeGPU = (): TypeGPUCompute => {
      const backend = (
        renderer as unknown as { backend: ThreeWebGPUBackendInternals }
      ).backend;

      // Let three allocate the GPUBuffers exactly like renderer.compute()
      // would (STORAGE | VERTEX usage; itemSize-3 storage attributes get
      // repacked to a 16-byte stride, matching WGSL array<vec3f>).
      backend.createStorageAttribute(positionAttribute);
      backend.createStorageAttribute(traitAttribute);
      const rawPositions = backend.get(positionAttribute).buffer;
      const rawTraits = backend.get(traitAttribute).buffer;
      if (!rawPositions || !rawTraits) {
        throw new Error("three did not allocate GPUBuffers for the attributes");
      }

      // Adopt three's device — compute and render share one GPUDevice, so
      // queue submission order guarantees compute-before-render each frame.
      const root = tgpu.initFromDevice({ device: backend.device });

      const simUniform = root.createUniform(SimParams);
      // Adopt three's existing GPUBuffers as typed TypeGPU storage buffers.
      const positions = root.createMutable(
        d.arrayOf(d.vec3f, PARTICLE_COUNT),
        rawPositions,
      );
      const traits = root.createReadonly(
        d.arrayOf(d.vec3f, PARTICLE_COUNT),
        rawTraits,
      );

      // Integration kernel (TGSL): helical circulation around the
      // centerline + breath-scaled radial relaxation + coherent noise
      // swirl + recycle-behind-camera into the far end of the window.
      const integrate = (i: number) => {
        "use gpu";
        const pos = positions.$[i];
        const trait = traits.$[i];
        const dt = simUniform.$.dt;
        const camZ = simUniform.$.camZ;

        // Offset from the centerline at the particle's current z; the
        // polar offset (r, theta) carries over when z is recycled, so
        // respawned particles re-wrap around the centerline out there.
        const cOld = centerlineGpu(pos.z);
        const offX = pos.x - cOld.x;
        const offY = pos.y - cOld.y;

        // Recycle: floor-mod z into [camZ+BEHIND-LENGTH, camZ+BEHIND).
        // The camera moves toward -z, so a particle drifting past the
        // behind-margin wraps to the fully fogged far end of the window.
        const relLow = camZ + WINDOW_BEHIND - WINDOW_LENGTH;
        const rel = pos.z - relLow;
        const relWrapped = rel - WINDOW_LENGTH * std.floor(rel / WINDOW_LENGTH);

        // Slow helical circulation, speed varied per particle.
        const r = std.length(d.vec2f(offX, offY));
        const theta =
          std.atan2(offY, offX) + ANGULAR_SPEED * trait.y * dt;

        // Relax toward the breath-scaled shell radius — the corridor
        // gently dilates on inhale.
        const rTarget = simUniform.$.radius * trait.x;
        const rNew = r + (rTarget - r) * std.min(RADIAL_RELAX_RATE * dt, 1);

        // Coherent low-frequency swirl so motion is organic and
        // non-repeating; trait.z lightly decorrelates neighbors.
        const seed = d.vec3f(
          pos.x * SWIRL_SCALE,
          pos.y * SWIRL_SCALE,
          pos.z * SWIRL_SCALE +
            simUniform.$.time * SWIRL_TIME_SCALE +
            trait.z * SWIRL_PHASE_GAIN,
        );
        const sx = gradientNoise3Gpu(seed);
        const sy = gradientNoise3Gpu(std.add(seed, d.vec3f(11.7, 5.3, 9.1)));
        const sz = gradientNoise3Gpu(std.add(seed, d.vec3f(3.9, 17.3, 6.2)));

        const zNew = relLow + relWrapped + sz * Z_DRIFT_STRENGTH * dt;
        const cNew = centerlineGpu(zNew);
        const newX = cNew.x + std.cos(theta) * rNew + sx * SWIRL_STRENGTH * dt;
        const newY = cNew.y + std.sin(theta) * rNew + sy * SWIRL_STRENGTH * dt;

        positions.$[i] = d.vec3f(newX, newY, zNew);
      };

      // Guarded pipeline: bounds-checked threads (workgroup size 256 for
      // 1D); buffers referenced by the kernel auto-bind.
      const pipeline = root.createGuardedComputePipeline(integrate);

      return { root, simUniform, pipeline };
    };

    let previousElapsed = 0;
    let smoothedBreath = breathRef.current?.value ?? 0;

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();
      const dt =
        previousElapsed > 0
          ? Math.max(1 / 120, Math.min(elapsed - previousElapsed, 0.12))
          : 1 / 60;
      previousElapsed = elapsed;

      // Breath: damp the raw value; ambient slow-sine pseudo-breath when
      // no breath is driving the scene.
      const ambient =
        0.5 - 0.5 * Math.cos((elapsed * Math.PI * 2) / AMBIENT_BREATH_PERIOD);
      const targetBreath = breathRef.current?.value ?? ambient;
      smoothedBreath = damp(
        smoothedBreath,
        targetBreath,
        BREATH_RESPONSE_RATE,
        dt,
      );
      const ease =
        smoothedBreath * smoothedBreath * (3 - 2 * smoothedBreath);
      const radius = TUBE_RADIUS * (1 + (ease - 0.5) * 2 * RADIUS_BREATH_GAIN);

      // Constant forward speed — the breath never lurches the camera.
      const camZ = -CAMERA_SPEED * elapsed;

      (camZU as unknown as { value: number }).value = camZ;
      (breathLumU as unknown as { value: number }).value =
        1 + ease * LUMA_BREATH_GAIN;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      if (!tgFailed) {
        try {
          tg ??= setupTypeGPU();
          tg.simUniform.write({ time: elapsed, dt, camZ, radius });
          // Compute first, then render, then present.
          tg.pipeline.dispatchThreads(PARTICLE_COUNT);
        } catch (error) {
          tgFailed = true;
          console.warn("[Lightstream] TypeGPU compute failed", error);
        }
      }

      // Camera rides the centerline with a gentle sway; gaze is fixed
      // down the corridor (no orbiting, no roll).
      camera.position.set(
        centerlineX(camZ) +
          Math.sin(elapsed * CAMERA_SWAY_FREQ_X) * CAMERA_SWAY_AMP_X,
        centerlineY(camZ) +
          Math.sin(elapsed * CAMERA_SWAY_FREQ_Y + CAMERA_SWAY_PHASE_Y) *
            CAMERA_SWAY_AMP_Y,
        camZ,
      );
      const lookZ = camZ - LOOK_AHEAD;
      camera.lookAt(centerlineX(lookZ), centerlineY(lookZ), lookZ);

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "Lightstream",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      if (tg) {
        // TypeGPU-owned uniforms; the adopted position/trait buffers stay
        // three's (ownBuffer=false → not destroyed), and initFromDevice
        // roots never destroy the shared device.
        tg.simUniform.buffer.destroy();
        tg.pipeline.sizeUniform.buffer.destroy();
        tg.root.destroy();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
