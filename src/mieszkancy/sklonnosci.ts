/* Skłonności budynków (spec rozdz. 4): kto częściej mieszka w starym domu, w domu na nowym osiedlu, w bloku z płyty
   i w bloku po 2010. Jedna tabela mnożników rozkładu wieku rejonu i udziału gospodarstw trzypokoleniowych według
   typu i epoki budynku, znormowana po mieszance epok gminy, żeby osiedle jako całość zostało przy rozkładach rejonu.
   Same `+ - * /`, wynik w pamięci podręcznej na tabelę gminy. */

import { WAGI_KRAJOWE } from './budynki.ts';
import type { Epoka, GrupaWieku, Marginesy, TabeleGminy, TabeleKraju } from './tabele.ts';
import type { Budynek } from './typy.ts';

const EPOKI: readonly Epoka[] = ['przedwojenna', 'powojenna', 'plyta', 'transformacja', 'nowa'];
const GRUPY: readonly GrupaWieku[] = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'];
type Typ = Budynek['typ'];

export interface Sklonnosc {
  /** Mnożnik udziału osób w grupach wieku 0-9, 10-19, …, 70-79, 80+ (obie płcie). */
  wiek: readonly number[];
  /** Mnożnik udziału gospodarstw trzypokoleniowych (osoby 0-29, 30-59 i 60+ razem, jak u GUS). */
  trzy: number;
}

/** Decyzja generatora, nie dane: zgadnięte mnożniki do strojenia botem (Task 10), z domyślnych skłonności
    w specyfikacji, rozdz. 4. Przed użyciem normowane (`sklonnosc`), więc liczą się proporcje między epokami.
    - dom przedwojenny i powojenny: para albo wdowa po sześćdziesiątce, dorosłe dzieci często poza domem, częściej
      trzy pokolenia;
    - dom z lat 1989-2021 (podmiejskie osiedle): para po trzydziestce i czterdziestce z dziećmi;
    - blok z płyty: pierwsi lokatorzy z przydziału, dziś po siedemdziesiątce i często sami, ich dzieci i wnuki,
      najemcy koło dwudziestki;
    - blok po 2011: przyjezdni koło trzydziestki, pary bez dzieci albo z małymi dziećmi, mało seniorów;
    - pozostałe epoki pośrodku (kamienica przedwojenna z najemcami, blok powojenny z najstarszymi wdowami). */
export const SKLONNOSCI: Record<Typ, Record<Epoka, Sklonnosc>> = {
  dom: {
    przedwojenna: { wiek: [0.8, 0.8, 0.8, 0.8, 0.9, 1.1, 1.5, 1.6, 1.6], trzy: 1.4 },
    powojenna: { wiek: [0.8, 0.8, 0.8, 0.8, 0.9, 1.1, 1.5, 1.5, 1.5], trzy: 1.3 },
    plyta: { wiek: [0.9, 0.9, 1.0, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0], trzy: 1.1 },
    transformacja: { wiek: [1.3, 1.2, 0.8, 1.3, 1.3, 0.9, 0.7, 0.6, 0.6], trzy: 0.8 },
    nowa: { wiek: [1.5, 1.1, 0.8, 1.6, 1.2, 0.8, 0.6, 0.5, 0.5], trzy: 0.7 },
  },
  blok: {
    przedwojenna: { wiek: [1.0, 0.9, 1.3, 1.1, 0.9, 0.9, 0.9, 1.0, 1.1], trzy: 1.0 },
    powojenna: { wiek: [0.9, 0.9, 1.1, 0.9, 0.9, 1.0, 1.1, 1.3, 1.5], trzy: 1.1 },
    plyta: { wiek: [0.9, 0.9, 1.2, 0.9, 0.8, 1.0, 1.1, 1.4, 1.3], trzy: 1.2 },
    transformacja: { wiek: [1.2, 0.9, 1.1, 1.3, 1.1, 0.9, 0.8, 0.7, 0.7], trzy: 0.9 },
    nowa: { wiek: [1.4, 0.6, 1.4, 1.6, 0.9, 0.6, 0.5, 0.3, 0.3], trzy: 0.5 },
  },
};

/** Udział gospodarstw trzypokoleniowych względem wartości dla gminy (`k.trojpokoleniowe`, miasta albo wieś): w mieście
    to głównie bloki, więc blok ma udział miejski, a dom więcej; na wsi dom ma udział wiejski, a blok mniej. Decyzja
    generatora (GUS podaje tylko miasta i wieś, bez typu budynku). */
export const TRZY_POKOLENIA_TYPU: Record<'miasta' | 'wies', Record<Typ, number>> = {
  miasta: { blok: 1, dom: 1.5 },
  wies: { blok: 0.6, dom: 1 },
};

/** Iteracje normowania; zbiega w kilku. */
const ITERACJE = 20;

type Znormowane = Record<Typ, Record<Epoka, Sklonnosc>>;
const pamiec = new WeakMap<object, Znormowane>();

/** Udział grup wieku (obie płcie) w marginesach. */
function profil(m: Marginesy): number[] {
  const v = GRUPY.map((g) => Math.max(0, m.wiek.M[g] || 0) + Math.max(0, m.wiek.K[g] || 0));
  const razem = v.reduce((a, x) => a + x, 0);
  return razem > 0 ? v.map((x) => x / razem) : GRUPY.map(() => 1 / GRUPY.length);
}

/** Tabela znormowana dla gminy (bez gminy dla Polski). Wagi epok to ludność w mieszkaniach z epoki (P4386), bez gminy
    mieszkania w miastach Polski (`WAGI_KRAJOWE` z budynki.ts). Dla każdego typu osobno mnożniki wieku poprawiamy tak,
    żeby budynki wszystkich epok razem, każdy z rozkładem „profil gminy × mnożnik” sprowadzonym do jedynki, dawały
    z powrotem profil gminy w każdej grupie wieku; mnożnik trzech pokoleń dzielimy przez średnią ważoną mieszkaniami. */
function znormuj(g: TabeleGminy | null, k: TabeleKraju): Znormowane {
  const zGminy = g ? EPOKI.map((e) => Math.max(0, g.epoki[e]?.osoby ?? 0)) : [];
  const osoby = zGminy.some((v) => v > 0) ? zGminy : EPOKI.map((e) => WAGI_KRAJOWE[e]);
  const zMieszkan = g ? EPOKI.map((e) => Math.max(0, g.epoki[e]?.mieszkania ?? 0)) : [];
  const mieszkania = zMieszkan.some((v) => v > 0) ? zMieszkan : EPOKI.map((e) => WAGI_KRAJOWE[e]);
  const wOsob = osoby.map((v) => v / osoby.reduce((a, x) => a + x, 0));
  const wMieszkan = mieszkania.map((v) => v / mieszkania.reduce((a, x) => a + x, 0));
  const c = profil(g ? g.gmina : k.polska);
  const wynik = {} as Znormowane;
  for (const typ of ['dom', 'blok'] as const) {
    const t = EPOKI.map((e) => [...SKLONNOSCI[typ][e].wiek]);
    for (let it = 0; it < ITERACJE; it++) {
      const z = t.map((te) => te.reduce((a, x, i) => a + c[i] * x, 0));
      for (let i = 0; i < GRUPY.length; i++) {
        let s = 0;
        for (let e = 0; e < EPOKI.length; e++) s += (wOsob[e] * t[e][i]) / z[e];
        for (let e = 0; e < EPOKI.length; e++) t[e][i] /= s;
      }
    }
    const sredniaTrzy = EPOKI.reduce((a, e, i) => a + wMieszkan[i] * SKLONNOSCI[typ][e].trzy, 0);
    wynik[typ] = {} as Record<Epoka, Sklonnosc>;
    EPOKI.forEach((e, i) => {
      wynik[typ][e] = { wiek: t[i], trzy: SKLONNOSCI[typ][e].trzy / sredniaTrzy };
    });
  }
  return wynik;
}

/** Znormowana skłonność budynku typu `typ` z epoki `epoka` w gminie `g` (bez gminy: Polska). */
export function sklonnosc(g: TabeleGminy | null, k: TabeleKraju, typ: Typ, epoka: Epoka): Sklonnosc {
  const klucz: object = g ?? k;
  let tabela = pamiec.get(klucz);
  if (!tabela) pamiec.set(klucz, (tabela = znormuj(g, k)));
  return tabela[typ][epoka];
}
