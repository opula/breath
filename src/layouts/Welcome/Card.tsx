import React from 'react';
import {View, Text} from 'react-native';
import tw from '../../utils/tw';

interface Props {
  title: string;
  message: string;
}

export const Card = ({title, message}: Props) => {
  return (
    <View style={tw`flex-1 items-center justify-center`}>
      <Text style={tw`text-white font-inter text-center`}>{title}</Text>
      <Text style={tw`text-white font-inter text-center`}>{message}</Text>
    </View>
  );
};
