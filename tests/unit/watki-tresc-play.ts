/* Przebieg łańcuchów historii (src/gov/watki-tresc.ts) na atrapie symulacji (gov-atrapa.ts) przez każdą gałąź wyborów.
   Wokół atrapy stoi mały udawany świat: mieszkańcy z generatora (`GovInput.lokatorzy`), wizyty gości (`GovInput.goscie`:
   plan z `fx.gosc` staje się wizytą w drodze, potem pod bramą, rozkazy `fx.goscRozkaz` kończą ją albo wpuszczają ludzi do
   osiedla), pies, handlarz, okolica z apteką i raporty nocy. To nie jest symulacja: zastępuje ją tylko tyle, ile potrzeba,
   żeby kroki łańcucha dostały od zarządu to, czego żądają (i żeby sprawdzić, że ich skutki ruszają to, co obiecują).
   Używają tego tests/unit/watki-tresc.test.ts i tests/unit/zarzad-jezyk.test.ts (angielskie teksty kroków, dom i blok).
   Przebieg: `przejdz` zaczyna od zarządu z jednym łańcuchem (wątek sezonu ustawiony ręcznie, zwykła pula zamrożona), traktuje
   czas jak „wymuszone haki” (po każdej decyzji czas idzie do przodu aż do następnej karty łańcucha) i dla każdej otwartej
   karty rozgałęzia się na wszystkie dostępne wybory (kopia stanu przez zapis zarządu), aż karty się skończą. */

import { makePerson, type Person } from '../../src/content/people.ts';
import { isTx, type Tx } from '../../src/core/jezyk.ts';
import { mulberry } from '../../src/core/rng.ts';
import type {
  FazaGoscia,
  GameMode,
  GovEffects,
  GovGosc,
  GovInput,
  GovLokator,
  GovPerson,
  GovPlace,
  GovState,
  NightReport,
  ZwierzetaStan,
} from '../../src/gov/typy.ts';
import { type Lancuch, lancuchy } from '../../src/gov/watki.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { eventTick, eventView, M1_EVENTS } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, loadGov, newGov, saveGov } from '../../src/gov/zarzad.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { Atrapa, at, TPH } from './gov-atrapa.ts';

export const BLOK: GovPlace = {
  kind: 'blok',
  blocks: 4,
  houses: 0,
  near: 'bloki',
  shop: 120,
  garages: 80,
  clinic: 200,
  tower: null,
};
export const DOM: GovPlace = {
  kind: 'dom',
  blocks: 0,
  houses: 6,
  near: 'domy',
  shop: 150,
  garages: null,
  clinic: null,
  tower: null,
};

/** apteka daleko od adresu (poza mapą lokalną), żeby wskazówka miała co wskazać; nazwa z polskimi znakami */
export const APTEKA: Miejsce = { klucz: 'poi:400:0', kat: 'apteka', x: 400, y: 0, odl: 400, nazwa: 'Pod Różą' };
/** miejsca na wskazówki z kategorii listu i radia */
export const SKLEP: Miejsce = { klucz: 'poi:0:350', kat: 'spozywczy', x: 0, y: 350, odl: 350, nazwa: 'Zielony Kącik' };
export const SKRYTKA: Miejsce = { klucz: 'poi:-380:0', kat: 'garaz', x: -380, y: 0, odl: 380, nazwa: '' };
export const OKOLICA: Miejsce[] = [APTEKA, SKLEP, SKRYTKA];

export interface Swiat {
  gov: GovState;
  atr: Atrapa;
  place: GovPlace;
  lok: GovLokator[];
  wizyty: GovGosc[];
  /** osoby planów wizyt po id wizyty (ludzie, którzy wchodzą do osiedla po `zostan`) */
  osobyWizyt: Record<string, Person[]>;
  /** liczniki numerów pionków i identyfikatorów mieszkańców, którzy dochodzą w trakcie */
  numer: number;
  psy?: ZwierzetaStan;
  handlarz?: GovInput['handlarz'];
  okolica?: Miejsce[];
  /** ugryziony pionek gościa zabity rozkazem `dobij`: wizyta po id */
  dobici: string[];
  /** rozkazy, które zarząd wydał gościom (id wizyty → lista), do sprawdzania skutków */
  rozkazy: Record<string, string[]>;
  /** dziennik skutków wybranych w tej ścieżce */
  skutki: GovEffects[];
  /** na dworze zimno (2°C) */
  zimno?: boolean;
  /** gra bez obcych: `GovInput.goscie` brak */
  bezObcych?: boolean;
}

const naLokatora = (p: Person, pawn: number, id: string): GovLokator => ({
  pawn,
  id,
  name: p.name,
  first: p.first,
  f: p.f,
  age: p.age,
  prof: p.prof,
  skills: { ...p.skills },
  traits: [...p.traits],
  needs: { food: 60, warm: 50, rest: 60, health: 70, safe: 50, mood: 50 },
  asleep: false,
  inside: true,
  tile: 100 + pawn,
});

const naOsobeZarzadu = (p: Person, pawn: number, id: string): GovPerson => ({
  pawn,
  id,
  name: p.name,
  first: p.first,
  f: p.f,
  age: p.age,
  prof: p.prof,
  skills: { ...p.skills },
  traits: [...p.traits],
  needs: { food: 60, warm: 50, rest: 60, health: 90, safe: 50, mood: 50 },
  job: null,
  asleep: false,
  inside: true,
});

/** czterech mieszkańców siedziby: elektryk, hydraulik, stara mieszkanka (pluca) i dziecko */
function mieszkancy(seed: number): GovLokator[] {
  const r = mulberry(seed ^ 0x1f2e);
  const uzyte = new Set<string>();
  let id = 300;
  const mk = (o: { f: boolean; prof: string; age: number }, pawn: number): GovLokator => {
    const p = makePerson(r, uzyte, () => id++, { f: o.f });
    uzyte.add(p.first);
    const wzor = [
      ['Elektryk', { elek: 3, bud: 1 }],
      ['Hydraulik', { cieplo: 3 }],
      ['Emerytowana inżynierka', { bud: 3, cieplo: 2 }],
      ['dziecko', {}],
    ].find((x) => x[0] === o.prof) as [string, Person['skills']];
    p.skills = { ...wzor[1] };
    p.prof = o.prof === 'Elektryk' && o.f ? 'Elektryczka' : o.prof;
    p.age = o.age;
    return naLokatora(p, pawn, p.id);
  };
  return [
    mk({ f: false, prof: 'Elektryk', age: 41 }, 10),
    mk({ f: false, prof: 'Hydraulik', age: 52 }, 11),
    mk({ f: true, prof: 'Emerytowana inżynierka', age: 72 }, 12),
    mk({ f: false, prof: 'dziecko', age: 10 }, 13),
  ];
}

export interface OpcjeSwiata {
  mode?: GameMode;
  place?: GovPlace;
  seed?: number;
  /** wynik napadu w raportach nocy (łańcuch „Ostrzega”) */
  napad?: NightReport['raid'];
  /** na dworze zimno (łańcuch „Aktywistka”) */
  zimno?: boolean;
  /** pies już jest */
  pies?: 'flaga' | 'wpis';
  /** handlarz stoi pod bramą */
  handlarz?: boolean;
  /** bez mieszkańców z generatora */
  bezMieszkancow?: boolean;
  /** bez obcych w grze (`GovInput.goscie` brak) */
  bezObcych?: boolean;
  /** bez mapy miasta (cele z TARGETS) */
  bezOkolicy?: boolean;
}

/** zarząd z jednym łańcuchem: wątek sezonu ustawiony ręcznie, zwykła pula zamrożona, trzeci dzień, 9:00 */
export function nowySwiat(id: string, o: OpcjeSwiata = {}): Swiat {
  const seed = o.seed ?? 3;
  const mode = o.mode ?? 'zwykly';
  const gov = newGov(seed, mode);
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.meds = 6;
  atr.woodSklad = 10;
  atr.scrap = 8;
  atr.parts = 4;
  atr.tick = Math.round(((at(3, 9) - 15 * 60) * TPH) / 60);
  // osoba z dzidą, żeby „Dobić przez siatkę” było dostępne
  atr.people[0] = { ...atr.people[0], arm: 'dzida' };
  gov.ev.next = 0;
  gov.ev.warm = 0;
  gov.ev.done.dym = true;
  for (const e of M1_EVENTS) gov.ev.last[e.id] = 1e12;
  gov.watki = { wybrane: [id], haki: {}, krok: {} };
  if (o.pies === 'flaga') gov.flags.dog = true;
  if (o.napad !== undefined)
    gov.reports = [2, 3, 4, 5, 6, 7, 8].map((day) => ({ day, raid: o.napad, lines: [] }) as unknown as NightReport);
  const s: Swiat = {
    gov,
    atr,
    place: o.place ?? BLOK,
    lok: o.bezMieszkancow ? [] : mieszkancy(seed),
    wizyty: [],
    osobyWizyt: {},
    numer: 200,
    dobici: [],
    rozkazy: {},
    skutki: [],
    ...(o.pies === 'wpis' ? { psy: { pies: 'zginal' as const } } : {}),
    ...(o.handlarz ? { handlarz: { tile: 4321, gdzie: { x: 21, y: 43 } } } : {}),
    ...(o.bezOkolicy ? {} : { okolica: OKOLICA }),
  };
  if (!o.bezOkolicy) {
    gov.miasto = { zabrano: {}, wizyty: {}, ostatnia: {} };
  }
  if (o.zimno) s.zimno = true;
  if (o.bezObcych) s.bezObcych = true;
  return s;
}

/** wejście zarządu z udawanego świata */
export function wejscie(s: Swiat): GovInput {
  return {
    ...s.atr.input(),
    kozaLit: true,
    place: s.place,
    ...(s.zimno ? { outdoor: 2 } : {}),
    lokatorzy: s.lok.map((l) => ({ ...l, skills: { ...l.skills }, traits: [...l.traits], needs: { ...l.needs } })),
    ...(s.bezObcych ? {} : { goscie: s.wizyty }),
    napady: [],
    ...(s.psy ? { zwierzeta: s.psy } : {}),
    ...(s.handlarz ? { handlarz: s.handlarz } : {}),
    ...(s.okolica ? { okolica: s.okolica } : {}),
  };
}

/** kopia świata: zarząd przez zapis, reszta strukturalnie */
export function kopia(s: Swiat): Swiat {
  const { gov, atr, ...reszta } = s;
  return { ...structuredClone(reszta), gov: loadGov(saveGov(gov)), atr: atr.clone() };
}

/** skutki zarządu stosowane w udawanym świecie: zapasy i potrzeby przez atrapę, a ludzie, wizyty i zwierzęta tutaj */
function zastosuj(s: Swiat, fx: GovEffects): void {
  s.atr.apply(fx);
  s.skutki.push(fx);
  if (fx.gosc) {
    const n = fx.gosc.osoby.length;
    const pawns = fx.gosc.osoby.map((_, k) => 1000 + s.numer + k);
    s.numer += n;
    s.wizyty.push({
      id: fx.gosc.id,
      faza: 'idzie',
      tile: 1234,
      gdzie: { x: 34, y: 12 },
      pawns,
      zywi: fx.gosc.osoby.map((_, k) => k),
      ukradl: 0,
    });
    s.osobyWizyt[fx.gosc.id] = fx.gosc.osoby.map((p) => structuredClone(p));
  }
  for (const r of fx.goscRozkaz ?? []) {
    (s.rozkazy[r.id] ??= []).push(r.co);
    const w = s.wizyty.find((x) => x.id === r.id);
    if (!w) continue;
    const ustaw = (faza: FazaGoscia) => {
      w.faza = faza;
    };
    switch (r.co) {
      case 'odejdz':
      case 'jedzenie':
      case 'puscic':
        ustaw('poszedl');
        break;
      case 'noc':
        ustaw('w_srodku');
        break;
      case 'zostan':
      case 'zarzad': {
        const osoby = (s.osobyWizyt[r.id] ?? []).filter((_, k) => w.zywi.includes(k));
        osoby.forEach((p, k) => {
          const id = `s${s.numer++}`;
          if (r.co === 'zarzad' && k === 0) s.atr.people.push(naOsobeZarzadu(p, 50 + s.numer, id));
          else s.lok.push(naLokatora(p, 50 + s.numer, id));
        });
        w.przyjety = true;
        ustaw('w_srodku');
        break;
      }
      case 'dobij': {
        const nr = s.gov.goscie?.aktywny?.gosc.ugryziony ?? -1;
        if (nr >= 0) {
          w.pawns = w.pawns.filter((_, j) => w.zywi[j] !== nr);
          w.zywi = w.zywi.filter((k) => k !== nr);
          s.dobici.push(r.id);
        }
        break;
      }
      default:
        break;
    }
  }
  for (const id of fx.awans ?? []) {
    const l = s.lok.find((x) => x.id === id);
    if (!l) continue;
    s.lok = s.lok.filter((x) => x.id !== id);
    s.atr.people.push({
      pawn: l.pawn,
      id: l.id,
      name: l.name,
      first: l.first,
      f: l.f,
      age: l.age,
      prof: l.prof,
      skills: { ...l.skills },
      traits: [...l.traits],
      needs: { ...l.needs },
      job: null,
      asleep: false,
      inside: true,
    });
  }
  for (const id of fx.wyrzuc ?? []) s.lok = s.lok.filter((x) => x.id !== id);
  if (fx.zwierze?.includes('pies')) s.psy = { ...s.psy, pies: 'zyje' };
}

/** Czas do przodu co pół godziny gry, aż otworzy się karta (kroki łańcucha dojrzewają, goście dochodzą do bramy, rano
    wpuszczeni wychodzą); true: karta czeka, false: w ciągu `godzin` godzin gry żadna się nie otworzyła. */
export function dalej(s: Swiat, godzin = 90): boolean {
  for (let n = 0; n < godzin * 2; n++) {
    s.atr.tick += TPH / 2;
    s.gov.ev.next = 0;
    for (const w of s.wizyty) {
      if (w.faza === 'idzie') w.faza = 'brama';
      else if (w.faza === 'w_srodku' && !w.przyjety && s.atr.hour >= 7 && s.atr.hour < 20) w.faza = 'poszedl';
    }
    const fx = emptyEffects();
    eventTick(s.gov, wejscie(s), fx, false);
    zastosuj(s, fx);
    if (s.gov.ev.active) return true;
  }
  return false;
}

export interface Karta {
  id: string;
  /** polskie napisy wyborów na tej ścieżce */
  wybory: string[];
}

export interface Wynik {
  /** numer najdalszego kroku, jaki otworzył się na którejkolwiek ścieżce */
  najdalej: number;
  /** karty (id kroku → indeksy wyborów, które wybrano na jakiejś ścieżce) */
  wybrane: Map<string, Set<number>>;
  /** wszystkie teksty kart (tytuł, tekst, napisy wyborów) z oznaczeniem kroku */
  teksty: { krok: string; tx: Tx }[];
  /** świat po ostatnim wyborze każdej ścieżki */
  konce: Swiat[];
  /** ścieżki jako id kroku:indeks wyboru */
  sciezki: string[][];
}

/** Wszystkie gałęzie wyborów łańcucha `l` w świecie `start`; rzuca wyjątek, gdy jakikolwiek krok, tekst albo wybór go rzuci. */
export function przejdz(l: Lancuch, start: Swiat): Wynik {
  const w: Wynik = { najdalej: 0, wybrane: new Map(), teksty: [], konce: [], sciezki: [] };
  const rozgalez = (s: Swiat, sciezka: string[]): void => {
    const ev = s.gov.ev.active!;
    const krok = l.kroki.find((k) => k.id === ev.id);
    if (!krok) throw new Error(`otwarta karta ${ev.id} nie jest krokiem łańcucha ${l.id}`);
    w.najdalej = Math.max(w.najdalej, krok.nr);
    const v = eventView(s.gov, wejscie(s));
    if (!v) throw new Error(`brak okna karty ${ev.id}`);
    for (const t of [v.title, v.text, ...v.choices.map((c) => c.label)]) w.teksty.push({ krok: ev.id, tx: t });
    const ok = v.choices.map((c, k) => [c, k] as const).filter(([c]) => c.ok);
    if (!ok.length) throw new Error(`karta ${ev.id}: żaden wybór nie jest dostępny`);
    for (const [, k] of ok) {
      const kopiaSwiata = kopia(s);
      const fx = chooseEvent(kopiaSwiata.gov, wejscie(kopiaSwiata), k);
      zastosuj(kopiaSwiata, fx);
      (w.wybrane.get(ev.id) ?? w.wybrane.set(ev.id, new Set()).get(ev.id)!).add(k);
      const droga = [...sciezka, `${ev.id}:${k}`];
      if (dalej(kopiaSwiata)) rozgalez(kopiaSwiata, droga);
      else {
        w.konce.push(kopiaSwiata);
        w.sciezki.push(droga);
      }
    }
  };
  if (!dalej(start)) return w;
  rozgalez(start, []);
  return w;
}

export interface Scen {
  nazwa: string;
  o: OpcjeSwiata;
}

/** scenariusze przejścia: tryb i miejsce według łańcucha, plus to, czego krok wymaga od świata */
export const SCEN: Record<string, Scen[]> = {
  swiatlo: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  szczekanie: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  puszki: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  woda: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  list: [
    { nazwa: 'blok, zwykły, z mapą miasta', o: {} },
    { nazwa: 'dom, zombie, bez mapy miasta', o: { place: DOM, mode: 'zombie', bezOkolicy: true } },
  ],
  pluca: [
    { nazwa: 'blok, zwykły', o: {} },
    { nazwa: 'dom, zombie', o: { place: DOM, mode: 'zombie' } },
  ],
  ostrzega: [
    { nazwa: 'napad odparty', o: { napad: 'odparty' } },
    { nazwa: 'napad z wtargnięciem, dom', o: { napad: 'wtargnięcie', place: DOM } },
    { nazwa: 'bez napadu', o: { napad: 'brak' } },
  ],
  dlug: [
    { nazwa: 'blok', o: { handlarz: true } },
    { nazwa: 'dom', o: { handlarz: true, place: DOM } },
  ],
  aktywistka: [
    { nazwa: 'blok, zimno', o: { zimno: true } },
    { nazwa: 'dom, zimno', o: { zimno: true, place: DOM } },
  ],
  dach: [
    { nazwa: 'blok', o: { mode: 'zombie' } },
    { nazwa: 'dom', o: { mode: 'zombie', place: DOM } },
  ],
  dobicie: [
    { nazwa: 'blok', o: { mode: 'zombie' } },
    { nazwa: 'dom', o: { mode: 'zombie', place: DOM } },
  ],
  glos: [
    { nazwa: 'blok, z mapą miasta', o: { mode: 'zombie' } },
    { nazwa: 'dom, bez mapy miasta', o: { mode: 'zombie', place: DOM, bezOkolicy: true } },
  ],
};

/** Łańcuch z produkcyjnej listy po id (rzuca, gdy go nie ma) */
export function lancuch(id: string): Lancuch {
  const l = lancuchy().find((x) => x.id === id);
  if (!l) throw new Error(`brak łańcucha ${id}`);
  return l;
}

/** czy napis jest Tx z oboma językami niepustymi */
export const obaJezyki = (t: unknown): boolean => isTx(t) && t.pl.length > 0 && t.en.length > 0;
