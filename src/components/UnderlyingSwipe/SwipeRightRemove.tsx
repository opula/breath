import { useAnimatedStyle } from "react-native-reanimated";
import { useSwipeableItemParams } from "react-native-swipeable-item";
import { Text, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import tw from "../../utils/tw";
import { Icon } from "../Icon";

export const SwipeRightRemove = ({
  onPressDelete,
  drag,
}: {
  drag: () => void;
  onPressDelete: () => void;
}) => {
  const { percentOpen } = useSwipeableItemParams();

  const animStyle = useAnimatedStyle(
    () => ({
      opacity: percentOpen.value,
    }),
    [percentOpen],
  );

  return (
    <Animated.View
      style={[
        tw`bg-white bg-opacity-10 h-full w-full flex-row items-center justify-end`,
        animStyle,
      ]}
    >
      <Pressable
        style={tw`bg-white bg-opacity-25 justify-center items-center h-full w-24 active:opacity-80`}
        onPress={onPressDelete}
      >
        {/* <Text style={tw`text-xs font-inter text-red-600`}>Remove</Text> */}
        {/* <Icon name="trash" size={20} color={"#dc2626"} /> */}
        <Icon name="trash" size={20} color={"white"} />
      </Pressable>
    </Animated.View>
  );
};
