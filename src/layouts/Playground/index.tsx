import React from 'react';
import {TextInputProps, View, TextInput, useWindowDimensions} from 'react-native';
import tw from '../../utils/tw';
import {FlashList, ListRenderItem} from '@shopify/flash-list';
import {range} from 'lodash';
// Define InputProps locally
type InputProps = TextInputProps & {
  variant?: string;
  error?: string;
};
import Animated, {
  Extrapolate,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import {Icon} from '../../components/Icon';
import {NumberWheelPicker} from '../../components/NumberWheelPicker';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

function getShiftIntervals(itemsTotal: number) {
  let prev = 0;
  let currentItem = 0;
  const negativeArray = [0, 0, 0];
  const positiveArray = [];

  for (let i = 0; i < itemsTotal; i++) {
    currentItem = prev + 2 + i;
    positiveArray.push(currentItem);
    negativeArray.unshift(-currentItem);
    prev = currentItem;
  }

  return negativeArray.concat(positiveArray);
}

const items = range(0, 1001).map(item => item / 10) as number[];

export const INITIAL_INDEX = 0;
export const ITEM_WIDTH = 17;
export const VISIBLE_ITEMS = 29;
export const DRAW_ITEMS = Math.floor(VISIBLE_ITEMS / 2);
export const SHIFT_INTERVALS = getShiftIntervals(DRAW_ITEMS - 1);
export const WHEEL_WIDTH = 350;
export const WHEEL_PADDING = WHEEL_WIDTH / 2 - ITEM_WIDTH / 2;
export const IDXS = [...Array(VISIBLE_ITEMS).keys()].map(
  index => index - DRAW_ITEMS,
);

Animated.addWhitelistedNativeProps({text: true});

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export const AnimatedText = ({
  text,
  ...props
}: {text: SharedValue<string>} & InputProps) => {
  const animatedProps = useAnimatedProps(() => {
    return {text: text.value} as unknown as TextInputProps;
  });

  return (
    <AnimatedTextInput
      editable={false}
      value={text.value}
      style={tw`text-white font-lusitana`}
      animatedProps={animatedProps}
      {...props}
    />
  );
};

const Interval = ({
  item,
  index,
  progress,
}: {
  item: number;
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
        'rgba(0, 0, 255, 1)',
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
      style={[tw`w-[17px] h-6 justify-center items-center`, animatedStyle]}>
      <Animated.View
        style={[tw`w-[1.5px] rounded-sm`, (item * 10) % 5 === 0 ? tw`h-4` : tw`h-2`, animatedColorStyle]}
      />
    </Animated.View>
  );
};

export const Playground = () => {
  const scrollX = useSharedValue(0);
  const progress = useDerivedValue(() => {
    return scrollX.value / ITEM_WIDTH;
  });

  const currentIndex = useSharedValue(INITIAL_INDEX);

  useAnimatedReaction(
    () => Math.min(Math.max(0, progress.value), items.length - 1),
    minMaxProgress => {
      if (Math.abs(currentIndex.value - minMaxProgress) > 0.5) {
        currentIndex.value = Math.round(minMaxProgress);
      }
    },
  );

  const headerTx = useDerivedValue(() => {
    const value = currentIndex.value / 10;
    const minutes = Math.floor(value / 60);
    const seconds = parseFloat((value % 60).toFixed(1));
    return `${minutes < 10 ? '0' : ''}${minutes}:${
      seconds < 10 ? '0' : ''
    }${seconds.toFixed(1)}`;
  });

  const scrollHandler = useAnimatedScrollHandler(event => {
    scrollX.value = event.contentOffset.x;
  });

  const renderItem: ListRenderItem<any> = ({item, index}) => (
    <Interval {...{item, index, progress}} />
  );

  const maskElement = (
    <View style={tw`w-[350px]`}>
      <AnimatedFlashList
        data={items}
        initialScrollIndex={INITIAL_INDEX}
        estimatedItemSize={ITEM_WIDTH}
        snapToInterval={ITEM_WIDTH}
        snapToAlignment="start"
        keyExtractor={item => `${item}`}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        estimatedFirstItemOffset={0}
        contentContainerStyle={{paddingHorizontal: WHEEL_PADDING}}
      />
      <View style={tw`self-center pt-0.5`}>
        <Icon name="caret-up-md" size={24} color={'blue'} />
      </View>
    </View>
  );

  return (
    <View
      style={tw`flex-1 bg-black items-center justify-center`}>
      <NumberWheelPicker min={0} max={100} step={0.1} />
    </View>
  );
};
