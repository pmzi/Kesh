import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import * as sdk from '@kesh/sdk';
import { storage, theme } from '@kesh/sdk';

const { colors, fonts } = theme;

type AiModel = string;
type Entry = { meaning: string; examples: string[] };
export type HistoryItem = { id: string; sentence: string; phrase: string; model: AiModel; result: Entry; at: number };
type Avail = { onDevice: boolean; claude: boolean };

export const HISTORY_MAX = 200;
export const MODELS: { id: AiModel; label: string }[] = [
  { id: 'on-device', label: 'On-device' },
  { id: 'haiku', label: 'Haiku' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
];

const SYSTEM =
  'You are a concise dictionary. The user gives a sentence where one part is wrapped in double quotes. ' +
  'Explain ONLY that quoted part as it is used in that sentence. Give one short plain-English sentence for the meaning, ' +
  'and exactly two short, natural example sentences using the quoted part. Keep everything brief.';

const SCHEMA = {
  type: 'object' as const,
  properties: {
    meaning: { type: 'string' as const, description: 'One short plain-English sentence: what the quoted part means in this sentence' },
    examples: { type: 'array' as const, items: { type: 'string' as const }, minItems: 2, maxItems: 2, description: 'Two short example sentences using the quoted part' },
  },
  required: ['meaning', 'examples'],
};

/** First non-empty quoted part. Straight and curly quotes both work. */
export function extractPhrase(text: string): string | null {
  const isQ = (c: string) => c === '"' || c === '\u201C' || c === '\u201D';
  let i = 0;
  while (i < text.length) {
    if (!isQ(text[i])) { i++; continue; }
    let j = i + 1;
    while (j < text.length && !isQ(text[j])) j++;
    if (j >= text.length) return null;
    const p = text.slice(i + 1, j).trim();
    if (p) return p;
    i = j + 1;
  }
  return null;
}

export function isAvailable(model: AiModel, a: Avail): boolean {
  return model === 'on-device' ? a.onDevice : a.claude;
}

/** Saved model if still usable, else on-device, else haiku, else null (no model usable). */
export function pickDefaultModel(a: Avail, saved?: string | null): AiModel | null {
  if (saved && isAvailable(saved, a)) return saved;
  if (a.onDevice) return 'on-device';
  if (a.claude) return 'haiku';
  return null;
}

/** Newest first, capped at HISTORY_MAX. */
/** Same sentence + phrase (ignoring case, spacing and the model used) is the same lookup. */
export function historyKey(h: { sentence: string; phrase: string }): string {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  return norm(h.sentence) + '|' + norm(h.phrase);
}

/** Keeps only the newest record for each lookup. */
export function dedupeHistory(list: HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  const out: HistoryItem[] = [];
  list.slice().sort((a, b) => b.at - a.at).forEach((h) => {
    const k = historyKey(h);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(h);
  });
  return out;
}

export function addHistory(list: HistoryItem[], item: HistoryItem): HistoryItem[] {
  return dedupeHistory([item, ...list]).slice(0, HISTORY_MAX);
}

function normalize(raw: unknown): Entry {
  const r = (raw ?? {}) as { meaning?: unknown; examples?: unknown };
  const meaning = typeof r.meaning === 'string' ? r.meaning.trim() : '';
  const examples = Array.isArray(r.examples) ? r.examples.filter((e): e is string => typeof e === 'string').slice(0, 2) : [];
  if (!meaning) throw new Error('The model sent back something unexpected. Please try again.');
  return { meaning, examples };
}

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m && m.length < 200 ? m : 'Something went wrong. Please try again.';
}

function Btn(p: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      style={({ pressed }) => ({
        minHeight: 52, paddingHorizontal: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
        backgroundColor: p.primary ? colors.accent : colors.ground,
        borderWidth: p.primary ? 0 : 1, borderColor: colors.hairline,
        opacity: p.disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', color: p.primary ? colors.accentText : colors.text }}>{p.label}</Text>
    </Pressable>
  );
}

function Dots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x % 3) + 1), 350);
    return () => clearInterval(t);
  }, []);
  return <Text style={{ fontFamily: fonts.ui, fontSize: 28, fontWeight: '700', color: colors.muted, letterSpacing: 4 }}>{'.'.repeat(n)}</Text>;
}

function Card({ phrase, entry }: { phrase: string; entry: Entry }) {
  return (
    <View style={{ alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 16, padding: 20, gap: 12 }}>
      <Text style={{ fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', letterSpacing: 1.2, color: colors.muted }}>{phrase.toUpperCase()}</Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: '700', color: colors.text, lineHeight: 30 }}>{entry.meaning}</Text>
      {entry.examples.map((ex, i) => (
        <View key={i} style={{ borderLeftWidth: 2, borderLeftColor: colors.hairline, paddingLeft: 12 }}>
          <Text style={{ fontFamily: fonts.ui, fontSize: 16, lineHeight: 23, color: colors.text }}>{ex}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Dictionary() {
  const ai = (sdk as { ai?: typeof sdk.ai }).ai;
  const [tab, setTab] = useState<'lookup' | 'history'>('lookup');
  const [text, setText] = useState('');
  const [avail, setAvail] = useState<Avail>({ onDevice: false, claude: false });
  const [model, setModel] = useState<AiModel | null>(null);
  const [availKnown, setAvailKnown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ phrase: string; entry: Entry } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const run = useRef(0);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.get('history');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) setHistory(dedupeHistory(list).slice(0, HISTORY_MAX));
        }
      } catch {}
      setLoaded(true);
      if (!ai) return;
      try {
        const a = await ai.models();
        setAvail(a);
        const saved = await storage.get('model').catch(() => null);
        setModel(pickDefaultModel(a, saved));
      } catch {}
      setAvailKnown(true);
    })();
  }, []);

  const persist = (list: HistoryItem[]) => {
    setHistory(list);
    if (loaded) storage.set('history', JSON.stringify(list)).catch(() => {});
  };

  const choose = (id: AiModel) => {
    setModel(id);
    storage.set('model', id).catch(() => {});
  };

  const lookup = async () => {
    if (!ai || loading) return;
    if (inputRef.current && typeof inputRef.current.blur === 'function') inputRef.current.blur();
    const phrase = extractPhrase(text);
    if (!phrase) { setError('Put the part you do not understand in quotes'); setResult(null); return; }
    if (!model) { setError('Connect your Mac to use Claude models'); return; }
    const id = ++run.current;
    setLoading(true); setError(null); setResult(null);
    try {
      const raw = await ai.generate<Entry>({ model, system: SYSTEM, prompt: text.trim(), schema: SCHEMA });
      if (id !== run.current) return;
      const entry = normalize(raw);
      setResult({ phrase, entry });
      persist(addHistory(history, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sentence: text.trim(), phrase, model, result: entry, at: Date.now() }));
    } catch (e) {
      if (id === run.current) setError(friendly(e));
    } finally {
      if (id === run.current) setLoading(false);
    }
  };

  const reopen = (h: HistoryItem) => {
    run.current++;
    setText(h.sentence); setResult({ phrase: h.phrase, entry: h.result }); setError(null); setLoading(false); setTab('lookup');
  };

  const tabBtn = (id: 'lookup' | 'history', label: string) => (
    <Pressable key={id} onPress={() => setTab(id)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, backgroundColor: tab === id ? colors.accent : 'transparent', opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: tab === id ? colors.accentText : colors.muted }}>{label}</Text>
    </Pressable>
  );

  const header = (
    <View style={{ paddingHorizontal: 24, paddingTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 32, fontWeight: '700', letterSpacing: -1, color: colors.text }}>Dictionary</Text>
      <View style={{ flexDirection: 'row' }}>{tabBtn('lookup', 'Lookup')}{tabBtn('history', 'History')}</View>
    </View>
  );

  if (!ai) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground }}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontFamily: fonts.ui, fontSize: 16, color: colors.muted, textAlign: 'center' }}>This version of Kesh does not support AI yet. Update the app.</Text>
        </View>
      </View>
    );
  }

  const noModel = availKnown && !avail.onDevice && !avail.claude;

  const lookupView = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={(t) => { setText(t); if (error) setError(null); }}
        placeholder={'He was "nonplussed" by the news.'}
        placeholderTextColor={colors.muted}
        multiline
        style={{ minHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: 16, fontFamily: fonts.ui, fontSize: 17, lineHeight: 24, color: colors.text }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MODELS.map((m) => {
          const ok = isAvailable(m.id, avail);
          const on = model === m.id && ok;
          return (
            <Pressable key={m.id} disabled={!ok} onPress={() => choose(m.id)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: on ? colors.accent : colors.hairline, backgroundColor: on ? colors.accent : colors.ground, opacity: !ok ? 0.4 : pressed ? 0.7 : 1 })}>
              <Text style={{ fontFamily: fonts.ui, fontSize: 15, fontWeight: '600', color: on ? colors.accentText : ok ? colors.text : colors.muted }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {availKnown && !avail.claude ? <Text style={{ fontFamily: fonts.ui, fontSize: 14, color: colors.muted }}>Connect your Mac to use Claude models</Text> : null}
      {noModel ? null : <Btn primary label="Look up" onPress={lookup} disabled={loading || !text.trim() || !model} />}
      {loading ? <View style={{ alignItems: 'center' }}><Dots /></View> : null}
      {error ? (
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ fontFamily: fonts.ui, fontSize: 16, color: colors.muted }}>{error}</Text>
          {extractPhrase(text) ? <Btn label="Retry" onPress={lookup} /> : null}
        </View>
      ) : null}
      {result ? <Card phrase={result.phrase} entry={result.entry} /> : null}
    </ScrollView>
  );

  const historyView = (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 8 }}>
      {history.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.ui, fontSize: 16, color: colors.muted }}>Nothing looked up yet.</Text>
        </View>
      ) : (
        <>
          {history.map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16 }}>
              <Pressable onPress={() => reopen(h)} style={({ pressed }) => ({ flex: 1, minHeight: 44, padding: 14, opacity: pressed ? 0.7 : 1 })}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.ui, fontSize: 16, fontWeight: '700', color: colors.text }}>{h.phrase}</Text>
                <Text numberOfLines={2} style={{ fontFamily: fonts.ui, fontSize: 14, color: colors.muted, marginTop: 2 }}>{h.result.meaning}</Text>
              </Pressable>
              <Pressable onPress={() => persist(history.filter((x) => x.id !== h.id))} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ fontFamily: fonts.ui, fontSize: 22, color: colors.muted }}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={{ marginTop: 16, alignItems: 'center', gap: 12 }}>
            {confirmClear ? (
              <>
                <Text style={{ fontFamily: fonts.ui, fontSize: 15, color: colors.text }}>Remove all {history.length} lookups?</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn label="Cancel" onPress={() => setConfirmClear(false)} />
                  <Btn primary label="Clear all" onPress={() => { persist([]); setConfirmClear(false); }} />
                </View>
              </>
            ) : (
              <Btn label="Clear all" onPress={() => setConfirmClear(true)} />
            )}
          </View>
        </>
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.ground }}>
      {header}
      {tab === 'lookup' ? lookupView : historyView}
    </KeyboardAvoidingView>
  );
}
