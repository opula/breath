import { useCallback, useEffect, useRef } from "react";
import { interval } from "rxjs";
import { setSessionElapsedSeconds } from "../state/session.atom";

interface UsePausableClockOptions {
  running: boolean;
  resetKey: number;
}

// Publish cadence only bounds how late a second boundary lands in the atom;
// precision comes from Date.now() in getElapsed, not from tick counting.
const PUBLISH_TICK_MS = 250;

/**
 * Pausable session clock, off the React render path. Whole seconds are
 * published to session$.elapsedSeconds (so clock subscribers re-render at
 * most once per second, in leaf components); callers that need sub-second
 * precision read it imperatively via the returned getElapsed.
 */
export const usePausableClock = ({
  running,
  resetKey,
}: UsePausableClockOptions) => {
  const accumulatedRef = useRef(0);
  const runStartedAtRef = useRef<number | null>(null);

  const getElapsed = useCallback(() => {
    const runningFor =
      runStartedAtRef.current !== null
        ? (Date.now() - runStartedAtRef.current) / 1000
        : 0;
    return accumulatedRef.current + runningFor;
  }, []);

  useEffect(() => {
    accumulatedRef.current = 0;
    if (runStartedAtRef.current !== null) {
      runStartedAtRef.current = Date.now();
    }
    setSessionElapsedSeconds(0);
  }, [resetKey]);

  useEffect(() => {
    if (!running) return;

    runStartedAtRef.current = Date.now();
    const publish = () => setSessionElapsedSeconds(Math.floor(getElapsed()));
    publish();
    const sub = interval(PUBLISH_TICK_MS).subscribe(publish);

    return () => {
      sub.unsubscribe();
      accumulatedRef.current = getElapsed();
      runStartedAtRef.current = null;
    };
  }, [running, getElapsed]);

  return { getElapsed };
};
