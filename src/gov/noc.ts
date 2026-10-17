/* Karta nocy jak w 0.1 i 0.2: o 20:00 zarząd proponuje, kto śpi, kto trzyma wartę (przy bramie albo
   przy dziurze w siatce) i kto idzie na wyprawę (blisko albo daleko); szansę napadu, spodziewane straty
   i łup widać przed decyzją. Dyżur przy kozie (warta:koza) wybiera gracz: zarząd tylko radzi, ile drewna
   starczy, a rano raport mówi, czy w kuchni było ciepło. Przy zatwierdzeniu losuje się, czy szabrownicy
   przyjdą, gdzie i o której (23:00–4:00). O tej godzinie obronę liczy się z tego, co jest: kto nie zasnął,
   światło, pies, brama. Wyprawy wracają o 1:00 (blisko) albo o świcie (daleko), o 6:00 raport. Losowość
   z ziarna gry. */

import { g } from '../content/people.ts';
import { clamp } from '../core/rng.ts';
import { placeIn, wordsOf } from './miejsce.ts';
import { type ExpTarget, peopleNames, TARGETS, targetName } from './tresc.ts';
import type {
  GovEffects,
  GovInput,
  GovPerson,
  GovState,
  LootKey,
  NightCard,
  NightOption,
  NightReport,
} from './typy.ts';
import { dailyDrift, law } from './uchwaly.ts';
import {
  addNeeds,
  addStock,
  atHour,
  decision,
  fenceOf,
  gameMin,
  logGov,
  mood,
  nightDay,
  rint,
  rnd,
  round1,
  round2,
  stockText,
  zeroStock,
} from './wspolne.ts';

export const CARD_HOUR = 20;
/** do tej godziny karta czeka na decyzję, potem zostaje propozycja zarządu */
export const CARD_DEADLINE = 22;
export const MORNING = 6;
/** dyżur przy kozie: posterunek jak w symulacji ('koza'); czuwający dokłada do rana, koza zjada około 2 sztuk
    drewna na godzinę (noc 22–6 to 16, od karty o 20:00 to 20) */
export const KOZA = 'koza';
export const KOZA_KEY = `warta:${KOZA}`;
export const WOOD_PER_HOUR = 2;
/** warta przy siatce (brama, dziury), bez dyżuru przy kozie */
export const isFenceGuard = (k: string): boolean => k.startsWith('warta:') && k !== KOZA_KEY;

/** drewno na noc przy dyżurze od teraz do 6:00: zapas (z tym, co w kozie), ile trzeba i do której starczy */
export function nightWood(i: GovInput): { have: number; need: number; until: string } {
  const now = i.hour + i.minute / 60;
  const left = (MORNING - now + 24) % 24;
  const need = Math.ceil(left * WOOD_PER_HOUR);
  const have = Math.max(0, Math.floor(i.stock.wood));
  const end = have >= need ? MORNING : Math.floor(now + have / WOOD_PER_HOUR) % 24;
  return { have, need, until: `${end}:00` };
}

/** godzina z zapasu drewna do tekstu: „0:00” to północ */
export const untilWord = (until: string): string => (until === '0:00' ? 'północy' : until);

/** do której starczy drewna przy dyżurze, w słowach („drewna starczy do około 2:00.”) */
export function woodNote(wd: { have: number; need: number; until: string }): string {
  if (wd.have >= wd.need) return 'drewna starczy do rana.';
  if (wd.have >= WOOD_PER_HOUR) return `drewna starczy do około ${untilWord(wd.until)}.`;
  return 'drewna prawie nie ma.';
}
const RAID_FROM = 23;
const RAID_SPAN = 5 * 60;

const verbPl = (list: { f: boolean }[], m: string, f: string, mp: string, fp: string) =>
  list.length === 1 ? g(list[0], m, f) : list.every((p) => p.f) ? fp : mp;

interface Post {
  key: string;
  name: string;
  weak: number;
}

/** miejsca do pilnowania od najsłabszego: dziury (większa łatwiejsza) i brama (słabsza przy kiepskiej siatce) */
export function postsOf(i: GovInput): Post[] {
  const f = fenceOf(i);
  const posts: Post[] = f.holes.map((h) => ({
    key: `d${h.id}`,
    name: `przy dziurze ${h.name}`,
    weak: round2(h.size + 0.2),
  }));
  posts.push({ key: 'brama', name: wordsOf(placeIn(i)).brama.przy, weak: round2(0.15 + 0.35 * (1 - f.durability)) });
  return posts.sort((a, b) => b.weak - a.weak || (a.key < b.key ? -1 : 1));
}

/** szansa, że szabrownicy spróbują tej nocy */
export function raidChance(st: GovState, i: GovInput): number {
  const f = fenceOf(i);
  const nd = nightDay(i);
  let c = 0.35 + 0.05 * Math.min(nd, 6);
  c += 0.06 * Math.min(4, f.holes.length);
  c += (0.5 - f.durability) * 0.2;
  if (i.light?.gateLamp) c -= 0.05;
  if (i.light?.campfire) c -= 0.05;
  if (st.flags.dog) c -= 0.03;
  if (law(st, 'u_warty')) c -= 0.05;
  if (law(st, 'u_brama')) c -= 0.08;
  if (st.tonight.boost === nd) c *= 1.5;
  return clamp(round2(c), 0.05, 0.85);
}

/** warta spoza karty nocy (polecenie z menu): z wejścia, a bez pola osoby z pracą 'guard' (miejsce nieznane: '') */
export function standingGuards(i: GovInput): { id: string; post: string }[] {
  if (i.guards) return i.guards.filter((g) => i.people.some((p) => p.id === g.id));
  // posterunki z odczytu symulacji (SimPerson.post: 'brama', 'd<id>', 'koza')
  if (i.people.some((p) => p.post !== undefined))
    return i.people.filter((p) => p.post).map((p) => ({ id: p.id, post: p.post as string }));
  return i.people.filter((p) => p.job === 'guard').map((p) => ({ id: p.id, post: '' }));
}

/** ilu ludzi pilnuje siatki: warta z karty plus ta, która już stoi (bez dubli, bez wychodzących na wyprawę
    i bez dyżuru przy kozie, bo ten jest w kuchni, nie przy siatce) */
export function watchersOf(i: GovInput, assign: Record<string, string>): number {
  const ids = new Set(
    Object.entries(assign)
      .filter(([, k]) => isFenceGuard(k))
      .map(([id]) => id),
  );
  for (const g of standingGuards(i)) {
    const k = assign[g.id] ?? '';
    if (g.post !== KOZA && !k.startsWith('wyprawa:') && k !== KOZA_KEY) ids.add(g.id);
  }
  return ids.size;
}

/** ilu szabrowników przychodzi przy danej sile napadu */
export const raidersOf = (attack: number): number => (attack < 3 ? 1 : attack < 4.2 ? 2 : 3);

/** ile z szansy zostaje, kiedy przy siatce widać wartę: mniej z dwiema osobami i przy świetle */
export function deterrence(st: GovState, i: GovInput, watchers: number): number {
  if (!watchers) return 1;
  const lit = !!(i.light?.campfire || i.light?.gateLamp || st.flags.flashlight);
  return Math.max(0.4, 1 - 0.2 * Math.min(2, watchers) - (lit ? 0.15 : 0));
}

export const chanceWord = (c: number): string => (c < 0.25 ? 'niska' : c < 0.5 ? 'średnia' : 'wysoka');

/** ile obrony daje osoba na warcie (guardValue z 0.2): wypoczęta więcej, ze światłem półtora raza */
export function guardValue(st: GovState, i: GovInput, p: GovPerson, post: string): number {
  const n = p.needs;
  let v = n.health < 20 ? 0.5 : n.rest > 30 ? 2.5 : 1.5;
  v *= 1 + 0.25 * (p.skills.obrona ?? 0);
  if (p.traits.includes('odwazny')) v *= 1.2;
  if (p.traits.includes('tchorz')) v *= 0.7;
  if (law(st, 'u_warty')) v *= 1.25;
  if ((post === 'brama' && i.light?.gateLamp) || st.flags.flashlight) v *= 1.5;
  return round1(v);
}

function defenseAt(st: GovState, i: GovInput, post: string, guards: { p: GovPerson; post: string }[]): number {
  const f = fenceOf(i);
  const nd = st.night?.day ?? nightDay(i);
  let d = 0;
  if (post === 'brama') d += 2 + 2 * f.durability + (law(st, 'u_warty') ? 1.5 : 0);
  if (st.flags.dog) d += post === 'brama' ? 1 : 0.5;
  for (const gd of guards) if (gd.post !== KOZA) d += gd.post === post ? guardValue(st, i, gd.p, gd.post) : 0.5;
  if (st.tonight.alert === nd) d += 3;
  if (st.tonight.bonusDay === nd) d += st.tonight.bonus;
  return round1(d);
}

/** spodziewane straty, jeśli wejdą (w 0.2 po 35% wszystkiego): drewno z podwórka i ze składu przy kozie,
    zapasy z piwnicy */
export function lossIfEntered(i: GovInput): { wood: number; supplies: number } {
  const s = i.stock;
  const split = s.woodLoose !== undefined || s.woodSklad !== undefined;
  const wood = split ? Math.round(0.7 * (s.woodLoose ?? 0) + 0.4 * (s.woodSklad ?? 0)) : Math.round(0.45 * s.wood);
  return { wood: Math.min(s.wood, wood), supplies: Math.round(0.35 * s.supplies) };
}

// ---------------------------------------------------------------- wyprawy

function tonightTargets(st: GovState): ExpTarget[] {
  const best = (r: ExpTarget['range']) =>
    TARGETS.filter((t) => t.range === r).sort((a, b) => (st.visits[a.id] ?? 0) - (st.visits[b.id] ?? 0))[0];
  return [best('blisko'), best('daleko')];
}

function expRisk(st: GovState, p: GovPerson, t: ExpTarget, together = 1): number {
  let r = t.risk;
  if (p.needs.rest < 35) r *= 1.4;
  if (p.needs.health < 50) r *= 1.3;
  if (p.traits.includes('odwazny')) r *= 0.7;
  if (p.traits.includes('tchorz')) r *= 1.3;
  r *= 1 - 0.1 * (p.skills.obrona ?? 0);
  if (st.flags.torch) r *= 0.85;
  if (together > 1) r *= 0.75;
  return clamp(round2(r), 0.02, 0.9);
}

const lootMult = (st: GovState, t: ExpTarget) => Math.max(0.3, 1 - 0.15 * (st.visits[t.id] ?? 0));

function expGain(st: GovState, t: ExpTarget): Partial<Record<LootKey, [number, number]>> {
  const m = lootMult(st, t);
  const out: Partial<Record<LootKey, [number, number]>> = {};
  for (const [k, [a, b]] of Object.entries(t.loot) as [LootKey, [number, number]][])
    out[k] = [Math.round(a * m), Math.round(b * m)];
  return out;
}

const canGo = (p: GovPerson, t: ExpTarget) =>
  t.range === 'daleko' ? p.needs.rest >= 40 && p.needs.health >= 45 : p.needs.rest >= 25 && p.needs.health >= 30;

// ---------------------------------------------------------------- karta

export function makeCard(st: GovState, i: GovInput): { card: NightCard; assign: Record<string, string> } {
  const posts = postsOf(i);
  const chance = raidChance(st, i);
  const targets = tonightTargets(st);
  // dyżur przy kozie tylko przy kozie zarządu (kuchnia z kozą w siedzibie)
  const wood = i.kitchen !== null ? nightWood(i) : undefined;
  const people = i.people.map((p) => {
    const opts: NightOption[] = [
      { key: 'sen', label: 'Śpi', ok: true, note: p.needs.rest < 30 ? 'Bardzo potrzebuje snu.' : undefined },
    ];
    if (wood) {
      const ok = p.needs.health >= 30;
      opts.push({
        key: KOZA_KEY,
        label: 'Czuwa przy kozie',
        ok,
        why: ok ? undefined : g(p, 'Za słaby na czuwanie.', 'Za słaba na czuwanie.'),
        // noc bez snu zjada około 50 sił (symulacja: 5 na godzinę od karty do 6:00)
        note: `Nie śpi i pilnuje ognia w kozie, ${woodNote(wood)}${p.needs.rest < 50 ? ' Rano będzie bez sił.' : ''}`,
      });
    }
    for (const post of posts) {
      const ok = p.needs.health >= 20;
      opts.push({
        key: `warta:${post.key}`,
        label: `Warta ${post.name}`,
        ok,
        why: ok ? undefined : g(p, 'Za słaby na wartę.', 'Za słaba na wartę.'),
        guard: guardValue(st, i, p, post.key),
        note: p.needs.rest < 30 ? `${g(p, 'Zmęczony', 'Zmęczona')}: może zasnąć na warcie.` : 'Nie wyśpi się.',
      });
    }
    for (const t of targets) {
      const ok = canGo(p, t);
      opts.push({
        key: `wyprawa:${t.range}`,
        label: `Wyprawa ${t.range}: ${targetName(t, placeIn(i))}`,
        ok,
        why: ok ? undefined : t.range === 'daleko' ? 'Za mało sił na daleką wyprawę.' : 'Za mało sił na wyprawę.',
        risk: expRisk(st, p, t),
        gain: expGain(st, t),
        target: t.id,
        note: t.range === 'daleko' ? 'Wraca o świcie, razem bezpieczniej.' : `Wraca o ${t.back}:00, potem śpi.`,
      });
    }
    return { id: p.id, name: p.name, needs: { ...p.needs }, proposal: 'sen', options: opts };
  });
  const loss = lossIfEntered(i);
  const nd = nightDay(i);
  const pct = Math.round(chance * 20) * 5;
  const first = nd === 1 ? 'Pierwsza noc za siatką. Dym z kozy widać z daleka. ' : '';
  const card: NightCard = {
    day: nd,
    chance,
    chanceWord: chanceWord(chance),
    forecast: `${first}Szansa, że szabrownicy spróbują wejść: około ${pct}% (${chanceWord(chance)}), z jedną osobą na warcie około ${Math.round(chance * deterrence(st, i, 1) * 20) * 5}%. Najsłabsze miejsce: ${posts[0].name}.`,
    posts: posts.map((p) => ({ key: p.key, name: p.name, weak: p.weak })),
    loss,
    people,
    advice: '',
    wood,
  };
  const assign = propose(i, card, st.lastGuards);
  for (const cp of card.people) cp.proposal = assign[cp.id];
  card.advice = nightAdvice(i, card, assign);
  return { card, assign };
}

/** propozycja zarządu: warta przy najsłabszym miejscu, przy dużym ryzyku druga, wyprawa przy brakach */
function propose(i: GovInput, card: NightCard, lastGuards: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (const p of i.people) a[p.id] = 'sen';
  // kto już stoi na warcie z menu, ten zostaje na swoim miejscu (jeśli karta ma takie)
  const standing = new Set<string>();
  for (const s of standingGuards(i)) {
    const key = `warta:${s.post}`;
    if (card.people.find((c) => c.id === s.id)?.options.some((o) => o.key === key && o.ok)) {
      a[s.id] = key;
      standing.add(s.id);
    }
  }
  // na wartę najpierw ci, co ostatniej nocy spali, potem umiejący się bić, potem wypoczęci
  const was = (p: GovPerson) => (lastGuards.includes(p.id) ? 1 : 0);
  const free = [...i.people]
    .filter((p) => p.needs.health >= 20 && !standing.has(p.id))
    .sort(
      (x, y) =>
        was(x) - was(y) ||
        (y.skills.obrona ?? 0) - (x.skills.obrona ?? 0) ||
        y.needs.rest - x.needs.rest ||
        (x.id < y.id ? -1 : 1),
    );
  // najsłabsze miejsca, których nikt jeszcze nie pilnuje (stojący przy kozie nie pilnuje siatki)
  const fence = [...standing].filter((id) => a[id] !== KOZA_KEY).length;
  const open = card.posts.filter((p) => !Object.values(a).includes(`warta:${p.key}`));
  if (card.chance >= 0.25 && free.length && open.length && !fence) a[free.shift()!.id] = `warta:${open[0].key}`;
  if (card.chance >= 0.55 && free.length >= 3 && open.length > 1 && fence < 2)
    a[free.shift()!.id] = `warta:${open[fence ? 0 : 1].key}`;
  const short = i.stock.supplies < i.people.length * 2 || i.stock.wood < 4;
  const key = nightDay(i) === 1 ? 'wyprawa:blisko' : 'wyprawa:daleko';
  if (short && free.length >= 2) {
    const goer = free
      .filter((p) => card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key)?.ok)
      .sort((x, y) => y.needs.rest - x.needs.rest)[0];
    if (goer) a[goer.id] = key;
  }
  // dyżur przy kozie zostaje decyzją gracza (kosztuje komuś noc snu): zarząd tylko o nim radzi
  return a;
}

/** rada zarządu do przydziału na karcie (interfejs liczy ją na nowo po każdej zmianie) */
export function nightAdvice(i: GovInput, card: NightCard, assign: Record<string, string>): string {
  const guards = Object.values(assign).filter(isFenceGuard);
  const kept = new Set(guards.map((k) => k.slice(6)));
  const loss = stockText(card.loss);
  const weak = card.posts[0];
  let fence = '';
  if (card.chance >= 0.25 && !guards.length)
    fence = `Bez warty ${weak.name} szabrownicy wejdą bez trudu${loss ? ` i mogą zabrać: ${loss}` : ''}.`;
  else if (guards.length && !kept.has(weak.key))
    fence = `Najsłabsze miejsce, ${weak.name}, zostaje bez warty. Tam najpewniej spróbują wejść.`;
  else if (guards.length && card.posts.some((p) => !kept.has(p.key)))
    fence = `Warta stoi ${weak.name}, ale dziur jest więcej. Za dnia warto łatać siatkę.`;
  const koza = kozaAdvice(i, card, assign);
  if (fence || koza) return [fence, koza].filter(Boolean).join(' ');
  if (i.stock.supplies < i.people.length * 2)
    return 'Jedzenia jest na krótko. Wyprawa blisko jest bezpieczniejsza, daleka przynosi więcej.';
  return 'Wyśpijcie się. Jutro dzień pracy przy siatce.';
}

/** rada o kozie, kiedy w kuchni zrobi się zimno, a jest drewno: bez dyżuru koza gaśnie w nocy (nikt nie
    dokłada, wszyscy śpią); z dyżurem ognia jest tyle, ile drewna */
function kozaAdvice(i: GovInput, card: NightCard, assign: Record<string, string>): string {
  const wd = card.wood;
  if (!wd || i.kitchen === null) return '';
  const who = i.people.filter((p) => assign[p.id] === KOZA_KEY);
  if (who.length)
    return wd.have >= wd.need
      ? ''
      : `Przy kozie ${who.length > 1 ? 'czuwają' : 'czuwa'} ${peopleNames(who)}, ale ${woodNote(wd)}`;
  if (wd.have < WOOD_PER_HOUR) return '';
  const deg = Math.round(i.kitchen);
  const now = !i.kozaLit
    ? `Koza jest zimna, w kuchni ${deg}°C.`
    : deg < 16
      ? `W kuchni już tylko ${deg}°C.`
      : 'Bez dyżuru koza zgaśnie w nocy i rano w kuchni będzie zimno.';
  return `${now} Niech ktoś czuwa przy kozie: ${woodNote(wd)}`;
}

/** zmiana przydziału na karcie; false, gdy takiej opcji nie ma albo nie wolno */
export function setAssign(st: GovState, id: string, key: string): boolean {
  const n = st.night;
  if (!n || n.confirmed) return false;
  const opt = n.card.people.find((p) => p.id === id)?.options.find((o) => o.key === key);
  if (!opt?.ok) return false;
  n.assign[id] = key;
  return true;
}

// ---------------------------------------------------------------- noc

export function confirm(st: GovState, i: GovInput, fx: GovEffects, auto: boolean): void {
  const n = st.night;
  if (!n || n.confirmed) return;
  n.confirmed = true;
  n.t0 = st.trust;
  n.a0 = st.anger;
  // wyprawy w grupach według celu
  const groups = new Map<string, string[]>();
  for (const p of i.people) {
    const key = n.assign[p.id] ?? 'sen';
    if (key.startsWith('wyprawa:')) {
      const target = n.card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key)?.target;
      if (!target) continue;
      groups.set(target, [...(groups.get(target) ?? []), p.id]);
    } else if (key.startsWith('warta:')) fx.guards.push({ id: p.id, post: key.slice(6) });
  }
  n.exp = [...groups].map(([target, ids]) => ({ key: target, ids, target }));
  for (const gr of n.exp) {
    const t = TARGETS.find((x) => x.id === gr.target)!;
    for (const id of gr.ids) fx.away.push({ id, day: n.day + 1, hour: t.back });
  }
  // napad: czy, gdzie i o której (zawsze te same trzy losowania); warta ze światłem odstrasza, także ta z menu
  const watchers = watchersOf(i, n.assign);
  const come = rnd(st) < raidChance(st, i) * deterrence(st, i, watchers);
  const posts = postsOf(i);
  let r = rnd(st) * posts.reduce((s, p) => s + p.weak, 0);
  let post = posts[posts.length - 1];
  for (const p of posts) {
    r -= p.weak;
    if (r <= 0) {
      post = p;
      break;
    }
  }
  const at = atHour(n.day, RAID_FROM) + Math.floor(rnd(st) * RAID_SPAN);
  // siła losowana od razu: symulacja pokaże tylu szabrowników, ilu przyszło, a rozstrzygnięcie użyje tej samej
  const attack = come ? round1(2 + rnd(st) * (2 + 0.55 * n.day)) : 0;
  n.raid = { come, at, post: post.key, resolved: false, outcome: 'brak', attack, defense: 0, stolen: zeroStock() };
  if (come) fx.raid = { day: n.day, at, post: post.key, where: post.name, attack, people: raidersOf(attack) };
  // kronika
  n.fire = { on: 0, all: 0, at: gameMin(i) };
  n.koza = [];
  const on = (pred: (k: string) => boolean) => i.people.filter((p) => pred(n.assign[p.id] ?? 'sen'));
  const watch = on(isFenceGuard);
  const koza = on((k) => k === KOZA_KEY);
  const out = on((k) => k.startsWith('wyprawa:'));
  const parts: string[] = [];
  if (watch.length) parts.push(`na warcie ${peopleNames(watch)}`);
  if (koza.length) parts.push(`przy kozie ${peopleNames(koza)}`);
  if (out.length) parts.push(`na wyprawie ${peopleNames(out)}`);
  parts.push(watch.length || koza.length || out.length ? 'reszta śpi' : 'wszyscy śpią');
  logGov(
    st,
    i,
    `${auto ? `${wordsOf(placeIn(i)).Zarzad} nie zdążył się naradzić, zostaje propozycja. ` : ''}Noc: ${parts.join(', ')}.`,
    false,
    fx,
  );
  if (!auto) decision(st, i, 'karta');
}

function returnExp(st: GovState, i: GovInput, fx: GovEffects, gr: { ids: string[]; target: string }): void {
  const n = st.night!;
  const t = TARGETS.find((x) => x.id === gr.target)!;
  n.returned.push(gr.target);
  const ppl = gr.ids.map((id) => i.people.find((p) => p.id === id)).filter((p): p is GovPerson => !!p);
  if (!ppl.length) return;
  const m = lootMult(st, t);
  st.visits[t.id] = (st.visits[t.id] ?? 0) + 1;
  const got = zeroStock();
  for (const [k, [a, b]] of Object.entries(t.loot) as [LootKey, [number, number]][])
    got[k] = Math.round(rint(st, a, b) * m * (ppl.length > 1 ? 1.6 : 1));
  const risk = Math.max(...ppl.map((p) => expRisk(st, p, t, ppl.length)));
  const trouble = rnd(st) < risk;
  const who = peopleNames(ppl);
  if (trouble) {
    for (const k of Object.keys(got) as LootKey[]) got[k] = Math.floor(got[k] / 2);
    const hurt = ppl[rint(st, 0, ppl.length - 1)];
    const d = -rint(st, 20, 35);
    addNeeds(fx, hurt.id, { health: d });
    n.hurt.push({ id: hurt.id, d });
    const has = stockText(got);
    n.lines.push(
      `${who} ${verbPl(ppl, 'trafił', 'trafiła', 'trafili', 'trafiły')} na szabrowników (${targetName(t, placeIn(i))}). ${hurt.name} ${g(hurt, 'jest ranny', 'jest ranna')}.${has ? ` Udało się przynieść: ${has}.` : ' Wszystko zostało po drodze.'}`,
    );
    for (const p of ppl) fx.moods.push({ id: p.id, why: g(p, 'Ledwo uciekłem', 'Ledwo uciekłam'), d: -6, hours: 12 });
  } else {
    const has = stockText(got);
    n.lines.push(
      has
        ? `${who} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${targetName(t, placeIn(i))}. ${verbPl(ppl, 'Przyniósł', 'Przyniosła', 'Przynieśli', 'Przyniosły')}: ${has}.`
        : `${who} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${targetName(t, placeIn(i))} z pustymi rękami.`,
    );
    if (has) {
      mood(st, 1, 0);
      for (const p of ppl)
        fx.moods.push({ id: p.id, why: g(p, 'Wróciłem z łupem', 'Wróciłam z łupem'), d: 4, hours: 12 });
    }
  }
  for (const k of Object.keys(got) as LootKey[]) {
    fx.stock[k] += got[k];
    n.loot[k] += got[k];
  }
  for (const p of ppl) addNeeds(fx, p.id, { rest: t.range === 'daleko' ? -30 : -15 });
  fx.back.push(...ppl.map((p) => p.id));
}

function resolveRaid(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night!;
  const r = n.raid!;
  r.resolved = true;
  if (!r.come) {
    const watched = Object.values(n.assign).some(isFenceGuard);
    n.lines.push(watched ? 'Nikt nie próbował wejść. Pewnie widzieli wartę przy siatce.' : 'Nikt nie próbował wejść.');
    for (const p of i.people) addNeeds(fx, p.id, { safe: 4 });
    return;
  }
  const posts = postsOf(i);
  // załatana dziura: idą do bramy
  const post = posts.find((p) => p.key === r.post) ?? posts.find((p) => p.key === 'brama')!;
  // warta z karty, potem ta, która stoi z menu (bez dubli i bez tych na wyprawie)
  const guards: { p: GovPerson; post: string }[] = i.people
    .filter((p) => isFenceGuard(n.assign[p.id] ?? ''))
    .map((p) => ({ p, post: n.assign[p.id].slice(6) }));
  for (const s of standingGuards(i)) {
    const p = i.people.find((q) => q.id === s.id);
    const key = n.assign[s.id] ?? '';
    if (p && s.post !== KOZA && !key.startsWith('warta:') && !key.startsWith('wyprawa:'))
      guards.push({ p, post: s.post });
  }
  const awake: { p: GovPerson; post: string }[] = [];
  for (const gd of guards) {
    const p = gd.p;
    const pr = p.needs.rest < 15 ? 0.5 : p.needs.rest < 30 ? 0.15 : 0;
    if (rnd(st) < pr) {
      n.lines.push(`${p.name} ${g(p, 'zasnął', 'zasnęła')} na warcie.`);
      n.slept.push(p.id);
    } else awake.push(gd);
  }
  const defense = defenseAt(st, i, post.key, awake);
  // siła z planu (losowana przy zatwierdzeniu karty); stary zapis bez niej losuje teraz
  const attack = r.attack || round1(2 + rnd(st) * (2 + 0.55 * n.day));
  r.attack = attack;
  r.defense = defense;
  const here = awake.filter((gd) => gd.post === post.key).map((gd) => gd.p);
  const result = (outcome: 'odparty' | 'wtargnięcie', stolen = zeroStock()) => {
    fx.raidResult = {
      day: n.day,
      outcome,
      post: post.key,
      where: post.name,
      attack,
      defense,
      stolen: { ...stolen },
      slept: [...n.slept],
    };
  };
  if (defense >= attack) {
    r.outcome = 'odparty';
    const why = awake.length
      ? 'warta usłyszała i przybiegła'
      : st.flags.dog
        ? 'pies narobił hałasu'
        : 'siatka wytrzymała';
    n.lines.push(
      here.length
        ? `W nocy szabrownicy podeszli ${post.name}. ${peopleNames(here)} ${verbPl(here, 'przegonił', 'przegoniła', 'przegonili', 'przegoniły')} ich.`
        : `Ktoś kręcił się w nocy ${post.name}, ale ${why}.`,
    );
    mood(st, 2, -1);
    for (const p of here) fx.moods.push({ id: p.id, why: 'Przegoniliśmy szabrowników', d: 6, hours: 12 });
    for (const p of i.people) addNeeds(fx, p.id, { safe: 8 });
    logGov(st, i, n.lines[n.lines.length - 1], true, fx);
    result('odparty');
    return;
  }
  r.outcome = 'wtargnięcie';
  const loss = lossIfEntered(i);
  const stolen = zeroStock();
  stolen.wood = -addStock(i, fx, 'wood', -loss.wood);
  stolen.supplies = -addStock(i, fx, 'supplies', -loss.supplies);
  stolen.scrap = -addStock(i, fx, 'scrap', -Math.floor(0.3 * (i.stock.scrap ?? 0)));
  r.stolen = stolen;
  result('wtargnięcie', stolen);
  n.lines.push(
    `Szabrownicy weszli ${post.name} i zabrali: ${stockText(stolen) || 'niewiele, bo nic nie leżało na wierzchu'}.`,
  );
  logGov(st, i, n.lines[n.lines.length - 1], true, fx);
  mood(st, -2, 4);
  for (const p of i.people) {
    addNeeds(fx, p.id, { safe: -25 });
    fx.moods.push({ id: p.id, why: 'Szabrownicy weszli na podwórko', d: -8, hours: 12 });
  }
  if (here.length) {
    const v = here[rint(st, 0, here.length - 1)];
    addNeeds(fx, v.id, { health: -25 });
    n.hurt.push({ id: v.id, d: -25 });
    n.lines.push(`${v.name} ${g(v, 'oberwał', 'oberwała')} ${post.name}.`);
  }
}

function morning(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night!;
  for (const l of st.later.filter((x) => x.day === n.day)) {
    for (const [k, v] of Object.entries(l.stock) as [LootKey, number][]) addStock(i, fx, k, v);
    n.lines.push(l.line);
  }
  st.later = st.later.filter((x) => x.day !== n.day);
  const watch = i.people.filter((p) => isFenceGuard(n.assign[p.id] ?? ''));
  // przy kozie: kto stał tam w nocy według symulacji (karta albo menu kozy), bez posterunków: z karty
  const simPosts = i.people.some((p) => p.post !== undefined);
  const koza = i.people.filter((p) => (simPosts ? (n.koza ?? []).includes(p.id) : n.assign[p.id] === KOZA_KEY));
  st.lastGuards = [...watch, ...koza].map((p) => p.id);
  const guards = watch.filter((p) => !n.slept.includes(p.id));
  // noc bez snu: symulacja z posterunkami liczy ją sama, atrapa bez nich dostaje ją tutaj
  if (!simPosts) for (const p of [...watch, ...koza]) addNeeds(fx, p.id, { rest: n.slept.includes(p.id) ? -15 : -30 });
  for (const p of guards) fx.moods.push({ id: p.id, why: 'Całą noc na warcie', d: -2, hours: 8 });
  for (const p of koza) fx.moods.push({ id: p.id, why: 'Całą noc przy kozie', d: -1, hours: 8 });
  if (guards.length)
    n.lines.push(`${peopleNames(guards)} nie ${verbPl(guards, 'spał', 'spała', 'spali', 'spały')} całą noc.`);
  // kuchnia rano: ile nocy paliła się koza i kto przy niej czuwał
  const fire = n.fire?.all ? round2(n.fire.on / n.fire.all) : undefined;
  if (i.kitchen !== null && fire !== undefined) n.lines.push(kitchenLine(i.kitchen, fire, koza, i.stock.wood));
  if (!n.lines.length) n.lines.push('Spokojna noc.');
  dailyDrift(st, i);
  const far = n.exp.filter((e) => TARGETS.find((t) => t.id === e.target)?.range === 'daleko').flatMap((e) => e.ids);
  const report: NightReport = {
    day: n.day,
    lines: [...n.lines],
    raid: n.raid?.outcome ?? 'brak',
    stolen: n.raid?.stolen ?? zeroStock(),
    loot: { ...n.loot },
    hurt: n.hurt.map((h) => ({ id: h.id, name: i.people.find((p) => p.id === h.id)?.name ?? h.id, d: h.d })),
    tired: [...guards.map((p) => p.id), ...koza.map((p) => p.id), ...far],
    trust: st.trust,
    anger: st.anger,
    dTrust: round2(st.trust - n.t0),
    dAnger: round2(st.anger - n.a0),
    kitchen: i.kitchen === null ? null : round1(i.kitchen),
    fire,
    koza: koza.map((p) => p.name),
  };
  st.report = report;
  st.reports.push(report);
  if (st.reports.length > 10) st.reports.shift();
  st.night = null;
  logGov(
    st,
    i,
    `Rano po nocy ${n.day}: zaufanie ${Math.round(st.trust)}, wkurzenie ${Math.round(st.anger)}.`,
    false,
    fx,
  );
}

/** przebieg nocy po zatwierdzeniu: powroty z wypraw, napad o swojej godzinie, raport o 6:00 */
export function nightTick(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night;
  if (!n?.confirmed) return;
  const t = gameMin(i);
  for (const gr of n.exp) {
    const tg = TARGETS.find((x) => x.id === gr.target)!;
    if (!n.returned.includes(gr.target) && t >= atHour(n.day + 1, tg.back)) returnExp(st, i, fx, gr);
  }
  if (n.raid && !n.raid.resolved && t >= n.raid.at) resolveRaid(st, i, fx);
  // ogień w kozie od 22:00 do rana w minutach gry (do raportu: czy w kuchni było ciepło) i kto przy niej stał
  if (n.fire && i.kitchen !== null) {
    const from = Math.max(n.fire.at, atHour(n.day, 22));
    const to = Math.min(t, atHour(n.day + 1, MORNING));
    if (to > from) {
      n.fire.all += to - from;
      if (i.kozaLit) n.fire.on += to - from;
    }
    n.fire.at = Math.max(n.fire.at, t);
    if (t >= atHour(n.day, 22) && t < atHour(n.day + 1, MORNING))
      for (const s of standingGuards(i)) if (s.post === KOZA && !n.koza?.includes(s.id)) (n.koza ??= []).push(s.id);
  }
  if (t >= atHour(n.day + 1, MORNING)) morning(st, i, fx);
}

/** linia raportu o kuchni rano: jak długo paliła się koza, kto przy niej czuwał i ile stopni o 6:00 */
function kitchenLine(t: number, fire: number, koza: GovPerson[], wood: number): string {
  const deg = `${Math.round(t)}°C`;
  const warm = t >= 18 ? 'ciepło' : t >= 15 ? 'chłodno' : 'zimno';
  if (koza.length) {
    const who = `${peopleNames(koza)} ${verbPl(koza, 'czuwał', 'czuwała', 'czuwali', 'czuwały')} przy kozie`;
    if (fire >= 0.9) return `${who} i ogień palił się całą noc. Rano w kuchni ${warm}, ${deg}.`;
    return `${who}, ale ${wood < WOOD_PER_HOUR ? 'drewna nie starczyło do rana' : 'koza część nocy była zimna'}. Rano w kuchni ${warm}, ${deg}.`;
  }
  if (fire >= 0.9) return `Koza paliła się całą noc. Rano w kuchni ${warm}, ${deg}.`;
  return `Nikt nie dokładał do kozy i ${fire > 0 ? 'zgasła w nocy' : 'wystygła wieczorem'}. Rano w kuchni ${warm}, ${deg}.`;
}
