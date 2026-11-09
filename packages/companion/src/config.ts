import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface Device {
  keyHash: string;
  name: string;
  pairedAt: string;
}
export interface Config {
  devices: Device[];
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const defaultConfigDir = () => path.join(os.homedir(), '.kesh');
export const defaultWorkspace = () => path.join(defaultConfigDir(), 'workspace');

export class ConfigStore {
  readonly file: string;
  constructor(readonly dir: string) {
    this.file = path.join(dir, 'config.json');
  }
  load(): Config {
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { devices: Array.isArray(c.devices) ? c.devices : [] };
    } catch {
      return { devices: [] };
    }
  }
  save(c: Config) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(c, null, 2), { mode: 0o600 });
  }
  /** Issues a new device key; stores only its hash. Returns the raw key. */
  addDevice(name: string): string {
    const key = crypto.randomBytes(32).toString('hex');
    const c = this.load();
    c.devices.push({ keyHash: sha256(key), name, pairedAt: new Date().toISOString() });
    this.save(c);
    return key;
  }
  hasDevice(key: string): boolean {
    const h = Buffer.from(sha256(key));
    return this.load().devices.some((d) => {
      const b = Buffer.from(d.keyHash);
      return b.length === h.length && crypto.timingSafeEqual(b, h);
    });
  }
  clear() {
    this.save({ devices: [] });
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
