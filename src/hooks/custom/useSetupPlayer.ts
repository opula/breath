import { useEffect, useState } from 'react';
import { SetupAudioService } from '../../services/SetupAudioService';
import { MUSIC_MIX_MODE, storage } from '../../utils/storage';
import {
  DEFAULT_INTERRUPTION_MODE,
  MIX_INTERRUPTION_MODE,
} from '../../constants/music';

/**
 * Hook to configure the global audio settings using Expo AV.
 * Returns true once the initial setup is complete.
 */
export const useSetupPlayer = () => {
  const [playerReady, setPlayerReady] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      try {
        const isMix = storage.getBoolean(MUSIC_MIX_MODE) ?? false;
        // Removed volume setting logic - handled per sound in expo-av
        await SetupAudioService(
          isMix ? MIX_INTERRUPTION_MODE : DEFAULT_INTERRUPTION_MODE,
        );

        if (isMounted) {
          setPlayerReady(true);
        }
        // Removed QueueInitialTracksService call - track loading/queueing handled elsewhere
      } catch (error) {
        console.error('Error setting up audio player:', error);
        // Optionally update state to indicate an error
      }
    };

    setup();

    return () => {
      isMounted = false;
      // Cleanup audio resources if necessary when the component unmounts
      // Audio.unloadAsync() might be relevant depending on how sounds are managed
    };
  }, []);

  return playerReady;
};
