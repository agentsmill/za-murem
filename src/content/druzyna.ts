/* Własna drużyna zarządu (docs/superpowers/specs/2026-10-18-druzyna-design.md): zasady jednej osoby, zamknięta lista
   umiejętności z zawodu, losowanie cech, osoby i całej drużyny. Jeden moduł dla panelu „Wasz zarząd” na karcie
   startowej (src/ui/druzyna.ts) i dla symulacji, która sprawdza dane drużyny jeszcze raz w createSim, bo pamięć
   przeglądarki można zmienić ręcznie. Czyste funkcje bez DOM; losowanie tylko przez Rng z src/core/rng.ts, więc
   testy powtarzają je z ziarnem. Tabela UMIEJETNOSCI_ZAWODU i pule cech do przeczytania przez Mateusza.

   Osoba: imię i nazwisko (do 40 znaków, imię to pierwsze słowo), płeć, wiek w widełkach zawodu z PROFS, zawód z PROFS,
   umiejętności tylko z listy zawodu, poziom 0 do maksimum dziedziny, razem najwyżej BUDZET punktów, jedna albo dwie
   cechy z losowania (nigdy dwie dobre, nigdy para z TRAIT_PAIRS), historia do 400 znaków. Cechy nie dają ani nie
   zabierają punktów.

   Angielska wersja (docs/superpowers/specs/2026-10-18-angielski-design.md) zmienia tylko to, co widać: nazwy cech
   i zawodów po angielsku (*En obok polskich) i historia z tego samego ziarna po angielsku (historiaZEn). Dane osoby
   zostają te same w obu językach: zawód to męska nazwa z PROFS, cechy to klucze z TRAITS. */

import { mulberry, pick, type Rng, ri } from '../core/rng.ts';
import { PROFS_EN, TRAITS_EN } from './data.en.ts';
import { type Dom, NAMES, PROFS, type Prof, SURN, TRAIT_PAIRS, TRAITS } from './data.ts';
import { losujHistorieEn } from './historia.en.ts';
import { HISTORIA_MAX, losujHistorie } from './historia.ts';
import type { Person } from './people.ts';

export { HISTORIA_MAX };

/** punkty umiejętności na osobę; skala 0–4 jak w PROFS (najlepszy zawód z 0.3, inżynier, ma 5) */
export const BUDZET = 6;
export const OSOB_MIN = 1;
export const OSOB_MAX = 5;
/** tyle osób ma zarząd bez ruszania panelu (jak dziś) */
export const OSOB_DOMYSLNIE = 4;
export const IMIE_MAX = 40;

/** Osoba z drużyny: tak idzie do createSim (opcja team) i do pamięci przeglądarki. */
export interface OsobaDruzyny {
  /** imię i nazwisko; imię to pierwsze słowo */
  name: string;
  /** kobieta */
  f: boolean;
  age: number;
  /** zawód: męska nazwa z PROFS (np. „Hydraulik”); w grze w formie zgodnej z płcią */
  prof: string;
  /** poziomy umiejętności; dziedziny spoza listy zawodu są błędem */
  skills: Partial<Record<Dom, number>>;
  /** klucze z TRAITS */
  traits: string[];
  story: string;
  /** ziarno wylosowanej historii: panel składa ją od nowa po zmianie płci, wieku, zawodu albo cech, dopóki gracz
      jej nie zmieni ręcznie; symulacja to pole pomija */
  ziarno?: number;
}

/* Zamknięta lista umiejętności zawodu: dziedziny i najwyższy poziom w każdej (2 albo 3 dziedziny, pierwsza to
   główna). Zasady: dziedziny i poziomy z PROFS zawsze są na liście, a maksimum jest co najmniej tak wysokie jak
   poziom z PROFS; do tego jedna albo dwie dziedziny pokrewne z niższym maksimum; poziom 4 tylko w głównej dziedzinie.
   Zawody-żarty (doradca ds. ESG, prompt engineer, kurier, kucharz) są słabe przez niskie maksima, a nie przez mniejszy
   budżet: nie wydadzą wszystkich 6 punktów. Każdy inny zawód wyda całe 6 i musi wybierać, bo suma maksimów jest
   większa albo równa budżetowi. W komentarzu suma maksimów i to, skąd wzięła się dziedzina pokrewna. */
export const UMIEJETNOSCI_ZAWODU: Readonly<Record<string, Readonly<Partial<Record<Dom, number>>>>> = {
  // 8: liczy konstrukcje i kotłownie, zna się trochę na prądzie
  'Emerytowany inżynier': { bud: 4, cieplo: 3, elek: 1 },
  // 7: rury i kozy to dziś to samo; kuje ściany i czasem dotknie kabla przy piecu
  Hydraulik: { cieplo: 4, bud: 2, elek: 1 },
  // 7: kable, kucie bruzd, sterowniki
  Elektryk: { elek: 4, bud: 2, it: 1 },
  // 6: zioła i posiew zamiast apteki
  'Lekarz rodzinny': { med: 4, uprawa: 2 },
  // 6: zioła z ogródka, pilnuje, żeby chorym nie było zimno
  Pielęgniarz: { med: 3, uprawa: 2, cieplo: 1 },
  // 6: biega z noszami, wyciąga ludzi spod gruzu
  'Ratownik medyczny': { med: 3, obrona: 2, bud: 1 },
  // 6: grządki i szklarnie z ram okiennych, zioła
  Ogrodnik: { uprawa: 4, bud: 1, med: 1 },
  // 6: altana, szklarnia, koza w altanie
  Działkowiec: { uprawa: 3, bud: 2, cieplo: 1 },
  // 6: prądnica, rachunki, warsztat szkolny
  'Nauczyciel fizyki': { elek: 3, it: 2, bud: 1 },
  // 6: kod na papierze i sterowniki
  Programista: { it: 4, elek: 2 },
  // 3, żart: przemawia do sprzętu
  'Prompt engineer': { it: 2, elek: 1 },
  // 6: rowery, wózki, agregaty i chłodnice
  'Mechanik samochodowy': { bud: 3, elek: 2, cieplo: 1 },
  // 3, żart: gotuje na ogniu
  Kucharz: { uprawa: 2, cieplo: 1 },
  // 6: skład złomu w galerii, apteczka przy bramkach
  'Ochroniarz z galerii': { obrona: 4, bud: 1, med: 1 },
  // 3, żart: ucieka szybko i naprawi rower
  Kurier: { obrona: 2, bud: 1 },
  // 2, żart: arkusze i rejestr opału
  'Doradca ds. ESG': { it: 1, cieplo: 1 },
  // 6: nóż, zbieractwo, pierwsza pomoc z odcinków
  'Influencer survivalowy': { obrona: 3, uprawa: 2, med: 1 },
  // 6: posiewy u lekarki, stary mikroskop z elektroniką
  'Student biotechnologii': { uprawa: 3, med: 2, it: 1 },
  // 6: kozy i kominy, wentylatory, przebicia przez ściany
  'Monter klimatyzacji': { cieplo: 3, elek: 2, bud: 1 },
  // 6: komputery, zasilacze, nosił serwery po schodach
  'Informatyk z urzędu': { it: 3, elek: 2, bud: 1 },
  // 6: mury, piece i kominy
  Murarz: { bud: 4, cieplo: 2 },
  // 6: leczy kozy i kury, które sam hoduje, i nie boi się psów
  Weterynarz: { med: 3, uprawa: 2, obrona: 1 },
};

/** zawody, które nie wydadzą całego budżetu (satyra zostaje) */
export const ZAWODY_ZARTY: readonly string[] = ['Doradca ds. ESG', 'Prompt engineer', 'Kurier', 'Kucharz'];

/* Pule cech z TRAITS (0.3). Dobre i złe wykluczają się parami z TRAIT_PAIRS, obojętna może wypaść obok każdej. */
export const CECHY_DOBRE: readonly string[] = ['pracowity', 'lubiany', 'odwazny', 'optymista', 'excel', 'twardy'];
export const CECHY_ZLE: readonly string[] = ['leniwy', 'klotliwy', 'tchorz', 'hipochondryk'];
export const CECHY_OBOJETNE: readonly string[] = ['gadula'];

/** żeńskie nazwy cech (TRAITS ma męskie) */
const CECHY_K: Readonly<Record<string, string>> = {
  pracowity: 'Pracowita',
  leniwy: 'Leniwa',
  lubiany: 'Lubiana',
  klotliwy: 'Kłótliwa',
  odwazny: 'Odważna',
  tchorz: 'Tchórzliwa',
  optymista: 'Optymistka',
  hipochondryk: 'Hipochondryczka',
  gadula: 'Gaduła',
  excel: 'Mistrzyni Excela',
  twardy: 'Twarda',
};

/** nazwa cechy w formie zgodnej z płcią */
export const nazwaCechy = (t: string, f: boolean): string => (f ? CECHY_K[t] : undefined) ?? TRAITS[t]?.name ?? t;

/** nazwa cechy po angielsku (jedna forma dla obu płci); nieznana cecha zostaje kluczem jak w nazwaCechy */
export const nazwaCechyEn = (t: string): string => TRAITS_EN[t]?.name ?? TRAITS[t]?.name ?? t;

/** opis cechy po angielsku (podpowiedź przy cesze) */
export const opisCechyEn = (t: string): string => TRAITS_EN[t]?.desc ?? TRAITS[t]?.desc ?? '';

/** dziedziny, które zarząd z adresu ma po kolei (createSim): od 4 osób w górę drużyna je pokrywa */
export const POTRZEBNE: readonly Dom[] = ['cieplo', 'bud', 'med', 'uprawa'];

/** zawód z PROFS po męskiej nazwie */
export const zawod = (prof: string): Prof | undefined => PROFS.find((p) => p[0] === prof);

/** nazwa zawodu w formie zgodnej z płcią */
export const nazwaZawodu = (prof: string, f: boolean): string => {
  const p = zawod(prof);
  return p ? p[f ? 1 : 0] : prof;
};

/** nazwa zawodu po angielsku (jedna forma dla obu płci); zawód spoza PROFS zostaje bez zmian */
export const nazwaZawoduEn = (prof: string): string => PROFS_EN[prof] ?? prof;

/** widełki wieku zawodu */
export const wiekZawodu = (prof: string): [number, number] => {
  const p = zawod(prof);
  return p ? [p[3][0], p[3][1]] : [18, 80];
};

/** wiek przycięty do widełek zawodu (liczba całkowita) */
export function przytnijWiek(age: number, prof: string): number {
  const [a, b] = wiekZawodu(prof);
  const n = Number.isFinite(age) ? Math.round(age) : a;
  return Math.max(a, Math.min(b, n));
}

/** dziedziny z listy zawodu, główna pierwsza */
export const dziedziny = (prof: string): Dom[] => Object.keys(UMIEJETNOSCI_ZAWODU[prof] ?? {}) as Dom[];

/** najwyższy poziom dziedziny w zawodzie (0: dziedziny nie ma na liście) */
export const maksimum = (prof: string, d: Dom): number => UMIEJETNOSCI_ZAWODU[prof]?.[d] ?? 0;

/** suma punktów */
export const punkty = (s: Partial<Record<Dom, number>>): number =>
  Object.values(s).reduce((a: number, v) => a + (v ?? 0), 0);

/** ile punktów zostało do wydania */
export const zostalo = (s: Partial<Record<Dom, number>>): number => BUDZET - punkty(s);

/** poziomy z PROFS dla zawodu (start po zmianie zawodu) */
export const umiejetnosciStartowe = (prof: string): Partial<Record<Dom, number>> => ({ ...(zawod(prof)?.[2] ?? {}) });

/** czy można dodać punkt w dziedzinie: jest na liście, poniżej maksimum i w budżecie */
export const moznaDodac = (o: Pick<OsobaDruzyny, 'prof' | 'skills'>, d: Dom): boolean =>
  (o.skills[d] ?? 0) < maksimum(o.prof, d) && zostalo(o.skills) > 0;

export const moznaOdjac = (o: Pick<OsobaDruzyny, 'skills'>, d: Dom): boolean => (o.skills[d] ?? 0) > 0;

/** +1 w dziedzinie, jeśli wolno; zwraca, czy się zmieniło */
export function dodajPunkt(o: OsobaDruzyny, d: Dom): boolean {
  if (!moznaDodac(o, d)) return false;
  o.skills[d] = (o.skills[d] ?? 0) + 1;
  return true;
}

/** −1 w dziedzinie, jeśli jest co odjąć; zero znika z umiejętności */
export function odejmijPunkt(o: OsobaDruzyny, d: Dom): boolean {
  if (!moznaOdjac(o, d)) return false;
  const v = (o.skills[d] ?? 0) - 1;
  if (v > 0) o.skills[d] = v;
  else delete o.skills[d];
  return true;
}

/** zmiana zawodu: umiejętności od nowa z PROFS, wiek przycięty do nowych widełek */
export function zmienZawod(o: OsobaDruzyny, prof: string): void {
  if (!zawod(prof)) return;
  o.prof = prof;
  o.skills = umiejetnosciStartowe(prof);
  o.age = przytnijWiek(o.age, prof);
}

/** litery (także z akcentami), spacja, łącznik, apostrof i kropka; bez znaków HTML */
const ZNAKI_IMIENIA = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/** imię i nazwisko po oczyszczeniu: bez spacji na końcach i podwójnych spacji */
export const oczyscImie = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** imię: pierwsze słowo */
export const pierwszeImie = (name: string): string => oczyscImie(name).split(' ')[0] ?? '';

/** czy imię i nazwisko jest dobre (po oczyszczeniu) */
export function dobreImie(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const n = oczyscImie(s);
  return n.length > 0 && n.length <= IMIE_MAX && ZNAKI_IMIENIA.test(n);
}

/** czy cecha pasuje do już wylosowanych: znana, bez powtórki, bez pary z TRAIT_PAIRS, najwyżej jedna dobra */
export function cechaPasuje(have: readonly string[], t: string): boolean {
  if (!(t in TRAITS) || have.includes(t)) return false;
  if (TRAIT_PAIRS.some(([a, b]) => (a === t && have.includes(b)) || (b === t && have.includes(a)))) return false;
  return !(CECHY_DOBRE.includes(t) && have.some((x) => CECHY_DOBRE.includes(x)));
}

/** Jedna cecha albo dwie (dwie z szansą 45%, jak w 0.3), nigdy dwie dobre, nigdy para z TRAIT_PAIRS. */
export function losujCechy(rnd: Rng): string[] {
  const all = Object.keys(TRAITS);
  const n = rnd() < 0.45 ? 2 : 1;
  const out: string[] = [];
  while (out.length < n) {
    const t = pick(all, rnd);
    if (cechaPasuje(out, t)) out.push(t);
  }
  return out;
}

/** Umiejętności zawodu: poziomy z PROFS, a resztę budżetu po punkcie do losowych dziedzin z listy, póki jest miejsce. */
export function rozdajPunkty(rnd: Rng, prof: string): Partial<Record<Dom, number>> {
  const s = umiejetnosciStartowe(prof);
  const lista = dziedziny(prof);
  let left = zostalo(s);
  while (left > 0) {
    const open = lista.filter((d) => (s[d] ?? 0) < maksimum(prof, d));
    if (!open.length) break;
    const d = pick(open, rnd);
    s[d] = (s[d] ?? 0) + 1;
    left--;
  }
  return s;
}

/** ziarno dla historii z generatora osoby */
const ziarnoZ = (rnd: Rng): number => Math.floor(rnd() * 4294967296) | 0;

/** historia z ziarna osoby (to samo ziarno i dane: ta sama historia) */
export const historiaZ = (ziarno: number, o: Pick<OsobaDruzyny, 'f' | 'age' | 'prof' | 'traits'>): string =>
  losujHistorie(mulberry(ziarno), o);

/** ta sama historia z ziarna po angielsku: te same losowania i te same zdania co historiaZ (src/content/historia.en.ts) */
export const historiaZEn = (ziarno: number, o: Pick<OsobaDruzyny, 'f' | 'age' | 'prof' | 'traits'>): string =>
  losujHistorieEn(mulberry(ziarno), o);

export interface LosujOsobeOpts {
  /** imiona już zajęte w drużynie */
  used?: ReadonlySet<string>;
  /** zawody już zajęte w drużynie (męskie nazwy): osoba dostaje inny, dopóki jest z czego wybierać */
  zawody?: ReadonlySet<string>;
  /** zawód musi mieć tę dziedzinę w PROFS (drużyna od 4 osób pokrywa ciepło, budowę, medycynę i uprawę) */
  need?: Dom;
}

/** Cała osoba: płeć, imię i nazwisko z list gry, zawód, wiek w widełkach, umiejętności, cechy i historia. */
export function losujOsobe(rnd: Rng, opts: LosujOsobeOpts = {}): OsobaDruzyny {
  const used = opts.used ?? new Set<string>();
  const f = rnd() < 0.5;
  const need = opts.need;
  const pool = need ? PROFS.filter((p) => (p[2][need] ?? 0) >= 1) : PROFS;
  const fresh = pool.filter((p) => !opts.zawody?.has(p[0]));
  const prof = pick(fresh.length ? fresh : pool, rnd);
  const names = NAMES[f ? 'f' : 'm'].filter((n) => !used.has(n));
  const first = pick(names.length ? names : NAMES[f ? 'f' : 'm'], rnd);
  const sur = pick(SURN, rnd)[f ? 1 : 0];
  const o: OsobaDruzyny = {
    name: `${first} ${sur}`,
    f,
    age: ri(prof[3][0], prof[3][1], rnd),
    prof: prof[0],
    skills: rozdajPunkty(rnd, prof[0]),
    traits: losujCechy(rnd),
    story: '',
    ziarno: ziarnoZ(rnd),
  };
  o.story = historiaZ(o.ziarno!, o);
  return o;
}

/** Cała drużyna n osób: imiona i zawody bez powtórzeń, pierwsze cztery osoby mają po kolei ciepło, budowę, medycynę
    i uprawę z zawodu (jak zarząd z adresu), więc drużyna od 4 osób w górę pokrywa te dziedziny. */
export function losujDruzyne(rnd: Rng, n: number): OsobaDruzyny[] {
  const out: OsobaDruzyny[] = [];
  const k = Math.max(OSOB_MIN, Math.min(OSOB_MAX, Math.round(n)));
  for (let i = 0; i < k; i++) out.push(losujOsobe(rnd, { ...zajete(out), need: POTRZEBNE[i] }));
  return out;
}

/** imiona i zawody zajęte przez osoby z listy (do losowania kolejnej osoby) */
export const zajete = (team: readonly OsobaDruzyny[]): Required<Pick<LosujOsobeOpts, 'used' | 'zawody'>> => ({
  used: new Set(team.map((o) => pierwszeImie(o.name))),
  zawody: new Set(team.map((o) => o.prof)),
});

const calkowita = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Sprawdza osobę z drużyny według zasad z nagłówka. Zwraca listę błędów (pusta: osoba w porządku). */
export function bledyOsoby(x: unknown): string[] {
  if (!x || typeof x !== 'object') return ['to nie jest osoba'];
  const o = x as Record<string, unknown>;
  const why: string[] = [];
  if (!dobreImie(o.name)) why.push('imię i nazwisko puste, za długie albo z niedozwolonymi znakami');
  if (typeof o.f !== 'boolean') why.push('brak płci');
  const prof = typeof o.prof === 'string' && zawod(o.prof) ? o.prof : null;
  if (!prof) why.push('zawodu nie ma na liście');
  if (!calkowita(o.age) || (prof && przytnijWiek(o.age, prof) !== o.age)) why.push('wiek poza widełkami zawodu');
  const s = o.skills;
  if (!s || typeof s !== 'object' || Array.isArray(s)) why.push('brak umiejętności');
  else if (prof) {
    let sum = 0;
    for (const [d, v] of Object.entries(s)) {
      if (!calkowita(v) || v < 0 || v > maksimum(prof, d as Dom)) why.push(`umiejętność ${d} poza listą zawodu`);
      else sum += v;
    }
    if (sum > BUDZET) why.push(`umiejętności ponad ${BUDZET} punktów`);
  }
  const t = o.traits;
  if (!Array.isArray(t) || t.length < 1 || t.length > 2) why.push('cech ma być jedna albo dwie');
  else if (!t.every((c, i) => typeof c === 'string' && cechaPasuje(t.slice(0, i) as string[], c)))
    why.push('cechy nieznane, powtórzone, wykluczające się albo dwie dobre');
  if (o.story !== undefined && (typeof o.story !== 'string' || o.story.length > HISTORIA_MAX))
    why.push(`historia dłuższa niż ${HISTORIA_MAX} znaków`);
  return why;
}

/** pola osoby w grze, które nadpisuje drużyna; reszta (id, dom, przydział) zostaje z losowania z adresu */
export type PolaGry = Pick<Person, 'first' | 'name' | 'f' | 'prof' | 'skills' | 'age' | 'traits' | 'story'>;

/** Pola osoby w grze (Person) z dobrej osoby z drużyny: imię, płeć, zawód w formie płci, umiejętności bez zer, wiek,
    cechy i historia (bez pustej). */
export function osobaDoGry(o: OsobaDruzyny): PolaGry {
  const name = oczyscImie(o.name);
  const skills: Partial<Record<Dom, number>> = {};
  for (const d of dziedziny(o.prof)) if ((o.skills[d] ?? 0) > 0) skills[d] = o.skills[d];
  const out: PolaGry = {
    first: pierwszeImie(name),
    name,
    f: o.f,
    prof: nazwaZawodu(o.prof, o.f),
    skills,
    age: o.age,
    traits: [...o.traits],
  };
  const story = (o.story ?? '').trim();
  if (story) out.story = story;
  return out;
}

/** Drużyna z opcji gry: tablica do OSOB_MAX osób (nadmiar odpada z ostrzeżeniem); null, gdy drużyny nie ma. */
export function druzynaDoGry(team: unknown): unknown[] | null {
  if (!Array.isArray(team) || !team.length) return null;
  if (team.length > OSOB_MAX) {
    console.warn(`Drużyna ma ${team.length} osób, gra bierze pierwsze ${OSOB_MAX}.`);
    return team.slice(0, OSOB_MAX);
  }
  return team;
}

/** Osoba z pamięci przeglądarki doprowadzona do zasad (dla panelu): co się da, poprawia, czego się nie da, losuje. */
export function naprawOsobe(x: unknown, rnd: Rng, used: ReadonlySet<string> = new Set()): OsobaDruzyny {
  if (!bledyOsoby(x).length) {
    const o = x as OsobaDruzyny;
    return {
      name: oczyscImie(o.name),
      f: o.f,
      age: o.age,
      prof: o.prof,
      skills: { ...o.skills },
      traits: [...o.traits],
      story: o.story ?? '',
      ...(calkowita(o.ziarno) ? { ziarno: o.ziarno } : {}),
    };
  }
  const r = losujOsobe(rnd, { used });
  if (!x || typeof x !== 'object') return r;
  const o = x as Record<string, unknown>;
  if (dobreImie(o.name)) r.name = oczyscImie(o.name);
  if (typeof o.f === 'boolean') r.f = o.f;
  if (typeof o.prof === 'string' && zawod(o.prof)) {
    r.prof = o.prof;
    r.skills = umiejetnosciStartowe(o.prof);
    const s = o.skills;
    if (s && typeof s === 'object' && !Array.isArray(s))
      for (const d of dziedziny(o.prof)) {
        const v = (s as Record<string, unknown>)[d];
        if (calkowita(v) && v > 0) r.skills[d] = Math.min(v, maksimum(o.prof, d));
      }
    // ponad budżet: odejmujemy od końca listy
    for (const d of dziedziny(o.prof).reverse()) while (punkty(r.skills) > BUDZET && odejmijPunkt(r, d));
  }
  r.age = przytnijWiek(calkowita(o.age) ? o.age : r.age, r.prof);
  const t = o.traits;
  if (Array.isArray(t) && t.length >= 1 && t.length <= 2 && !bledyOsoby({ ...r, traits: t }).length)
    r.traits = [...(t as string[])];
  // historia: z ziarna od nowa (pasuje do poprawionych danych), a własna gracza zostaje, przycięta do 400 znaków
  if (calkowita(o.ziarno)) r.ziarno = o.ziarno;
  else if (typeof o.story === 'string') delete r.ziarno;
  r.story = r.ziarno !== undefined ? historiaZ(r.ziarno, r) : String(o.story).slice(0, HISTORIA_MAX);
  return r;
}
