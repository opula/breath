import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  clamp,
  runOnJS,
  SharedValue,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import tw from "../../utils/tw";

const _spacing = 8;
const _rulerHeight = 24;
const _rulerWidth = 2;
const _itemSize = _spacing;
const _activeTickColor = "#6FE7FF";

Animated.addWhitelistedNativeProps({ text: true });

const getStepPrecision = (step: number) => {
  const [, fraction = ""] = step.toString().split(".");
  return fraction.length;
};

const quantizeValue = (value: number, precision: number) => {
  "worklet";
  return Number(value.toFixed(precision));
};

const getTickHeight = (index: number) => {
  if (index % 10 === 0) return _rulerHeight;
  if (index % 5 === 0) return Math.round(_rulerHeight * 0.72);
  return Math.round(_rulerHeight * 0.45);
};

type RulerLineProps = {
  index: number;
};

const RulerLine = React.memo(function RulerLine({ index }: RulerLineProps) {
  const lineHeight = getTickHeight(index);
  return (
    <View style={styles.tickSlot}>
      <View style={[styles.tick, { height: lineHeight }]} />
    </View>
  );
});

type AnimatedValueTextProps = {
  text: SharedValue<string>;
  style?: TextStyle;
};

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const AnimatedValueText = React.memo(function AnimatedValueText({
  text,
  style = undefined,
}: AnimatedValueTextProps) {
  const animatedProps = useAnimatedProps(
    () => ({ text: text.value }) as unknown as TextInputProps,
    [text],
  );

  return (
    <AnimatedTextInput
      editable={false}
      value={text.value}
      animatedProps={animatedProps}
      underlineColorAndroid="transparent"
      style={[
        tw`text-sm font-medium text-right text-white`,
        styles.valueText,
        style,
      ]}
    />
  );
});

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
  const precision = useMemo(() => getStepPrecision(step), [step]);

  const ticks = useMemo(() => {
    return Math.floor((max - min) / step) + 1;
  }, [min, max, step]);

  const maxIndex = ticks - 1;
  const initialIndex = useMemo(
    () => {
      const rawIndex =
        defaultValue !== undefined ? Math.round((defaultValue - min) / step) : 0;
      return Math.max(0, Math.min(maxIndex, rawIndex));
    },
    [defaultValue, min, step, maxIndex],
  );

  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const data = useMemo(() => [...Array(ticks).keys()], [ticks]);
  const listRef = useRef<Animated.FlatList<number>>(null);
  const hasInitializedRef = useRef(false);
  const scrollX = useSharedValue(initialIndex);
  const lastEmittedIndex = useSharedValue(initialIndex);
  const momentumStarted = useSharedValue(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const displayText = useDerivedValue(() => {
    const index = clamp(Math.round(scrollX.value), 0, maxIndex);
    const actualValue = quantizeValue(min + index * step, precision);
    if (zeroLabel && actualValue === 0) return zeroLabel;
    const display =
      precision > 0 ? actualValue.toFixed(precision) : String(actualValue);
    return `${display} ${suffix}`;
  }, [min, step, precision, suffix, zeroLabel, maxIndex]);

  const emitChange = useCallback(
    (nextIndex: number) => {
      const raw = min + nextIndex * step;
      onChangeRef.current?.(quantizeValue(raw, precision));
    },
    [min, step, precision],
  );

  const maskElement = useMemo(
    () => (
      <View pointerEvents="none" style={styles.maskContainer}>
        <LinearGradient
          colors={["transparent", "black", "black", "transparent"]}
          locations={[0, 0.16, 0.84, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    ),
    [],
  );

  const contentPadding = useMemo(
    () => ({
      paddingHorizontal: containerWidth / 2 - _itemSize / 2,
    }),
    [containerWidth],
  );

  const renderTick = useCallback(
    ({ index }: { index: number }) => <RulerLine index={index} />,
    [],
  );

  useEffect(() => {
    if (containerWidth <= 0) return;
    if (hasInitializedRef.current) return;

    scrollX.value = initialIndex;
    lastEmittedIndex.value = initialIndex;
    listRef.current?.scrollToOffset({
      animated: false,
      offset: initialIndex * _itemSize,
    });
    hasInitializedRef.current = true;
  }, [containerWidth, initialIndex, scrollX, lastEmittedIndex]);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      momentumStarted.value = false;
    },
    onScroll: (e) => {
      scrollX.value = clamp(e.contentOffset.x / _itemSize, 0, maxIndex);
    },
    onMomentumBegin: () => {
      momentumStarted.value = true;
    },
    onEndDrag: () => {
      if (momentumStarted.value) return;
      const nextIndex = clamp(Math.round(scrollX.value), 0, maxIndex);
      if (nextIndex === lastEmittedIndex.value) return;
      lastEmittedIndex.value = nextIndex;
      runOnJS(emitChange)(nextIndex);
    },
    onMomentumEnd: () => {
      const nextIndex = clamp(Math.round(scrollX.value), 0, maxIndex);
      if (nextIndex === lastEmittedIndex.value) return;
      lastEmittedIndex.value = nextIndex;
      runOnJS(emitChange)(nextIndex);
    },
  });

  return (
    <View style={tw`flex-row items-center`}>
      <View style={tw`items-end pr-4`}>
        <AnimatedValueText text={displayText} />
      </View>
      <View onLayout={onLayout} style={styles.dialContainer}>
        {containerWidth > 0 && (
          <MaskedView maskElement={maskElement} style={styles.maskedDial}>
            <Animated.FlatList
              ref={listRef}
              data={data}
              keyExtractor={(item) => String(item)}
              horizontal
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              snapToInterval={_itemSize}
              contentContainerStyle={contentPadding}
              renderItem={renderTick}
              initialScrollIndex={initialIndex}
              getItemLayout={(_data, index) => ({
                length: _itemSize,
                offset: _itemSize * index,
                index,
              })}
              onScroll={onScroll}
              scrollEventThrottle={16}
              windowSize={4}
              maxToRenderPerBatch={32}
              initialNumToRender={32}
              removeClippedSubviews
            />
          </MaskedView>
        )}
        <View pointerEvents="none" style={styles.centerLine} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dialContainer: {
    flex: 1,
    height: _rulerHeight,
    justifyContent: "center",
  },
  maskedDial: {
    height: _rulerHeight,
  },
  tickSlot: {
    alignItems: "center",
    height: _rulerHeight,
    justifyContent: "flex-end",
    width: _itemSize,
  },
  tick: {
    backgroundColor: "white",
    borderRadius: _rulerWidth,
    width: _rulerWidth,
  },
  maskContainer: {
    backgroundColor: "transparent",
    flex: 1,
  },
  centerLine: {
    alignSelf: "center",
    backgroundColor: _activeTickColor,
    height: _rulerHeight,
    position: "absolute",
    width: _rulerWidth + 1,
  },
  valueText: {
    margin: 0,
    padding: 0,
  },
});
