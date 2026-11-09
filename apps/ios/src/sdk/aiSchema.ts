import type { AiSchema } from '../protocol';

/** Validate (and lightly normalize) model output against the AiSchema subset. Throws a readable Error. */
export function validateAgainstSchema(value: unknown, schema: AiSchema): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The model returned an unexpected result');
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema.properties)) {
    const v = obj[key];
    if (v === undefined || v === null) {
      if (schema.required?.includes(key)) {
        throw new Error(`The model's answer is missing "${key}"`);
      }
      continue;
    }
    if (spec.type === 'string') {
      if (typeof v !== 'string') throw new Error(`The model's answer has a wrong type for "${key}"`);
      out[key] = v;
    } else {
      if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) {
        throw new Error(`The model's answer has a wrong type for "${key}"`);
      }
      let arr = v as string[];
      if (spec.maxItems !== undefined && arr.length > spec.maxItems) arr = arr.slice(0, spec.maxItems);
      if (spec.minItems !== undefined && arr.length < spec.minItems) {
        throw new Error(`The model's answer has too few items for "${key}"`);
      }
      out[key] = arr;
    }
  }
  return out;
}
