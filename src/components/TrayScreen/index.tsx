import {NavigationProp, useNavigation} from '@react-navigation/native';
import {useCardAnimation} from '@react-navigation/stack';
import React, {ReactNode, useCallback, useEffect, useMemo} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {clamp} from 'react-native-redash';
import {View} from 'react-native';
import tw from '../../utils/tw';
import {delay} from 'lodash';
import {useDebouncedCallback} from 'use-debounce';

const ADDITIONAL_HEIGHT = 20;

interface TrayScreenProps {
  trayHeight: number;
  children: ReactNode;
  dismissable?: boolean;
}

export const TrayScreen = ({
  trayHeight,
  dismissable = true,
  children,
}: TrayScreenProps) => {
  const {height, width} = useWindowDimensions();
  const {current} = useCardAnimation();
  const navigation = useNavigation();
  const progress = useSharedValue(0);
  const translateY = useSharedValue(0);

  const fullHeight = useMemo(
    () => trayHeight + (height > 720 ? ADDITIONAL_HEIGHT : 0),
    [trayHeight, height],
  );

  const dismissOutside = useDebouncedCallback(
    () => {
      translateY.value = withTiming(fullHeight, {duration: 300});
      delay(navigation.goBack, 300);
    },
    1000,
    {leading: true, trailing: false},
  );

  useEffect(() => {
    current.progress.addListener(({value}) => (progress.value = value));

    return () => {
      current.progress.removeAllListeners();
    };
  }, []);

  const animatedBackgroundStyles = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.7, 1], [0, 0.7]),
  }));

  const animatedTrayStyles = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          interpolate(progress.value, [0, 1], [height, 0]) + translateY.value,
      },
    ],
  }));

  const panGestureEvent = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    {offsetY: number}
  >(
    {
      onStart: (event, context) => {
        if (!dismissable) return;

        context.offsetY = translateY.value;
      },
      onActive: (event, context) => {
        if (!dismissable) return;

        translateY.value = clamp(
          event.translationY + context.offsetY,
          0,
          fullHeight,
        );
      },
      onEnd: (event, context) => {
        if (!dismissable) return;

        const thresholdMet = translateY.value > 120;
        translateY.value = withTiming(thresholdMet ? fullHeight : 0, {
          duration: 300,
        });

        if (thresholdMet) runOnJS(navigation.goBack)();
      },
    },
    [navigation],
  );

  return (
    <View style={tw`flex-1 justify-end items-center`}>
      <Pressable
        style={[StyleSheet.absoluteFill]}
        onPress={dismissable ? dismissOutside : undefined}>
        <Animated.View
          style={[StyleSheet.absoluteFill, animatedBackgroundStyles, tw`bg-backdrop opacity-0`]}
        />
      </Pressable>

      <PanGestureHandler onGestureEvent={panGestureEvent}>
        <Animated.View
          style={[animatedTrayStyles, tw`bg-neutral-900 rounded-t-3xl`, {
            height: fullHeight,
            width: Math.min(540, width)
          }]}>
          <View style={tw`justify-center items-center h-[28px]`}>
            <View
              style={tw`h-1 w-20 bg-neutral-800 rounded-sm`}
            />
          </View>
          <View style={tw`px-4 flex-1`}>
            {children}
          </View>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};
