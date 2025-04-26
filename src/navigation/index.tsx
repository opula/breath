import {
  TransitionPresets,
  createStackNavigator,
  CardStyleInterpolators,
  StackNavigationOptions,
} from '@react-navigation/stack';
import { Platform } from 'react-native';
import {
  crossFadeInterpolator,
  fadeTransitionSpec,
  smoothModalInterpolator,
} from './transitions';
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

// Define cross-platform transition options to ensure smooth transitions on Android
const defaultScreenOptions: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: 'transparent' },
  cardOverlayEnabled: true,
  // Use our custom cross-fade interpolator for smoother transitions
  cardStyleInterpolator: crossFadeInterpolator,
  // Use optimized timing configuration
  transitionSpec: fadeTransitionSpec,
  // Prevent Android-specific issues
  detachPreviousScreen: Platform.OS === 'android' ? false : true,
};

// Modal transition options
const modalScreenOptions: StackNavigationOptions = {
  ...defaultScreenOptions,
  presentation: 'transparentModal',
  // Use our custom modal interpolator for smoother transitions
  cardStyleInterpolator: smoothModalInterpolator,
  // Ensure modals have proper background
  cardStyle: { backgroundColor: 'transparent' },
  // Make sure modals can be dismissed with back gesture on iOS
  gestureEnabled: Platform.OS === 'ios',
  gestureResponseDistance: 300,
};

export const MainStack = () => {
  return (
    <Stack.Navigator
      initialRouteName={hasCompletedWelcome ? 'Main' : 'Welcome'}
      screenOptions={defaultScreenOptions}>
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Main" component={Main} />
      <Stack.Screen name="ExercisesList" component={ExercisesList} />
      <Stack.Screen name="Exercise" component={Exercise} />
      <Stack.Screen
        name="ExerciseInfo"
        component={ExerciseInfo}
        options={modalScreenOptions}
      />

      <Stack.Group
        screenOptions={{
          ...modalScreenOptions,
          gestureEnabled: false,
        }}>
        <Stack.Screen name="MusicControls" component={MusicControls} />
        <Stack.Screen name="AdjustStep" component={AdjustStep} />
        <Stack.Screen name="NewStepMenu" component={NewStepMenu} />
      </Stack.Group>
    </Stack.Navigator>
  );
};
