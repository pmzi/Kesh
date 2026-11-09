import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Permission, PluginPayload } from '../protocol';
import { KeshClient, type ConnStatus, parsePairUrl } from '../net/client';
import { setAiRemote } from '../sdk/ai';
import { classify, PluginStore, rnFs, type InstalledPlugin } from '../plugins/store';

interface Ctx {
  status: ConnStatus;
  statusDetail?: string;
  macName?: string;
  paired: boolean;
  plugins: InstalledPlugin[];
  pending: PluginPayload[];
  hotAt: Record<string, number>;
  ready: boolean;
  pairWithUrl(url: string): string | null;
  install(p: PluginPayload, granted: Permission[]): Promise<void>;
  decline(p: PluginPayload): void;
  remove(id: string): Promise<void>;
  offerLocal(p: PluginPayload): void;
  log(id: string, level: 'info' | 'warn' | 'error', message: string): void;
  disconnect(): Promise<void>;
}

const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setDetail] = useState<string>();
  const [macName, setMac] = useState<string>();
  const [paired, setPaired] = useState(false);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pending, setPending] = useState<PluginPayload[]>([]);
  const [hotAt, setHot] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  const store = useMemo(() => {
    const { fs, root } = rnFs();
    return new PluginStore(fs, root);
  }, []);
  const installedRef = useRef<Map<string, InstalledPlugin>>(new Map());
  const declined = useRef<Set<string>>(new Set());
  const clientRef = useRef<KeshClient>(null as any);

  const publish = useCallback(() => {
    setPlugins([...installedRef.current.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)));
  }, []);

  const handlePush = useCallback(
    async (p: PluginPayload) => {
      const cur = installedRef.current.get(p.manifest.id);
      const d = classify(p, cur);
      if (d === 'noop') return;
      if (d === 'review') {
        if (declined.current.has(p.manifest.id + ':' + p.hash)) return;
        setPending(prev => [...prev.filter(x => x.manifest.id !== p.manifest.id), p]);
        return;
      }
      try {
        const rec = await store.update(p);
        installedRef.current.set(rec.manifest.id, rec);
        setHot(h => ({ ...h, [rec.manifest.id]: Date.now() }));
        publish();
        clientRef.current.send({ type: 'ack', id: p.manifest.id, version: p.manifest.version, status: 'installed' });
      } catch (e: any) {
        clientRef.current.send({ type: 'ack', id: p.manifest.id, version: p.manifest.version, status: 'error', error: String(e?.message ?? e) });
      }
    },
    [store, publish],
  );

  const handlePushRef = useRef(handlePush);
  handlePushRef.current = handlePush;

  useEffect(() => {
    let alive = true;
    const client = new KeshClient({
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d);
      },
      onReady: name => {
        setMac(name);
        setPaired(true);
      },
      onSnapshot: ps => ps.forEach(p => handlePushRef.current(p)),
      onPlugin: p => handlePushRef.current(p),
      onRemoved: async id => {
        installedRef.current.delete(id);
        setPending(prev => prev.filter(x => x.manifest.id !== id));
        await store.remove(id).catch(() => {});
        publish();
      },
    });
    clientRef.current = client;
    setAiRemote({
      claudeAvailable: () => client.claudeAvailable(),
      connected: () => client.isConnected(),
      request: (id, req) => client.requestAi(id, req),
    });
    (async () => {
      try {
        for (const r of await store.list()) installedRef.current.set(r.manifest.id, r);
      } catch {}
      if (!alive) return;
      publish();
      const p = await client.resume();
      setPaired(p);
      setReady(true);
    })();
    return () => {
      alive = false;
      setAiRemote(undefined);
      client.stop();
    };
  }, [store, publish]);

  const value: Ctx = {
    status,
    statusDetail,
    macName,
    paired,
    plugins,
    pending,
    hotAt,
    ready,
    pairWithUrl: url => {
      const info = parsePairUrl(url);
      if (!info) return 'That does not look like a kesh://pair link.';
      clientRef.current.pair(info);
      setPaired(true);
      return null;
    },
    install: async (p, granted) => {
      try {
        const rec = await store.save(p, granted);
        installedRef.current.set(rec.manifest.id, rec);
        publish();
        setPending(prev => prev.filter(x => x.manifest.id !== p.manifest.id));
        clientRef.current.send({ type: 'ack', id: p.manifest.id, version: p.manifest.version, status: 'installed' });
      } catch (e: any) {
        clientRef.current.send({ type: 'ack', id: p.manifest.id, version: p.manifest.version, status: 'error', error: String(e?.message ?? e) });
        throw e;
      }
    },
    decline: p => {
      declined.current.add(p.manifest.id + ':' + p.hash);
      setPending(prev => prev.filter(x => x.manifest.id !== p.manifest.id));
      clientRef.current.send({ type: 'ack', id: p.manifest.id, version: p.manifest.version, status: 'declined' });
    },
    remove: async id => {
      installedRef.current.delete(id);
      await store.remove(id);
      publish();
    },
    offerLocal: p => setPending(prev => [...prev.filter(x => x.manifest.id !== p.manifest.id), p]),
    log: (id, level, message) => clientRef.current?.send({ type: 'log', id, level, message }),
    disconnect: async () => {
      await clientRef.current.forget();
      setPaired(false);
      setMac(undefined);
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
