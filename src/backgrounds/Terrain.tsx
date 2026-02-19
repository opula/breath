import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { StorageBufferAttribute } from "three/webgpu";
import {
  Fn,
  float,
  uint,
  vec3,
  floor,
  fract,
  mix,
  select,
  sin,
  cos,
  dot,
  mod,
  min,
  normalize,
  uniform,
  storage,
  instanceIndex,
} from "three/tsl";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

// --- Baked Settings ---
// const FLY_SPEED = 24.9;
const FLY_SPEED = 17;
const WAVE_SPEED = 0.2;
const MAIN_HEIGHT = 10.2;
// const SCALE_X = 0.04643;
const SCALE_X = 0.07;
const SCALE_Y = 0.07;
const DETAIL_HEIGHT = 3.34;
const DETAIL_SCALE = 0.09163;
const FOG_COLOR = 0x999999;
const CAM_HEIGHT = 4.214;
const CAM_DIST = 68.04;
const FOV = 70;
const PLANE_SIZE = 200;
const SEGMENTS = 160;
const EDGE_RADIUS = 90;
const FOG_DENSITY = 0.015;
const MAX_DELTA_SECONDS = 0.1; // clamp large frame gaps on app resume

const STRIDE = SEGMENTS + 1;
const VERT_COUNT = STRIDE * STRIDE;
const CELL_SIZE = PLANE_SIZE / SEGMENTS;

// Echo-inspired cosine palette
const TWO_PI = 6.2831853;

export const Terrain = ({ grayscale = false }: { grayscale?: boolean }) => {
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

    // ================================================================
    // Use a real PlaneGeometry to get correct winding/UVs, then
    // steal its index buffer and initial positions for our grid XY.
    // We'll replace its position/normal attributes with storage buffers.
    // ================================================================

    const templateGeo = new THREE.PlaneGeometry(
      PLANE_SIZE,
      PLANE_SIZE,
      SEGMENTS,
      SEGMENTS,
    );
    const templatePos = templateGeo.attributes.position.array as Float32Array;

    // Build grid XY and smoothEdge LUT from the template's local positions
    // PlaneGeometry lies in XY with Z=0, and we'll rotate -PI/2 around X
    // so the plane becomes XZ. In local space: X = horizontal, Y = depth.
    const gridXYArray = new Float32Array(VERT_COUNT * 2);
    const smoothEdgeArray = new Float32Array(VERT_COUNT);
    const posArray = new Float32Array(VERT_COUNT * 3);
    const normArray = new Float32Array(VERT_COUNT * 3);
    const colArray = new Float32Array(VERT_COUNT * 3);

    for (let i = 0; i < VERT_COUNT; i++) {
      const x = templatePos[i * 3];
      const y = templatePos[i * 3 + 1];

      gridXYArray[i * 2] = x;
      gridXYArray[i * 2 + 1] = y;

      // Initial flat positions (in local plane space: XY plane)
      posArray[i * 3] = x;
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = 0;

      // Default normal (pointing out of the plane = +Z in local space)
      normArray[i * 3] = 0;
      normArray[i * 3 + 1] = 0;
      normArray[i * 3 + 2] = 1;

      // Initial color (overwritten by compute)
      colArray[i * 3] = 1;
      colArray[i * 3 + 1] = 1;
      colArray[i * 3 + 2] = 1;

      // Pre-bake smoothEdge (grid positions never change)
      const dist = Math.sqrt(x * x + y * y);
      const edgeFactor = Math.max(0, (EDGE_RADIUS - dist) / EDGE_RADIUS);
      smoothEdgeArray[i] = edgeFactor * edgeFactor * (3 - 2 * edgeFactor);
    }

    // ================================================================
    // Storage buffers
    // ================================================================

    const positionAttr = new StorageBufferAttribute(posArray, 3);
    const normalAttr = new StorageBufferAttribute(normArray, 3);
    const colorAttr = new StorageBufferAttribute(colArray, 3);
    const gridXYAttr = new StorageBufferAttribute(gridXYArray, 2);
    const smoothEdgeAttr = new StorageBufferAttribute(smoothEdgeArray, 1);

    const positionStorage = storage(positionAttr, "vec3", VERT_COUNT);
    const normalStorage = storage(normalAttr, "vec3", VERT_COUNT);
    const colorStorage = storage(colorAttr, "vec3", VERT_COUNT);
    const gridXYStorage = storage(gridXYAttr, "vec2", VERT_COUNT);
    const smoothEdgeStorage = storage(smoothEdgeAttr, "float", VERT_COUNT);

    // ================================================================
    // TSL noise (hash-based gradient noise, matches character of ImprovedNoise)
    // ================================================================

    const fade = Fn(([t]: [ReturnType<typeof float>]) => {
      return t
        .mul(t)
        .mul(t)
        .mul(t.mul(t.mul(6.0).sub(15.0)).add(10.0));
    });

    const hash = Fn(([p]: [ReturnType<typeof vec3>]) => {
      const h = dot(p, vec3(127.1, 311.7, 74.7));
      return fract(sin(h).mul(43758.5453));
    });

    const grad = Fn(
      ([hash_val, x, y, z]: [
        ReturnType<typeof float>,
        ReturnType<typeof float>,
        ReturnType<typeof float>,
        ReturnType<typeof float>,
      ]) => {
        const h = fract(hash_val.mul(12.0));
        const u = mix(x, y, h.step(4.0));
        const v = mix(y, z, h.step(8.0));
        const signU = mix(
          float(1.0),
          float(-1.0),
          fract(h.mul(0.5)).step(0.25),
        );
        const signV = mix(
          float(1.0),
          float(-1.0),
          fract(h.mul(0.25)).step(0.25),
        );
        return u.mul(signU).add(v.mul(signV));
      },
    );

    const noise3D = Fn(
      ([px, py, pz]: [
        ReturnType<typeof float>,
        ReturnType<typeof float>,
        ReturnType<typeof float>,
      ]) => {
        const ix = floor(px);
        const iy = floor(py);
        const iz = floor(pz);

        const fx = fract(px);
        const fy = fract(py);
        const fz = fract(pz);

        const ux = fade(fx);
        const uy = fade(fy);
        const uz = fade(fz);

        const h000 = hash(vec3(ix, iy, iz));
        const h100 = hash(vec3(ix.add(1), iy, iz));
        const h010 = hash(vec3(ix, iy.add(1), iz));
        const h110 = hash(vec3(ix.add(1), iy.add(1), iz));
        const h001 = hash(vec3(ix, iy, iz.add(1)));
        const h101 = hash(vec3(ix.add(1), iy, iz.add(1)));
        const h011 = hash(vec3(ix, iy.add(1), iz.add(1)));
        const h111 = hash(vec3(ix.add(1), iy.add(1), iz.add(1)));

        const g000 = grad(h000, fx, fy, fz);
        const g100 = grad(h100, fx.sub(1), fy, fz);
        const g010 = grad(h010, fx, fy.sub(1), fz);
        const g110 = grad(h110, fx.sub(1), fy.sub(1), fz);
        const g001 = grad(h001, fx, fy, fz.sub(1));
        const g101 = grad(h101, fx.sub(1), fy, fz.sub(1));
        const g011 = grad(h011, fx, fy.sub(1), fz.sub(1));
        const g111 = grad(h111, fx.sub(1), fy.sub(1), fz.sub(1));

        const x0 = mix(mix(g000, g100, ux), mix(g010, g110, ux), uy);
        const x1 = mix(mix(g001, g101, ux), mix(g011, g111, ux), uy);

        return mix(x0, x1, uz);
      },
    );

    // Echo-inspired cosine gradient palette
    // Maps height → teal/cyan/deep blue color cycle
    const palette = Fn(([t]: [ReturnType<typeof float>]) => {
      const a = vec3(0.0, 0.5, 0.5);
      const b = vec3(0.0, 0.5, 0.5);
      const c = vec3(0.0, 0.5, 0.333);
      const d = vec3(0.0, 0.5, 0.667);
      return a.add(b.mul(cos(float(TWO_PI).mul(c.mul(t).add(d)))));
    });

    // ================================================================
    // Uniforms
    // ================================================================

    const waveTimeU = uniform(float(0));
    const flightOffsetU = uniform(float(0));
    const grayscaleU = uniform(float(0));

    // ================================================================
    // Helper: sample terrain height at a grid position
    // (used by the position compute shader)
    // ================================================================

    const sampleHeight = Fn(
      ([x, y, smoothEdge]: [
        ReturnType<typeof float>,
        ReturnType<typeof float>,
        ReturnType<typeof float>,
      ]) => {
        const noiseY = y.add(flightOffsetU);

        const mainNoise = noise3D(
          x.mul(SCALE_X),
          noiseY.mul(SCALE_Y),
          waveTimeU,
        ).mul(MAIN_HEIGHT);

        const detailNoise = noise3D(
          x.mul(DETAIL_SCALE),
          noiseY.mul(DETAIL_SCALE),
          waveTimeU.mul(0.5).add(10.0),
        ).mul(DETAIL_HEIGHT);

        return mainNoise.add(detailNoise).mul(smoothEdge);
      },
    );

    // ================================================================
    // Compute: update positions
    // PlaneGeometry local space: X = right, Y = up (depth), Z = out of plane
    // We write height into Z, then rotate the mesh -PI/2 on X (same as original)
    // ================================================================

    const computePositions = Fn(() => {
      const idx = instanceIndex;
      const pos = positionStorage.element(idx);
      const col = colorStorage.element(idx);
      const gridXY = gridXYStorage.element(idx);
      const smoothEdge = smoothEdgeStorage.element(idx);

      const x = gridXY.x;
      const y = gridXY.y;

      const z = sampleHeight(x, y, smoothEdge);

      // Write position
      pos.x.assign(x);
      pos.y.assign(y);
      pos.z.assign(z);

      // Color: map normalized height to Echo palette
      const normalizedZ = z.div(float(MAIN_HEIGHT)).mul(0.5).add(0.5);
      const palInput = normalizedZ.add(waveTimeU.mul(0.3));
      const palCol = palette(palInput).mul(0.7);

      // Grayscale desaturation
      const lum = dot(palCol, vec3(0.299, 0.587, 0.114));
      const finalCol = mix(palCol, vec3(lum, lum, lum), grayscaleU);

      col.assign(finalCol);
    })().compute(VERT_COUNT);

    // ================================================================
    // Compute: update normals via central differences from neighbor heights
    // ================================================================

    const computeNormals = Fn(() => {
      const idx = instanceIndex;
      const norm = normalStorage.element(idx);
      const stride = uint(STRIDE);
      const maxIndex = uint(SEGMENTS);
      const row = idx.div(stride);
      const col = mod(idx, stride);

      const leftCol = select(col.equal(uint(0)), uint(0), col.sub(uint(1)));
      const rightCol = min(col.add(uint(1)), maxIndex);
      const downRow = select(row.equal(uint(0)), uint(0), row.sub(uint(1)));
      const upRow = min(row.add(uint(1)), maxIndex);

      const idxL = row.mul(stride).add(leftCol);
      const idxR = row.mul(stride).add(rightCol);
      const idxD = downRow.mul(stride).add(col);
      const idxU = upRow.mul(stride).add(col);

      const e = float(CELL_SIZE);

      // Read neighboring heights from the already-computed position buffer.
      const hL = positionStorage.element(idxL).z;
      const hR = positionStorage.element(idxR).z;
      const hD = positionStorage.element(idxD).z;
      const hU = positionStorage.element(idxU).z;

      // In local plane space (XY plane, Z = height):
      // tangent_x = (2e, 0, hR - hL), tangent_y = (0, 2e, hU - hD)
      // normal = cross(tangent_x, tangent_y) = (-2e*(hR-hL), -2e*(hU-hD), 4e²)
      // Simplified (normalize handles scale): (-dzdx, -dzdy, 1)
      const dzdx = hR.sub(hL).div(e.mul(2.0));
      const dzdy = hU.sub(hD).div(e.mul(2.0));

      norm.assign(normalize(vec3(dzdx.negate(), dzdy.negate(), float(1.0))));
    })().compute(VERT_COUNT);

    // ================================================================
    // Scene
    // ================================================================

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 1000);
    camera.position.set(0, CAM_HEIGHT, CAM_DIST);
    camera.lookAt(0, 0, -10);

    const clock = new THREE.Clock();

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.4);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(-50, 30, -20);
    scene.add(dirLight);

    // ================================================================
    // Geometry: use template's index buffer with our storage attributes
    // ================================================================

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(templateGeo.getIndex());
    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("normal", normalAttr);
    geometry.setAttribute("color", colorAttr);

    // Done with template
    templateGeo.dispose();

    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      vertexColors: true,
    });

    const plane = new THREE.Mesh(geometry, material);
    // Same rotation as original — plane is in XY local space, rotate to XZ
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    // Renderer
    const renderer = makeWebGPURenderer(context, { antialias: false });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    let waveTime = 0;
    let flightOffset = 0;

    function animate() {
      if (disposed) return;

      const delta = Math.min(clock.getDelta(), MAX_DELTA_SECONDS);
      waveTime += delta * WAVE_SPEED;
      flightOffset += delta * FLY_SPEED;

      (waveTimeU as unknown as { value: number }).value = waveTime;
      (flightOffsetU as unknown as { value: number }).value = flightOffset;
      (grayscaleU as unknown as { value: number }).value = grayscaleRef.current
        ? 1.0
        : 0.0;

      // Compute positions + colors every frame.
      renderer.compute(computePositions);
      renderer.compute(computeNormals);

      renderer.render(scene, camera);
      context!.present();
    }

    renderer.init().then(() => {
      if (!disposed) {
        renderer.setAnimationLoop(animate);
      }
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(plane, dirLight, hemiLight);
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
