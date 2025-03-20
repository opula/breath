import {Canvas, Fill, Shader, useClock, vec} from '@shopify/react-native-skia';
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
import {BreathTimer} from '../../components/BreathTimer';

export const SpaceZoom = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const randomSeed = useSharedValue(Math.floor(Math.random() * 100000));

  const breathClock = useSharedValue(0);

  useEffect(() => {
    breathClock.value = withRepeat(
      withSequence(
        withTiming(1, {duration: 6000}),
        withTiming(0, {duration: 6000}),
      ),
      0,
    );
  }, []);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + randomSeed.value,
      iBreath: breathClock.value,
    };
  }, [height, width, clock, randomSeed]);

  return (
    <>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'black',
        }}>
        <Canvas style={{height, width}}>
          <Fill>
            <Shader source={source} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>
      <BreathTimer inhale={6} exhale={6} />
    </>
  );
};
