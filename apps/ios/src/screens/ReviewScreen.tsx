import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Permission, PluginPayload } from '../protocol';
import { colors, fonts } from '../theme';
import { Dot, PillButton, TextButton } from '../ui/bits';
import PluginIcon from '../components/PluginIcon';
import { useApp } from '../state/AppState';

const EXPLAIN: Record<Permission, string> = {
  haptics: 'Feel taps and gentle vibrations.',
  storage: 'Keep its own data on this phone.',
  clipboard: 'Read and write what you copy.',
  notifications: 'Send you reminders.',
  ai: "Send prompts to Apple's on-device model, or to Claude on your Mac.",
};

const TITLE: Partial<Record<Permission, string>> = { ai: 'AI models' };

export default function ReviewScreen({ plugin }: { plugin: PluginPayload }) {
  const app = useApp();
  const { manifest } = plugin;
  const [on, setOn] = useState<Record<string, boolean>>(
    Object.fromEntries(manifest.permissions.map(p => [p, true])),
  );
  const [busy, setBusy] = useState(false);
  const words = manifest.name.split(' ');
  const last = words.pop()!;
  const isUpdate = app.plugins.some(p => p.manifest.id === manifest.id);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.pad}>
        <PluginIcon icon={plugin.icon} name={manifest.name} size={88} />
        <View style={[styles.eyebrow, { marginTop: 20 }]}>
          <Dot />
          <Text style={styles.eyebrowText}>{isUpdate ? 'UPDATE FROM YOUR MAC' : 'NEW FROM YOUR MAC'}</Text>
        </View>
        <Text style={styles.title}>
          {words.length ? words.join('\n') + '\n' : ''}
          <Text style={words.length ? styles.light : undefined}>{last}</Text>
        </Text>
        <Text style={styles.desc}>{manifest.description}</Text>

        <Text style={styles.section}>IT ASKS TO USE</Text>
        {manifest.permissions.length === 0 ? (
          <Text style={styles.desc}>Nothing. It runs on its own.</Text>
        ) : (
          manifest.permissions.map((p, i) => (
            <View key={p} style={styles.permRow}>
              <Text style={styles.num}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>{TITLE[p] ?? p[0].toUpperCase() + p.slice(1)}</Text>
                <Text style={styles.permWhy}>{EXPLAIN[p] ?? ''}</Text>
              </View>
              <Switch
                value={on[p]}
                onValueChange={v => setOn(s => ({ ...s, [p]: v }))}
                trackColor={{ false: colors.hairline, true: colors.accent }}
                thumbColor={colors.accentText}
                ios_backgroundColor={colors.hairline}
              />
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PillButton
          label={isUpdate ? 'Update' : 'Install'}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await app.install(plugin, manifest.permissions.filter(p => on[p]));
            } finally {
              setBusy(false);
            }
          }}
        />
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <TextButton label="Not now" onPress={() => app.decline(plugin)} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  pad: { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 24 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eyebrowText: { color: colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 1.2 },
  title: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, fontWeight: '700', letterSpacing: -1.5, color: colors.text, marginTop: 14 },
  light: { fontWeight: '300' },
  desc: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: 18 },
  section: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 1.2, marginTop: 40, marginBottom: 6 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    gap: 16,
  },
  num: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted, width: 24 },
  permName: { color: colors.text, fontSize: 17 },
  permWhy: { color: colors.muted, fontSize: 14, marginTop: 2 },
  footer: { paddingHorizontal: 28, paddingBottom: 16, paddingTop: 8 },
});
