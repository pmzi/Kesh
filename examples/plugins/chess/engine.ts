// Chess engine: 0x88 mailbox, make/unmake, legal move filtering, SAN, draws.
// Pure TypeScript, zero imports.

export const WHITE = 0;
export const BLACK = 1;
export const EMPTY = 0;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

// Piece = type | (color << 3). White 1..6, black 9..14.
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Move encoding: from(7) | to(7)<<7 | promo(3)<<14 | flags<<17
export const F_CAPTURE = 1;
export const F_EP = 2;
export const F_CASTLE = 4;
export const F_DOUBLE = 8;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export function moveFrom(m: number): number { return m & 127; }
export function moveTo(m: number): number { return (m >> 7) & 127; }
export function movePromo(m: number): number { return (m >> 14) & 7; }
export function moveFlags(m: number): number { return m >> 17; }
export function makeMoveInt(from: number, to: number, promo: number, flags: number): number {
  return from | (to << 7) | (promo << 14) | (flags << 17);
}

export function sqName(sq: number): string {
  return 'abcdefgh'.charAt(sq & 7) + String(((sq >> 4) & 7) + 1);
}
export function sqFromName(s: string): number {
  const f = s.charCodeAt(0) - 97;
  const r = s.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 16 + f;
}
export function moveToUci(m: number): string {
  const p = movePromo(m);
  return sqName(moveFrom(m)) + sqName(moveTo(m)) + (p ? 'nbrq'.charAt(p - 2) : '');
}

const KNIGHT_OFFS = [33, 31, 18, 14, -14, -18, -31, -33];
const KING_OFFS = [1, -1, 16, -16, 17, 15, -15, -17];
const BISHOP_OFFS = [17, 15, -15, -17];
const ROOK_OFFS = [1, -1, 16, -16];

const CMASK = new Int8Array(128).fill(15);
CMASK[0] = 15 & ~CASTLE_WQ;
CMASK[4] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CMASK[7] = 15 & ~CASTLE_WK;
CMASK[112] = 15 & ~CASTLE_BQ;
CMASK[116] = 15 & ~(CASTLE_BK | CASTLE_BQ);
CMASK[119] = 15 & ~CASTLE_BK;

// ---- Evaluation tables (white's view, rank 8 first) ----
const PST_P = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_N = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_B = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_R = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_Q = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const KING_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];
export const PIECE_VALUE = [0, 100, 320, 330, 500, 900, 0];
const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

// PST[piece*128+sq] = signed (white positive) material+positional value, excluding kings.
const PST = new Int16Array(16 * 128);
const KMG = new Int16Array(2 * 128); // [color*128+sq]
const KEG = new Int16Array(2 * 128);
(function initTables() {
  const tabs = [null, PST_P, PST_N, PST_B, PST_R, PST_Q];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f;
      const wi = (7 - r) * 8 + f;
      const bi = r * 8 + f;
      for (let t = 1; t <= 5; t++) {
        const tab = tabs[t] as number[];
        PST[t * 128 + sq] = PIECE_VALUE[t] + tab[wi];
        PST[(t + 8) * 128 + sq] = -(PIECE_VALUE[t] + tab[bi]);
      }
      KMG[sq] = KING_MG[wi];
      KEG[sq] = KING_EG[wi];
      KMG[128 + sq] = KING_MG[bi];
      KEG[128 + sq] = KING_EG[bi];
    }
  }
})();

// ---- Zobrist (two 32-bit halves) ----
const ZP_LO = new Int32Array(16 * 128);
const ZP_HI = new Int32Array(16 * 128);
const ZC_LO = new Int32Array(16);
const ZC_HI = new Int32Array(16);
const ZE_LO = new Int32Array(8);
const ZE_HI = new Int32Array(8);
let Z_SIDE_LO = 0;
let Z_SIDE_HI = 0;
(function initZobrist() {
  let s = 0x9e3779b9 | 0;
  const rnd = (): number => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return s | 0;
  };
  for (let i = 0; i < ZP_LO.length; i++) { ZP_LO[i] = rnd(); ZP_HI[i] = rnd(); }
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rnd(); ZC_HI[i] = rnd(); }
  for (let i = 0; i < 8; i++) { ZE_LO[i] = rnd(); ZE_HI[i] = rnd(); }
  Z_SIDE_LO = rnd();
  Z_SIDE_HI = rnd();
})();

const STACK = 2048;

export interface GameStatus {
  over: boolean;
  /** '1-0' | '0-1' | '1/2-1/2' | '*' */
  result: string;
  /** checkmate | stalemate | fifty-move | repetition | insufficient | '' */
  reason: string;
}

export class Position {
  board = new Int8Array(128);
  side = WHITE;
  castle = 0;
  ep = -1;
  half = 0;
  full = 1;
  kingSq = [4, 116];
  hashLo = 0;
  hashHi = 0;
  epH = -1; // file of ep square included in hash, or -1
  score = 0; // white-perspective material + PST (no kings)
  phase = 0;
  ply = 0;

  // undo stack
  uMove = new Int32Array(STACK);
  uCap = new Int8Array(STACK);
  uCastle = new Int8Array(STACK);
  uEp = new Int16Array(STACK);
  uEpH = new Int8Array(STACK);
  uHalf = new Int16Array(STACK);
  uLo = new Int32Array(STACK);
  uHi = new Int32Array(STACK);
  uScore = new Int32Array(STACK);
  uPhase = new Int8Array(STACK);

  constructor(fen?: string) {
    this.setFen(fen === undefined ? START_FEN : fen);
  }

  clone(): Position {
    const p = new Position(START_FEN);
    p.board.set(this.board);
    p.side = this.side; p.castle = this.castle; p.ep = this.ep; p.half = this.half; p.full = this.full;
    p.kingSq = [this.kingSq[0], this.kingSq[1]];
    p.hashLo = this.hashLo; p.hashHi = this.hashHi; p.epH = this.epH;
    p.score = this.score; p.phase = this.phase; p.ply = this.ply;
    const n = this.ply;
    p.uMove.set(this.uMove.subarray(0, n));
    p.uCap.set(this.uCap.subarray(0, n));
    p.uCastle.set(this.uCastle.subarray(0, n));
    p.uEp.set(this.uEp.subarray(0, n));
    p.uEpH.set(this.uEpH.subarray(0, n));
    p.uHalf.set(this.uHalf.subarray(0, n));
    p.uLo.set(this.uLo.subarray(0, n));
    p.uHi.set(this.uHi.subarray(0, n));
    p.uScore.set(this.uScore.subarray(0, n));
    p.uPhase.set(this.uPhase.subarray(0, n));
    return p;
  }

  setFen(fen: string): void {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) throw new Error('Bad FEN');
    this.board.fill(0);
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('Bad FEN board');
    const map: { [k: string]: number } = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    let kings = [0, 0];
    for (let i = 0; i < 8; i++) {
      const r = 7 - i;
      let f = 0;
      const row = rows[i];
      for (let j = 0; j < row.length; j++) {
        const ch = row.charAt(j);
        if (ch >= '1' && ch <= '8') { f += ch.charCodeAt(0) - 48; continue; }
        const lower = ch.toLowerCase();
        const t = map[lower];
        if (!t || f > 7) throw new Error('Bad FEN piece');
        const color = ch === lower ? BLACK : WHITE;
        this.board[r * 16 + f] = t | (color << 3);
        if (t === KING) { this.kingSq[color] = r * 16 + f; kings[color]++; }
        f++;
      }
      if (f !== 8) throw new Error('Bad FEN row');
    }
    if (kings[0] !== 1 || kings[1] !== 1) throw new Error('Bad FEN kings');
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    const cs = parts[2] || '-';
    let c = 0;
    if (cs.indexOf('K') >= 0) c |= CASTLE_WK;
    if (cs.indexOf('Q') >= 0) c |= CASTLE_WQ;
    if (cs.indexOf('k') >= 0) c |= CASTLE_BK;
    if (cs.indexOf('q') >= 0) c |= CASTLE_BQ;
    // sanitize rights against actual placement
    if (this.board[4] !== (KING)) c &= ~(CASTLE_WK | CASTLE_WQ);
    if (this.board[116] !== (KING | 8)) c &= ~(CASTLE_BK | CASTLE_BQ);
    if (this.board[7] !== ROOK) c &= ~CASTLE_WK;
    if (this.board[0] !== ROOK) c &= ~CASTLE_WQ;
    if (this.board[119] !== (ROOK | 8)) c &= ~CASTLE_BK;
    if (this.board[112] !== (ROOK | 8)) c &= ~CASTLE_BQ;
    this.castle = c;
    this.ep = parts[3] && parts[3] !== '-' ? sqFromName(parts[3]) : -1;
    this.half = parts[4] ? parseInt(parts[4], 10) || 0 : 0;
    this.full = parts[5] ? parseInt(parts[5], 10) || 1 : 1;
    this.ply = 0;
    this.recompute();
  }

  /** Recompute hash, score, phase from scratch. */
  private recompute(): void {
    let lo = 0, hi = 0, score = 0, phase = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.board[sq];
      if (!p) continue;
      lo ^= ZP_LO[p * 128 + sq]; hi ^= ZP_HI[p * 128 + sq];
      score += PST[p * 128 + sq];
      phase += PHASE_W[p & 7];
    }
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    if (this.side === BLACK) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
    this.epH = -1;
    if (this.ep >= 0 && this.epCapturable()) {
      this.epH = this.ep & 7;
      lo ^= ZE_LO[this.epH]; hi ^= ZE_HI[this.epH];
    }
    this.hashLo = lo; this.hashHi = hi; this.score = score; this.phase = phase;
  }

  /** True if the side to move has a pawn adjacent to the pawn that just double-pushed. */
  private epCapturable(): boolean {
    const ep = this.ep;
    const me = this.side;
    const pawn = PAWN | (me << 3);
    const behind = me === WHITE ? ep - 16 : ep + 16;
    const l = behind - 1;
    const r = behind + 1;
    return (!(l & 0x88) && this.board[l] === pawn) || (!(r & 0x88) && this.board[r] === pawn);
  }

  toFen(): string {
    const chars = ' PNBRQK';
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += String(empty); empty = 0; }
        const ch = chars.charAt(p & 7);
        out += (p >> 3) ? ch.toLowerCase() : ch;
      }
      if (empty) out += String(empty);
      if (r > 0) out += '/';
    }
    let cs = '';
    if (this.castle & CASTLE_WK) cs += 'K';
    if (this.castle & CASTLE_WQ) cs += 'Q';
    if (this.castle & CASTLE_BK) cs += 'k';
    if (this.castle & CASTLE_BQ) cs += 'q';
    return out + ' ' + (this.side === WHITE ? 'w' : 'b') + ' ' + (cs || '-') + ' '
      + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
  }

  /** Is `sq` attacked by color `by`? */
  isAttacked(sq: number, by: number): boolean {
    const b = this.board;
    const cs = by << 3;
    // pawns
    if (by === WHITE) {
      let s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      let s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
    }
    const n = KNIGHT | cs;
    for (let i = 0; i < 8; i++) {
      const s = sq + KNIGHT_OFFS[i];
      if (!(s & 0x88) && b[s] === n) return true;
    }
    const k = KING | cs;
    for (let i = 0; i < 8; i++) {
      const s = sq + KING_OFFS[i];
      if (!(s & 0x88) && b[s] === k) return true;
    }
    const bq1 = BISHOP | cs, q = QUEEN | cs, r = ROOK | cs;
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_OFFS[i];
      let s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === bq1 || p === q) return true; break; }
        s += d;
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_OFFS[i];
      let s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === r || p === q) return true; break; }
        s += d;
      }
    }
    return false;
  }

  inCheck(color: number = this.side): boolean {
    return this.isAttacked(this.kingSq[color], color ^ 1);
  }

  /**
   * Generate pseudo-legal moves into `out`. If `noisy` only captures and
   * queen promotions are generated. Returns the count.
   */
  gen(out: Int32Array, noisy: boolean): number {
    const b = this.board;
    const us = this.side;
    const them = us ^ 1;
    let n = 0;
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const p = b[from];
      if (!p || (p >> 3) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 6 : 1;
        const rank = from >> 4;
        const one = from + fwd;
        if (b[one] === 0) {
          if (rank === promoRank) {
            n = this.addPromos(out, n, from, one, 0, !noisy);
          } else if (!noisy) {
            out[n++] = from | (one << 7);
            if (rank === startRank && b[one + fwd] === 0) {
              out[n++] = from | ((one + fwd) << 7) | (F_DOUBLE << 17);
            }
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const to = from + fwd + side;
          if (to & 0x88) continue;
          const tp = b[to];
          if (tp && (tp >> 3) === them) {
            if (rank === promoRank) n = this.addPromos(out, n, from, to, F_CAPTURE, !noisy);
            else out[n++] = from | (to << 7) | (F_CAPTURE << 17);
          } else if (to === this.ep && !tp) {
            out[n++] = from | (to << 7) | ((F_CAPTURE | F_EP) << 17);
          }
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KNIGHT_OFFS : KING_OFFS;
        for (let i = 0; i < 8; i++) {
          const to = from + offs[i];
          if (to & 0x88) continue;
          const tp = b[to];
          if (!tp) { if (!noisy) out[n++] = from | (to << 7); }
          else if ((tp >> 3) === them) out[n++] = from | (to << 7) | (F_CAPTURE << 17);
        }
        if (t === KING && !noisy) n = this.genCastle(out, n, from, us);
      } else {
        const offs = t === BISHOP ? BISHOP_OFFS : t === ROOK ? ROOK_OFFS : KING_OFFS;
        for (let i = 0; i < 4 + (t === QUEEN ? 4 : 0); i++) {
          const d = offs[i];
          let to = from + d;
          while (!(to & 0x88)) {
            const tp = b[to];
            if (!tp) {
              if (!noisy) out[n++] = from | (to << 7);
            } else {
              if ((tp >> 3) === them) out[n++] = from | (to << 7) | (F_CAPTURE << 17);
              break;
            }
            to += d;
          }
        }
      }
    }
    return n;
  }

  private addPromos(out: Int32Array, n: number, from: number, to: number, flags: number, all: boolean): number {
    out[n++] = from | (to << 7) | (QUEEN << 14) | (flags << 17);
    if (all) {
      out[n++] = from | (to << 7) | (KNIGHT << 14) | (flags << 17);
      out[n++] = from | (to << 7) | (ROOK << 14) | (flags << 17);
      out[n++] = from | (to << 7) | (BISHOP << 14) | (flags << 17);
    }
    return n;
  }

  private genCastle(out: Int32Array, n: number, from: number, us: number): number {
    const b = this.board;
    const them = us ^ 1;
    if (us === WHITE) {
      if (from !== 4) return n;
      if ((this.castle & CASTLE_WK) && !b[5] && !b[6]
        && !this.isAttacked(4, them) && !this.isAttacked(5, them)) {
        out[n++] = 4 | (6 << 7) | (F_CASTLE << 17);
      }
      if ((this.castle & CASTLE_WQ) && !b[3] && !b[2] && !b[1]
        && !this.isAttacked(4, them) && !this.isAttacked(3, them)) {
        out[n++] = 4 | (2 << 7) | (F_CASTLE << 17);
      }
    } else {
      if (from !== 116) return n;
      if ((this.castle & CASTLE_BK) && !b[117] && !b[118]
        && !this.isAttacked(116, them) && !this.isAttacked(117, them)) {
        out[n++] = 116 | (118 << 7) | (F_CASTLE << 17);
      }
      if ((this.castle & CASTLE_BQ) && !b[115] && !b[114] && !b[113]
        && !this.isAttacked(116, them) && !this.isAttacked(115, them)) {
        out[n++] = 116 | (114 << 7) | (F_CASTLE << 17);
      }
    }
    return n;
  }

  /** Make a pseudo-legal move. Caller must check legality via `inCheck(movedSide)`. */
  make(m: number): void {
    const b = this.board;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flags = m >> 17;
    const us = this.side;
    const p = b[from];
    const i = this.ply++;
    this.uMove[i] = m;
    this.uCastle[i] = this.castle;
    this.uEp[i] = this.ep;
    this.uEpH[i] = this.epH;
    this.uHalf[i] = this.half;
    this.uLo[i] = this.hashLo;
    this.uHi[i] = this.hashHi;
    this.uScore[i] = this.score;
    this.uPhase[i] = this.phase;

    let lo = this.hashLo, hi = this.hashHi, score = this.score, phase = this.phase;
    // remove old castle/ep hash
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    if (this.epH >= 0) { lo ^= ZE_LO[this.epH]; hi ^= ZE_HI[this.epH]; }

    let cap = b[to];
    if (flags & F_EP) {
      const capSq = us === WHITE ? to - 16 : to + 16;
      cap = b[capSq];
      b[capSq] = 0;
      lo ^= ZP_LO[cap * 128 + capSq]; hi ^= ZP_HI[cap * 128 + capSq];
      score -= PST[cap * 128 + capSq];
    } else if (cap) {
      lo ^= ZP_LO[cap * 128 + to]; hi ^= ZP_HI[cap * 128 + to];
      score -= PST[cap * 128 + to];
      phase -= PHASE_W[cap & 7];
    }
    this.uCap[i] = cap;

    b[from] = 0;
    lo ^= ZP_LO[p * 128 + from]; hi ^= ZP_HI[p * 128 + from];
    score -= PST[p * 128 + from];
    let placed = p;
    if (promo) {
      placed = promo | (us << 3);
      phase += PHASE_W[promo];
    }
    b[to] = placed;
    lo ^= ZP_LO[placed * 128 + to]; hi ^= ZP_HI[placed * 128 + to];
    score += PST[placed * 128 + to];

    if ((p & 7) === KING) this.kingSq[us] = to;
    if (flags & F_CASTLE) {
      let rf: number, rt: number;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      const rook = b[rf];
      b[rf] = 0; b[rt] = rook;
      lo ^= ZP_LO[rook * 128 + rf] ^ ZP_LO[rook * 128 + rt];
      hi ^= ZP_HI[rook * 128 + rf] ^ ZP_HI[rook * 128 + rt];
      score += PST[rook * 128 + rt] - PST[rook * 128 + rf];
    }

    this.castle &= CMASK[from] & CMASK[to];
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    this.ep = (flags & F_DOUBLE) ? (from + to) >> 1 : -1;
    this.half = ((p & 7) === PAWN || cap) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = us ^ 1;
    lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
    this.epH = -1;
    if (this.ep >= 0 && this.epCapturable()) {
      this.epH = this.ep & 7;
      lo ^= ZE_LO[this.epH]; hi ^= ZE_HI[this.epH];
    }
    this.hashLo = lo; this.hashHi = hi; this.score = score; this.phase = phase;
  }

  unmake(): void {
    const i = --this.ply;
    const m = this.uMove[i];
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flags = m >> 17;
    const b = this.board;
    const us = this.side ^ 1;
    const cap = this.uCap[i];
    this.side = us;
    if (us === BLACK) this.full--;
    const moved = b[to];
    const orig = promo ? (PAWN | (us << 3)) : moved;
    b[from] = orig;
    if ((orig & 7) === KING) this.kingSq[us] = from;
    if (flags & F_EP) {
      b[to] = 0;
      b[us === WHITE ? to - 16 : to + 16] = cap;
    } else {
      b[to] = cap;
    }
    if (flags & F_CASTLE) {
      let rf: number, rt: number;
      if (to > from) { rf = to + 1; rt = to - 1; } else { rf = to - 2; rt = to + 1; }
      b[rf] = b[rt]; b[rt] = 0;
    }
    this.castle = this.uCastle[i];
    this.ep = this.uEp[i];
    this.epH = this.uEpH[i];
    this.half = this.uHalf[i];
    this.hashLo = this.uLo[i];
    this.hashHi = this.uHi[i];
    this.score = this.uScore[i];
    this.phase = this.uPhase[i];
  }

  /** Fully legal moves as an array of encoded ints. */
  legalMoves(): number[] {
    const buf = new Int32Array(256);
    const n = this.gen(buf, false);
    const us = this.side;
    const res: number[] = [];
    for (let i = 0; i < n; i++) {
      this.make(buf[i]);
      if (!this.inCheck(us)) res.push(buf[i]);
      this.unmake();
    }
    return res;
  }

  hasLegalMove(): boolean {
    const buf = new Int32Array(256);
    const n = this.gen(buf, false);
    const us = this.side;
    for (let i = 0; i < n; i++) {
      this.make(buf[i]);
      const ok = !this.inCheck(us);
      this.unmake();
      if (ok) return true;
    }
    return false;
  }

  /** Find the legal move matching a UCI string, or -1. */
  parseUci(s: string): number {
    if (s.length < 4) return -1;
    const from = sqFromName(s.substring(0, 2));
    const to = sqFromName(s.substring(2, 4));
    if (from < 0 || to < 0) return -1;
    const pc = s.length > 4 ? 'nbrq'.indexOf(s.charAt(4)) + 2 : 0;
    if (s.length > 4 && pc < 2) return -1;
    const moves = this.legalMoves();
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (moveFrom(m) === from && moveTo(m) === to && movePromo(m) === pc) return m;
    }
    return -1;
  }

  /** Apply a move from UCI. Returns false if illegal. */
  playUci(s: string): boolean {
    const m = this.parseUci(s);
    if (m < 0) return false;
    this.make(m);
    return true;
  }

  /** SAN for a legal move in the current position (does not change position). */
  san(m: number): string {
    const b = this.board;
    const from = moveFrom(m), to = moveTo(m), promo = movePromo(m), flags = moveFlags(m);
    const p = b[from];
    const t = p & 7;
    let s = '';
    if (flags & F_CASTLE) {
      s = to > from ? 'O-O' : 'O-O-O';
    } else {
      const isCap = (flags & F_CAPTURE) !== 0;
      if (t === PAWN) {
        if (isCap) s += 'abcdefgh'.charAt(from & 7) + 'x';
      } else {
        s += ' PNBRQK'.charAt(t);
        // disambiguation
        const all = this.legalMoves();
        let sameFile = false, sameRank = false, ambiguous = false;
        for (let i = 0; i < all.length; i++) {
          const o = all[i];
          const of = moveFrom(o);
          if (of === from || moveTo(o) !== to || (b[of] & 7) !== t) continue;
          ambiguous = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (ambiguous) {
          if (!sameFile) s += 'abcdefgh'.charAt(from & 7);
          else if (!sameRank) s += String((from >> 4) + 1);
          else s += sqName(from);
        }
        if (isCap) s += 'x';
      }
      s += sqName(to);
      if (promo) s += '=' + ' PNBRQK'.charAt(promo);
    }
    const us = this.side;
    this.make(m);
    if (this.inCheck(this.side)) s += this.hasLegalMove() ? '+' : '#';
    this.unmake();
    void us;
    return s;
  }

  /** Number of times the current position has occurred (including now). */
  repetitions(): number {
    let count = 1;
    const lim = Math.min(this.half, this.ply);
    for (let k = 2; k <= lim; k += 2) {
      const i = this.ply - k;
      if (this.uLo[i] === this.hashLo && this.uHi[i] === this.hashHi) count++;
    }
    return count;
  }

  isInsufficientMaterial(): boolean {
    const b = this.board;
    let minors = 0, knights = 0;
    let bishopColors = 0; // bit0 light-square bishop present, bit1 dark
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const t = b[sq] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else bishopColors |= (((sq >> 4) + (sq & 7)) & 1) ? 1 : 2;
    }
    if (minors <= 1) return true;
    if (knights === 0 && bishopColors !== 3) return true;
    return false;
  }

  status(): GameStatus {
    if (!this.hasLegalMove()) {
      if (this.inCheck()) {
        return { over: true, result: this.side === WHITE ? '0-1' : '1-0', reason: 'checkmate' };
      }
      return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (this.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
    if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition' };
    if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move' };
    return { over: false, result: '*', reason: '' };
  }

  /** Static evaluation from the side-to-move's perspective. */
  evaluate(): number {
    const ph = this.phase > 24 ? 24 : this.phase;
    const wk = this.kingSq[0], bk = this.kingSq[1];
    const mg = KMG[wk] - KMG[128 + bk];
    const eg = KEG[wk] - KEG[128 + bk];
    const s = this.score + ((mg * ph + eg * (24 - ph)) / 24 | 0);
    return (this.side === WHITE ? s : -s) + 8;
  }
}

/** Count leaf nodes (for testing). */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const bufs: Int32Array[] = [];
  for (let i = 0; i <= depth; i++) bufs.push(new Int32Array(256));
  const rec = (d: number): number => {
    const buf = bufs[d];
    const n = pos.gen(buf, false);
    const us = pos.side;
    let total = 0;
    for (let i = 0; i < n; i++) {
      pos.make(buf[i]);
      if (!pos.inCheck(us)) total += d === 1 ? 1 : rec(d - 1);
      pos.unmake();
    }
    return total;
  };
  return rec(depth);
}
