/* Stan budynku w trakcie postarzania (czas.ts) i wspólne operacje: wpisy do dziennika, wyjazdy i powroty całymi
   „jednostkami” (osoba z partnerem i małoletnimi dziećmi), nowe osoby i gospodarstwa, wolne mieszkania, zdarzenia
   z szansą na krok 5-letni. Stan to głęboka kopia wejścia, więc zmieniamy go w miejscu, a wejście zostaje nietknięte.
   Osoby i gospodarstwa przeglądamy zawsze w kolejności tablic. Same `+ - * /`, porównania i `Math.floor/round/max`. */

import type { Rng } from '../core/rng.ts';
import { PRZEJSCIA, type Progi } from './dzwignie.ts';
import { szansa, wazony } from './los.ts';
import type { Budynek, Gospodarstwo, Osoba, Plec, TypWpisu, Wpis, WynikBudynku } from './typy.ts';

export const LATA_KROKU = 5;

/** Wolne mieszkanie w klatce, wolne od roku `od`. */
export interface Wolne {
  klatka: number;
  od: number;
}

export interface Stan {
  budynek: Budynek;
  mieszkania: number;
  klatki: number;
  osoby: Osoba[];
  wg: Map<string, Osoba>;
  /** Pozycja osoby w `osoby` (osoby tylko dochodzą na koniec, więc pozycja się nie zmienia). */
  pozycja: Map<string, number>;
  /** Gospodarstwa w mieszkaniach. W trakcie kroku mogą być puste; koniec kroku je usuwa. */
  gospodarstwa: Gospodarstwo[];
  /** Gospodarstwo każdego mieszkańca (tylko `stan: 'tu'`). */
  dom: Map<string, Gospodarstwo>;
  /** Dzieci każdej matki i każdego ojca, w kolejności osób. */
  dzieci: Map<string, Osoba[]>;
  /** Ostatni wpis wyjazdu (`wyprowadzka` albo `emigracja`) każdej osoby, która kiedyś wyjechała. */
  wyjazdy: Map<string, Wpis>;
  /** Kto wyjechał razem z daną osobą (wpis z `z` = ta osoba). Lista może mieć osoby, które już wróciły, wyjechały
      potem z kimś innym albo są w niej dwa razy; `wroc` bierze tylko tych, których ostatni wyjazd ma `z` = ta osoba
      i którzy nadal są poza domem, każdego raz i w kolejności `osoby`, więc wynik jest taki jak przy przejrzeniu
      wszystkich osób. */
  towarzysze: Map<string, Osoba[]>;
  dziennik: Wpis[];
  nastepnaOsoba: number;
  nastepneGospodarstwo: number;
  // ---- bieżący krok
  /** Pierwszy rok kroku; krok to lata od `poczatek` do `poczatek + 4`. */
  poczatek: number;
  /** Wpisy kroku w kolejności zdarzeń; koniec kroku sortuje je po roku (stabilnie) i dopisuje do dziennika. */
  wpisy: Wpis[];
  /** Rok ostatniego wpisu osoby w tym kroku: późniejsze zdarzenia z jej udziałem nie mogą być wcześniej. */
  ostatni: Map<string, number>;
  /** Rok ostatniego odejścia z gospodarstwa w tym kroku. */
  odejscia: Map<string, number>;
  wolne: Wolne[];
  wagiLat: number[];
}

/** Numer z identyfikatora `${prefiks}${n}`, albo -1. */
const numer = (id: string, prefiks: string): number => {
  if (!id.startsWith(prefiks)) return -1;
  const n = Number(id.slice(prefiks.length));
  return Number.isInteger(n) ? n : -1;
};

/** Dopisuje osobę do listy pod kluczem. */
function dopisz(m: Map<string, Osoba[]>, klucz: string, o: Osoba): void {
  const lista = m.get(klucz);
  if (lista) lista.push(o);
  else m.set(klucz, [o]);
}

/** Stan z wyniku: kopie osób, gospodarstw, wpisów i budynku, indeksy i liczniki identyfikatorów (dalej od
    największego numeru osoby i gospodarstwa, także gospodarstw, które już opuściły mieszkanie). */
export function stanZ(w: WynikBudynku): Stan {
  const klucz = w.budynek.klucz;
  const osoby = w.osoby.map((o) => ({ ...o }));
  const wg = new Map<string, Osoba>();
  const pozycja = new Map<string, number>();
  const dzieci = new Map<string, Osoba[]>();
  let nastepnaOsoba = 0;
  for (const o of osoby) {
    wg.set(o.id, o);
    pozycja.set(o.id, pozycja.size);
    nastepnaOsoba = Math.max(nastepnaOsoba, numer(o.id, `${klucz}/o`) + 1);
  }
  for (const o of osoby) {
    for (const r of [o.matka, o.ojciec]) {
      if (r === undefined) continue;
      const lista = dzieci.get(r);
      if (lista) lista.push(o);
      else dzieci.set(r, [o]);
    }
  }
  const gospodarstwa = w.gospodarstwa.map((g) => ({ ...g, czlonkowie: [...g.czlonkowie] }));
  const dom = new Map<string, Gospodarstwo>();
  let nastepneGospodarstwo = 0;
  for (const g of gospodarstwa) {
    for (const id of g.czlonkowie) dom.set(id, g);
    nastepneGospodarstwo = Math.max(nastepneGospodarstwo, numer(g.id, `${klucz}/g`) + 1);
  }
  const dziennik = w.dziennik.map((d) => ({ ...d }));
  const wyjazdy = new Map<string, Wpis>();
  const towarzysze = new Map<string, Osoba[]>();
  for (const d of dziennik) {
    if (d.typ === 'wyprowadzka' || d.typ === 'emigracja') wyjazdy.set(d.kto, d);
    if (d.typ === 'opuszczone') nastepneGospodarstwo = Math.max(nastepneGospodarstwo, numer(d.kto, `${klucz}/g`) + 1);
  }
  // towarzysze: osoby nadal poza domem, z ostatniego wyjazdu (jak w stanie na żywo, gdzie powrót lidera czyści listę)
  for (const d of dziennik) {
    if (d.z !== undefined && wyjazdy.get(d.kto) === d && wg.get(d.kto)?.stan === 'wyjechal') {
      dopisz(towarzysze, d.z, wg.get(d.kto)!);
    }
  }
  return {
    budynek: { ...w.budynek },
    mieszkania: w.budynek.mieszkania ?? w.gospodarstwa.length + w.puste,
    klatki: Math.max(1, w.budynek.klatki),
    osoby,
    wg,
    pozycja,
    gospodarstwa,
    dom,
    dzieci,
    wyjazdy,
    towarzysze,
    dziennik,
    nastepnaOsoba,
    nastepneGospodarstwo,
    poczatek: 0,
    wpisy: [],
    ostatni: new Map(),
    odejscia: new Map(),
    wolne: [],
    wagiLat: new Array<number>(LATA_KROKU).fill(0),
  };
}

export function wynikZ(s: Stan, rok: number): WynikBudynku {
  return {
    budynek: s.budynek,
    osoby: s.osoby,
    gospodarstwa: s.gospodarstwa,
    dziennik: s.dziennik,
    puste: s.mieszkania - s.gospodarstwa.length,
    rok,
  };
}

/** Mieszkania w klatce: spis kładzie gospodarstwa na klatki po kolei (1, 2, …, 1, 2, …), więc i mieszkania. */
const mieszkaniaKlatki = (s: Stan, klatka: number): number =>
  Math.floor(s.mieszkania / s.klatki) + (klatka - 1 < s.mieszkania % s.klatki ? 1 : 0);

/** Początek kroku: czyści dane kroku i wylicza wolne mieszkania w klatkach, wolne od pierwszego roku kroku. */
export function poczatekKroku(s: Stan, poczatek: number): void {
  s.poczatek = poczatek;
  s.wpisy = [];
  s.ostatni.clear();
  s.odejscia.clear();
  s.wolne = [];
  const zajete = new Array<number>(s.klatki + 1).fill(0);
  for (const g of s.gospodarstwa) zajete[g.klatka]++;
  for (let k = 1; k <= s.klatki; k++) {
    for (let i = zajete[k]; i < mieszkaniaKlatki(s, k); i++) s.wolne.push({ klatka: k, od: poczatek });
  }
}

/** Koniec kroku: usuwa puste gospodarstwa i dopisuje wpisy kroku do dziennika po roku, w kolejności zdarzeń w roku. */
export function koniecKroku(s: Stan): void {
  s.gospodarstwa = s.gospodarstwa.filter((g) => g.czlonkowie.length > 0);
  s.wpisy.sort((a, b) => a.rok - b.rok); // sort w JS jest stabilny (ES2019)
  for (const d of s.wpisy) s.dziennik.push(d);
  s.wpisy = [];
}

export function wpis(s: Stan, d: Wpis): Wpis {
  s.wpisy.push(d);
  s.ostatni.set(d.kto, Math.max(d.rok, s.ostatni.get(d.kto) ?? d.rok));
  if (d.z !== undefined) s.ostatni.set(d.z, Math.max(d.rok, s.ostatni.get(d.z) ?? d.rok));
  return d;
}

/** Najwcześniejszy rok kolejnego zdarzenia z udziałem tych osób w kroku. */
export function najwczesniej(s: Stan, osoby: readonly Osoba[]): number {
  let rok = s.poczatek;
  for (const o of osoby) rok = Math.max(rok, s.ostatni.get(o.id) ?? rok);
  return rok;
}

/** Szansa na 10 000 z progów wieku. */
export function zProgow(progi: Progi, wiek: number): number {
  let p = 0;
  for (const [od, v] of progi) if (wiek >= od) p = v;
  return p;
}

/** Zdarzenie z szansą na krok 5-letni. `stawka(rok)` to szansa na 10 000, gdyby obowiązywała przez cały krok.
    Szansa to suma stawek z lat od `od` przez 5: `od` to tylko granica z natury rzeczy (rok po wyjeździe, rok, od
    którego rodzic jest sam, rok zwolnienia mieszkania), a wiek i dźwignie wchodzą przez stawkę. `po` (domyślnie `od`)
    to najwcześniejszy rok zgodny z wcześniejszymi wpisami uczestników w tym kroku (urodzenie dziecka, owdowienie):
    nie zmienia szansy, tylko rok, w którym zdarzenie wypada, losowany z wagami stawek od `po`. Gdy od `po` żadna
    stawka nie zostaje (górny próg wieku albo dźwignia zero już minęły), zdarzenia nie ma. Zwraca rok albo -1. Bez
    żadnej stawki nie zużywa losowania. */
export function zdarzenie(s: Stan, r: Rng, od: number, stawka: (rok: number) => number, po = od): number {
  const wagi = s.wagiLat;
  let suma = 0;
  for (let i = 0; i < LATA_KROKU; i++) {
    const rok = s.poczatek + i;
    const v = rok >= od ? Math.max(0, Math.round(stawka(rok))) : 0;
    wagi[i] = v;
    suma += v;
  }
  if (suma === 0 || !szansa(r, Math.round(suma / LATA_KROKU))) return -1;
  let zostaje = 0;
  for (let i = 0; i < LATA_KROKU; i++) {
    if (s.poczatek + i < po) wagi[i] = 0;
    zostaje += wagi[i];
  }
  return zostaje === 0 ? -1 : s.poczatek + wazony(r, wagi);
}

/** Partner, który tu mieszka i nadal jest partnerem tej osoby. */
export function partnerTu(s: Stan, o: Osoba): Osoba | undefined {
  const p = o.partner === undefined ? undefined : s.wg.get(o.partner);
  return p && p.stan === 'tu' && p.partner === o.id ? p : undefined;
}

/** Czy osoba mieszka w jednym gospodarstwie z matką albo ojcem. */
export function zRodzicami(s: Stan, o: Osoba): boolean {
  const dom = s.dom.get(o.id);
  if (dom === undefined) return false;
  return (
    (o.matka !== undefined && s.dom.get(o.matka) === dom) || (o.ojciec !== undefined && s.dom.get(o.ojciec) === dom)
  );
}

/** Kto wyjeżdża razem z osobą w roku `rok`: ona, partner z tego samego gospodarstwa i ich małoletnie dzieci z tego
    gospodarstwa (także urodzone później w kroku; zdarzenie i tak nie może wypaść przed ich urodzeniem). */
export function jednostka(s: Stan, o: Osoba, rok: number): Osoba[] {
  const dom = s.dom.get(o.id);
  if (!dom) return [o];
  const p = partnerTu(s, o);
  const razem = p && s.dom.get(p.id) === dom ? [o, p] : [o];
  for (const id of dom.czlonkowie) {
    const d = s.wg.get(id)!;
    if (razem.includes(d) || rok - d.rocznik >= PRZEJSCIA.dorosly) continue;
    if (razem.some((x) => d.matka === x.id || d.ojciec === x.id)) razem.push(d);
  }
  return razem;
}

/** Najwcześniejszy rok wyjazdu osoby z jednostką, liczony na jednostce z początku kroku: kto jest małoletni w którymś
    roku kroku, jest nim też na początku (także dzieci urodzone w kroku), więc to największa możliwa jednostka. */
export function najwczesniejJednostki(s: Stan, o: Osoba): number {
  return najwczesniej(s, jednostka(s, o, s.poczatek));
}

/** Usuwa mieszkańca z jego gospodarstwa. Gospodarstwo, z którego odeszli wszyscy, dostaje wpis `opuszczone`
    (`kto` to gospodarstwo, `z` ostatnia osoba) z rokiem ostatniego odejścia w kroku i zwalnia mieszkanie. */
export function usun(s: Stan, o: Osoba, rok: number): Gospodarstwo | undefined {
  const dom = s.dom.get(o.id);
  if (!dom) return undefined;
  s.dom.delete(o.id);
  dom.czlonkowie.splice(dom.czlonkowie.indexOf(o.id), 1);
  const ostatnie = Math.max(rok, s.odejscia.get(dom.id) ?? rok);
  s.odejscia.set(dom.id, ostatnie);
  if (dom.czlonkowie.length === 0) {
    wpis(s, { rok: ostatnie, typ: 'opuszczone', kto: dom.id, z: o.id });
    s.wolne.push({ klatka: dom.klatka, od: ostatnie });
  }
  return dom;
}

/** Małoletni sami w mieszkaniu wyjeżdżają do krewnych. */
export function sieroty(s: Stan, dom: Gospodarstwo | undefined, rok: number): void {
  if (!dom || dom.czlonkowie.length === 0) return;
  const osoby = dom.czlonkowie.map((id) => s.wg.get(id)!);
  if (osoby.every((o) => rok - o.rocznik < PRZEJSCIA.dorosly)) wyjedz(s, osoby, rok, 'wyprowadzka', 'do krewnych');
}

/** Wyjazd jednostki: pierwsza osoba to „kto” bez `z`, reszta ma `z` = pierwsza (wyjechali razem). Każdy dostaje
    `stan: 'wyjechal'` i `dokad`. */
export function wyjedz(s: Stan, jednostka: readonly Osoba[], rok: number, typ: TypWpisu, dokad: string): void {
  const lider = jednostka[0];
  const dom = s.dom.get(lider.id);
  for (const o of jednostka) {
    const d = wpis(s, o === lider ? { rok, typ, kto: o.id, dokad } : { rok, typ, kto: o.id, z: lider.id, dokad });
    s.wyjazdy.set(o.id, d);
    if (o !== lider) dopisz(s.towarzysze, lider.id, o);
    o.stan = 'wyjechal';
    o.dokad = dokad;
    usun(s, o, rok);
  }
  sieroty(s, dom, rok);
}

/** Osoba wchodzi do gospodarstwa (urodzenie, przyjazd, powrót). */
export function przyjmij(s: Stan, o: Osoba, dom: Gospodarstwo): void {
  o.stan = 'tu';
  delete o.dokad;
  dom.czlonkowie.push(o.id);
  s.dom.set(o.id, dom);
}

/** Powrót osoby do gospodarstwa `dom` razem z tymi, którzy z nią wyjechali i nadal są poza domem. Wpis osoby ma
    typ `typ` i `z` (krewny, do którego wraca), wpisy towarzyszy typ `powrot` i `z` = ta osoba; `dokad` to miejsce,
    z którego wracają. */
export function wroc(s: Stan, lider: Osoba, dom: Gospodarstwo, rok: number, typ: TypWpisu, z?: string): void {
  const towarzysze = [...new Set(s.towarzysze.get(lider.id) ?? [])]
    .filter((o) => o !== lider && o.stan === 'wyjechal' && s.wyjazdy.get(o.id)?.z === lider.id)
    .sort((a, b) => s.pozycja.get(a.id)! - s.pozycja.get(b.id)!);
  s.towarzysze.delete(lider.id);
  const dokad = lider.dokad ?? '';
  wpis(s, z === undefined ? { rok, typ, kto: lider.id, dokad } : { rok, typ, kto: lider.id, z, dokad });
  przyjmij(s, lider, dom);
  for (const o of towarzysze) {
    wpis(s, { rok, typ: 'powrot', kto: o.id, z: lider.id, dokad: o.dokad ?? dokad });
    przyjmij(s, o, dom);
  }
}

/** Nowa osoba spoza budynku albo noworodek, z kolejnym identyfikatorem. Jeszcze bez gospodarstwa (`przyjmij`). */
export function nowaOsoba(s: Stan, plec: Plec, rocznik: number, matka?: Osoba, ojciec?: Osoba): Osoba {
  const o: Osoba = {
    id: `${s.budynek.klucz}/o${s.nastepnaOsoba++}`,
    plec,
    rocznik,
    imie: '',
    nazwisko: '',
    stan: 'tu',
  };
  for (const r of [matka, ojciec]) {
    if (!r) continue;
    if (r === matka) o.matka = r.id;
    else o.ojciec = r.id;
    const lista = s.dzieci.get(r.id);
    if (lista) lista.push(o);
    else s.dzieci.set(r.id, [o]);
  }
  s.pozycja.set(o.id, s.osoby.length);
  s.osoby.push(o);
  s.wg.set(o.id, o);
  return o;
}

/** Nowe gospodarstwo w wolnym mieszkaniu klatki `klatka`. */
export function noweGospodarstwo(s: Stan, klatka: number): Gospodarstwo {
  const g: Gospodarstwo = {
    id: `${s.budynek.klucz}/g${s.nastepneGospodarstwo++}`,
    budynek: s.budynek.klucz,
    klatka,
    czlonkowie: [],
    odOddania: false,
  };
  s.gospodarstwa.push(g);
  return g;
}

/** Zajmuje pierwsze wolne mieszkanie, które w roku `rok` już jest wolne. */
export function zajmij(s: Stan, rok: number): Wolne | undefined {
  const i = s.wolne.findIndex((w) => w.od <= rok);
  return i < 0 ? undefined : s.wolne.splice(i, 1)[0];
}

export const przeciwna = (p: Plec): Plec => (p === 'M' ? 'K' : 'M');
