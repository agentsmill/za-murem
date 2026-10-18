/* Mieszkańcy z adresu po angielsku (docs/superpowers/specs/2026-10-18-angielski-design.md, „Treść generowana”):
   historia, rodzina i zawód każdej osoby budynku siedziby w angielskiej wersji. Stan gry zostaje polski
   (src/sim/lokatorzy.ts); angielskie teksty powstają poza nim, z tego samego wyniku generatora, i trzyma je interfejs
   w mapie po `Osoba.id` (`Person.ref`), liczonej przy starcie, przy wznowieniu i po zmianie imienia.

   Te same historie. `historieWyniku` z mapą źródeł (historie.ts) przelicza historie gospodarstw siedziby tak samo jak
   generator: te same ziarna `losDla('historie', klucz budynku, id gospodarstwa)`, nowe obiekty losowania z tych samych
   ziaren (żaden strumień polskiej ścieżki nie traci liczby), ta sama kronika i odmiana, więc te same polskie zdania
   (test). Przy każdym zdaniu zbiera jego źródło: szablon, osoby, rok, kierunek, miejsce. Angielskie zdanie to
   angielski bliźniak tego szablonu (szablony.en.ts) wypełniony tymi samymi danymi. Historia osoby powstaje jak
   w lokatorzy.ts (`historiaOsoby`), a decyzje (które zdania odpadają przez RODO, czy dochodzi linijka „Dawniej X,
   dziś Y.”, ile zdań zostaje przy 700 znakach) zapadają na polskich zdaniach i przechodzą na angielskie. Dlatego
   angielska historia ma te same zdania, w tej samej kolejności, co polska ze stanu gry. Wyjątek, celowo pominięty:
   decyzje liczą się na imionach z generatora, a polska historia po zmianie imienia na imionach gracza; różnić się
   mogą tylko wtedy, gdy nowe imię przypadkiem zmieni dopasowanie napisów albo długość ponad 700 znaków.

   Imiona: `imiona` to obecne imiona osób po `Osoba.id` (imię gracza albo z generatora; brak wpisu to imię
   z generatora). Po angielsku się ich nie odmienia, więc formy przypadków nie są potrzebne; wybór szablonów od
   imion gracza i tak nie zależy (historie.ts). Rodzina: „husband Marek (54), daughter Agnieszka (23)” w tej samej
   kolejności co polska linijka. Zawód: fach po angielsku, bez fachu dawny zawód, dziecko albo mieszkaniec, jak
   `zawodGry` w lokatorzy.ts.

   Brak angielskiego (szablon bez bliźniaka, kierunek albo zawód spoza tablic) daje polskie zdanie albo polskie słowo,
   tak jak w reszcie gry (polski tekst bez angielskiego odpowiednika pokazuje się po polsku), a testy pokrycia to łapią.
   Czyste i deterministyczne: bez DOM, sieci, zegara i Math.random; nie zmienia `l`, `dane` ani `imiona`. */

import type { LokatorzyGry } from '../sim/lokatorzy.ts';
import { dawnyZawodEn, fachEn } from './fachy.en.ts';
import { fachOsoby, nazwaFachu } from './fachy.ts';
import { ROK_GRY } from './generuj.ts';
import { historieWyniku, pokrewienstwo, type ZrodloZdania } from './historie.ts';
import {
  DOKAD_EN,
  type KontekstEn,
  KREWNI_EN,
  rodzinaEn,
  SKAD_EN,
  SZABLONY_EN,
  wielkaEn,
  wypelnijEn,
  zPrzedimkiem,
} from './szablony.en.ts';
import { type Krewny, SKAD } from './szablony.ts';
import type { Osoba } from './typy.ts';
import type { DaneMieszkancow } from './wczytaj.ts';

/** Angielskie teksty osoby do karty: historia (gdy jest też polska), linijka rodziny i zawód. */
export interface LokatorEn {
  story?: string;
  rodzina: string;
  prof: string;
}

/* Te same reguły co w src/sim/lokatorzy.ts (`historiaOsoby`, `rodzinaOsoby`, `zawodGry`); test porównuje wynik
   z polską stroną z lokatorzy.ts, więc rozjazd tych stałych nie przejdzie po cichu. */
/** Teksty dla gracza bez numerów mieszkań i pięter (spec §10): zdanie, którego polska wersja to ma, odpada. */
const RODO = /\bm\.\s?\d|\bmieszkani[ea] nr|\bpiętr/i;
/** Najdłuższa polska historia osoby w znakach (całe zdania). */
const MAX_HISTORII = 700;
/** Młodsi niż tyle lat to dziecko. */
const DZIECKO_DO = 16;
/** Kolejność krewnych w linijce rodziny; w obrębie jednej grupy starsi pierwsi. */
const KOLEJNOSC_KREWNYCH: Readonly<Record<Krewny, number>> = {
  maz: 0,
  zona: 0,
  matka: 1,
  ojciec: 2,
  rodzice: 2,
  syn: 3,
  corka: 3,
  brat: 4,
  siostra: 4,
  babcia: 5,
  dziadek: 5,
  wnuk: 6,
  wnuczka: 6,
};

/** Zdanie historii w obu językach: polskie (do decyzji) i angielskie (do pokazania). */
interface Para {
  pl: string;
  en: string;
}

type ImieOsoby = (o: Osoba) => string;

/** Linijka o dawnym zawodzie i fachu: „Once an ESG consultant, now a rations accountant.”, a przy tej samej nazwie
    „A doctor before the fall and still one now.” (po polsku „Dawniej lekarka, dziś lekarka.”). */
export function dawniejEn(dawny: string, dzis: string): string {
  if (dawny === dzis) return `${wielkaEn(zPrzedimkiem(dzis))} before the fall and still one now.`;
  return `Once ${zPrzedimkiem(dawny)}, now ${zPrzedimkiem(dzis)}.`;
}

function kontekstEn(z: ZrodloZdania, imie: ImieOsoby): KontekstEn {
  const o = z.glowna;
  const k: KontekstEn = { glowna: { imie: imie(o), f: o.plec === 'K' }, rok: z.rok, wiek: z.wiek };
  if (z.powiazana) k.powiazana = { imie: imie(z.powiazana), f: z.powiazana.plec === 'K' };
  if (z.kim) k.krewny = KREWNI_EN[z.kim];
  if (z.rodzina) k.rodzina = rodzinaEn(z.rodzina);
  // jak `kontekst` w historie.ts: dokąd, gdy kierunek jest niepusty, skąd, gdy kierunek ma formę powrotu
  if (z.dokad) k.dokad = Object.hasOwn(DOKAD_EN, z.dokad) ? DOKAD_EN[z.dokad] : z.dokad;
  if (z.dokad !== undefined && Object.hasOwn(SKAD, z.dokad))
    k.skad = Object.hasOwn(SKAD_EN, z.dokad) ? SKAD_EN[z.dokad] : SKAD[z.dokad];
  if (z.miejsce) k.miejsce = z.miejsce;
  if (o.dawnyZawod !== undefined) k.zawod = dawnyZawodEn(o.dawnyZawod) ?? o.dawnyZawod;
  const fach = fachOsoby(o);
  if (fach) k.fach = fachEn(fach.id) ?? nazwaFachu(fach.id, o.plec);
  return k;
}

/** Angielskie zdanie ze źródła; bez bliźniaka albo bez wartości slotu polskie zdanie `pl`. */
function zdanieEn(z: ZrodloZdania, pl: string, imie: ImieOsoby): string {
  const szablon = Object.hasOwn(SZABLONY_EN, z.szablon) ? SZABLONY_EN[z.szablon] : undefined;
  if (!szablon) return pl;
  // po polsku imię odpadło (pro-drop), po angielsku wchodzi zaimek
  const tekst = z.bezImienia && szablon.startsWith('{o} ') ? `{g:he|she}${szablon.slice('{o}'.length)}` : szablon;
  try {
    return wielkaEn(wypelnijEn(tekst, kontekstEn(z, imie)));
  } catch {
    return pl;
  }
}

/** Historia osoby jak `historiaOsoby` w lokatorzy.ts: decyzje na polskich zdaniach (`Para.pl`), tekst z angielskich. */
function historiaOsobyEn(o: Osoba, zdaniaDomu: readonly Para[]): string | undefined {
  const zdania = zdaniaDomu.filter((z) => z.pl.trim() !== '' && !RODO.test(z.pl));
  const fach = fachOsoby(o);
  if (fach && o.dawnyZawod) {
    const dzis = nazwaFachu(fach.id, o.plec);
    const dawny = o.dawnyZawod;
    // zdanie generatora o tej osobie z oboma zawodami (imię z generatora, jak w polskich zdaniach wyżej)
    const juzJest = zdania.some((z) => z.pl.includes(o.imie) && z.pl.includes(dawny) && z.pl.includes(dzis));
    if (!juzJest)
      zdania.unshift({
        pl: `Dawniej ${dawny}, dziś ${dzis}.`,
        en: dawniejEn(dawnyZawodEn(dawny) ?? dawny, fachEn(fach.id) ?? dzis),
      });
  }
  while (zdania.length > 0 && zdania.map((z) => z.pl).join(' ').length > MAX_HISTORII) zdania.pop();
  return zdania.length > 0 ? zdania.map((z) => z.en).join(' ') : undefined;
}

/** Obecni krewni osoby w budynku po angielsku: „husband Marek (54), daughter Agnieszka (23)”; pusty napis, gdy nikogo. */
function rodzinaOsobyEn(o: Osoba, osoby: readonly Osoba[], wg: ReadonlyMap<string, Osoba>, imie: ImieOsoby): string {
  const krewni: { k: Krewny; p: Osoba; i: number }[] = [];
  osoby.forEach((p, i) => {
    if (p.stan !== 'tu') return;
    const k = pokrewienstwo(o, p, wg);
    if (k) krewni.push({ k, p, i });
  });
  krewni.sort((a, b) => KOLEJNOSC_KREWNYCH[a.k] - KOLEJNOSC_KREWNYCH[b.k] || a.p.rocznik - b.p.rocznik || a.i - b.i);
  return krewni.map(({ k, p }) => `${KREWNI_EN[k]} ${imie(p)} (${ROK_GRY - p.rocznik})`).join(', ');
}

/** Zawód na karcie po angielsku: fach, bez fachu dawny zawód, dziecko albo mieszkaniec. */
function zawodOsobyEn(o: Osoba): string {
  const fach = fachOsoby(o);
  if (fach) return fachEn(fach.id) ?? nazwaFachu(fach.id, o.plec);
  if (o.dawnyZawod) return dawnyZawodEn(o.dawnyZawod) ?? o.dawnyZawod;
  return ROK_GRY - o.rocznik < DZIECKO_DO ? 'child' : 'resident';
}

/** Angielska historia, rodzina i zawód każdej osoby budynku siedziby (`l.siedziba.osoby`, także nieobecnych), po
    `Osoba.id`. `dane` to te same tabele, z których powstało `l` (`lokatorzyGry`, `mieszkancyZapisu`), `imiona` to
    obecne imiona po `Osoba.id` (imiona gracza; brak wpisu to imię z generatora). Historia jest tylko tam, gdzie polska
    (`osobaGry`) też jest, i ma te same zdania. Czysta funkcja: do wołania przy starcie, przy wznowieniu i po zmianie
    imienia. */
export function lokatorzyEn(
  l: LokatorzyGry,
  dane: DaneMieszkancow,
  imiona: ReadonlyMap<string, string>,
): Map<string, LokatorEn> {
  const w = l.siedziba;
  const imie: ImieOsoby = (o) => imiona.get(o.id) || o.imie;
  const zebrane = new Map<string, ZrodloZdania[]>();
  const historie = historieWyniku(w, l.kronika, dane.odmiana, zebrane);
  const zdania = new Map<string, Para[]>();
  for (const [id, pl] of historie) {
    const zrodla = zebrane.get(id) ?? [];
    zdania.set(
      id,
      pl.map((t, i) => ({ pl: t, en: zrodla[i] ? zdanieEn(zrodla[i], t, imie) : t })),
    );
  }
  const wg = new Map(w.osoby.map((o) => [o.id, o]));
  const domOsoby = new Map<string, string>();
  for (const g of w.gospodarstwa) for (const id of g.czlonkowie) domOsoby.set(id, g.id);
  const wynik = new Map<string, LokatorEn>();
  for (const o of w.osoby) {
    const dom = domOsoby.get(o.id);
    const e: LokatorEn = { rodzina: rodzinaOsobyEn(o, w.osoby, wg, imie), prof: zawodOsobyEn(o) };
    const story = historiaOsobyEn(o, (dom === undefined ? undefined : zdania.get(dom)) ?? []);
    if (story) e.story = story;
    wynik.set(o.id, e);
  }
  return wynik;
}
