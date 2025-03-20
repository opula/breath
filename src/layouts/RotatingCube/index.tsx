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
import {useDerivedValue} from 'react-native-reanimated';

const ASPECT_RATIO = 360 / 640;

export const RotatingCube = () => {
  const {width} = useWindowDimensions();
  const clock = useClock();
  const height = useMemo(() => width * ASPECT_RATIO, [width]);

  const uniforms = useDerivedValue(() => {
    return {
      // canvas: vec(squareSize, squareSize * ASPECT_RATIO),
      canvas: vec(width, height),
      iTime: clock.value / 1000,
    };
  }, [height, width, clock]);

  return (
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
  );
};
