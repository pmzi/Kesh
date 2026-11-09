import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { ClaudeRunner } from '../src/claude';
import { parseAiRequest } from '../src/messages';
import { createCompanion } from '../src/companion';
import { PROTOCOL_VERSION, type AiSchema } from '../../protocol/src/index';
import { tmp, writePlugin } from './helpers';

const dir = tmp();
let n = 0;
const savedBin = process.env.KESH_CLAUDE_BIN;
beforeEach(() => {
  delete process.env.KESH_CLAUDE_BIN;
});
afterEach(() => {
  if (savedBin === undefined) delete process.env.KESH_CLAUDE_BIN;
  else process.env.KESH_CLAUDE_BIN = savedBin;
});

/** Fake claude: `body` runs with argv, stdin, cwd and helper out(text|obj). Records a call log. */
function fake(body: string): string {
  const f = path.join(dir, `fake-${n++}.js`);
  const log = f + '.log';
  fs.writeFileSync(
    f,
    `#!/usr/bin/env node
const fs = require('fs');
const argv = process.argv.slice(2);
if (argv[0] === '--version') { console.log('9.9.9 (fake)'); process.exit(0); }
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', async () => {
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv, stdin, cwd: process.cwd(), env: Object.keys(process.env) }) + '\\n');
  const out = (r, extra) => console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: r, ...extra }));
  const calls = fs.readFileSync(${JSON.stringify(log)}, 'utf8').trim().split('\\n').length;
  ${body}
});
`,
    { mode: 0o755 },
  );
  return f;
}
const calls = (f: string) =>
  fs.existsSync(f + '.log')
    ? fs.readFileSync(f + '.log', 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { argv: string[]; stdin: string; cwd: string; env: string[] })
    : [];

const schema = { type: 'object', properties: { word: { type: 'string' }, tags: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, required: ['word'] } as AiSchema;
const base = { model: 'haiku', prompt: 'SECRET-PROMPT hello' };

describe('claude runner', () => {
  it('text success; prompt via stdin not argv; cwd is a temp dir; env minimal; tools disabled', async () => {
    const f = fake(`out('ok')`);
    const r = new ClaudeRunner({ bin: f });
    expect(await r.available()).toBe(true);
    expect(await r.run({ ...base, system: 'be nice' })).toEqual({ ok: true, result: 'ok' });
    const c = calls(f)[0]!;
    expect(c.stdin).toBe('SECRET-PROMPT hello');
    expect(c.argv.join(' ')).not.toContain('SECRET-PROMPT');
    expect(c.argv).toContain('-p');
    expect(c.argv[c.argv.indexOf('--model') + 1]).toBe('haiku');
    expect(c.argv[c.argv.indexOf('--tools') + 1]).toBe('');
    expect(c.argv[c.argv.indexOf('--system-prompt') + 1]).toBe('be nice');
    expect(c.argv).toContain('--no-session-persistence');
    expect(path.basename(c.cwd)).toMatch(/^kesh-claude-/);
    expect(c.cwd).not.toContain(process.cwd());
    expect(fs.existsSync(c.cwd)).toBe(false); // cleaned up
    expect(c.env.every((k) => ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'CLAUDE_CONFIG_DIR', 'PWD', 'SHLVL', '_', 'OLDPWD', '__CF_USER_TEXT_ENCODING'].includes(k))).toBe(true);
  });

  it('cwd is not the workspace', async () => {
    const ws = tmp();
    const f = fake(`out('ok')`);
    const prev = process.cwd();
    process.chdir(ws);
    try {
      await new ClaudeRunner({ bin: f }).run(base);
    } finally {
      process.chdir(prev);
    }
    expect(path.basename(calls(f)[0]!.cwd)).toMatch(/^kesh-claude-/);
    expect(calls(f)[0]!.cwd.startsWith(fs.realpathSync(ws))).toBe(false);
  });

  it('schema: structured output and JSON in prose, arrays clamped', async () => {
    const f1 = fake(`out('', { structured_output: { word: 'a', tags: ['x', 'y', 'z'], extra: 1 } })`);
    expect(await new ClaudeRunner({ bin: f1 }).run({ ...base, schema })).toEqual({ ok: true, result: { word: 'a', tags: ['x', 'y'] } });
    expect(calls(f1)[0]!.argv).toContain('--json-schema');
    const prose = 'Sure! Here {you} go:\n```json\n{"word":"b \\"}\\" q","tags":["t"]}\n``` hope it helps';
    const f2 = fake(`out(${JSON.stringify(prose)})`);
    expect(await new ClaudeRunner({ bin: f2 }).run({ ...base, schema })).toEqual({ ok: true, result: { word: 'b "}" q', tags: ['t'] } });
  });

  it('invalid JSON retried once then fails; retry can succeed', async () => {
    const bad = fake(`out('no json here')`);
    const r = await new ClaudeRunner({ bin: bad }).run({ ...base, schema });
    expect(r.ok).toBe(false);
    expect(calls(bad)).toHaveLength(2);
    const flaky = fake(`calls === 1 ? out('{"nope":1}') : out('{"word":"w"}')`);
    expect(await new ClaudeRunner({ bin: flaky }).run({ ...base, schema })).toEqual({ ok: true, result: { word: 'w' } });
  });

  it('timeout kills the child', async () => {
    const pidFile = path.join(dir, 'pid' + n);
    const f = fake(`fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setTimeout(() => {}, 60000)`);
    const t = Date.now();
    const r = await new ClaudeRunner({ bin: f, timeoutMs: 400 }).run(base);
    expect(r).toEqual({ ok: false, error: 'Timed out' });
    expect(Date.now() - t).toBeLessThan(5000);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((r) => setTimeout(r, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('concurrency limit queues; queue overflow rejected', async () => {
    const f = fake(`fs.appendFileSync(${JSON.stringify(path.join(dir, 'start' + n))}, Date.now() + '\\n'); await new Promise((r) => setTimeout(r, 300)); out('ok')`);
    const r = new ClaudeRunner({ bin: f, maxConcurrent: 2, maxQueue: 1 });
    const ps = [1, 2, 3, 4].map(() => r.run(base));
    const res = await Promise.all(ps);
    expect(res.filter((x) => x.ok)).toHaveLength(3);
    expect(res.filter((x) => !x.ok)).toHaveLength(1);
    const starts = fs.readFileSync(path.join(dir, 'start' + (n - 1)), 'utf8').trim().split('\n').map(Number);
    expect(starts).toHaveLength(3);
    expect(starts[2]! - starts[0]!).toBeGreaterThanOrEqual(250); // third waited for a slot
  });

  it('maps CLI failures', async () => {
    const login = fake(`console.error('Not logged in · Please run /login'); process.exit(1)`);
    expect(await new ClaudeRunner({ bin: login }).run(base)).toEqual({ ok: false, error: 'Not logged in: run claude and /login' });
    const rl = fake(`out('Claude usage limit reached', { is_error: true })`);
    const r = await new ClaudeRunner({ bin: rl }).run(base);
    expect(r.ok === false && r.error).toMatch(/rate limit.*usage limit/i);
  });

  it('rejects oversized response', async () => {
    const f = fake(`out('x'.repeat(300000))`);
    expect(await new ClaudeRunner({ bin: f }).run(base)).toEqual({ ok: false, error: 'Response too large' });
  });

  it('missing binary => unavailable + clear error', async () => {
    process.env.KESH_CLAUDE_BIN = path.join(dir, 'nope');
    const r = new ClaudeRunner();
    expect(await r.available()).toBe(false);
    expect(await r.run(base)).toEqual({ ok: false, error: 'Claude Code is not installed on this Mac' });
  });
});

describe('request validation', () => {
  it('rejects bad models, on-device, sizes, schemas', () => {
    expect(parseAiRequest({ model: 'on-device', prompt: 'x' }).ok).toBe(false);
    expect(parseAiRequest({ model: 'bad model;rm', prompt: 'x' }).ok).toBe(false);
    expect(parseAiRequest({ model: 'a'.repeat(65), prompt: 'x' }).ok).toBe(false);
    expect(parseAiRequest({ model: 'haiku', prompt: '' }).ok).toBe(false);
    expect(parseAiRequest({ model: 'haiku', prompt: 'x'.repeat(20001) }).ok).toBe(false);
    expect(parseAiRequest({ model: 'haiku', prompt: 'x', system: 'x'.repeat(8001) }).ok).toBe(false);
    const props = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`p${i}`, { type: 'string' }]));
    expect(parseAiRequest({ model: 'haiku', prompt: 'x', schema: { type: 'object', properties: props } }).ok).toBe(false);
    expect(parseAiRequest({ model: 'claude-sonnet-4.5[1m]', prompt: 'x', schema }).ok).toBe(true);
  });
});

type Msg = { type: string; [k: string]: any };
function client(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs: Msg[] = [];
  const waiters: Array<{ type: string; res: (m: Msg) => void }> = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const i = waiters.findIndex((w) => w.type === m.type);
    if (i >= 0) waiters.splice(i, 1)[0]!.res(m);
    else msgs.push(m);
  });
  const next = (type: string) =>
    new Promise<Msg>((res, rej) => {
      const i = msgs.findIndex((m) => m.type === type);
      if (i >= 0) return res(msgs.splice(i, 1)[0]!);
      const t = setTimeout(() => rej(new Error('timeout ' + type)), 8000);
      waiters.push({ type, res: (m) => (clearTimeout(t), res(m)) });
    });
  return { ws, next, open: new Promise<void>((r) => ws.on('open', () => r())), send: (m: object) => ws.send(JSON.stringify(m)) };
}

describe('companion ai over websocket', () => {
  let current: ReturnType<typeof createCompanion> | undefined;
  afterEach(async () => {
    await current?.stop();
    current = undefined;
  });

  it('serves ai-request, gates permission, logs without prompt', async () => {
    const f = fake(`out('pong')`);
    const ws = tmp();
    writePlugin(path.join(ws, 'plugins'), 'ai-plugin', undefined, { permissions: ['ai'] });
    writePlugin(path.join(ws, 'plugins'), 'plain-plugin');
    const c = createCompanion({ workspace: ws, configDir: tmp(), bonjour: false, allowAnyPeer: true, claudeBin: f });
    current = c;
    const lines: string[] = [];
    c.on('ai-done', (i) => lines.push(JSON.stringify(i)));
    const info = await c.start();
    const a = client(info.port);
    await a.open;
    a.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'Phone', token: info.token });
    expect((await a.next('ready')).claudeAvailable).toBe(true);

    a.send({ type: 'ai-request', requestId: 'r1', pluginId: 'ai-plugin', request: { model: 'haiku', prompt: 'SECRET-PROMPT' } });
    expect(await a.next('ai-response')).toMatchObject({ requestId: 'r1', ok: true, result: 'pong' });

    a.send({ type: 'ai-request', requestId: 'r2', pluginId: 'plain-plugin', request: { model: 'haiku', prompt: 'x' } });
    expect(await a.next('ai-response')).toMatchObject({ requestId: 'r2', ok: false, error: 'Plugin has no ai permission' });
    a.send({ type: 'ai-request', requestId: 'r3', pluginId: 'ghost', request: { model: 'haiku', prompt: 'x' } });
    expect(await a.next('ai-response')).toMatchObject({ requestId: 'r3', ok: false, error: 'Plugin has no ai permission' });
    a.send({ type: 'ai-request', requestId: 'r4', pluginId: 'ai-plugin', request: { model: 'on-device', prompt: 'x' } });
    expect(await a.next('ai-response')).toMatchObject({ requestId: 'r4', ok: false });
    a.send({ type: 'ai-request', requestId: 'r5', pluginId: 'ai-plugin', request: { model: 'bad model!', prompt: 'x' } });
    expect(await a.next('ai-response')).toMatchObject({ requestId: 'r5', ok: false });

    expect(calls(f)).toHaveLength(1);
    expect(lines.join('\n')).not.toContain('SECRET-PROMPT');
    expect(lines.join('\n')).not.toContain('pong');
    a.ws.close();
  });

  it('reports claudeAvailable false and clear error when binary missing', async () => {
    const ws = tmp();
    writePlugin(path.join(ws, 'plugins'), 'ai-plugin', undefined, { permissions: ['ai'] });
    const c = createCompanion({ workspace: ws, configDir: tmp(), bonjour: false, allowAnyPeer: true, claudeBin: path.join(dir, 'missing') });
    current = c;
    const info = await c.start();
    const a = client(info.port);
    await a.open;
    a.send({ type: 'hello', protocol: PROTOCOL_VERSION, deviceName: 'Phone', token: info.token });
    expect((await a.next('ready')).claudeAvailable).toBe(false);
    a.send({ type: 'ai-request', requestId: 'r1', pluginId: 'ai-plugin', request: { model: 'haiku', prompt: 'x' } });
    expect(await a.next('ai-response')).toMatchObject({ ok: false, error: 'Claude Code is not installed on this Mac' });
    a.ws.close();
  });
});
