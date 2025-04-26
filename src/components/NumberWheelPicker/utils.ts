import {FlashList} from '@shopify/flash-list';
import Animated from 'react-native-reanimated';

// This function is no longer needed as we pre-calculated the values in constants.ts
// Keeping it here for reference but it's not used anymore
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

// Cache for generated number arrays to avoid recalculation
const numberArrayCache: Record<string, number[]> = {};

/**
 * Generates an array of numbers from min to max with the specified step
 * Uses caching to avoid regenerating the same array multiple times
 */
export const generateNumbers = (
  min: number,
  max: number,
  step: number = 1,
): number[] => {
  // Create a cache key based on the parameters
  const cacheKey = `${min}-${max}-${step}`;
  
  // Return cached result if available
  if (numberArrayCache[cacheKey]) {
    return numberArrayCache[cacheKey];
  }
  
  // Calculate decimal places for proper number formatting
  const decimalPlaces = (step.toString().split('.')[1] || []).length;
  
  // Pre-allocate array with the correct size for better performance
  const count = Math.floor((max - min) / step) + 1;
  const numbers = new Array(count);
  
  // Generate numbers with optimized loop
  let index = 0;
  for (let i = min; i <= max; i += step) {
    numbers[index++] = parseFloat(i.toFixed(decimalPlaces));
  }
  
  // Cache the result
  numberArrayCache[cacheKey] = numbers;
  return numbers;
};

// Register text as an animatable prop
Animated.addWhitelistedNativeProps({text: true});

// Create animated version of FlashList
export const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
