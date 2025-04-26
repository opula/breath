import React, { useState } from "react";
import { View, Text } from "react-native";
import { NumberWheelPicker } from "../NumberWheelPicker";
import { HorizontalDial } from "./index";
import tw from "../../utils/tw";

export const HorizontalDialExample = () => {
  const [numberWheelValue, setNumberWheelValue] = useState(5);
  const [horizontalDialValue, setHorizontalDialValue] = useState(5);

  return (
    <View style={tw`flex-1 bg-black p-4 justify-center`}>
      <View style={tw`mb-8`}>
        <Text style={tw`text-white text-xl font-lusitana mb-4 text-center`}>
          Original NumberWheelPicker
        </Text>
        <NumberWheelPicker
          min={1}
          max={10}
          step={1}
          defaultValue={5}
          onChange={setNumberWheelValue}
        />
        <Text style={tw`text-white text-center mt-4`}>
          Selected value: {numberWheelValue}
        </Text>
      </View>

      <View style={tw`mt-8`}>
        <Text style={tw`text-white text-xl font-lusitana mb-4 text-center`}>
          New HorizontalDial
        </Text>
        <HorizontalDial
          min={1}
          max={10}
          step={1}
          defaultValue={5}
          onChange={setHorizontalDialValue}
        />
        <Text style={tw`text-white text-center mt-4`}>
          Selected value: {horizontalDialValue}
        </Text>
      </View>
    </View>
  );
};
