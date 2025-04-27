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
  TouchableOpacity,
} from "react-native";
import {
  OrientationLocker,
  PORTRAIT,
} from "@hortau/react-native-orientation-locker";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";
import {
  Canvas,
  Fill,
  Shader,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import { source } from "./source";
import { AnimatePresence, MotiView } from "moti";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { HAS_COMPLETED_WELCOME, storage } from "../../utils/storage";
import { Pagination } from "./Pagination";
import { useAppDispatch } from "../../hooks/store";
import { engageTutorial } from "../../state/configuration.reducer";
import tw from "../../utils/tw";

const seed = 5000 * Math.random();

const cards = [
  {
    title: "Advance breathwork made easy",
    message:
      "tincidunt vitae semper quis lectus nulla at volutpat diam ut venenatis tellus",
  },
  {
    title: "Many exercises",
    message:
      "tincidunt vitae semper quis lectus nulla at volutpat diam ut venenatis tellus",
  },
  {
    title: "Hypnotic backgrounds",
    message:
      "tincidunt vitae semper quis lectus nulla at volutpat diam ut venenatis tellus",
  },
  {
    title: "Other features",
    message:
      "tincidunt vitae semper quis lectus nulla at volutpat diam ut venenatis tellus",
  },
];

interface Props {
  navigation: NavigationProp<MainStackParams, "Welcome">;
}

export const Welcome = ({ navigation }: Props) => {
  const dispatch = useAppDispatch();
  const { height, width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const PAGE_HEIGHT = height - top - bottom;
  const progressValue = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<ICarouselInstance>();

  const isLastCard = currentIndex === cards.length - 1;

  const clock = useClock();

  const uniforms = useDerivedValue(() => {
    return {
      canvas: vec(width, height),
      iTime: clock.value / 1000 + seed,
    };
  }, [height, width, clock]);

  return (
    <>
      <View style={tw`flex-1 absolute bg-black`}>
        <Canvas style={{ height, width }}>
          <Fill>
            <Shader source={source} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>

      <View style={tw`bg-black opacity-85 absolute inset-0`} />

      {Platform.OS !== "web" ? (
        <OrientationLocker orientation={PORTRAIT} />
      ) : null}

      <View style={tw`flex-1`}>
        <SafeAreaView style={{ flex: 1 }}>
          <Carousel
            ref={carouselRef as Ref<ICarouselInstance>}
            loop={false}
            vertical={false}
            height={PAGE_HEIGHT}
            width={width}
            data={cards}
            onSnapToItem={setCurrentIndex}
            renderItem={({ item, index }) => (
              <View style={tw`flex-1 px-8 items-center justify-center`}>
                <View style={tw`pt-12 mt-12`}>
                  <Text
                    style={tw`text-2xl font-lusitana text-white text-center`}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={tw`text-base font-lusitana text-white text-center mt-4`}
                  >
                    {item.message}
                  </Text>
                </View>
              </View>
            )}
            onProgressChange={(_, absoluteProgress) =>
              (progressValue.value = absoluteProgress)
            }
          />
        </SafeAreaView>
      </View>

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
            <TouchableOpacity
              style={tw`py-3 px-6 bg-neutral-800 rounded-full active:opacity-80`}
              onPress={() => {
                dispatch(engageTutorial());
                navigation.navigate("Main");
                storage.set(HAS_COMPLETED_WELCOME, true);
              }}
            >
              <Text style={tw`text-base font-lusitana font-bold text-white`}>
                Get started
              </Text>
            </TouchableOpacity>
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
            <TouchableOpacity
              style={tw`py-3 px-6 bg-neutral-800 rounded-full active:opacity-80`}
              onPress={() => {
                setCurrentIndex(currentIndex + 1);
                carouselRef.current?.next();
              }}
            >
              <Text style={tw`text-base font-lusitana font-bold text-white`}>
                Next
              </Text>
            </TouchableOpacity>
          </MotiView>
        )}
      </AnimatePresence>
    </>
  );
};
