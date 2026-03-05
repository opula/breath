import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect } from "react";
import { Text, View } from "react-native";
import { DynamicExercise } from "../../components/DynamicExercise";
import { CoachOverlay } from "../../components/CoachOverlay";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatePresence, MotiView } from "moti";
import { Pressable } from "react-native";
import tw from "../../utils/tw";
import {
  NavigationProp,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Background } from "./Background";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import {
  isPausedSelector,
  hasSeenTutorialSelector,
} from "../../state/configuration.selectors";
import {
  setPause as setPauseAction,
  dismissTutorial as dismissTutorialAction,
} from "../../state/configuration.reducer";

const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours

const NAV_ITEMS = [
  { label: "exercises", screen: "ExercisesList" as const },
  { label: "music", screen: "MusicControls" as const },
  { label: "scenes", screen: "Scenes" as const },
  { label: "settings", screen: "Settings" as const },
];

export const Main = () => {
  useEffect(() => {
    activateKeepAwakeAsync();

    const timer = setTimeout(
      () => deactivateKeepAwake(),
      KEEP_AWAKE_TIMEOUT_MS,
    );

    return () => {
      clearTimeout(timer);
      deactivateKeepAwake();
    };
  }, []);
  const navigation = useNavigation<NavigationProp<MainStackParams, "Main">>();
  const dispatch = useAppDispatch();
  const isFocused = useIsFocused();
  const isAppActive = useAppIsActive();
  const { top, right } = useSafeAreaInsets();

  const isPaused = useAppSelector(isPausedSelector);
  const hasSeenTutorial = useAppSelector(hasSeenTutorialSelector);

  const setPause = useCallback(
    (status: boolean) => {
      dispatch(setPauseAction(status));
      if (!hasSeenTutorial) dispatch(dismissTutorialAction());
    },
    [dispatch, hasSeenTutorial],
  );

  return (
    <>
      <View style={tw`flex-1 bg-black`}>
        <AnimatePresence>{isAppActive ? <Background /> : null}</AnimatePresence>
      </View>

      <AnimatePresence>
        {isPaused ? (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={tw`absolute inset-0 bg-black`}
            pointerEvents="none"
          />
        ) : null}
      </AnimatePresence>

      <View style={tw`absolute inset-0`}>
        <DynamicExercise onPause={setPause} />
      </View>

      <CoachOverlay />

      {isPaused && isFocused ? (
        <View
          style={[
            tw`absolute items-end`,
            {
              right: Math.max(right, 20),
              top: Math.max(top, 16) + 8,
            },
          ]}
        >
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.screen}
              style={tw`py-3 active:opacity-50`}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text
                style={tw`text-sm font-inter font-medium text-neutral-100 uppercase tracking-widest`}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
};
