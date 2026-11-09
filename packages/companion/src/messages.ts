import { z } from 'zod';
import type { AiRequest, ClientMessage, Permission } from '../../protocol/src/index';

export const PERMISSIONS = ['haptics', 'storage', 'clipboard', 'notifications', 'ai'] as const satisfies readonly Permission[];

const hello = z.object({
  type: z.literal('hello'),
  protocol: z.number().int(),
  deviceName: z.string().min(1).max(200),
  token: z.string().max(256).optional(),
  deviceKey: z.string().max(256).optional(),
});
const ack = z.object({
  type: z.literal('ack'),
  id: z.string().max(100),
  version: z.number().int(),
  status: z.enum(['installed', 'declined', 'error']),
  error: z.string().max(10000).optional(),
});
const log = z.object({
  type: z.literal('log'),
  id: z.string().max(100),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string().max(10000),
});

const aiRequestMsg = z.object({
  type: z.literal('ai-request'),
  requestId: z.string().min(1).max(100),
  pluginId: z.string().max(100),
  request: z.unknown(),
});

const clientMessage = z.discriminatedUnion('type', [hello, ack, log, aiRequestMsg]);

const schemaProp = z.union([
  z.object({ type: z.literal('string'), description: z.string().max(1000).optional() }),
  z.object({
    type: z.literal('array'),
    items: z.object({ type: z.literal('string') }),
    minItems: z.number().int().min(0).max(100).optional(),
    maxItems: z.number().int().min(0).max(100).optional(),
    description: z.string().max(1000).optional(),
  }),
]);

const aiRequestSchema = z.object({
  model: z.string().regex(/^[A-Za-z0-9._:\[\]-]{1,64}$/, 'invalid model name').refine((m) => m !== 'on-device', "model 'on-device' runs on the phone, not on the Mac"),
  system: z.string().max(8000).optional(),
  prompt: z.string().min(1).max(20000),
  schema: z
    .object({
      type: z.literal('object'),
      properties: z.record(z.string().min(1).max(100), schemaProp).refine((p) => Object.keys(p).length <= 12, 'schema allows at most 12 properties'),
      required: z.array(z.string().max(100)).max(12).optional(),
    })
    .optional(),
});

/** Validates the `request` payload of an ai-request. */
export function parseAiRequest(data: unknown): { ok: true; value: AiRequest } | { ok: false; error: string } {
  const r = aiRequestSchema.safeParse(data);
  if (r.success) return { ok: true, value: r.data as AiRequest };
  const i = r.error.issues[0];
  return { ok: false, error: `Invalid ai request: ${i ? `${i.path.join('.') || 'request'}: ${i.message}` : 'bad shape'}` };
}

/** Returns a validated message, or null for bad JSON / unknown type / bad shape. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = clientMessage.safeParse(data);
  return r.success ? (r.data as ClientMessage) : null;
}

export const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  description: z.string().default(''),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
});
