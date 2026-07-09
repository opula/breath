import * as THREE from "three";
import type { CanvasRef } from "react-native-webgpu";
import { Canvas } from "react-native-webgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { PointsNodeMaterial } from "three/webgpu";
import type { SharedValue } from "react-native-reanimated";
import {
  float,
  vec3,
  vec4,
  sin,
  cos,
  fract,
  mix,
  smoothstep,
  dot,
  uniform,
  attribute,
} from "three/tsl";

import { makeWebGPURenderer } from "../../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  PARTICLE HELIX — slow spiral current for breath work
// ────────────────────────────────────────────────────────────
// Each particle stores a fixed (s, strand, jitter…) tuple and the vertex
// shader reconstructs its world position every frame as a function of
// (s, time).  No compute shader — the helix path is a closed-form
// expression of arc-parameter and time, so we let the GPU evaluate it
// per-vertex on the fly.
// ────────────────────────────────────────────────────────────

const HELIX_PARTICLE_COUNT = 48_000;
const STRAND_COUNT = 5;
const STRAND_PHASE_STEP = (Math.PI * 2) / STRAND_COUNT;
const STRAND_COLOR_DENOM = Math.max(1, STRAND_COUNT - 1);

// Helix shape
const HELIX_RADIUS = 2.15; // distance from center axis
const HELIX_LENGTH = 32.0; // total z-length of the field
const TWIST_TURNS = 5.5; // broad spirals, not a tight DNA corkscrew
const TWIST_RATE = (TWIST_TURNS * Math.PI * 2) / HELIX_LENGTH;
const RADIUS_FLOW_AMP = 0.42;
const BREATH_RADIUS_AMP = 0.18;
const BREATH_FLOW_OFFSET = 0.014;

// Ambient particles make the spiral feel suspended in atmosphere instead of
// sitting on a flat black backdrop.
const AMBIENT_PARTICLE_COUNT = 18_000;
const AMBIENT_R_MIN = 0.15;
const AMBIENT_R_MAX = 7.8;
// Power exponent for `r = R_MAX * pow(rand, EXP)`. EXP < 1 biases toward the
// outer edge. Keep this moderate so the center is quiet, not empty.
const AMBIENT_R_EXP = 0.62;
const AMBIENT_INTENSITY_MULT = 0.38;

// Motion
const FLIGHT_SPEED = 0.2; // world units per second toward camera
const FLIGHT_S_PER_SEC = FLIGHT_SPEED / HELIX_LENGTH; // s ∈ [0,1] flow rate
const GLOBAL_ROT_HZ = 1 / 150; // global slow rotation: 1 rev per 150s
const GLOBAL_ROT_RATE = GLOBAL_ROT_HZ * Math.PI * 2;

// Per-particle jitter gives each arm thickness and a soft-edged current.
const RADIUS_JITTER_MAX = 0.82;
const ANGLE_JITTER_MAX = 0.26; // radians
const Z_JITTER_MAX = 0.38;

// Shimmer, intentionally slow and shallow so it reads as glow instead of stars.
const TWINKLE_AMP = 0.12;
const TWINKLE_RATE = 0.55;

// Brightness / fog
const BASE_INTENSITY = 0.92;

// Per-particle shine spread. Keep the range restrained; no hard star pops.
const SHINE_MIN = 0.42;
const SHINE_MAX = 2.25;
const SHINE_BIAS = 2.8; // higher = more particles dim, fewer bright
const FOG_NEAR_END = 0.25; // particles closer than this are fully invisible
const FOG_NEAR_START = 3.0; // fully visible past this (from camera)
const FOG_FAR_START = 22;
const FOG_FAR_END = HELIX_LENGTH;

// Camera
const CAMERA_FOV = 46;

// Center calm cone — fraction of screen radius from center to keep subdued.
// Mask is applied per-particle as smoothstep on `world_r / |z|`, which is the
// particle's normalized screen position regardless of its z depth. Unlike a
// hard keep-out, this leaves quiet texture behind the breath ring.
const CENTER_CALM_FRACTION = 0.42;
const CENTER_CALM_RATIO =
  CENTER_CALM_FRACTION * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
const CENTER_CALM_FADE_INNER = CENTER_CALM_RATIO * 0.72;
const CENTER_CALM_FADE_OUTER = CENTER_CALM_RATIO;
const CENTER_DIM = 0.34;
const CAMERA_LOOKAT_Z = -14;
const CAMERA_SWAY_AMP_X = 0.08;
const CAMERA_SWAY_AMP_Y = 0.06;
const CAMERA_SWAY_FREQ_X = 0.045;
const CAMERA_SWAY_FREQ_Y = 0.035;

const COLOR_DEEP = vec3(0.07, 0.14, 0.18);
const COLOR_TIDE = vec3(0.42, 0.78, 0.76);
const COLOR_WARM = vec3(0.95, 0.72, 0.48);
const COLOR_AMBIENT = vec3(0.58, 0.72, 0.82);

const BG_COLOR = 0x020506;

export const ParticleHelix = ({
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

    // Power-curve shine: most particles dim, a few softly brighter.
    const sampleShine = () =>
      SHINE_MIN + Math.pow(Math.random(), SHINE_BIAS) * (SHINE_MAX - SHINE_MIN);

    // ── HELIX cloud ──────────────────────────────────────────
    // position attribute is a placeholder of zeros (real positions come from
    // positionNode), but three.js needs it to size the draw call.
    const helixPositions = new Float32Array(HELIX_PARTICLE_COUNT * 3);
    const aSArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aStrandArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aRJArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aAJArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aZJArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aPhaseArr = new Float32Array(HELIX_PARTICLE_COUNT);
    const aShineArr = new Float32Array(HELIX_PARTICLE_COUNT);

    for (let i = 0; i < HELIX_PARTICLE_COUNT; i++) {
      aSArr[i] = Math.random();
      aStrandArr[i] = i % STRAND_COUNT;
      aRJArr[i] = (Math.random() - 0.5) * 2 * RADIUS_JITTER_MAX;
      aAJArr[i] = (Math.random() - 0.5) * 2 * ANGLE_JITTER_MAX;
      aZJArr[i] = (Math.random() - 0.5) * 2 * Z_JITTER_MAX;
      aPhaseArr[i] = Math.random() * Math.PI * 2;
      aShineArr[i] = sampleShine();
    }

    const helixGeometry = new THREE.BufferGeometry();
    helixGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(helixPositions, 3),
    );
    helixGeometry.setAttribute("aS", new THREE.BufferAttribute(aSArr, 1));
    helixGeometry.setAttribute(
      "aStrand",
      new THREE.BufferAttribute(aStrandArr, 1),
    );
    helixGeometry.setAttribute("aRJ", new THREE.BufferAttribute(aRJArr, 1));
    helixGeometry.setAttribute("aAJ", new THREE.BufferAttribute(aAJArr, 1));
    helixGeometry.setAttribute("aZJ", new THREE.BufferAttribute(aZJArr, 1));
    helixGeometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(aPhaseArr, 1),
    );
    helixGeometry.setAttribute(
      "aShine",
      new THREE.BufferAttribute(aShineArr, 1),
    );

    // ── AMBIENT star cloud ───────────────────────────────────
    // Particles distributed in a cylindrical volume around the helix axis,
    // with radial density biased outward via `r = R_MAX * pow(rand, EXP)`
    // (EXP < 1 → outer-heavy). Same forward-flight motion as the helix so
    // everything moves coherently.
    const ambientPositions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
    const ambSArr = new Float32Array(AMBIENT_PARTICLE_COUNT);
    const ambRArr = new Float32Array(AMBIENT_PARTICLE_COUNT);
    const ambThetaArr = new Float32Array(AMBIENT_PARTICLE_COUNT);
    const ambPhaseArr = new Float32Array(AMBIENT_PARTICLE_COUNT);
    const ambShineArr = new Float32Array(AMBIENT_PARTICLE_COUNT);

    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      ambSArr[i] = Math.random();
      // Outer-biased radial: r = MIN + (MAX-MIN) * pow(rand, EXP)
      ambRArr[i] =
        AMBIENT_R_MIN +
        Math.pow(Math.random(), AMBIENT_R_EXP) *
          (AMBIENT_R_MAX - AMBIENT_R_MIN);
      ambThetaArr[i] = Math.random() * Math.PI * 2;
      ambPhaseArr[i] = Math.random() * Math.PI * 2;
      ambShineArr[i] = sampleShine();
    }

    const ambientGeometry = new THREE.BufferGeometry();
    ambientGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(ambientPositions, 3),
    );
    ambientGeometry.setAttribute("aS", new THREE.BufferAttribute(ambSArr, 1));
    ambientGeometry.setAttribute("aR", new THREE.BufferAttribute(ambRArr, 1));
    ambientGeometry.setAttribute(
      "aTheta",
      new THREE.BufferAttribute(ambThetaArr, 1),
    );
    ambientGeometry.setAttribute(
      "aPhase",
      new THREE.BufferAttribute(ambPhaseArr, 1),
    );
    ambientGeometry.setAttribute(
      "aShine",
      new THREE.BufferAttribute(ambShineArr, 1),
    );

    // ── Uniforms ──────────────────────────────────────────────
    const timeU = uniform(float(0));
    const grayscaleU = uniform(float(0));
    const breathU = uniform(float(0));

    // ── TSL nodes for per-particle attrs ──────────────────────
    const aS = attribute("aS", "float");
    const aStrand = attribute("aStrand", "float");
    const aRJ = attribute("aRJ", "float");
    const aAJ = attribute("aAJ", "float");
    const aZJ = attribute("aZJ", "float");
    const aPhase = attribute("aPhase", "float");
    const aShine = attribute("aShine", "float");

    // ── Position from closed-form helix ────────────────────────
    // effS ∈ [0, 1) — particle's current position along the spiral arc.
    // Breath subtly shifts the current so inhale/exhale is felt in the field.
    const effS = fract(
      aS.add(timeU.mul(FLIGHT_S_PER_SEC)).add(
        breathU.mul(BREATH_FLOW_OFFSET),
      ),
    );

    // z mapped to [-LENGTH, 0]; near-camera end is at z=0.
    const z = effS.sub(1.0).mul(HELIX_LENGTH).add(aZJ);

    // Multiple strands share a direction and phase apart into a slow spiral
    // current. This avoids the busy X-crossings of a literal DNA helix.
    const pathLen = effS.mul(HELIX_LENGTH);
    const strandPhase = aStrand.mul(STRAND_PHASE_STEP);
    const radiusWave = sin(
      pathLen.mul(0.72).add(strandPhase).add(timeU.mul(0.16)),
    ).mul(RADIUS_FLOW_AMP);
    const angle = pathLen
      .mul(TWIST_RATE)
      .add(strandPhase)
      .add(sin(pathLen.mul(0.34).add(timeU.mul(0.08))).mul(0.16))
      .add(aAJ)
      .add(timeU.mul(GLOBAL_ROT_RATE));

    const breathScale = float(1.0).add(breathU.mul(BREATH_RADIUS_AMP));
    const radius = float(HELIX_RADIUS).add(aRJ).add(radiusWave).mul(breathScale);
    const x = cos(angle).mul(radius);
    const y = sin(angle).mul(radius);

    const helixPos = vec3(x, y, z);

    // Calm color ramp: deep teal shadows, pale tide highlights, warm accents.
    const strandT = aStrand.div(STRAND_COLOR_DENOM);
    const coolColor = mix(COLOR_DEEP, COLOR_TIDE, strandT);
    const warmBlend = smoothstep(0.58, 1.0, strandT);
    const strandColor = mix(coolColor, COLOR_WARM, warmBlend.mul(0.55));

    // ── Depth fog (kills the wrap pop on both ends) ────────────
    const zDist = z.negate(); // distance from camera (camera at z=0)
    const nearFade = smoothstep(
      float(FOG_NEAR_END),
      float(FOG_NEAR_START),
      zDist,
    );
    const farFade = float(1.0).sub(
      smoothstep(float(FOG_FAR_START), float(FOG_FAR_END), zDist),
    );

    // ── Shimmer (per-particle phase keeps it from feeling synced) ──
    const twinkle = sin(timeU.mul(TWINKLE_RATE).add(aPhase))
      .mul(TWINKLE_AMP)
      .add(float(1.0).sub(float(TWINKLE_AMP)));

    // Center calm: dim behind the breath UI without cutting a visible hole.
    const helixScreenR = radius.div(zDist);
    const helixCenterFade = smoothstep(
      float(CENTER_CALM_FADE_INNER),
      float(CENTER_CALM_FADE_OUTER),
      helixScreenR,
    );
    const helixCenterDim = mix(float(CENTER_DIM), float(1.0), helixCenterFade);
    const breathGlow = float(0.84).add(breathU.mul(0.28));

    const intensity = nearFade
      .mul(farFade)
      .mul(helixCenterDim)
      .mul(twinkle)
      .mul(aShine)
      .mul(BASE_INTENSITY)
      .mul(breathGlow);

    const litColor = strandColor.mul(intensity);

    // Grayscale desaturation
    const lum = dot(litColor, vec3(0.299, 0.587, 0.114));
    const outColor = mix(litColor, vec3(lum, lum, lum), grayscaleU);

    // ── Helix material ───────────────────────────────────────
    const helixMaterial = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    helixMaterial.positionNode = helixPos;
    helixMaterial.colorNode = vec4(outColor, intensity.clamp(0, 1));

    // ── Ambient star cloud: position + color via TSL ─────────
    const ambS = attribute("aS", "float");
    const ambR = attribute("aR", "float");
    const ambTheta = attribute("aTheta", "float");
    const ambPhase = attribute("aPhase", "float");
    const ambShine = attribute("aShine", "float");

    const ambEffS = fract(
      ambS.add(timeU.mul(FLIGHT_S_PER_SEC)).add(
        breathU.mul(BREATH_FLOW_OFFSET),
      ),
    );
    const ambZ = ambEffS.sub(1.0).mul(HELIX_LENGTH);
    const ambAngle = ambTheta
      .add(timeU.mul(GLOBAL_ROT_RATE))
      .add(sin(ambEffS.mul(Math.PI * 2).add(timeU.mul(0.06))).mul(0.22));
    const ambRadius = ambR.mul(float(0.96).add(breathU.mul(0.08)));
    const ambPos = vec3(
      cos(ambAngle).mul(ambRadius),
      sin(ambAngle).mul(ambRadius),
      ambZ,
    );

    const ambZDist = ambZ.negate();
    const ambNearFade = smoothstep(
      float(FOG_NEAR_END),
      float(FOG_NEAR_START),
      ambZDist,
    );
    const ambFarFade = float(1.0).sub(
      smoothstep(float(FOG_FAR_START), float(FOG_FAR_END), ambZDist),
    );
    const ambTwinkle = sin(timeU.mul(TWINKLE_RATE).add(ambPhase))
      .mul(TWINKLE_AMP)
      .add(float(1.0).sub(float(TWINKLE_AMP)));
    // Same calm center applied to the ambient cloud.
    const ambScreenR = ambRadius.div(ambZDist);
    const ambCenterFade = smoothstep(
      float(CENTER_CALM_FADE_INNER),
      float(CENTER_CALM_FADE_OUTER),
      ambScreenR,
    );
    const ambCenterDim = mix(float(CENTER_DIM), float(1.0), ambCenterFade);

    const ambIntensity = ambNearFade
      .mul(ambFarFade)
      .mul(ambCenterDim)
      .mul(ambTwinkle)
      .mul(ambShine)
      .mul(BASE_INTENSITY)
      .mul(AMBIENT_INTENSITY_MULT)
      .mul(breathGlow);

    const ambLit = COLOR_AMBIENT.mul(ambIntensity);
    const ambLum = dot(ambLit, vec3(0.299, 0.587, 0.114));
    const ambOut = mix(ambLit, vec3(ambLum, ambLum, ambLum), grayscaleU);

    const ambientMaterial = new PointsNodeMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ambientMaterial.positionNode = ambPos;
    ambientMaterial.colorNode = vec4(ambOut, ambIntensity.clamp(0, 1));

    // ── Scene ─────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 200);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, CAMERA_LOOKAT_Z);

    // Both clouds need bounding spheres + culling disabled because their real
    // positions come from positionNode, not the placeholder "position" attr.
    const tunnelBounds = new THREE.Sphere(
      new THREE.Vector3(0, 0, -HELIX_LENGTH / 2),
      HELIX_LENGTH,
    );
    helixGeometry.boundingSphere = tunnelBounds.clone();
    ambientGeometry.boundingSphere = tunnelBounds.clone();

    const helixPoints = new THREE.Points(helixGeometry, helixMaterial);
    helixPoints.frustumCulled = false;
    scene.add(helixPoints);

    const ambientPoints = new THREE.Points(ambientGeometry, ambientMaterial);
    ambientPoints.frustumCulled = false;
    scene.add(ambientPoints);

    const clock = new THREE.Clock();

    // ── Renderer ──────────────────────────────────────────────
    const renderer = makeWebGPURenderer(context, { antialias: false });

    function animate() {
      if (disposed) return;
      const elapsed = clock.getElapsedTime();

      (timeU as unknown as { value: number }).value = elapsed;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;
      (breathU as unknown as { value: number }).value =
        breathRef.current?.value ?? 0.0;

      // Gentle ship-in-currents sway (camera stays inside the tunnel).
      camera.position.x =
        Math.sin(elapsed * CAMERA_SWAY_FREQ_X) * CAMERA_SWAY_AMP_X;
      camera.position.y =
        Math.sin(elapsed * CAMERA_SWAY_FREQ_Y) * CAMERA_SWAY_AMP_Y;
      camera.lookAt(0, 0, CAMERA_LOOKAT_Z);

      renderer.render(scene, camera);
      context!.present();
    }

    startWebGPUAnimationLoop(renderer, animate, {
      isDisposed: () => disposed,
      label: "ParticleHelix",
      onReady,
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(helixPoints);
      scene.remove(ambientPoints);
      helixGeometry.dispose();
      ambientGeometry.dispose();
      helixMaterial.dispose();
      ambientMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
