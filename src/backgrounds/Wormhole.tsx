import * as THREE from "three";
import type { CanvasRef } from "react-native-wgpu";
import { Canvas } from "react-native-wgpu";
import { View } from "react-native";
import { useEffect, useRef } from "react";
import { ImprovedNoise } from "three/addons/math/ImprovedNoise";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode";

import { makeWebGPURenderer } from "../lib/make-webgpu-renderer";

const radius = 3;
const tubeLength = 200;
const noiseFreq = 0.1;
const noiseAmp = 0.5;
const hueNoiseFreq = 0.005;
const tunnelSpeed = 12;
const rotationSpeed = 0.3;
const radialSegments = 96;
const lengthSegments = 2048;

export const Wormhole = ({ grayscale = false }: { grayscale?: boolean }) => {
  const ref = useRef<CanvasRef>(null);
  const grayscaleRef = useRef(grayscale);
  grayscaleRef.current = grayscale;

  useEffect(() => {
    const context = ref.current?.getContext("webgpu");
    if (!context) {
      return;
    }
    let disposed = false;
    const canvas = context.canvas as unknown as { width: number; height: number };
    const { width, height } = canvas;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.025);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0.5, 0.5, 15);

    const clock = new THREE.Clock();

    const tubeGeo = new THREE.CylinderGeometry(
      radius,
      radius,
      tubeLength,
      radialSegments,
      lengthSegments,
      true,
    );
    const tubeVerts = tubeGeo.attributes.position;
    const colorsArr = new Float32Array(tubeVerts.count * 3);
    const noise = new ImprovedNoise();
    const p = new THREE.Vector3();
    const v3 = new THREE.Vector3();
    const color = new THREE.Color();

    for (let i = 0; i < tubeVerts.count; i++) {
      p.fromBufferAttribute(tubeVerts, i);
      v3.copy(p);

      const vertexNoise = noise.noise(
        v3.x * noiseFreq,
        v3.y * noiseFreq,
        v3.z,
      );
      v3.addScaledVector(p, vertexNoise * noiseAmp);
      tubeVerts.setXYZ(i, v3.x, p.y, v3.z);

      const colorNoise = noise.noise(
        v3.x * hueNoiseFreq,
        v3.y * hueNoiseFreq,
        i * 0.001 * hueNoiseFreq,
      );
      color.setHSL(0.5 - colorNoise, 1, 0.5);
      const colorOffset = i * 3;
      colorsArr[colorOffset] = color.r;
      colorsArr[colorOffset + 1] = color.g;
      colorsArr[colorOffset + 2] = color.b;
    }

    // Pre-compute grayscale vertex colors
    const grayColorsArr = new Float32Array(colorsArr.length);
    for (let i = 0; i < colorsArr.length; i += 3) {
      const lum =
        colorsArr[i] * 0.299 +
        colorsArr[i + 1] * 0.587 +
        colorsArr[i + 2] * 0.114;
      grayColorsArr[i] = lum;
      grayColorsArr[i + 1] = lum;
      grayColorsArr[i + 2] = lum;
    }

    const activeColorArr = new Float32Array(colorsArr);
    const activeColorAttr = new THREE.BufferAttribute(activeColorArr, 3);

    const tunnelGeo = new THREE.BufferGeometry();
    tunnelGeo.setAttribute("position", tubeVerts.clone());
    tunnelGeo.setAttribute("color", activeColorAttr);

    let wasGrayscale = false;

    const mat = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
    });

    function createTube(index: number) {
      const startPosZ = -tubeLength * index;
      const endPosZ = tubeLength;
      const resetPosZ = -tubeLength;
      const points = new THREE.Points(tunnelGeo, mat);
      points.rotation.x = Math.PI * 0.5;
      points.position.z = startPosZ;

      function update(delta: number) {
        points.rotation.y += rotationSpeed * delta;
        points.position.z += tunnelSpeed * delta;
        if (points.position.z > endPosZ) {
          points.position.z = resetPosZ;
        }
      }

      return { points, update };
    }

    const tubeA = createTube(0);
    const tubeB = createTube(1);
    const tubes = [tubeA, tubeB];
    scene.add(tubeA.points, tubeB.points);

    const renderer = makeWebGPURenderer(context, { antialias: false });
    void renderer.init();
    renderer.toneMapping = THREE.ReinhardToneMapping;

    const postProcessing = new THREE.PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode("output");
    const bloomPass = bloom(scenePassColor);
    postProcessing.outputNode = scenePassColor.add(bloomPass);

    function animate() {
      if (disposed) {
        return;
      }
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      // Swap vertex colors for grayscale (only on change)
      const isGray = grayscaleRef.current;
      if (isGray !== wasGrayscale) {
        activeColorArr.set(isGray ? grayColorsArr : colorsArr);
        activeColorAttr.needsUpdate = true;
        wasGrayscale = isGray;
      }

      tubes.forEach((tb) => tb.update(delta));

      camera.position.x = Math.cos(elapsed * 0.6) * 1.5;
      camera.position.y = Math.sin(elapsed * 0.6) * 1.5;

      postProcessing.render();
      context!.present();
    }

    renderer.setAnimationLoop(animate);

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      scene.remove(tubeA.points, tubeB.points);
      tunnelGeo.dispose();
      tubeGeo.dispose();
      mat.dispose();
      (postProcessing as { dispose?: () => void }).dispose?.();
      renderer.dispose();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Canvas ref={ref} style={{ flex: 1 }} />
    </View>
  );
};
