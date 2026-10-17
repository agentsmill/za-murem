/* Rejon statystyczny dla punktu: do którego z obrysów z tabeli gminy trafia adres. Tylko `+ - * /`, porównania
   i `Math.min/max`, bez trygonometrii i pierwiastków, żeby wynik był taki sam w każdej przeglądarce i w Node. */

import type { Marginesy, TabeleGminy } from './tabele.ts';

/** `brak`: punkt leży w obrysie rejonu. `najblizszy`: poza wszystkimi obrysami, ale bliżej niż 1 km od któregoś
    (brzeg morza, pas bez tabeli jak rejon 183540 w Gdańsku, szczeliny między uproszczonymi obrysami).
    `gmina`: dalej, wtedy `rejon` jest pusty i generator bierze sumy gminy (`marginesyDla(g, '')`). */
export type ZapasRejonu = 'brak' | 'najblizszy' | 'gmina';

export interface WynikRejonu {
  rejon: string;
  zapas: ZapasRejonu;
}

/** Ile razy stopień długości geograficznej jest krótszy od stopnia szerokości: cos(52°) ≈ 0,62, w Polsce od 0,58
    (północ) do 0,66 (południe). Stała zamiast cosinusa, bo trygonometrii w tym module nie ma; błąd kilku
    procent nie ma znaczenia dla progu 1 km i wyboru najbliższego sąsiada. */
const SKALA_DLUGOSCI = 0.6;
/** 1 km w stopniach szerokości geograficznej (1° = 111,2 km → 0,009° ≈ 1,0 km), na kwadracie odległości. */
const PROG_KW = 0.009 * 0.009;

type Pierscienie = TabeleGminy['obrysy'][string];

/** Punkt w wielokącie, reguła parzystości po wszystkich pierścieniach (dziury działają same). Pierścień to pary
    [lat, lon], tak jak w tabelach. Porównanie `yi > y !== yj > y` gwarantuje, że `yj - yi` nie jest zerem. */
function wWielokacie(x: number, y: number, pierscienie: Pierscienie): boolean {
  let wewnatrz = false;
  for (const p of pierscienie) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0];
      const yi = p[i][1];
      const xj = p[j][0];
      const yj = p[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) wewnatrz = !wewnatrz;
    }
  }
  return wewnatrz;
}

/** Kwadrat odległości punktu od najbliższego odcinka obrysu (wszystkich pierścieni, także dziur), w stopniach
    szerokości: różnice długości mnożone przez SKALA_DLUGOSCI. */
function odlegloscKw(lat: number, lon: number, pierscienie: Pierscienie): number {
  let najmniej = Number.POSITIVE_INFINITY;
  for (const p of pierscienie) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[j][0] - lat;
      const ay = (p[j][1] - lon) * SKALA_DLUGOSCI;
      const dx = p[i][0] - p[j][0];
      const dy = (p[i][1] - p[j][1]) * SKALA_DLUGOSCI;
      const dl = dx * dx + dy * dy;
      const t = dl === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / dl));
      const ex = ax + t * dx;
      const ey = ay + t * dy;
      najmniej = Math.min(najmniej, ex * ex + ey * ey);
    }
  }
  return najmniej;
}

/** Rejon statystyczny punktu (szerokość, długość geograficzna) w gminie `g`.
    Punkt w kilku obrysach naraz (nakładki do 5 m po niezależnym uproszczeniu sąsiadów, reguła R16): wygrywa
    najniższy numer rejonu w porządku napisów, niezależnie od kolejności kluczy w tabeli.
    Poza wszystkimi obrysami: najbliższy rejon według odległości do jego obrysu, jeśli bliżej niż 1 km (przy remisie
    też najniższy numer), inaczej `gmina` z pustym numerem. */
export function rejonDla(g: TabeleGminy, lat: number, lon: number): WynikRejonu {
  const numery = Object.keys(g.obrysy);
  let trafiony = '';
  for (const rejon of numery) {
    if ((trafiony === '' || rejon < trafiony) && wWielokacie(lat, lon, g.obrysy[rejon])) trafiony = rejon;
  }
  if (trafiony !== '') return { rejon: trafiony, zapas: 'brak' };

  let najblizszy = '';
  let najmniej = PROG_KW;
  for (const rejon of numery) {
    const d = odlegloscKw(lat, lon, g.obrysy[rejon]);
    if (d < najmniej || (d === najmniej && najblizszy !== '' && rejon < najblizszy)) {
      najblizszy = rejon;
      najmniej = d;
    }
  }
  return najblizszy === '' ? { rejon: '', zapas: 'gmina' } : { rejon: najblizszy, zapas: 'najblizszy' };
}

/** Marginesy rejonu albo sumy gminy, gdy rejonu nie ma w tabeli (pusty numer z `rejonDla`, rejon bez tabeli). */
export function marginesyDla(g: TabeleGminy, rejon: string): Marginesy {
  return Object.hasOwn(g.rejony, rejon) ? g.rejony[rejon] : g.gmina;
}
