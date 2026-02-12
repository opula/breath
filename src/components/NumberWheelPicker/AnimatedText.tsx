import {SharedValue, useAnimatedProps} from 'react-native-reanimated';
import {TextInput, TextInputProps} from 'react-native';
import Animated from 'react-native-reanimated';
import tw from '../../utils/tw';
import {memo} from 'react';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export const AnimatedText = memo(({
  text,
  fontSize = 16,
  lineHeight = 20,
  ...props
}: {text: SharedValue<string>; fontSize?: number; lineHeight?: number} & Omit<TextInputProps, 'editable' | 'value'>) => {
  // Optimize animated props to only update when text value changes
  const animatedProps = useAnimatedProps(() => {
    return {text: text.value} as unknown as TextInputProps;
  }, [text.value]);

  return (
    <AnimatedTextInput
      editable={false}
      value={text.value}
      animatedProps={animatedProps}
      style={[tw`mt-6 font-inter text-white`, {marginBottom: -16, fontSize, lineHeight}]}
      {...props}
    />
  );
}, (prevProps, nextProps) => {
  // Only re-render if the shared value reference changes
  // The actual text content changes are handled by the animated props
  return (
    prevProps.text === nextProps.text &&
    prevProps.fontSize === nextProps.fontSize &&
    prevProps.lineHeight === nextProps.lineHeight
  );
});
