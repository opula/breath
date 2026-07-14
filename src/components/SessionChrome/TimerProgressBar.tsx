import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AnimatePresence, MotiView } from "moti";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { use$ } from "concordia/react";
import tw from "../../utils/tw";
import { configuration$ } from "../../state/configuration.atom";
import { session$ } from "../../state/session.atom";

const TIMER_PROGRESS_PULSE_MS = 5000;

/**
 * Timed-session progress line. Subscribes to the 1 Hz session clock itself so
 * the hosting screen never re-renders on clock ticks, and owns the
 * minuteFade / endFade pulse bookkeeping. Hosts remount it (via key) on
 * session reset to clear that bookkeeping.
 */
export const TimerProgressBar = memo(
  ({ targetSeconds }: { targetSeconds: number }) => {
    const insets = useSafeAreaInsets();
    const mode = use$(configuration$.timerProgressMode);
    const elapsed = use$(session$.elapsedSeconds);

    const [showPulse, setShowPulse] = useState(false);
    const lastPulseMinuteRef = useRef(0);
    const hasShownEndPulseRef = useRef(false);
    const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerPulse = useCallback(() => {
      setShowPulse(true);
      if (pulseTimeoutRef.current) {
        clearTimeout(pulseTimeoutRef.current);
      }
      pulseTimeoutRef.current = setTimeout(() => {
        setShowPulse(false);
        pulseTimeoutRef.current = null;
      }, TIMER_PROGRESS_PULSE_MS);
    }, []);

    useEffect(
      () => () => {
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      },
      [],
    );

    useEffect(() => {
      if (mode !== "minuteFade") return;
      const completedMinutes = Math.floor(elapsed / 60);
      if (
        completedMinutes <= 0 ||
        completedMinutes === lastPulseMinuteRef.current
      ) {
        return;
      }
      lastPulseMinuteRef.current = completedMinutes;
      triggerPulse();
    }, [elapsed, mode, triggerPulse]);

    useEffect(() => {
      if (mode !== "endFade") return;
      if (elapsed < targetSeconds || hasShownEndPulseRef.current) return;
      hasShownEndPulseRef.current = true;
      triggerPulse();
    }, [elapsed, mode, targetSeconds, triggerPulse]);

    const progress = Math.min(elapsed / targetSeconds, 1);
    const targetComplete = elapsed >= targetSeconds;
    const show =
      mode === "always" ||
      (mode === "endOn" && targetComplete) ||
      ((mode === "minuteFade" || mode === "endFade") && showPulse);

    return (
      <AnimatePresence>
        {show ? (
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
                { opacity: 0.62, width: `${progress * 100}%` },
              ]}
            />
          </MotiView>
        ) : null}
      </AnimatePresence>
    );
  },
);
