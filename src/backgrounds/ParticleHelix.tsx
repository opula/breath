import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { PointsNodeMaterial } from "three/webgpu";
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

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";
import { startWebGPUAnimationLoop } from "../lib/start-webgpu-animation-loop";

// ────────────────────────────────────────────────────────────
//  PARTICLE HELIX — fly through a multi-strand spiral tunnel
// ────────────────────────────────────────────────────────────
// Each particle stores a fixed (s, strand, jitter…) tuple and the vertex
// shader reconstructs its world position every frame as a function of
// (s, time).  No compute shader — the helix path is a closed-form
// expression of arc-parameter and time, so we let the GPU evaluate it
// per-vertex on the fly.
// ────────────────────────────────────────────────────────────

const HELIX_PARTICLE_COUNT = 48_000;
const STRAND_COUNT = 8; // DNA-style: two strands

// Helix shape
const HELIX_RADIUS = 0.5; // distance from center axis
const HELIX_LENGTH = 26.0; // total z-length of the tunnel
const TWIST_TURNS = 22; // how many full revolutions over the length
const TWIST_RATE = (TWIST_TURNS * Math.PI * 2) / HELIX_LENGTH;

// Ambient star cloud — distributed radially with outward density bias so the
// tunnel walls feel denser further from the camera axis.
const AMBIENT_PARTICLE_COUNT = 12_000;
const AMBIENT_R_MIN = 0.4;
const AMBIENT_R_MAX = 7.0;
// Power exponent for `r = R_MAX * pow(rand, EXP)`. EXP < 1 biases toward the
// outer edge (more particles near R_MAX). 0.4 is a strong outward bias.
const AMBIENT_R_EXP = 0.4;

// Motion
const FLIGHT_SPEED = 0.01; // world units per second toward camera
const FLIGHT_S_PER_SEC = FLIGHT_SPEED / HELIX_LENGTH; // s ∈ [0,1] flow rate
const GLOBAL_ROT_HZ = 1 / 60; // global slow rotation: 1 rev per 60s
const GLOBAL_ROT_RATE = GLOBAL_ROT_HZ * Math.PI * 2;

// Per-particle jitter (so the helix has thickness instead of a thin line)
const RADIUS_JITTER_MAX = 0.35;
const ANGLE_JITTER_MAX = 0.08; // radians
const Z_JITTER_MAX = 0.05;

// Twinkle
const TWINKLE_AMP = 1.25;
const TWINKLE_RATE = 5.5;

// Brightness / fog
const BASE_INTENSITY = 2.4;

// Per-particle shine spread — distribution skewed low with a long bright tail,
// so most particles are subtle and a handful really pop like stars.
// Wide range + heavy bias = scattered bright "hero" particles among dim mass.
const SHINE_MIN = 0.25;
const SHINE_MAX = 8.0;
const SHINE_BIAS = 5.0; // higher = more particles dim, fewer bright
const FOG_NEAR_END = 0.4; // particles closer than this are fully invisible
const FOG_NEAR_START = 1.5; // fully visible past this (from camera)
const FOG_FAR_START = 18;
const FOG_FAR_END = HELIX_LENGTH;

// Camera
const CAMERA_FOV = 6;

// Keep-out cone — fraction of screen radius from center to leave empty.
// Mask is applied per-particle as smoothstep on `world_r / |z|`, which is the
// particle's normalized screen position regardless of its z depth. So a
// distant particle at world radius 2 (which would otherwise project to
// screen-center) gets faded out, while a near particle at the same world
// radius (now at the screen periphery) renders normally.
const KEEP_OUT_FRACTION = 0.3;
const KEEP_OUT_RATIO =
  KEEP_OUT_FRACTION * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
// Soft fade band to avoid a hard ring edge.
const KEEP_OUT_FADE_INNER = KEEP_OUT_RATIO * 0.85;
const KEEP_OUT_FADE_OUTER = KEEP_OUT_RATIO;
const CAMERA_LOOKAT_Z = -10;
const CAMERA_SWAY_AMP_X = 0.12;
const CAMERA_SWAY_AMP_Y = 0.08;
const CAMERA_SWAY_FREQ_X = 0.07;
const CAMERA_SWAY_FREQ_Y = 0.05;

// Two-strand palette — one cool, one warm, so the strands stay distinguishable
// when they cross each other in the foreground.
const COLOR_0 = vec3(0.4, 0.85, 1.0); // cyan-blue
const COLOR_1 = vec3(1.0, 0.55, 0.85); // pink-magenta
// Ambient star cloud — neutral pale blue, lets the helix colors stay primary.
const COLOR_AMBIENT = vec3(0.85, 0.9, 1.0);

const BG_COLOR = 0x02030a;

export const ParticleHelix = ({
  grayscale = false,
  onReady,
}: {
  grayscale?: boolean;
  onReady?: () => void;
}) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

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

    // Power-curve shine: most particles dim, a few much brighter "stars".
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

    // ── TSL nodes for per-particle attrs ──────────────────────
    const aS = attribute("aS", "float");
    const aStrand = attribute("aStrand", "float");
    const aRJ = attribute("aRJ", "float");
    const aAJ = attribute("aAJ", "float");
    const aZJ = attribute("aZJ", "float");
    const aPhase = attribute("aPhase", "float");
    const aShine = attribute("aShine", "float");

    // ── Position from closed-form helix ────────────────────────
    // effS ∈ [0, 1) — particle's current position along the helix arc.
    // Advancing s wraps automatically via fract().
    const effS = fract(aS.add(timeU.mul(FLIGHT_S_PER_SEC)));

    // z mapped to [-LENGTH, 0]; near-camera end is at z=0.
    const z = effS.sub(1.0).mul(HELIX_LENGTH).add(aZJ);

    // Strand 0 twists CCW, strand 1 twists CW — opposite directions create
    // the X-shaped crossings of a classic double helix.
    // strandDir = 1 for strand 0, -1 for strand 1
    // strandStart = 0 for strand 0, π for strand 1 (180° apart at z=0)
    const pathLen = effS.mul(HELIX_LENGTH);
    const strandDir = float(1.0).sub(aStrand.mul(2.0));
    const strandStart = aStrand.mul(Math.PI);
    const angle = pathLen
      .mul(TWIST_RATE)
      .mul(strandDir)
      .add(strandStart)
      .add(aAJ)
      .add(timeU.mul(GLOBAL_ROT_RATE));

    const radius = float(HELIX_RADIUS).add(aRJ);
    const x = cos(angle).mul(radius);
    const y = sin(angle).mul(radius);

    const helixPos = vec3(x, y, z);

    // Per-strand color (aStrand is 0 or 1 → straight mix).
    const strandColor = mix(COLOR_0, COLOR_1, aStrand);

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

    // ── Twinkle (per-particle phase keeps it from feeling synced) ──
    const twinkle = sin(timeU.mul(TWINKLE_RATE).add(aPhase))
      .mul(TWINKLE_AMP)
      .add(float(1.0).sub(float(TWINKLE_AMP)));

    // Center keep-out: particle screen-radius = world_radius / |z|. Anything
    // inside KEEP_OUT_RATIO is faded out, regardless of its 3D position.
    const helixScreenR = radius.div(zDist);
    const helixKeepOut = smoothstep(
      float(KEEP_OUT_FADE_INNER),
      float(KEEP_OUT_FADE_OUTER),
      helixScreenR,
    );

    const intensity = nearFade
      .mul(farFade)
      .mul(helixKeepOut)
      .mul(twinkle)
      .mul(aShine)
      .mul(BASE_INTENSITY);

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

    const ambEffS = fract(ambS.add(timeU.mul(FLIGHT_S_PER_SEC)));
    const ambZ = ambEffS.sub(1.0).mul(HELIX_LENGTH);
    const ambAngle = ambTheta.add(timeU.mul(GLOBAL_ROT_RATE));
    const ambPos = vec3(cos(ambAngle).mul(ambR), sin(ambAngle).mul(ambR), ambZ);

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
    // Same center keep-out applied to the ambient cloud.
    const ambScreenR = ambR.div(ambZDist);
    const ambKeepOut = smoothstep(
      float(KEEP_OUT_FADE_INNER),
      float(KEEP_OUT_FADE_OUTER),
      ambScreenR,
    );

    const ambIntensity = ambNearFade
      .mul(ambFarFade)
      .mul(ambKeepOut)
      .mul(ambTwinkle)
      .mul(ambShine)
      .mul(BASE_INTENSITY);

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
