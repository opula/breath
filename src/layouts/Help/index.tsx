import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";

const GESTURES = [
  { gesture: "Tap", action: "Start or advance to next step" },
  { gesture: "Double tap", action: "Pause or resume" },
  { gesture: "Long press", action: "Reset exercise" },
  { gesture: "Swipe up / down", action: "Change exercise" },
];

const SIDEBAR_ACTIONS = [
  { icon: "Grayscale", action: "Toggle color / grayscale mode" },
  { icon: "Sound", action: "Toggle exercise sounds" },
  { icon: "Vibrations", action: "Toggle haptic feedback" },
  { icon: "Exercises", action: "View and edit exercises" },
  { icon: "Music", action: "In-app music player" },
  { icon: "Scenes", action: "Change background scene" },
];

export const Help = () => {
  const navigation = useNavigation();

  return (
    <View style={tw`flex-1 bg-black bg-opacity-50`}>
      <SafeAreaView style={tw`flex-1`}>
        <View
          style={tw`flex-row px-4 pb-2 justify-between items-center border-b border-neutral-800`}
        >
          <Pressable
            style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
            onPress={() => navigation.goBack()}
          >
            <Icon name="close" size={20} color="white" />
          </Pressable>
          <Text style={tw`text-sm font-inter font-medium text-neutral-200`}>
            Help
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <ScrollView style={tw`flex-1 px-6 pt-6`}>
          <Text style={tw`text-base font-inter text-neutral-400 mb-8`}>
            Control your breathing exercises with simple gestures. Pause at any
            time to access additional options from the sidebar.
          </Text>

          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mb-4`}
          >
            Gestures
          </Text>
          {GESTURES.map((item) => (
            <View key={item.gesture} style={tw`flex-row py-3`}>
              <Text style={tw`text-sm font-inter text-neutral-200 w-36`}>
                {item.gesture}
              </Text>
              <Text style={tw`text-sm font-inter text-neutral-400 flex-1`}>
                {item.action}
              </Text>
            </View>
          ))}

          <Text
            style={tw`text-sm font-inter font-medium text-neutral-200 mt-8 mb-4`}
          >
            While Paused
          </Text>
          {SIDEBAR_ACTIONS.map((item) => (
            <View key={item.icon} style={tw`flex-row py-3`}>
              <Text style={tw`text-sm font-inter text-neutral-200 w-36`}>
                {item.icon}
              </Text>
              <Text style={tw`text-sm font-inter text-neutral-400 flex-1`}>
                {item.action}
              </Text>
            </View>
          ))}

          <View style={tw`h-8`} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};
