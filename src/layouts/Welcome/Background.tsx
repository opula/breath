import { useEffect, useState } from "react";
// Welcome still renders the archived Harmonic Tide shader; swapping the
// splash to one of the new scenes is a separate product decision.
import { SinPulse } from "../../backgrounds/archive/SinPulse";
import { useAppIsActive } from "../../hooks/useAppIsActive";

const DELAY_MS = 1500;

export const WelcomeBackground = () => {
  const [ready, setReady] = useState(false);
  const isAppActive = useAppIsActive();

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready || !isAppActive) return null;

  return <SinPulse grayscale />;
};
