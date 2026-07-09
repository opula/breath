import { useEffect, useState } from "react";
import { Text } from "react-native";

import { frameStatsFeed } from "./start-webgpu-animation-loop";

/**
 * Dev-only frame-stats readout. Mounts nothing in release builds; in dev it
 * polls the frame-stats feed and renders the latest line as accessible text
 * so automation (and eyes) can read it without a Metro log connection.
 */
export const FrameStatsOverlay = () => {
  const [line, setLine] = useState("");

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const interval = setInterval(() => {
      setLine(Object.values(frameStatsFeed.lines).join("\n"));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!__DEV__ || !line) {
    return null;
  }

  return (
    <Text
      accessibilityLabel={line}
      style={{
        position: "absolute",
        top: 64,
        left: 8,
        color: "#7fff7f",
        fontSize: 10,
        fontFamily: "JetBrainsMono-Regular",
        zIndex: 9999,
      }}
    >
      {line}
    </Text>
  );
};
