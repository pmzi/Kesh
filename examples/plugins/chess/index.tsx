import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions } from 'react-native';
import { theme, storage, haptics } from '@kesh/sdk';
import { Position, START_FEN, WHITE, BLACK, PIECE_VALUE, moveFrom, moveTo, movePromo, moveFlags, moveToUci, sqName, F_CAPTURE } from './engine';
import type { GameStatus } from './engine';
import { LEVELS, think } from './ai';

const KEY = 'chess:v1';
// Filled glyphs for both sides; U+FE0E forces text presentation (no emoji on iOS).
const GLYPH = ['', '♟︎', '♞︎', '♝︎', '♜︎', '♛︎', '♚︎'];
// Cobalt tints (accent at ~25% over white and variations). Red is the only extra hue.
const DARK_SQ = '#C9D4F5';
const SEL_SQ = '#8CA5F7';
const LAST_LIGHT = '#DDE5FB';
const LAST_DARK = '#B4C4F2';
const CHECK_SQ = '#F4B6B6';
const INIT_COUNT = [0, 8, 2, 2, 2, 1];

interface Game { moves: string[]; sans: string[]; status: GameStatus }
const PLAYING: GameStatus = { over: false, result: '*', reason: '' };

function hap(f: () => void): void {
  try { f(); } catch (e) { /* permission or host without haptics */ }
}

function replay(fen: string, moves: string[], upTo: number): { pos: Position; sans: string[]; n: number } {
  const pos = new Position(fen);
  const sans: string[] = [];
  let n = 0;
  for (let i = 0; i < upTo && i < moves.length; i++) {
    const m = pos.parseUci(moves[i]);
    if (m < 0) break;
    sans.push(pos.san(m));
    pos.make(m);
    n++;
  }
  return { pos, sans, n };
}

function reasonText(st: GameStatus): string {
  switch (st.reason) {
    case 'checkmate': return 'Checkmate';
    case 'stalemate': return 'Stalemate';
    case 'repetition': return 'Draw by threefold repetition';
    case 'fifty-move': return 'Draw by the fifty-move rule';
    case 'insufficient': return 'Draw by insufficient material';
    case 'resignation': return 'Resignation';
    default: return '';
  }
}

export default function Chess() {
  const { colors, fonts } = theme;
  const [loaded, setLoaded] = useState(false);
  const [game, setGameState] = useState<Game>({ moves: [], sans: [], status: PLAYING });
  const [color, setColor] = useState(WHITE);
  const [level, setLevel] = useState(1);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [hasGame, setHasGame] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [overlayHidden, setOverlayHidden] = useState(false);
  const [dots, setDots] = useState(0);
  const [pickColor, setPickColor] = useState(0); // 0 white, 1 black, 2 random
  const [pickLevel, setPickLevel] = useState(1);
  const [gid, setGid] = useState(0);

  const posRef = useRef<Position | null>(null);
  const gref = useRef<Game>(game);
  const colorRef = useRef(WHITE);
  const startFen = useRef(START_FEN);
  const scrollRef = useRef<any>(null);

  const P = (): Position => {
    if (!posRef.current) posRef.current = new Position(startFen.current);
    return posRef.current;
  };
  const setGame = (g: Game) => { gref.current = g; setGameState(g); };

  // ---- load ----
  useEffect(() => {
    let alive = true;
    (async () => {
      let ok = false;
      try {
        const raw = await storage.get(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d.fen === 'string' && Array.isArray(d.moves)) {
            const r = replay(d.fen, d.moves.filter((x: unknown) => typeof x === 'string'), 100000);
            startFen.current = d.fen;
            posRef.current = r.pos;
            const c = d.color === BLACK ? BLACK : WHITE;
            colorRef.current = c;
            const st: GameStatus = d.status && d.status.over ? d.status : r.pos.status();
            if (alive) {
              setColor(c);
              setLevel(d.level === 0 || d.level === 2 ? d.level : 1);
              setFlipped(!!d.flipped);
              setGame({ moves: d.moves.slice(0, r.n), sans: r.sans, status: st });
              setHasGame(true);
              ok = true;
            }
          }
        }
      } catch (e) { ok = false; }
      if (!alive) return;
      if (!ok) setShowNew(true);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  // ---- persist ----
  useEffect(() => {
    if (!loaded) return;
    try {
      storage.set(KEY, JSON.stringify({ fen: startFen.current, moves: game.moves, color, level, flipped, status: game.status })).catch(() => {});
    } catch (e) { /* ignore */ }
  }, [loaded, game, color, level, flipped]);

  // ---- commit a move (user or computer) ----
  const commit = (uci: string) => {
    const pos = P();
    const m = pos.parseUci(uci);
    if (m < 0) return;
    const g = gref.current;
    const san = pos.san(m);
    const cap = (moveFlags(m) & F_CAPTURE) !== 0;
    pos.make(m);
    const st = pos.status();
    setGame({ moves: g.moves.concat(uci), sans: g.sans.concat(san), status: st });
    setSelected(-1); setPromo(null); setViewIdx(null); setConfirmResign(false); setOverlayHidden(false);
    if (st.over) {
      const userWon = st.result === (colorRef.current === WHITE ? '1-0' : '0-1');
      hap(() => haptics.notification(st.result === '1/2-1/2' ? 'warning' : userWon ? 'success' : 'error'));
    } else if (pos.inCheck()) hap(() => haptics.notification('warning'));
    else if (cap) hap(() => haptics.impact('medium'));
    else hap(() => haptics.impact('light'));
  };

  // ---- computer turn (resumes after reload) ----
  const turn = game.moves.length;
  useEffect(() => {
    if (!loaded || game.status.over) return;
    const pos = P();
    if (pos.side === color) return;
    const len = turn;
    const h = think(pos.clone(), level, gref.current.moves, (r) => {
      if (gref.current.moves.length === len && !gref.current.status.over) commit(r.uci);
    }, 30);
    return () => h.abort();
  }, [loaded, turn, game.status.over, color, level, gid]);

  const pos = P();
  const computerTurn = loaded && !game.status.over && pos.side !== color;
  useEffect(() => {
    if (!computerTurn) return;
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(id);
  }, [computerTurn]);

  // ---- derived view ----
  const total = game.moves.length;
  const vi = viewIdx === null || viewIdx >= total ? total : viewIdx;
  const reviewing = vi < total;
  const viewPos = useMemo(() => (reviewing ? replay(startFen.current, game.moves, vi).pos : null), [reviewing, vi, game]);
  const vp = viewPos || pos;
  const board = vp.board;
  const fromWhite = (color === WHITE) !== flipped;
  const { width, height } = Dimensions.get('window');
  const S = Math.max(160, Math.floor(Math.min(width - 16, height * 0.52) / 8) * 8);
  const q = S / 8;
  const last = vi > 0 ? game.moves[vi - 1] : '';
  const lastFrom = last ? last.charCodeAt(0) - 97 + (last.charCodeAt(1) - 49) * 16 : -1;
  const lastTo = last ? last.charCodeAt(2) - 97 + (last.charCodeAt(3) - 49) * 16 : -1;
  const checkSq = vp.inCheck() ? vp.kingSq[vp.side] : -1;
  const canMove = loaded && !game.status.over && !reviewing && pos.side === color && !promo && !showNew;
  const targets = useMemo(() => {
    if (selected < 0 || reviewing) return [] as number[];
    return P().legalMoves().filter((m) => moveFrom(m) === selected);
  }, [selected, turn, reviewing]);

  // captured pieces + material
  const counts = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  let matDiff = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = board[sq];
    if (!p) continue;
    counts[p >> 3][p & 7]++;
    matDiff += (p >> 3 ? -1 : 1) * PIECE_VALUE[p & 7];
  }
  const capturedBy = (c: number): string => {
    // pieces of the opposite color that are missing
    const o = c ^ 1;
    let s = '';
    for (let t = 5; t >= 1; t--) {
      const missing = Math.max(0, INIT_COUNT[t] - counts[o][t]);
      for (let k = 0; k < missing; k++) s += GLYPH[t];
    }
    return s;
  };
  const diffFor = (c: number): number => (c === WHITE ? matDiff : -matDiff) / 100;

  // ---- actions ----
  const onSquare = (sq: number) => {
    if (!canMove) return;
    if (selected >= 0) {
      const cands = targets.filter((m) => moveTo(m) === sq);
      if (cands.length) {
        if (movePromo(cands[0])) setPromo({ from: selected, to: sq });
        else commit(moveToUci(cands[0]));
        return;
      }
    }
    const pc = board[sq];
    if (pc && (pc >> 3) === color && sq !== selected) setSelected(sq);
    else setSelected(-1);
  };

  const choosePromo = (t: number) => {
    if (!promo) return;
    commit(sqName(promo.from) + sqName(promo.to) + 'nbrq'.charAt(t - 2));
  };

  const undo = () => {
    const g = gref.current;
    const startSide = new Position(startFen.current).side;
    let n = g.moves.length - 1;
    while (n >= 0 && ((startSide + n) & 1) !== color) n--;
    if (n < 0) return;
    const p = P();
    for (let i = g.moves.length; i > n; i--) p.unmake();
    setGame({ moves: g.moves.slice(0, n), sans: g.sans.slice(0, n), status: PLAYING });
    setSelected(-1); setPromo(null); setViewIdx(null); setConfirmResign(false); setOverlayHidden(false);
    hap(() => haptics.selection());
  };
  const startSide = new Position(startFen.current).side;
  let undoTarget = total - 1;
  while (undoTarget >= 0 && ((startSide + undoTarget) & 1) !== color) undoTarget--;
  const canUndo = loaded && undoTarget >= 0 && !showNew;

  const resign = () => {
    setConfirmResign(false); setMenuOpen(false);
    const st: GameStatus = { over: true, result: color === WHITE ? '0-1' : '1-0', reason: 'resignation' };
    setGame({ ...gref.current, status: st });
    setOverlayHidden(false);
    hap(() => haptics.notification('error'));
  };

  const startNew = () => {
    const c = pickColor === 2 ? (Math.random() < 0.5 ? WHITE : BLACK) : pickColor;
    startFen.current = START_FEN;
    posRef.current = new Position(START_FEN);
    colorRef.current = c;
    setColor(c); setLevel(pickLevel); setFlipped(false);
    setGame({ moves: [], sans: [], status: PLAYING });
    setSelected(-1); setPromo(null); setViewIdx(null); setConfirmResign(false); setMenuOpen(false);
    setOverlayHidden(false); setShowNew(false); setHasGame(true); setGid(gid + 1);
  };

  // ---- ui helpers ----
  const txt = (size: number, weight: string = '400', col: string = colors.text) =>
    ({ fontFamily: fonts.ui, fontSize: size, fontWeight: weight, color: col });
  const pieceText = (p: number, size: number) => ({
    fontSize: size,
    lineHeight: Math.floor(size * 1.15),
    color: (p >> 3) ? '#111111' : '#FFFFFF',
    textShadowColor: (p >> 3) ? '#FFFFFF' : '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: (p >> 3) ? 0 : 2.5,
  });
  const btn = (label: string, onPress: () => void, opts: { primary?: boolean; disabled?: boolean; flex?: number } = {}) => (
    <Pressable
      key={label}
      testID={'btn-' + label}
      disabled={opts.disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: opts.flex === undefined ? 1 : opts.flex,
        minHeight: opts.primary ? 54 : 48,
        paddingHorizontal: 18,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: opts.primary ? colors.accent : 'transparent',
        borderWidth: opts.primary ? 0 : 1,
        borderColor: colors.hairline,
        opacity: opts.disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={txt(16, '600', opts.primary ? colors.accentText : colors.text)}>{label}</Text>
    </Pressable>
  );

  const playerRow = (c: number) => {
    const isUser = c === color;
    const diff = diffFor(c);
    return (
      <View style={{ width: S, height: 32, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={txt(14, '600')}>{isUser ? 'You' : 'Computer'}</Text>
        <Text style={[txt(14, '400', colors.muted), { marginLeft: 6 }]}>{c === WHITE ? 'White' : 'Black'}</Text>
        <Text style={[{ marginLeft: 10, fontSize: 16, letterSpacing: -2, color: colors.text }]} numberOfLines={1}>{capturedBy(c)}</Text>
        {diff > 0 ? <Text style={[txt(13, '600', colors.muted), { marginLeft: 6 }]}>{'+' + diff}</Text> : null}
      </View>
    );
  };

  // .map (not for loops): every handler gets its own scope, even where the JS engine shares loop bindings.
  const rowIdx = [0, 1, 2, 3, 4, 5, 6, 7];
  const squares = rowIdx.map((i) => {
    const r = fromWhite ? 7 - i : i;
    const cells = rowIdx.map((j) => {
      const f = fromWhite ? j : 7 - j;
      const sq = r * 16 + f;
      const light = ((r + f) & 1) === 1;
      const isLast = sq === lastFrom || sq === lastTo;
      let bg = light ? colors.surface : DARK_SQ;
      if (isLast) bg = light ? LAST_LIGHT : LAST_DARK;
      if (sq === selected) bg = SEL_SQ;
      if (sq === checkSq) bg = CHECK_SQ;
      const p = board[sq];
      const isTarget = targets.some((m) => moveTo(m) === sq);
      return (
        <Pressable
          key={sq}
          testID={'sq-' + sqName(sq)}
          accessibilityLabel={sqName(sq)}
          onPress={() => onSquare(sq)}
          style={{ width: q, height: q, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
        >
          {p ? <Text testID="piece" style={pieceText(p, Math.floor(q * 0.8))}>{GLYPH[p & 7]}</Text> : null}
          {isTarget && !p ? (
            <View pointerEvents="none" style={{ position: 'absolute', width: q * 0.3, height: q * 0.3, borderRadius: q, backgroundColor: colors.accent, opacity: 0.55 }} />
          ) : null}
          {isTarget && p ? (
            <View pointerEvents="none" style={{ position: 'absolute', width: q - 4, height: q - 4, borderRadius: q, borderWidth: 3, borderColor: colors.accent, opacity: 0.65 }} />
          ) : null}
          {j === 0 ? <Text style={[txt(10, '600', colors.muted), { position: 'absolute', top: 1, left: 3 }]}>{String(r + 1)}</Text> : null}
          {i === 7 ? <Text style={[txt(10, '600', colors.muted), { position: 'absolute', bottom: 1, right: 3 }]}>{'abcdefgh'.charAt(f)}</Text> : null}
        </Pressable>
      );
    });
    return <View key={i} style={{ flexDirection: 'row' }}>{cells}</View>;
  });

  // status line
  let statusLine = '';
  if (game.status.over) statusLine = reasonText(game.status) + (game.status.result === '1/2-1/2' ? '' : ' - ' + game.status.result);
  else if (reviewing) statusLine = 'Reviewing move ' + vi + ' of ' + total;
  else if (computerTurn) statusLine = 'Computer is thinking' + '...'.substring(0, dots);
  else if (pos.inCheck()) statusLine = 'Check. Your move';
  else statusLine = 'Your move';

  const userWon = game.status.over && game.status.result === (color === WHITE ? '1-0' : '0-1');
  const draw = game.status.result === '1/2-1/2';
  const resultTitle = draw ? 'Draw' : userWon ? 'You won' : 'You lost';

  const chips: any[] = [];
  game.sans.forEach((_san, i) => {
    if (i % 2 === 0) chips.push(<Text key={'n' + i} style={[txt(14, '600', colors.muted), { marginLeft: i ? 8 : 0, marginRight: 2 }]}>{(i / 2 + 1) + '.'}</Text>);
    const active = i + 1 === vi;
    chips.push(
      <Pressable
        key={'m' + i}
        testID={'move-' + (i + 1)}
        onPress={() => setViewIdx(i + 1 >= total ? null : i + 1)}
        style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.accent : 'transparent' }}
      >
        <Text style={txt(16, active ? '700' : '500', active ? colors.accentText : colors.text)}>{game.sans[i]}</Text>
      </Pressable>,
    );
  });

  const levelRow = (i: number, sub: string) => (
    <Pressable
      key={i}
      testID={'level-' + i}
      onPress={() => setPickLevel(i)}
      style={{ minHeight: 56, borderRadius: 16, paddingHorizontal: 16, justifyContent: 'center', marginBottom: 8, backgroundColor: pickLevel === i ? colors.accent : colors.surface }}
    >
      <Text style={txt(17, '600', pickLevel === i ? colors.accentText : colors.text)}>{LEVELS[i].name}</Text>
      <Text style={txt(13, '400', pickLevel === i ? colors.accentText : colors.muted)}>{sub}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 8, paddingBottom: 24 }}>
        <View style={{ width: S, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[txt(28, '700'), { letterSpacing: -1 }]}>Chess</Text>
            <View testID="level-badge" style={{ marginLeft: 12, paddingHorizontal: 12, height: 28, borderRadius: 999, backgroundColor: colors.surface, justifyContent: 'center' }}>
              <Text style={[txt(13, '600', colors.muted), { textTransform: 'uppercase', letterSpacing: 1.2 }]}>{LEVELS[level].name}</Text>
            </View>
          </View>
          <Pressable testID="menu" onPress={() => setMenuOpen(!menuOpen)} style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text style={txt(15, '600')}>Menu</Text>
          </Pressable>
        </View>

        {menuOpen ? (
          <View style={{ width: S, backgroundColor: colors.surface, borderRadius: 16, padding: 8, marginBottom: 8 }}>
            {[
              ['New game', () => { setMenuOpen(false); setShowNew(true); }],
              ['Flip board', () => { setFlipped(!flipped); setMenuOpen(false); }],
              ['Resign', () => { setMenuOpen(false); setConfirmResign(true); }],
              ['Close', () => setMenuOpen(false)],
            ].map((it) => (
              <Pressable key={it[0] as string} testID={'menu-' + (it[0] as string)} onPress={it[1] as () => void} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Text style={txt(16, '500')}>{it[0] as string}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {playerRow(fromWhite ? BLACK : WHITE)}
        <View style={{ width: S, height: S }}>
          {squares}
          {promo ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View testID="promo-sheet" style={{ backgroundColor: colors.ground, borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, padding: 12 }}>
                <Text style={[txt(13, '600', colors.muted), { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }]}>Promote to</Text>
                <View style={{ flexDirection: 'row' }}>
                  {[5, 4, 3, 2].map((t) => (
                    <Pressable key={t} testID={'promo-' + t} onPress={() => choosePromo(t)} style={{ width: 56, height: 56, borderRadius: 12, marginRight: 6, backgroundColor: DARK_SQ, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={pieceText(t | (color << 3), 40)}>{GLYPH[t]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => setPromo(null)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={txt(15, '600', colors.muted)}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {game.status.over && !overlayHidden ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <View testID="game-over" style={{ backgroundColor: colors.ground, borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, padding: 20, width: Math.min(S - 32, 300), alignItems: 'center' }}>
                <Text style={[txt(32, '700'), { letterSpacing: -1 }]}>{resultTitle}</Text>
                <Text style={[txt(16, '400', colors.muted), { marginTop: 4, marginBottom: 16, textAlign: 'center' }]}>{reasonText(game.status)}</Text>
                <View style={{ flexDirection: 'row' }}>
                  {btn('New game', () => setShowNew(true), { primary: true })}
                </View>
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                  {btn('Review', () => setOverlayHidden(true))}
                </View>
              </View>
            </View>
          ) : null}
        </View>
        {playerRow(fromWhite ? WHITE : BLACK)}

        <Text testID="status" style={[txt(15, '500', colors.muted), { height: 32, textAlignVertical: 'center', lineHeight: 32 }]}>{statusLine}</Text>

        {reviewing ? (
          <View style={{ width: S, flexDirection: 'row' }}>{btn('Back to game', () => setViewIdx(null), { primary: true })}</View>
        ) : confirmResign ? (
          <View style={{ width: S }}>
            <Text style={[txt(15, '500'), { marginBottom: 8, textAlign: 'center' }]}>Resign this game?</Text>
            <View style={{ flexDirection: 'row' }}>
              {btn('Resign', resign, { primary: true })}
              <View style={{ width: 8 }} />
              {btn('Keep playing', () => setConfirmResign(false))}
            </View>
          </View>
        ) : (
          <View style={{ width: S, flexDirection: 'row' }}>
            {btn('Undo', undo, { disabled: !canUndo })}
            <View style={{ width: 8 }} />
            {btn('Flip', () => setFlipped(!flipped))}
            <View style={{ width: 8 }} />
            {btn('Resign', () => setConfirmResign(true), { disabled: game.status.over || !loaded })}
          </View>
        )}

        <View style={{ width: S, marginTop: 12, backgroundColor: colors.surface, borderRadius: 16, height: 60 }}>
          {game.sans.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
              <Text style={txt(14, '400', colors.muted)}>Moves appear here</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 12 }}
              onContentSizeChange={() => { if (!reviewing && scrollRef.current) scrollRef.current.scrollToEnd({ animated: true }); }}
            >
              {chips}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {showNew ? (
        <View testID="new-game" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.ground, padding: 24 }}>
          <ScrollView>
            <Text style={[txt(36, '700'), { letterSpacing: -1, marginBottom: 24 }]}>New game</Text>
            <Text style={[txt(13, '600', colors.muted), { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }]}>Play as</Text>
            <View style={{ flexDirection: 'row', marginBottom: 24 }}>
              {['White', 'Black', 'Random'].map((l, i) => (
                <Pressable key={l} testID={'color-' + i} onPress={() => setPickColor(i)} style={{ flex: 1, minHeight: 48, borderRadius: 999, marginRight: i < 2 ? 8 : 0, alignItems: 'center', justifyContent: 'center', backgroundColor: pickColor === i ? colors.accent : colors.surface }}>
                  <Text style={txt(16, '600', pickColor === i ? colors.accentText : colors.text)}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[txt(13, '600', colors.muted), { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }]}>Level</Text>
            {levelRow(0, 'Relaxed, makes mistakes')}
            {levelRow(1, 'Plays sensible chess')}
            {levelRow(2, 'Thinks several moves ahead')}
            <View style={{ marginTop: 16 }}>
              {btn('Start', startNew, { primary: true, flex: 0 })}
              {hasGame ? <View style={{ marginTop: 8 }}>{btn('Cancel', () => setShowNew(false), { flex: 0 })}</View> : null}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
