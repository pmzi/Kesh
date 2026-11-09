import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import chokidar, { type FSWatcher } from 'chokidar';
import { Bonjour } from 'bonjour-service';
import { PROTOCOL_VERSION, type PluginPayload, type ServerMessage, type ClientMessage } from '../../protocol/src/index';
import { ConfigStore, defaultConfigDir, defaultWorkspace, safeEqual } from './config';
import { VersionStore, buildPlugin, listPluginIds } from './builder';
import { parseClientMessage, parseAiRequest } from './messages';
import { ClaudeRunner } from './claude';
import { isPrivateAddress, lanIp } from './network';
import { initWorkspace } from './workspace';

export interface CompanionOptions {
  workspace?: string;
  configDir?: string;
  port?: number;
  macName?: string;
  /** Advertise _kesh._tcp. Default true. */
  bonjour?: boolean;
  /** Skip private-peer check (tests only). */
  allowAnyPeer?: boolean;
  debounceMs?: number;
  /** Override claude binary (else KESH_CLAUDE_BIN / PATH / ~/.local/bin). */
  claudeBin?: string;
  /** Per-request claude timeout (default 90 s). */
  aiTimeoutMs?: number;
}

export interface CompanionEvents {
  'device-connected': [name: string, paired: boolean];
  'device-disconnected': [name: string];
  'plugin-built': [payload: PluginPayload];
  'build-error': [id: string, error: string];
  'icon-warning': [id: string, reason: string];
  pushed: [id: string, version: number, devices: number];
  'plugin-removed': [id: string];
  ack: [msg: Extract<ClientMessage, { type: 'ack' }>, device: string];
  log: [msg: Extract<ClientMessage, { type: 'log' }>, device: string];
  rejected: [reason: string];
  'ai-done': [info: { pluginId: string; model: string; ms: number; ok: boolean; error?: string }];
}

export class Companion extends EventEmitter<CompanionEvents> {
  readonly workspace: string;
  readonly pluginsDir: string;
  readonly config: ConfigStore;
  readonly versions: VersionStore;
  readonly macName: string;
  token = crypto.randomBytes(32).toString('hex');
  port = 0;
  claudeAvailable = false;
  private claude: ClaudeRunner;
  host = '127.0.0.1';
  readonly plugins = new Map<string, PluginPayload>();
  private server?: http.Server;
  private wss?: WebSocketServer;
  private watcher?: FSWatcher;
  private bonjour?: Bonjour;
  private clients = new Set<WebSocket>();
  private pending = new Set<string>();
  private iconWarnings = new Map<string, string>();
  private timer?: NodeJS.Timeout;
  private chain: Promise<void> = Promise.resolve();

  constructor(private opts: CompanionOptions = {}) {
    super();
    this.workspace = path.resolve(opts.workspace ?? defaultWorkspace());
    this.pluginsDir = path.join(this.workspace, 'plugins');
    const cfgDir = opts.configDir ?? defaultConfigDir();
    this.config = new ConfigStore(cfgDir);
    this.versions = new VersionStore(path.join(cfgDir, 'versions.json'));
    this.claude = new ClaudeRunner({ bin: opts.claudeBin, timeoutMs: opts.aiTimeoutMs });
    this.macName = opts.macName ?? os.hostname().replace(/\.local$/, '');
  }

  get pairingUrl() {
    return `kesh://pair?host=${this.host}&port=${this.port}&token=${this.token}`;
  }

  async start() {
    initWorkspace(this.workspace);
    this.claudeAvailable = await this.claude.available();
    await this.buildAll();

    this.server = http.createServer((req, res) => {
      if (!this.peerOk(req.socket.remoteAddress)) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    this.server.on('upgrade', (req, socket, head) => {
      if (!this.peerOk(req.socket.remoteAddress) || req.url?.split('?')[0] !== '/ws') {
        this.emit('rejected', `peer ${req.socket.remoteAddress} ${req.url}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.opts.port ?? 0, '0.0.0.0', () => resolve());
    });
    this.port = (this.server.address() as { port: number }).port;
    this.host = lanIp() ?? '127.0.0.1';

    fs.mkdirSync(this.pluginsDir, { recursive: true });
    this.watcher = chokidar.watch(this.pluginsDir, {
      ignoreInitial: true,
      ignored: (p) => p.split(path.sep).includes('node_modules'),
    });
    const onFs = (p: string) => this.schedule(p);
    this.watcher.on('all', (_ev, p) => onFs(p));
    await new Promise<void>((r) => this.watcher!.once('ready', () => r()));

    if (this.opts.bonjour !== false) {
      try {
        this.bonjour = new Bonjour();
        this.bonjour.publish({ name: `Kesh (${this.macName})`, type: 'kesh', protocol: 'tcp', port: this.port, txt: { mac: this.macName } });
      } catch (e) {
        this.emit('rejected', `bonjour failed: ${(e as Error).message}`);
      }
    }
    return { port: this.port, host: this.host, token: this.token, url: this.pairingUrl, workspace: this.workspace };
  }

  async stop() {
    clearTimeout(this.timer);
    this.claude.shutdown();
    await this.watcher?.close();
    for (const c of this.clients) c.terminate();
    this.wss?.close();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.server?.closeAllConnections?.();
    if (this.bonjour) {
      await new Promise<void>((r) => this.bonjour!.unpublishAll(() => r()));
      this.bonjour.destroy();
    }
  }

  private peerOk(addr: string | undefined) {
    return this.opts.allowAnyPeer || isPrivateAddress(addr);
  }

  /* ---------- building ---------- */

  private async buildOne(id: string, push: boolean) {
    const r = await buildPlugin(this.pluginsDir, id, this.versions);
    if (!r.ok) {
      this.emit('build-error', id, r.error);
      return;
    }
    if (r.iconWarning) {
      if (this.iconWarnings.get(id) !== r.iconWarning) this.emit('icon-warning', id, r.iconWarning);
      this.iconWarnings.set(id, r.iconWarning);
    } else this.iconWarnings.delete(id);
    const prev = this.plugins.get(id);
    if (prev && prev.hash === r.payload.hash && JSON.stringify(prev.manifest) === JSON.stringify(r.payload.manifest)) return;
    this.plugins.set(id, r.payload);
    this.emit('plugin-built', r.payload);
    if (push) {
      const n = this.broadcast({ type: 'plugin', plugin: r.payload });
      this.emit('pushed', id, r.payload.manifest.version, n);
    }
  }

  private async buildAll() {
    for (const id of listPluginIds(this.pluginsDir)) await this.buildOne(id, false);
  }

  private schedule(p: string) {
    const rel = path.relative(this.pluginsDir, p);
    const id = rel.split(path.sep)[0];
    if (!id || id.startsWith('..') || id.startsWith('.')) return;
    this.pending.add(id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const ids = [...this.pending];
      this.pending.clear();
      this.chain = this.chain.then(() => this.flush(ids)).catch(() => {});
    }, this.opts.debounceMs ?? 150);
  }

  /** Resolves when all queued rebuilds have finished (tests). */
  idle() {
    return this.chain;
  }

  private async flush(ids: string[]) {
    for (const id of ids) {
      const dir = path.join(this.pluginsDir, id);
      if (!fs.existsSync(dir)) {
        this.iconWarnings.delete(id);
        if (this.plugins.delete(id)) {
          this.broadcast({ type: 'plugin-removed', id });
          this.emit('plugin-removed', id);
        }
        continue;
      }
      await this.buildOne(id, true);
    }
  }

  /* ---------- sockets ---------- */

  private send(ws: WebSocket, m: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  private broadcast(m: ServerMessage): number {
    let n = 0;
    for (const c of this.clients) {
      this.send(c, m);
      n++;
    }
    return n;
  }

  private fail(ws: WebSocket, code: Extract<ServerMessage, { type: 'error' }>['code'], message: string) {
    this.send(ws, { type: 'error', code, message });
    ws.close();
  }

  private async handleAi(ws: WebSocket, msg: Extract<ClientMessage, { type: 'ai-request' }>) {
    const started = Date.now();
    const reply = (r: { ok: true; result: unknown } | { ok: false; error: string }) => {
      const m = (msg.request ?? {}) as { model?: unknown };
      const model = typeof m.model === 'string' && /^[A-Za-z0-9._:\[\]-]{1,64}$/.test(m.model) ? m.model : '?';
      this.emit('ai-done', { pluginId: msg.pluginId.slice(0, 100), model, ms: Date.now() - started, ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
      this.send(ws, r.ok ? { type: 'ai-response', requestId: msg.requestId, ok: true, result: r.result } : { type: 'ai-response', requestId: msg.requestId, ok: false, error: r.error });
    };
    const plugin = this.plugins.get(msg.pluginId);
    if (!plugin || !plugin.manifest.permissions.includes('ai')) return reply({ ok: false, error: 'Plugin has no ai permission' });
    const v = parseAiRequest(msg.request);
    if (!v.ok) return reply(v);
    try {
      reply(await this.claude.run(v.value));
    } catch (e) {
      reply({ ok: false, error: `Claude failed: ${(e as Error).message}` });
    }
  }

  private onConnection(ws: WebSocket) {
    let authed = false;
    let name = '';
    const timeout = setTimeout(() => !authed && this.fail(ws, 'bad_message', 'hello timeout'), 10_000);
    ws.on('close', () => {
      clearTimeout(timeout);
      if (authed) {
        this.clients.delete(ws);
        this.emit('device-disconnected', name);
      }
    });
    ws.on('error', () => {});
    ws.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!authed) {
        if (!msg || msg.type !== 'hello') return this.fail(ws, 'bad_message', 'expected hello');
        if (msg.protocol !== PROTOCOL_VERSION) return this.fail(ws, 'bad_protocol', `expected protocol ${PROTOCOL_VERSION}`);
        let deviceKey: string | undefined;
        let paired = false;
        if (msg.deviceKey !== undefined) {
          if (!this.config.hasDevice(msg.deviceKey)) return this.fail(ws, 'bad_device_key', 'unknown device key; re-pair');
        } else if (msg.token !== undefined && this.token && safeEqual(msg.token, this.token)) {
          this.token = ''; // single use
          deviceKey = this.config.addDevice(msg.deviceName);
          paired = true;
        } else {
          return this.fail(ws, 'bad_token', 'invalid or already used pairing token');
        }
        authed = true;
        name = msg.deviceName;
        clearTimeout(timeout);
        this.clients.add(ws);
        this.send(ws, { type: 'ready', protocol: PROTOCOL_VERSION, macName: this.macName, claudeAvailable: this.claudeAvailable, ...(deviceKey ? { deviceKey } : {}) });
        this.send(ws, { type: 'snapshot', plugins: [...this.plugins.values()] });
        this.emit('device-connected', name, paired);
        return;
      }
      if (!msg) return; // ignore unknown / malformed
      if (msg.type === 'ack') this.emit('ack', msg, name);
      else if (msg.type === 'log') this.emit('log', msg, name);
      else if (msg.type === 'ai-request') void this.handleAi(ws, msg);
    });
  }
}

export function createCompanion(opts: CompanionOptions = {}) {
  const c = new Companion(opts);
  return Object.assign(c, {});
}
