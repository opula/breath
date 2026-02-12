import React from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Exercise } from "../../types/exercise";
import { Icon } from "../../components/Icon";
import { defer, isNumber } from "lodash";
import { Ops, exerciseEmitter } from "../../components/DynamicExercise/emitter";
import { View, Text, Pressable } from "react-native";
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
        style={tw`border-b border-neutral-800 flex-row items-center pl-4 pr-2 py-4`}
        onLongPress={drag}
      >
        <View style={tw`flex-1`}>
          <Text style={tw`text-sm font-lusitana text-white`}>{item.name}</Text>
          <Text style={tw`text-xs font-lusitana text-neutral-200 mt-2`}>
            {`${item.seq.length} steps`}
          </Text>
        </View>
        <Pressable
          style={tw`h-10 w-10 justify-center items-center mr-1 active:opacity-80`}
          onPress={() => {
            navigation.goBack();

            if (isNumber(index)) {
              defer(() => exerciseEmitter.emit(Ops.GOTO_SEQUENCE, index));
            }
          }}
        >
          <Icon name="play" size={20} color="#a3a3a3" />
          <Text
            style={tw`text-xs font-lusitana text-neutral-300 text-center mt-1`}
          >
            Play
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-10 w-10 justify-center items-center active:opacity-80`}
          onPress={() => navigation.navigate("ExerciseInfo", { id: item.id })}
        >
          <Icon name="help" size={20} color="#a3a3a3" />
          <Text
            style={tw`text-xs font-lusitana text-neutral-300 text-center mt-1`}
          >
            Info
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-10 w-10 justify-center items-center active:opacity-80`}
          onPress={() => navigation.navigate("Exercise", { id: item.id })}
        >
          <Icon name="edit" size={20} color="#a3a3a3" />
          <Text
            style={tw`text-xs font-lusitana text-neutral-300 text-center mt-1`}
          >
            Edit
          </Text>
        </Pressable>
      </Pressable>
    );
  },
);
