import React from 'react';
import {View, Text, Pressable} from 'react-native';
import tw from '../../utils/tw';
import {NavigationProp, RouteProp} from '@react-navigation/native';
import {MainStackParams} from '../../navigation';
import {TrayScreen} from '../../components/TrayScreen';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Exercise} from '../../types/exercise';
import uuid from 'react-native-uuid';
import {useAppDispatch} from '../../hooks/store';
import {addExerciseStep} from '../../state/exercises.reducer';
import {defer} from 'lodash';

interface Props {
  navigation: NavigationProp<MainStackParams, 'NewStepMenu'>;
  route: RouteProp<MainStackParams, 'NewStepMenu'>;
}

export const NewStepMenu = ({navigation, route}: Props) => {
  const {exerciseId} = route.params;
  const dispatch = useAppDispatch();
  const {bottom} = useSafeAreaInsets();

  const createStep = (type: Exercise['seq'][number]['type']) => {
    const stepId = uuid.v4() as string;
    const step = {
      id: stepId,
      type,
      count: 0,
      ...(type === 'breath' ? {value: [0, 0, 0, 0]} : {}),
    } as Exercise['seq'][number];

    dispatch(addExerciseStep({exerciseId, step}));
    navigation.goBack();

    defer(() => {
      navigation.navigate('AdjustStep', {exerciseId, stepId});
    });
  };

  return (
    <TrayScreen trayHeight={440 + bottom}>
      <View style={tw`pt-6 px-2 mb-6 items-center`}>
        <Text style={tw`text-base font-inter text-white`}>Create new step</Text>
      </View>

      <View style={[tw`flex-1 pb-4`, {marginBottom: bottom}]}>
        <Pressable
          style={tw`h-[54px] rounded-sm border border-blue mb-4 items-center justify-center`}
          onPress={() => createStep('breath')}>
          <Text style={tw`text-xl font-inter text-blue`}>
            Breath cycle
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-[54px] rounded-sm border border-blue mb-4 items-center justify-center`}
          onPress={() => createStep('inhale')}>
          <Text style={tw`text-xl font-inter text-blue`}>
            Inhale
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-[54px] rounded-sm border border-blue mb-4 items-center justify-center`}
          onPress={() => createStep('hold')}>
          <Text style={tw`text-xl font-inter text-blue`}>
            Hold
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-[54px] rounded-sm border border-blue mb-4 items-center justify-center`}
          onPress={() => createStep('exhale')}>
          <Text style={tw`text-xl font-inter text-blue`}>
            Exhale
          </Text>
        </Pressable>
        <Pressable
          style={tw`h-[54px] rounded-sm border border-blue items-center justify-center opacity-50`}
          disabled={true}
          onPress={() => {}}>
          <Text style={tw`text-xl font-inter text-blue`}>
            Message
          </Text>
        </Pressable>
      </View>
    </TrayScreen>
  );
};
