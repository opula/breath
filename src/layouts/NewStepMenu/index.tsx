import React from "react";
import { View, Text, Pressable } from "react-native";
import tw from "../../utils/tw";
import { NavigationProp, RouteProp } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import { TrayScreen } from "../../components/TrayScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Exercise } from "../../types/exercise";
import uuid from "react-native-uuid";
import { useAppDispatch } from "../../hooks/store";
import { addExerciseStep } from "../../state/exercises.reducer";
import { defer } from "lodash";

interface Props {
  navigation: NavigationProp<MainStackParams, "NewStepMenu">;
  route: RouteProp<MainStackParams, "NewStepMenu">;
}

export const NewStepMenu = ({ navigation, route }: Props) => {
  const { exerciseId } = route.params;
  const dispatch = useAppDispatch();
  const { bottom } = useSafeAreaInsets();

  const createStep = (type: Exercise["seq"][number]["type"]) => {
    const stepId = uuid.v4() as string;
    const step = {
      id: stepId,
      type,
      count: 0,
      ...(type === "breath" ? { value: [0, 0, 0, 0] } : {}),
      ...(type === "double-inhale" ? { value: [1.5, 0.3, 1.5] } : {}),
      ...(type === "text" ? { text: "" } : {}),
      ...(type === "repeat" ? { value: [1], count: 1 } : {}),
    } as Exercise["seq"][number];

    dispatch(addExerciseStep({ exerciseId, step }));
    navigation.goBack();

    defer(() => {
      navigation.navigate("AdjustStep", { exerciseId, stepId });
    });
  };

  return (
    <TrayScreen trayHeight={532 + bottom}>
      <View style={tw`pt-6 px-2 mb-6 items-center`}>
        <Text style={tw`text-base font-inter text-white`}>Create new step</Text>
      </View>

      <View style={[tw`flex-1`, { marginBottom: bottom }]}>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("breath")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>
            Breath cycle
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("inhale")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>Inhale</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("hold")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>Hold</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("exhale")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>Exhale</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("double-inhale")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>
            Double Inhale
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("text")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>Message</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) =>
            tw.style(
              "px-6 py-4 border-b border-neutral-800",
              pressed && "opacity-80",
            )
          }
          onPress={() => createStep("repeat")}
        >
          <Text style={tw`text-lg font-inter text-neutral-200`}>Repeat</Text>
        </Pressable>
      </View>
    </TrayScreen>
  );
};
