import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { theme } from '@kesh/sdk';

export default function Hello() {
  const [taps, setTaps] = useState(0);
  const { colors, fonts } = theme;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 40, fontWeight: '700', letterSpacing: -1 }}>Hello, Kesh</Text>
      <Pressable
        onPress={() => setTaps(taps + 1)}
        style={({ pressed }) => ({
          marginTop: 32,
          height: 54,
          paddingHorizontal: 32,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accent,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: colors.accentText, fontFamily: fonts.ui, fontSize: 17, fontWeight: '600' }}>Tapped {taps} times</Text>
      </Pressable>
    </View>
  );
}
