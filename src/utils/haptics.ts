import {trigger} from 'react-native-haptic-feedback';

export const triggerHaptics = (type: Parameters<typeof trigger>[0] = 'impactHeavy') =>
  trigger(type);
