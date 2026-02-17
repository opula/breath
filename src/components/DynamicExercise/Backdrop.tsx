import React from "react";
import { Canvas, Circle, RadialGradient, vec } from "@shopify/react-native-skia";

const SIZE = 200;
const CENTER = SIZE / 2;

export const Backdrop = () => {
  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Circle cx={CENTER} cy={CENTER} r={CENTER}>
        <RadialGradient
          c={vec(CENTER, CENTER)}
          r={CENTER}
          colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]}
        />
      </Circle>
    </Canvas>
  );
};
