import {
  BlendColor,
  Canvas,
  ColorMatrix,
  Fill,
  Group,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import {source} from './source';
import {DynamicExercise} from '../../components/DynamicExercise';
import {useDerivedValue} from 'react-native-reanimated';

export const Butterfly = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000,
    };
  }, [height, width, clock]);

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
          <Group>
            <Fill>
              <Shader source={source} uniforms={uniforms} />
            </Fill>
            <ColorMatrix
              matrix={[
                0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0,
              ]}
            />
          </Group>
        </Canvas>
      </View>

      {/* <DynamicExercise /> */}
    </>
  );
};
