import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform } from 'react-native';

/**
 * Configures the global audio session using Expo AV.
 * @param interruptionModeIOS - How the app's audio interacts with other apps.
 */
export const SetupAudioService = async (
  interruptionModeIOS: InterruptionModeIOS = InterruptionModeIOS.DoNotMix,
) => {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: interruptionModeIOS,
      playsInSilentModeIOS: true, // Equivalent to Playback category
      staysActiveInBackground: true, // Keep audio active in background
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers, // Or DoNotMix, depending on desired Android behavior
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    console.log('Audio mode set successfully.');
  } catch (error) {
    console.error('Failed to set audio mode:', error);
    // Handle the error appropriately, maybe re-throw or log
  }
};
