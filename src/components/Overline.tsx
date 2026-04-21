import React from 'react';
import {Text, View} from 'react-native';
import tw from '../utils/tw';

export interface OverlineProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  accent?: boolean;
}

export const Overline = ({children, right, accent = false}: OverlineProps) => {
  return (
    <View
      style={tw`flex-row items-center justify-between py-3 border-b border-mb-line`}>
      <View style={tw`flex-row items-center gap-2`}>
        <View
          style={tw.style(
            `w-[5px] h-[5px] rounded-full`,
            accent ? `bg-mb-accent` : `bg-mb-mute`,
          )}
        />
        <Text
          style={[
            tw`font-mono text-[10px] uppercase text-mb-mute`,
            {letterSpacing: 2.5},
          ]}>
          {children}
        </Text>
      </View>
      {right !== undefined && right !== null ? (
        <Text
          style={[
            tw`font-mono text-[10px] uppercase text-mb-mute`,
            {letterSpacing: 2.5},
          ]}>
          {right}
        </Text>
      ) : null}
    </View>
  );
};
