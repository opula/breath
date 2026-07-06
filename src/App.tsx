/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from "react";
import { LogBox, StatusBar, View } from "react-native";
import { useFonts } from "expo-font";

LogBox.ignoreLogs([
  "SafeAreaView has been deprecated",
  "RecordingNotificationManager is not implemented",
]);
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Theme is now handled by twrnc
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MainStack } from "./navigation";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import tw from "./utils/tw";
import { persistor, store } from "./store";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import * as SplashScreen from "expo-splash-screen";
import { AudioPlayerProvider } from "./context/AudioPlayerContext";
import { delay } from "lodash";

const SPLASH_BACKGROUND = "#101010";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();
// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

// Create a custom dark theme to prevent white flashing during navigation
const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: SPLASH_BACKGROUND,
    card: SPLASH_BACKGROUND,
    text: "white",
    border: "transparent",
    primary: "blue",
    notification: "blue",
  },
};

const Main = () => {
  const [appIsReady, setIsReady] = useState(false);

  // Load Rubik + JetBrains Mono at runtime so the mapping between tw class
  // names (font-display, font-mono) and the iOS-registered family is
  // explicit and independent of each TTF's internal PostScript name.
  const [fontsLoaded] = useFonts({
    Rubik: require("../assets/fonts/Rubik-Regular.ttf"),
    "Rubik-ExtraBold": require("../assets/fonts/Rubik-ExtraBold.ttf"),
    JetBrainsMono: require("../assets/fonts/JetBrainsMono-Regular.ttf"),
    "JetBrainsMono-Medium": require("../assets/fonts/JetBrainsMono-Medium.ttf"),
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make API calls, etc.
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setIsReady(true);
      }
    }

    delay(prepare, 2000);
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <View
        style={[tw`flex-1`, { backgroundColor: SPLASH_BACKGROUND }]}
        onLayout={onLayoutRootView}
      >
        <MainStack />
      </View>
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <GestureHandlerRootView
      style={[tw`flex-1`, { backgroundColor: SPLASH_BACKGROUND }]}
    >
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <SafeAreaProvider style={{ backgroundColor: SPLASH_BACKGROUND }}>
            <StatusBar
              hidden
              backgroundColor={SPLASH_BACKGROUND}
              barStyle="light-content"
            />
            <AudioPlayerProvider>
              <Main />
            </AudioPlayerProvider>
          </SafeAreaProvider>
        </PersistGate>
      </Provider>
    </GestureHandlerRootView>
  );
};

export default App;
