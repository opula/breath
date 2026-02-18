import React from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Icon } from "../../components/Icon";
import uuid from "react-native-uuid";
import { useAppDispatch } from "../../hooks/store";
import { addExercise } from "../../state/exercises.reducer";
import { defer } from "lodash";
import { View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";

interface Props {
  navigation: NavigationProp<MainStackParams, "ExercisesList">;
}

export const Header = ({ navigation }: Props) => {
  const dispatch = useAppDispatch();

  return (
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
        Exercises
      </Text>
      <Pressable
        style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={() => {
          const exerciseId = uuid.v4() as string;
          dispatch(
            addExercise({
              exerciseId,
            }),
          );

          defer(() => navigation.navigate("Exercise", { id: exerciseId }));
        }}
      >
        <Icon name="plus-stack" size={20} color="#6FE7FF" />
      </Pressable>
    </View>
  );
};
