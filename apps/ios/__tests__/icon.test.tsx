import React from 'react';
import renderer, { act } from 'react-test-renderer';
import PluginIcon from '../src/components/PluginIcon';
import { classify, PluginStore, type Fs } from '../src/plugins/store';
import type { PluginPayload } from '../src/protocol';
import { KeshClient } from '../src/net/client';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock('react-native-svg', () => {
  const R = require('react');
  return {
    SvgXml: ({ xml }: { xml: string }) => {
      if (xml.includes('BOOM')) throw new Error('bad svg');
      return R.createElement('SvgXml', { xml });
    },
  };
});

function memFs(): Fs {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  return {
    mkdir: async p => void (dirs.add('/r'), dirs.add(p)),
    exists: async p => files.has(p) || dirs.has(p),
    readFile: async p => files.get(p)!,
    writeFile: async (p, d) => void files.set(p, d),
    unlink: async p => void (files.delete(p), dirs.delete(p)),
    readDir: async () => [{ name: 'w', isDirectory: () => true }],
  };
}
const SVG = '<svg viewBox="0 0 120 120"><rect width="120" height="120"/></svg>';
const pl = (hash: string, icon?: string): PluginPayload => ({
  manifest: { id: 'w', name: 'Water', version: 1, description: 'd', permissions: ['storage'] },
  bundle: 'b',
  icon,
  hash,
});

test('store persists icon', async () => {
  const s = new PluginStore(memFs(), '/r');
  await s.save(pl('h1', SVG), ['storage']);
  expect((await s.get('w'))!.icon).toBe(SVG);
});

test('old record without icon loads', async () => {
  const fs = memFs();
  await fs.mkdir('/r/w');
  await fs.writeFile(
    '/r/w/current.json',
    JSON.stringify({ manifest: pl('h1').manifest, granted: [], bundle: 'b', hash: 'h1', installedAt: 1, updatedAt: 1 }),
  );
  const rec = await new PluginStore(fs, '/r').get('w');
  expect(rec!.icon).toBeUndefined();
  expect(rec!.hash).toBe('h1');
});

test('icon-only change is a silent update, keeps grants', async () => {
  const s = new PluginStore(memFs(), '/r');
  const rec = await s.save(pl('h1'), ['storage']);
  expect(classify(pl('h2', SVG), rec)).toBe('update');
  const upd = await s.update(pl('h2', SVG));
  expect(upd.icon).toBe(SVG);
  expect(upd.granted).toEqual(['storage']);
  expect(classify(pl('h2', SVG), upd)).toBe('noop');
});

const text = (t: renderer.ReactTestRenderer) => JSON.stringify(t.toJSON());
test('PluginIcon renders svg, falls back on missing/empty/invalid', () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  let t!: renderer.ReactTestRenderer;
  act(() => void (t = renderer.create(<PluginIcon icon={SVG} name="water" size={48} />)));
  expect(text(t)).toContain('SvgXml');
  for (const icon of [undefined, '', '  ', '<svg>BOOM</svg>']) {
    act(() => void (t = renderer.create(<PluginIcon icon={icon} name="water" size={48} />)));
    expect(text(t)).not.toContain('SvgXml');
    expect(text(t)).toContain('"W"');
  }
  err.mockRestore();
});

test('snapshot and plugin messages carry icon to handlers', () => {
  class WS {
    static last: WS;
    readyState = 1;
    onmessage: any;
    constructor() {
      WS.last = this;
    }
    send() {}
    close() {}
  }
  (globalThis as any).WebSocket = WS;
  const got: any[] = [];
  const c = new KeshClient({
    onStatus: () => {},
    onReady: () => {},
    onSnapshot: ps => got.push(...ps),
    onPlugin: p => got.push(p),
    onRemoved: () => {},
  });
  c.pair({ host: '1.2.3.4', port: 1, token: 't' });
  WS.last.onmessage({ data: JSON.stringify({ type: 'snapshot', plugins: [pl('a', SVG)] }) });
  WS.last.onmessage({ data: JSON.stringify({ type: 'plugin', plugin: pl('b', SVG) }) });
  expect(got.map(p => p.icon)).toEqual([SVG, SVG]);
});
