/* Narrator zarządu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 5): krzywa napięcia, która przestawia
   wagi kart w puli. Co krok zarządu `napiecie` czyta to, co zarząd i tak widzi, i przesuwa `GovState.napiecie.v` (0–100):
     napad z raportu rano +20 (wtargnięcie +30), zgon +25, rana +10, siatka przerwana w trybie zombie +15,
     głód zarządu (średnie jedzenie poniżej 30) +5 na godzinę gry; napięcie maleje o 2 na godzinę gry.
   `mnoznik(st, ton)` daje wagę kart z tagiem `GEventDef.ton`: powyżej 60 ostre ×0,3 i łagodne ×2; po ponad dobie gry
   spokoju (`spokoj`, minuty gry z napięciem poniżej 20) ostre ×2, a goście częściej z haczykiem (`ostrzej` → `KontekstGoscia`).
   Karty bez tagu mają ×1. Odstęp między kartami zostaje bez zmian: narrator tylko mnoży wagi.

   Kontrakt.
   - Czas w minutach gry (jak łańcuchy kart), nie w sekundach przy ekranie; spadek i głód liczy się razem jako zmiana na
     godzinę, więc wynik nie zależy od tego, jak często zarząd się liczy.
   - Każde zdarzenie liczy się raz: liczniki w stanie (`zgony`, `raport`, `siatka`, `zdrowie`, `ugryzieni`) przechodzą
     zapis i wczytanie. Pierwsze wołanie (albo stan bez liczników, np. wczytany zapis sprzed narratora) tylko ustawia
     liczniki na to, co jest teraz, niczego nie dolicza: dawne zgony nie podbijają napięcia po wczytaniu.
   - Stan `napiecie` powstaje przy pierwszym `napiecie()`; bez niego (stary zapis, świeży stan) `mnoznik` daje 1.
   - `mnoznik` i `ostrzej` niczego nie losują i niczego nie zapisują; ziarno zarządu zostaje takie, jakie było. */

import type { GEventDef } from './tresc.ts';
import type { GovInput, GovState } from './typy.ts';
import { gameMin } from './wspolne.ts';

/** napięcie, od którego (powyżej) ostre karty tracą wagę, a łagodne zyskują */
export const PROG_WYSOKIE = 60;
/** napięcie, poniżej którego liczy się spokój */
export const PROG_SPOKOJ = 20;
/** po tylu minutach gry spokoju (doba) ostre karty zyskują wagę, a goście częściej mają haczyk */
export const SPOKOJ_DOBA = 24 * 60;
/** spadek napięcia na godzinę gry */
export const SPADEK = 2;
/** waga kart ostrych i łagodnych przy wysokim napięciu */
export const WAGA_OSTRE_WYSOKIE = 0.3;
export const WAGA_LAGODNE_WYSOKIE = 2;
/** waga kart ostrych po dobie spokoju */
export const WAGA_OSTRE_SPOKOJ = 2;
/** przyrosty: napad odparty, wtargnięcie szabrowników, zgon, rana, przerwana siatka (zombie) i głód na godzinę gry */
export const NAPAD = 20;
export const WTARGNIECIE = 30;
export const ZGON = 25;
export const RANA = 10;
export const SIATKA = 15;
export const GLOD_NA_GODZINE = 5;
/** średnie jedzenie zarządu poniżej tej wartości to głód */
export const PROG_GLODU = 30;
/** nagły spadek zdrowia osoby między dwoma krokami zarządu o tyle punktów to rana (powolny głód i zimno spadają wolniej) */
export const PROG_RANY = 8;

const clamp100 = (v: number): number => Math.max(0, Math.min(100, v));

/** Przesuwa napięcie do bieżącej chwili i dolicza nowe zdarzenia (raz każde); tworzy `GovState.napiecie` przy pierwszym wołaniu. */
export function napiecie(st: GovState, i: GovInput): void {
  const t = gameMin(i);
  const n = st.napiecie ?? { v: 0, t, spokoj: 0 };
  st.napiecie = n;
  const ranni = i.people.map((p) => [p.id, p.needs.health] as const);
  const ugryzieni = i.people.filter((p) => p.bitten).map((p) => p.id);
  // pierwsze wołanie albo stan sprzed narratora: liczniki na stan teraźniejszy, bez dolicznia dawnych zdarzeń
  if (n.zgony === undefined) {
    n.t = t;
    n.zgony = i.dead?.length ?? 0;
    n.raport = st.reports.at(-1)?.day ?? 0;
    n.siatka = i.horde?.breaches ?? 0;
    n.zdrowie = Object.fromEntries(ranni);
    n.ugryzieni = ugryzieni;
    return;
  }
  const dt = Math.max(0, t - n.t);
  n.t = t;
  // zmiana na godzinę: głód zarządu (średnie jedzenie poniżej progu) kontra spadek
  const glod = i.people.length > 0 && i.people.reduce((a, p) => a + p.needs.food, 0) / i.people.length < PROG_GLODU;
  let v = clamp100(n.v + (((glod ? GLOD_NA_GODZINE : 0) - SPADEK) * dt) / 60);
  // zgony: każdy z listy raz
  const zgony = i.dead?.length ?? 0;
  if (zgony > n.zgony) v += ZGON * (zgony - n.zgony);
  n.zgony = zgony;
  // napady: raport rano o nocy, której jeszcze nie liczyliśmy (raporty idą po kolei, lista jest przycinana, więc po dniu)
  const raport = n.raport ?? 0;
  for (const r of st.reports)
    if (r.day > raport) {
      if (r.raid === 'odparty') v += NAPAD;
      else if (r.raid === 'wtargnięcie') v += WTARGNIECIE;
    }
  n.raport = Math.max(raport, st.reports.at(-1)?.day ?? 0);
  // siatka przerwana w trybie zombie: licznik przerwań od początku gry
  const siatka = i.horde?.breaches ?? 0;
  if (siatka > (n.siatka ?? 0)) v += SIATKA * (siatka - (n.siatka ?? 0));
  n.siatka = siatka;
  // rany: nagły spadek zdrowia albo świeże ugryzienie; jedna rana na osobę na krok
  const zdrowie = n.zdrowie ?? {};
  const ugr = new Set(n.ugryzieni ?? []);
  for (const p of i.people) {
    const przed = zdrowie[p.id];
    const spadek = przed !== undefined && przed - p.needs.health >= PROG_RANY;
    const ugryzienie = !!p.bitten && !ugr.has(p.id);
    if (spadek || ugryzienie) v += RANA;
  }
  n.zdrowie = Object.fromEntries(ranni);
  n.ugryzieni = ugryzieni;
  n.v = clamp100(v);
  n.spokoj = n.v < PROG_SPOKOJ ? n.spokoj + dt : 0;
}

/** Mnożnik wagi karty z danym tonem: 1 bez napięcia (stan jeszcze nie powstał), bez tonu i w środku skali; powyżej
    `PROG_WYSOKIE` ostre ×0,3 i łagodne ×2; po ponad dobie spokoju ostre ×2. Niczego nie losuje. */
export function mnoznik(st: Pick<GovState, 'napiecie'>, ton: GEventDef['ton']): number {
  const n = st.napiecie;
  if (!n || !ton) return 1;
  if (n.v > PROG_WYSOKIE) return ton === 'ostre' ? WAGA_OSTRE_WYSOKIE : WAGA_LAGODNE_WYSOKIE;
  if (n.spokoj > SPOKOJ_DOBA && ton === 'ostre') return WAGA_OSTRE_SPOKOJ;
  return 1;
}

/** Czy był długi spokój (ponad dobę gry z napięciem poniżej 20): goście wtedy częściej z haczykiem (`KontekstGoscia.ostrzej`). */
export const ostrzej = (st: Pick<GovState, 'napiecie'>): boolean => (st.napiecie?.spokoj ?? 0) > SPOKOJ_DOBA;
