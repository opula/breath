import {
  Canvas,
  Fill,
  Paint,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useEffect, useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import {source} from './source';
import {
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export const Circle = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const squareSize = useMemo(() => Math.min(height, width), [height, width]);

  const seed = useSharedValue(Math.random() * 100000);
  const breathValue = useSharedValue(seed.value);

  useEffect(() => {
    breathValue.value = withRepeat(
      withSequence(
        withTiming(seed.value + 10, {duration: 2000}),
        withTiming(seed.value, {duration: 1000}),
      ),
      -1,
    );

    seed.value = withRepeat(withTiming(seed.value + 25, {duration: 1000}), -1);
  }, []);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: breathValue.value,
      bgTime: clock.value / 10000,
    };
  }, [squareSize, clock, height, width, clock]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
      }}>
      <Canvas
        style={{
          height,
          width,
        }}>
        <Fill>
          <Shader source={source} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
};
