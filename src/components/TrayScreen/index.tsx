import {NavigationProp, useNavigation} from '@react-navigation/native';
import {useCardAnimation} from '@react-navigation/stack';
import React, {ReactNode, useCallback, useEffect, useMemo} from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
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

  const offsetY = useSharedValue(0);
  const startY = useSharedValue(0);
  const isVerticalDrag = useSharedValue<number>(0); // 0 = unknown, 1 = yes, -1 = no

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      offsetY.value = translateY.value;
      startY.value = event.absoluteY;
      isVerticalDrag.value = 0;
    })
    .onUpdate((event) => {
      if (!dismissable) return;

      if (isVerticalDrag.value === 0) {
        const verticalDistance = Math.abs(event.absoluteY - startY.value);
        const horizontalDistance = Math.abs(event.translationX);

        if (verticalDistance > 10 || horizontalDistance > 10) {
          isVerticalDrag.value = verticalDistance > horizontalDistance * 1.5 ? 1 : -1;
        } else {
          return;
        }
      }

      if (isVerticalDrag.value !== 1) return;
      if (event.translationY < 20) return;

      translateY.value = clamp(
        event.translationY + offsetY.value,
        0,
        fullHeight,
      );
    })
    .onEnd(() => {
      if (!dismissable) return;

      if (isVerticalDrag.value !== 1) {
        translateY.value = withTiming(0, {duration: 300});
        return;
      }

      const thresholdMet = translateY.value > 180;
      translateY.value = withTiming(thresholdMet ? fullHeight : 0, {
        duration: 300,
      });

      if (thresholdMet) runOnJS(navigation.goBack)();
    });

  return (
    <View style={tw`flex-1 justify-end items-center`}>
      <Pressable
        style={[StyleSheet.absoluteFill]}
        onPress={dismissable ? dismissOutside : undefined}>
        <Animated.View
          style={[StyleSheet.absoluteFill, animatedBackgroundStyles, tw`bg-backdrop opacity-0`]}
        />
      </Pressable>

      <Animated.View
        style={[animatedTrayStyles, tw`bg-neutral-900 rounded-t-3xl`, {
          height: fullHeight,
          width: Math.min(540, width)
        }]}>
        {/* Dedicated drag handle area - only this area responds to the pan gesture */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={tw`justify-center items-center h-[40px] w-full`}>
            <View
              style={tw`h-1 w-20 bg-neutral-800 rounded-sm mt-3`}
            />
          </Animated.View>
        </GestureDetector>
        <View style={tw`px-4 flex-1`}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
};
