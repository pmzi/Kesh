import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { buildPlugin, VersionStore } from '../src/builder';
import { tmp, writePlugin, GOOD } from './helpers';

describe('builder', () => {
  it('builds a valid plugin', async () => {
    const d = tmp();
    writePlugin(path.join(d, 'plugins'), 'water-tracker');
    const r = await buildPlugin(path.join(d, 'plugins'), 'water-tracker', new VersionStore(path.join(d, 'v.json')));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.manifest.version).toBe(1);
      expect(r.payload.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.payload.bundle).toContain('require("react")');
    }
  });

  it('lowers block scoping so loop closures get per-iteration bindings (Hermes)', async () => {
    const d = tmp();
    const src = `import React from 'react';\nimport { Text } from 'react-native';\nexport default function P() { const hs = []; for (let i = 0; i < 3; i++) { const n = i; hs.push(() => n); } return <Text>{hs.length}</Text>; }\n`;
    writePlugin(path.join(d, 'plugins'), 'loopy', src);
    const r = await buildPlugin(path.join(d, 'plugins'), 'loopy', new VersionStore(path.join(d, 'v.json')));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.bundle).toContain('_loop');
  });

  it('syntax error returns error', async () => {
    const d = tmp();
    writePlugin(path.join(d, 'plugins'), 'a', 'export default function( {');
    const r = await buildPlugin(path.join(d, 'plugins'), 'a', new VersionStore(path.join(d, 'v.json')));
    expect(r.ok).toBe(false);
  });

  it('validates manifest', async () => {
    const d = tmp();
    const p = path.join(d, 'plugins');
    const vs = new VersionStore(path.join(d, 'v.json'));
    writePlugin(p, 'a', GOOD, { permissions: ['camera'] });
    expect((await buildPlugin(p, 'a', vs)).ok).toBe(false);
    writePlugin(p, 'b', GOOD, { id: 'other' });
    expect((await buildPlugin(p, 'b', vs)).ok).toBe(false);
    writePlugin(p, 'Bad_Id', GOOD);
    expect((await buildPlugin(p, 'Bad_Id', vs)).ok).toBe(false);
    writePlugin(p, 'ok-one', GOOD, { permissions: ['haptics', 'storage'] });
    expect((await buildPlugin(p, 'ok-one', vs)).ok).toBe(true);
  });

  it('bumps version only when hash changes, persisted', async () => {
    const d = tmp();
    const p = path.join(d, 'plugins');
    const vf = path.join(d, 'v.json');
    writePlugin(p, 'a');
    const v = async () => {
      const r = await buildPlugin(p, 'a', new VersionStore(vf));
      if (!r.ok) throw new Error(r.error);
      return r.payload.manifest.version;
    };
    expect(await v()).toBe(1);
    expect(await v()).toBe(1);
    fs.writeFileSync(path.join(p, 'a/index.tsx'), GOOD + '\n// x\nexport const y = 2;');
    expect(await v()).toBe(2);
    expect(await v()).toBe(2);
  });
});
