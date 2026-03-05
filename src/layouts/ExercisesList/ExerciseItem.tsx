import React from "react";
import { NavigationProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { Exercise } from "../../types/exercise";
import { delay, isNumber } from "lodash";
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
      <View style={tw`border-b border-neutral-900`}>
        <Pressable
          style={tw`px-6 py-4`}
          onLongPress={drag}
        >
          <View style={tw`flex-row items-baseline justify-between`}>
            <Text
              style={tw`text-sm font-inter font-medium text-neutral-100 uppercase tracking-widest`}
            >
              {item.name}
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-600 ml-3`}>
              {item.seq.length === 1 ? "1 step" : `${item.seq.length} steps`}
            </Text>
          </View>

          <View style={tw`flex-row items-center mt-2`}>
            <Pressable
              style={tw`active:opacity-50`}
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
              <Text style={tw`text-xs font-inter text-neutral-500`}>
                play
              </Text>
            </Pressable>
            <Text style={tw`text-neutral-700 mx-2`}>{"\u00B7"}</Text>
            <Pressable
              style={tw`active:opacity-50`}
              onPress={() =>
                navigation.navigate("Exercise", { id: item.id })
              }
            >
              <Text style={tw`text-xs font-inter text-neutral-500`}>
                edit
              </Text>
            </Pressable>
            <Text style={tw`text-neutral-700 mx-2`}>{"\u00B7"}</Text>
            <Pressable
              style={tw`active:opacity-50`}
              onPress={() =>
                navigation.navigate("ExerciseInfo", { id: item.id })
              }
            >
              <Text style={tw`text-xs font-inter text-neutral-500`}>
                info
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </View>
    );
  },
);
