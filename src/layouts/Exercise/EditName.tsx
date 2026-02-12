import React, {memo, useEffect, useRef, useState} from 'react';
import {View, TextInput} from 'react-native';
import tw from '../../utils/tw';
import {useDebouncedCallback} from 'use-debounce';
import {useAppDispatch} from '../../hooks/store';
import {editExerciseName} from '../../state/exercises.reducer';
import {useParametrizedAppSelector} from '../../utils/selectors';
import {exerciseNameByIdSelector} from '../../state/exercises.selectors';

interface Props {
  exerciseId: string;
}

export const EditName = memo(({exerciseId}: Props) => {
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
    <View style={tw`border-b border-neutral-800 pb-1`}>
      <TextInput
        style={tw`text-base font-inter text-white p-2`}
        value={name}
        onChangeText={name => {
          setName(name);
          nameRef.current = name;
        }}
        placeholderTextColor="#737373"
      />
    </View>
  );
});
