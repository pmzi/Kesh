import { createSdk, type Backends } from '../src/sdk';

const mk = (): Backends & { calls: string[]; kv: Record<string, string> } => {
  const kv: Record<string, string> = {};
  const calls: string[] = [];
  return {
    calls,
    kv,
    haptic: t => void calls.push(t),
    storageGet: async k => kv[k] ?? null,
    storageSet: async (k, v) => void (kv[k] = v),
    storageRemove: async k => void delete kv[k],
    clipGet: async () => 'clip',
    clipSet: s => void calls.push('clip:' + s),
  };
};
const man = (permissions: any[]) => ({ id: 'p1', name: 'P', permissions });

test('denies without permission', async () => {
  const sdk = createSdk(man([]), mk());
  expect(() => sdk.haptics.impact()).toThrow('Permission "haptics" not granted');
  expect(() => sdk.haptics.selection()).toThrow('Permission "haptics" not granted');
  expect(() => sdk.clipboard.setString('x')).toThrow('Permission "clipboard" not granted');
  await expect(sdk.storage.get('a')).rejects.toThrow('Permission "storage" not granted');
  await expect(sdk.clipboard.getString()).rejects.toThrow('Permission "clipboard" not granted');
  await expect(sdk.notifications.schedule({ title: 'a', body: 'b', seconds: 1 })).rejects.toThrow(
    'Permission "notifications" not granted',
  );
});

test('allows with permission, maps haptic styles', () => {
  const b = mk();
  const sdk = createSdk(man(['haptics']), b);
  sdk.haptics.impact('light');
  sdk.haptics.impact();
  sdk.haptics.notification('success');
  sdk.haptics.selection();
  expect(b.calls).toEqual(['impactLight', 'impactMedium', 'notificationSuccess', 'selection']);
});

test('storage namespaced per plugin', async () => {
  const b = mk();
  await createSdk({ ...man(['storage']), id: 'a' }, b).storage.set('k', '1');
  await createSdk({ ...man(['storage']), id: 'b' }, b).storage.set('k', '2');
  expect(Object.keys(b.kv).sort()).toEqual(['kesh:plugin:a:k', 'kesh:plugin:b:k']);
  expect(await createSdk({ ...man(['storage']), id: 'a' }, b).storage.get('k')).toBe('1');
  await createSdk({ ...man(['storage']), id: 'a' }, b).storage.remove('k');
  expect(b.kv['kesh:plugin:a:k']).toBeUndefined();
});

test('notifications stub throws when granted', async () => {
  const sdk = createSdk(man(['notifications']), mk());
  await expect(sdk.notifications.schedule({ title: 'a', body: 'b', seconds: 1 })).rejects.toThrow(
    'notifications not implemented yet',
  );
});

import { patchBundle } from '../src/plugins/host';
test('patchBundle fixes esbuild getter capture', () => {
  expect(patchBundle('x get: () => from[key] y')).toContain('((k) => () => from[k])(key)');
});

test('theme exposes light cobalt tokens', () => {
  const { theme } = createSdk(man([]), mk());
  expect(theme.colors).toMatchObject({
    ground: '#FFFFFF', surface: '#F5F5F5', hairline: '#E6E6E6', text: '#111111',
    muted: '#6B6B6B', accent: '#2B59FF', accentText: '#FFFFFF', brass: '#2B59FF',
  });
  expect(theme.fonts.mono).toBe('Menlo');
});
