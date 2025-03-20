import TrackPlayer, {Track} from '@5stones/react-native-track-player';

import playlistData from '../../assets/data/playlist.json';
import {LAST_TRACK_PLAYED, storage} from '../utils/storage';

export const QueueInitialTracksService = async (): Promise<void> => {
  const startIndex = storage.getNumber(LAST_TRACK_PLAYED) || 0;
  const reorderedTracks = playlistData
    .slice(startIndex)
    .concat(playlistData.slice(0, startIndex));

  await TrackPlayer.add([...(reorderedTracks as Track[])]);
};
