import { useEffect, useState } from "react";
import { SinPulse } from "../../backgrounds/SinPulse";

const DELAY_MS = 1500;

export const WelcomeBackground = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return <SinPulse grayscale />;
};
