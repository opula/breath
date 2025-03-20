import {useAnimatedStyle} from 'react-native-reanimated';
import {useSwipeableItemParams} from 'react-native-swipeable-item';
import {Text, TouchableOpacity} from 'react-native';
import Animated from 'react-native-reanimated';
import tw from '../../utils/tw';

export const SwipeRightRemove = ({
  onPressDelete,
  drag,
}: {
  drag: () => void;
  onPressDelete: () => void;
}) => {
  const {percentOpen} = useSwipeableItemParams();

  const animStyle = useAnimatedStyle(
    () => ({
      opacity: percentOpen.value,
    }),
    [percentOpen],
  );

  return (
    <Animated.View
      style={[tw`bg-white h-full w-full flex-row items-center justify-end`, animStyle]}>
      <TouchableOpacity
        style={tw`bg-white justify-center items-center h-full w-30 active:opacity-80`}
        onPress={onPressDelete}>
        <Text style={tw`text-base font-lusitana text-black`}>
          Remove
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
