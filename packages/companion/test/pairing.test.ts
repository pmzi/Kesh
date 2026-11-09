import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigStore, sha256 } from '../src/config';
import { parseClientMessage } from '../src/messages';
import { isPrivateAddress } from '../src/network';
import { tmp } from './helpers';

describe('config / pairing store', () => {
  it('stores hashes, never raw key', () => {
    const d = tmp();
    const s = new ConfigStore(d);
    const key = s.addDevice('iPhone');
    const raw = fs.readFileSync(path.join(d, 'config.json'), 'utf8');
    expect(raw).not.toContain(key);
    expect(raw).toContain(sha256(key));
    expect(s.hasDevice(key)).toBe(true);
    expect(s.hasDevice('nope')).toBe(false);
    s.clear();
    expect(s.hasDevice(key)).toBe(false);
  });
});

describe('message validation', () => {
  it('accepts valid, rejects/ignores others', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hello', protocol: 1, deviceName: 'x', token: 't' }))?.type).toBe('hello');
    expect(parseClientMessage(JSON.stringify({ type: 'log', id: 'a', level: 'info', message: 'm' }))?.type).toBe('log');
    expect(parseClientMessage(JSON.stringify({ type: 'ack', id: 'a', version: 1, status: 'installed' }))?.type).toBe('ack');
    expect(parseClientMessage(JSON.stringify({ type: 'ack', id: 'a', version: 1, status: 'weird' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('[]')).toBeNull();
  });
});

describe('peer check', () => {
  it('only private', () => {
    for (const a of ['127.0.0.1', '::1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.1.5', '169.254.1.1', '::ffff:192.168.0.2'])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ['8.8.8.8', '172.32.0.1', '11.0.0.1', '2001:db8::1', undefined]) expect(isPrivateAddress(a as string), String(a)).toBe(false);
  });
});
