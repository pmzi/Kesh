import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { theme, haptics, storage, clipboard } from '@kesh/sdk';

// ---------- constants ----------
const KEY = 'five:v1';
const EPOCH = Date.UTC(2021, 5, 19);
const C = { correct: '#6AAA64', present: '#C9B458', absent: '#787C7E', empty: '#D3D6DA', filled: '#878A8C', key: '#D3D6DA', keyText: '#111111', white: '#FFFFFF' };
const WIN_MSG = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];

const ANSWER_WORDS = `
about above abuse actor acute admit adopt adult after again agent agree ahead alarm album alert
alike alive allow alone along alter among anger angle angry apart apple apply arena argue arise
armor array aside asset avoid awake award aware badly baker basic basis beach began begin being
below bench birth black blame blank blast blind block blood board boost booth bound brain brand
bread break breed brief bring broad broke brown build built buyer cable carry catch cause chain
chair chart chase cheap check chest chief child chose civil claim class clean clear click climb
clock close cloud coach coast could count court cover craft crash cream crime cross crowd crown
curve cycle daily dance dealt death debut delay depth doing doubt dozen draft drama drawn dream
dress drill drink drive drove dying eager early earth eight elite empty enemy enjoy enter entry
equal error event every exact exist extra faith false fault fiber field fifth fifty fight final
first fixed flash fleet floor fluid focus force forth forty forum found frame frank fraud fresh
front fruit fully funny giant given glass globe going grace grade grand grant grass great green
gross group grown guard guess guest guide happy heart heavy hence horse hotel house human ideal
image index inner input issue joint judge known label large laser later laugh layer learn lease
least leave legal level light limit local logic loose lower lucky lunch lying magic major maker
march match maybe mayor meant media metal might minor minus mixed model money month moral motor
mount mouse mouth movie music never newly night noise north noted novel nurse occur ocean offer
often order other ought paint panel paper party peace phase phone photo piece pilot pitch place
plain plane plant plate point pound power press price pride prime print prior prize proof proud
prove queen quick quiet quite radio raise range rapid ratio reach ready refer right rival river
rough round route royal rural scale scene scope score sense serve seven shall shape share sharp
sheet shelf shell shift shine shirt shock shoot short shown sight since sixth sixty skill sleep
slide small smart smile smoke solid solve sorry sound south space spare speak speed spend spent
split spoke sport staff stage stake stand start state steam steel stick still stock stone stood
store storm story strip stuck study stuff style sugar suite super sweet table taken taste teach
thank theme there these thick thing think third those three threw throw tight tired title today
topic total touch tough tower track trade train treat trend trial tribe trick tried truck truly
trust truth twice under union unity until upper upset urban usage usual valid value video virus
visit vital voice waste watch water wheel where which while white whole whose woman women world
worry worse worst worth would wound write wrong wrote yield young youth
`;

const EXTRA_WORDS = `
aback abate abbey abbot abide abode abort abyss ached acorn acrid adage adapt adept adobe adorn
afoot afire afoul agile aging agony aisle algae alibi alien align alley allot alloy aloft aloof
aloud alpha altar amass amber amble amend amiss amuse angel anime ankle annex annoy antic anvil
aorta apron aptly arbor ardor aroma arson ashen ashes atlas atoll atone attic audio audit augur
avian avert awful awoke axiom azure bacon badge bagel baggy baron barge basil basin baste batch
bathe baton beast beech beefy beget beige belly berry bible bigot bilge binge bingo biome birch
bison blaze bleak bleat bleed blend bless blimp bliss bloat blond bloom blown blues bluff blunt
blurb blush boast bonus booty booze borax bored borne bosom bossy botch bough bowel boxer brace
braid brake brash brass brave bravo brawl brawn bride brine brink brisk broil brood brook broom
broth brunt brush brute buddy budge buggy bugle bulge bulky bully bunch bunny burly burnt burst
bushy butte cabin cacao cache cadet camel cameo canal candy canny canoe caper carat cargo carol
carve caste cater cedar chafe chaff chalk champ chant chaos charm chasm cheat cheek cheer chess
chick chide chili chill chime chirp choir choke chord chore chuck chump chunk churn cider cigar
cinch circa civic clamp clang clank clash clasp clerk cliff cling cloak clone cloth clown clump
clung coral corny couch cough cower crack cramp crane crank crate crave crawl craze crazy creak
creek creep crepe crept crest crisp croak crone crook crumb crush crust crypt cubic cumin curry
curse cushy cutie cynic daddy daisy dandy datum daunt decal decay decor decoy deity delta delve
demon denim dense depot derby deter detox devil diary dicey digit dimly diner dingy disco ditch
ditto ditty diver dizzy dodge dogma donor dowdy dowel downy dowry drain drape drawl dread dried
drift drone drool droop dross drunk dryer ducky dully dummy dumpy dusky dusty dwarf dwell dwelt
eagle eased easel eaten eater ebony edict eerie egret eject elbow elder elude elves email embed
ember emcee enact endow ensue envoy epoch equip erase erode erupt essay ether ethic evade evoke
exalt excel exert exile expel extol exult fable facet fairy fancy fatal fatty feast feign feint
femur fence ferry fetal fetch fetus fever fewer fiery filch filet filly filmy filth finch finer
fishy fizzy flail flair flake flaky flame flank flare flask flesh flick fling flint flirt float
flock flood flora flour flout flown fluff flung flunk flush flute foamy foggy folly foray forge
forgo forte fount foyer frail frisk frock frond frost froth frown froze fungi funky furry fussy
fuzzy gaffe gamer gamma gassy gaudy gauge gaunt gauze gavel gawky gecko geeky genie genre ghost
ghoul giddy girth gizmo glade gland glare glaze gleam glean glide glint gloat gloom glory gloss
glove glyph gnash gnome godly goose gorge gouge gourd grail graph grasp gravy graze greed greet
grief grill grime grimy grind gripe groan groom grope grout grove growl gruel gruff grunt guilt
guise gulch gully gummy gusto gypsy habit hairy halve handy hardy harem harsh haste hasty hatch
haunt haven havoc hazel heady heath heave hefty heist helix hello hinge hippo hitch hoard hobby
hoist holly homer honey honor hooky horde hound hover howdy hubby humid humor hunch hunky hurry
husky hydra hyena icing idiom idiot idler idyll igloo imply inane incur inept inert infer ingot
inlay inlet irate irony itchy ivory jaunt jazzy jelly jerky jewel jiffy jolly joust juice juicy
jumbo jumpy junta juror kebab khaki kiosk knack knead kneel knelt knife knock knoll koala kudos
lanky lapel lapse larva latch lathe latte leafy leaky leapt ledge leech leery lemon lemur lever
libel liege lilac limbo linen liner lingo lithe liver livid llama loamy lobby lodge lofty loser
lousy lover lowly loyal lucid lumen lumpy lunar lunge lurch lurid lusty lyric macaw macho macro
madam madly mafia magma maize mambo mango mangy mania manic manly manor maple marsh mason matte
mealy meaty medal melon mercy merge merit merry messy metro micro midst mimic mince miner mirth
miser misty mocha modem moist molar moldy mommy moose mossy motel motif motto mound mourn mucus
muddy mulch mummy munch mural murky mushy musky musty myrrh nadir naive nanny nasal nasty natal
naval navel needy nerdy nerve nervy niche niece ninja ninny ninth nippy noble nobly nodal noisy
nomad noose nudge nutty nylon nymph oasis oaken oddly offal olive omega onion onset opera opium
optic orbit organ otter ounce outdo outer outgo ovary overt owing owner oxide ozone paddy pagan
pager paler palsy panda panic pansy papal parka parry parse pasta paste pasty patio patsy patty
pause payee peach pearl pecan pedal penal penne peony perch peril perky pesky petal petty phony
piano picky piety piggy pinch pique pixel pizza plaid plank plaza plead pleat plied plumb plume
plump plunk plush poach poker polar polka polyp pooch poppy porch poser posse pouch prank prawn
preen prism privy probe prone prong prose proxy prude prune psalm pubic pudgy puffy pulpy pulse
punch pupil puppy puree purge purse pushy putty pygmy quack quail quake qualm quart quash quasi
query quest queue quill quirk quota quote rabbi rabid racer radar radii radon rainy rajah ramen
ranch randy raspy ratty raven rayon razor realm rebel rebus rebut recap recur reedy refit regal
rehab reign relax relay relic remit renal renew repay repel reply rerun resin retch retro retry
reuse revel revue rhino rhyme ridge rifle rigid rigor rinse ripen riser risky ritzy rivet roach
roast robot rocky rodeo roger rogue roomy roost rotor rouge rowdy ruddy ruler rumba rumor rupee
rusty sadly safer saint salad sally salon salsa salty salve salvo sandy sassy satin satyr sauce
saucy sauna saute savor savvy scald scalp scaly scamp scant scare scarf scary scent scion scoff
scold scoop scoot scorn scout scowl scram scrap scree screw scrub scrum seamy sedan seedy segue
seize sepia serif serum setup sever sewer shack shade shady shaft shake shaky shale shame shank
shard shave shawl shear sheen sheep sheer shied shiny shire shirk shoal shone shook shore shorn
shout shove showy shrew shrub shrug shuck shunt shush shyly siege sieve silky silly siren sissy
skate skier skiff skimp skirt skulk skull skunk slack slain slang slant slash slate slave sleek
sleet slept slice slick slime slimy sling slink sloop slope slosh sloth slump slung slunk slurp
slush slyly smack smash smear smell smelt smirk smite smith smock smoky snack snafu snail snake
snaky snare snarl sneak sneer snide sniff snipe snoop snore snort snout snowy snuck snuff soapy
sober soggy solar sonic sooty soupy spade spasm spawn speck spell spice spicy spied spike spiky
spill spine spiny spire spite splat spoil spoof spook spool spoon spore spray spree sprig spunk
spurn spurt squad squat squid stack staid stain stair stale stalk stall stamp stank stare stark
stash stave stays stead steak steal steed steep steer stern stews stiff sting stink stint stoic
stoke stole stomp stony stool stoop stork stout stove strap straw stray strut stump stung stunk
stunt suave sulky sunny surer surge surly sushi swamp swarm swath swear sweat swell swept swift
swill swine swing swirl swish swoon swoop sword swore sworn swung synod syrup tabby taboo tacit
tacky taffy taint talon tamer tango tangy taper tapir tardy tarot taunt tawny teary tease teddy
teens teeth tempo tenet tenor tense tenth tepid terra terse theft thief thigh thorn thong thumb
thump tiara tidal tiger tilde timer timid tipsy titan tithe toast toddy tonic tooth topaz torch
torso torus totem towel toxic toxin trace tract trail trait tramp trash trawl tread tress triad
trice trill tripe trite troll troop trope trout trove truce tulip tumor tunic turbo tutor twain
tweak tweed twerp twine twirl twist tying udder ulcer ultra umbra uncle uncut undid unfit unify
unmet untie unwed usher usurp utter vague valet valor valve vapor vault vaunt vegan venom venue
verge verse vigor villa vinyl viola viper viral visor vista vivid vixen vocal vodka vomit voter
vouch vowel vying wacky wafer wager wagon waist waive waltz warty weary weave wedge weedy weigh
whack whale wharf wheat whiff whine whiny whirl whisk whoop widen widow width wield wimpy wince
winch windy wiser wispy witch witty woken woody wrack wrath wreak wreck wrest wring wrist yacht
yearn yeast yodel yokel zebra zesty zonal
`;

// ---------- pure helpers ----------
export type Mark = 'correct' | 'present' | 'absent';
export type Status = 'playing' | 'won' | 'lost';
export interface Stats { played: number; wins: number; streak: number; maxStreak: number; dist: number[]; lastWon: string | null }
export interface Save { stats: Stats; today: { dateKey: string; guesses: string[]; status: Status }; hardMode?: boolean }

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const uniq = (l: string[]) => l.filter((w, i) => l.indexOf(w) === i);

/** Fixed-seed Fisher-Yates so the answer order is not alphabetical. */
export function shuffled(list: string[]): string[] {
  const a = list.slice();
  let seed = 20210619;
  for (let i = a.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
export const ANSWERS = shuffled(uniq(words(ANSWER_WORDS)));
export const VALID = new Set<string>(ANSWERS.concat(words(EXTRA_WORDS)));

export function evaluate(guess: string, answer: string): Mark[] {
  const res = new Array<Mark>(5).fill('absent');
  const left: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;
export const localKey = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = (k: string) => { const p = k.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; };
export function prevKey(k: string): string {
  const { y, m, d } = parseKey(k);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}
/** Days since 2021-06-19, from a local yyyy-mm-dd key. */
export function dayIndex(k: string): number {
  const { y, m, d } = parseKey(k);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
}
export function answerFor(k: string): string {
  const n = ANSWERS.length;
  return ANSWERS[((dayIndex(k) % n) + n) % n];
}
export function msUntilMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
};

export const newStats = (): Stats => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastWon: null });
export function applyResult(s: Stats, won: boolean, count: number, key: string): Stats {
  const dist = s.dist.slice();
  let streak = 0;
  if (won) {
    dist[count - 1] += 1;
    streak = s.lastWon === prevKey(key) ? s.streak + 1 : 1;
  }
  return { played: s.played + 1, wins: s.wins + (won ? 1 : 0), streak, maxStreak: Math.max(s.maxStreak, streak), dist, lastWon: won ? key : s.lastWon };
}

export function shareText(num: number, guesses: string[], answer: string, status: Status, hard?: boolean): string {
  const sq: Record<Mark, string> = { correct: '🟩', present: '🟨', absent: '⬛' };
  const head = 'Five ' + num + ' ' + (status === 'won' ? guesses.length : 'X') + '/6' + (hard ? '*' : '');
  return head + '\n\n' + guesses.map((g) => evaluate(g, answer).map((m) => sq[m]).join('')).join('\n');
}

export function keyStates(guesses: string[], answer: string): Record<string, Mark> {
  const rank: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };
  const out: Record<string, Mark> = {};
  guesses.forEach((g) => evaluate(g, answer).forEach((m, i) => {
    const prev = out[g[i]];
    if (!prev || rank[m] > rank[prev]) out[g[i]] = m;
  }));
  return out;
}

/** Hard mode: revealed hints must be reused. Returns a message or null. */
export function hardViolation(guesses: string[], answer: string, guess: string): string | null {
  for (const g of guesses) {
    const ev = evaluate(g, answer);
    for (let i = 0; i < 5; i++) {
      if (ev[i] === 'correct' && guess[i] !== g[i]) return ORD[i] + ' letter must be ' + g[i].toUpperCase();
      if (ev[i] === 'present' && guess.indexOf(g[i]) < 0) return 'Guess must contain ' + g[i].toUpperCase();
    }
  }
  return null;
}

const tileColor = (m: Mark) => C[m];
const safe = (f: () => void) => { try { f(); } catch (e) { /* permission or host issue */ } };

// ---------- small views ----------
function Tile({ ch, mark, size, flip, shown }: { ch: string; mark?: Mark; size: number; flip?: boolean; shown?: boolean }) {
  const colored = !!mark && shown !== false;
  const bg = colored ? tileColor(mark as Mark) : 'transparent';
  const border = colored ? bg : ch ? C.filled : C.empty;
  return (
    <View style={{ width: size, height: size, marginHorizontal: 2.5, borderWidth: 2, borderColor: border, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ scaleY: flip ? 0.1 : 1 }] }}>
      <Text style={{ color: colored ? C.white : theme.colors.text, fontFamily: theme.fonts.ui, fontSize: size * 0.52, fontWeight: '700', width: size - 4, textAlign: 'center', lineHeight: size - 4 }}>{ch.toUpperCase()}</Text>
    </View>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors, fonts } = theme;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.ground, paddingHorizontal: 24, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', letterSpacing: 1.2 }}>{title.toUpperCase()}</Text>
        <Pressable onPress={onClose} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '600' }}>{'✕'}</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

// ---------- main ----------
export default function Five() {
  const { colors, fonts } = theme;
  const [save, setSave] = useState<Save | null>(null);
  const [cur, setCur] = useState('');
  const [modal, setModal] = useState<'none' | 'help' | 'stats'>('none');
  const [rev, setRev] = useState<{ row: number; n: number; flip: boolean } | null>(null);
  const [shake, setShake] = useState<{ row: number; x: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; op: number } | null>(null);
  const [now, setNow] = useState(new Date());
  const timers = useRef<any[]>([]);
  const toastId = useRef(0);
  const todayKey = useRef(localKey(new Date())).current;
  const answer = answerFor(todayKey);
  const num = dayIndex(todayKey);

  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    storage.get(KEY).then((raw) => {
      let s: Save | null = null;
      try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
      if (!s || !s.stats || !s.today) s = { stats: newStats(), today: { dateKey: todayKey, guesses: [], status: 'playing' } };
      if (s.today.dateKey !== todayKey) s = { ...s, today: { dateKey: todayKey, guesses: [], status: 'playing' } };
      setSave(s);
      if (s.today.status !== 'playing') setModal('stats');
      else if (!raw) setModal('help');
    }).catch(() => setSave({ stats: newStats(), today: { dateKey: todayKey, guesses: [], status: 'playing' } }));
  }, []);

  useEffect(() => {
    if (modal !== 'stats') return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [modal]);

  const persist = (s: Save) => { setSave(s); storage.set(KEY, JSON.stringify(s)).catch(() => {}); };

  const showToast = (msg: string, sticky?: boolean) => {
    const id = ++toastId.current;
    setToast({ msg, op: 1 });
    if (sticky) return;
    later(() => { if (toastId.current === id) setToast({ msg, op: 0.5 }); }, 1100);
    later(() => { if (toastId.current === id) setToast({ msg, op: 0.2 }); }, 1300);
    later(() => { if (toastId.current === id) setToast(null); }, 1500);
  };

  const shakeRow = (row: number) => {
    [-8, 8, -6, 6, -3, 0].forEach((x, i) => later(() => setShake(x === 0 && i === 5 ? null : { row, x }), i * 55));
  };

  const reject = (msg: string, row: number) => { showToast(msg); shakeRow(row); safe(() => haptics.notification('error')); };

  if (!save) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  const g = save.today.guesses;
  const status = save.today.status;
  const busy = rev !== null;

  const onKey = (k: string) => {
    if (status !== 'playing' || busy || modal !== 'none') return;
    safe(() => haptics.impact('light'));
    if (k === 'enter') return submit();
    if (k === 'back') return setCur((c) => c.slice(0, -1));
    setCur((c) => (c.length < 5 ? c + k : c));
  };

  const submit = () => {
    const row = g.length;
    if (cur.length < 5) return reject('Not enough letters', row);
    if (!VALID.has(cur)) return reject('Not in word list', row);
    if (save.hardMode) {
      const v = hardViolation(g, answer, cur);
      if (v) return reject(v, row);
    }
    const guesses = g.concat(cur);
    const won = cur === answer;
    const over = won || guesses.length === 6;
    const st: Status = won ? 'won' : over ? 'lost' : 'playing';
    persist({ ...save, stats: over ? applyResult(save.stats, won, guesses.length, todayKey) : save.stats, today: { dateKey: todayKey, guesses, status: st } });
    setCur('');
    for (let i = 0; i < 5; i++) {
      later(() => setRev({ row, n: i, flip: true }), i * 320);
      later(() => setRev({ row, n: i + 1, flip: false }), i * 320 + 160);
    }
    later(() => {
      setRev(null);
      if (won) { showToast(WIN_MSG[guesses.length - 1]); safe(() => haptics.notification('success')); }
      else if (over) { showToast('The word was ' + answer.toUpperCase(), true); safe(() => haptics.notification('error')); }
      if (over) later(() => setModal('stats'), 1600);
    }, 5 * 320 + 100);
  };

  // layout
  const win = Dimensions.get('window');
  const tile = Math.max(36, Math.min(62, Math.floor((win.width - 48 - 25) / 5), Math.floor((win.height - 400) / 6) - 5));
  const kw = Math.min(43, Math.floor((win.width - 12 - 9 * 6) / 10));
  const states = keyStates(rev ? g.slice(0, rev.row) : g, answer);

  const renderRow = (r: number) => {
    const done = r < g.length;
    const word = done ? g[r] : r === g.length ? cur : '';
    const marks = done ? evaluate(g[r], answer) : null;
    const dx = shake && shake.row === r ? shake.x : 0;
    return (
      <View key={r} style={{ flexDirection: 'row', marginBottom: 5, transform: [{ translateX: dx }] }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const revealing = rev && rev.row === r;
          const shown = revealing ? i < (rev as any).n : true;
          const flip = !!revealing && (rev as any).n === i && (rev as any).flip;
          return <Tile key={i} ch={word[i] || ''} mark={marks ? marks[i] : undefined} size={tile} shown={shown} flip={flip} />;
        })}
      </View>
    );
  };

  const renderKey = (k: string, label: string, wide?: boolean) => {
    const m = states[k];
    const bg = m ? tileColor(m) : C.key;
    return (
      <Pressable key={k} onPress={() => onKey(k)} style={({ pressed }) => ({ width: wide ? Math.round(kw * 1.5) : kw, height: 54, marginHorizontal: 3, borderRadius: 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: m ? C.white : C.keyText, fontFamily: fonts.ui, fontSize: wide ? 12 : 17, fontWeight: '700' }}>{label}</Text>
      </Pressable>
    );
  };

  const hbtn = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 22, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  const stats = save.stats;
  const maxDist = Math.max(1, ...stats.dist);
  const statBox = (v: string | number, l: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 34, fontWeight: '700' }}>{v}</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 12, textAlign: 'center' }}>{l}</Text>
    </View>
  );

  const share = () => {
    safe(() => clipboard.setString(shareText(num, g, answer, status, save.hardMode)));
    showToast('Copied results to clipboard');
  };

  const example = (w: string, marks: (Mark | undefined)[], note: ReactNode) => (
    <View style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: 'row', marginBottom: 8, marginLeft: -2.5 }}>
        {w.split('').map((c, i) => <Tile key={i} ch={c} mark={marks[i]} size={40} />)}
      </View>
      <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 15, lineHeight: 21 }}>{note}</Text>
    </View>
  );
  const bold = (t: string) => <Text style={{ fontWeight: '700' }}>{t}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 52, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
        {hbtn('?', () => setModal('help'))}
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 32, fontWeight: '700', letterSpacing: -1 }}>Five</Text>
        {hbtn('▓', () => setModal('stats'))}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2, 3, 4, 5].map(renderRow)}
      </View>

      <View style={{ alignItems: 'center', paddingBottom: 24 }}>
        {ROWS.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', marginBottom: 8 }}>
            {ri === 1 && <View style={{ width: kw / 2 }} />}
            {ri === 2 && renderKey('enter', 'ENTER', true)}
            {row.split('').map((c) => renderKey(c, c.toUpperCase()))}
            {ri === 2 && renderKey('back', '⌫', true)}
            {ri === 1 && <View style={{ width: kw / 2 }} />}
          </View>
        ))}
      </View>

      {modal === 'help' && (
        <Overlay title="How to play" onClose={() => setModal('none')}>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 30, fontWeight: '700', letterSpacing: -1, marginBottom: 12 }}>Guess the word in six tries</Text>
          <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 16, lineHeight: 22, marginBottom: 6 }}>Every guess must be a real five-letter word. After you submit, each tile changes color to show how close you were.</Text>
          <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 16, lineHeight: 22, marginBottom: 16 }}>A new word arrives every day at midnight.</Text>
          <View style={{ height: 1, backgroundColor: colors.hairline, marginBottom: 16 }} />
          {example('weary', ['correct'], <Text>{bold('W')} is in the word and in the right spot.</Text>)}
          {example('pills', [undefined, 'present'], <Text>{bold('I')} is in the word but in the wrong spot.</Text>)}
          {example('vague', [undefined, undefined, undefined, 'absent'], <Text>{bold('U')} is not in the word at all.</Text>)}
        </Overlay>
      )}

      {modal === 'stats' && (
        <Overlay title="Statistics" onClose={() => setModal('none')}>
          <View style={{ flexDirection: 'row', marginBottom: 24 }}>
            {statBox(stats.played, 'Played')}
            {statBox(stats.played ? Math.round((stats.wins / stats.played) * 100) : 0, 'Win %')}
            {statBox(stats.streak, 'Current streak')}
            {statBox(stats.maxStreak, 'Max streak')}
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', letterSpacing: 1.2, marginBottom: 10 }}>GUESS DISTRIBUTION</Text>
          {stats.dist.map((n, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ width: 16, color: colors.text, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600' }}>{i + 1}</Text>
              <View style={{ flex: 1, flexDirection: 'row' }}>
                <View style={{ width: Math.max(8, Math.round((n / maxDist) * 100)) + '%', minWidth: 24, height: 22, backgroundColor: status === 'won' && g.length === i + 1 ? C.correct : C.absent, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ color: C.white, fontFamily: fonts.ui, fontSize: 13, fontWeight: '700' }}>{n}</Text>
                </View>
              </View>
            </View>
          ))}
          <Pressable
            onPress={() => { if (g.length === 0 || status !== 'playing') { persist({ ...save, hardMode: !save.hardMode }); safe(() => haptics.selection()); } else showToast('Hard mode can only be changed before guessing'); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, marginTop: 20, borderTopWidth: 1, borderTopColor: colors.hairline }}>
            <Text style={{ color: colors.text, fontFamily: fonts.ui, fontSize: 16 }}>Hard Mode</Text>
            <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: save.hardMode ? colors.accent : colors.hairline, justifyContent: 'center', paddingHorizontal: 3, alignItems: save.hardMode ? 'flex-end' : 'flex-start' }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ground }} />
            </View>
          </Pressable>
          {status !== 'playing' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 16 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: colors.muted, fontFamily: fonts.ui, fontSize: 13, fontWeight: '600', letterSpacing: 1.2 }}>NEXT WORD IN</Text>
                <Text style={{ color: colors.text, fontFamily: fonts.mono, fontSize: 30, fontWeight: '600' }}>{clock(msUntilMidnight(now))}</Text>
              </View>
              <Pressable onPress={share} style={({ pressed }) => ({ flex: 1, height: 54, borderRadius: 999, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ color: colors.accentText, fontFamily: fonts.ui, fontSize: 17, fontWeight: '600' }}>Share</Text>
              </Pressable>
            </View>
          )}
        </Overlay>
      )}

      {toast && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center', opacity: toast.op }}>
          <View style={{ backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 }}>
            <Text style={{ color: colors.ground, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' }}>{toast.msg}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
