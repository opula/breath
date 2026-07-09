// https://github.com/wcandillon/react-native-webgpu/blob/578ad989b4326724702b14245d5c82622849ee23/apps/example/src/ThreeJS/components/FiberCanvas.tsx#L1
import * as THREE from "three/webgpu";
import React, { useEffect, useRef } from "react";
import type { ReconcilerRoot, RootState } from "@react-three/fiber";
import {
  extend,
  createRoot,
  unmountComponentAtNode,
  events,
} from "@react-three/fiber";
import type { ViewProps } from "react-native";
import { PixelRatio } from "react-native";
import { Canvas, type CanvasRef, type NativeCanvas } from "react-native-webgpu";

import { makeWebGPURenderer, ReactNativeCanvas } from "./make-webgpu-renderer";

interface FiberCanvasProps {
  children: React.ReactNode;
  style?: ViewProps["style"];
  camera?: THREE.PerspectiveCamera;
  scene?: THREE.Scene;
}

export const FiberCanvas = ({
  children,
  style,
  scene,
  camera,
}: FiberCanvasProps) => {
  const root = useRef<ReconcilerRoot<OffscreenCanvas> | null>(null);
  // @ts-expect-error - extend expects different type signature
  React.useMemo(() => extend(THREE), []);
  const canvasRef = useRef<CanvasRef>(null);
  useEffect(() => {
    const context = canvasRef.current?.getContext("webgpu");
    if (!context) {
      return;
    }
    const renderer = makeWebGPURenderer(context);

    const rnCanvas = new ReactNativeCanvas(context.canvas as unknown as NativeCanvas);
    rnCanvas.width = rnCanvas.clientWidth * PixelRatio.get();
    rnCanvas.height = rnCanvas.clientHeight * PixelRatio.get();
    const size = {
      top: 0,
      left: 0,
      width: rnCanvas.clientWidth,
      height: rnCanvas.clientHeight,
    };

    const canvas = rnCanvas as unknown as HTMLCanvasElement;
    const rootInstance = createRoot(canvas);
    root.current = rootInstance;
    rootInstance.configure({
      size,
      events,
      scene,
      camera,
      gl: renderer,
      frameloop: "always",
      dpr: 1, //PixelRatio.get(),
      onCreated: async (state: RootState) => {
        await state.gl.init();
        const renderFrame = state.gl.render.bind(state.gl);
        state.gl.render = (s: THREE.Scene, c: THREE.Camera) => {
          renderFrame(s, c);
          context?.present();
        };
      },
    });
    return () => {
      root.current = null;
      if (canvas != null) {
        unmountComponentAtNode(canvas!);
      }
      renderer.setAnimationLoop(null);
      renderer.dispose();
    };
  }, [camera, scene]);

  useEffect(() => {
    root.current?.render(children);
  }, [children]);

  return <Canvas ref={canvasRef} style={style} />;
};
