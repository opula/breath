import {
  Canvas,
  Fill,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useEffect} from 'react';
import {
  View,
  useWindowDimensions,
  Text,
} from 'react-native';
import {testSource} from './test-shader';

import {
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import tw from '../../utils/tw';

// Test component using simplified shader
export const SpaceGifTest = () => {
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const randomSeed = useSharedValue(Math.floor(Math.random() * 100000));
  const breathClock = useSharedValue(0.5); // Set to middle value for testing

  useEffect(() => {
    // Simple oscillation for breathing
    breathClock.value = withRepeat(
      withSequence(
        withTiming(1, {duration: 3000}),
        withTiming(0, {duration: 3000}),
      ),
      -1, // Infinite repeat
    );
  }, []);

  const uniforms = useDerivedValue(() => {
    console.log("TEST - Canvas Size:", width, height);
    console.log("TEST - Breath Value:", breathClock.value);
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000,
      iBreath: breathClock.value,
    };
  }, [height, width, clock]);

  return (
    <View style={tw`flex-1 justify-center items-center bg-green-900`}>
      <Text style={tw`absolute top-10 z-10 text-white text-lg font-bold`}>
        Testing Shader Visibility
      </Text>
      <Canvas style={{height, width}}>
        <Fill>
          <Shader source={testSource} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
};