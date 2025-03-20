import {
  Blur,
  Canvas,
  Circle,
  ColorMatrix,
  Group,
  Paint,
  RadialGradient,
  SweepGradient,
  useValue,
  vec,
} from "@shopify/react-native-skia";
import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export const InOut = () => {
  const { width, height } = useWindowDimensions();
  const cx = useValue(width / 2);
  const cy = useValue(height / 2);
  const upY = useSharedValue(height / 2);
  const downY = useSharedValue(height / 2);
  const leftX = useSharedValue(width / 2);
  const rightX = useSharedValue(width / 2);

  useEffect(() => {
    upY.value = withRepeat(
      withSequence(
        withTiming(height / 8, { duration: 2000 }),
        withTiming(height / 2, { duration: 1000 })
      ),
      -1
    );

    downY.value = withRepeat(
      withSequence(
        withTiming(height - height / 8, { duration: 2000 }),
        withTiming(height / 2, { duration: 1000 })
      ),
      -1
    );

    leftX.value = withRepeat(
      withSequence(
        withTiming(width - width / 8, { duration: 2000 }),
        withTiming(width / 2, { duration: 1000 })
      ),
      -1
    );

    rightX.value = withRepeat(
      withSequence(
        withTiming(width / 8, { duration: 2000 }),
        withTiming(width / 2, { duration: 1000 })
      ),
      -1
    );
  }, [height]);

  const layer = useMemo(() => {
    return (
      <Paint>
        {/* pixelOpacity > blurredOpacity * 60 - 30 */}
        <Blur blur={64} />
        <ColorMatrix
          matrix={[
            // R, G, B, A, Bias (Offset)
            // prettier-ignore
            1, 0, 0, 0, 0,
            // prettier-ignore
            0, 1, 0, 0, 0,
            // prettier-ignore
            0, 0, 1, 0, 0,
            // prettier-ignore
            0, 0, 0, 41, -30,
          ]}
        />
      </Paint>
    );
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={{ width, height, opacity: 0.9 }}>
        <Group layer={layer}>
          <Circle cy={upY} cx={cx} r={height / 8} />
          <Circle cy={downY} cx={cx} r={height / 8} />
          <Circle cy={cy} cx={leftX} r={height / 8} />
          <Circle cy={cy} cx={rightX} r={height / 8} />
          <Circle cy={height / 2} cx={width / 2} r={height / 7} />
          <RadialGradient
            c={vec(width / 2, height / 2)}
            r={height / 7}
            colors={["magenta", "cyan"]}
          />
        </Group>
      </Canvas>
    </View>
  );
};
