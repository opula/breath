import React from 'react';
import {View} from 'react-native';
import svgs from './svgs';
import tw from '../../utils/tw';

export interface IconProps {
  name: keyof typeof svgs;
  size: number;
  color: string;
}

export const Icon = ({name, size, color}: IconProps) => {
  return (
    <View
      style={[
        tw`rounded-3xl`,
        {
          height: size,
          width: size,
          backgroundColor: color
        }
      ]}
    />
  );
};
