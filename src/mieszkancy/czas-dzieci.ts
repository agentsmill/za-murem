/* Dorosłe dzieci spoza domu (R28): spis zna tylko dzieci, które mieszkają z rodzicami, więc dzieci, które
   wyprowadziły się przed 2021 rokiem, dopisujemy raz, przed pierwszym krokiem postarzania (czas.ts). Każda z nich to
   `Osoba` ze `stan: 'wyjechal'`, `dokad` i wpisem wyjazdu sprzed 2021, więc powroty (czas-ruch.ts) mogą ją ściągnąć
   do rodzica, a opieka do rodzica 75+, który został sam. Model i liczby w `PRZEJSCIA.dzieciSpozaDomu`. Same
   `+ - * /`, porównania i `Math.round/min/max`; losowanie przez los.ts. */

import type { Rng } from '../core/rng.ts';
import { dokad, type Obszar } from './czas-dokad.ts';
import { nowaOsoba, partnerTu, type Stan } from './czas-stan.ts';
import { PRZEJSCIA } from './dzwignie.ts';
import { calkowita, szansa, wazony } from './los.ts';
import type { TabeleKraju } from './tabele.ts';

/** Wiek w skali spisu (`2020 - rocznik`, osoby.ts). */
const ROK_WIEKU = 2020;

/** Bezdzietność definitywna na 10 000 dla rocznika: liniowo między punktami, poza nimi jak najbliższy punkt. */
function bezdzietnosc(rocznik: number): number {
  const punkty = PRZEJSCIA.dzieciSpozaDomu.bezdzietnosc;
  if (rocznik <= punkty[0][0]) return punkty[0][1];
  for (let i = 1; i < punkty.length; i++) {
    const [r0, p0] = punkty[i - 1];
    const [r1, p1] = punkty[i];
    if (rocznik <= r1) return Math.round(p0 + ((p1 - p0) * (rocznik - r0)) / (r1 - r0));
  }
  return punkty[punkty.length - 1][1];
}

/** Matki z jednym, dwojgiem, trojgiem i czworgiem dzieci z kolejności urodzeń: (o1 - o2, o2 - o3, o3 - o4, o4). */
const wagiDzieci = (k: TabeleKraju): number[] => {
  const o = k.kolejnosc;
  return [o[0] - o[1], o[1] - o[2], o[2] - o[3], o[3]].map((v) => Math.max(0, v));
};

/** Dopisuje dzieci spoza domu kobietom ze spisu od `odWieku` lat, w kolejności osób, z ziarnem
    `losDla('czas', klucz, 'dzieci')` podanym przez wywołującego. Nowe osoby idą na koniec listy osób, ich wpisy
    wyjazdu do dziennika, który na końcu jest sortowany po roku (stabilnie). */
export function dzieciSpozaDomu(s: Stan, r: Rng, k: TabeleKraju, obszar: Obszar): void {
  const p = PRZEJSCIA.dzieciSpozaDomu;
  const wagi = wagiDzieci(k);
  const n = s.osoby.length;
  for (let i = 0; i < n; i++) {
    const matka = s.osoby[i];
    const wiekMatki = ROK_WIEKU - matka.rocznik;
    if (matka.stan !== 'tu' || matka.plec !== 'K' || wiekMatki < p.odWieku) continue;
    const wDomu = (s.dzieci.get(matka.id) ?? []).length;
    let wszystkich: number;
    if (wDomu === 0) {
      if (szansa(r, bezdzietnosc(matka.rocznik))) continue;
      wszystkich = 1 + wazony(r, wagi);
    } else {
      const odTylu = wagi.map((v, j) => (j + 1 >= wDomu ? v : 0));
      const j = wazony(r, odTylu);
      wszystkich = j < 0 ? wDomu : j + 1;
    }
    const najstarsza = Math.min(p.matkaDo, wiekMatki - PRZEJSCIA.dorosly);
    if (najstarsza < p.matkaOd) continue;
    const p0 = partnerTu(s, matka);
    const ojciec = p0 && p0.plec === 'M' && s.dom.get(p0.id) === s.dom.get(matka.id) ? p0 : undefined;
    for (let d = wDomu; d < wszystkich; d++) {
      const rocznik = matka.rocznik + calkowita(r, p.matkaOd, najstarsza);
      const dziecko = nowaOsoba(s, szansa(r, PRZEJSCIA.chlopcy) ? 'M' : 'K', rocznik, matka, ojciec);
      const emigracja = szansa(r, p.emigranci);
      const gdzie = dokad(r, emigracja ? 'emigracja' : 'wyprowadzka', obszar, s.budynek.lat, s.budynek.lon);
      const rok = Math.min(ROK_WIEKU, rocznik + calkowita(r, p.wyjazdOd, p.wyjazdDo));
      const wpis = {
        rok,
        typ: emigracja ? ('emigracja' as const) : ('wyprowadzka' as const),
        kto: dziecko.id,
        dokad: gdzie,
      };
      dziecko.stan = 'wyjechal';
      dziecko.dokad = gdzie;
      s.dziennik.push(wpis);
      s.wyjazdy.set(dziecko.id, wpis);
    }
  }
  s.dziennik.sort((a, b) => a.rok - b.rok);
}
