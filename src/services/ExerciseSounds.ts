import {createAudioPlayer} from 'expo-audio';

const players = {
  inhale: createAudioPlayer(require('../../assets/sounds/inhale-sound.wav')),
  exhale: createAudioPlayer(require('../../assets/sounds/exhale-sound.wav')),
  hold: createAudioPlayer(require('../../assets/sounds/hold-sound.wav')),
};

export function playExerciseSound(type: 'inhale' | 'exhale' | 'hold') {
  const p = players[type];
  p.seekTo(0);
  p.play();
}
