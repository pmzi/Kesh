import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Dot, TextButton, Wordmark, useNow } from '../ui/bits';
import PluginIcon from '../components/PluginIcon';
import { useApp } from '../state/AppState';

export default function HomeScreen({ onOpen, onPair }: { onOpen: (id: string) => void; onPair: () => void }) {
  const app = useApp();
  const now = useNow(5000);
  const connected = app.status === 'connected';
  const label = connected ? app.macName ?? 'Mac' : app.paired ? (app.status === 'connecting' ? 'Connecting…' : 'Reconnecting…') : 'Not connected';

  const confirmRemove = (id: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'It will be deleted from this phone. Your Mac keeps the source.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => app.remove(id) },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.header}>
          <Wordmark />
          <Pressable
            onPress={() => {
              if (!app.paired) onPair();
              else
                Alert.alert('Disconnect from this Mac?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disconnect', style: 'destructive', onPress: () => app.disconnect() },
                ]);
            }}
            style={styles.status}>
            <Dot color={connected ? colors.accent : colors.muted} />
            <Text style={styles.statusText}>{label}</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>
          Your <Text style={styles.light}>plugins</Text>
        </Text>

        <View style={styles.list}>
          {app.plugins.map(p => {
            const hot = app.hotAt[p.manifest.id];
            const fresh = !!hot && now - hot < 60000;
            return (
              <Pressable
                key={p.manifest.id}
                onPress={() => onOpen(p.manifest.id)}
                onLongPress={() => confirmRemove(p.manifest.id, p.manifest.name)}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
                <PluginIcon icon={p.icon} name={p.manifest.name} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.manifest.name}</Text>
                  <Text style={[styles.sub, fresh && { color: colors.text, fontWeight: '600' }]}>
                    {fresh ? 'Updated just now' : p.granted.length ? p.granted.join(' · ') : 'No permissions'}
                  </Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            );
          })}
          {app.plugins.length === 0 ? <Text style={styles.empty}>Nothing here yet.</Text> : null}
        </View>

        <View style={styles.hint}>
          <Text style={styles.hintText}>Want another? Ask Claude Code on your Mac.</Text>
          <Text style={styles.mono}>{'> add a plugin that…'}</Text>
        </View>

        {__DEV__ ? (
          <View style={{ marginTop: 28, alignItems: 'flex-start' }}>
            <TextButton label="Dev: load sample plugin" onPress={() => app.offerLocal(require('../plugins/fixture').FIXTURE)} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  pad: { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { color: colors.muted, fontSize: 13 },
  title: { fontFamily: fonts.display, fontSize: 52, lineHeight: 54, fontWeight: '700', letterSpacing: -1.5, color: colors.text, marginTop: 40 },
  light: { fontWeight: '300' },
  list: { marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  name: { color: colors.text, fontSize: 18, fontWeight: '600' },
  sub: { color: colors.muted, fontSize: 14, marginTop: 2 },
  chev: { color: colors.muted, fontSize: 24 },
  empty: { color: colors.muted, paddingVertical: 24, fontSize: 15 },
  hint: { marginTop: 48 },
  hintText: { color: colors.muted, fontSize: 15 },
  mono: { fontFamily: fonts.mono, color: colors.text, fontSize: 13, marginTop: 10 },
});
