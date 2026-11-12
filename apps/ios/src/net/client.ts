import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PROTOCOL_VERSION,
  type AiRequest,
  type ClientMessage,
  type PluginPayload,
  type ServerMessage,
} from '../protocol';

export interface PairInfo {
  host: string;
  port: number;
  token: string;
}

export function parsePairUrl(raw: string): PairInfo | null {
  const m = raw.trim().match(/^kesh:\/\/pair\?(.+)$/i);
  if (!m) return null;
  const q: Record<string, string> = {};
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=');
    q[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  const port = Number(q.port);
  if (!q.host || !port || !q.token) return null;
  return { host: q.host, port, token: q.token };
}

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface ClientEvents {
  onStatus(s: ConnStatus, detail?: string): void;
  onReady(macName: string): void;
  onSnapshot(plugins: PluginPayload[]): void;
  onPlugin(plugin: PluginPayload): void;
  onRemoved(id: string): void;
  /** Stored credentials were rejected and have been cleared. */
  onUnpaired?(): void;
}

interface Saved {
  host: string;
  port: number;
  deviceKey: string;
  macName?: string;
}
const KEY = 'kesh:connection';
/** Set while the user chose "Disconnect": no auto-reconnect until they connect again. */
export const OFFLINE_KEY = 'kesh:offline';
export const AI_TIMEOUT_MS = 100_000;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class KeshClient {
  private ws?: WebSocket;
  private target?: { host: string; port: number };
  private token?: string;
  private deviceKey?: string;
  private macName?: string;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private isReady = false;
  private claude = false;
  private wanted = false;
  private paused = false;
  private pendingAi = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private ev: ClientEvents, private deviceName = 'iPhone') {}

  /**
   * Load the saved pairing. Never waits on the network. Starts a silent
   * background connect unless the user chose "Disconnect" earlier.
   */
  async resume(): Promise<{ paired: boolean; macName?: string; offlineByChoice: boolean }> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return { paired: false, offlineByChoice: false };
      const s = JSON.parse(raw) as Saved;
      this.target = { host: s.host, port: s.port };
      this.deviceKey = s.deviceKey;
      this.macName = s.macName;
      const offlineByChoice = (await AsyncStorage.getItem(OFFLINE_KEY).catch(() => null)) === '1';
      if (!offlineByChoice) this.start();
      return { paired: true, macName: s.macName, offlineByChoice };
    } catch {
      return { paired: false, offlineByChoice: false };
    }
  }

  pair(info: PairInfo) {
    this.stop();
    AsyncStorage.removeItem(OFFLINE_KEY).catch(() => {});
    this.target = { host: info.host, port: info.port };
    this.token = info.token;
    this.deviceKey = undefined;
    this.macName = undefined;
    this.start();
  }

  /** User tapped Connect: clear the offline choice and connect now. */
  async connectNow() {
    await AsyncStorage.removeItem(OFFLINE_KEY).catch(() => {});
    if (!this.target) return;
    this.stop();
    this.start();
  }

  /** User tapped Disconnect: stay offline (persisted) but keep the pairing. */
  async disconnect() {
    await AsyncStorage.setItem(OFFLINE_KEY, '1').catch(() => {});
    this.stop();
  }

  async forget() {
    this.stop();
    this.target = undefined;
    this.deviceKey = undefined;
    this.token = undefined;
    this.macName = undefined;
    await AsyncStorage.removeItem(KEY).catch(() => {});
    await AsyncStorage.removeItem(OFFLINE_KEY).catch(() => {});
  }

  /** App went to the background: drop the socket quietly, keep intent to reconnect. */
  pause() {
    if (!this.wanted) return;
    this.paused = true;
    this.halt();
  }

  /** App is foregrounded again: reconnect if we were connecting/connected before. */
  wake() {
    if (!this.paused) return;
    this.paused = false;
    if (this.wanted && this.target) this.start();
  }

  /** True once the Mac has answered `hello` on the live socket. */
  isConnected(): boolean {
    return this.isReady && this.ws?.readyState === 1;
  }

  claudeAvailable(): boolean {
    return this.claude;
  }

  /** Send an ai-request to the Mac and await the matching ai-response (100 s timeout). */
  requestAi(pluginId: string, request: AiRequest, timeoutMs = AI_TIMEOUT_MS): Promise<unknown> {
    if (!this.isConnected()) return Promise.reject(new Error('Your Mac is not connected'));
    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAi.delete(requestId);
        reject(new Error('Claude took too long to answer'));
      }, timeoutMs);
      this.pendingAi.set(requestId, { resolve, reject, timer });
      this.send({ type: 'ai-request', requestId, pluginId, request });
    });
  }

  private failAllAi(message: string) {
    for (const [id, p] of this.pendingAi) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      this.pendingAi.delete(id);
    }
  }

  private start() {
    this.wanted = true;
    this.paused = false;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  stop() {
    this.wanted = false;
    this.paused = false;
    this.halt();
  }

  private halt() {
    this.stopped = true;
    this.isReady = false;
    this.claude = false;
    this.failAllAi('Your Mac is not connected');
    if (this.timer) clearTimeout(this.timer);
    const w = this.ws;
    this.ws = undefined;
    if (w) {
      w.onclose = null;
      w.onerror = null;
      w.onmessage = null;
      try {
        w.close();
      } catch {}
    }
    this.ev.onStatus('idle');
  }

  private connect() {
    if (this.stopped || !this.target) return;
    const { host, port } = this.target;
    this.ev.onStatus('connecting');
    const ws = new WebSocket(`ws://${host}:${port}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      const hello: ClientMessage = {
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        deviceName: this.deviceName,
        ...(this.deviceKey ? { deviceKey: this.deviceKey } : { token: this.token }),
      };
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = e => {
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.handle(m);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.isReady = false;
      this.claude = false;
      this.failAllAi('Your Mac disconnected');
      this.ev.onStatus('error');
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const delay = Math.min(15000, 1000 * 2 ** this.attempt++);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private async handle(m: ServerMessage) {
    switch (m.type) {
      case 'ready': {
        this.attempt = 0;
        this.isReady = true;
        this.claude = m.claudeAvailable === true;
        if (m.deviceKey) {
          this.deviceKey = m.deviceKey;
          this.token = undefined;
        }
        this.macName = m.macName;
        if (this.deviceKey && this.target) {
          const s: Saved = { ...this.target, deviceKey: this.deviceKey, macName: m.macName };
          try {
            await AsyncStorage.setItem(KEY, JSON.stringify(s));
          } catch {}
        }
        this.ev.onStatus('connected');
        this.ev.onReady(m.macName);
        break;
      }
      case 'error':
        if (m.code === 'bad_device_key' || m.code === 'bad_token') {
          // Credentials are dead; stop retrying and require re-pairing.
          this.stopped = true;
          this.wanted = false;
          this.target = undefined;
          await AsyncStorage.removeItem(KEY).catch(() => {});
          this.ev.onUnpaired?.();
        }
        this.ev.onStatus('error', m.message);
        break;
      case 'ai-response': {
        const p = this.pendingAi.get(m.requestId);
        if (!p) break;
        this.pendingAi.delete(m.requestId);
        clearTimeout(p.timer);
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(m.error || 'Claude could not answer'));
        break;
      }
      case 'snapshot':
        this.ev.onSnapshot(m.plugins);
        break;
      case 'plugin':
        this.ev.onPlugin(m.plugin);
        break;
      case 'plugin-removed':
        this.ev.onRemoved(m.id);
        break;
    }
  }

  send(m: ClientMessage) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }
}
