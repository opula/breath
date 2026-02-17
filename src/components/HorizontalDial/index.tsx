import React, { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Text, TextStyle, View } from "react-native";
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { debounce } from "lodash";
import tw from "../../utils/tw";

const _spacing = 8;
const _rulerHeight = 24;
const _rulerWidth = 2;
const _itemSize = _spacing;
const _fadeRange = 18;

type RulerLineProps = {
  index: number;
  scrollX: SharedValue<number>;
};

const _tickLayout = {
  height: _rulerHeight,
  width: _itemSize,
  justifyContent: "center" as const,
  alignItems: "center" as const,
};

const _lineStyle = {
  width: _rulerWidth,
  height: "100%" as const,
  backgroundColor: "white",
};

const RulerLine = React.memo(function RulerLine({
  index,
  scrollX,
}: RulerLineProps) {
  const stylez = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        Math.abs(scrollX.value - index),
        [0, _fadeRange],
        [0.8, 0],
        "clamp",
      ),
    };
  });
  return (
    <Animated.View style={[_tickLayout, stylez]}>
      <View style={_lineStyle} />
    </Animated.View>
  );
});

type AnimatedTextProps = {
  value: SharedValue<number>;
  style?: TextStyle;
  step: number;
  suffix?: string;
  zeroLabel?: string;
};

function AnimatedText({
  value,
  style = undefined,
  step,
  suffix = "min",
  zeroLabel,
}: AnimatedTextProps) {
  const [displayText, setDisplayText] = useState(zeroLabel ?? "0");

  useAnimatedReaction(
    () => value.value,
    (currentValue: number) => {
      const actualValue = Math.round(currentValue) * step;
      if (zeroLabel && actualValue === 0) {
        runOnJS(setDisplayText)(zeroLabel);
        return;
      }
      const display =
        step < 1 ? actualValue.toFixed(1) : String(Math.round(actualValue));
      const formattedValue = display + " " + suffix;
      runOnJS(setDisplayText)(formattedValue);
    },
    [step, suffix, zeroLabel],
  );

  return (
    <Text style={[tw`text-sm font-medium text-right text-white`, style]}>
      {displayText}
    </Text>
  );
}

interface HorizontalDialProps {
  min: number;
  max: number;
  step: number;
  suffix?: string;
  defaultValue?: number;
  onChange?: (value: number) => void;
  zeroLabel?: string;
}

export const HorizontalDial = ({
  min,
  max,
  step,
  suffix = "min",
  defaultValue,
  onChange,
  zeroLabel,
}: HorizontalDialProps) => {
  const ticks = useMemo(() => {
    return Math.floor((max - min) / step) + 1;
  }, [min, max, step]);

  const initialIndex = useMemo(
    () =>
      defaultValue !== undefined ? Math.round((defaultValue - min) / step) : 0,
    [defaultValue, min, step],
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const data = useMemo(() => [...Array(ticks).keys()], [ticks]);
  const scrollX = useSharedValue(initialIndex);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const debouncedOnChangeRef = useRef(
    debounce((value: number) => onChangeRef.current?.(value), 250),
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = clamp(e.contentOffset.x / _itemSize, 0, data.length - 1);
    },
    onMomentumEnd: () => {
      if (onChange) {
        const raw = min + Math.round(scrollX.value) * step;
        const actual = step < 1 ? parseFloat(raw.toFixed(1)) : Math.round(raw);
        runOnJS(debouncedOnChangeRef.current)(actual);
      }
    },
  });

  return (
    <View style={tw`flex-row items-center`}>
      <View style={tw`items-end pr-4`}>
        <AnimatedText
          value={scrollX}
          step={step}
          suffix={suffix}
          zeroLabel={zeroLabel}
        />
      </View>
      <View style={tw`flex-1`} onLayout={onLayout}>
        {containerWidth > 0 && (
          <Animated.FlatList
            data={data}
            keyExtractor={(item) => String(item)}
            horizontal
            decelerationRate={"fast"}
            showsHorizontalScrollIndicator={false}
            snapToInterval={_itemSize}
            contentContainerStyle={{
              paddingHorizontal: containerWidth / 2 - _itemSize / 2,
            }}
            renderItem={({ index }) => (
              <RulerLine index={index} scrollX={scrollX} />
            )}
            initialScrollIndex={initialIndex}
            getItemLayout={(_data, index) => ({
              length: _itemSize,
              offset: _itemSize * index,
              index,
            })}
            onScroll={onScroll}
            scrollEventThrottle={16}
            windowSize={5}
            maxToRenderPerBatch={50}
            initialNumToRender={50}
            removeClippedSubviews
          />
        )}
        <View
          pointerEvents="none"
          style={{
            alignSelf: "center",
            position: "absolute",
            height: _rulerHeight,
            width: _rulerWidth,
            backgroundColor: "white",
          }}
        />
      </View>
    </View>
  );
};
