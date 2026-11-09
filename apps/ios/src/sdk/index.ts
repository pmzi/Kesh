import React from 'react';
import type { Permission, PluginManifest } from '../protocol';
import { theme } from '../theme';
import { createAi } from './ai';

type Impact = 'light' | 'medium' | 'heavy';
type Notif = 'success' | 'warning' | 'error';

/** Native backends, injectable so the permission gate is unit-testable. */
export interface Backends {
  haptic(type: string): void;
  storageGet(key: string): Promise<string | null>;
  storageSet(key: string, value: string): Promise<void>;
  storageRemove(key: string): Promise<void>;
  clipGet(): Promise<string>;
  clipSet(s: string): void;
}

export function defaultBackends(): Backends {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const haptics = require('react-native-haptic-feedback');
  const AsyncStorage = (
    require('@react-native-async-storage/async-storage').default ??
    require('@react-native-async-storage/async-storage')
  );
  const Clipboard = require('@react-native-clipboard/clipboard').default;
  const trigger = haptics.default?.trigger ?? haptics.trigger;
  return {
    haptic: t => trigger(t, { enableVibrateFallback: true }),
    storageGet: k => AsyncStorage.getItem(k),
    storageSet: (k, v) => AsyncStorage.setItem(k, v),
    storageRemove: k => AsyncStorage.removeItem(k),
    clipGet: () => Clipboard.getString(),
    clipSet: s => Clipboard.setString(s),
  };
}

export const PluginInfoContext = React.createContext<{ id: string; name: string }>({
  id: '',
  name: '',
});

export function createSdk(
  manifest: Pick<PluginManifest, 'id' | 'name' | 'permissions'>,
  backends?: Backends,
) {
  let b = backends;
  const be = () => (b ??= defaultBackends());
  const need = (p: Permission) => {
    if (!manifest.permissions.includes(p)) {
      throw new Error(`Permission "${p}" not granted`);
    }
  };
  const ns = (key: string) => `kesh:plugin:${manifest.id}:${key}`;

  return {
    haptics: {
      impact(style: Impact = 'medium'): void {
        need('haptics');
        be().haptic(`impact${style[0].toUpperCase()}${style.slice(1)}`);
      },
      notification(type: Notif): void {
        need('haptics');
        be().haptic(`notification${type[0].toUpperCase()}${type.slice(1)}`);
      },
      selection(): void {
        need('haptics');
        be().haptic('selection');
      },
    },
    storage: {
      async get(key: string): Promise<string | null> {
        need('storage');
        return be().storageGet(ns(key));
      },
      async set(key: string, value: string): Promise<void> {
        need('storage');
        await be().storageSet(ns(key), value);
      },
      async remove(key: string): Promise<void> {
        need('storage');
        await be().storageRemove(ns(key));
      },
    },
    clipboard: {
      async getString(): Promise<string> {
        need('clipboard');
        return be().clipGet();
      },
      setString(s: string): void {
        need('clipboard');
        be().clipSet(s);
      },
    },
    notifications: {
      async schedule(_opts: { title: string; body: string; seconds: number }): Promise<void> {
        need('notifications');
        throw new Error('notifications not implemented yet');
      },
    },
    ai: createAi(manifest.id, () => need('ai')),
    usePluginInfo(): { id: string; name: string } {
      return React.useContext(PluginInfoContext);
    },
    theme,
  };
}
