import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import { runOnJS } from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from "@react-navigation/native";

import tw from "../../utils/tw";
import { Background } from "./Background";
import { BreathRing } from "../../components/DynamicExercise/BreathRing";
import { useExerciseEngine } from "../../hooks/useExerciseEngine";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import { exercisesSelector } from "../../state/exercises.selectors";
import { isPausedSelector } from "../../state/configuration.selectors";
import { setPause as setPauseAction } from "../../state/configuration.reducer";
import { MainStackParams } from "../../navigation";
import { HAS_SEEN_MAIN_CONTROLS, storage } from "../../utils/storage";

const CHROME_TIMEOUT_MS = 6000;
const FIRST_SESSION_CHROME_TIMEOUT_MS = 12000;
const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours

export const Main = () => {
  const navigation = useNavigation<NavigationProp<MainStackParams, "Main">>();
  const route = useRoute<RouteProp<MainStackParams, "Main">>();
  const autoplay = route.params?.autoplay ?? false;
  const exercises = useAppSelector(exercisesSelector);
  const dispatch = useAppDispatch();
  const isAppActive = useAppIsActive();
  const insets = useSafeAreaInsets();
  const isPaused = useAppSelector(isPausedSelector);

  const setPause = useCallback(
    (status: boolean) => {
      dispatch(setPauseAction(status));
    },
    [dispatch],
  );

  const {
    label,
    sublabel,
    isBreathing,
    isText,
    canAdvance,
    exerciseName,
    repeatRound,
    iBreath,
    handleTap,
    handlePauseResume,
    handleLongPress,
  } = useExerciseEngine({ exercises, onPause: setPause });

  // Keep the screen awake while the session is open (up to 2h).
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

  // Autoplay: when navigated here with autoplay=true (from Home tap or tray
  // Play action), kick off the engine after a short delay so the user sees
  // the screen land before it starts animating. Skip if the engine has
  // already produced a step (e.g. user tapped during the delay).
  const labelRef = useRef(label);
  labelRef.current = label;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      if (!labelRef.current) handleTap();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoplay, handleTap]);

  // Auto-fading chrome: show on mount and any gesture; hide after timeout.
  // First session gets a longer window so the legend is readable; subsequent
  // sessions shrink back to the normal timeout.
  const chromeTimeoutRef = useRef(
    storage.getBoolean(HAS_SEEN_MAIN_CONTROLS)
      ? CHROME_TIMEOUT_MS
      : FIRST_SESSION_CHROME_TIMEOUT_MS,
  );
  const [showChrome, setShowChrome] = useState(true);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealChrome = useCallback(() => {
    setShowChrome(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(
      () => setShowChrome(false),
      chromeTimeoutRef.current,
    );
  }, []);

  useEffect(() => {
    revealChrome();
    storage.set(HAS_SEEN_MAIN_CONTROLS, true);
    return () => {
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    };
  }, [revealChrome]);

  // Elapsed time — ticks at 10Hz, pauses when engine pauses.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isPaused) return;
    const id = setInterval(() => setElapsed((e) => e + 0.1), 100);
    return () => clearInterval(id);
  }, [isPaused]);

  const singleTap = useMemo(
    () =>
      Gesture.Tap().onEnd((_, success) => {
        if (!success) return;
        runOnJS(revealChrome)();
        runOnJS(handleTap)();
      }),
    [handleTap, revealChrome],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((_, success) => {
          if (!success) return;
          runOnJS(revealChrome)();
          runOnJS(handlePauseResume)();
        }),
    [handlePauseResume, revealChrome],
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress().onEnd((_, success) => {
        if (!success) return;
        runOnJS(revealChrome)();
        runOnJS(handleLongPress)();
      }),
    [handleLongPress, revealChrome],
  );

  const gesture = Gesture.Exclusive(doubleTap, longPress, singleTap);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(Math.floor(elapsed % 60)).padStart(2, "0");

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <AnimatePresence>{isAppActive ? <Background /> : null}</AnimatePresence>

      <GestureDetector gesture={gesture}>
        <View style={tw`absolute inset-0 items-center justify-center`}>
          {isText ? (
            <View style={tw`px-8 items-center`}>
              <Text
                style={[
                  tw`font-display text-mb-fg uppercase text-center`,
                  { fontSize: 32, letterSpacing: -0.5, lineHeight: 38 },
                ]}
              >
                {label}
              </Text>
              {canAdvance && !isPaused ? (
                <Text
                  style={[
                    tw`font-mono text-mb-accent uppercase text-[9px] mt-6`,
                    { letterSpacing: 2.5 },
                  ]}
                >
                  tap to continue
                </Text>
              ) : null}
            </View>
          ) : label ? (
            <View style={tw`items-center justify-center`}>
              {isAppActive && isBreathing ? (
                <BreathRing breath={iBreath} />
              ) : null}
              <View
                style={tw`absolute items-center justify-center`}
                pointerEvents="none"
              >
                <Text
                  style={[
                    tw`font-display text-mb-fg uppercase text-center`,
                    { fontSize: 16, letterSpacing: -0.3 },
                  ]}
                >
                  {label}
                </Text>
                {sublabel ? (
                  <Text
                    style={[
                      tw`font-mono text-mb-mute uppercase text-[10px] mt-2`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    {sublabel}
                  </Text>
                ) : null}
                {canAdvance && !isPaused ? (
                  <Text
                    style={[
                      tw`font-mono text-mb-accent uppercase text-[9px] mt-3`,
                      { letterSpacing: 2.5 },
                    ]}
                  >
                    tap to continue
                  </Text>
                ) : null}
              </View>
            </View>
          ) : // <Text
          //   style={[
          //     tw`font-mono text-mb-mute uppercase text-[10px]`,
          //     { letterSpacing: 3 },
          //   ]}
          // >
          //   tap to begin
          // </Text>
          null}
        </View>
      </GestureDetector>

      {/* Top chrome — exit, exercise name, pause toggle */}
      <AnimatePresence>
        {showChrome ? (
          <MotiView
            key="top-chrome"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 400 } }}
            pointerEvents="box-none"
            style={[
              tw`absolute left-0 right-0 flex-row items-center justify-between px-6`,
              { top: insets.top + 4 },
            ]}
          >
            <Pressable
              onPress={() => navigation.navigate("Home")}
              style={tw`py-2 active:opacity-50`}
            >
              <Text
                style={[
                  tw`font-mono text-mb-mute uppercase text-[10px]`,
                  { letterSpacing: 3 },
                ]}
              >
                ← library
              </Text>
            </Pressable>
            <Text
              numberOfLines={1}
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px] py-2 max-w-[50%]`,
                { letterSpacing: 3 },
              ]}
            >
              {exerciseName || ""}
            </Text>
            <View style={tw`py-2 items-end`} pointerEvents="none">
              <Text
                style={[
                  tw`font-mono text-mb-mute uppercase text-[9px]`,
                  { letterSpacing: 2.5 },
                ]}
              >
                double tap to pause / resume
              </Text>
              <Text
                style={[
                  tw`font-mono text-mb-mute uppercase text-[9px] mt-1`,
                  { letterSpacing: 2.5 },
                ]}
              >
                hold to restart
              </Text>
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>

      {/* Bottom chrome — round counter and elapsed timer */}
      <AnimatePresence>
        {showChrome ? (
          <MotiView
            key="bottom-chrome"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 400 } }}
            pointerEvents="none"
            style={[
              tw`absolute left-0 right-0 flex-row items-center justify-between px-6`,
              { bottom: insets.bottom + 12 },
            ]}
          >
            <View style={tw`flex-1`}>
              <Text
                style={[
                  tw`font-mono text-mb-mute uppercase text-[10px]`,
                  { letterSpacing: 2 },
                ]}
              >
                {repeatRound || ""}
              </Text>
            </View>
            {/* <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 2 },
              ]}
            >
              {isPaused ? "TAP TO RESUME" : "DOUBLE TAP TO PAUSE"}
            </Text> */}
            <View style={tw`flex-1 items-end`}>
              <Text
                style={[
                  tw`font-mono text-mb-mute text-[10px]`,
                  { letterSpacing: 2 },
                ]}
              >
                {mm}:{ss}
              </Text>
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
};
