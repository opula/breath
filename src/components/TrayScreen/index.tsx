import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import React, {
  ReactNode,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "@react-navigation/native";
import { useDebouncedCallback } from "use-debounce";
import { clamp } from "react-native-redash";
import tw from "../../utils/tw";
import { delay } from "lodash";

export interface TrayScreenHandle {
  dismiss: () => void;
}

interface TrayScreenProps {
  trayHeight: number;
  children: ReactNode;
  dismissible?: boolean;
}

export const TrayScreen = forwardRef<TrayScreenHandle, TrayScreenProps>(
  ({ trayHeight, dismissible = true, children }, ref) => {
    const { width } = useWindowDimensions();
    const navigation = useNavigation();
    const translateY = useSharedValue(0);
    const startY = useSharedValue(0);

    const dismiss = () => {
      translateY.value = withTiming(trayHeight, { duration: 200 });
      delay(navigation.goBack, 200);
    };

    const dismissOutside = useDebouncedCallback(dismiss, 1000, {
      leading: true,
      trailing: false,
    });

    useImperativeHandle(ref, () => ({
      dismiss,
    }));

    const animatedTrayStyles = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    const panGesture = Gesture.Pan()
      .onStart(() => {
        if (!dismissible) return;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        if (!dismissible) return;
        translateY.value = clamp(
          startY.value + event.translationY,
          0,
          trayHeight
        );
      })
      .onEnd(() => {
        if (!dismissible) return;
        const thresholdMet = translateY.value > 120;
        translateY.value = withTiming(thresholdMet ? trayHeight : 0, {
          duration: 200,
        });
        if (thresholdMet) runOnJS(navigation.goBack)();
      });

    return (
      <View style={tw`flex-1 justify-end items-center`}>
        <Pressable
          style={[StyleSheet.absoluteFill]}
          onPress={dismissible ? dismissOutside : undefined}
        />

        <Animated.View
          style={[
            animatedTrayStyles,
            tw`bg-neutral-900 rounded-t-3xl`,
            { height: trayHeight, width: Math.min(540, width) },
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={tw`justify-center items-center h-[40px] w-full`}
            >
              <View style={tw`h-1 w-20 bg-neutral-800 rounded-sm mt-3`} />
            </Animated.View>
          </GestureDetector>
          <View style={tw`px-4 flex-1`}>{children}</View>
        </Animated.View>
      </View>
    );
  }
);
