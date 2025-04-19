import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import playlistData from '../../assets/data/playlist.json';
import { storage, LAST_TRACK_PLAYED, MUSIC_BG_VOLUME } from '../utils/storage';

// Define the shape of our track data (adjust based on playlist.json structure)
interface Track {
  id?: string | number; 
  url: string; 
  title: string;
  artist: string;
  // Add other relevant fields like artwork, duration if available
}

// Define the shape of the context state
interface AudioPlayerState {
  isPlaying: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  isLooping: boolean;
  durationMillis: number;
  positionMillis: number;
  currentTrack: Track | null;
  currentTrackIndex: number;
  volume: number;
  error: string | null;
}

// Define the actions available on the context
interface AudioPlayerActions {
  play: () => void;
  pause: () => void;
  seek: (positionMillis: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  loadTrack: (index: number) => Promise<void>;
  setVolume: (volume: number) => void;
  toggleLooping: () => void;
}

// Create the context
const AudioPlayerContext = createContext<
  (AudioPlayerState & AudioPlayerActions) | undefined
>(undefined);

// Define the provider component
export const AudioPlayerProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isLoaded: false,
    isBuffering: false,
    isLooping: false,
    durationMillis: 0,
    positionMillis: 0,
    currentTrack: null,
    currentTrackIndex: -1,
    volume: storage.getNumber(MUSIC_BG_VOLUME) ?? 1,
    error: null,
  });

  // Use type assertion carefully - ensure playlistData matches Track shape as much as possible
  const playlist = playlistData as Track[];

  // Forward declaration for functions used in callbacks
  const loadTrackRef = useRef<(index: number) => Promise<void>>();
  const onPlaybackStatusUpdateRef = useRef<(status: AVPlaybackStatus) => void>();

  // --- Track Loading Function ---
  const loadTrack = useCallback(async (index: number) => {
    if (index < 0 || index >= playlist.length) {
      console.error('Invalid track index:', index);
      setState(prev => ({ ...prev, error: 'Invalid track index' }));
      return;
    }

    const track = playlist[index];
    setState(prev => ({ ...prev, isBuffering: true, currentTrack: track, currentTrackIndex: index, error: null }));

    try {
      // Unload previous sound if it exists
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Load new sound
      const { sound, status } = await Audio.Sound.createAsync(
        typeof track.url === 'number' ? track.url : { uri: track.url },
        {
          shouldPlay: state.isPlaying, 
          volume: state.volume,
          isLooping: state.isLooping,
          progressUpdateIntervalMillis: 500,
        },
        onPlaybackStatusUpdateRef.current 
      );

      soundRef.current = sound;
      storage.set(LAST_TRACK_PLAYED, index); 

      if (!status.isLoaded) {
         console.warn('Sound loaded but status is not isLoaded initially.');
         // onPlaybackStatusUpdateRef.current will handle error if status.error exists
      }

    } catch (err: any) {
      console.error('Error loading track:', err);
      setState(prev => ({ ...prev, error: `Failed to load track: ${err.message}`, isBuffering: false }));
      soundRef.current = null; 
    }
  }, [playlist, state.isPlaying, state.volume, state.isLooping]);

  loadTrackRef.current = loadTrack; 

  // --- Next/Previous Track Functions ---
  const nextTrackInternal = useCallback(() => {
    const nextIndex = (state.currentTrackIndex + 1) % playlist.length;
    loadTrackRef.current?.(nextIndex);
  }, [state.currentTrackIndex, playlist.length]);

  const previousTrackInternal = useCallback(() => {
    const prevIndex = (state.currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrackRef.current?.(prevIndex);
  }, [state.currentTrackIndex, playlist.length]);

  // --- Playback Status Update Handler ---
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (status.error) {
          console.error(`Playback Error: ${status.error}`);
          // Use ?? null to ensure correct type for error
          setState(prev => ({ ...prev, error: status.error ?? 'Unknown playback error', isLoaded: false, isPlaying: false }));
        } else if (state.isLoaded) {
            // If it was previously loaded (e.g., unloaded manually or finished), reset state
            setState(prev => ({ ...prev, isLoaded: false, isPlaying: false, positionMillis: 0, durationMillis: 0 }));
        }
        return;
      }

      // If we reach here, status is AVPlaybackStatusSuccess
      setState(prev => ({
        ...prev,
        isLoaded: true,
        isPlaying: status.isPlaying,
        isBuffering: status.isBuffering,
        isLooping: status.isLooping,
        durationMillis: status.durationMillis ?? 0,
        positionMillis: status.positionMillis,
        volume: status.volume,
        error: null, 
      }));

      // Handle track finishing (if not looping)
      if (status.didJustFinish && !status.isLooping) {
        nextTrackInternal(); 
      }
    },
    [state.isLoaded, nextTrackInternal] 
  );

  onPlaybackStatusUpdateRef.current = onPlaybackStatusUpdate; 

  // --- Control Functions ---
  const play = useCallback(async () => {
    if (soundRef.current && state.isLoaded) {
      try {
        if (!state.isPlaying) {
             await soundRef.current.playAsync();
        }
      } catch (error: any) {
        console.error('Error playing sound:', error);
        setState(prev => ({ ...prev, error: `Playback error: ${error.message}` }));
      }
    } else if (!state.isLoaded && state.currentTrackIndex !== -1) {
      // If not loaded, try loading the current index
      loadTrackRef.current?.(state.currentTrackIndex);
    }
  }, [state.isLoaded, state.currentTrackIndex, state.isPlaying]);

  const pause = useCallback(async () => {
    if (soundRef.current && state.isPlaying) {
      try {
        await soundRef.current.pauseAsync();
      } catch (error: any) {
        console.error('Error pausing sound:', error);
        setState(prev => ({ ...prev, error: `Pause error: ${error.message}` }));
      }
    }
  }, [state.isPlaying]);

  const seek = useCallback(async (positionMillis: number) => {
    if (soundRef.current && state.isLoaded) {
      try {
        await soundRef.current.setPositionAsync(positionMillis);
      } catch (error: any) {
        console.error('Error seeking sound:', error);
        setState(prev => ({ ...prev, error: `Seek error: ${error.message}` }));
      }
    }
  }, [state.isLoaded]);

  const setVolume = useCallback(async (newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setState(prev => ({ ...prev, volume: clampedVolume })); 
    if (soundRef.current && state.isLoaded) {
      try {
        await soundRef.current.setVolumeAsync(clampedVolume);
        storage.set(MUSIC_BG_VOLUME, clampedVolume);
      } catch (error: any) {
        console.error('Error setting volume:', error);
        setState(prev => ({ ...prev, error: `Volume error: ${error.message}` }));
      }
    }
  }, [state.isLoaded]);

  const toggleLooping = useCallback(async () => {
    if (soundRef.current && state.isLoaded) {
      try {
        const newLoopingState = !state.isLooping;
        await soundRef.current.setIsLoopingAsync(newLoopingState);
        // onPlaybackStatusUpdate will update the state.isLooping value
      } catch (error: any) {
        console.error('Error toggling looping:', error);
        setState(prev => ({ ...prev, error: `Looping error: ${error.message}` }));
      }
    }
  }, [state.isLoaded, state.isLooping]);

  // --- Initial Load Effect ---
  useEffect(() => {
    const initialIndex = storage.getNumber(LAST_TRACK_PLAYED) ?? 0;
    if (playlist.length > 0 && state.currentTrackIndex === -1) { 
      loadTrackRef.current?.(initialIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.length]); 

  // --- Cleanup Effect ---
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  // Combine state and actions for the context value
  const value = {
    ...state,
    play,
    pause,
    seek,
    nextTrack: nextTrackInternal,
    previousTrack: previousTrackInternal,
    loadTrack,
    setVolume,
    toggleLooping,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

// Custom hook to use the context
export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
