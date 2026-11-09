import { createSdk } from '../src/sdk';
import { setAiRemote, setNativeAi, type NativeAI } from '../src/sdk/ai';
import { validateAgainstSchema } from '../src/sdk/aiSchema';
import type { AiSchema } from '../src/protocol';

const man = (permissions: any[]) => ({ id: 'p1', name: 'P', permissions });
const schema: AiSchema = {
  type: 'object',
  properties: {
    meaning: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 },
  },
  required: ['meaning'],
};

afterEach(() => {
  setAiRemote(undefined);
  setNativeAi(undefined);
});

describe('permission gate', () => {
  test('ai denied without permission', async () => {
    const sdk = createSdk(man([]));
    await expect(sdk.ai.models()).rejects.toThrow('Permission "ai" not granted');
    await expect(sdk.ai.generate({ model: 'haiku', prompt: 'x' })).rejects.toThrow('Permission "ai" not granted');
  });
});

describe('validateAgainstSchema', () => {
  test('accepts valid, clamps arrays', () => {
    expect(validateAgainstSchema({ meaning: 'm', examples: ['a', 'b', 'c'], extra: 1 }, schema)).toEqual({
      meaning: 'm',
      examples: ['a', 'b'],
    });
  });
  test('missing required', () => {
    expect(() => validateAgainstSchema({ examples: ['a'] }, schema)).toThrow('missing "meaning"');
  });
  test('optional may be absent', () => {
    expect(validateAgainstSchema({ meaning: 'm' }, schema)).toEqual({ meaning: 'm' });
  });
  test('wrong types', () => {
    expect(() => validateAgainstSchema({ meaning: 3 }, schema)).toThrow('wrong type');
    expect(() => validateAgainstSchema({ meaning: 'm', examples: [1] }, schema)).toThrow('wrong type');
    expect(() => validateAgainstSchema([], schema)).toThrow('unexpected');
  });
  test('too few items', () => {
    expect(() => validateAgainstSchema({ meaning: 'm', examples: [] }, schema)).toThrow('too few');
  });
});

describe('on-device', () => {
  const mkNative = (over: Partial<NativeAI> = {}): NativeAI & { gen: jest.Mock } => {
    const gen = jest.fn(async () => '{"meaning":"short-lived"}');
    return { availability: async () => ({ available: true }), generate: gen, gen, ...over } as any;
  };
  test('models reports availability and claude', async () => {
    setNativeAi(mkNative());
    setAiRemote({ claudeAvailable: () => true, connected: () => true, request: async () => null });
    expect(await createSdk(man(['ai'])).ai.models()).toEqual({ onDevice: true, claude: true });
    setAiRemote({ claudeAvailable: () => true, connected: () => false, request: async () => null });
    expect(await createSdk(man(['ai'])).ai.models()).toEqual({ onDevice: true, claude: false });
  });
  test('schema result parsed and validated', async () => {
    const n = mkNative();
    setNativeAi(n);
    const r = await createSdk(man(['ai'])).ai.generate({ model: 'on-device', prompt: 'p', system: 's', schema });
    expect(r).toEqual({ meaning: 'short-lived' });
    expect(n.gen).toHaveBeenCalledWith('s', 'p', JSON.stringify(schema));
  });
  test('plain text without schema', async () => {
    setNativeAi(mkNative({ generate: async () => 'hello' }));
    expect(await createSdk(man(['ai'])).ai.generate({ model: 'on-device', prompt: 'p' })).toBe('hello');
  });
  test('invalid model output rejects', async () => {
    setNativeAi(mkNative({ generate: async () => '{"nope":1}' }));
    await expect(createSdk(man(['ai'])).ai.generate({ model: 'on-device', prompt: 'p', schema })).rejects.toThrow('missing');
    setNativeAi(mkNative({ generate: async () => 'not json' }));
    await expect(createSdk(man(['ai'])).ai.generate({ model: 'on-device', prompt: 'p', schema })).rejects.toThrow('unexpected');
  });
  test('unavailable', async () => {
    setNativeAi(mkNative({ availability: async () => ({ available: false, reason: 'Apple Intelligence is not enabled' }) }));
    const sdk = createSdk(man(['ai']));
    expect((await sdk.ai.models()).onDevice).toBe(false);
    await expect(sdk.ai.generate({ model: 'on-device', prompt: 'p' })).rejects.toThrow('Apple Intelligence is not enabled');
  });
  test('missing native module', async () => {
    const sdk = createSdk(man(['ai']));
    expect((await sdk.ai.models()).onDevice).toBe(false);
    await expect(sdk.ai.generate({ model: 'on-device', prompt: 'p' })).rejects.toThrow('not available');
  });
  test('native error surfaces readable message', async () => {
    setNativeAi(mkNative({ generate: async () => { throw new Error('The prompt is too long for the on-device model'); } }));
    await expect(createSdk(man(['ai'])).ai.generate({ model: 'on-device', prompt: 'p' })).rejects.toThrow('too long');
  });
  test('calls are serialized', async () => {
    let active = 0;
    let max = 0;
    setNativeAi(
      mkNative({
        generate: async () => {
          active++;
          max = Math.max(max, active);
          await new Promise(r => setTimeout(() => r(undefined), 10));
          active--;
          return 'x';
        },
      }),
    );
    const sdk = createSdk(man(['ai']));
    await Promise.all([1, 2, 3].map(() => sdk.ai.generate({ model: 'on-device', prompt: 'p' })));
    expect(max).toBe(1);
  });
});

describe('remote model routing', () => {
  test('offline rejects immediately', async () => {
    setAiRemote({ claudeAvailable: () => false, connected: () => false, request: jest.fn() });
    await expect(createSdk(man(['ai'])).ai.generate({ model: 'haiku', prompt: 'p' })).rejects.toThrow('Your Mac is not connected');
    setAiRemote(undefined);
    await expect(createSdk(man(['ai'])).ai.generate({ model: 'haiku', prompt: 'p' })).rejects.toThrow('Your Mac is not connected');
  });
  test('forwards to client request', async () => {
    const request = jest.fn(async () => 'ok');
    setAiRemote({ claudeAvailable: () => true, connected: () => true, request });
    expect(await createSdk(man(['ai'])).ai.generate({ model: 'haiku', prompt: 'p' })).toBe('ok');
    expect(request).toHaveBeenCalledWith('p1', { model: 'haiku', prompt: 'p' });
  });
});
