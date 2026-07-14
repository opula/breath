import React, { memo, useEffect, useRef, useState } from "react";
import { View, TextInput } from "react-native";
import tw from "../../utils/tw";
import { editExerciseDescription, exerciseDescriptionById } from "../../state/exercises.atom";
import { use$ } from "concordia/react";

interface Props {
  exerciseId: string;
}

export const EditDescription = memo(({ exerciseId }: Props) => {
  const exerciseDescription = use$(exerciseDescriptionById(exerciseId));

  const [description, setDescription] = useState(exerciseDescription);
  const descriptionRef = useRef(exerciseDescription);

  useEffect(
    () => () => {
      editExerciseDescription(exerciseId, descriptionRef.current);
    },
    [],
  );

  return (
    <View>
      <TextInput
        style={tw`text-sm font-inter text-mb-mute leading-snug`}
        value={description}
        onChangeText={(text) => {
          setDescription(text);
          descriptionRef.current = text;
        }}
        placeholder="Add a description..."
        placeholderTextColor="#6E6E74"
        multiline
      />
    </View>
  );
});
