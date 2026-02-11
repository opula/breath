import React, { useMemo } from "react";
import {
  BlendMode,
  Canvas,
  Group,
  ImageSVG,
  Skia,
  fitbox,
  rect,
} from "@shopify/react-native-skia";

import svgs from "./svgs";
import Animated from "react-native-reanimated";
import { View } from "react-native";

export type IconName = keyof typeof svgs;

export interface IconProps {
  name: IconName;
  size: number;
  color: string;
}

export const Icon = ({ name, size, color }: IconProps) => {
  const paint = useMemo(() => Skia.Paint(), []);

  if (!name || !Object.keys(svgs).includes(name)) {
    return null;
  }

  const svg = svgs[name];
  if (!svg) return null;

  const ow = svg.width();
  const oh = svg.height();
  const src = rect(0, 0, ow, oh);
  const dst = rect(0, 0, size, size);
  paint.setColorFilter(
    Skia.ColorFilter.MakeBlend(Skia.Color(color), BlendMode.SrcIn),
  );

  return (
    <View pointerEvents="none">
      <Canvas style={{ height: size, width: size }}>
        <Group transform={fitbox("contain", src, dst)} layer={paint}>
          <ImageSVG svg={svg} />
        </Group>
      </Canvas>
    </View>
  );
};
