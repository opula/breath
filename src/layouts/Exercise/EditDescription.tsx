import React, { memo, useEffect, useRef, useState } from "react";
import { View, TextInput } from "react-native";
import tw from "../../utils/tw";
import { useAppDispatch } from "../../hooks/store";
import { editExerciseDescription } from "../../state/exercises.reducer";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { exerciseDescriptionByIdSelector } from "../../state/exercises.selectors";

interface Props {
  exerciseId: string;
}

export const EditDescription = memo(({ exerciseId }: Props) => {
  const dispatch = useAppDispatch();
  const exerciseDescription = useParametrizedAppSelector(
    exerciseDescriptionByIdSelector,
    exerciseId,
  );

  const [description, setDescription] = useState(exerciseDescription);
  const descriptionRef = useRef(exerciseDescription);

  useEffect(
    () => () => {
      dispatch(
        editExerciseDescription({
          exerciseId,
          description: descriptionRef.current,
        }),
      );
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
