/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useCallback, useEffect, useState } from "react";
import { FiberProvider } from "its-fine";
import { StatusBar, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
// Theme is now handled by twrnc
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MainStack } from "./navigation";
import { NavigationContainer } from "@react-navigation/native";
import { useSetupPlayer } from "./hooks/custom/useSetupPlayer";
import { persistor, store } from "./store";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import * as SplashScreen from "expo-splash-screen";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const Main = () => {
  const [appIsReady, setAppIsReady] = useState(false);
  
  // Initialize the audio player
  useSetupPlayer();
  
  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make API calls, etc.
        
        // Artificially delay for two seconds to simulate a slow loading
        // experience. Please remove this if you copy and paste the code!
        await new Promise(resolve => setTimeout(resolve, 2000));
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
    <NavigationContainer>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <MainStack />
      </View>
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <FiberProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <SafeAreaProvider>
              <StatusBar hidden />
              <Main />
              {/* <Playground /> */}
            </SafeAreaProvider>
          </PersistGate>
        </Provider>
      </GestureHandlerRootView>
    </FiberProvider>
  );
};

export default App;
