import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

export const Wordmark = () => (
  <Text style={{ fontFamily: fonts.display, fontWeight: '700', fontSize: 20, letterSpacing: 20 * 0.3, color: colors.text }}>
    KESH
  </Text>
);

export const Dot = ({ color = colors.accent, size = 7 }: { color?: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
);

export const TextButton = ({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) => (
  <Pressable
    onPress={onPress}
    hitSlop={12}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, minHeight: 44, justifyContent: 'center' })}>
    <Text style={[styles.textButton, accent && { color: colors.accent, fontWeight: '600' }]}>{label}</Text>
  </Pressable>
);

export const PillButton = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.pill, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}>
    <Text style={styles.pillText}>{label}</Text>
  </Pressable>
);

export function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function useNow(ms = 1000) {
  const [n, setN] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

const styles = StyleSheet.create({
  textButton: { color: colors.muted, fontSize: 16, fontFamily: fonts.ui },
  pill: { height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: colors.accentText, fontSize: 17, fontWeight: '600' },
});
