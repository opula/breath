import {
  BlendColor,
  Blur,
  Canvas,
  Fill,
  Group,
  Paint,
  Shader,
  interpolateColors,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useMemo} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';
import {source} from './source';
import {useDerivedValue} from 'react-native-reanimated';

export const Pixels = () => {
  const {width, height} = useWindowDimensions();
  const canvas = vec(width, height);
  const clock = useClock();

  const uniforms = useDerivedValue(() => {
    return {
      canvas,
      clock: clock.value,
    };
  }, [width, height, clock]);

  const paintColor = useDerivedValue(() => {
    return interpolateColors(
      (clock.value / 10000) % 1,
      [0, 0.5, 1],
      ['cyan', 'magenta', 'cyan'],
    );
  }, [clock]);

  const layer = useMemo(() => {
    return (
      <Paint>
        <Blur blur={1.1} />

        <BlendColor color={paintColor} mode="hue" />
        {/* <LinearToSRGBGamma>
          <BlendColor color="black" mode="hue" />
        </LinearToSRGBGamma> */}
      </Paint>
    );
  }, [paintColor]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={{height, width, opacity: 0.5}}>
        <Group layer={layer}>
          <Fill>
            <Shader source={source} uniforms={uniforms} />
          </Fill>
        </Group>
      </Canvas>
    </View>
  );
};
