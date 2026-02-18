import { activateKeepAwake, deactivateKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { DynamicExercise } from "../../components/DynamicExercise";

import { Icon } from "../../components/Icon";
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
import {
  isPausedSelector,
  isGrayscaleSelector,
  soundsEnabledSelector,
  hapticsEnabledSelector,
} from "../../state/configuration.selectors";
import {
  toggleGrayscale as toggleGrayscaleAction,
  togglePaused as togglePausedAction,
  setPause as setPauseAction,
  toggleSounds as toggleSoundsAction,
  toggleHaptics as toggleHapticsAction,
} from "../../state/configuration.reducer";

const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours

export const Main = () => {
  useEffect(() => {
    activateKeepAwake();
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
  const { left, bottom } = useSafeAreaInsets();

  const isPaused = useAppSelector(isPausedSelector);
  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const soundsEnabled = useAppSelector(soundsEnabledSelector);
  const hapticsEnabled = useAppSelector(hapticsEnabledSelector);

  const [toastMessage, setToastMessage] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(""), 2000);
  }, []);

  const togglePaused = useCallback(
    () => dispatch(togglePausedAction()),
    [dispatch],
  );
  const setPause = useCallback(
    (status: boolean) => dispatch(setPauseAction(status)),
    [dispatch],
  );
  const toggleGrayscale = useCallback(() => {
    dispatch(toggleGrayscaleAction());
    showToast(isGrayscale ? "Color mode" : "Grayscale mode");
  }, [dispatch, showToast, isGrayscale]);
  const toggleSounds = useCallback(() => {
    dispatch(toggleSoundsAction());
    showToast(soundsEnabled ? "Sounds off" : "Sounds on");
  }, [dispatch, showToast, soundsEnabled]);
  const toggleHaptics = useCallback(() => {
    dispatch(toggleHapticsAction());
    showToast(hapticsEnabled ? "Vibrations off" : "Vibrations on");
  }, [dispatch, showToast, hapticsEnabled]);

  return (
    <>
      <View style={tw`flex-1 bg-black`}>
        {/* <AnimatePresence>{isFocused ? <Background /> : null}</AnimatePresence> */}
        <AnimatePresence>
          <Background />
        </AnimatePresence>
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

      <AnimatePresence>
        {isPaused && isFocused ? (
          <MotiView
            key="left"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={[
              tw`absolute top-0 bottom-0 justify-center`,
              {
                left: Math.max(left, 16),
              },
            ]}
          >
            <Pressable
              style={tw`h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={toggleGrayscale}
            >
              <Icon
                name="moon"
                size={22}
                color={isGrayscale ? "white" : "#737373"}
              />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={toggleSounds}
            >
              <Icon
                name="volume-max"
                size={22}
                color={soundsEnabled ? "white" : "#737373"}
              />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={toggleHaptics}
            >
              <Icon
                name="bell-ring"
                size={22}
                color={hapticsEnabled ? "white" : "#737373"}
              />
            </Pressable>
          </MotiView>
        ) : null}

        {isPaused && isFocused ? (
          <MotiView
            key="right"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
            style={[
              tw`absolute top-0 bottom-0 justify-center`,
              {
                right: Math.max(left, 16),
              },
            ]}
          >
            <Pressable
              style={tw`h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => {
                navigation.navigate("ExercisesList");
              }}
            >
              <Icon name="book" size={22} color="white" />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => {
                navigation.navigate("MusicControls");
              }}
            >
              <Icon name="headphones" size={22} color="white" />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => {
                navigation.navigate("Scenes");
              }}
            >
              <Icon name="image" size={22} color="white" />
            </Pressable>
            <Pressable
              style={tw`mt-2 h-12 w-12 items-center justify-center active:opacity-80`}
              onPress={() => navigation.navigate("Help")}
            >
              <Icon name="help" size={22} color="white" />
            </Pressable>
          </MotiView>
        ) : null}

        <AnimatePresence>
          {toastMessage ? (
            <MotiView
              key={toastMessage}
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { type: "timing", duration: 500 } }}
              style={[
                tw`absolute left-0 right-0 justify-center items-center`,
                { bottom: bottom + 16 },
              ]}
            >
              <View style={tw`px-6 py-2 rounded-xl bg-black`}>
                <Text style={tw`text-neutral-200 text-xs font-inter`}>
                  {toastMessage}
                </Text>
              </View>
            </MotiView>
          ) : null}
        </AnimatePresence>
      </AnimatePresence>
    </>
  );
};
