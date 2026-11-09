import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { haptics, storage, theme } from '@kesh/sdk';

const GOAL = 8;
const RING = 220;
const DOT = 18;
const { colors, fonts } = theme;

const todayKey = () => 'glasses:' + new Date().toISOString().slice(0, 10);

export default function WaterTracker() {
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage
      .get(todayKey())
      .then((v) => setCount(v ? parseInt(v, 10) || 0 : 0))
      .finally(() => setLoaded(true));
  }, []);

  const add = () => {
    if (!loaded) return;
    const next = count + 1;
    setCount(next);
    storage.set(todayKey(), String(next));
    if (next === GOAL) haptics.notification('success');
    else haptics.impact('light');
  };

  const radius = (RING - DOT) / 2;
  const dots = Array.from({ length: GOAL }, (_, i) => {
    const angle = (i / GOAL) * 2 * Math.PI - Math.PI / 2;
    const filled = i < count;
    return (
      <View
        key={i}
        style={{
          position: 'absolute',
          left: RING / 2 + radius * Math.cos(angle) - DOT / 2,
          top: RING / 2 + radius * Math.sin(angle) - DOT / 2,
          width: DOT,
          height: DOT,
          borderRadius: DOT / 2,
          backgroundColor: filled ? colors.accent : colors.ground,
          borderWidth: 1,
          borderColor: filled ? colors.accent : colors.hairline,
        }}
      />
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', letterSpacing: 1.2, marginBottom: 32 }}>
        TODAY
      </Text>
      <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
        {dots}
        <View
          style={{
            width: RING - 56,
            height: RING - 56,
            borderRadius: (RING - 56) / 2,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 64, fontWeight: '700', letterSpacing: -1 }}>{count}</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15 }}>of {GOAL} glasses</Text>
        </View>
      </View>
      <Pressable
        onPress={add}
        style={({ pressed }) => ({
          marginTop: 48,
          height: 56,
          paddingHorizontal: 36,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          backgroundColor: colors.accent,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: colors.accentText, fontFamily: fonts.ui, fontSize: 17, fontWeight: '600' }}>Add a glass</Text>
      </Pressable>
      {count >= GOAL && (
        <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 17, fontWeight: '600', marginTop: 20 }}>
          Goal reached
        </Text>
      )}
    </View>
  );
}
