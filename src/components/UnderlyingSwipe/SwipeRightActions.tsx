import { useAnimatedStyle } from "react-native-reanimated";
import { useSwipeableItemParams } from "react-native-swipeable-item";
import { Pressable } from "react-native";
import Animated from "react-native-reanimated";
import tw from "../../utils/tw";
import { Icon } from "../Icon";

export const SwipeRightActions = ({
  onPressBackground,
  drag,
}: {
  drag: () => void;
  onPressBackground: () => void;
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
        tw`bg-white bg-opacity-10 h-full w-full flex-row items-center justify-start`,
        animStyle,
      ]}
    >
      <Pressable
        style={tw`bg-white bg-opacity-15 justify-center items-center h-full w-24 active:opacity-80`}
        onPress={onPressBackground}
      >
        <Icon name="headphones" size={20} color="white" />
      </Pressable>
    </Animated.View>
  );
};
