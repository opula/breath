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
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withTiming,
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
import { Background } from "../Main/Background";
import { BreathRing } from "../../components/DynamicExercise/BreathRing";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import { usePausableClock } from "../../hooks/usePausableClock";
import {
  configuration$,
  playback$,
  setPause as setPauseUpdate,
} from "../../state/configuration.atom";
import { use$ } from "concordia/react";
import { MainStackParams, type FreestyleRatio } from "../../navigation";

type FreestylePhase = "idle" | "inhale" | "exhale";

const CHROME_TIMEOUT_MS = 6000;
const SESSION_CLOCK_TICK_MS = 100;
const TIMER_PROGRESS_PULSE_MS = 5000;
const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000;
const MIN_INHALE_SECONDS = 0.1;
const ASSUMED_INHALE_SECONDS = 5;

const FREESTYLE_EXHALE_MULTIPLIER: Record<FreestyleRatio, number> = {
  "2:1": 0.5,
  "1:1": 1,
  "1:2": 2,
  "1:3": 3,
};

const formatPhaseSeconds = (seconds: number) =>
  `${Math.max(0, seconds).toFixed(1)}s`;

export const FreestyleSession = () => {
  const navigation =
    useNavigation<NavigationProp<MainStackParams, "FreestyleSession">>();
  const route = useRoute<RouteProp<MainStackParams, "FreestyleSession">>();
  const { ratio, timerMinutes } = route.params;
  const timerTargetSeconds = useMemo(() => {
    if (!timerMinutes || timerMinutes <= 0) return null;
    return timerMinutes * 60;
  }, [timerMinutes]);

  const insets = useSafeAreaInsets();
  const isAppActive = useAppIsActive();
  const isPaused = use$(playback$.isPaused);
  const timerProgressMode = use$(configuration$.timerProgressMode);

  const setPause = useCallback(
    (status: boolean) => {
      setPauseUpdate(status);
    },
    [],
  );

  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<FreestylePhase>("idle");
  const phaseRef = useRef<FreestylePhase>("idle");
  const phaseStartedAtRef = useRef(0);
  const exhaleEndsAtRef = useRef<number | null>(null);
  const [clockResetKey, setClockResetKey] = useState(0);
  const sessionElapsed = usePausableClock({
    running: hasStarted && !isPaused,
    resetKey: clockResetKey,
    tickMs: SESSION_CLOCK_TICK_MS,
  });
  const sessionElapsedRef = useRef(sessionElapsed);
  sessionElapsedRef.current = sessionElapsed;
  const breath = useSharedValue(0);

  const [showChrome, setShowChrome] = useState(true);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealChrome = useCallback(() => {
    setShowChrome(true);
    if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
    chromeTimerRef.current = setTimeout(
      () => setShowChrome(false),
      CHROME_TIMEOUT_MS,
    );
  }, []);

  const [showTimerProgressPulse, setShowTimerProgressPulse] = useState(false);
  const lastTimerPulseMinuteRef = useRef(0);
  const hasShownTimerEndPulseRef = useRef(false);
  const timerProgressPulseTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      setPause(true);
      setHasStarted(false);
      setPhase("idle");
      phaseRef.current = "idle";
      cancelAnimation(breath);
      breath.value = 0;
      phaseStartedAtRef.current = 0;
      exhaleEndsAtRef.current = null;
      setClockResetKey((key) => key + 1);
      lastTimerPulseMinuteRef.current = 0;
      hasShownTimerEndPulseRef.current = false;
      setShowTimerProgressPulse(false);
      revealChrome();

      return () => {
        setPause(true);
        if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
        if (timerProgressPulseTimeoutRef.current) {
          clearTimeout(timerProgressPulseTimeoutRef.current);
          timerProgressPulseTimeoutRef.current = null;
        }
      };
    }, [breath, revealChrome, setPause]),
  );

  const handleHoldStart = useCallback(() => {
    if ((hasStarted && isPaused) || phaseRef.current !== "idle") return;

    const now = sessionElapsedRef.current;
    if (!hasStarted) {
      setHasStarted(true);
      setPause(false);
    }

    phaseStartedAtRef.current = now;
    exhaleEndsAtRef.current = null;
    breath.value = withTiming(1, {
      duration: ASSUMED_INHALE_SECONDS * 1000,
    });
    phaseRef.current = "inhale";
    setPhase("inhale");
  }, [breath, hasStarted, isPaused, setPause]);

  const handleHoldEnd = useCallback(() => {
    if (isPaused || phaseRef.current !== "inhale") return;

    const now = sessionElapsedRef.current;
    const inhaleDuration = Math.max(
      MIN_INHALE_SECONDS,
      now - phaseStartedAtRef.current,
    );
    const exhaleDuration = inhaleDuration * FREESTYLE_EXHALE_MULTIPLIER[ratio];
    phaseStartedAtRef.current = now;
    exhaleEndsAtRef.current = now + exhaleDuration;
    breath.value = withTiming(0, { duration: exhaleDuration * 1000 });
    phaseRef.current = "exhale";
    setPhase("exhale");
  }, [breath, isPaused, ratio]);

  const handlePauseResume = useCallback(() => {
    if (!hasStarted) return;
    if (!isPaused) {
      cancelAnimation(breath);
      setPause(true);
      return;
    }

    if (phase === "inhale") {
      const remainingSeconds = Math.max(
        MIN_INHALE_SECONDS,
        ASSUMED_INHALE_SECONDS -
          (sessionElapsedRef.current - phaseStartedAtRef.current),
      );
      breath.value = withTiming(1, { duration: remainingSeconds * 1000 });
    } else if (phase === "exhale" && exhaleEndsAtRef.current !== null) {
      const remainingSeconds = Math.max(
        MIN_INHALE_SECONDS,
        exhaleEndsAtRef.current - sessionElapsedRef.current,
      );
      breath.value = withTiming(0, { duration: remainingSeconds * 1000 });
    }

    setPause(!isPaused);
  }, [breath, hasStarted, isPaused, phase, setPause]);

  useEffect(() => {
    if (phase !== "exhale") return;
    const exhaleEndsAt = exhaleEndsAtRef.current;
    if (exhaleEndsAt === null || sessionElapsed < exhaleEndsAt) return;
    breath.value = 0;
    phaseRef.current = "idle";
    setPhase("idle");
    phaseStartedAtRef.current = sessionElapsed;
    exhaleEndsAtRef.current = null;
  }, [breath, phase, sessionElapsed]);

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

  const holdGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(150)
        .maxDistance(10000)
        .onStart(() => {
          runOnJS(revealChrome)();
          runOnJS(handleHoldStart)();
        })
        .onFinalize(() => {
          runOnJS(handleHoldEnd)();
        }),
    [handleHoldEnd, handleHoldStart, revealChrome],
  );

  const gesture = Gesture.Exclusive(doubleTap, holdGesture);

  const exhaleRemaining =
    phase === "exhale" && exhaleEndsAtRef.current !== null
      ? Math.max(0, exhaleEndsAtRef.current - sessionElapsed)
      : 0;
  const phaseElapsed = Math.max(0, sessionElapsed - phaseStartedAtRef.current);
  const phaseTime =
    phase === "inhale"
      ? formatPhaseSeconds(phaseElapsed)
      : phase === "exhale"
        ? formatPhaseSeconds(exhaleRemaining)
        : "";
  const phaseMessage =
    phase === "inhale" ? "release" : phase === "exhale" ? "exhale" : "";
  const idleMessage = "hold to inhale";
  const bottomMessage =
    hasStarted && isPaused
      ? "paused"
      : phase === "idle"
        ? idleMessage
        : phaseMessage;

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

  const handleExit = useCallback(() => {
    setPause(true);
    navigation.navigate("Home");
  }, [navigation, setPause]);

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <AnimatePresence>{isAppActive ? <Background /> : null}</AnimatePresence>

      <GestureDetector gesture={gesture}>
        <View style={tw`absolute inset-0 items-center justify-center px-8`}>
          <AnimatePresence>
            {phase !== "idle" && isAppActive ? (
              <MotiView
                key="freestyle-breath-ring"
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { type: "timing", duration: 700 } }}
              >
                <View style={tw`items-center justify-center`}>
                  <BreathRing breath={breath} />
                  <View
                    style={tw`absolute items-center justify-center`}
                    pointerEvents="none"
                  >
                    <Text
                      style={[
                        tw`font-mono text-mb-mute text-[12px]`,
                        { letterSpacing: 2 },
                      ]}
                    >
                      {phaseTime}
                    </Text>
                  </View>
                </View>
              </MotiView>
            ) : null}
          </AnimatePresence>
        </View>
      </GestureDetector>

      <AnimatePresence>
        {showChrome ? (
          <MotiView
            key="freestyle-top-chrome"
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
                freestyle
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }} pointerEvents="none" />
          </MotiView>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showChrome ? (
          <MotiView
            key="freestyle-bottom-chrome"
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
              {bottomMessage ? (
                <Text
                  numberOfLines={1}
                  style={[
                    tw`font-mono uppercase text-[10px]`,
                    bottomMessage === "paused"
                      ? tw`text-mb-accent`
                      : tw`text-mb-mute`,
                    { letterSpacing: 2 },
                  ]}
                >
                  {bottomMessage}
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
            key="freestyle-timer-progress"
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
