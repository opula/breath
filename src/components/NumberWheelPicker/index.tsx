import {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import {
  INITIAL_INDEX,
  ITEM_WIDTH,
  WHEEL_PADDING,
  WHEEL_WIDTH,
} from './contants';
import {useMemo, useRef} from 'react';
import {AnimatedFlashList, generateNumbers} from './utils';
import {ListRenderItem} from '@shopify/flash-list';
import {Interval} from './Interval';
import {AnimatedText} from './AnimatedText';
import {View} from 'react-native';
import {Icon} from '../Icon';
import {debounce} from 'lodash';
import tw from '../../utils/tw';

interface NumberWheelPickerProps {
  min: number;
  max: number;
  step: number;
  isCount?: boolean;
  defaultValue?: number;
  onChange?: (value: number) => void;
}

export const NumberWheelPicker = ({
  min,
  max,
  step,
  isCount = false,
  defaultValue,
  onChange,
}: NumberWheelPickerProps) => {
  const initialIndex = useMemo(
    () => (defaultValue && Math.round(defaultValue / step)) || INITIAL_INDEX,
    [defaultValue, step],
  );
  const debouncedOnChangeRef = useRef(
    debounce((value: number) => onChange?.(value * step), 250),
  );

  const items = useMemo(
    () => generateNumbers(min, max, step),
    [min, max, step],
  );

  const scrollX = useSharedValue(0);
  const progress = useDerivedValue(() => {
    return scrollX.value / ITEM_WIDTH;
  });

  const currentIndex = useSharedValue(initialIndex || INITIAL_INDEX);

  useAnimatedReaction(
    () => Math.min(Math.max(0, progress.value), items.length - 1),
    minMaxProgress => {
      if (Math.abs(currentIndex.value - minMaxProgress) > 0.5) {
        const updatedValue = Math.round(minMaxProgress);
        currentIndex.value = updatedValue;

        runOnJS(debouncedOnChangeRef.current)(updatedValue);
      }
    },
    [onChange],
  );

  const headerTx = useDerivedValue(() => {
    if (isCount)
      return `${currentIndex.value === 0 ? 'Infinite' : currentIndex.value}`;
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
    <Interval {...{item, step, index, progress}} />
  );

  return (
    <>
      <AnimatedText text={headerTx} fontSize={20} lineHeight={20} />

      <View style={tw`h-[114px] items-center justify-center`}>
        <View style={{width: WHEEL_WIDTH}}>
          <AnimatedFlashList
            data={items}
            initialScrollIndex={initialIndex || INITIAL_INDEX}
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
            <Icon name="caret-up-md" size={24} color="#0000FF" />
          </View>
        </View>
      </View>
    </>
  );
};
