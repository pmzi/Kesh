const mockMem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (mockMem.has(k) ? mockMem.get(k)! : null)),
    setItem: jest.fn(async (k: string, v: string) => void mockMem.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockMem.delete(k)),
  },
}));
import { KeshClient, OFFLINE_KEY } from '../src/net/client';
import { launchRoute, pillState, sheetForUrl } from '../src/state/connection';

class MockWS {
  static all: MockWS[] = [];
  readyState = 0;
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  constructor(public url: string) {
    MockWS.all.push(this);
  }
  send() {}
  close() {}
}

const mk = () => {
  const statuses: string[] = [];
  const c = new KeshClient({
    onStatus: s => statuses.push(s),
    onReady: () => {},
    onSnapshot: () => {},
    onPlugin: () => {},
    onRemoved: () => {},
  });
  return { c, statuses };
};
const saved = JSON.stringify({ host: '1.2.3.4', port: 9, deviceKey: 'k', macName: 'Studio' });

beforeEach(() => {
  mockMem.clear();
  MockWS.all = [];
  (globalThis as any).WebSocket = MockWS;
});

describe('launch routing', () => {
  it('always goes to Home, paired or not', () => {
    expect(launchRoute({ paired: false })).toEqual({ name: 'home' });
    expect(launchRoute({ paired: true })).toEqual({ name: 'home' });
  });
  it('unpaired shows Connect (empty state offers the sheet)', () => {
    expect(pillState({ paired: false, status: 'idle' })).toEqual({ kind: 'connect', label: 'Connect' });
  });
  it('paired and not connected shows Offline; connecting and connected map', () => {
    expect(pillState({ paired: true, status: 'idle' }).label).toBe('Offline');
    expect(pillState({ paired: true, status: 'error' }).label).toBe('Offline');
    expect(pillState({ paired: true, status: 'connecting' }).label).toBe('Connecting…');
    expect(pillState({ paired: true, status: 'connected', macName: 'Studio' })).toEqual({ kind: 'connected', label: 'Studio' });
  });
});

describe('resume', () => {
  it('unpaired: no socket, not paired', async () => {
    const { c } = mk();
    expect(await c.resume()).toEqual({ paired: false, offlineByChoice: false });
    expect(MockWS.all).toHaveLength(0);
  });
  it('paired: returns immediately and connects silently in the background', async () => {
    mockMem.set('kesh:connection', saved);
    const { c } = mk();
    const r = await c.resume();
    expect(r).toEqual({ paired: true, macName: 'Studio', offlineByChoice: false });
    expect(MockWS.all).toHaveLength(1);
    expect(c.isConnected()).toBe(false);
  });
  it('honors the persisted Disconnect choice', async () => {
    mockMem.set('kesh:connection', saved);
    mockMem.set(OFFLINE_KEY, '1');
    const { c } = mk();
    const r = await c.resume();
    expect(r.paired).toBe(true);
    expect(r.offlineByChoice).toBe(true);
    expect(MockWS.all).toHaveLength(0);
  });
});

describe('disconnect / connect / forget', () => {
  it('disconnect persists the choice and keeps the pairing; connectNow clears it', async () => {
    mockMem.set('kesh:connection', saved);
    const { c } = mk();
    await c.resume();
    await c.disconnect();
    expect(mockMem.get(OFFLINE_KEY)).toBe('1');
    expect(mockMem.has('kesh:connection')).toBe(true);
    const before = MockWS.all.length;
    await c.connectNow();
    expect(mockMem.has(OFFLINE_KEY)).toBe(false);
    expect(MockWS.all.length).toBe(before + 1);
  });
  it('forget clears stored host/port/deviceKey and the offline choice', async () => {
    mockMem.set('kesh:connection', saved);
    mockMem.set(OFFLINE_KEY, '1');
    const { c } = mk();
    await c.resume();
    await c.forget();
    expect(mockMem.has('kesh:connection')).toBe(false);
    expect(mockMem.has(OFFLINE_KEY)).toBe(false);
    expect((await mk().c.resume()).paired).toBe(false);
  });
  it('pausing in background stops sockets; waking reconnects', async () => {
    mockMem.set('kesh:connection', saved);
    const { c } = mk();
    await c.resume();
    c.pause();
    const n = MockWS.all.length;
    c.wake();
    expect(MockWS.all.length).toBe(n + 1);
  });
  it('pause/wake does not connect when the user chose Disconnect', async () => {
    mockMem.set('kesh:connection', saved);
    const { c } = mk();
    await c.resume();
    await c.disconnect();
    c.pause();
    c.wake();
    expect(MockWS.all).toHaveLength(1);
  });
});

describe('deep link', () => {
  it('kesh://pair opens the sheet on the pairing page with the code', () => {
    const u = 'kesh://pair?host=1.2.3.4&port=1&token=t';
    expect(sheetForUrl(u)).toEqual({ page: 'pair', code: u, auto: true });
  });
  it('ignores other links', () => {
    expect(sheetForUrl('https://x.y')).toBeNull();
    expect(sheetForUrl(null)).toBeNull();
  });
});
