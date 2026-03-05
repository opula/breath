import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { Icon } from "../../components/Icon";
import tw from "../../utils/tw";
import { useAppDispatch, useAppSelector } from "../../hooks/store";
import {
  isGrayscaleSelector,
  soundsEnabledSelector,
  hapticsEnabledSelector,
} from "../../state/configuration.selectors";
import {
  toggleGrayscale,
  toggleSounds,
  toggleHaptics,
} from "../../state/configuration.reducer";
import { MainStackParams } from "../../navigation";

type IconName = React.ComponentProps<typeof Icon>["name"];

const ToggleRow = ({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  enabled: boolean;
  onPress: () => void;
}) => (
  <Pressable
    style={tw`flex-row items-center py-4 active:opacity-80`}
    onPress={onPress}
  >
    <Icon name={icon} size={20} color={enabled ? "white" : "#737373"} />
    <Text style={tw`text-sm font-inter text-neutral-200 ml-4 flex-1`}>
      {label}
    </Text>
    <View
      style={[
        tw`w-10 h-6 rounded-full justify-center px-0.5`,
        enabled ? tw`bg-white` : tw`bg-neutral-700`,
      ]}
    >
      <View
        style={[
          tw`w-5 h-5 rounded-full`,
          enabled
            ? tw`bg-black self-end`
            : tw`bg-neutral-500 self-start`,
        ]}
      />
    </View>
  </Pressable>
);

export const Settings = () => {
  const navigation = useNavigation<NavigationProp<MainStackParams>>();
  const dispatch = useAppDispatch();

  const isGrayscale = useAppSelector(isGrayscaleSelector);
  const soundsEnabled = useAppSelector(soundsEnabledSelector);
  const hapticsEnabled = useAppSelector(hapticsEnabledSelector);

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
          <Text style={tw`text-sm font-inter font-medium text-neutral-200 uppercase tracking-widest`}>
            Settings
          </Text>
          <View style={tw`h-10 w-10`} />
        </View>

        <ScrollView style={tw`flex-1 px-6 pt-6`}>
          <ToggleRow
            icon="moon"
            label="Grayscale"
            enabled={isGrayscale}
            onPress={() => dispatch(toggleGrayscale())}
          />
          <ToggleRow
            icon="volume-max"
            label="Sounds"
            enabled={soundsEnabled}
            onPress={() => dispatch(toggleSounds())}
          />
          <ToggleRow
            icon="bell-ring"
            label="Haptics"
            enabled={hapticsEnabled}
            onPress={() => dispatch(toggleHaptics())}
          />

          <View style={tw`border-t border-neutral-800 mt-4 pt-4`}>
            <Pressable
              style={tw`flex-row items-center py-4 active:opacity-80`}
              onPress={() => navigation.navigate("Help")}
            >
              <Icon name="help" size={20} color="white" />
              <Text style={tw`text-sm font-inter text-neutral-200 ml-4 flex-1`}>
                Help
              </Text>
              <Icon name="chevron-right" size={16} color="#737373" />
            </Pressable>
          </View>

          <View style={tw`h-8`} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};
