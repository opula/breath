import React, { memo, useEffect, useState } from "react";
import { Text } from "react-native";
import { interval } from "rxjs";
import tw from "../../utils/tw";

const READOUT_TICK_MS = 100;

const formatPhaseSeconds = (seconds: number) =>
  `${Math.max(0, seconds).toFixed(1)}s`;

/**
 * The 0.1s-resolution phase timer inside the freestyle ring. Runs its own
 * 10 Hz tick against the imperative clock so only this Text re-renders at
 * readout cadence — the session screen re-renders only on phase changes.
 */
export const PhaseTimeReadout = memo(
  ({
    phase,
    getElapsed,
    phaseStartedAtRef,
    exhaleEndsAtRef,
  }: {
    phase: "inhale" | "exhale";
    getElapsed: () => number;
    phaseStartedAtRef: { current: number };
    exhaleEndsAtRef: { current: number | null };
  }) => {
    const [text, setText] = useState("");

    useEffect(() => {
      const compute = () => {
        const now = getElapsed();
        if (phase === "inhale") {
          return formatPhaseSeconds(now - phaseStartedAtRef.current);
        }
        const endsAt = exhaleEndsAtRef.current;
        return formatPhaseSeconds(endsAt !== null ? endsAt - now : 0);
      };
      setText(compute());
      const sub = interval(READOUT_TICK_MS).subscribe(() =>
        setText(compute()),
      );
      return () => sub.unsubscribe();
    }, [phase, getElapsed, phaseStartedAtRef, exhaleEndsAtRef]);

    return (
      <Text style={[tw`font-mono text-mb-mute text-[12px]`, { letterSpacing: 2 }]}>
        {text}
      </Text>
    );
  },
);
