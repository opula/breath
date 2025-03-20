import {FlashList} from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

export const getShiftIntervals = (itemsTotal: number) => {
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
};

export const generateNumbers = (
  min: number,
  max: number,
  step: number = 1,
): number[] => {
  const decimalPlaces = (step.toString().split('.')[1] || []).length;
  const numbers = [];
  for (let i = min; i <= max; i += step) {
    numbers.push(parseFloat(i.toFixed(decimalPlaces)));
  }
  return numbers;
};

Animated.addWhitelistedNativeProps({text: true});
export const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
