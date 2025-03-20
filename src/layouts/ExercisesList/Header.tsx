import React from 'react';
import {NavigationProp} from '@react-navigation/native';
import {MainStackParams} from '../../navigation';
import {Icon} from '../../components/Icon';
import uuid from 'react-native-uuid';
import {useAppDispatch} from '../../hooks/store';
import {addExercise} from '../../state/exercises.reducer';
import {defer} from 'lodash';
import {View, Text, TouchableOpacity} from 'react-native';
import tw from '../../utils/tw';

interface Props {
  navigation: NavigationProp<MainStackParams, 'ExercisesList'>;
}

export const Header = ({navigation}: Props) => {
  const dispatch = useAppDispatch();

  return (
    <View
      style={tw`flex-row px-4 justify-between items-center`}>
      <TouchableOpacity
        style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={() => navigation.goBack()}>
        <Icon name="left-arrow" size={20} color="white" />
      </TouchableOpacity>
      <Text style={tw`text-base font-lusitana text-white`}>Your Exercises</Text>
      <TouchableOpacity
        style={tw`h-10 w-10 items-center justify-center active:opacity-80`}
        onPress={() => {
          const exerciseId = uuid.v4() as string;
          dispatch(
            addExercise({
              exerciseId,
            }),
          );

          defer(() => navigation.navigate('Exercise', {id: exerciseId}));
        }}>
        <Icon name="plus" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );
};
