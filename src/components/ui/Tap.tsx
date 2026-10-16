import { useState, type Ref } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';

/**
 * Pressable の代わり。style に関数（({ pressed }) => …）を渡しても確実に効くようにする。
 * NativeWind（jsxImportSource）経由の Pressable では関数の style が捨てられ、余白・背景・横並びが消えるため、
 * 押下状態をここで持って、普通の style として渡す。
 */
export type TapStyle = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

export type TapProps = Omit<PressableProps, 'style'> & { style?: TapStyle; ref?: Ref<View> };

export function Tap({ style, onPressIn, onPressOut, ...rest }: TapProps) {
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <Pressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={resolved}
    />
  );
}
