import {
  Canvas,
  ColorShader,
  Fill,
  ImageShader,
  Paint,
  Shader,
  useClock,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import React, {useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import {source} from './source';
import {source as bufferA} from './buffer-a';
import {useDerivedValue} from 'react-native-reanimated';

const ASPECT_RATIO = 360 / 640;

export const Conways = () => {
  const {width} = useWindowDimensions();
  const clock = useClock();
  const height = useMemo(() => width * ASPECT_RATIO, [width]);
  const image = useImage(require('./texture-md.png'));

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000,
    };
  }, [height, width, clock]);

  if (!image) {
    return null;
  }

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
          <Shader source={source} uniforms={uniforms}>
            <Shader source={bufferA} uniforms={uniforms}>
              <ImageShader
                image={image}
                fit="cover"
                rect={{x: 0, y: 0, width, height}}
              />
            </Shader>
          </Shader>
        </Fill>
      </Canvas>
    </View>
  );
};
