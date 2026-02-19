import { useEffect, useState } from "react";
import { SinPulse } from "../../backgrounds/SinPulse";
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
