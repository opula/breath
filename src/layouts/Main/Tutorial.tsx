import React, { useCallback } from "react";
import Carousel from "react-native-reanimated-carousel";
import {
  useWindowDimensions,
  View,
  Text,
  Pressable,
  Platform,
} from "react-native";
import { range } from "lodash";
import { Icon, IconName } from "../../components/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pagination } from "../../components/Pagination";
import { useSharedValue } from "react-native-reanimated";
import { HAS_COMPLETED_WELCOME, storage } from "../../utils/storage";
import { MotiView } from "moti";
import tw from "../../utils/tw";

const SLIDES = [
  {
    id: "intro",
  },
  {
    id: "start",
    icon: "single-tap",
    title: "Single Tap",
    message:
      "To start an exercise or progress to the next step in the exercise",
  },
  {
    id: "pause",
    icon: "double-tap",
    title: "Double Tap",
    message: "To pause an exercise",
  },
  {
    id: "reset",
    icon: "tap-hold",
    title: "Tap & Hold",
    message: "To reset an exercise",
  },
  {
    id: "exercise",
    icon: "swipe-up-down",
    title: "Swipe Up or Down",
    message: "To change exercises",
  },
  {
    id: "background",
    icon: "swipe-left-right",
    title: "Swipe Left or Right",
    message: "To change backgrounds",
  },
  {
    id: "other",
  },
];

interface Props {
  onClose: () => void;
}

export const Tutorial = ({ onClose }: Props) => {
  const { height, width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const progressValue = useSharedValue(0);

  const osTop = top + (Platform.OS === "android" ? 16 : 0);

  const handleClose = useCallback(() => {
    onClose();
    storage.set(HAS_COMPLETED_WELCOME, true);
  }, [onClose]);

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ opacity: { type: "timing", duration: 300 } }}
      style={tw`absolute inset-0`}
    >
      <Carousel
        loop={false}
        height={height}
        width={width}
        data={SLIDES}
        onProgressChange={(_, absoluteProgress) =>
          (progressValue.value = absoluteProgress)
        }
        renderItem={({ item }) =>
          item.id === "intro" ? (
            <View style={tw`flex-1 justify-center px-6`}>
              <Text style={tw`text-lg font-inter text-white`}>
                Midnight Satori is the breath work app that empowers you to
                create highly personalized and sophisticated breathing
                exercises. With our intuitive interface, you can fine-tune every
                aspect of your practice, from inhale and exhale durations to
                hold times and ratios. Whether you're a beginner or an
                experienced practitioner, Midnight Satori gives you the tools to
                craft elaborate and precise breath work routines tailored to
                your unique needs. Unlock your full potential and elevate your
                well-being with Midnight Satori – the app that puts the power of
                breath work in your hands.
              </Text>
              {/* <Text style={tw`text-base font-inter text-white`}>
                Welcome to Midnight Satori, the ultimate breath work app
                designed for those seeking to create highly customized and
                sophisticated breathing exercises. Our app is dedicated to
                empowering users to explore the intricacies of breath work and
                craft personalized routines that suit their unique needs and
                goals.
              </Text> */}
              {/* <Text style={tw`text-base font-inter text-white mt-4`}>
                With Midnight Satori, you have the freedom to fine-tune every
                aspect of your breath work practice. Our intuitive interface
                allows you to manipulate variables such as inhale and exhale
                durations, hold times, ratios, and even the number of cycles in
                each session. Whether you're a beginner looking to master the
                foundations or an experienced practitioner aiming to push the
                boundaries of your practice, Midnight Satori provides you with
                the tools to build elaborate and precise breath work exercises.
              </Text> */}
              {/* <Text style={tw`text-base font-inter text-white mt-4`}>
                Dive into a world of endless possibilities as you create, save,
                and share your custom breathing patterns. Elevate your
                well-being, enhance your focus, and unlock your full potential
                with Midnight Satori – the app that puts the power of breath
                work at your fingertips.
              </Text> */}
            </View>
          ) : item.id === "other" ? (
            <View style={tw`flex-1 justify-center items-center`}>
              <Text
                style={tw`text-2xl font-inter font-bold text-white text-center mb-12`}
              >
                Other actions
              </Text>

              <View style={tw`flex-row`}>
                <View style={tw`flex-1 justify-center items-center`}>
                  <Icon name="unordered-list" color="white" size={28} />
                  <Text style={tw`text-base font-inter text-white mt-2`}>
                    View & edit exercises
                  </Text>
                </View>
                <View style={tw`flex-1 justify-center items-center`}>
                  <Icon name="headphones" color="white" size={28} />
                  <Text style={tw`text-base font-inter text-white mt-2`}>
                    In-app music
                  </Text>
                </View>
              </View>
              <View style={tw`flex-row mt-12`}>
                <View style={tw`flex-1 justify-center items-center`}>
                  <Icon name="moon" color="white" size={28} />
                  <Text style={tw`text-base font-inter text-white mt-2`}>
                    Toggle grayscale
                  </Text>
                </View>
                <View style={tw`flex-1 justify-center items-center`}>
                  <Icon name="help" color="white" size={28} />
                  <Text style={tw`text-base font-inter text-white mt-2`}>
                    See tutorial
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={tw`flex-1 justify-center items-center`}>
              <View
                style={[
                  tw`absolute left-0 right-0 justify-center items-center`,
                  { top: 0, bottom: 360 },
                ]}
              >
                <Text
                  style={tw`text-2xl font-inter font-bold text-white text-center mb-8`}
                >
                  {item.title}
                </Text>
              </View>

              <Icon
                name={item.icon as IconName}
                color="rgba(255,255,255,.6)"
                size={120}
              />
              <View
                style={[
                  tw`absolute left-0 right-0 justify-center items-center px-12`,
                  { top: 360, bottom: 0 },
                ]}
              >
                <Text
                  style={tw`text-lg font-inter text-white text-center mt-8`}
                >
                  {item.message}
                </Text>
              </View>
            </View>
          )
        }
      />

      <View style={[tw`absolute right-2 left-2 h-10`, { bottom: bottom }]}>
        <Pagination count={SLIDES.length} progressValue={progressValue} />
      </View>

      <Pressable
        style={[
          tw`absolute right-2 h-10 w-10 items-center justify-center active:opacity-80`,
          { top: osTop },
        ]}
        onPress={handleClose}
      >
        <Icon name="close" color="white" size={24} />
      </Pressable>
    </MotiView>
  );
};
