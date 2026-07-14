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
import { interval } from "rxjs";
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
import { PhaseTimeReadout } from "./PhaseTimeReadout";
import { SessionClockText } from "../../components/SessionChrome/SessionClockText";
import { TimerProgressBar } from "../../components/SessionChrome/TimerProgressBar";
import { useAppIsActive } from "../../hooks/useAppIsActive";
import { usePausableClock } from "../../hooks/usePausableClock";
import { playback$, setPause as setPauseUpdate } from "../../state/configuration.atom";
import { use$ } from "concordia/react";
import { MainStackParams, type FreestyleRatio } from "../../navigation";

type FreestylePhase = "idle" | "inhale" | "exhale";

const CHROME_TIMEOUT_MS = 6000;
const EXHALE_END_CHECK_MS = 100;
const KEEP_AWAKE_TIMEOUT_MS = 120 * 60 * 1000;
const MIN_INHALE_SECONDS = 0.1;
const ASSUMED_INHALE_SECONDS = 5;

const FREESTYLE_EXHALE_MULTIPLIER: Record<FreestyleRatio, number> = {
  "2:1": 0.5,
  "1:1": 1,
  "1:2": 2,
  "1:3": 3,
};

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
  // The reset key also remounts TimerProgressBar, clearing its pulse state.
  const [clockResetKey, setClockResetKey] = useState(0);
  const { getElapsed } = usePausableClock({
    running: hasStarted && !isPaused,
    resetKey: clockResetKey,
  });
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
      revealChrome();

      return () => {
        setPause(true);
        if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
      };
    }, [breath, revealChrome, setPause]),
  );

  const handleHoldStart = useCallback(() => {
    if ((hasStarted && isPaused) || phaseRef.current !== "idle") return;

    const now = getElapsed();
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
  }, [breath, getElapsed, hasStarted, isPaused, setPause]);

  const handleHoldEnd = useCallback(() => {
    if (isPaused || phaseRef.current !== "inhale") return;

    const now = getElapsed();
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
  }, [breath, getElapsed, isPaused, ratio]);

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
        ASSUMED_INHALE_SECONDS - (getElapsed() - phaseStartedAtRef.current),
      );
      breath.value = withTiming(1, { duration: remainingSeconds * 1000 });
    } else if (phase === "exhale" && exhaleEndsAtRef.current !== null) {
      const remainingSeconds = Math.max(
        MIN_INHALE_SECONDS,
        exhaleEndsAtRef.current - getElapsed(),
      );
      breath.value = withTiming(0, { duration: remainingSeconds * 1000 });
    }

    setPause(!isPaused);
  }, [breath, getElapsed, hasStarted, isPaused, phase, setPause]);

  // End-of-exhale watcher: a 10 Hz check against the imperative clock, so the
  // only render it ever causes is the single phase transition back to idle.
  // While paused the clock is frozen, so the check can never fire early.
  useEffect(() => {
    if (phase !== "exhale") return;
    const sub = interval(EXHALE_END_CHECK_MS).subscribe(() => {
      const exhaleEndsAt = exhaleEndsAtRef.current;
      if (exhaleEndsAt === null || getElapsed() < exhaleEndsAt) return;
      breath.value = 0;
      phaseRef.current = "idle";
      setPhase("idle");
      phaseStartedAtRef.current = getElapsed();
      exhaleEndsAtRef.current = null;
    });
    return () => sub.unsubscribe();
  }, [breath, getElapsed, phase]);

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

  const phaseMessage =
    phase === "inhale" ? "release" : phase === "exhale" ? "exhale" : "";
  const idleMessage = "hold to inhale";
  const bottomMessage =
    hasStarted && isPaused
      ? "paused"
      : phase === "idle"
        ? idleMessage
        : phaseMessage;

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
                    <PhaseTimeReadout
                      phase={phase}
                      getElapsed={getElapsed}
                      phaseStartedAtRef={phaseStartedAtRef}
                      exhaleEndsAtRef={exhaleEndsAtRef}
                    />
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
              <SessionClockText />
            </View>
          </MotiView>
        ) : null}
      </AnimatePresence>

      {timerTargetSeconds ? (
        <TimerProgressBar
          key={`freestyle-timer-progress-${clockResetKey}`}
          targetSeconds={timerTargetSeconds}
        />
      ) : null}
    </View>
  );
};
