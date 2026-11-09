import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView } from 'react-native';
import { haptics, storage, theme } from '@kesh/sdk';

const { colors, fonts } = theme;
const KEY = 'habits:v1';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const COL = '14.2857%';

type Habit = { id: string; name: string; createdAt: string; hits: string[] };

// ---- pure helpers (months are 0-based) ----
const pad = (n: number) => (n < 10 ? '0' : '') + n;
const dayKey = (y: number, m: number, d: number) => y + '-' + pad(m + 1) + '-' + pad(d);
const dateKey = (dt: Date) => dayKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstWeekdayMonday = (y: number, m: number) => (new Date(y, m, 1).getDay() + 6) % 7;
const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const shiftKey = (key: string, delta: number) => {
  const dt = parseKey(key);
  return dateKey(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + delta));
};
function computeStreaks(hits: string[], today: string) {
  const set = new Set(hits.filter((k) => k <= today));
  const days = Array.from(set).sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && shiftKey(days[i - 1], 1) === days[i] ? run + 1 : 1;
    if (run > best) best = run;
  }
  let cur = 0;
  let k = set.has(today) ? today : shiftKey(today, -1);
  while (set.has(k)) {
    cur++;
    k = shiftKey(k, -1);
  }
  return { current: cur, best };
}

const smallCaps = { color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600' as const, letterSpacing: 1.2 };
const pill = { height: 52, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: colors.accent };
const pillText = { color: colors.accentText, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' as const };

export default function HabitTracker() {
  const now = new Date();
  const today = dateKey(now);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState<'list' | 'cal' | 'day'>('list');
  const [daySelKey, setDayKey] = useState(today);
  const [text, setText] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });

  useEffect(() => {
    storage
      .get(KEY)
      .then((v) => {
        try {
          const p = v ? JSON.parse(v) : null;
          if (p && Array.isArray(p.habits)) {
            setHabits(p.habits);
            setSelId(p.selected || null);
          }
        } catch (e) {}
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const commit = (next: Habit[], sel: string | null) => {
    setHabits(next);
    setSelId(sel);
    if (loaded) storage.set(KEY, JSON.stringify({ habits: next, selected: sel })).catch(() => {});
  };

  const habit = habits.find((h) => h.id === selId) || null;

  const addHabit = () => {
    const name = text.trim();
    if (!name) return;
    const h: Habit = { id: 'h' + Date.now().toString(36), name, createdAt: today, hits: [] };
    setText('');
    haptics.impact('light');
    commit([...habits, h], selId);
  };

  const removeHabit = (id: string) => {
    setConfirmId(null);
    commit(habits.filter((h) => h.id !== id), selId === id ? null : selId);
  };

  const toggle = (id: string, key: string) => {
    const h = habits.find((x) => x.id === id);
    if (!h || key > today) return;
    const had = h.hits.includes(key);
    haptics.impact('light');
    if (!had) haptics.notification('success');
    const hits = had ? h.hits.filter((k) => k !== key) : [...h.hits, key];
    const createdAt = !had && key < h.createdAt ? key : h.createdAt;
    commit(habits.map((x) => (x.id === id ? { ...x, hits, createdAt } : x)), selId);
  };

  const openHabit = (id: string) => {
    setView({ y: now.getFullYear(), m: now.getMonth() });
    commit(habits, id);
    setConfirmId(null);
    setPage('cal');
  };

  const step = (d: number) => {
    const t = view.y * 12 + view.m + d;
    setView({ y: Math.floor(t / 12), m: t % 12 });
  };

  const Back = ({ label, to }: { label: string; to: 'list' | 'cal' }) => (
    <Pressable onPress={() => setPage(to)} style={{ height: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 16 }}>{'‹  ' + label}</Text>
    </Pressable>
  );

  // ---------- page 1: habit list ----------
  const renderList = () => {
    const confirmHabit = habits.find((h) => h.id === confirmId);
    return (
      <View>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 44, fontWeight: '700', letterSpacing: -1 }}>Habits</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={addHabit}
            placeholder="New habit"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, height: 52, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: colors.hairline, color: colors.text, fontFamily: fonts.ui, fontSize: 16 }}
          />
          <Pressable onPress={addHabit} style={({ pressed }) => ({ ...pill, marginLeft: 12, opacity: pressed ? 0.6 : 1 })}>
            <Text style={pillText}>Add</Text>
          </Pressable>
        </View>
        {confirmHabit && (
          <View style={{ marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 15 }}>Delete "{confirmHabit.name}" and its history?</Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Pressable onPress={() => removeHabit(confirmHabit.id)} style={{ ...pill, marginRight: 10 }}>
                <Text style={pillText}>Delete</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmId(null)} style={{ height: 44, paddingHorizontal: 20, justifyContent: 'center' }}>
                <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15 }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
        {habits.length === 0 ? (
          <View style={{ marginTop: 80, alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>Add your first habit</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15, marginTop: 8 }}>Type a name above and tap Add.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 24 }}>
            {habits.map((h) => {
              const done = h.hits.includes(today);
              const s = computeStreaks(h.hits, today);
              return (
                <Pressable
                  key={h.id}
                  onPress={() => openHabit(h.id)}
                  onLongPress={() => { haptics.impact('medium'); setConfirmId(h.id); }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.hairline, opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 22, fontWeight: '600' }}>{h.name}</Text>
                    <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15, marginTop: 2 }}>{s.current} day streak  ·  tap for calendar</Text>
                  </View>
                  <Pressable
                    onPress={() => toggle(h.id, today)}
                    style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.accent : 'transparent', borderWidth: 1, borderColor: done ? colors.accent : colors.hairline }}
                  >
                    <Text style={{ color: done ? colors.accentText : colors.muted, fontSize: 20, fontWeight: '600' }}>✓</Text>
                  </Pressable>
                </Pressable>
              );
            })}
            <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15, marginTop: 20 }}>Check today on the right. Hold a habit to delete it.</Text>
          </View>
        )}
      </View>
    );
  };

  // ---------- page 2: calendar ----------
  const renderCal = () => {
    if (!habit) return renderList();
    const stats = computeStreaks(habit.hits, today);
    let hitCount = 0;
    let applicable = 0;
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekdayMonday(view.y, view.m); i++) cells.push(null);
    for (let d = 1; d <= daysInMonth(view.y, view.m); d++) {
      cells.push(d);
      const k = dayKey(view.y, view.m, d);
      if (k >= habit.createdAt && k <= today) {
        applicable++;
        if (habit.hits.includes(k)) hitCount++;
      }
    }
    const cell = (d: number | null, i: number) => {
      if (d === null) return <View key={'e' + i} style={{ width: COL, height: 48 }} />;
      const k = dayKey(view.y, view.m, d);
      const hit = habit.hits.includes(k);
      const future = k > today;
      const missed = !hit && !future && k >= habit.createdAt && k < today;
      const dim = !hit && (missed || future || k < habit.createdAt);
      return (
        <Pressable
          key={k}
          onPress={() => { setDayKey(k); setPage('day'); }}
          style={({ pressed }) => ({ width: COL, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: hit ? colors.accent : 'transparent', borderWidth: k === today ? 1.5 : 1, borderColor: k === today ? colors.accent : missed ? colors.hairline : 'transparent' }}>
            <Text style={{ fontFamily: fonts.ui, fontSize: 15, color: hit ? colors.accentText : dim ? colors.muted : colors.text, fontWeight: hit ? '600' : '400', opacity: dim ? 0.7 : 1 }}>{d}</Text>
            {missed && <View style={{ position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted, opacity: 0.6 }} />}
          </View>
        </Pressable>
      );
    };
    return (
      <View>
        <Back label="Habits" to="list" />
        <Text style={{ ...smallCaps, marginTop: 12 }}>{habit.name.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Pressable onPress={() => step(-1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 28 }}>‹</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -1 }}>{MONTHS[view.m]} {view.y}</Text>
          <Pressable onPress={() => step(1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 28 }}>›</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          {WEEK.map((w, i) => (
            <Text key={i} style={{ width: COL, textAlign: 'center', color: colors.muted, fontFamily: fonts.ui, fontSize: 15 }}>{w}</Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>{cells.map(cell)}</View>
        <View style={{ flexDirection: 'row', marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {[['STREAK', String(stats.current)], ['BEST', String(stats.best)], ['THIS MONTH', hitCount + ' of ' + applicable]].map(([l, v]) => (
            <View key={l} style={{ flex: 1 }}>
              <Text style={smallCaps}>{l}</Text>
              <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 28, fontWeight: '700', letterSpacing: -1, marginTop: 4 }}>{v}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15, marginTop: 20 }}>Tap a day to check off your habits for it.</Text>
      </View>
    );
  };

  // ---------- page 3: one day, all habits ----------
  const renderDay = () => {
    const dt = parseKey(daySelKey);
    const future = daySelKey > today;
    return (
      <View>
        <Back label={habit ? habit.name : 'Calendar'} to={habit ? 'cal' : 'list'} />
        <Text style={{ ...smallCaps, marginTop: 12 }}>{DAYS[dt.getDay()].toUpperCase()}{daySelKey === today ? '  ·  TODAY' : ''}</Text>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 36, fontWeight: '700', letterSpacing: -1, marginTop: 4 }}>{dt.getDate()} {MONTHS[dt.getMonth()]} {dt.getFullYear()}</Text>
        {future && <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 15, marginTop: 12 }}>This day has not happened yet.</Text>}
        <View style={{ marginTop: 24 }}>
          {habits.map((h) => {
            const done = h.hits.includes(daySelKey);
            return (
              <Pressable
                key={h.id}
                disabled={future}
                onPress={() => toggle(h.id, daySelKey)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 64, borderBottomWidth: 1, borderBottomColor: colors.hairline, opacity: future ? 0.4 : pressed ? 0.7 : 1 })}
              >
                <Text style={{ flex: 1, color: colors.text, fontFamily: fonts.display, fontSize: 22, fontWeight: '600' }}>{h.name}</Text>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.accent : 'transparent', borderWidth: 1, borderColor: done ? colors.accent : colors.hairline }}>
                  <Text style={{ color: done ? colors.accentText : colors.muted, fontSize: 18, fontWeight: '600' }}>{done ? '✓' : ''}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 24, paddingBottom: 48 }}>
        {page === 'list' ? renderList() : page === 'cal' ? renderCal() : renderDay()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
