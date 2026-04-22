import React, { memo, useEffect, useRef, useState } from "react";
import { View, TextInput } from "react-native";
import tw from "../../utils/tw";
import { useAppDispatch } from "../../hooks/store";
import { editExerciseName } from "../../state/exercises.reducer";
import { useParametrizedAppSelector } from "../../utils/selectors";
import { exerciseNameByIdSelector } from "../../state/exercises.selectors";

interface Props {
  exerciseId: string;
}

export const EditName = memo(({ exerciseId }: Props) => {
  const dispatch = useAppDispatch();
  const exerciseName = useParametrizedAppSelector(
    exerciseNameByIdSelector,
    exerciseId,
  );

  const [name, setName] = useState(exerciseName);
  const nameRef = useRef(exerciseName);

  useEffect(
    () => () => {
      dispatch(
        editExerciseName({
          exerciseId,
          name: nameRef.current,
        }),
      );
    },
    [],
  );

  return (
    <View style={tw`border-b border-mb-line pb-2`}>
      <TextInput
        style={[
          tw`font-display text-mb-fg uppercase py-2`,
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
