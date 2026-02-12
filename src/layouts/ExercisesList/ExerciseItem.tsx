import React from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Exercise } from "../../types/exercise";
import { Icon } from "../../components/Icon";
import { defer, delay, isNumber } from "lodash";
import { Ops, exerciseEmitter } from "../../components/DynamicExercise/emitter";
import { View, Text, Pressable, InteractionManager } from "react-native";
import tw from "../../utils/tw";

interface Props {
  item: Exercise;
  index: number | undefined;
  drag: () => void;
  navigation: NavigationProp<MainStackParams, "ExercisesList">;
}

export const ExerciseItem = React.memo(
  ({ item, index, drag, navigation }: Props) => {
    return (
      <Pressable
        style={tw`border-b border-neutral-900 flex-row items-center pl-6  pr-4 py-4`}
        onLongPress={drag}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`text-sm font-inter font-medium text-white`}>
            {item.name}
          </Text>
          <Text style={tw`text-xs font-inter text-neutral-400 mt-1`}>
            {`${item.seq.length} steps`}
          </Text>
        </View>
        <View style={tw`flex-row gap-x-1`}>
          <Pressable
            style={tw`h-10 w-10 justify-center items-center`}
            onPress={() => navigation.navigate("ExerciseInfo", { id: item.id })}
          >
            <Icon name="help" size={20} color="#a3a3a3" />
            {/* <Text
            style={tw`text-xs font-inter text-neutral-400 text-center mt-1`}
          >
            Info
          </Text> */}
          </Pressable>
          <Pressable
            style={tw`h-10 w-10 justify-center items-center`}
            onPress={() => {
              navigation.goBack();

              if (isNumber(index)) {
                InteractionManager.runAfterInteractions(() => {
                  delay(
                    () => exerciseEmitter.emit(Ops.GOTO_SEQUENCE, index),
                    1000,
                  );
                });
              }
            }}
          >
            <Icon name="play" size={20} color="#a3a3a3" />
            {/* <Text
            style={tw`text-xs font-inter text-neutral-400 text-center mt-1`}
          >
            Play
          </Text> */}
          </Pressable>

          <Pressable
            style={tw`h-10 w-10 justify-center items-center`}
            onPress={() => navigation.navigate("Exercise", { id: item.id })}
          >
            <Icon name="edit" size={20} color="#a3a3a3" />
            {/* <Text
            style={tw`text-xs font-inter text-neutral-400 text-center mt-1`}
          >
            Edit
          </Text> */}
          </Pressable>
        </View>
      </Pressable>
    );
  },
);
