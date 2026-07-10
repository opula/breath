import React, { Ref, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { HAS_COMPLETED_WELCOME, storage } from "../../utils/storage";
import { WelcomeBackground } from "./Background";
import tw from "../../utils/tw";
import { Overline } from "../../components/Overline";
import { BigTitle } from "../../components/BigTitle";

type Card = {
  kind: string;
  title: string;
  body: string;
};

const cards: Card[] = [
  {
    kind: "About",
    title: "Breathwork,\nyour way.",
    body: "A library of breathing exercises with you in mind. Easy to start and shape until each one matches your exact need.",
  },
  {
    kind: "Atmosphere",
    title: "Set the\nscene.",
    body: "Pair an exercise with a scene and ambient music, or let everything go quiet. The ring at the center moves with your breath either way.",
  },
  {
    kind: "Your turn",
    title: "Pick one,\nbegin.",
    body: "Open the library, choose an exercise, and breathe along with the ring. Close it whenever you're done.",
  },
];

interface Props {
  navigation: NavigationProp<MainStackParams, "Welcome">;
}

export const Welcome = ({ navigation }: Props) => {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const PAGE_HEIGHT = height - insets.top - insets.bottom;
  const progressValue = useSharedValue(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<ICarouselInstance>(undefined);

  const isLastCard = currentIndex === cards.length - 1;

  const handleAdvance = () => {
    if (isLastCard) {
      storage.set(HAS_COMPLETED_WELCOME, true);
      navigation.navigate("Home");
    } else {
      setCurrentIndex(currentIndex + 1);
      carouselRef.current?.next();
    }
  };

  const handleSkip = () => {
    storage.set(HAS_COMPLETED_WELCOME, true);
    navigation.navigate("Home");
  };

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={tw`absolute inset-0`}>
        <WelcomeBackground />
      </View>
      {/* Light scrim: Passage is glow-from-dark, so it only needs a gentle
          knock-back for copy legibility. */}
      <View style={tw`absolute inset-0 bg-mb-bg opacity-40`} />

      {Platform.OS !== "web" ? (
        <OrientationLocker orientation={PORTRAIT} />
      ) : null}

      <View style={[tw`flex-1`, { paddingTop: insets.top }]}>
        <View style={tw`h-8`} />

        <Carousel
          ref={carouselRef as Ref<ICarouselInstance>}
          loop={false}
          vertical={false}
          height={PAGE_HEIGHT - 120}
          width={width}
          data={cards}
          onSnapToItem={setCurrentIndex}
          renderItem={({ item }: { item: Card }) => (
            <View style={tw`flex-1 px-6 pt-6`}>
              <Overline accent>{item.kind}</Overline>
              <View style={tw`flex-1 justify-center`}>
                <BigTitle size={42}>{item.title}</BigTitle>
                <Text
                  style={[
                    tw`font-inter text-base text-mb-mute leading-relaxed mt-6`,
                    { maxWidth: 360 },
                  ]}
                >
                  {item.body}
                </Text>
              </View>
            </View>
          )}
          onProgressChange={(_, absoluteProgress) =>
            (progressValue.value = absoluteProgress)
          }
        />

        {/* Progress segments + CTA */}
        <View style={[tw`px-6`, { paddingBottom: insets.bottom + 12 }]}>
          <View style={tw`flex-row mb-5`}>
            {cards.map((_, i) => (
              <View
                key={i}
                style={[
                  tw.style(
                    "flex-1 h-[2px]",
                    i === 0 ? "" : "ml-2",
                    i <= currentIndex ? "bg-mb-accent" : "bg-mb-line",
                  ),
                ]}
              />
            ))}
          </View>

          <View style={tw`flex-row items-center justify-between py-4`}>
            {!isLastCard ? (
              <Pressable
                onPress={handleSkip}
                hitSlop={12}
                style={({ pressed }) => [tw`py-2`, pressed && tw`opacity-60`]}
              >
                <Text
                  style={[
                    tw`font-mono text-mb-mute uppercase text-[9px]`,
                    { letterSpacing: 3 },
                  ]}
                >
                  skip
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={handleAdvance}
              hitSlop={12}
              style={({ pressed }) => [tw`py-2`, pressed && tw`opacity-70`]}
            >
              <Text
                style={[
                  tw`font-display text-mb-accent uppercase`,
                  { fontSize: 15, letterSpacing: -0.2 },
                ]}
              >
                {isLastCard ? "ENTER" : "NEXT"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};
