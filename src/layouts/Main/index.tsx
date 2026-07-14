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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NavigationProp,
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";

import tw from "../../utils/tw";
import { Background } from "./Background";
import { ExerciseCenter } from "./ExerciseCenter";
import { SessionClockText } from "../../components/SessionChrome/SessionClockText";
import { TimerProgressBar } from "../../components/SessionChrome/TimerProgressBar";
import { useExerciseEngine } from "../../hooks/useExerciseEngine";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import { usePausableClock } from "../../hooks/usePausableClock";
import { exercises$ } from "../../state/exercises.atom";
import { session$ } from "../../state/session.atom";
import {
  configuration$,
  playback$,
  setPause as setPauseUpdate,
} from "../../state/configuration.atom";
import { use$ } from "concordia/react";
import { MainStackParams } from "../../navigation";
import { HAS_SEEN_MAIN_CONTROLS, storage } from "../../utils/storage";
import { FrameStatsOverlay } from "../../lib/FrameStatsOverlay";

const CHROME_TIMEOUT_MS = 6000;
const FIRST_SESSION_CHROME_TIMEOUT_MS = 12000;
const HINT_TIMEOUT_MS = 4000;
const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours

export const Main = () => {
  const navigation = useNavigation<NavigationProp<MainStackParams, "Main">>();
  const route = useRoute<RouteProp<MainStackParams, "Main">>();
  const autoplay = route.params?.autoplay ?? false;
  const timerMinutes = route.params?.timerMinutes;
  const timerTargetSeconds = useMemo(() => {
    if (!timerMinutes || timerMinutes <= 0) return null;
    return timerMinutes * 60;
  }, [timerMinutes]);
  const exercises = use$(exercises$.userExercises);
  const isAppActive = useAppIsActive();
  const insets = useSafeAreaInsets();
  const isPaused = use$(playback$.isPaused);
  const hideCenterHints = use$(configuration$.hideCenterHints);
  // Phase-frequency flags only — the per-second label/sublabel/clock values
  // are subscribed by leaf components (ExerciseCenter, SessionClockText,
  // TimerProgressBar) so their ticks never re-render this screen.
  const isText = use$(session$.isText);
  const canAdvance = use$(session$.canAdvance);

  const setPause = useCallback(
    (status: boolean) => {
      setPauseUpdate(status);
    },
    [],
  );

  const {
    isStarted,
    exerciseName,
    iBreath,
    handleStart,
    handleTap,
    handlePauseResume,
    handleLongPress,
    handleStop,
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

  // Defer mounting the Background so WebGPU init doesn't compete with the
  // navigation transition / first engine tick.
  const [mountBackground, setMountBackground] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMountBackground(true), 50);
    return () => clearTimeout(id);
  }, []);

  // Autoplay: when navigated here with autoplay=true (from Home tap or tray
  // Play action), kick off the engine after a short delay so the user sees
  // the screen land before it starts animating. Skip if the engine has
  // already produced a step (e.g. user tapped during the delay).
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      if (!session$.label.peek()) handleStart();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoplay, handleStart]);

  // The reset key also remounts TimerProgressBar, clearing its pulse state.
  const [sessionClockResetKey, setSessionClockResetKey] = useState(0);
  usePausableClock({
    running: isStarted && !isPaused,
    resetKey: sessionClockResetKey,
  });

  useFocusEffect(
    useCallback(() => {
      setSessionClockResetKey((key) => key + 1);

      return () => {
        handleStop();
      };
    }, [handleStop]),
  );

  useEffect(() => {
    setSessionClockResetKey((key) => key + 1);
  }, [timerTargetSeconds]);

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

  useEffect(() => {
    if (!isStarted || !isPaused) return;
    setShowChrome(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
  }, [isPaused, isStarted]);

  // Center hints auto-fade after 4s. Re-reveal on gesture / relevant state.
  const [showHints, setShowHints] = useState(false);
  const hintsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealHints = useCallback(() => {
    setShowHints(true);
    if (hintsTimerRef.current) clearTimeout(hintsTimerRef.current);
    hintsTimerRef.current = setTimeout(
      () => setShowHints(false),
      HINT_TIMEOUT_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (hintsTimerRef.current) clearTimeout(hintsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isStarted) revealHints();
  }, [isStarted, isPaused, canAdvance, revealHints]);

  const singleTap = useMemo(
    () =>
      Gesture.Tap().onEnd((_, success) => {
        if (!success) return;
        if (!canAdvance) runOnJS(revealChrome)();
        runOnJS(revealHints)();
        runOnJS(handleTap)();
      }),
    [canAdvance, handleTap, revealChrome, revealHints],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((_, success) => {
          if (!success) return;
          runOnJS(revealChrome)();
          runOnJS(revealHints)();
          runOnJS(handlePauseResume)();
        }),
    [handlePauseResume, revealChrome, revealHints],
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress().onEnd((_, success) => {
        if (!success) return;
        runOnJS(revealChrome)();
        runOnJS(revealHints)();
        runOnJS(handleLongPress)();
      }),
    [handleLongPress, revealChrome, revealHints],
  );

  const gesture = Gesture.Exclusive(doubleTap, longPress, singleTap);

  const showIndefiniteHint = isStarted && canAdvance && !isPaused;
  const showCenterHints = isStarted && showHints && !hideCenterHints;
  const primaryHint = showIndefiniteHint
    ? "tap when you're ready to continue"
    : "tap 2x to pause / resume";
  const hintShadow = {
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  };
  const renderCenterHints = () => (
    <AnimatePresence>
      {showCenterHints ? (
        <MotiView
          key="center-hints"
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { type: "timing", duration: 400 } }}
          pointerEvents="none"
          style={[
            tw`absolute left-0 right-0 items-center px-8`,
            { top: "50%", marginTop: isText ? 86 : 52 },
          ]}
        >
          <Text
            style={[
              tw`font-mono text-mb-ink uppercase text-[9px] text-center`,
              hintShadow,
              { letterSpacing: 2.2 },
            ]}
          >
            {primaryHint}
          </Text>
          {!showIndefiniteHint ? (
            <Text
              style={[
                tw`font-mono uppercase text-[8px] text-center mt-2`,
                hintShadow,
                { color: "rgba(242,242,239,0.78)", letterSpacing: 1.8 },
              ]}
            >
              hold to restart
            </Text>
          ) : null}
        </MotiView>
      ) : null}
    </AnimatePresence>
  );

  const handleExit = useCallback(() => {
    handleStop();
    navigation.navigate("Home");
  }, [handleStop, navigation]);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <AnimatePresence>
        {isAppActive && mountBackground ? (
          <Background breath={iBreath} />
        ) : null}
      </AnimatePresence>
      <FrameStatsOverlay />

      <GestureDetector gesture={gesture}>
        <View style={tw`absolute inset-0 items-center justify-center`}>
          <ExerciseCenter breath={iBreath} isAppActive={isAppActive} />
          {renderCenterHints()}
        </View>
      </GestureDetector>

      {/* Top chrome — exit and exercise name */}
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
              tw`absolute left-0 right-0 flex-row items-start px-6`,
              { top: insets.top + 4 },
            ]}
          >
            <Pressable
              onPress={handleExit}
              hitSlop={12}
              style={[tw`py-2 active:opacity-50`, { flex: 1, minWidth: 0 }]}
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
            <View style={{ flex: 1.2, minWidth: 0, alignItems: "center" }}>
              <Text
                numberOfLines={1}
                style={[
                  tw`font-mono text-mb-mute uppercase text-[10px] py-2`,
                  { letterSpacing: 3 },
                ]}
              >
                {exerciseName || ""}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }} pointerEvents="none" />
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
            <View style={tw`flex-1`} />
            <View style={tw`flex-1 items-center`}>
              {isStarted && isPaused ? (
                <Text
                  style={[
                    tw`font-mono text-mb-accent uppercase text-[10px]`,
                    { letterSpacing: 2 },
                  ]}
                >
                  paused
                </Text>
              ) : null}
            </View>
            <View style={tw`flex-1 items-end`}>
              <SessionClockText />
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>

      {timerTargetSeconds ? (
        <TimerProgressBar
          key={`timer-progress-${sessionClockResetKey}`}
          targetSeconds={timerTargetSeconds}
        />
      ) : null}
    </View>
  );
};
