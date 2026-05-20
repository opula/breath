import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import tw from "../../utils/tw";
import { HorizontalDial } from "../../components/HorizontalDial";
import { Overline } from "../../components/Overline";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  exerciseByIdSelector,
  exercisesSelector,
} from "../../state/exercises.selectors";
import { setLastPlayed } from "../../state/lastPlayed.reducer";
import { MainStackParams } from "../../navigation";
import { LAST_EXERCISE, storage } from "../../utils/storage";

type Nav = StackNavigationProp<MainStackParams, "ExerciseTimer">;

const TRAY_HEIGHT = 360;
const DEFAULT_TIMER_MINUTES = 10;

export const ExerciseTimer = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParams, "ExerciseTimer">>();
  const { exerciseId } = route.params;
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const exercises = useAppSelector(exercisesSelector);
  const exercise = useAppSelector((s) => exerciseByIdSelector(s, exerciseId));
  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_TIMER_MINUTES);

  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);

  const trayHeight = TRAY_HEIGHT + insets.bottom;
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const dismiss = () => {
    translateY.value = withTiming(trayHeight, { duration: 200 });
    setTimeout(() => navigation.goBack(), 200);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(
        0,
        Math.min(startY.value + e.translationY, trayHeight),
      );
    })
    .onEnd(() => {
      const shouldDismiss = translateY.value > 80;
      translateY.value = withTiming(shouldDismiss ? trayHeight : 0, {
        duration: 200,
      });
      if (shouldDismiss) runOnJS(navigation.goBack)();
    });

  const durationLabel = useMemo(
    () => `${selectedMinutes} minute${selectedMinutes === 1 ? "" : "s"}`,
    [selectedMinutes],
  );

  const handleStart = () => {
    const index = exercises.findIndex((e) => e.id === exerciseId);
    if (index >= 0) {
      storage.set(LAST_EXERCISE, index);
      dispatch(setLastPlayed(exerciseId));
    }

    translateY.value = withTiming(trayHeight, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () =>
          navigation.navigate("Main", {
            autoplay: true,
            timerMinutes: selectedMinutes,
          }),
        50,
      );
    }, 200);
  };

  if (!exercise) return null;

  return (
    <View style={tw`flex-1 justify-end`}>
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

      <Animated.View
        style={[
          animatedStyle,
          tw`bg-mb-bg border-t border-mb-line`,
          { paddingBottom: insets.bottom + 16 },
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <Animated.View style={tw`justify-center items-center h-10 w-full`}>
            <View style={tw`h-1 w-10 bg-mb-dim rounded-full mt-3`} />
          </Animated.View>
        </GestureDetector>

        <View style={tw`px-6 pb-5 border-b border-mb-line`}>
          <Overline accent right={durationLabel}>
            Timer
          </Overline>
          <View style={tw`mt-3`}>
            <Text
              style={[
                tw`font-display uppercase text-mb-fg text-[28px]`,
                { letterSpacing: -1 },
              ]}
              numberOfLines={1}
            >
              {exercise.name}
            </Text>
          </View>
        </View>

        <View style={tw`px-6 pt-6`}>
          <HorizontalDial
            min={1}
            max={90}
            step={1}
            suffix="min"
            defaultValue={DEFAULT_TIMER_MINUTES}
            onChange={(value) => setSelectedMinutes(Math.round(value))}
          />

          <View style={tw`mt-7`}>
            <Pressable
              onPress={handleStart}
              style={({ pressed }) => [
                tw`flex-row items-center py-4 border-t border-b border-mb-line`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute w-8`,
                  { letterSpacing: 1.5 },
                ]}
              >
                01
              </Text>
              <View style={tw`flex-1`}>
                <Text
                  style={[
                    tw`font-display uppercase text-[20px] text-mb-accent`,
                    { letterSpacing: -0.5 },
                  ]}
                >
                  Start session
                </Text>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
                    { letterSpacing: 1.8 },
                  ]}
                >
                  {durationLabel} target
                </Text>
              </View>
              <Text style={tw`font-mono text-[14px] text-mb-accent`}>▶</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};
