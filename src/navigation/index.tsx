import {
  TransitionPresets,
  createStackNavigator,
  CardStyleInterpolators,
  StackNavigationOptions,
} from "@react-navigation/stack";
import { Platform } from "react-native";
import {
  crossFadeInterpolator,
  fadeTransitionSpec,
  smoothModalInterpolator,
} from "./transitions";
import { Main } from "../layouts/Main";
import { Welcome } from "../layouts/Welcome";
import { HAS_COMPLETED_WELCOME, storage } from "../utils/storage";
import { MusicControls } from "../layouts/MusicControls";
import { ExercisesList } from "../layouts/ExercisesList";
import { Exercise } from "../layouts/Exercise";
import { AdjustStep } from "../layouts/AdjustStep";
import { NewStepMenu } from "../layouts/NewStepMenu";
import { ExerciseInfo } from "../layouts/ExerciseInfo";
import { Scenes } from "../layouts/Scenes";
import { Help } from "../layouts/Help";
import { MusicHelp } from "../layouts/MusicHelp";
import { BackgroundAudio } from "../layouts/BackgroundAudio";

export type MainStackParams = {
  Welcome: undefined;
  Main: undefined;
  MusicControls: undefined;
  MusicHelp: undefined;
  Scenes: undefined;
  Help: undefined;
  ExercisesList: undefined;
  Exercise: { id: string };
  ExerciseInfo: { id: string };
  AdjustStep: { exerciseId: string; stepId: string };
  NewStepMenu: { exerciseId: string };
  BackgroundAudio: { id: string };
};

const Stack = createStackNavigator<MainStackParams>();
// const hasCompletedWelcome = false; // storage.getBoolean(HAS_COMPLETED_WELCOME);
const hasCompletedWelcome = storage.getBoolean(HAS_COMPLETED_WELCOME);

// Define cross-platform transition options to ensure smooth transitions on Android
const defaultScreenOptions: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: "transparent" },
  cardOverlayEnabled: true,
  // Use our custom cross-fade interpolator for smoother transitions
  cardStyleInterpolator: crossFadeInterpolator,
  // Use optimized timing configuration
  transitionSpec: fadeTransitionSpec,
  // Prevent Android-specific issues
  detachPreviousScreen: Platform.OS === "android" ? false : true,
};

// Modal transition options
const modalScreenOptions: StackNavigationOptions = {
  ...defaultScreenOptions,
  presentation: "transparentModal",
  // Keep previous screen mounted so it's visible behind the modal
  detachPreviousScreen: false,
  // Use our custom modal interpolator for smoother transitions
  cardStyleInterpolator: smoothModalInterpolator,
  // Ensure modals have proper background
  cardStyle: { backgroundColor: "transparent" },
  // Make sure modals can be dismissed with back gesture on iOS
  gestureEnabled: Platform.OS === "ios",
  gestureResponseDistance: 300,
};

export const MainStack = () => {
  return (
    <Stack.Navigator
      initialRouteName={hasCompletedWelcome ? "Main" : "Welcome"}
      screenOptions={defaultScreenOptions}
    >
      <Stack.Screen name="Welcome" component={Welcome} />
      <Stack.Screen name="Main" component={Main} />
      <Stack.Screen
        name="ExercisesList"
        component={ExercisesList}
        options={{
          // presentation: "transparentModal",
          // detachPreviousScreen: false,

          ...modalScreenOptions,
          gestureEnabled: false,
          // cardStyleInterpolator: smoothModalInterpolator,
          // cardStyle: { backgroundColor: 'black' },
          // gestureEnabled: true,
          // gestureDirection: 'vertical',
          // gestureResponseDistance: 300,
        }}
      />
      <Stack.Screen
        name="Exercise"
        component={Exercise}
        options={{
          ...modalScreenOptions,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="ExerciseInfo"
        component={ExerciseInfo}
        options={modalScreenOptions}
      />
      <Stack.Screen
        name="BackgroundAudio"
        component={BackgroundAudio}
        options={{
          ...modalScreenOptions,
          gestureEnabled: false,
        }}
      />

      <Stack.Group
        screenOptions={{
          ...modalScreenOptions,
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="MusicControls" component={MusicControls} />
        <Stack.Screen name="MusicHelp" component={MusicHelp} />
        <Stack.Screen name="Scenes" component={Scenes} />
        <Stack.Screen name="Help" component={Help} />
        <Stack.Screen name="AdjustStep" component={AdjustStep} />
        <Stack.Screen name="NewStepMenu" component={NewStepMenu} />
      </Stack.Group>
    </Stack.Navigator>
  );
};
