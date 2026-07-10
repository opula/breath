import { useEffect, useState } from "react";
// Welcome shows the default scene (Passage) so the first thing a new user
// sees matches the library. No breath is wired here; Passage falls back to
// its ambient pseudo-breath.
import { Passage } from "../../backgrounds/Passage";
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

  return <Passage />;
};
