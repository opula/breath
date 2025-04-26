import {
  Extrapolate,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { memo } from 'react';
import {DRAW_ITEMS, IDXS, ITEM_WIDTH, SHIFT_INTERVALS} from './contants';
import Animated from 'react-native-reanimated';
import tw from '../../utils/tw';

export const Interval = memo(({
  item,
  step,
  index,
  progress,
}: {
  item: number;
  step: number;
  index: number;
  progress: SharedValue<number>;
}) => {
  const indexDiff = useDerivedValue(() => {
    return progress.value - index;
  });

  // Simplified color interpolation with fewer color stops for better performance
  const animatedColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [
        index - DRAW_ITEMS,
        index - (DRAW_ITEMS - 3),
        index - 1,
        index,
        index + 1,
        index + (DRAW_ITEMS - 3),
        index + DRAW_ITEMS,
      ],
      [
        'rgba(255, 255, 255, 0)',
        'rgba(255, 255, 255, .2)',
        'rgba(255, 255, 255, 1)',
        '#0000FF',
        'rgba(255, 255, 255, 1)',
        'rgba(255, 255, 255, .2)',
        'rgba(255, 255, 255, 0)',
      ],
    ),
  }));

  // Simplified opacity interpolation with fewer points for better performance
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [
        index - DRAW_ITEMS,
        index - (DRAW_ITEMS - 3),
        index - 2,
        index,
        index + 2,
        index + (DRAW_ITEMS - 3),
        index + DRAW_ITEMS,
      ],
      [0, 0.3, 1, 1, 1, 0.3, 0],
      Extrapolate.CLAMP,
    ),
    transform: [
      {
        translateX: interpolate(
          indexDiff.value,
          [...IDXS],
          [...SHIFT_INTERVALS],
          Extrapolate.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        tw`h-6 justify-center items-center`,
        {width: ITEM_WIDTH},
        animatedStyle
      ]}>
      <Animated.View
        style={[
          tw`rounded-sm`,
          {
            width: 1.5,
            // Pre-calculate height based on item value for better performance
            height: item % (5 * step) === 0 ? 16 : 8
          },
          animatedColorStyle
        ]}
      />
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.index === nextProps.index &&
    prevProps.item === nextProps.item &&
    prevProps.step === nextProps.step &&
    prevProps.progress === nextProps.progress
  );
});
