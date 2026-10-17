/* Dokąd wyjeżdżają ludzie z budynku: krótkie opisy miejsc po polsku („do Krakowa”, „do Niemiec”, „na wieś pod
   miastem”), losowane z wagami według rodzaju wyjazdu i obszaru (miasto 100 tys.+, inne miasto, wieś). Z dużego
   miasta nie wyjeżdża się do niego samego, a ze wsi i mniejszego miasta najczęściej do najbliższego dużego miasta.
   Odległość to kwadrat różnic stopni (długość × 0,6, jak w rejon.ts), bez trygonometrii. */

import type { Rng } from '../core/rng.ts';
import { wazony } from './los.ts';

export type Obszar = 'miasto100k' | 'miasto' | 'wies';
export type Kierunek = 'wyprowadzka' | 'przeprowadzka' | 'emigracja' | 'wyludnienie';

/** Duże miasta jako cele wyjazdu, z wagami z grubsza według wielkości (decyzja generatora). */
const MIASTA: readonly { dokad: string; lat: number; lon: number; waga: number }[] = [
  { dokad: 'do Warszawy', lat: 52.23, lon: 21.01, waga: 6 },
  { dokad: 'do Krakowa', lat: 50.06, lon: 19.94, waga: 3 },
  { dokad: 'do Wrocławia', lat: 51.11, lon: 17.03, waga: 2 },
  { dokad: 'do Łodzi', lat: 51.76, lon: 19.46, waga: 2 },
  { dokad: 'do Poznania', lat: 52.41, lon: 16.93, waga: 2 },
  { dokad: 'do Gdańska', lat: 54.35, lon: 18.65, waga: 2 },
];
const SKALA_DLUGOSCI = 0.6;
/** Budynek bliżej niż około 28 km od środka dużego miasta leży w nim (dla obszaru miasto 100 tys.+). */
const W_MIESCIE_KW = 0.25 * 0.25;
/** Najbliższe duże miasto do około 65 km jest „swoim” miastem dla wsi i mniejszego miasta. */
const OKOLICA_KW = 0.6 * 0.6;

/** Zamiast nazwy: duże miasta (bez własnego) z wagą rozdzieloną według `MIASTA`, albo najbliższe duże miasto. */
const DUZE = '<duże>';
const NAJBLIZSZE = '<najbliższe>';

/** Emigranci według kraju pobytu, w setkach osób (opis źródła przy `CELE`). */
const EMIGRACJA: readonly (readonly [string, number])[] = [
  ['do Wielkiej Brytanii', 4124],
  ['do Niemiec', 3855],
  ['do Holandii', 1299],
  ['do Norwegii', 760],
  ['do Irlandii', 667],
  ['za granicę', 4429],
];

/** Wagi celów (decyzja generatora, z kierunków z danych): z miast 100 tys.+ ludzie wyjeżdżają głównie na
    przedmieścia i wieś, a przyjeżdżają z mniejszych miast (GUS, Rocznik Demograficzny 2025: Gdańsk 2024 +2 302
    z miast, −836 na wieś); emigranci według krajów pobytu na koniec 2025 roku (GUS, emigracja 2020-2025, tys.: Wielka
    Brytania 412,4, Niemcy 385,5, Holandia 129,9, Norwegia 76,0, Irlandia 66,7, reszta do 1 513,4); wyludnienie po
    upadku to wyjazdy na wieś po jedzenie. */
const CELE: Record<Kierunek, Record<Obszar, readonly (readonly [string, number])[]>> = {
  wyprowadzka: {
    miasto100k: [
      ['na inne osiedle', 45],
      ['na przedmieścia', 20],
      [DUZE, 25],
      ['do innego miasta', 10],
    ],
    miasto: [
      ['na inne osiedle', 35],
      [NAJBLIZSZE, 25],
      [DUZE, 20],
      ['do innego miasta', 20],
    ],
    wies: [
      [NAJBLIZSZE, 40],
      [DUZE, 15],
      ['do pobliskiego miasta', 20],
      ['do sąsiedniej wsi', 25],
    ],
  },
  przeprowadzka: {
    miasto100k: [
      ['na przedmieścia', 30],
      ['na wieś pod miastem', 20],
      ['na inne osiedle', 20],
      [DUZE, 20],
      ['do mniejszego miasta', 10],
    ],
    miasto: [
      [NAJBLIZSZE, 25],
      [DUZE, 15],
      ['na wieś pod miastem', 20],
      ['na inne osiedle', 20],
      ['do innego miasta', 20],
    ],
    wies: [
      [NAJBLIZSZE, 35],
      [DUZE, 15],
      ['do pobliskiego miasta', 20],
      ['do sąsiedniej wsi', 20],
      ['do innego miasta', 10],
    ],
  },
  emigracja: { miasto100k: EMIGRACJA, miasto: EMIGRACJA, wies: EMIGRACJA },
  wyludnienie: {
    miasto100k: [
      ['na wieś do rodziny', 50],
      ['w rodzinne strony', 30],
      ['na działkę za miastem', 20],
    ],
    miasto: [
      ['na wieś do rodziny', 50],
      ['w rodzinne strony', 30],
      ['na działkę za miastem', 20],
    ],
    wies: [
      ['do rodziny na wsi', 50],
      ['w rodzinne strony', 50],
    ],
  },
};

/** Indeks najbliższego dużego miasta w odległości do `progKw`, albo -1. */
function najblizsze(lat: number, lon: number, progKw: number): number {
  let wynik = -1;
  let najmniej = progKw;
  MIASTA.forEach((m, i) => {
    const dy = m.lat - lat;
    const dx = (m.lon - lon) * SKALA_DLUGOSCI;
    const d = dy * dy + dx * dx;
    if (d < najmniej) {
      najmniej = d;
      wynik = i;
    }
  });
  return wynik;
}

const pamiec = new Map<string, { nazwy: string[]; wagi: number[] }>();

/** Cele z wagami całkowitymi dla rodzaju wyjazdu, obszaru, własnego i najbliższego miasta. `DUZE` rozpisuje się na
    miasta (bez własnego) proporcjonalnie do ich wag, `NAJBLIZSZE` bez najbliższego miasta przechodzi do `DUZE`. */
function cele(kierunek: Kierunek, obszar: Obszar, wlasne: number, blisko: number): { nazwy: string[]; wagi: number[] } {
  const klucz = `${kierunek}|${obszar}|${wlasne}|${blisko}`;
  const gotowe = pamiec.get(klucz);
  if (gotowe) return gotowe;
  const miasta = MIASTA.map((m, i) => (i === wlasne ? 0 : m.waga));
  const sumaMiast = miasta.reduce((a, v) => a + v, 0);
  const nazwy: string[] = [];
  const wagi: number[] = [];
  const dodaj = (nazwa: string, waga: number): void => {
    const i = nazwy.indexOf(nazwa);
    if (i >= 0) wagi[i] += waga;
    else {
      nazwy.push(nazwa);
      wagi.push(waga);
    }
  };
  for (const [nazwa, waga] of CELE[kierunek][obszar]) {
    if (nazwa === NAJBLIZSZE && blisko >= 0) dodaj(MIASTA[blisko].dokad, waga * sumaMiast);
    else if (nazwa === DUZE || nazwa === NAJBLIZSZE) {
      for (let i = 0; i < MIASTA.length; i++) if (miasta[i] > 0) dodaj(MIASTA[i].dokad, waga * miasta[i]);
    } else dodaj(nazwa, waga * sumaMiast);
  }
  const wynik = { nazwy, wagi };
  pamiec.set(klucz, wynik);
  return wynik;
}

/** Losuje, dokąd wyjeżdża ktoś z budynku w punkcie (lat, lon). */
export function dokad(r: Rng, kierunek: Kierunek, obszar: Obszar, lat: number, lon: number): string {
  const wlasne = obszar === 'miasto100k' ? najblizsze(lat, lon, W_MIESCIE_KW) : -1;
  const blisko = obszar === 'miasto100k' ? -1 : najblizsze(lat, lon, OKOLICA_KW);
  const c = cele(kierunek, obszar, wlasne, blisko);
  return c.nazwy[Math.max(0, wazony(r, c.wagi))];
}
