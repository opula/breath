import React, { memo, useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  Canvas,
  ColorMatrix,
  Fill,
  Group,
  Shader,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import { MotiView } from "moti";
import tw from "../../utils/tw";

import { LAST_SOURCE, storage } from "../../utils/storage";
import { useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  sourceIndexSelector,
} from "../../state/configuration.selectors";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import { sources } from "./sources";

const BW_COLOR_MATRIX = [
  0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
];
const NORMAL_COLOR_MATRIX = [
  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
];
const RND_SEED = Math.floor(Math.random() * 100000);

export const Background = memo(() => {
  const { width, height } = useWindowDimensions();

  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const sourceIndex = useAppSelector(sourceIndexSelector);

  const clock = useClock();
  const randomSeed = useSharedValue(RND_SEED);
  const breathClock = useSharedValue(0);
  const quality = useSharedValue(1);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + randomSeed.value,
      iBreath: breathClock.value,
      // quality: quality.value,
    };
  }, [breathClock, height, width, clock]);

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`flex-1 justify-center items-center`}
    >
      <Canvas style={{ height, width }}>
        <Group>
          <Fill>
            <Shader source={sources[sourceIndex]} uniforms={uniforms} />
            {/* <Shader source={BlocksSource} uniforms={uniforms} /> */}
          </Fill>
          <ColorMatrix
            matrix={isGrayscale ? BW_COLOR_MATRIX : NORMAL_COLOR_MATRIX}
          />
        </Group>
      </Canvas>
    </MotiView>
  );
});
