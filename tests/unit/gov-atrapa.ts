/* Atrapa symulacji dla zarządu (src/gov): czterech ludzi z generatora 0.3, zegar jak w symulacji
   (godzina gry to 800 ticków, 20 ticków na sekundę przy 1×, start o 15:00), proste potrzeby, koza
   zjadająca drewno, zapasy, ognisko wieczorem, siatka z trzema dziurami. Stosuje skutki zarządu.
   Książki z wydarzeń (GovEffects.books) trafiają na półkę atrapy tak jak w applyGov: najwyżej 2 na dziedzinę, trzecia
   to +1 drewna; wejście zarządu ma `books` i `know` jak govInput (wiedza = najlepsza osoba na miejscu plus najwyżej
   2 książki z dziedziny). Do tego przebieg z polityką gracza, który od razu odpowiada na karty. Używają jej testy
   i tools/trzy-noce.ts.

   Mapa miasta: pole `okolica` (miejsca z OSM) trafia do wejścia zarządu tylko wtedy, gdy jest ustawione, a osoba
   z mapy `away` ma w wejściu `away: true`, jak pionek poza mapą w prawdziwej symulacji. Bez `okolica` wejście
   jest takie jak przed mapą miasta. Dziury w siatce mają kafelki (`GovHole.tiles`), a wejście `strony` (zmyślone numery
   kafelków), więc „Sprawdzić” z krzyku i hałasu działa na atrapie tak jak w grze. */

import type { TechDom } from '../../src/content/data.ts';
import { TECH_DOMS } from '../../src/content/data.ts';
import { makePerson } from '../../src/content/people.ts';
import { mulberry, type Rng } from '../../src/core/rng.ts';
import type { GovEffects, GovFence, GovInput, GovPerson, GovState, Prompt } from '../../src/gov/typy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  setNight,
  signLaw,
} from '../../src/gov/zarzad.ts';
import { grajDalej } from '../../src/gov/zwyciestwo.ts';
import type { Miejsce } from '../../src/world/miasto.ts';

export const TPS = 20;
export const TPH = 800;
/** ile książek z jednej dziedziny mieści półka i liczy się do wiedzy (jak KSIAZEK_NA_DZIEDZINE w src/sim/badania.ts) */
const KSIAZEK_NA_DZIEDZINE = 2;
const START = 15 * 60;
const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

export class Atrapa {
  tick = 0;
  people: GovPerson[];
  woodSklad = 0;
  woodLoose = 0;
  supplies = 20;
  scrap = 1;
  parts = 0;
  meds = 0;
  fence: GovFence = {
    holes: [
      { id: 1, size: 0.8, tiles: [1101, 1102] },
      { id: 2, size: 0.5, tiles: [2201] },
      { id: 3, size: 0.3, tiles: [3301, 3302] },
    ],
    durability: 0.55,
  };
  /** kafelki podwórka przy siatce od strony garaży i najbliższego budynku mieszkalnego (`GovInput.strony`); zmyślone
      numery, atrapa nie ma mapy */
  strony: { garaze: number; blok: number } = { garaze: 4111, blok: 4222 };
  fire = 0;
  campfire = false;
  residents = 4;
  burned = 0;
  /** id → minuta gry powrotu; kto tu jest, ma w wejściu `away: true` (poza mapą na wyprawie) */
  away: Record<string, number> = {};
  /** miejsca z okolicy (mapa miasta) przekazywane do wejścia; bez pola zarząd gra na TARGETS jak dotąd */
  okolica?: Miejsce[];
  guards: string[] = [];
  /** półka osady: książki według dziedziny (jak SimState.books) */
  books: Partial<Record<TechDom, number>> = {};

  constructor(seed: number) {
    const r = mulberry(seed);
    const used = new Set<string>();
    let id = 1;
    this.people = Array.from({ length: 4 }, (_, k) => {
      const p = makePerson(r, used, () => id++);
      used.add(p.first);
      return {
        pawn: k,
        id: p.id,
        name: p.name,
        first: p.first,
        f: p.f,
        age: p.age,
        prof: p.prof,
        skills: p.skills,
        traits: p.traits,
        needs: { food: 55, warm: 45, rest: 65, health: 100, safe: 60, mood: 50 },
        job: null,
        asleep: false,
        inside: true,
      };
    });
  }

  get minutes(): number {
    return START + (this.tick * 60) / TPH;
  }
  get day(): number {
    return Math.floor(this.minutes / 1440) + 1;
  }
  get hour(): number {
    return Math.floor(this.minutes / 60) % 24;
  }
  get minute(): number {
    return Math.floor(this.minutes) % 60;
  }

  input(): GovInput {
    const h = this.hour;
    return {
      tick: this.tick,
      day: this.day,
      hour: h,
      minute: this.minute,
      season: 0,
      night: h >= 22 || h < 6,
      outdoor: 8,
      kitchen: this.fire > 0 ? 18 : 9,
      kozaLit: this.fire > 0,
      people: this.people.map((p) => ({
        ...p,
        needs: { ...p.needs },
        inside: !(p.id in this.away),
        ...(p.id in this.away ? { away: true } : {}),
      })),
      stock: {
        wood: this.woodSklad + this.woodLoose,
        woodSklad: this.woodSklad,
        woodLoose: this.woodLoose,
        supplies: this.supplies,
        scrap: this.scrap,
        parts: this.parts,
        meds: this.meds,
      },
      screen: this.tick / TPS,
      fence: {
        holes: this.fence.holes.map((x) => ({ ...x, ...(x.tiles ? { tiles: [...x.tiles] } : {}) })),
        durability: this.fence.durability,
      },
      strony: { ...this.strony },
      light: { campfire: this.campfire, gateLamp: false },
      residents: this.residents,
      burned: this.burned,
      hqName: 'Atrapia 7',
      ...(this.okolica ? { okolica: this.okolica } : {}),
      books: { ...this.books },
      know: this.know(),
    };
  }

  /** wiedza osady jak `wiedza` z src/sim/badania.ts: najwyższa umiejętność wśród osób na miejscu (nie na wyprawie)
      plus najwyżej 2 książki z dziedziny */
  private know(): Record<TechDom, number> {
    const here = this.people.filter((p) => !(p.id in this.away));
    return Object.fromEntries(
      TECH_DOMS.map((d) => [
        d,
        Math.max(0, ...here.map((p) => p.skills[d] ?? 0)) + Math.min(KSIAZEK_NA_DZIEDZINE, this.books[d] ?? 0),
      ]),
    ) as Record<TechDom, number>;
  }

  /** godzina gry: samouczek (drewno z suchego drzewa o 16:00), drewno ścinane co dzień przed południem
      i zanoszone do składu po południu, koza wieczorem i w nocy, ognisko, posiłki, potrzeby */
  hourly(foodMult: number): void {
    const h = this.hour;
    if (this.day === 1 && h === 16) {
      this.woodSklad += 6;
      this.woodLoose += 4;
    }
    if (this.day >= 2 && h === 11) this.woodLoose += 8;
    if (h === 15) {
      const n = Math.min(6, this.woodLoose);
      this.woodLoose -= n;
      this.woodSklad += n;
    }
    const kozaHours = h >= 17 || h < 8;
    if (this.fire > 0) this.fire--;
    if (kozaHours && this.fire < 1 && this.takeWood(1)) this.fire += 1;
    if (h === 18) this.campfire = this.woodLoose >= 1 && this.takeLoose(1);
    if (h === 23) this.campfire = false;
    const night = h >= 22 || h < 6;
    for (const p of this.people) {
      if (p.id in this.away) continue;
      const n = p.needs;
      const asleep = night && !this.guards.includes(p.id);
      p.asleep = asleep;
      n.food = clamp100(n.food - (asleep ? 2 : 4));
      if ((h === 13 || h === 19) && this.supplies >= foodMult) {
        this.supplies = Math.round((this.supplies - foodMult) * 100) / 100;
        n.food = clamp100(n.food + 40);
      }
      n.rest = clamp100(n.rest + (asleep ? 10 : night ? -5 : -4));
      n.warm = clamp100(n.warm + (this.fire > 0 ? 10 : -6));
      n.safe = clamp100(n.safe + (night ? (asleep ? -1 : -3) : n.safe < 70 ? 3 : 0));
      n.health = clamp100(n.health + (n.food < 15 || n.warm < 15 ? -3 : 1));
      n.mood = Math.round(0.25 * n.food + 0.25 * n.warm + 0.15 * n.rest + 0.15 * n.health + 0.2 * n.safe);
    }
    if (h === 6) this.guards = [];
  }

  private takeLoose(n: number): boolean {
    if (this.woodLoose < n) return false;
    this.woodLoose -= n;
    return true;
  }
  private takeWood(n: number): boolean {
    if (this.woodSklad >= n) {
      this.woodSklad -= n;
      return true;
    }
    return this.takeLoose(n);
  }

  apply(fx: GovEffects): void {
    const w = fx.stock.wood;
    if (w > 0) this.woodLoose += w;
    else if (w < 0) {
      const fromLoose = Math.min(this.woodLoose, -w);
      this.woodLoose -= fromLoose;
      this.woodSklad = Math.max(0, this.woodSklad - (-w - fromLoose));
    }
    this.supplies = Math.max(0, this.supplies + fx.stock.supplies);
    this.scrap = Math.max(0, this.scrap + fx.stock.scrap);
    this.parts = Math.max(0, this.parts + fx.stock.parts);
    this.meds = Math.max(0, this.meds + fx.stock.meds);
    for (const { id, d } of fx.needs) {
      const p = this.people.find((x) => x.id === id);
      if (!p) continue;
      for (const [k, v] of Object.entries(d) as [keyof GovPerson['needs'], number][])
        p.needs[k] = clamp100(p.needs[k] + v);
    }
    for (const m of fx.moods) {
      const p = this.people.find((x) => x.id === m.id);
      if (p) p.needs.mood = clamp100(p.needs.mood + m.d);
    }
    for (const a of fx.away) this.away[a.id] = (a.day - 1) * 1440 + a.hour * 60;
    for (const id of fx.back) delete this.away[id];
    for (const p of fx.join)
      this.people.push({
        pawn: this.people.length,
        id: p.id,
        name: p.name,
        first: p.first,
        f: p.f,
        age: p.age,
        prof: p.prof,
        skills: p.skills,
        traits: p.traits,
        needs: { food: 50, warm: 50, rest: 60, health: 90, safe: 50, mood: 50 },
        job: null,
        asleep: false,
        inside: true,
      });
    this.people = this.people.filter((p) => !fx.leave.includes(p.id) && !fx.wyrzuc?.includes(p.id));
    this.residents = Math.max(0, this.residents + fx.residents);
    if (fx.patch) this.fence.holes = [...this.fence.holes].sort((a, b) => b.size - a.size).slice(fx.patch);
    if (fx.guards.length) this.guards = fx.guards.map((g) => g.id);
    if (fx.fire) this.burned++;
    // książki na półkę; trzecia z dziedziny idzie na podpałkę (+1 drewna, jak przy bramie w applyGov)
    for (const d of fx.books ?? []) {
      const ma = this.books[d] ?? 0;
      if (ma >= KSIAZEK_NA_DZIEDZINE) this.woodLoose += 1;
      else this.books[d] = ma + 1;
    }
  }

  clone(): Atrapa {
    const c = Object.create(Atrapa.prototype) as Atrapa;
    Object.assign(c, structuredClone({ ...this }));
    return c;
  }
}

// ---------------------------------------------------------------- przebieg z polityką gracza

export type PolicyName = 'zawsze-warta' | 'nigdy-warty' | 'losowo' | 'propozycja';

export interface Step {
  /** sekundy przy ekranie, dzień i godzina gry */
  s: number;
  day: number;
  clock: string;
  kind: Prompt['k'];
  text: string;
}

/** odpowiedź gracza na to, co czeka; zwraca opis decyzji */
export function answer(gov: GovState, atr: Atrapa, p: Prompt, policy: PolicyName, r: Rng): string {
  const i = atr.input();
  if (p.k === 'raport') {
    ackReport(gov);
    return p.report.lines.map((l) => l.pl).join(' ');
  }
  if (p.k === 'uchwala') {
    const ok = p.options.filter((o) => o.s === 'ok');
    let id: string | null = ok[0]?.id ?? null;
    if (policy === 'zawsze-warta') id = ok.find((o) => o.id === 'u_warty')?.id ?? id;
    if (policy === 'nigdy-warty') id = ok.find((o) => o.id === 'u_meble' || o.id === 'u_kociol')?.id ?? id;
    if (policy === 'losowo') id = r() < 0.2 ? null : (ok[Math.floor(r() * ok.length)]?.id ?? null);
    atr.apply(signLaw(gov, i, id));
    return id ? `uchwała ${id}` : 'bez uchwały';
  }
  if (p.k === 'karta') {
    const card = p.card;
    for (const cp of card.people) {
      const cur = p.assign[cp.id] ?? 'sen';
      let key = cur;
      if (policy === 'nigdy-warty' && cur.startsWith('warta:')) key = 'sen';
      if (policy === 'losowo') {
        const ok = cp.options.filter((o) => o.ok);
        key = ok[Math.floor(r() * ok.length)].key;
      }
      if (key !== cur) setNight(gov, cp.id, key);
    }
    if (policy === 'zawsze-warta') {
      const assign = gov.night!.assign;
      const watch = Object.values(assign).filter((k) => k.startsWith('warta:')).length;
      if (!watch) {
        const best = [...card.people].sort((a, b) => b.needs.rest - a.needs.rest)[0];
        setNight(gov, best.id, `warta:${card.posts[0].key}`);
      }
    }
    const after = { ...gov.night!.assign };
    atr.apply(confirmNight(gov, i));
    return Object.entries(after)
      .map(([id, k]) => `${card.people.find((c) => c.id === id)?.name.split(' ')[0]}: ${k}`)
      .join(', ');
  }
  if (p.k === 'zwyciestwo') {
    grajDalej(gov);
    return `graj dalej (${p.droga})`;
  }
  const ok = p.choices.map((c, k) => [c, k] as const).filter(([c]) => c.ok);
  const pickK = policy === 'losowo' ? ok[Math.floor(r() * ok.length)][1] : ok[0][1];
  atr.apply(chooseEvent(gov, i, pickK));
  return `${p.title.pl}: ${p.choices[pickK].label.pl}`;
}

/** przebieg do minuty gry `until` (od północy pierwszego dnia); zarząd co sekundę przy ekranie */
export function run(
  seed: number,
  policy: PolicyName,
  until: number,
  start?: { gov: GovState; atr: Atrapa },
): { gov: GovState; atr: Atrapa; steps: Step[] } {
  const gov = start?.gov ?? newGov(seed);
  const atr = start?.atr ?? new Atrapa(seed);
  const r = mulberry(seed ^ 0x51ed);
  const steps: Step[] = [];
  while ((atr.day - 1) * 1440 + atr.hour * 60 + atr.minute < until) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(lawEffects(gov).foodMult);
    if (atr.tick % TPS !== 0) continue;
    atr.apply(govUpdate(gov, atr.input()));
    for (let k = 0; k < 5; k++) {
      const p = pending(gov, atr.input());
      if (!p) break;
      const i = atr.input();
      const text = answer(gov, atr, p, policy, r);
      steps.push({
        s: i.screen,
        day: i.day,
        clock: `${String(i.hour).padStart(2, '0')}:${String(i.minute).padStart(2, '0')}`,
        kind: p.k,
        text,
      });
    }
  }
  return { gov, atr, steps };
}

/** minuta gry dla dnia i godziny */
export const at = (day: number, hour: number, minute = 0): number => (day - 1) * 1440 + hour * 60 + minute;
