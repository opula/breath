/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from "react";
import { StatusBar, View } from "react-native";
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
    background: "black",
    card: "black",
    text: "white",
    border: "transparent",
    primary: "blue",
    notification: "blue",
  },
};

const Main = () => {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make API calls, etc.
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // This tells the splash screen to hide immediately
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <View style={tw`flex-1 bg-black`} onLayout={onLayoutRootView}>
        <MainStack />
      </View>
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <GestureHandlerRootView style={tw`flex-1 bg-black`}>
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <SafeAreaProvider style={tw`bg-black`}>
            <StatusBar
              hidden
              backgroundColor="black"
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
