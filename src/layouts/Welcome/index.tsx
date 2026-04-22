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
    kind: "What this is",
    title: "Breathing,\nnot breathwork.",
    body: "Fifteen exercises. No feeds, no streak-shaming. One tap to start, one tap to stop. Everything else is dials.",
  },
  {
    kind: "How it guides you",
    title: "A ring that\nbreathes\nwith you.",
    body: "The inner disc grows on inhale and shrinks on exhale. The accent arc counts down the current phase. Numbers for precision, not for gamification.",
  },
  {
    kind: "Safety",
    title: "Sit, or\nlie down.",
    body: "Some of these exercises can make you dizzy. Never practice in water or while driving. If a session feels wrong, stop. You are never behind.",
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

  return (
    <View style={tw`flex-1 bg-mb-bg`}>
      <View style={tw`absolute inset-0`}>
        <WelcomeBackground />
      </View>
      <View style={tw`absolute inset-0 bg-mb-bg opacity-80`} />

      {Platform.OS !== "web" ? (
        <OrientationLocker orientation={PORTRAIT} />
      ) : null}

      <View
        style={[tw`flex-1`, { paddingTop: insets.top }]}
      >
        {/* Top nav: index indicator + skip */}
        <View
          style={tw`flex-row items-center justify-between px-6 py-3`}
        >
          <Text
            style={[
              tw`font-mono text-mb-mute uppercase text-[10px]`,
              { letterSpacing: 3 },
            ]}
          >
            intro {String(currentIndex + 1).padStart(2, "0")}
            <Text style={tw`text-mb-dim`}> / {cards.length}</Text>
          </Text>
          {!isLastCard ? (
            <Pressable
              onPress={() => {
                storage.set(HAS_COMPLETED_WELCOME, true);
                navigation.navigate("Home");
              }}
              style={tw`py-2 active:opacity-60`}
            >
              <Text
                style={[
                  tw`font-mono text-mb-mute uppercase text-[10px]`,
                  { letterSpacing: 3 },
                ]}
              >
                skip
              </Text>
            </Pressable>
          ) : (
            <View style={tw`w-10`} />
          )}
        </View>

        <Carousel
          ref={carouselRef as Ref<ICarouselInstance>}
          loop={false}
          vertical={false}
          height={PAGE_HEIGHT - 120}
          width={width}
          data={cards}
          onSnapToItem={setCurrentIndex}
          renderItem={({ item, index }: { item: Card; index: number }) => (
            <View style={tw`flex-1 px-6 pt-6`}>
              <Overline
                accent
                right={String(index + 1).padStart(2, "0")}
              >
                {item.kind}
              </Overline>
              <View style={tw`mt-10`}>
                <BigTitle size={42}>{item.title}</BigTitle>
              </View>
              <Text
                style={[
                  tw`font-inter text-base text-mb-mute leading-relaxed mt-7`,
                  { maxWidth: 360 },
                ]}
              >
                {item.body}
              </Text>
            </View>
          )}
          onProgressChange={(_, absoluteProgress) =>
            (progressValue.value = absoluteProgress)
          }
        />

        {/* Progress segments + CTA */}
        <View
          style={[tw`px-6`, { paddingBottom: insets.bottom + 12 }]}
        >
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

          <Pressable
            onPress={handleAdvance}
            style={({ pressed }) => [
              tw`flex-row items-center justify-between py-5 border-t border-b border-mb-line`,
              pressed && tw`opacity-70`,
            ]}
          >
            <Text
              style={[
                tw`font-mono text-mb-mute uppercase text-[10px]`,
                { letterSpacing: 3 },
              ]}
            >
              {isLastCard ? "begin" : "continue"}
            </Text>
            <Text
              style={[
                tw`font-display text-mb-accent uppercase`,
                { fontSize: 22, letterSpacing: -0.5 },
              ]}
            >
              {isLastCard ? "ENTER ↵" : "NEXT →"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};
