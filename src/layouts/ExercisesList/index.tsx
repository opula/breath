import React, {useCallback, useRef} from 'react';
import {Icon} from '../../components/Icon';
import {NavigationProp} from '@react-navigation/native';
import {MainStackParams} from '../../navigation';
import {useAppDispatch, useAppSelector} from '../../hooks/store';
import {exercisesSelector} from '../../state/exercises.selectors';
import {FlatList, LayoutAnimation, Pressable, View, Text, TouchableOpacity} from 'react-native';
import tw from '../../utils/tw';
import {
  updateExercises,
  resetExercises,
  addExercise,
} from '../../state/exercises.reducer';
import DraggableFlatList, {
  OpacityDecorator,
  RenderItemParams,
  ScaleDecorator,
  ShadowDecorator,
} from 'react-native-draggable-flatlist';
import SwipeableItem, {OpenDirection} from 'react-native-swipeable-item';
import {Exercise} from '../../types/exercise';
import {SwipeRightRemove} from '../../components/UnderlyingSwipe';
import uuid from 'react-native-uuid';
import {defer} from 'lodash';
import {ExerciseItem} from './ExerciseItem';
import {Header} from './Header';

const OVERSWIPE_DIST = 20;
const SNAP_LEFT = [120];

interface Props {
  navigation: NavigationProp<MainStackParams, 'ExercisesList'>;
}

export const ExercisesList = ({navigation}: Props) => {
  const exercises = useAppSelector(exercisesSelector);
  const dispatch = useAppDispatch();
  const itemRefs = useRef(new Map());

  const renderItem = useCallback(
    (params: RenderItemParams<Exercise>) => {
      const {item, getIndex, drag} = params;
      const index = getIndex();

      const onPressDelete = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const updatedExercises = exercises.filter(item => item !== params.item);

        dispatch(updateExercises({exercises: updatedExercises}));
      };

      return (
        <ShadowDecorator>
          <ScaleDecorator>
            <OpacityDecorator>
              <SwipeableItem
                key={item.id}
                item={item}
                ref={ref => {
                  if (ref && !itemRefs.current.get(item.id)) {
                    itemRefs.current.set(item.id, ref);
                  }
                }}
                onChange={({openDirection}) => {
                  if (openDirection !== OpenDirection.NONE) {
                    [...itemRefs.current.entries()].forEach(([key, ref]) => {
                      if (key !== item.id && ref) ref.close();
                    });
                  }
                }}
                overSwipe={OVERSWIPE_DIST}
                renderUnderlayLeft={() => (
                  <SwipeRightRemove onPressDelete={onPressDelete} drag={drag} />
                )}
                snapPointsLeft={SNAP_LEFT}>
                <ExerciseItem {...{item, index, drag, navigation}} />
              </SwipeableItem>
            </OpacityDecorator>
          </ScaleDecorator>
        </ShadowDecorator>
      );
    },
    [exercises],
  );

  return (
    <View style={tw`flex-1 bg-black`}>
      <View style={tw`px-4 py-4`}>
        <Header navigation={navigation} />

        <DraggableFlatList
          data={exercises}
          renderItem={renderItem}
          onDragEnd={data => {
            dispatch(updateExercises({exercises: data.data}));
          }}
          keyExtractor={(item, index) => item.id}
          activationDistance={20}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={() => (
            <View style={tw`py-4 mb-8`}>
              <TouchableOpacity
                style={tw`items-center justify-center active:opacity-80`}
                onPress={() => dispatch(resetExercises())}>
                <Text style={tw`text-base font-lusitana text-red-500`}>
                  Reset exercises
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
};
