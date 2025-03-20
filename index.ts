import { registerRootComponent } from "expo";
import App from "./src/App";

import TrackPlayer from "react-native-track-player";
import { PlaybackService } from "./src/services/PlaybackService";

// Register the main component
registerRootComponent(App);
TrackPlayer.registerPlaybackService(() => PlaybackService);
