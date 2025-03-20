import {useKeepAwake} from '@sayem314/react-native-keep-awake';
import {
  Canvas,
  ColorMatrix,
  Fill,
  Group,
  Shader,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import React, {useCallback, useEffect, useState} from 'react';
import {View, TouchableOpacity, useWindowDimensions} from 'react-native';
import {useDerivedValue, useSharedValue} from 'react-native-reanimated';
import {DynamicExercise} from '../../components/DynamicExercise';

import {source as SpaceGifSource} from '../SpaceGif/source';
import {source as StarfieldSource} from '../Starfield/source';
import {source as BlocksSource} from '../Blocks/source';
import {source as AuroraSource} from '../Aurora/source';
import {source as ButterflySource} from '../Butterfly/source';
import {source as TunnelSource} from '../Tunnel/source';

import {LAST_GRAYSCALE, LAST_SOURCE, storage} from '../../utils/storage';
import {Icon} from '../../components/Icon';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AnimatePresence, MotiView} from 'moti';
import tw from '../../utils/tw';

const sources = [
  SpaceGifSource,
  StarfieldSource,
  BlocksSource,
  AuroraSource,
  ButterflySource,
  TunnelSource,
];

export const Home = () => {
  useKeepAwake();
  const {width, height} = useWindowDimensions();
  const {top} = useSafeAreaInsets();
  const clock = useClock();
  const randomSeed = useSharedValue(Math.floor(Math.random() * 100000));
  const breathClock = useSharedValue(0);

  const [sourceIndex, setSourceIndex] = useState(
    storage.getNumber(LAST_SOURCE) ?? 0,
  );
  const [isPaused, setPaused] = useState(true);
  const [isGrayscale, toggleGrayscale] = useState(
    storage.getBoolean(LAST_GRAYSCALE) ?? false,
  );

  const changeSource = useCallback((direction: number) => {
    setSourceIndex(sourceIndex => {
      const nextIndex = (sourceIndex + direction) % sources.length;
      return nextIndex > -1 ? nextIndex : sources.length - 1;
    });
  }, []);

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + randomSeed.value,
      iBreath: breathClock.value,
    };
  }, [breathClock, height, width, clock]);

  useEffect(() => {
    storage.set(LAST_SOURCE, sourceIndex);
  }, [sourceIndex]);

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
              <Shader source={sources[sourceIndex]} uniforms={uniforms} />
            </Fill>
            <ColorMatrix
              matrix={
                isGrayscale
                  ? [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0]
                  : [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]
              }
            />
          </Group>
        </Canvas>
      </View>

      <AnimatePresence>
        {isPaused ? (
          <MotiView
            from={{opacity: 0}}
            animate={{opacity: 0.35}}
            exit={{opacity: 0}}
            transition={{opacity: {type: 'timing', duration: 300}}}
            style={tw`absolute bg-black inset-0`}
            pointerEvents="none"
          />
        ) : null}
      </AnimatePresence>

      <DynamicExercise onChangeSource={changeSource} onPause={setPaused} />

      <AnimatePresence>
        {isPaused ? (
          <MotiView
            from={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{opacity: {type: 'timing', duration: 300}}}
            style={[tw`absolute`, {left: 24, top: Math.max(top, 16)}]}>
            <TouchableOpacity
              style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
              onPress={() => {
                const updatedValue = !isGrayscale;
                toggleGrayscale(updatedValue);
                storage.set(LAST_GRAYSCALE, updatedValue);
              }}>
              <Icon name="moon" size={24} color="white" />
            </TouchableOpacity>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </>
  );
};
