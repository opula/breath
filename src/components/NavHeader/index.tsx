import React from "react";
import { Pressable, Text, View } from "react-native";
import tw from "../../utils/tw";
import { Icon } from "../Icon";

const slotText = [
  tw`font-mono text-mb-mute uppercase text-[10px]`,
  { letterSpacing: 3 },
];

interface LeftAction {
  label: string;
  onPress: () => void;
  accent?: boolean;
}

interface NavHeaderProps {
  title?: string;
  /** Renders "close ×" in the right slot. */
  onClose?: () => void;
  /** Custom left-slot action (e.g. the editor's "run →"). */
  leftAction?: LeftAction;
}

/** The one top-nav bar: symmetric side slots so the title is always truly
 * centered, and every control gets the same hit target. Every modal surface
 * dismisses with "close ×" — these screens present vertically, so a back
 * arrow would advertise the wrong (horizontal) gesture. */
export const NavHeader = ({ title, onClose, leftAction }: NavHeaderProps) => (
  <View style={tw`flex-row items-center px-6 py-3`}>
    <View style={tw`flex-1 items-start`}>
      {leftAction ? (
        <Pressable
          onPress={leftAction.onPress}
          hitSlop={12}
          style={tw`py-2 active:opacity-60`}
        >
          <Text
            style={[slotText, leftAction.accent && tw`text-mb-accent`]}
          >
            {leftAction.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
    <View style={[{ flex: 1.6 }, tw`items-center`]}>
      {title ? (
        <Text numberOfLines={1} style={[slotText, tw`py-2`]}>
          {title}
        </Text>
      ) : null}
    </View>
    <View style={tw`flex-1 items-end`}>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={tw`flex-row items-center py-2 active:opacity-60`}
        >
          <Text style={slotText}>close</Text>
          <View style={tw`ml-1.5`}>
            <Icon name="close" size={12} color="#6E6E74" />
          </View>
        </Pressable>
      ) : null}
    </View>
  </View>
);
