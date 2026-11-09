import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AiRequest, AiSchema } from '../../protocol/src/index';

export type AiResult = { ok: true; result: unknown } | { ok: false; error: string };

export interface ClaudeRunnerOptions {
  /** Explicit binary path (otherwise KESH_CLAUDE_BIN, PATH, ~/.local/bin/claude). */
  bin?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
  maxQueue?: number;
  maxResponseBytes?: number;
}

const MAX_ENVELOPE_BYTES = 8 * 1024 * 1024;
const MAX_ARRAY_ITEMS = 100;

export const ERR_NOT_INSTALLED = 'Claude Code is not installed on this Mac';
export const ERR_NOT_LOGGED_IN = 'Not logged in: run claude and /login';
export const ERR_TIMEOUT = 'Timed out';

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** KESH_CLAUDE_BIN (authoritative if set), else `claude` on PATH, else ~/.local/bin/claude. */
export function locateClaude(explicit?: string): string | undefined {
  const forced = explicit ?? process.env.KESH_CLAUDE_BIN;
  if (forced) return isExecutable(forced) ? forced : undefined;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, 'claude');
    if (isExecutable(p)) return p;
  }
  const fallback = path.join(os.homedir(), '.local', 'bin', 'claude');
  return isExecutable(fallback) ? fallback : undefined;
}

/** Minimal env: just enough for claude to find its own login. No other secrets are passed. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'CLAUDE_CONFIG_DIR']) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  return env;
}

/** First balanced {...} object in text (string/escape aware) that parses as JSON. */
export function extractJsonObject(text: string): unknown | undefined {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i]!;
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        } catch {
          /* try next start */
        }
        break;
      }
    }
  }
  return undefined;
}

/** Validate against the schema subset; returns cleaned object (known props only, arrays clamped) or error. */
export function validateAgainstSchema(value: unknown, schema: AiSchema): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'not an object' };
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, def] of Object.entries(schema.properties)) {
    const v = src[key];
    if (v === undefined || v === null) {
      if (required.has(key)) return { ok: false, error: `missing field ${key}` };
      continue;
    }
    if (def.type === 'string') {
      if (typeof v !== 'string') return { ok: false, error: `field ${key} must be a string` };
      out[key] = v;
    } else {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return { ok: false, error: `field ${key} must be an array of strings` };
      const max = Math.min(def.maxItems ?? MAX_ARRAY_ITEMS, MAX_ARRAY_ITEMS);
      const arr = (v as string[]).slice(0, max);
      if (def.minItems !== undefined && arr.length < def.minItems) return { ok: false, error: `field ${key} needs at least ${def.minItems} items` };
      out[key] = arr;
    }
  }
  return { ok: true, value: out };
}

function shortText(s: string, n = 200): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, n);
}

function mapFailure(text: string): string {
  if (/not logged in|\/login|invalid api key|authentication|unauthorized|\b401\b|credentials/i.test(text)) return ERR_NOT_LOGGED_IN;
  if (/rate.?limit|usage limit|too many requests|\b429\b|overloaded|limit reached/i.test(text)) return `Claude rate limit: ${shortText(text)}`;
  return `Claude failed: ${shortText(text) || 'unknown error'}`;
}

interface Waiter {
  start: () => void;
  reject: (e: Error) => void;
}

export class ClaudeRunner {
  private bin: string | undefined;
  private checked: Promise<boolean> | undefined;
  private running = 0;
  private queue: Waiter[] = [];
  private children = new Set<ChildProcess>();
  private timeoutMs: number;
  private maxConcurrent: number;
  private maxQueue: number;
  private maxResponseBytes: number;
  private explicitBin?: string;

  constructor(opts: ClaudeRunnerOptions = {}) {
    this.explicitBin = opts.bin;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.maxConcurrent = opts.maxConcurrent ?? 2;
    this.maxQueue = opts.maxQueue ?? 8;
    this.maxResponseBytes = opts.maxResponseBytes ?? 200 * 1024;
  }

  /** Checks once (cached): binary found and runs `--version`. */
  available(): Promise<boolean> {
    this.checked ??= new Promise<boolean>((resolve) => {
      this.bin = locateClaude(this.explicitBin);
      if (!this.bin) return resolve(false);
      execFile(this.bin, ['--version'], { timeout: 15_000, env: childEnv(), cwd: os.tmpdir() }, (err) => resolve(!err));
    });
    return this.checked;
  }

  shutdown() {
    for (const w of this.queue.splice(0)) w.reject(new Error('shutting down'));
    for (const c of this.children) c.kill('SIGKILL');
  }

  async run(req: AiRequest): Promise<AiResult> {
    if (!(await this.available()) || !this.bin) return { ok: false, error: ERR_NOT_INSTALLED };
    if (this.running >= this.maxConcurrent && this.queue.length >= this.maxQueue) {
      return { ok: false, error: 'Too many AI requests in flight; try again shortly' };
    }
    try {
      await new Promise<void>((resolve, reject) => {
        if (this.running < this.maxConcurrent) {
          this.running++;
          resolve();
        } else this.queue.push({ start: () => (this.running++, resolve()), reject });
      });
    } catch {
      return { ok: false, error: 'Companion is shutting down' };
    }
    try {
      return await this.execute(req);
    } finally {
      this.running--;
      this.queue.shift()?.start();
    }
  }

  private async execute(req: AiRequest): Promise<AiResult> {
    const deadline = Date.now() + this.timeoutMs;
    const schema = req.schema;
    const system = schema
      ? `${req.system ? req.system + '\n\n' : ''}Respond with ONLY a single JSON object matching this JSON schema, with no prose and no code fences:\n${JSON.stringify(schema)}`
      : req.system;
    const attempts = schema ? 2 : 1;
    let lastErr = 'Model did not return valid JSON';
    for (let i = 0; i < attempts; i++) {
      const prompt = i === 0 ? req.prompt : `${req.prompt}\n\n(Your previous reply was not valid JSON for the schema: ${lastErr}. Reply with ONLY the JSON object.)`;
      const r = await this.spawnOnce(req.model, system, prompt, schema, deadline - Date.now());
      if (!r.ok) return r;
      if (!schema) {
        if (Buffer.byteLength(r.text) > this.maxResponseBytes) return { ok: false, error: 'Response too large' };
        return { ok: true, result: r.text };
      }
      const candidate = r.structured ?? extractJsonObject(r.text);
      const v = candidate === undefined ? ({ ok: false, error: 'no JSON object found' } as const) : validateAgainstSchema(candidate, schema);
      if (v.ok) {
        if (Buffer.byteLength(JSON.stringify(v.value)) > this.maxResponseBytes) return { ok: false, error: 'Response too large' };
        return { ok: true, result: v.value };
      }
      lastErr = v.error;
    }
    return { ok: false, error: `Model did not return valid JSON (${lastErr})` };
  }

  private spawnOnce(
    model: string,
    system: string | undefined,
    prompt: string,
    schema: AiSchema | undefined,
    budgetMs: number,
  ): Promise<{ ok: true; text: string; structured?: unknown } | { ok: false; error: string }> {
    if (budgetMs <= 0) return Promise.resolve({ ok: false, error: ERR_TIMEOUT });
    // Prompt goes on STDIN only. Flags: headless print, JSON envelope, no tools, no persistence, no MCP/skills.
    const args = ['-p', '--output-format', 'json', '--model', model, '--tools', '', '--no-session-persistence', '--disable-slash-commands', '--strict-mcp-config'];
    args.push('--system-prompt', system ?? 'You are a helpful assistant. Answer concisely.');
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kesh-claude-'));
    return new Promise((resolve) => {
      let done = false;
      let timedOut = false;
      let out = '';
      let err = '';
      let overflow = false;
      const child = spawn(this.bin!, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      this.children.add(child);
      const finish = (r: { ok: true; text: string; structured?: unknown } | { ok: false; error: string }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.children.delete(child);
        fs.rmSync(cwd, { recursive: true, force: true });
        resolve(r);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
        finish({ ok: false, error: ERR_TIMEOUT });
      }, budgetMs);
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        if (out.length > MAX_ENVELOPE_BYTES) {
          overflow = true;
          child.kill('SIGKILL');
        }
      });
      child.stderr.on('data', (d: Buffer) => {
        if (err.length < 4000) err += d.toString();
      });
      child.on('error', (e: NodeJS.ErrnoException) => finish({ ok: false, error: e.code === 'ENOENT' ? ERR_NOT_INSTALLED : `Claude failed: ${e.message}` }));
      child.on('close', (code) => {
        if (timedOut) return finish({ ok: false, error: ERR_TIMEOUT });
        if (overflow) return finish({ ok: false, error: 'Response too large' });
        let env: any;
        try {
          env = JSON.parse(out);
        } catch {
          /* not JSON */
        }
        if (env && typeof env === 'object') {
          if (env.is_error || (typeof env.subtype === 'string' && env.subtype !== 'success')) {
            return finish({ ok: false, error: mapFailure(`${typeof env.result === 'string' ? env.result : ''} ${err}`) });
          }
          if (typeof env.result === 'string' || env.structured_output !== undefined) {
            return finish({ ok: true, text: typeof env.result === 'string' ? env.result : '', structured: env.structured_output ?? undefined });
          }
        }
        if (code !== 0) return finish({ ok: false, error: mapFailure(`${err} ${out}`) });
        finish({ ok: false, error: 'Claude returned an unreadable response' });
      });
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
    });
  }
}
