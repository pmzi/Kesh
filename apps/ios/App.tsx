import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/state/AppState';
import { colors } from './src/theme';
import ConnectionSheet from './src/screens/ConnectionSheet';
import { launchRoute, sheetForUrl, type SheetState } from './src/state/connection';
import HomeScreen from './src/screens/HomeScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import RunScreen from './src/screens/RunScreen';

type Route = { name: 'home' } | { name: 'run'; id: string };

function Root() {
  const app = useApp();
  const [route, setRoute] = useState<Route>(launchRoute(app));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (app.pending.length === 0) setReviewing(false);
    else if (route.name !== 'run') setSheet(null);
  }, [app.pending.length, route.name]);
  // Dev-only remote control so the simulator can be driven without UI automation.
  const devLink = (url: string) => {
    const [path, qs = ''] = url.slice('kesh://dev/'.length).split('?');
    const q = Object.fromEntries(qs.split('&').filter(Boolean).map(kv => { const [k, ...v] = kv.split('='); return [k, decodeURIComponent(v.join('='))]; }));
    if (path === 'manual') setSheet({ page: 'pair', code: q.code });
    else if (path === 'open') setRoute({ name: 'run', id: q.id });
    else if (path === 'home') setRoute({ name: 'home' });
    else if (path === 'sheet') setSheet({ page: 'status' });
    else if (path === 'sample') app.offerLocal(require('./src/plugins/fixture').FIXTURE);
    else if (path === 'ai-sample') app.offerLocal(require('./src/plugins/fixture').AI_FIXTURE);
    else if (path === 'install' && app.pending[0]) app.install(app.pending[0], app.pending[0].manifest.permissions);
    else if (path === 'decline' && app.pending[0]) app.decline(app.pending[0]);
  };
  const devLinkRef = React.useRef(devLink);
  devLinkRef.current = devLink;
  useEffect(() => {
    const h = (url: string | null | undefined) => {
      if (!url) return;
      if (__DEV__ && url.startsWith('kesh://dev/')) return devLinkRef.current(url);
      const s = sheetForUrl(url);
      if (s) {
        setRoute({ name: 'home' });
        setSheet(s);
      }
    };
    const sub = Linking.addEventListener('url', e => h(e.url));
    if (app.ready) Linking.getInitialURL().then(h);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.ready]);
  // Dev-only: poll Documents/dev-command.txt (one kesh://dev/... line) written from the Mac.
  useEffect(() => {
    if (!__DEV__) return;
    const RNFS = require('react-native-fs');
    const f = `${RNFS.DocumentDirectoryPath}/dev-command.txt`;
    const t = setInterval(async () => {
      try {
        if (!(await RNFS.exists(f))) return;
        const cmd = (await RNFS.readFile(f, 'utf8')).trim();
        await RNFS.unlink(f);
        if (cmd) devLinkRef.current(cmd);
      } catch {}
    }, 500);
    return () => clearInterval(t);
  }, []);
  if (!app.ready) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;

  const pending = app.pending[0];
  const running = route.name === 'run';
  // A new plugin takes over the screen only from Home; while one is running it is a small banner.
  if (pending && (!running || reviewing)) {
    return <ReviewScreen key={pending.manifest.id + pending.hash} plugin={pending} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {route.name === 'run' ? (
        <RunScreen id={route.id} onBack={() => setRoute({ name: 'home' })} />
      ) : (
        <HomeScreen onOpen={id => setRoute({ name: 'run', id })} onConnection={() => setSheet({ page: 'status' })} />
      )}
      {pending && running ? (
        <Pressable
          onPress={() => setReviewing(true)}
          accessibilityRole="button"
          accessibilityLabel={`New plugin from your Mac: ${pending.manifest.name}. Review`}
          style={[styles.banner, { top: insets.top + 4 }]}>
          <Text style={styles.bannerText} numberOfLines={1}>
            New plugin from your Mac: {pending.manifest.name} · <Text style={styles.bannerAction}>Review</Text>
          </Text>
        </Pressable>
      ) : null}
      <ConnectionSheet sheet={sheet} onClose={() => setSheet(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  bannerText: { color: colors.accentText, fontSize: 14, fontWeight: '500' },
  bannerAction: { fontWeight: '700' },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
