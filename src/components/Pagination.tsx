import React, {FC} from 'react';
import {
  Extrapolate,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {range} from 'lodash';
import {View} from 'react-native';
import Animated from 'react-native-reanimated';
import tw from '../utils/tw';

export const Pagination: FC<{
  count: number;
  progressValue: SharedValue<number>;
}> = ({count, progressValue}) => {
  return (
    <View style={tw`flex-row items-center justify-center`}>
      {range(count).map(index => (
        <PaginationItem
          backgroundColor={'white'}
          animValue={progressValue}
          index={index}
          key={index}
          length={count}
        />
      ))}
    </View>
  );
};

const PaginationItem: FC<{
  index: number;
  backgroundColor: string;
  length: number;
  animValue: SharedValue<number>;
  isRotate?: boolean;
}> = ({animValue, index, length, backgroundColor, isRotate}) => {
  const size = 8;

  const animStyle = useAnimatedStyle(() => {
    let inputRange = [index - 1, index, index + 1];
    let outputRange = [-size, 0, size];

    if (index === 0 && animValue?.value > length - 1) {
      inputRange = [length - 1, length, length + 1];
      outputRange = [-size, 0, size];
    }

    return {
      backgroundColor: interpolateColor(animValue?.value, inputRange, [
        'rgba(255,255,255,0.3)',
        backgroundColor,
        'rgba(255,255,255,0.3)',
      ]),
      width: interpolate(
        animValue.value,
        inputRange,
        [8, 24, 8],
        Extrapolate.CLAMP,
      ),
    };
  }, [animValue, index, length]);

  return (
    <View
      style={[
        tw`h-2 mx-0.5 rounded-md overflow-hidden`,
        {
          transform: [
            {
              rotateZ: isRotate ? '90deg' : '0deg',
            },
          ],
        },
      ]}>
      <Animated.View style={[tw`rounded-xl flex-1`, animStyle]} />
    </View>
  );
};
