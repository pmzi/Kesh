import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { createCompanion } from '../src/companion';
import { PROTOCOL_VERSION } from '../../protocol/src/index';
import { tmp, writePlugin, GOOD } from './helpers';

type Msg = { type: string; [k: string]: any };
function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs: Msg[] = [];
  const waiters: Array<{ pred: (m: Msg) => boolean; res: (m: Msg) => void }> = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const i = waiters.findIndex((w) => w.pred(m));
    if (i >= 0) waiters.splice(i, 1)[0]!.res(m);
    else msgs.push(m);
  });
  const next = (type: string, ms = 5000) =>
    new Promise<Msg>((res, rej) => {
      const i = msgs.findIndex((m) => m.type === type);
      if (i >= 0) return res(msgs.splice(i, 1)[0]!);
      const t = setTimeout(() => rej(new Error('timeout waiting for ' + type)), ms);
      waiters.push({ pred: (m) => m.type === type, res: (m) => (clearTimeout(t), res(m)) });
    });
  const closed = new Promise<void>((r) => ws.on('close', () => r()));
  const open = new Promise<void>((r) => ws.on('open', () => r()));
  return { ws, next, closed, open, send: (m: object) => ws.send(JSON.stringify(m)) };
}

let current: ReturnType<typeof createCompanion> | undefined;
afterEach(async () => {
  await current?.stop();
  current = undefined;
});

async function setup() {
  const ws = tmp();
  const cfg = tmp();
  writePlugin(path.join(ws, 'plugins'), 'water-tracker');
  const c = createCompanion({ workspace: ws, configDir: cfg, bonjour: false, allowAnyPeer: true, debounceMs: 50 });
  current = c;
  const info = await c.start();
  return { c, info, ws, cfg };
}

describe('companion integration', () => {
  it('pairs, snapshots, pushes on change, removes', async () => {
    const { c, info, ws } = await setup();
    const a = client(info.port);
    await a.open;
    a.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'Phone', token: info.token });
    const ready = await a.next('ready');
    expect(ready.deviceKey).toMatch(/^[0-9a-f]{64}$/);
    const snap = await a.next('snapshot');
    expect(snap.plugins.length).toBeGreaterThanOrEqual(1);
    expect(snap.plugins.some((p: any) => p.manifest.id === 'water-tracker')).toBe(true);

    fs.writeFileSync(path.join(ws, 'plugins/water-tracker/index.tsx'), GOOD.replace('hi', 'changed'));
    const pm = await a.next('plugin');
    expect(pm.plugin.manifest.version).toBe(2);

    const mod: { exports: any } = { exports: {} };
    const reqs: Record<string, unknown> = { react: { createElement: () => null }, 'react-native': { View: 'View', Text: 'Text' }, '@kesh/sdk': {} };
    new Function('module', 'exports', 'require', pm.plugin.bundle)(mod, mod.exports, (n: string) => {
      if (!(n in reqs)) throw new Error('unexpected require ' + n);
      return reqs[n];
    });
    expect(typeof mod.exports.default).toBe('function');
    expect(mod.exports.default()).toBeNull();

    // broken edit keeps last good, no push
    fs.writeFileSync(path.join(ws, 'plugins/water-tracker/index.tsx'), 'export default function( {');
    const err = await new Promise<string>((r) => c.once('build-error', (_id, e) => r(e)));
    expect(err.length).toBeGreaterThan(0);
    expect(c.plugins.get('water-tracker')!.manifest.version).toBe(2);

    // new plugin
    writePlugin(path.join(ws, 'plugins'), 'other');
    expect((await a.next('plugin')).plugin.manifest.id).toBe('other');

    fs.rmSync(path.join(ws, 'plugins/other'), { recursive: true });
    expect((await a.next('plugin-removed')).id).toBe('other');

    // events from phone
    const logP = new Promise((r) => c.once('log', r));
    a.send({ type: 'log', id: 'water-tracker', level: 'info', message: 'hey' });
    expect(((await logP) as any).message).toBe('hey');
    a.send({ type: 'bogus' }); // ignored, connection stays
    a.send({ type: 'log', id: 'x', level: 'info', message: 'still-alive' });
    expect(((await new Promise((r) => c.once('log', r))) as any).message).toBe('still-alive');
    a.ws.close();
  });

  it('token single use, deviceKey reconnect, rejects bad creds', async () => {
    const { info } = await setup();
    const a = client(info.port);
    await a.open;
    a.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'P', token: info.token });
    const key = (await a.next('ready')).deviceKey as string;
    a.ws.close();
    await a.closed;

    const b = client(info.port);
    await b.open;
    b.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'P2', token: info.token });
    expect((await b.next('error')).code).toBe('bad_token');
    await b.closed;

    const c2 = client(info.port);
    await c2.open;
    c2.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'P', deviceKey: key });
    const r = await c2.next('ready');
    expect(r.deviceKey).toBeUndefined();
    expect((await c2.next('snapshot')).plugins.length).toBeGreaterThanOrEqual(1);
    c2.ws.close();

    const d = client(info.port);
    await d.open;
    d.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'P', deviceKey: 'bad' });
    expect((await d.next('error')).code).toBe('bad_device_key');
    await d.closed;

    const e = client(info.port);
    await e.open;
    e.send({ type: 'log', id: 'a', level: 'info', message: 'x' });
    expect((await e.next('error')).code).toBe('bad_message');
    await e.closed;
  });

  it('carries icon in snapshot and plugin messages; warns on bad icon', async () => {
    const ws = tmp();
    const svg = '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="#0af"/></svg>';
    writePlugin(path.join(ws, 'plugins'), 'iconic');
    fs.writeFileSync(path.join(ws, 'plugins/iconic/icon.svg'), svg);
    const c = createCompanion({ workspace: ws, configDir: tmp(), bonjour: false, allowAnyPeer: true, debounceMs: 50 });
    current = c;
    const warnings: string[] = [];
    c.on('icon-warning', (id, r) => warnings.push(`${id}: ${r}`));
    const info = await c.start();
    const a = client(info.port);
    await a.open;
    a.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'Phone', token: info.token });
    await a.next('ready');
    const snap = await a.next('snapshot');
    const p = snap.plugins.find((x: any) => x.manifest.id === 'iconic');
    expect(p.icon).toContain('<circle');
    expect(p.icon).toContain('xmlns=');
    expect(p.manifest.version).toBe(1);

    // icon-only change pushes
    fs.writeFileSync(path.join(ws, 'plugins/iconic/icon.svg'), svg.replace('#0af', '#f50'));
    const pm = await a.next('plugin');
    expect(pm.plugin.icon).toContain('#f50');
    expect(pm.plugin.manifest.version).toBe(2);

    // bad icon: pushes without icon, warns once
    fs.writeFileSync(path.join(ws, 'plugins/iconic/icon.svg'), '<svg><script>x</script></svg>');
    const pm2 = await a.next('plugin');
    expect(pm2.plugin.icon).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/iconic: icon\.svg ignored: .*script/);

    // removal
    fs.rmSync(path.join(ws, 'plugins/iconic/icon.svg'));
    await c.idle();
    expect(c.plugins.get('iconic')!.icon).toBeUndefined();
  });
});
