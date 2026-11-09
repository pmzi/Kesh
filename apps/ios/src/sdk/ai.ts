import { NativeModules } from 'react-native';
import type { AiModel, AiRequest, AiSchema } from '../protocol';
import { validateAgainstSchema } from './aiSchema';

export interface NativeAI {
  availability(): Promise<{ available: boolean; reason?: string }>;
  generate(system: string | null, prompt: string, schemaJSON: string | null): Promise<string>;
}

/** Remote (Claude via the Mac) transport, provided by the live client. */
export interface AiRemote {
  claudeAvailable(): boolean;
  connected(): boolean;
  request(pluginId: string, req: AiRequest): Promise<unknown>;
}

let remote: AiRemote | undefined;
export function setAiRemote(r: AiRemote | undefined) {
  remote = r;
}

let nativeOverride: NativeAI | undefined;
/** Test hook. */
export function setNativeAi(n: NativeAI | undefined) {
  nativeOverride = n;
}
const native = (): NativeAI | undefined => nativeOverride ?? (NativeModules.KeshAI as NativeAI | undefined);

// One on-device call at a time.
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function onDeviceAvailability(): Promise<{ available: boolean; reason?: string }> {
  const n = native();
  if (!n) return { available: false, reason: 'On-device AI is not available in this build' };
  try {
    return await n.availability();
  } catch {
    return { available: false, reason: 'On-device AI is not available' };
  }
}

export function createAi(pluginId: string, need: () => void) {
  return {
    async models(): Promise<{ onDevice: boolean; claude: boolean }> {
      need();
      const a = await onDeviceAvailability();
      return {
        onDevice: !!a.available,
        claude: !!remote && remote.connected() && remote.claudeAvailable(),
      };
    },
    async generate(req: {
      model: AiModel;
      system?: string;
      prompt: string;
      schema?: AiSchema;
    }): Promise<unknown> {
      need();
      if (!req || typeof req.prompt !== 'string' || !req.prompt || typeof req.model !== 'string') {
        throw new Error('ai.generate needs a model and a prompt');
      }
      if (req.model === 'on-device') {
        return serialize(async () => {
          const a = await onDeviceAvailability();
          if (!a.available) throw new Error(a.reason ?? 'On-device AI is not available');
          let raw: string;
          try {
            raw = await native()!.generate(req.system ?? null, req.prompt, req.schema ? JSON.stringify(req.schema) : null);
          } catch (e: any) {
            throw new Error(String(e?.message ?? 'The on-device model failed'));
          }
          if (!req.schema) return raw;
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            throw new Error('The model returned an unexpected result');
          }
          return validateAgainstSchema(parsed, req.schema);
        });
      }
      if (!remote || !remote.connected()) throw new Error('Your Mac is not connected');
      return remote.request(pluginId, {
        model: req.model,
        prompt: req.prompt,
        ...(req.system !== undefined ? { system: req.system } : {}),
        ...(req.schema ? { schema: req.schema } : {}),
      });
    },
  };
}
