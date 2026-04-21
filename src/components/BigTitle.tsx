import React from 'react';
import {Text, View} from 'react-native';
import tw from '../utils/tw';

export interface BigTitleProps {
  children: React.ReactNode;
  size?: number;
  accent?: boolean;
}

export const BigTitle = ({
  children,
  size = 44,
  accent = false,
}: BigTitleProps) => {
  // Ratios derived from the baseline-correct hand-tuned hero: a 44pt heading
  // with a 16pt square nudged up 11pt and -12pt pulling lines together.
  const squareSize = size * 0.36;
  const squareMarginBottom = size * 0.25;
  const lineOverlap = -size * 0.27;

  const textStyle = [
    tw`font-display uppercase text-mb-fg`,
    {
      fontSize: size,
      letterSpacing: -size * 0.04,
    },
  ];

  const square = accent ? (
    <View
      style={[
        tw`bg-mb-accent rounded-sm`,
        {
          width: squareSize,
          height: squareSize,
          marginBottom: squareMarginBottom,
        },
      ]}
    />
  ) : null;

  // When children is a string with newlines, stack each line as its own Text
  // inside a column and let items-end align the square to the last line's
  // natural baseline. Inter-line spacing is tightened via negative marginTop
  // rather than a compressed lineHeight, which would move the baseline.
  const lines = typeof children === 'string' ? children.split('\n') : null;

  if (!lines) {
    return (
      <View style={tw`flex-row items-end gap-x-2`}>
        <Text style={textStyle}>{children}</Text>
        {square}
      </View>
    );
  }

  return (
    <View style={tw`flex-row items-end gap-x-2`}>
      <View>
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[textStyle, i > 0 ? {marginTop: lineOverlap} : undefined]}>
            {line}
          </Text>
        ))}
      </View>
      {square}
    </View>
  );
};
