import { Animated, Easing, Platform } from 'react-native';
import { 
  StackCardInterpolationProps, 
  StackCardInterpolatedStyle,
  TransitionSpec
} from '@react-navigation/stack/lib/typescript/src/types';

/**
 * Custom transition configurations for smoother cross-platform transitions
 */

// Shared timing configuration for consistent animations
export const transitionConfig: TransitionSpec = {
  animation: 'timing',
  config: {
    duration: 350,
    easing: Easing.out(Easing.poly(4)),
  },
};

// Fade transition that works well on both platforms
export const fadeTransitionSpec = {
  open: transitionConfig,
  close: transitionConfig,
};

// Custom cross-fade interpolator that prevents flashing on Android
export const crossFadeInterpolator = ({ 
  current, 
  next, 
  inverted, 
  layouts: { screen } 
}: StackCardInterpolationProps): StackCardInterpolatedStyle => {
  // For Android, we need to ensure the previous screen stays visible until the new one is fully rendered
  // This prevents the white flash that occurs when screens are unmounted too early
  
  // On Android, we use a different approach to handle the transition
  if (Platform.OS === 'android') {
    // Keep current screen fully visible until the next one starts appearing
    const currentOpacity = current.progress.interpolate({
      inputRange: [0, 0.9, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    });

    // Ensure next screen is already visible before current starts to fade
    // This creates a slight overlap that prevents the white background from showing
    const nextOpacity = next ? next.progress.interpolate({
      inputRange: [0, 0.1, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }) : 0;

    return {
      cardStyle: {
        opacity: currentOpacity,
        // Keep the background explicitly black during transition
        backgroundColor: 'black',
        // Minimal movement to avoid jarring transitions
        transform: [{ 
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [5, 0],
            extrapolate: 'clamp',
          })
        }],
      },
      containerStyle: {
        // Ensure the container background is also black
        backgroundColor: 'black',
      },
      overlayStyle: {
        backgroundColor: 'black',
        opacity: current.progress.interpolate({
          inputRange: [0, 0.8, 1],
          outputRange: [0, 0.5, 0.5],
          extrapolate: 'clamp',
        }),
      },
    };
  } else {
    // iOS implementation - smoother cross-fade
    const opacity = Animated.add(
      current.progress,
      next ? next.progress : 0
    ).interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, 1, 0],
    });

    return {
      cardStyle: {
        opacity,
        transform: [{ 
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0],
            extrapolate: 'clamp',
          })
        }],
      },
      overlayStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.5],
          extrapolate: 'clamp',
        }),
      },
    };
  }
};

// Smooth modal transition that works well on Android
export const smoothModalInterpolator = ({ 
  current, 
  inverted, 
  layouts: { screen } 
}: StackCardInterpolationProps): StackCardInterpolatedStyle => {
  if (Platform.OS === 'android') {
    // Android-specific modal animation to prevent flashing
    // Use a fade-in combined with a smaller translation
    const translateY = current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [screen.height / 3, 0],
      extrapolate: 'clamp',
    });

    const opacity = current.progress.interpolate({
      inputRange: [0, 0.1, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    });

    return {
      cardStyle: {
        opacity,
        backgroundColor: 'black', // Explicit black background
        transform: [{ translateY }],
      },
      containerStyle: {
        backgroundColor: 'black',
      },
      overlayStyle: {
        backgroundColor: 'black',
        opacity: current.progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0.5, 0.7],
          extrapolate: 'clamp',
        }),
      },
    };
  } else {
    // iOS modal animation - slide up from bottom
    const translateY = current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [screen.height, 0],
      extrapolate: 'clamp',
    });

    const opacity = current.progress.interpolate({
      inputRange: [0, 0.1, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    });

    return {
      cardStyle: {
        opacity,
        transform: [{ translateY }],
      },
      overlayStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.6],
          extrapolate: 'clamp',
        }),
      },
    };
  }
};
