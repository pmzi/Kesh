import type { ConnStatus } from '../net/client';

export type PillKind = 'connect' | 'offline' | 'connecting' | 'connected';

export interface Pill {
  kind: PillKind;
  label: string;
}

/** What the top-right pill on Home says. */
export function pillState(s: { paired: boolean; status: ConnStatus; macName?: string }): Pill {
  if (s.status === 'connected') return { kind: 'connected', label: s.macName || 'Mac' };
  if (!s.paired) return { kind: 'connect', label: 'Connect' };
  if (s.status === 'connecting') return { kind: 'connecting', label: 'Connecting…' };
  return { kind: 'offline', label: 'Offline' };
}

/** Launch never depends on pairing or the network. */
export function launchRoute(_s: { paired: boolean }): { name: 'home' } {
  return { name: 'home' };
}

export const NOT_REACHED = 'Could not reach the Mac. Is the companion running and on the same Wi-Fi?';

export type SheetPage = 'status' | 'pair';
export interface SheetState {
  page: SheetPage;
  code?: string;
  auto?: boolean;
}

/** A kesh://pair link (iPhone Camera app) opens the sheet on the pairing page, code prefilled. */
export function sheetForUrl(url: string | null | undefined): SheetState | null {
  if (!url || !/^kesh:\/\/pair\?/i.test(url.trim())) return null;
  return { page: 'pair', code: url.trim(), auto: true };
}
