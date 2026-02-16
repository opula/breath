import {createAudioPlayer} from 'expo-audio';

const players = {
  inhale: createAudioPlayer(require('../../assets/sounds/inhale-sound.wav')),
  exhale: createAudioPlayer(require('../../assets/sounds/exhale-sound.wav')),
  hold: createAudioPlayer(require('../../assets/sounds/hold-sound-v2.wav')),
};

export const playExerciseSound = async (type: 'inhale' | 'exhale' | 'hold') => {
  const p = players[type];
  await p.seekTo(0);
  p.play();
}
