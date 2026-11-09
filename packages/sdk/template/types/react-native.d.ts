/** Minimal react-native typings for Kesh plugins. Covers the commonly used API. */
declare module 'react-native' {
  import type { ReactNode, ReactElement } from 'react';

  export interface ViewStyle {
    [key: string]: any;
  }
  export type StyleProp<T> = T | T[] | null | undefined | false;

  export interface ViewProps { style?: StyleProp<ViewStyle>; children?: ReactNode; pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'; testID?: string; accessibilityLabel?: string }
  export interface TextProps { style?: StyleProp<ViewStyle>; children?: ReactNode; numberOfLines?: number; testID?: string; accessibilityLabel?: string }
  export interface PressableProps {
    style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
    children?: ReactNode | ((s: { pressed: boolean }) => ReactNode);
    onPress?: () => void;
    onLongPress?: () => void;
    disabled?: boolean;
    testID?: string;
    accessibilityLabel?: string;
  }
  export interface TextInputProps {
    ref?: any;
    style?: StyleProp<ViewStyle>;
    value?: string;
    onChangeText?: (t: string) => void;
    placeholder?: string;
    placeholderTextColor?: string;
    multiline?: boolean;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'decimal-pad';
    onSubmitEditing?: () => void;
    autoFocus?: boolean;
    returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
    maxLength?: number;
  }
  export interface ScrollViewProps { style?: StyleProp<ViewStyle>; contentContainerStyle?: StyleProp<ViewStyle>; children?: ReactNode; horizontal?: boolean; keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'; showsVerticalScrollIndicator?: boolean; showsHorizontalScrollIndicator?: boolean; onContentSizeChange?: (w: number, h: number) => void; ref?: any }
  export interface KeyboardAvoidingViewProps extends ViewProps { behavior?: 'height' | 'position' | 'padding'; keyboardVerticalOffset?: number }
  export interface SwitchProps { value?: boolean; onValueChange?: (v: boolean) => void }
  export interface FlatListProps<T> {
    data: readonly T[];
    renderItem: (info: { item: T; index: number }) => ReactElement | null;
    keyExtractor?: (item: T, index: number) => string;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
  }

  export const View: (props: ViewProps) => ReactElement | null;
  export const Text: (props: TextProps) => ReactElement | null;
  export const Pressable: (props: PressableProps) => ReactElement | null;
  export const TextInput: (props: TextInputProps) => ReactElement | null;
  export const ScrollView: (props: ScrollViewProps) => ReactElement | null;
  export const KeyboardAvoidingView: (props: KeyboardAvoidingViewProps) => ReactElement | null;
  export const Switch: (props: SwitchProps) => ReactElement | null;
  export function FlatList<T>(props: FlatListProps<T>): ReactElement | null;
  export const StyleSheet: {
    create<T extends { [k: string]: ViewStyle }>(styles: T): T;
    hairlineWidth: number;
  };
  export const Platform: { OS: 'ios' | 'android' };
  export const Dimensions: { get(dim: 'window' | 'screen'): { width: number; height: number } };
}
