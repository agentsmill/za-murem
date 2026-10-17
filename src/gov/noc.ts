/* Karta nocy jak w 0.1 i 0.2: o 20:00 zarząd proponuje, kto śpi, kto trzyma wartę (przy bramie albo
   przy dziurze w siatce) i kto idzie na wyprawę (blisko albo daleko); szansę napadu, spodziewane straty
   i łup widać przed decyzją. Przy zatwierdzeniu losuje się, czy szabrownicy przyjdą, gdzie i o której
   (23:00–4:00). O tej godzinie obronę liczy się z tego, co jest: kto nie zasnął, światło, pies, brama.
   Wyprawy wracają o 1:00 (blisko) albo o świcie (daleko), o 6:00 raport. Losowość z ziarna gry. */

import { g } from '../content/people.ts';
import { clamp } from '../core/rng.ts';
import { type ExpTarget, peopleNames, TARGETS } from './tresc.ts';
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
  posts.push({ key: 'brama', name: 'przy bramie', weak: round2(0.15 + 0.35 * (1 - f.durability)) });
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
  for (const gd of guards) d += gd.post === post ? guardValue(st, i, gd.p, gd.post) : 0.5;
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
  const people = i.people.map((p) => {
    const opts: NightOption[] = [
      { key: 'sen', label: 'Śpi', ok: true, note: p.needs.rest < 30 ? 'Bardzo potrzebuje snu.' : undefined },
    ];
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
        label: `Wyprawa ${t.range}: ${t.name}`,
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
  };
  const assign = propose(i, card, st.lastGuards);
  for (const cp of card.people) cp.proposal = assign[cp.id];
  card.advice = advice(i, card, assign);
  return { card, assign };
}

/** propozycja zarządu: warta przy najsłabszym miejscu, przy dużym ryzyku druga, wyprawa przy brakach */
function propose(i: GovInput, card: NightCard, lastGuards: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (const p of i.people) a[p.id] = 'sen';
  // na wartę najpierw ci, co ostatniej nocy spali, potem umiejący się bić, potem wypoczęci
  const was = (p: GovPerson) => (lastGuards.includes(p.id) ? 1 : 0);
  const free = [...i.people]
    .filter((p) => p.needs.health >= 20)
    .sort(
      (x, y) =>
        was(x) - was(y) ||
        (y.skills.obrona ?? 0) - (x.skills.obrona ?? 0) ||
        y.needs.rest - x.needs.rest ||
        (x.id < y.id ? -1 : 1),
    );
  if (card.chance >= 0.25 && free.length) a[free.shift()!.id] = `warta:${card.posts[0].key}`;
  if (card.chance >= 0.55 && free.length >= 3 && card.posts.length > 1)
    a[free.shift()!.id] = `warta:${card.posts[1].key}`;
  const short = i.stock.supplies < i.people.length * 2 || i.stock.wood < 4;
  const key = nightDay(i) === 1 ? 'wyprawa:blisko' : 'wyprawa:daleko';
  if (short && free.length >= 2) {
    const goer = free
      .filter((p) => card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key)?.ok)
      .sort((x, y) => y.needs.rest - x.needs.rest)[0];
    if (goer) a[goer.id] = key;
  }
  return a;
}

function advice(i: GovInput, card: NightCard, assign: Record<string, string>): string {
  const guards = Object.values(assign).filter((k) => k.startsWith('warta:'));
  const loss = stockText(card.loss);
  if (card.chance >= 0.25 && !guards.length)
    return `Bez warty ${card.posts[0].name} szabrownicy wejdą bez trudu${loss ? ` i mogą zabrać: ${loss}` : ''}.`;
  if (guards.length && card.posts.length > guards.length)
    return `Warta pilnuje ${card.posts[0].name}, ale dziur jest więcej. Za dnia warto łatać siatkę.`;
  if (i.stock.supplies < i.people.length * 2)
    return 'Jedzenia jest na krótko. Wyprawa blisko jest bezpieczniejsza, daleka przynosi więcej.';
  return 'Wyśpijcie się. Jutro dzień pracy przy siatce.';
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
  // napad: czy, gdzie i o której (zawsze te same trzy losowania); warta ze światłem odstrasza
  const watchers = Object.values(n.assign).filter((k) => k.startsWith('warta:')).length;
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
  n.raid = { come, at, post: post.key, resolved: false, outcome: 'brak', attack: 0, defense: 0, stolen: zeroStock() };
  if (come) fx.raid = { day: n.day, at, post: post.key, where: post.name };
  // kronika
  const on = (pred: (k: string) => boolean) => i.people.filter((p) => pred(n.assign[p.id] ?? 'sen'));
  const watch = on((k) => k.startsWith('warta:'));
  const out = on((k) => k.startsWith('wyprawa:'));
  const parts: string[] = [];
  if (watch.length) parts.push(`na warcie ${peopleNames(watch)}`);
  if (out.length) parts.push(`na wyprawie ${peopleNames(out)}`);
  parts.push(watch.length || out.length ? 'reszta śpi' : 'wszyscy śpią');
  logGov(
    st,
    i,
    `${auto ? 'Zarząd nie zdążył się naradzić, zostaje propozycja. ' : ''}Noc: ${parts.join(', ')}.`,
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
      `${who} ${verbPl(ppl, 'trafił', 'trafiła', 'trafili', 'trafiły')} na szabrowników (${t.name}). ${hurt.name} ${g(hurt, 'jest ranny', 'jest ranna')}.${has ? ` Udało się przynieść: ${has}.` : ' Wszystko zostało po drodze.'}`,
    );
    for (const p of ppl) fx.moods.push({ id: p.id, why: g(p, 'Ledwo uciekłem', 'Ledwo uciekłam'), d: -6, hours: 12 });
  } else {
    const has = stockText(got);
    n.lines.push(
      has
        ? `${who} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${t.name}. Przynieśli: ${has}.`
        : `${who} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${t.name} z pustymi rękami.`,
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
    const watched = Object.values(n.assign).some((k) => k.startsWith('warta:'));
    n.lines.push(watched ? 'Nikt nie próbował wejść. Pewnie widzieli wartę przy siatce.' : 'Nikt nie próbował wejść.');
    for (const p of i.people) addNeeds(fx, p.id, { safe: 4 });
    return;
  }
  const posts = postsOf(i);
  // załatana dziura: idą do bramy
  const post = posts.find((p) => p.key === r.post) ?? posts.find((p) => p.key === 'brama')!;
  const guards = i.people.filter((p) => (n.assign[p.id] ?? '').startsWith('warta:'));
  const awake: GovPerson[] = [];
  for (const p of guards) {
    const pr = p.needs.rest < 15 ? 0.5 : p.needs.rest < 30 ? 0.15 : 0;
    if (rnd(st) < pr) {
      n.lines.push(`${p.name} ${g(p, 'zasnął', 'zasnęła')} na warcie.`);
      n.slept.push(p.id);
    } else awake.push(p);
  }
  const defense = defenseAt(
    st,
    i,
    post.key,
    awake.map((p) => ({ p, post: n.assign[p.id].slice(6) })),
  );
  const attack = round1(2 + rnd(st) * (2 + 0.55 * n.day));
  r.attack = attack;
  r.defense = defense;
  const here = awake.filter((p) => n.assign[p.id] === `warta:${post.key}`);
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
    return;
  }
  r.outcome = 'wtargnięcie';
  const loss = lossIfEntered(i);
  const stolen = zeroStock();
  stolen.wood = -addStock(i, fx, 'wood', -loss.wood);
  stolen.supplies = -addStock(i, fx, 'supplies', -loss.supplies);
  stolen.scrap = -addStock(i, fx, 'scrap', -Math.floor(0.3 * (i.stock.scrap ?? 0)));
  r.stolen = stolen;
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
  const watch = i.people.filter((p) => (n.assign[p.id] ?? '').startsWith('warta:'));
  st.lastGuards = watch.map((p) => p.id);
  const guards = watch.filter((p) => !n.slept.includes(p.id));
  for (const p of watch) addNeeds(fx, p.id, { rest: n.slept.includes(p.id) ? -15 : -30 });
  for (const p of guards) fx.moods.push({ id: p.id, why: 'Całą noc na warcie', d: -2, hours: 8 });
  if (guards.length)
    n.lines.push(`${peopleNames(guards)} nie ${verbPl(guards, 'spał', 'spała', 'spali', 'spały')} całą noc.`);
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
    tired: [...guards.map((p) => p.id), ...far],
    trust: st.trust,
    anger: st.anger,
    dTrust: round2(st.trust - n.t0),
    dAnger: round2(st.anger - n.a0),
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
  if (t >= atHour(n.day + 1, MORNING)) morning(st, i, fx);
}
