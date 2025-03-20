import {useEffect, useState} from 'react';
import {SetupAudioService} from '../../services/SetupAudioService';
import TrackPlayer from '@5stones/react-native-track-player';
import {QueueInitialTracksService} from '../../services/QueueInitialTracksService';
import {MUSIC_BG_VOLUME, MUSIC_MIX_MODE, storage} from '../../utils/storage';
import {
  DEFAULT_IOS_CATEGORIES,
  MIX_IOS_CATEGORIES,
} from '../../constants/music';

export const useSetupPlayer = () => {
  const [playerReady, setPlayerReady] = useState<boolean>(false);

  useEffect(() => {
    let unmounted = false;
    (async () => {
      const isMix = storage.getBoolean(MUSIC_MIX_MODE) ?? false;
      const storedVolume = storage.getNumber(MUSIC_BG_VOLUME) ?? 1;
      await SetupAudioService(
        isMix ? MIX_IOS_CATEGORIES : DEFAULT_IOS_CATEGORIES,
        isMix ? storedVolume : undefined,
      );
      if (unmounted) return;
      setPlayerReady(true);
      const queue = await TrackPlayer.getQueue();
      if (unmounted) return;
      if (queue.length <= 0) {
        await QueueInitialTracksService();
      }
    })();
    return () => {
      unmounted = true;
    };
  }, []);

  return playerReady;
};
