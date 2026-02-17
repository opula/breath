import React from "react";
import { Exercise } from "../../types/exercise";
import { Text, Pressable, View } from "react-native";
import tw from "../../utils/tw";
import { capitalize, sum } from "lodash";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { MainStackParams } from "../../navigation";
import Decimal from "decimal.js";
import { convertSecondsToHHMM } from "../../utils/pretty";

interface Props {
  exerciseId: string;
  step: Exercise["seq"][number];
  drag: () => void;
}

export const StepCard = ({ exerciseId, step, drag }: Props) => {
  const navigation =
    useNavigation<NavigationProp<MainStackParams, "Exercise">>();
  const { id, type, value, count, text } = step;
  const prettyTime =
    type === "breath" && convertSecondsToHHMM(count * sum(value as number[]));

  return (
    <Pressable
      style={tw`bg-black px-2`}
      onLongPress={drag}
      onPress={() => {
        if (type === "text") return;

        navigation.navigate("AdjustStep", { exerciseId, stepId: id });
      }}
    >
      <View style={tw`border-b border-neutral-800 py-4`}>
        <Text style={tw`text-base font-inter text-white`}>
          {capitalize(type)}
        </Text>
        {type === "breath" && prettyTime ? (
          <>
            <Text style={tw`text-xs font-inter text-neutral-300 mt-2`}>
              {(value as number[]).map((secs) => `${secs}s`).join(" · ")}
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-300 mt-2`}>
              {count
                ? `Do ${count} repetitions for a total of ${prettyTime.minutes} min, ${prettyTime.seconds} sec.`
                : "At your discretion."}
            </Text>
          </>
        ) : null}
        {type === "exhale" || type === "hold" || type === "inhale" ? (
          <Text style={tw`text-xs font-inter text-neutral-300 mt-2`}>
            {count ? `For a count of ${count} seconds.` : "At your discretion."}
          </Text>
        ) : null}

        {type === "text" ? (
          <>
            <Text style={tw`text-xs font-inter text-neutral-300 mt-2`}>
              {`"${text}"`}
            </Text>
            <Text style={tw`text-xs font-inter text-neutral-300 mt-2`}>
              {count ? `For ${count} seconds.` : "For as long as you need."}
            </Text>
          </>
        ) : null}
      </View>
    </Pressable>
  );
};
