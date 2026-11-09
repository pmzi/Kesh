import { classify, PluginStore, type Fs } from '../src/plugins/store';
import type { PluginPayload } from '../src/protocol';

function memFs(): Fs {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    mkdir: async p => {
      dirs.add('/r');
      dirs.add(p);
    },
    exists: async p => files.has(p) || dirs.has(p),
    readFile: async p => files.get(p)!,
    writeFile: async (p, d) => void files.set(p, d),
    unlink: async p => void (files.delete(p), dirs.delete(p)),
    readDir: async p => {
      if (p === '/r') return [...dirs].filter(d => d !== '/r').map(d => ({ name: d.slice(3), isDirectory: () => true }));
      const names = [...dirs].filter(d => d.startsWith(p + '/')).map(d => d.slice(p.length + 1));
      return names.map(name => ({ name, isDirectory: () => true }));
    },
  };
}
const pl = (perms: any[], hash = 'h1', version = 1, name = 'W'): PluginPayload => ({
  manifest: { id: 'w', name, version, description: 'd', permissions: perms },
  bundle: 'b' + hash,
  hash,
});

test('classify', async () => {
  const s = new PluginStore(memFs(), '/r');
  expect(classify(pl(['storage']), undefined)).toBe('review');
  const rec = await s.save(pl(['storage', 'haptics']), ['storage', 'haptics']);
  expect(classify(pl(['storage', 'haptics']), rec)).toBe('noop');
  expect(classify(pl(['storage'], 'h2', 2), rec)).toBe('update');
  expect(classify(pl(['storage', 'haptics'], 'h1', 1, 'Renamed'), rec)).toBe('update');
  // same version + same hash, but a new permission -> must re-review
  expect(classify(pl(['storage', 'haptics', 'clipboard']), rec)).toBe('review');
});

test('save keeps previous, update keeps grants, remove deletes', async () => {
  const s = new PluginStore(memFs(), '/r');
  await s.save(pl(['storage', 'haptics']), ['storage']);
  const upd = await s.update(pl(['storage', 'haptics'], 'h2', 2));
  expect(upd.granted).toEqual(['storage']);
  expect((await s.getPrevious('w'))!.hash).toBe('h1');
  expect((await s.get('w'))!.hash).toBe('h2');
  expect((await s.list()).map(p => p.manifest.id)).toEqual(['w']);
  await s.remove('w');
  expect(await s.get('w')).toBeUndefined();
});

test('rejects bad id', async () => {
  const s = new PluginStore(memFs(), '/r');
  const p = pl([]);
  p.manifest.id = '../x';
  await expect(s.save(p, [])).rejects.toThrow();
});
