import React, {memo, useEffect, useRef, useState} from 'react';
import {View, TextInput} from 'react-native';
import tw from '../../utils/tw';
import {useAppDispatch} from '../../hooks/store';
import {editExerciseDescription} from '../../state/exercises.reducer';
import {useParametrizedAppSelector} from '../../utils/selectors';
import {exerciseDescriptionByIdSelector} from '../../state/exercises.selectors';

interface Props {
  exerciseId: string;
}

export const EditDescription = memo(({exerciseId}: Props) => {
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
    <View style={tw`border-b border-neutral-800 pb-1`}>
      <TextInput
        style={tw`text-base font-inter text-white py-2`}
        value={description}
        onChangeText={text => {
          setDescription(text);
          descriptionRef.current = text;
        }}
        placeholder="Add a description..."
        placeholderTextColor="#737373"
        multiline
      />
    </View>
  );
});
