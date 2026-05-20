import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  exerciseByIdSelector,
  exercisesSelector,
} from "../../state/exercises.selectors";
import { isFavoriteSelector } from "../../state/favorites.selectors";
import { toggleFavorite } from "../../state/favorites.reducer";
import { removeExercise } from "../../state/exercises.reducer";
import { setLastPlayed } from "../../state/lastPlayed.reducer";
import { isExerciseEligibleForBackground } from "../../services/BackgroundAudio/exerciseEligibility";
import { LAST_EXERCISE, storage } from "../../utils/storage";
import { MainStackParams } from "../../navigation";

type Nav = StackNavigationProp<MainStackParams, "ExerciseActions">;

const TRAY_HEIGHT = 540;

type Tone = "accent" | "danger" | undefined;

type Action = {
  key: string;
  label: string;
  hint: string;
  right: string;
  tone?: Tone;
  onPick: () => void;
};

export const ExerciseActions = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParams, "ExerciseActions">>();
  const { exerciseId } = route.params;
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const exercises = useAppSelector(exercisesSelector);
  const exercise = useAppSelector((s) => exerciseByIdSelector(s, exerciseId));
  const isFavorite = useAppSelector(isFavoriteSelector(exerciseId));
  const isBgEligible = exercise
    ? isExerciseEligibleForBackground(exercise)
    : false;

  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const dismiss = () => {
    translateY.value = withTiming(TRAY_HEIGHT, { duration: 200 });
    setTimeout(() => navigation.goBack(), 200);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(
        0,
        Math.min(startY.value + e.translationY, TRAY_HEIGHT),
      );
    })
    .onEnd(() => {
      const shouldDismiss = translateY.value > 80;
      translateY.value = withTiming(shouldDismiss ? TRAY_HEIGHT : 0, {
        duration: 200,
      });
      if (shouldDismiss) runOnJS(navigation.goBack)();
    });

  const handlePlay = () => {
    const index = exercises.findIndex((e) => e.id === exerciseId);
    if (index >= 0) {
      storage.set(LAST_EXERCISE, index);
      dispatch(setLastPlayed(exerciseId));
    }
    translateY.value = withTiming(TRAY_HEIGHT, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () => navigation.navigate("Main", { autoplay: true }),
        50,
      );
    }, 200);
  };

  const handleTimer = () => {
    translateY.value = withTiming(TRAY_HEIGHT, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () => navigation.navigate("ExerciseTimer", { exerciseId }),
        50,
      );
    }, 200);
  };

  const handleFavorite = () => {
    dispatch(toggleFavorite(exerciseId));
  };

  const handleEdit = () => {
    translateY.value = withTiming(TRAY_HEIGHT, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () => navigation.navigate("Exercise", { id: exerciseId }),
        50,
      );
    }, 200);
  };

  const handleBgAudio = () => {
    translateY.value = withTiming(TRAY_HEIGHT, { duration: 200 });
    setTimeout(() => {
      navigation.goBack();
      setTimeout(
        () => navigation.navigate("BackgroundAudio", { id: exerciseId }),
        50,
      );
    }, 200);
  };

  const handleDelete = () => {
    dispatch(removeExercise({ exerciseId }));
    dismiss();
  };

  if (!exercise) return null;

  const actions: Action[] = [
    {
      key: "play",
      label: "Play now",
      hint: "start the session",
      tone: "accent",
      right: "▶",
      onPick: handlePlay,
    },
    {
      key: "timer",
      label: "Timer",
      hint: "choose a target duration",
      right: "→",
      onPick: handleTimer,
    },
    {
      key: "fav",
      label: isFavorite ? "Unfavorite" : "Favorite",
      hint: isFavorite
        ? "remove from top of library"
        : "pin to the top of the library",
      right: isFavorite ? "★" : "☆",
      onPick: handleFavorite,
    },
    {
      key: "edit",
      label: "Edit phases",
      hint: "change durations or steps",
      right: "→",
      onPick: handleEdit,
    },
    ...(isBgEligible
      ? [
          {
            key: "audio",
            label: "Background audio",
            hint: "ambient bed during practice",
            right: "→",
            onPick: handleBgAudio,
          } as Action,
        ]
      : []),
    {
      key: "del",
      label: "Delete",
      hint: "remove from library",
      tone: "danger" as const,
      right: "✕",
      onPick: handleDelete,
    },
  ];

  const toneStyle = (tone?: Tone) => {
    if (tone === "accent") return tw`text-mb-accent`;
    if (tone === "danger") return tw`text-mb-warn`;
    return tw`text-mb-fg`;
  };

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
        {/* Drag handle */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={tw`justify-center items-center h-10 w-full`}>
            <View style={tw`h-1 w-10 bg-mb-dim rounded-full mt-3`} />
          </Animated.View>
        </GestureDetector>

        {/* Header */}
        <View style={tw`px-6 pb-5 border-b border-mb-line`}>
          <Overline accent right={`${exercise.seq.length} phases`}>
            Actions
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

        {/* Actions */}
        <View style={tw`px-6`}>
          {actions.map((action, i) => (
            <Pressable
              key={action.key}
              onPress={action.onPick}
              style={({ pressed }) => [
                tw`flex-row items-center py-4 border-b border-mb-line`,
                pressed && tw`opacity-70`,
              ]}
            >
              <Text
                style={[
                  tw`font-mono text-[10px] text-mb-mute w-8`,
                  { letterSpacing: 1.5 },
                ]}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={tw`flex-1`}>
                <Text
                  style={[
                    tw`font-display uppercase text-[20px]`,
                    toneStyle(action.tone),
                    { letterSpacing: -0.5 },
                  ]}
                >
                  {action.label}
                </Text>
                <Text
                  style={[
                    tw`font-mono text-[9px] text-mb-mute uppercase mt-1`,
                    { letterSpacing: 1.8 },
                  ]}
                >
                  {action.hint}
                </Text>
              </View>
              <Text
                style={[tw`font-mono text-[14px]`, toneStyle(action.tone)]}
              >
                {action.right}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};
