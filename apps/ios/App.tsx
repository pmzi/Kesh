import React, { useEffect, useState } from 'react';
import { Linking, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/state/AppState';
import { colors } from './src/theme';
import PairScreen from './src/screens/PairScreen';
import HomeScreen from './src/screens/HomeScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import RunScreen from './src/screens/RunScreen';

type Route = { name: 'home' } | { name: 'pair'; code?: string } | { name: 'run'; id: string };

function Root() {
  const app = useApp();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    if (app.paired && route.name === 'pair') setRoute({ name: 'home' });
  }, [app.paired, route.name]);
  // Dev-only remote control so the simulator can be driven without UI automation.
  const devLink = (url: string) => {
    const [path, qs = ''] = url.slice('kesh://dev/'.length).split('?');
    const q = Object.fromEntries(qs.split('&').filter(Boolean).map(kv => { const [k, ...v] = kv.split('='); return [k, decodeURIComponent(v.join('='))]; }));
    if (path === 'manual') setRoute({ name: 'pair', code: q.code });
    else if (path === 'open') setRoute({ name: 'run', id: q.id });
    else if (path === 'home') setRoute({ name: 'home' });
    else if (path === 'skip') { setSkipped(true); setRoute({ name: 'home' }); }
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
      app.pairWithUrl(url);
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

  if (app.pending.length > 0) return <ReviewScreen key={app.pending[0].manifest.id + app.pending[0].hash} plugin={app.pending[0]} />;
  if ((!app.paired && !skipped) || route.name === 'pair') {
    return <PairScreen initialCode={route.name === 'pair' ? route.code : undefined} onSkip={() => { setSkipped(true); setRoute({ name: 'home' }); }} />;
  }
  if (route.name === 'run') return <RunScreen id={route.id} onBack={() => setRoute({ name: 'home' })} />;
  return <HomeScreen onOpen={id => setRoute({ name: 'run', id })} onPair={() => setRoute({ name: 'pair' })} />;
}

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
