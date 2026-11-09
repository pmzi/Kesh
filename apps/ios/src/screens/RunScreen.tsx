import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { Dot, ago, useNow } from '../ui/bits';
import PluginIcon from '../components/PluginIcon';
import { useApp } from '../state/AppState';
import { loadPlugin, PluginErrorBoundary } from '../plugins/host';

export default function RunScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const app = useApp();
  const rec = app.plugins.find(p => p.manifest.id === id);
  const now = useNow(1000);
  const [loadErr, setLoadErr] = useState(0);

  const loaded = useMemo(() => {
    if (!rec) return null;
    try {
      return { C: loadPlugin(rec) } as { C: React.ComponentType; error?: undefined };
    } catch (e: any) {
      return { error: e as Error } as { C?: undefined; error: Error };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.hash, rec?.updatedAt, loadErr]);

  // Forward console output to the companion while the plugin is on screen.
  useEffect(() => {
    const orig = { log: console.log, warn: console.warn, error: console.error };
    const wrap = (level: 'info' | 'warn' | 'error', fn: (...a: any[]) => void) =>
      (...args: any[]) => {
        fn(...args);
        try {
          app.log(id, level, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
        } catch {}
      };
    console.log = wrap('info', orig.log);
    console.warn = wrap('warn', orig.warn);
    console.error = wrap('error', orig.error);
    return () => {
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Plugins</Text>
        </Pressable>
        <View style={styles.center}>
          {rec ? <PluginIcon icon={rec.icon} name={rec.manifest.name} size={24} /> : null}
          <Text style={styles.name}>{(rec?.manifest.name ?? '').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1 }}>
        {loaded?.C ? (
          <PluginErrorBoundary key={rec!.hash + rec!.updatedAt}>
            <loaded.C />
          </PluginErrorBoundary>
        ) : (
          <View style={styles.err}>
            <Text style={styles.errTitle}>Could not start this plugin.</Text>
            <Text style={styles.errMsg}>{loaded?.error?.message ?? 'Plugin not found.'}</Text>
            <Pressable style={styles.btn} onPress={() => setLoadErr(n => n + 1)}>
              <Text style={styles.btnText}>Reload</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.footer}>
        <Dot size={6} />
        <Text style={styles.footText}>
          Live from your Mac · edited {rec ? ago(rec.updatedAt, now) : '—'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  bar: { flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 20 },
  back: { flex: 1 },
  backText: { color: colors.muted, fontSize: 16 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 1.2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  footText: { color: colors.muted, fontSize: 12 },
  err: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errTitle: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  errMsg: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 10 },
  btn: { marginTop: 24, height: 44, paddingHorizontal: 28, borderRadius: 22, borderWidth: 1, borderColor: colors.hairline, justifyContent: 'center' },
  btnText: { color: colors.text, fontWeight: '600' },
});
