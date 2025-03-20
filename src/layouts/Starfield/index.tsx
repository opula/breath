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
import {DynamicExercise} from '../../components/DynamicExercise';

export const Starfield = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const randomSeed = useSharedValue(Math.floor(Math.random() * 100000));
  const breathClock = useSharedValue(0);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + randomSeed.value,
      iBreath: breathClock.value,
    };
  }, [clock, height, width, clock]);

  return (
    <>
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
      <DynamicExercise />
    </>
  );
};
