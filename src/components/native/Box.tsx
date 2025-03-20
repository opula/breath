import React from 'react';
import { View, ViewProps } from 'react-native';
import tw from 'twrnc';

/**
 * Box component - a View with twrnc styling
 */
export type BoxProps = ViewProps & {
  backgroundColor?: string;
  padding?: string | number;
  margin?: string | number;
  px?: string | number;
  py?: string | number;
  pt?: string | number;
  pb?: string | number;
  pl?: string | number;
  pr?: string | number;
  mx?: string | number;
  my?: string | number;
  mt?: string | number;
  mb?: string | number;
  ml?: string | number;
  mr?: string | number;
  flex?: number;
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  position?: 'absolute' | 'relative';
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  borderWidth?: number;
  borderColor?: string;
  borderBottomWidth?: number;
  borderBottomColor?: string;
  opacity?: number;
};

// Helper function to convert restyle spacing to twrnc
const getSpacingClass = (size: string | number | undefined) => {
  if (size === undefined) return '';
  
  if (typeof size === 'number') {
    return size;
  }
  
  // Convert restyle spacing keys to tw values
  switch (size) {
    case 'xxs': return 0.5;
    case 'xs': return 1;
    case 's': return 2;
    case 'm': return 4;
    case 'l': return 6;
    case 'xl': return 8;
    case 'xxl': return 10;
    default: return size;
  }
};

export const Box: React.FC<BoxProps> = ({ 
  children,
  style,
  backgroundColor,
  padding,
  margin,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  mx,
  my,
  mt,
  mb,
  ml,
  mr,
  flex,
  width,
  height,
  borderRadius,
  flexDirection,
  justifyContent,
  alignItems,
  position,
  top,
  left,
  right,
  bottom,
  borderWidth,
  borderColor,
  borderBottomWidth,
  borderBottomColor,
  opacity,
  ...props 
}) => {
  const styles = [
    // Handle flex
    flex !== undefined && tw`flex-${flex}`,
    
    // Handle backgroundColor
    backgroundColor && (backgroundColor.startsWith('#') || backgroundColor.startsWith('rgb') 
      ? { backgroundColor } 
      : tw`bg-${backgroundColor}`),
    
    // Handle width and height
    width !== undefined && (typeof width === 'string' ? tw`w-${width}` : { width }),
    height !== undefined && (typeof height === 'string' ? tw`h-${height}` : { height }),
    
    // Handle padding
    padding !== undefined && tw`p-${getSpacingClass(padding)}`,
    px !== undefined && tw`px-${getSpacingClass(px)}`,
    py !== undefined && tw`py-${getSpacingClass(py)}`,
    pt !== undefined && tw`pt-${getSpacingClass(pt)}`,
    pb !== undefined && tw`pb-${getSpacingClass(pb)}`,
    pl !== undefined && tw`pl-${getSpacingClass(pl)}`,
    pr !== undefined && tw`pr-${getSpacingClass(pr)}`,
    
    // Handle margin
    margin !== undefined && tw`m-${getSpacingClass(margin)}`,
    mx !== undefined && tw`mx-${getSpacingClass(mx)}`,
    my !== undefined && tw`my-${getSpacingClass(my)}`,
    mt !== undefined && tw`mt-${getSpacingClass(mt)}`,
    mb !== undefined && tw`mb-${getSpacingClass(mb)}`,
    ml !== undefined && tw`ml-${getSpacingClass(ml)}`,
    mr !== undefined && tw`mr-${getSpacingClass(mr)}`,
    
    // Handle border radius
    borderRadius !== undefined && (typeof borderRadius === 'string' 
      ? tw`rounded-${borderRadius}` 
      : { borderRadius }),
    
    // Handle flexDirection
    flexDirection === 'row' && tw`flex-row`,
    flexDirection === 'column' && tw`flex-col`,
    flexDirection === 'row-reverse' && tw`flex-row-reverse`,
    flexDirection === 'column-reverse' && tw`flex-col-reverse`,
    
    // Handle justifyContent
    justifyContent === 'flex-start' && tw`justify-start`,
    justifyContent === 'flex-end' && tw`justify-end`,
    justifyContent === 'center' && tw`justify-center`,
    justifyContent === 'space-between' && tw`justify-between`,
    justifyContent === 'space-around' && tw`justify-around`,
    justifyContent === 'space-evenly' && tw`justify-evenly`,
    
    // Handle alignItems
    alignItems === 'flex-start' && tw`items-start`,
    alignItems === 'flex-end' && tw`items-end`,
    alignItems === 'center' && tw`items-center`,
    alignItems === 'stretch' && tw`items-stretch`,
    alignItems === 'baseline' && tw`items-baseline`,
    
    // Handle position
    position === 'absolute' && tw`absolute`,
    position === 'relative' && tw`relative`,
    
    // Handle position values
    top !== undefined && (typeof top === 'string' ? tw`top-${top}` : { top }),
    left !== undefined && (typeof left === 'string' ? tw`left-${left}` : { left }),
    right !== undefined && (typeof right === 'string' ? tw`right-${right}` : { right }),
    bottom !== undefined && (typeof bottom === 'string' ? tw`bottom-${bottom}` : { bottom }),
    
    // Handle border properties
    borderWidth !== undefined && tw`border-${borderWidth}`,
    borderColor && (borderColor.startsWith('#') || borderColor.startsWith('rgb') 
      ? { borderColor } 
      : tw`border-${borderColor}`),
    
    borderBottomWidth !== undefined && { borderBottomWidth },
    borderBottomColor && (borderBottomColor.startsWith('#') || borderBottomColor.startsWith('rgb') 
      ? { borderBottomColor } 
      : { borderBottomColor: tw.color(`${borderBottomColor}`) }),
    
    // Handle opacity
    opacity !== undefined && tw`opacity-${opacity * 100}`,
    
    // Add custom styles passed via style prop
    style,
  ].filter(Boolean);

  return (
    <View style={styles} {...props}>
      {children}
    </View>
  );
};

export default Box;
