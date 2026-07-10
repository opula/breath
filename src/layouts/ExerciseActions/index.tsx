import React, { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { AppSheet, AppSheetHandle } from "../../components/AppSheet";
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

  const exercises = useAppSelector(exercisesSelector);
  const exerciseLive = useAppSelector((s) =>
    exerciseByIdSelector(s, exerciseId),
  );
  // Keep the last non-null exercise so the sheet can animate closed after
  // Delete removes it from the store.
  const exerciseRef = useRef(exerciseLive);
  if (exerciseLive) exerciseRef.current = exerciseLive;
  const exercise = exerciseLive ?? exerciseRef.current;

  const isFavorite = useAppSelector(isFavoriteSelector(exerciseId));
  const isBgEligible = exercise
    ? isExerciseEligibleForBackground(exercise)
    : false;

  const sheetRef = useRef<AppSheetHandle>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  // Close the sheet first; the action runs after it settles and the route pops.
  const pick = (action: () => void) => {
    pendingAction.current = action;
    sheetRef.current?.dismiss();
  };

  const handlePlay = () => {
    const index = exercises.findIndex((e) => e.id === exerciseId);
    if (index >= 0) {
      storage.set(LAST_EXERCISE, index);
      dispatch(setLastPlayed(exerciseId));
    }
    pick(() => navigation.navigate("Main", { autoplay: true }));
  };

  const handleFavorite = () => {
    dispatch(toggleFavorite(exerciseId));
  };

  const handleDelete = () => {
    dispatch(removeExercise({ exerciseId }));
    sheetRef.current?.dismiss();
  };

  if (!exercise) return null;

  const actions: Action[] = [
    {
      key: "play",
      label: "Play now",
      hint: "start the session",
      right: "▶",
      tone: "accent" as const,
      onPick: handlePlay,
    },
    {
      key: "timer",
      label: "Timer",
      hint: "choose a target duration",
      right: "→",
      onPick: () =>
        pick(() => navigation.navigate("ExerciseTimer", { exerciseId })),
    },
    {
      key: "fav",
      label: isFavorite ? "Unfavorite" : "Favorite",
      hint: isFavorite
        ? "remove from the top of the library"
        : "pin to the top of the library",
      right: isFavorite ? "★" : "☆",
      onPick: handleFavorite,
    },
    {
      key: "edit",
      label: "Edit phases",
      hint: "change durations or steps",
      right: "→",
      onPick: () => pick(() => navigation.navigate("Exercise", { id: exerciseId })),
    },
    ...(isBgEligible
      ? [
          {
            key: "audio",
            label: "Background audio",
            hint: "ambient bed during sessions",
            right: "→",
            onPick: () =>
              pick(() =>
                navigation.navigate("BackgroundAudio", { id: exerciseId }),
              ),
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
    <AppSheet
      ref={sheetRef}
      onDismissed={() => {
        pendingAction.current?.();
        pendingAction.current = null;
      }}
    >
      {/* Header */}
      <View style={tw`px-2 pb-5 border-b border-mb-line`}>
        <Overline
          accent
          right={`${exercise.seq.length} phase${exercise.seq.length === 1 ? "" : "s"}`}
        >
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
      <View style={tw`px-2 pb-2`}>
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
            <Text style={[tw`font-mono text-[14px]`, toneStyle(action.tone)]}>
              {action.right}
            </Text>
          </Pressable>
        ))}
      </View>
    </AppSheet>
  );
};
