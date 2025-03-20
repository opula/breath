import {
  Canvas,
  Fill,
  Paint,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import {source} from './source';
import {useDerivedValue, useSharedValue} from 'react-native-reanimated';
import {BreathTimer} from '../../components/BreathTimer';
import {DynamicExercise} from '../../components/DynamicExercise';

const ASPECT_RATIO = 360 / 640;

export const Blocks = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const seed = useSharedValue(Math.random() * 100000);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + seed.value,
    };
  }, [height, width, clock, seed]);

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
      <DynamicExercise />
    </>
  );
};
