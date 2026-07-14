import React, { memo, useEffect, useRef, useState } from "react";
import { View, TextInput } from "react-native";
import tw from "../../utils/tw";
import { editExerciseName, exerciseNameById } from "../../state/exercises.atom";
import { use$ } from "concordia/react";

interface Props {
  exerciseId: string;
}

export const EditName = memo(({ exerciseId }: Props) => {
  const exerciseName = use$(exerciseNameById(exerciseId));

  const [name, setName] = useState(exerciseName);
  const nameRef = useRef(exerciseName);

  useEffect(
    () => () => {
      editExerciseName(exerciseId, nameRef.current);
    },
    [],
  );

  return (
    <View style={tw`border-b border-mb-line pb-2`}>
      <TextInput
        style={[
          tw`font-display text-mb-fg py-2`,
          { fontSize: 40, letterSpacing: -1.5, lineHeight: 44 },
        ]}
        value={name}
        onChangeText={(name) => {
          setName(name);
          nameRef.current = name;
        }}
        placeholderTextColor="#6E6E74"
      />
    </View>
  );
});
