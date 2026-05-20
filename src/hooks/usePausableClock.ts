import { useEffect, useRef, useState } from "react";
import { interval } from "rxjs";

interface UsePausableClockOptions {
  running: boolean;
  resetKey: number;
  tickMs: number;
}

export const usePausableClock = ({
  running,
  resetKey,
  tickMs,
}: UsePausableClockOptions) => {
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    elapsedRef.current = 0;
    lastTickRef.current = null;
    setElapsed(0);
  }, [resetKey]);

  useEffect(() => {
    if (!running) {
      lastTickRef.current = null;
      return;
    }

    lastTickRef.current = Date.now();
    const sub = interval(tickMs).subscribe(() => {
      const now = Date.now();
      const previous = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const nextElapsed = elapsedRef.current + (now - previous) / 1000;
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
    });

    return () => {
      sub.unsubscribe();
    };
  }, [running, tickMs]);

  return elapsed;
};
