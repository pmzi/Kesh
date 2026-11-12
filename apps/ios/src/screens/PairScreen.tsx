import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { colors, fonts } from '../theme';
import { TextButton } from '../ui/bits';
import { useApp } from '../state/AppState';

const Bracket = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => (
  <View
    style={[
      styles.bracket,
      pos[0] === 't' ? { top: 14, borderTopWidth: 2 } : { bottom: 14, borderBottomWidth: 2 },
      pos[1] === 'l' ? { left: 14, borderLeftWidth: 2 } : { right: 14, borderRightWidth: 2 },
    ]}
  />
);

/** Pairing UI (QR scan + typed code). Rendered inside the connection sheet. */
export default function PairScreen({ initialCode, autoSubmit, onBack }: { initialCode?: string; autoSubmit?: boolean; onBack?: () => void }) {
  const app = useApp();
  const device = useCameraDevice('back');
  const [granted, setGranted] = useState(false);
  const [manual, setManual] = useState(!!initialCode);
  const [text, setText] = useState(initialCode ?? '');
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const scroll = useRef<any>(null);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (initialCode) {
      setManual(true);
      setText(initialCode);
    }
  }, [initialCode]);

  useEffect(() => {
    Camera.requestCameraPermission().then(r => setGranted(r === 'granted'));
  }, []);

  const submit = (url: string) => {
    if (busy.current) return;
    const e = app.pairWithUrl(url);
    setErr(e);
    if (e) {
      busy.current = true;
      setTimeout(() => (busy.current = false), 1500);
    }
  };

  useEffect(() => {
    // deep link auto-submits; the dev manual link types the code and submits like a user would
    if (initialCode && (autoSubmit || __DEV__)) {
      const t = setTimeout(() => submit(initialCode), 1200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const scanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const v = codes[0]?.value;
      if (v?.startsWith('kesh://')) submit(v);
    },
  });

  return (
    <View style={styles.root}>
     <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
      <View style={styles.pad}>
        <Text style={styles.headline}>
          Pair a <Text style={styles.light}>Mac</Text>
        </Text>
        <Text style={styles.sub}>Run npx kesh on your Mac and scan the code it shows.</Text>
      </View>

      <View style={styles.finder}>
        {device && granted && !manual ? (
          <Camera style={StyleSheet.absoluteFill} device={device} isActive codeScanner={scanner} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.phText}>
              {Platform.OS === 'ios' && !device ? 'No camera available' : granted ? '' : 'Camera access needed'}
            </Text>
            {!granted && device ? <TextButton label="Open Settings" onPress={() => Linking.openSettings()} /> : null}
          </View>
        )}
        <Bracket pos="tl" />
        <Bracket pos="tr" />
        <Bracket pos="bl" />
        <Bracket pos="br" />
      </View>

      <View style={styles.bottom}>
        {manual ? (
          <View style={{ width: '100%' }}>
            <TextInput
              testID="pair-input"
              autoFocus
              value={text}
              onChangeText={t => {
                setText(t);
                setErr(null);
              }}
              placeholder="kesh://pair?host=…&port=…&token=…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              onSubmitEditing={() => submit(text)}
              returnKeyType="go"
            />
            {err || app.pairError ? <Text style={styles.err}>{err ?? app.pairError}</Text> : null}
            <View style={styles.row}>
              <TextButton label="Back to camera" onPress={() => setManual(false)} />
              <TextButton accent label="Connect" onPress={() => submit(text)} />
            </View>
          </View>
        ) : (
          <>
            <TextButton label="Enter code instead" onPress={() => setManual(true)} />
            {err || app.pairError ? <Text style={styles.err}>{err ?? app.pairError}</Text> : null}
          </>
        )}
        {onBack ? (
          <View style={{ marginTop: 18 }}>
            <TextButton label="Back" onPress={onBack} />
          </View>
        ) : null}
      </View>
      </ScrollView>
     </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  pad: { paddingHorizontal: 28, paddingTop: 4 },
  headline: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2, color: colors.text, marginTop: 8 },
  light: { fontWeight: '300' },
  sub: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 20, maxWidth: 300 },
  finder: {
    width: 334,
    height: 250,
    alignSelf: 'center',
    marginTop: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  phText: { color: colors.muted, fontSize: 14 },
  bracket: { position: 'absolute', width: 34, height: 34, borderColor: colors.accent, borderRadius: 4 },
  bottom: { alignItems: 'center', paddingHorizontal: 28, marginTop: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    color: colors.text,
    paddingHorizontal: 14,
    height: 48,
    fontFamily: fonts.mono,
    fontSize: 12,
    backgroundColor: colors.surface,
  },
  err: { color: colors.text, fontWeight: '600', fontSize: 13, marginTop: 10, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
});
