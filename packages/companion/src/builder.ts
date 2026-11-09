import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import type { PluginPayload } from '../../protocol/src/index';
import { manifestSchema } from './messages';
import { lowerBlockScoping } from './hermes-compat';
import { sanitizeIcon, MAX_ICON_BYTES } from './icon';

export class VersionStore {
  private data: Record<string, { hash: string; version: number }> = {};
  constructor(private file: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.data = {};
    }
  }
  /** Version for this hash; increments only when the hash differs from the stored one. */
  versionFor(id: string, hash: string): number {
    const cur = this.data[id];
    if (cur && cur.hash === hash) return cur.version;
    const version = (cur?.version ?? 0) + 1;
    this.data[id] = { hash, version };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    return version;
  }
}

export type BuildResult = { ok: true; payload: PluginPayload; iconWarning?: string } | { ok: false; error: string };

export async function buildPlugin(pluginsDir: string, id: string, versions: VersionStore): Promise<BuildResult> {
  const dir = path.join(pluginsDir, id);
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (e) {
    return { ok: false, error: `manifest.json: ${(e as Error).message}` };
  }
  const parsed = manifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return { ok: false, error: 'manifest.json: ' + parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ') };
  }
  const m = parsed.data;
  if (m.id !== id) return { ok: false, error: `manifest.json: id "${m.id}" must equal folder name "${id}"` };
  const entry = path.join(dir, 'index.tsx');
  if (!fs.existsSync(entry)) return { ok: false, error: 'index.tsx not found' };

  let code: string;
  try {
    const res = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'cjs',
      platform: 'neutral',
      jsx: 'transform',
      target: 'es2019',
      external: ['react', 'react-native', '@kesh/sdk'],
      write: false,
      outdir: path.join(dir, '__out'),
      logLevel: 'silent',
      mainFields: ['module', 'main'],
    });
    code = lowerBlockScoping(res.outputFiles[0]!.text);
  } catch (e) {
    const err = e as { errors?: { text: string; location?: { file: string; line: number; column: number } | null }[]; message: string };
    const msg = err.errors?.length
      ? err.errors.map((x) => (x.location ? `${path.relative(dir, x.location.file)}:${x.location.line}:${x.location.column} ` : '') + x.text).join('\n')
      : err.message;
    return { ok: false, error: msg };
  }
  const { icon, warning: iconWarning } = readIcon(dir);
  const hash = payloadHash(code, icon);
  const version = versions.versionFor(id, hash);
  return {
    ok: true,
    payload: {
      manifest: { id: m.id, name: m.name, version, description: m.description, permissions: m.permissions },
      bundle: code,
      ...(icon ? { icon } : {}),
      hash,
    },
    ...(iconWarning ? { iconWarning } : {}),
  };
}

/** sha256 of the bundle alone (legacy definition). */
export const bundleHash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

/** Payload hash: covers bundle + icon so an icon-only change is detected. */
export function payloadHash(code: string, icon?: string) {
  return crypto.createHash('sha256').update(code + '\n--icon--\n' + (icon ?? '')).digest('hex');
}

/** Reads + sanitizes plugins/<id>/icon.svg. A bad icon yields a warning, never a failure. */
function readIcon(dir: string): { icon?: string; warning?: string } {
  const file = path.join(dir, 'icon.svg');
  let buf: Buffer;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return {};
    if (st.size > MAX_ICON_BYTES) return { warning: `icon.svg ignored: larger than ${MAX_ICON_BYTES / 1024} KB` };
    buf = fs.readFileSync(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    return { warning: `icon.svg ignored: ${(e as Error).message}` };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return { warning: 'icon.svg ignored: not valid UTF-8' };
  }
  const r = sanitizeIcon(text);
  return r.ok ? { icon: r.svg } : { warning: `icon.svg ignored: ${r.error}` };
}

export function listPluginIds(pluginsDir: string): string[] {
  try {
    return fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map((d) => d.name);
  } catch {
    return [];
  }
}
