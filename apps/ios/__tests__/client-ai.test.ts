jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
import { KeshClient } from '../src/net/client';

class MockWS {
  static last: MockWS;
  readyState = 0;
  sent: any[] = [];
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  constructor(public url: string) {
    MockWS.last = this;
  }
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  close() {}
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  recv(m: any) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

const mk = () => {
  const c = new KeshClient({
    onStatus: () => {},
    onReady: () => {},
    onSnapshot: () => {},
    onPlugin: () => {},
    onRemoved: () => {},
  });
  c.pair({ host: '1.2.3.4', port: 1, token: 't' });
  return c;
};
const connect = (c: KeshClient, claudeAvailable?: boolean) => {
  const ws = MockWS.last;
  ws.open();
  ws.recv({ type: 'ready', protocol: 1, macName: 'Mac', deviceKey: 'k', claudeAvailable });
  return ws;
};

beforeEach(() => {
  (globalThis as any).WebSocket = MockWS;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

test('offline rejects immediately and sends nothing', async () => {
  const c = mk();
  await expect(c.requestAi('p', { model: 'haiku', prompt: 'x' })).rejects.toThrow('Your Mac is not connected');
  expect(MockWS.last.sent.filter(m => m.type === 'ai-request')).toHaveLength(0);
});

test('claudeAvailable tracked from ready, cleared on close', () => {
  const c = mk();
  const ws = connect(c, true);
  expect(c.isConnected()).toBe(true);
  expect(c.claudeAvailable()).toBe(true);
  ws.onclose();
  expect(c.isConnected()).toBe(false);
  expect(c.claudeAvailable()).toBe(false);
  const c2 = mk();
  connect(c2, undefined);
  expect(c2.claudeAvailable()).toBe(false);
});

test('request/response correlation', async () => {
  const c = mk();
  const ws = connect(c, true);
  const a = c.requestAi('pa', { model: 'haiku', prompt: 'a' });
  const b = c.requestAi('pb', { model: 'sonnet', prompt: 'b' });
  const reqs = ws.sent.filter(m => m.type === 'ai-request');
  expect(reqs).toHaveLength(2);
  expect(reqs[0].requestId).not.toBe(reqs[1].requestId);
  expect(reqs[0].pluginId).toBe('pa');
  ws.recv({ type: 'ai-response', requestId: reqs[1].requestId, ok: true, result: 'B' });
  ws.recv({ type: 'ai-response', requestId: reqs[0].requestId, ok: false, error: 'Claude is rate limited' });
  await expect(b).resolves.toBe('B');
  await expect(a).rejects.toThrow('Claude is rate limited');
});

test('unknown response id ignored', () => {
  const c = mk();
  const ws = connect(c, true);
  expect(() => ws.recv({ type: 'ai-response', requestId: 'zzz', ok: true, result: 1 })).not.toThrow();
});

test('times out after 100 s', async () => {
  const c = mk();
  connect(c, true);
  const p = c.requestAi('p', { model: 'haiku', prompt: 'x' });
  const assertion = expect(p).rejects.toThrow('too long');
  jest.advanceTimersByTime(99_999);
  jest.advanceTimersByTime(2);
  await assertion;
});

test('disconnect rejects pending', async () => {
  const c = mk();
  const ws = connect(c, true);
  const p = c.requestAi('p', { model: 'haiku', prompt: 'x' });
  ws.onclose();
  await expect(p).rejects.toThrow('disconnected');
});
