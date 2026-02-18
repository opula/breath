import React, { Ref, useRef, useState } from "react";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel";
import {
  Platform,
  useWindowDimensions,
  View,
  Text,
  Pressable,
} from "react-native";
import {
  OrientationLocker,
  PORTRAIT,
} from "@hortau/react-native-orientation-locker";
import { useSharedValue } from "react-native-reanimated";
import { AnimatePresence, MotiView } from "moti";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { HAS_COMPLETED_WELCOME, storage } from "../../utils/storage";
import { Pagination } from "./Pagination";
import { WelcomeBackground } from "./Background";
import tw from "../../utils/tw";

const cards = [
  {
    title: "Breathe with intention",
    message:
      "A space for stillness. Guided exercises to anchor your breath and quiet the mind.",
  },
  {
    title: "Your practice, your way",
    message:
      "Customize every step. Adjust timing, add holds, change the rhythm to suit your flow.",
  },
  {
    title: "Just begin",
    message:
      "Tap to start. Swipe to explore. Everything else fades away.",
  },
];

interface Props {
  navigation: NavigationProp<MainStackParams, "Welcome">;
}

export const Welcome = ({ navigation }: Props) => {
  const { height, width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const PAGE_HEIGHT = height - top - bottom;
  const progressValue = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<ICarouselInstance>();

  const isLastCard = currentIndex === cards.length - 1;

  return (
    <View style={tw`flex-1 bg-black`}>
      <View style={tw`absolute inset-0`}>
        <WelcomeBackground />
      </View>
      <View style={tw`absolute inset-0 bg-black opacity-85`} />

      {Platform.OS !== "web" ? (
        <OrientationLocker orientation={PORTRAIT} />
      ) : null}

      <SafeAreaView style={{ flex: 1 }}>
        <Carousel
          ref={carouselRef as Ref<ICarouselInstance>}
          loop={false}
          vertical={false}
          height={PAGE_HEIGHT}
          width={width}
          data={cards}
          onSnapToItem={setCurrentIndex}
          renderItem={({ item }) => (
            <View style={tw`flex-1 px-8 items-center justify-end pb-48`}>
              <Text
                style={tw`text-3xl font-inter font-bold text-white text-center`}
              >
                {item.title}
              </Text>
              <Text
                style={tw`text-base font-inter text-neutral-400 text-center mt-4`}
              >
                {item.message}
              </Text>
            </View>
          )}
          onProgressChange={(_, absoluteProgress) =>
            (progressValue.value = absoluteProgress)
          }
        />
      </SafeAreaView>

      <View style={[tw`absolute left-0 right-0`, { bottom: bottom + 120 }]}>
        <Pagination count={cards.length} progressValue={progressValue} />
      </View>

      <AnimatePresence exitBeforeEnter>
        {isLastCard ? (
          <MotiView
            style={[
              tw`absolute left-0 right-0 items-center justify-center`,
              { bottom: bottom + 16 },
            ]}
            key={"start"}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
          >
            <Pressable
              style={tw`py-3 px-6 bg-neutral-800 rounded-full active:opacity-80`}
              onPress={() => {
                navigation.navigate("Main");
                storage.set(HAS_COMPLETED_WELCOME, true);
              }}
            >
              <Text
                style={[
                  tw`text-base font-inter font-bold`,
                  { color: "#6FE7FF" },
                ]}
              >
                Get started
              </Text>
            </Pressable>
          </MotiView>
        ) : (
          <MotiView
            style={[
              tw`absolute left-0 right-0 items-center justify-center`,
              { bottom: bottom + 16 },
            ]}
            key={"next"}
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { type: "timing", duration: 300 } }}
          >
            <Pressable
              style={tw`py-3 px-6 bg-neutral-800 rounded-full active:opacity-80`}
              onPress={() => {
                setCurrentIndex(currentIndex + 1);
                carouselRef.current?.next();
              }}
            >
              <Text style={tw`text-base font-inter font-bold text-white`}>
                Next
              </Text>
            </Pressable>
          </MotiView>
        )}
      </AnimatePresence>
    </View>
  );
};
