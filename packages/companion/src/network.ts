import os from 'node:os';

export function isPrivateAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  let a = addr.toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  if (a.includes(':')) return a.startsWith('fe80:') || /^f[cd]/.test(a);
  const p = a.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a0, a1] = p as [number, number, number, number];
  return a0 === 127 || a0 === 10 || (a0 === 172 && a1 >= 16 && a1 <= 31) || (a0 === 192 && a1 === 168) || (a0 === 169 && a1 === 254);
}

/** Prefer en0, then any private non-internal IPv4. */
export function lanIp(): string | undefined {
  const ifs = os.networkInterfaces();
  const pick = (name: string) =>
    ifs[name]?.find((i) => i.family === 'IPv4' && !i.internal && isPrivateAddress(i.address))?.address;
  const en0 = pick('en0');
  if (en0) return en0;
  for (const name of Object.keys(ifs)) {
    const ip = pick(name);
    if (ip) return ip;
  }
  return undefined;
}
