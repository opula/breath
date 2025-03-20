import {TransitionPresets, createStackNavigator} from '@react-navigation/stack';
import {Main} from '../layouts/Main';
import {Welcome} from '../layouts/Welcome';
import {HAS_COMPLETED_WELCOME, storage} from '../utils/storage';
import {MusicControls} from '../layouts/MusicControls';
import {ExercisesList} from '../layouts/ExercisesList';
import {Exercise} from '../layouts/Exercise';
import {AdjustStep} from '../layouts/AdjustStep';
import {NewStepMenu} from '../layouts/NewStepMenu';
import {ExerciseInfo} from '../layouts/ExerciseInfo';

export type MainStackParams = {
  Welcome: undefined;
  Main: undefined;
  MusicControls: undefined;
  ExercisesList: undefined;
  Exercise: {id: string};
  ExerciseInfo: {id: string};
  AdjustStep: {exerciseId: string; stepId: string};
  NewStepMenu: {exerciseId: string};
};

const Stack = createStackNavigator<MainStackParams>();
const hasCompletedWelcome = storage.getBoolean(HAS_COMPLETED_WELCOME);

export const MainStack = () => {
  return (
    <Stack.Navigator
      initialRouteName={hasCompletedWelcome ? 'Main' : 'Welcome'}
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Main" component={Main} />
      <Stack.Screen name="ExercisesList" component={ExercisesList} />
      <Stack.Screen name="Exercise" component={Exercise} />
      <Stack.Screen
        name="ExerciseInfo"
        component={ExerciseInfo}
        options={{
          presentation: 'transparentModal',
          ...TransitionPresets.ModalPresentationIOS,
        }}
      />

      <Stack.Group
        screenOptions={{
          presentation: 'transparentModal',
          gestureEnabled: false,
        }}>
        <Stack.Screen name="MusicControls" component={MusicControls} />
        <Stack.Screen name="AdjustStep" component={AdjustStep} />
        <Stack.Screen name="NewStepMenu" component={NewStepMenu} />
      </Stack.Group>
    </Stack.Navigator>
  );
};
