import React from 'react';
import {Text, View} from 'react-native';
import tw from '../utils/tw';

export interface BigTitleProps {
  children: React.ReactNode;
  size?: number;
  accent?: boolean;
}

export const BigTitle = ({
  children,
  size = 44,
  accent = false,
}: BigTitleProps) => {
  const squareSize = size * 0.18;

  return (
    <View style={tw`flex-row items-end`}>
      <Text
        style={[
          tw`font-display uppercase text-mb-fg`,
          {
            fontSize: size,
            letterSpacing: -size * 0.04,
            lineHeight: size * 0.85,
          },
        ]}>
        {children}
      </Text>
      {accent && (
        <View
          style={[
            tw`bg-mb-accent`,
            {
              width: squareSize,
              height: squareSize,
              marginLeft: 2,
            },
          ]}
        />
      )}
    </View>
  );
};
