import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from "react-native";
import Animated, {
  clamp,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedProps,
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
const { width } = Dimensions.get("window");

type RulerLineProps = {
  index: number;
  scrollX: SharedValue<number>;
};

function RulerLine({ index, scrollX }: RulerLineProps) {
  const stylez = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scaleY: interpolate(
            scrollX.value,
            [index - 1, index, index + 1],
            [0.98, 1, 0.98]
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
      ]}>
      <View
        style={{
          width: _rulerWidth,
          height: "100%",
          backgroundColor: "white",
          opacity: 0.3,
        }}
      />
    </Animated.View>
  );
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
type AnimatedTextProps = {
  value: SharedValue<number>;
  style?: TextStyle;
  step: number;
  isCount?: boolean;
};

function AnimatedText({ value, style = undefined, step, isCount = false }: AnimatedTextProps) {
  // Use a regular state value for rendering
  const [displayText, setDisplayText] = useState("0");
  
  // Update the display text when the value changes
  useAnimatedReaction(
    () => value.value,
    (currentValue: number) => {
      const actualValue = Math.round(currentValue) * step;
      const formattedValue = String(actualValue) + (isCount ? " count" : " min");
      runOnJS(setDisplayText)(formattedValue);
    },
    [step, isCount]
  );

  return (
    <Text
      style={[
        {
          fontSize: 28,
          fontWeight: "700",
          textAlign: "center",
          letterSpacing: -2,
          fontVariant: ["tabular-nums"],
          color: "white",
        },
        style,
      ]}
    >
      {displayText}
    </Text>
  );
}

interface HorizontalDialProps {
  min: number;
  max: number;
  step: number;
  isCount?: boolean;
  defaultValue?: number;
  onChange?: (value: number) => void;
}

export const HorizontalDial = ({
  min,
  max,
  step,
  isCount = false,
  defaultValue,
  onChange,
}: HorizontalDialProps) => {
  // Calculate the number of ticks needed based on min, max, and step
  const ticks = useMemo(() => {
    return Math.floor((max - min) / step) + 1;
  }, [min, max, step]);

  // Calculate initial index based on defaultValue
  const initialIndex = useMemo(
    () => (defaultValue !== undefined ? Math.round((defaultValue - min) / step) : 0),
    [defaultValue, min, step]
  );

  const data = useMemo(() => [...Array(ticks).keys()], [ticks]);
  const scrollX = useSharedValue(initialIndex);
  
  const debouncedOnChangeRef = useRef(
    debounce((value: number) => onChange?.(min + value * step), 250)
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = clamp(e.contentOffset.x / _itemSize, 0, data.length - 1);
    },
    onMomentumEnd: (e) => {
      if (onChange) {
        runOnJS(debouncedOnChangeRef.current)(Math.floor(scrollX.value));
      }
    },
  });

  return (
    <View style={tw`justify-center gap-2`}>
      <View style={tw`justify-center items-center mb-2`}>
        <AnimatedText value={scrollX} step={step} isCount={isCount} />
      </View>
      <View>
        <Animated.FlatList
          data={data}
          keyExtractor={(item) => String(item)}
          horizontal
          decelerationRate={"fast"}
          showsHorizontalScrollIndicator={false}
          snapToInterval={_itemSize}
          contentContainerStyle={{
            paddingHorizontal: width / 2 - _itemSize / 2,
          }}
          renderItem={({ index }) => {
            return <RulerLine index={index} scrollX={scrollX} />;
          }}
          initialScrollIndex={initialIndex}
          getItemLayout={(data, index) => ({
            length: _itemSize,
            offset: _itemSize * index,
            index,
          })}
          onScroll={onScroll}
          scrollEventThrottle={16} // ~60fps
        />
        <View
          style={{
            alignSelf: "center",
            position: "absolute",
            height: _rulerHeight,
            width: _rulerWidth,
            backgroundColor: "white",
          }}
        />
        <LinearGradient
          style={[StyleSheet.absoluteFillObject]}
          colors={["#000000", "#00000000", "#00000000", "#000000"]}
          start={[0, 0.5]}
          end={[1, 0.5]}
          locations={[0, 0.3, 0.7, 1]}
          pointerEvents="none"
        />
      </View>
    </View>
  );
};
