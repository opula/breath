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

export const Introduction = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const squareSize = useMemo(() => Math.min(height, width), [height, width]);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(squareSize, squareSize),
      iTime: clock.value / 1000,
    };
  }, [squareSize, clock]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'black',
      }}>
      <Canvas style={{height: squareSize, width: squareSize}}>
        <Fill>
          <Shader source={source} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
};
