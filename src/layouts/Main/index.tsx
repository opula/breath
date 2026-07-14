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
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  withTiming,
  type LayoutAnimationFunction,
} from "react-native-reanimated";
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
import { BreathRing } from "../../components/DynamicExercise/BreathRing";
import { useExerciseEngine } from "../../hooks/useExerciseEngine";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import { usePausableClock } from "../../hooks/usePausableClock";
import { exercises$ } from "../../state/exercises.atom";
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
const TIMER_PROGRESS_TICK_MS = 250;
const TIMER_PROGRESS_PULSE_MS = 5000;
const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours

// Layout transition for the center cluster: tween ONLY vertical position, so
// the cluster glides when a line mounts/unmounts (2 -> 3 lines) but plain text
// swaps (inhale -> exhale change the frame width) snap with no animation.
const centerShift: LayoutAnimationFunction = (values) => {
  "worklet";
  return {
    initialValues: {
      originX: values.targetOriginX,
      originY: values.currentOriginY,
      width: values.targetWidth,
      height: values.targetHeight,
    },
    animations: {
      originY: withTiming(values.targetOriginY, { duration: 400 }),
    },
  };
};

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
  const timerProgressMode = use$(configuration$.timerProgressMode);

  const setPause = useCallback(
    (status: boolean) => {
      setPauseUpdate(status);
    },
    [],
  );

  const {
    label,
    sublabel,
    isBreathing,
    isText,
    canAdvance,
    isStarted,
    exerciseName,
    repeatProgress,
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
  const labelRef = useRef(label);
  labelRef.current = label;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      if (!labelRef.current) handleStart();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoplay, handleStart]);

  const [sessionClockResetKey, setSessionClockResetKey] = useState(0);
  const sessionElapsed = usePausableClock({
    running: isStarted && !isPaused,
    resetKey: sessionClockResetKey,
    tickMs: TIMER_PROGRESS_TICK_MS,
  });
  const [showTimerProgressPulse, setShowTimerProgressPulse] = useState(false);
  const lastTimerPulseMinuteRef = useRef(0);
  const hasShownTimerEndPulseRef = useRef(false);
  const timerProgressPulseTimeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerTimerProgressPulse = useCallback(() => {
    setShowTimerProgressPulse(true);
    if (timerProgressPulseTimeoutRef.current) {
      clearTimeout(timerProgressPulseTimeoutRef.current);
    }
    timerProgressPulseTimeoutRef.current = setTimeout(() => {
      setShowTimerProgressPulse(false);
      timerProgressPulseTimeoutRef.current = null;
    }, TIMER_PROGRESS_PULSE_MS);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSessionClockResetKey((key) => key + 1);
      lastTimerPulseMinuteRef.current = 0;
      hasShownTimerEndPulseRef.current = false;
      setShowTimerProgressPulse(false);

      return () => {
        if (timerProgressPulseTimeoutRef.current) {
          clearTimeout(timerProgressPulseTimeoutRef.current);
          timerProgressPulseTimeoutRef.current = null;
        }
        handleStop();
      };
    }, [handleStop]),
  );

  useEffect(() => {
    setSessionClockResetKey((key) => key + 1);
    lastTimerPulseMinuteRef.current = 0;
    hasShownTimerEndPulseRef.current = false;
    setShowTimerProgressPulse(false);
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

  useEffect(() => {
    if (!timerTargetSeconds || timerProgressMode !== "minuteFade") return;

    const completedMinutes = Math.floor(sessionElapsed / 60);
    if (
      completedMinutes <= 0 ||
      completedMinutes === lastTimerPulseMinuteRef.current
    ) {
      return;
    }

    lastTimerPulseMinuteRef.current = completedMinutes;
    triggerTimerProgressPulse();
  }, [
    sessionElapsed,
    timerProgressMode,
    timerTargetSeconds,
    triggerTimerProgressPulse,
  ]);

  useEffect(() => {
    if (!timerTargetSeconds || timerProgressMode !== "endFade") return;
    if (sessionElapsed < timerTargetSeconds) return;
    if (hasShownTimerEndPulseRef.current) return;

    hasShownTimerEndPulseRef.current = true;
    triggerTimerProgressPulse();
  }, [
    sessionElapsed,
    timerProgressMode,
    timerTargetSeconds,
    triggerTimerProgressPulse,
  ]);

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

  const mm = String(Math.floor(sessionElapsed / 60)).padStart(2, "0");
  const ss = String(Math.floor(sessionElapsed % 60)).padStart(2, "0");
  const timerProgress = timerTargetSeconds
    ? Math.min(sessionElapsed / timerTargetSeconds, 1)
    : 0;
  const timerTargetComplete = timerTargetSeconds
    ? sessionElapsed >= timerTargetSeconds
    : false;
  const showTimerProgress =
    !!timerTargetSeconds &&
    (timerProgressMode === "always" ||
      (timerProgressMode === "endOn" && timerTargetComplete) ||
      ((timerProgressMode === "minuteFade" ||
        timerProgressMode === "endFade") &&
        showTimerProgressPulse));
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
  // Persistent round progress while inside a repeat block (e.g. "round 3 / 30").
  // Status, not chrome: it stays through the chrome fade, like the ring itself.
  // Fades in/out; the cluster container tweens its re-centering (centerShift).
  const renderRepeatProgress = (topMargin: number) =>
    repeatProgress ? (
      <Animated.Text
        entering={FadeIn.duration(400)}
        exiting={FadeOut.duration(400)}
        style={[
          tw`font-mono text-mb-mute uppercase text-[9px] text-center`,
          { letterSpacing: 1.8, marginTop: topMargin },
        ]}
      >
        round {repeatProgress.round} / {repeatProgress.total}
      </Animated.Text>
    ) : null;

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
          {isText ? (
            <Animated.View layout={centerShift} style={tw`px-8 items-center`}>
              <Text
                style={[
                  tw`font-display text-mb-fg uppercase text-center`,
                  { fontSize: 32, letterSpacing: -0.5, lineHeight: 38 },
                ]}
              >
                {label}
              </Text>
              {renderRepeatProgress(12)}
            </Animated.View>
          ) : label ? (
            <View style={tw`items-center justify-center`}>
              {isAppActive && isBreathing ? (
                <BreathRing breath={iBreath} />
              ) : null}
              <Animated.View
                layout={centerShift}
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
                {/* During a repeat block the time slot is always reserved, so
                    the round line keeps a stable third position instead of
                    jumping up on phases without a countdown. */}
                {sublabel || repeatProgress ? (
                  <Text
                    style={[
                      tw`font-mono text-mb-mute uppercase text-[10px] mt-2`,
                      { letterSpacing: 2 },
                    ]}
                  >
                    {sublabel || " "}
                  </Text>
                ) : null}
                {renderRepeatProgress(8)}
              </Animated.View>
            </View>
          ) : null}
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

      <AnimatePresence>
        {showTimerProgress ? (
          <MotiView
            key="timer-progress"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 900 } }}
            pointerEvents="none"
            style={[
              tw`absolute left-0 right-0 bg-mb-line`,
              { bottom: insets.bottom, height: 2 },
            ]}
          >
            <View
              style={[
                tw`h-full bg-mb-accent`,
                { opacity: 0.62, width: `${timerProgress * 100}%` },
              ]}
            />
          </MotiView>
        ) : null}
      </AnimatePresence>
    </View>
  );
};
