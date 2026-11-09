import type { Permission, PluginManifest, PluginPayload } from '../protocol';

export interface InstalledPlugin {
  /** Manifest exactly as the companion pushed it (requested permissions). */
  manifest: PluginManifest;
  /** Permissions the user actually granted (subset of manifest.permissions). */
  granted: Permission[];
  bundle: string;
  /** Sanitized SVG app icon; absent on records saved before icons existed. */
  icon?: string;
  hash: string;
  installedAt: number;
  updatedAt: number;
}

export type Decision = 'review' | 'update' | 'noop';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every(x => b.includes(x));

/**
 * Decide what to do with a pushed plugin. Never trust `version` alone: the
 * companion keeps it unchanged for manifest-only edits.
 */
export function classify(pushed: PluginPayload, installed: InstalledPlugin | undefined): Decision {
  if (!installed) return 'review';
  const requested = installed.manifest.permissions;
  if (!pushed.manifest.permissions.every(p => requested.includes(p))) return 'review';
  const m = pushed.manifest;
  const o = installed.manifest;
  const manifestSame =
    m.name === o.name &&
    m.description === o.description &&
    sameSet(m.permissions, o.permissions);
  if (pushed.hash === installed.hash && manifestSame) return 'noop';
  return 'update';
}

/** Minimal fs surface (react-native-fs shaped) so the store is testable. */
export interface Fs {
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  unlink(path: string): Promise<void>;
  readDir(path: string): Promise<{ name: string; isDirectory(): boolean }[]>;
}

export class PluginStore {
  constructor(private fs: Fs, private root: string) {}

  private dir(id: string) {
    return `${this.root}/${id}`;
  }

  async list(): Promise<InstalledPlugin[]> {
    if (!(await this.fs.exists(this.root))) return [];
    const out: InstalledPlugin[] = [];
    for (const e of await this.fs.readDir(this.root)) {
      if (!e.isDirectory()) continue;
      const p = await this.get(e.name);
      if (p) out.push(p);
    }
    return out;
  }

  async get(id: string): Promise<InstalledPlugin | undefined> {
    const f = `${this.dir(id)}/current.json`;
    try {
      if (!(await this.fs.exists(f))) return undefined;
      const rec = JSON.parse(await this.fs.readFile(f)) as InstalledPlugin;
      // Old records have no icon: leave it undefined, drop anything non-string.
      if (typeof rec.icon !== 'string') delete rec.icon;
      return rec;
    } catch {
      return undefined;
    }
  }

  /** Save as current; the existing current becomes previous (rollback copy). */
  async save(
    payload: PluginPayload,
    granted: Permission[],
    now = Date.now(),
  ): Promise<InstalledPlugin> {
    const id = payload.manifest.id;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`bad plugin id "${id}"`);
    const d = this.dir(id);
    await this.fs.mkdir(d);
    const prev = await this.get(id);
    if (prev) await this.fs.writeFile(`${d}/previous.json`, JSON.stringify(prev));
    const rec: InstalledPlugin = {
      manifest: payload.manifest,
      granted: granted.filter(g => payload.manifest.permissions.includes(g)),
      bundle: payload.bundle,
      ...(payload.icon ? { icon: payload.icon } : {}),
      hash: payload.hash,
      installedAt: prev?.installedAt ?? now,
      updatedAt: now,
    };
    await this.fs.writeFile(`${d}/current.json`, JSON.stringify(rec));
    return rec;
  }

  /** Silent update: keep the user's grants (intersected with new request). */
  async update(payload: PluginPayload, now = Date.now()): Promise<InstalledPlugin> {
    const prev = await this.get(payload.manifest.id);
    return this.save(payload, prev?.granted ?? payload.manifest.permissions, now);
  }

  async getPrevious(id: string): Promise<InstalledPlugin | undefined> {
    const f = `${this.dir(id)}/previous.json`;
    if (!(await this.fs.exists(f))) return undefined;
    return JSON.parse(await this.fs.readFile(f));
  }

  async remove(id: string): Promise<void> {
    const d = this.dir(id);
    for (const n of ['current.json', 'previous.json']) {
      if (await this.fs.exists(`${d}/${n}`)) await this.fs.unlink(`${d}/${n}`);
    }
    if (await this.fs.exists(d)) await this.fs.unlink(d);
  }
}

export function rnFs(): { fs: Fs; root: string } {
  const RNFS = require('react-native-fs');
  return {
    root: `${RNFS.DocumentDirectoryPath}/kesh-plugins`,
    fs: {
      mkdir: p => RNFS.mkdir(p),
      exists: p => RNFS.exists(p),
      readFile: p => RNFS.readFile(p, 'utf8'),
      writeFile: (p, d) => RNFS.writeFile(p, d, 'utf8'),
      unlink: p => RNFS.unlink(p),
      readDir: p => RNFS.readDir(p),
    },
  };
}
