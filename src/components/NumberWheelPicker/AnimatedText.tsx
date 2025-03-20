import {SharedValue, useAnimatedProps} from 'react-native-reanimated';
import {TextInput, TextInputProps} from 'react-native';
import Animated from 'react-native-reanimated';
import tw from '../../utils/tw';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export const AnimatedText = ({
  text,
  fontSize = 16,
  lineHeight = 20,
  ...props
}: {text: SharedValue<string>; fontSize?: number; lineHeight?: number} & Omit<TextInputProps, 'editable' | 'value'>) => {
  const animatedProps = useAnimatedProps(() => {
    return {text: text.value} as unknown as TextInputProps;
  });

  return (
    <AnimatedTextInput
      editable={false}
      value={text.value}
      animatedProps={animatedProps}
      style={[tw`mt-6 font-lusitana text-white`, {marginBottom: -16, fontSize, lineHeight}]}
      {...props}
    />
  );
};
