import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export const useAppIsActive = () => {
  const [isActive, setIsActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const onStateChange = (nextState: AppStateStatus) => {
      setIsActive(nextState === "active");
    };

    const subscription = AppState.addEventListener("change", onStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  return isActive;
};
