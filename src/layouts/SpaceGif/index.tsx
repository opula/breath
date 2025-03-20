import {
  Canvas,
  Fill,
  Group,
  Paint,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useEffect, useMemo, useState} from 'react';
import {
  TouchableWithoutFeedback,
  Vibration,
  View,
  Text,
  useWindowDimensions,
} from 'react-native';
import {source} from './source';

import {source as blackCenterSource} from '../../shaders/blackCenter';
import {
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import tw from '../../utils/tw';
import {BreathTimer} from '../../components/BreathTimer';
import {useKeepAwake} from '@sayem314/react-native-keep-awake';
import {DynamicExercise} from '../../components/DynamicExercise';

const ASPECT_RATIO = 360 / 640;

export const SpaceGif = () => {
  useKeepAwake();
  const {width, height} = useWindowDimensions();
  const clock = useClock();
  const randomSeed = useSharedValue(Math.floor(Math.random() * 100000));
  const breathClock = useSharedValue(0);

  useEffect(() => {
    breathClock.value = withRepeat(
      withSequence(
        withTiming(1, {duration: 6000}, () => {
          runOnJS(Vibration.vibrate)(500);
        }),
        withTiming(0, {duration: 6000}, () => {
          runOnJS(Vibration.vibrate)(500);
        }),
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
        style={tw`flex-1 justify-center items-center bg-black`}>
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
