import { useCallback, useMemo, useRef, useState } from "react";
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

type RulerLineProps = {
  index: number;
  scrollX: SharedValue<number>;
};

const _fadeRange = 30;

function RulerLine({ index, scrollX }: RulerLineProps) {
  const stylez = useAnimatedStyle(() => {
    const dist = Math.abs(scrollX.value - index);
    return {
      opacity: interpolate(dist, [0, _fadeRange], [0.4, 0], "clamp"),
      transform: [
        {
          scaleY: interpolate(
            scrollX.value,
            [index - 1, index, index + 1],
            [0.98, 1, 0.98],
          ),
        },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          height: _rulerHeight,
          width: _itemSize,
          justifyContent: "center",
          alignItems: "center",
        },
        stylez,
      ]}
    >
      <View
        style={{
          width: _rulerWidth,
          height: "100%",
          backgroundColor: "white",
        }}
      />
    </Animated.View>
  );
}

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
  // Use a regular state value for rendering
  const [displayText, setDisplayText] = useState(zeroLabel ?? "0");

  // Update the display text when the value changes
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
  // Calculate the number of ticks needed based on min, max, and step
  const ticks = useMemo(() => {
    return Math.floor((max - min) / step) + 1;
  }, [min, max, step]);

  // Calculate initial index based on defaultValue
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
            renderItem={({ index }) => {
              return <RulerLine index={index} scrollX={scrollX} />;
            }}
            initialScrollIndex={initialIndex}
            getItemLayout={(_data, index) => ({
              length: _itemSize,
              offset: _itemSize * index,
              index,
            })}
            onScroll={onScroll}
            scrollEventThrottle={16} // ~60fps
          />
        )}
        <View
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
