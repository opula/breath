import {trigger} from 'react-native-haptic-feedback';

export const triggerHaptics = (type = 'impactHeavy') => trigger(type);
