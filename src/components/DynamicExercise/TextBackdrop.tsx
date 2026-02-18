import React from "react";
import { useWindowDimensions } from "react-native";
import { Canvas, Rect, LinearGradient, vec } from "@shopify/react-native-skia";

const HEIGHT = 360;

export const TextBackdrop = () => {
  const { width } = useWindowDimensions();

  return (
    <Canvas style={{ width, height: HEIGHT }}>
      <Rect x={0} y={0} width={width} height={HEIGHT}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, HEIGHT)}
          colors={[
            "rgba(0,0,0,0)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0.45)",
            "rgba(0,0,0,0.45)",
            "rgba(0,0,0,0.25)",
            "rgba(0,0,0,0)",
          ]}
          positions={[0, 0.2, 0.35, 0.65, 0.8, 1]}
        />
      </Rect>
    </Canvas>
  );
};
