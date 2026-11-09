// Search: iterative deepening negamax, alpha-beta, quiescence, TT, time-sliced and resumable.
import { Position, PIECE_VALUE, moveToUci, F_CAPTURE, F_EP, QUEEN } from './engine';

export interface LevelConfig {
  name: string;
  depth: number;
  ms: number;
  randomP: number;
}
export const LEVELS: LevelConfig[] = [
  { name: 'Beginner', depth: 1, ms: 300, randomP: 0.25 },
  { name: 'Casual', depth: 3, ms: 600, randomP: 0 },
  { name: 'Strong', depth: 8, ms: 2500, randomP: 0 },
];

export interface SearchResult {
  move: number;
  uci: string;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
}

const INF = 32000;
const MATE = 30000;
const MATE_BOUND = MATE - 200;
const MAXPLY = 80;

// ---- Transposition table (shared) ----
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const tLo = new Int32Array(TT_SIZE);
const tHi = new Int32Array(TT_SIZE);
const tScore = new Int16Array(TT_SIZE);
const tDepth = new Int8Array(TT_SIZE);
const tFlag = new Uint8Array(TT_SIZE); // 0 empty, 1 exact, 2 lower, 3 upper
const tMove = new Int32Array(TT_SIZE);
const tGen = new Uint8Array(TT_SIZE);
let generation = 0;

export function clearTT(): void {
  tFlag.fill(0);
}

// ---- Tiny opening book (UCI move history -> replies) ----
const BOOK: { [k: string]: string[] } = {
  '': ['e2e4', 'd2d4', 'g1f3', 'c2c4'],
  'e2e4': ['e7e5', 'c7c5', 'e7e6', 'c7c6'],
  'd2d4': ['d7d5', 'g8f6', 'e7e6'],
  'g1f3': ['d7d5', 'g8f6', 'c7c5'],
  'c2c4': ['e7e5', 'g8f6', 'c7c5'],
  'e2e4 e7e5': ['g1f3', 'f1c4'],
  'e2e4 e7e5 g1f3': ['b8c6', 'g8f6'],
  'e2e4 e7e5 g1f3 b8c6': ['f1b5', 'f1c4', 'd2d4'],
  'e2e4 c7c5': ['g1f3', 'b1c3'],
  'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6'],
  'e2e4 e7e6': ['d2d4'],
  'e2e4 e7e6 d2d4': ['d7d5'],
  'e2e4 c7c6': ['d2d4'],
  'd2d4 d7d5': ['c2c4', 'g1f3'],
  'd2d4 d7d5 c2c4': ['e7e6', 'c7c6', 'd5c4'],
  'd2d4 g8f6': ['c2c4', 'g1f3'],
  'd2d4 g8f6 c2c4': ['e7e6', 'g7g6'],
  'g1f3 d7d5': ['d2d4', 'c2c4'],
  'g1f3 g8f6': ['c2c4', 'd2d4'],
  'c2c4 e7e5': ['b1c3', 'g1f3'],
};

class Searcher {
  nodes = 0;
  aborted = false;
  deadline = 0;
  rootMove = 0;
  rootScore = 0;
  prevBest = 0;
  killers = new Int32Array(MAXPLY * 2);
  hist = new Int32Array(128 * 128);
  moves: Int32Array[] = [];
  scores: Int32Array[] = [];
  constructor(public pos: Position) {
    for (let i = 0; i < MAXPLY; i++) {
      this.moves.push(new Int32Array(256));
      this.scores.push(new Int32Array(256));
    }
  }

  private scoreMoves(ply: number, n: number, ttMove: number, noisy: boolean): void {
    const mv = this.moves[ply];
    const sc = this.scores[ply];
    const b = this.pos.board;
    const k0 = this.killers[ply * 2], k1 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = mv[i];
      let s: number;
      if (m === ttMove) s = 2000000;
      else if (ply === 0 && m === this.prevBest) s = 1900000;
      else {
        const flags = m >> 17;
        const promo = (m >> 14) & 7;
        if (flags & F_CAPTURE) {
          const victim = (flags & F_EP) ? 1 : (b[(m >> 7) & 127] & 7);
          const att = b[m & 127] & 7;
          s = 1000000 + victim * 16 - att;
        } else if (promo === QUEEN) s = 900000;
        else if (!noisy && m === k0) s = 800000;
        else if (!noisy && m === k1) s = 790000;
        else s = noisy ? 0 : this.hist[(m & 127) * 128 + ((m >> 7) & 127)];
        if (promo && promo !== QUEEN) s = -1;
      }
      sc[i] = s;
    }
  }

  qsearch(alpha: number, beta: number, ply: number): number {
    const pos = this.pos;
    if ((++this.nodes & 255) === 0 && Date.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;
    const stand = pos.evaluate();
    if (ply >= MAXPLY - 1) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const mv = this.moves[ply];
    const sc = this.scores[ply];
    const n = pos.gen(mv, true);
    this.scoreMoves(ply, n, 0, true);
    const us = pos.side;
    const b = pos.board;
    for (let i = 0; i < n; i++) {
      // selection sort pick
      let bi = i;
      for (let j = i + 1; j < n; j++) if (sc[j] > sc[bi]) bi = j;
      const m = mv[bi];
      mv[bi] = mv[i]; mv[i] = m;
      const t = sc[bi]; sc[bi] = sc[i]; sc[i] = t;
      const flags = m >> 17;
      if (!((m >> 14) & 7)) {
        const victim = (flags & F_EP) ? 1 : (b[(m >> 7) & 127] & 7);
        if (stand + PIECE_VALUE[victim] + 200 < alpha) continue;
      }
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(); continue; }
      const s = -this.qsearch(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.aborted) return 0;
      if (s > alpha) {
        alpha = s;
        if (s >= beta) return s;
      }
    }
    return alpha;
  }

  negamax(depth: number, alpha: number, beta: number, ply: number): number {
    const pos = this.pos;
    if ((++this.nodes & 255) === 0 && Date.now() > this.deadline) this.aborted = true;
    if (this.aborted) return 0;
    if (ply > 0) {
      if (pos.half >= 100 || pos.repetitions() >= 2) return 0;
    }
    if (ply >= MAXPLY - 1) return pos.evaluate();
    const us = pos.side;
    const inCheck = pos.inCheck(us);
    if (inCheck && ply < 40) depth++;
    if (depth <= 0) return this.qsearch(alpha, beta, ply);

    const lo = pos.hashLo, hi = pos.hashHi;
    const idx = lo & TT_MASK;
    let ttMove = 0;
    if (tFlag[idx] !== 0 && tLo[idx] === lo && tHi[idx] === hi) {
      ttMove = tMove[idx];
      if (tDepth[idx] >= depth && ply > 0) {
        let s = tScore[idx];
        if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
        const f = tFlag[idx];
        if (f === 1) return s;
        if (f === 2) { if (s > alpha) alpha = s; }
        else if (s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }

    const alpha0 = alpha;
    const mv = this.moves[ply];
    const sc = this.scores[ply];
    const n = pos.gen(mv, false);
    this.scoreMoves(ply, n, ttMove, false);
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (let i = 0; i < n; i++) {
      let bi = i;
      for (let j = i + 1; j < n; j++) if (sc[j] > sc[bi]) bi = j;
      const m = mv[bi];
      mv[bi] = mv[i]; mv[i] = m;
      const t = sc[bi]; sc[bi] = sc[i]; sc[i] = t;
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(); continue; }
      legal++;
      const quiet = !(m >> 17 & F_CAPTURE) && !((m >> 14) & 7);
      let s: number;
      if (legal === 1) {
        s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      } else {
        let red = 0;
        if (depth >= 3 && legal > 4 && quiet && !inCheck) red = 1;
        s = -this.negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (s > alpha && !this.aborted && (red > 0 || s < beta)) {
          s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        }
      }
      pos.unmake();
      if (this.aborted) return 0;
      if (s > best) {
        best = s;
        bestMove = m;
        if (s > alpha) {
          alpha = s;
          if (ply === 0) { this.rootMove = m; this.rootScore = s; }
          if (s >= beta) {
            if (quiet) {
              if (this.killers[ply * 2] !== m) {
                this.killers[ply * 2 + 1] = this.killers[ply * 2];
                this.killers[ply * 2] = m;
              }
              const h = (m & 127) * 128 + ((m >> 7) & 127);
              const v = this.hist[h] + depth * depth;
              this.hist[h] = v > 60000 ? 60000 : v;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    if (tFlag[idx] === 0 || tGen[idx] !== generation || depth >= tDepth[idx] || tLo[idx] !== lo) {
      let s = best;
      if (s > MATE_BOUND) s += ply; else if (s < -MATE_BOUND) s -= ply;
      tLo[idx] = lo; tHi[idx] = hi;
      tScore[idx] = s;
      tDepth[idx] = depth;
      tFlag[idx] = best <= alpha0 ? 3 : best >= beta ? 2 : 1;
      tMove[idx] = bestMove;
      tGen[idx] = generation;
    }
    return best;
  }
}

/** Resumable search job. Call step() repeatedly until it returns true. */
export class SearchJob {
  result: SearchResult | null = null;
  private s: Searcher;
  private level: LevelConfig;
  private depth = 1;
  private spent = 0;
  private bestMove = 0;
  private bestScore = 0;
  private doneDepth = 0;
  private aborted = false;
  private rootMoves: number[];

  constructor(pos: Position, levelIndex: number, history: string[] = [], rng: () => number = Math.random) {
    this.level = LEVELS[levelIndex] || LEVELS[1];
    this.s = new Searcher(pos);
    generation = (generation + 1) & 255;
    this.rootMoves = pos.legalMoves();
    if (this.rootMoves.length === 0) {
      this.finish(0, 0);
      return;
    }
    if (this.rootMoves.length === 1) {
      this.bestMove = this.rootMoves[0];
      this.finish(0, 0);
      return;
    }
    if (this.level.randomP > 0 && rng() < this.level.randomP) {
      this.bestMove = this.rootMoves[Math.floor(rng() * this.rootMoves.length)];
      this.finish(0, 0);
      return;
    }
    if (levelIndex >= 1) {
      const book = BOOK[history.join(' ')];
      if (book) {
        const cand = book[Math.floor(rng() * book.length)];
        const m = pos.parseUci(cand);
        if (m >= 0) { this.bestMove = m; this.finish(0, 0); }
      }
    }
  }

  private finish(score: number, depth: number): void {
    this.result = {
      move: this.bestMove,
      uci: this.bestMove ? moveToUci(this.bestMove) : '',
      score,
      depth,
      nodes: this.s.nodes,
      ms: this.spent,
    };
  }

  abort(): void {
    this.aborted = true;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  /** Run for about `sliceMs`. Returns true when the result is ready. */
  step(sliceMs: number): boolean {
    if (this.result) return true;
    if (this.aborted) return false;
    const s = this.s;
    const t0 = Date.now();
    const limit = this.level.ms;
    for (;;) {
      // Depth 1 always completes so there is always a move.
      s.deadline = this.depth === 1 ? Date.now() + 100000 : Math.min(t0 + sliceMs, t0 + (limit - this.spent));
      s.aborted = false;
      s.rootMove = 0;
      s.prevBest = this.bestMove;
      s.negamax(this.depth, -INF, INF, 0);
      if (!s.aborted) {
        if (s.rootMove) {
          this.bestMove = s.rootMove;
          this.bestScore = s.rootScore;
        }
        this.doneDepth = this.depth;
        this.depth++;
        const used = this.spent + (Date.now() - t0);
        if (this.doneDepth >= this.level.depth || this.bestScore > MATE_BOUND || this.bestScore < -MATE_BOUND
          || used > limit * 0.6) {
          this.spent = used;
          this.finish(this.bestScore, this.doneDepth);
          return true;
        }
        if (Date.now() - t0 >= sliceMs) {
          this.spent = used;
          return false;
        }
      } else {
        // slice or time cap reached mid-iteration
        const used = this.spent + (Date.now() - t0);
        this.spent = used;
        if (used >= limit) {
          if (s.rootMove && this.depth > 1) { this.bestMove = s.rootMove; this.bestScore = s.rootScore; }
          this.finish(this.bestScore, this.doneDepth);
          return true;
        }
        return false;
      }
    }
  }
}

/**
 * Drive a SearchJob in ~30 ms slices, yielding to the event loop between them.
 * Returns a handle with abort(). onDone is not called after abort().
 */
export function think(
  pos: Position,
  levelIndex: number,
  history: string[],
  onDone: (r: SearchResult) => void,
  sliceMs: number = 30,
): { abort: () => void } {
  const job = new SearchJob(pos, levelIndex, history);
  let dead = false;
  const tick = () => {
    if (dead) return;
    const done = job.step(sliceMs);
    if (dead) return;
    if (done && job.result) onDone(job.result);
    else setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  return { abort: () => { dead = true; job.abort(); } };
}

/** Synchronous search (tests). */
export function searchSync(pos: Position, levelIndex: number, history: string[] = [], rng?: () => number): SearchResult {
  const job = new SearchJob(pos, levelIndex, history, rng);
  while (!job.step(1000000)) { /* spin */ }
  return job.result as SearchResult;
}
