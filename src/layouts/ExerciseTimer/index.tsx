import React, { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";

import tw from "../../utils/tw";
import { HorizontalDial } from "../../components/HorizontalDial";
import { Overline } from "../../components/Overline";
import { AppSheet, AppSheetHandle } from "../../components/AppSheet";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  exerciseByIdSelector,
  exercisesSelector,
} from "../../state/exercises.selectors";
import { setLastPlayed } from "../../state/lastPlayed.reducer";
import { MainStackParams } from "../../navigation";
import { LAST_EXERCISE, storage } from "../../utils/storage";

type Nav = StackNavigationProp<MainStackParams, "ExerciseTimer">;

const DEFAULT_TIMER_MINUTES = 10;

export const ExerciseTimer = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParams, "ExerciseTimer">>();
  const { exerciseId } = route.params;
  const dispatch = useAppDispatch();

  const exercises = useAppSelector(exercisesSelector);
  const exercise = useAppSelector((s) => exerciseByIdSelector(s, exerciseId));
  const [selectedMinutes, setSelectedMinutes] = useState(DEFAULT_TIMER_MINUTES);

  const sheetRef = useRef<AppSheetHandle>(null);
  const pendingAction = useRef<(() => void) | null>(null);

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
    pendingAction.current = () =>
      navigation.navigate("Main", {
        autoplay: true,
        timerMinutes: selectedMinutes,
      });
    sheetRef.current?.dismiss();
  };

  if (!exercise) return null;

  return (
    <AppSheet
      ref={sheetRef}
      onDismissed={() => {
        pendingAction.current?.();
        pendingAction.current = null;
      }}
    >
      <View style={tw`px-2 pb-5 border-b border-mb-line`}>
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

      <View style={tw`px-2 pt-6 pb-2`}>
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
    </AppSheet>
  );
};
