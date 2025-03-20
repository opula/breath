import {
  Extrapolate,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import {DRAW_ITEMS, IDXS, ITEM_WIDTH, SHIFT_INTERVALS} from './contants';
import Animated from 'react-native-reanimated';
import tw from '../../utils/tw';

export const Interval = ({
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

  const animatedColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [
        index - DRAW_ITEMS,
        index - (DRAW_ITEMS - 1),
        index - (DRAW_ITEMS - 5),
        index - 1,
        index,
        index + 1,
        index + (DRAW_ITEMS - 1),
        index + DRAW_ITEMS,
      ],
      [
        'rgba(255, 255, 255, 0)',
        'rgba(255, 255, 255, .1)',
        'rgba(255, 255, 255, .5)',
        'rgba(255, 255, 255, 1)',
        '#0000FF',
        'rgba(255, 255, 255, 1)',
        'rgba(255, 255, 255, .5)',
        'rgba(255, 255, 255, .1)',
        'rgba(255, 255, 255, 0)',
      ],
    ),
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [
        index - DRAW_ITEMS,
        index - (DRAW_ITEMS - 1),
        index - (DRAW_ITEMS - 5),
        index,
        index + (DRAW_ITEMS - 5),
        index + (DRAW_ITEMS - 1),
        index + DRAW_ITEMS,
      ],
      [0, 0.25, 1, 1, 1, 0.25, 0],
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
            height: (item * (0.1 / step) * 10) % 5 === 0 ? 16 : 8
          },
          animatedColorStyle
        ]}
      />
    </Animated.View>
  );
};
