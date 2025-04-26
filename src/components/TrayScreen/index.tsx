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
    {offsetY: number; startY: number; isVerticalDrag: boolean | null}
  >(
    {
      onStart: (event, context) => {
        context.offsetY = translateY.value;
        context.startY = event.absoluteY;
        context.isVerticalDrag = null; // We don't know yet if this is a vertical drag
      },
      onActive: (event, context) => {
        if (!dismissable) return;

        // Only determine direction once, when we have enough movement to be confident
        if (context.isVerticalDrag === null) {
          const verticalDistance = Math.abs(event.absoluteY - context.startY);
          const horizontalDistance = Math.abs(event.translationX);

          // If we've moved at least 10 pixels, determine if this is primarily a vertical gesture
          if (verticalDistance > 10 || horizontalDistance > 10) {
            // If the vertical movement is significantly more than horizontal, consider it a vertical drag
            context.isVerticalDrag = verticalDistance > horizontalDistance * 1.5;
          } else {
            // Not enough movement yet to determine direction
            return;
          }
        }

        // If this isn't primarily a vertical drag, don't move the tray
        if (!context.isVerticalDrag) return;

        // Apply a minimum threshold to make it less sensitive
        if (event.translationY < 20) return;

        translateY.value = clamp(
          event.translationY + context.offsetY,
          0,
          fullHeight,
        );
      },
      onEnd: (event, context) => {
        if (!dismissable) return;

        // If we never determined this was a vertical drag, don't dismiss
        if (!context.isVerticalDrag) {
          translateY.value = withTiming(0, {duration: 300});
          return;
        }

        // Increase the threshold for dismissal
        const thresholdMet = translateY.value > 180; // Increased from 120 to 180
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

      <Animated.View
        style={[animatedTrayStyles, tw`bg-neutral-900 rounded-t-3xl`, {
          height: fullHeight,
          width: Math.min(540, width)
        }]}>
        {/* Dedicated drag handle area - only this area responds to the pan gesture */}
        <PanGestureHandler onGestureEvent={panGestureEvent}>
          <Animated.View style={tw`justify-center items-center h-[40px] w-full`}>
            <View
              style={tw`h-1 w-20 bg-neutral-800 rounded-sm mt-3`}
            />
          </Animated.View>
        </PanGestureHandler>
        <View style={tw`px-4 flex-1`}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
};
