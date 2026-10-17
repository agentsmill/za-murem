/* Budowle fali 1 M2 (docs/M2-fala-1.md): rodzaj, miejsce, rozmiar, koszt w materiałach i czas pracy.
   Kontrakt dla symulacji (właściciel), interfejsu i rysowania (tylko czytają). Koszty i czasy stroi bot. */

import { TICKS_PER_HOUR } from './clock.ts';

/** materiały z odzysku i zapasy */
export type Mat = 'drewno' | 'deski' | 'zlom' | 'czesci' | 'jedzenie' | 'leki';

export type BuildKind = 'warsztat' | 'kuchnia_spoleczna' | 'magazyn' | 'lozka_pietrowe' | 'ogrodek' | 'zasieki';

/** gdzie wolno postawić: pokój albo kuchnia w naszym mieszkaniu, podwórko za siatką, odcinek siatki */
export type BuildPlace = 'pokoj' | 'kuchnia' | 'podworko' | 'obwod';

export interface BuildDef {
  name: string;
  place: BuildPlace;
  /** rozmiar w kafelkach przy rot 0 (przy rot 1 i 3 zamienione) */
  w: number;
  h: number;
  cost: Partial<Record<Mat, number>>;
  /** praca w tickach symulacji, jeden pionek */
  work: number;
  /** jedno zdanie do menu budowy */
  effect: string;
}

export const BUILDS: Record<BuildKind, BuildDef> = {
  warsztat: {
    name: 'Warsztat',
    place: 'pokoj',
    w: 2,
    h: 1,
    cost: { deski: 4, zlom: 2 },
    work: TICKS_PER_HOUR,
    effect: 'Łaty i naprawy idą szybciej, a rozbiórka daje więcej.',
  },
  kuchnia_spoleczna: {
    name: 'Kuchnia społeczna',
    place: 'kuchnia',
    w: 2,
    h: 1,
    cost: { zlom: 3, czesci: 2 },
    work: TICKS_PER_HOUR,
    effect: 'Jedno gotowanie dla wszystkich, mniej jedzenia na osobę.',
  },
  magazyn: {
    name: 'Magazyn',
    place: 'pokoj',
    w: 2,
    h: 2,
    cost: { deski: 6 },
    work: TICKS_PER_HOUR,
    effect: 'Zapasy w magazynie trudniej ukraść przy napadzie.',
  },
  lozka_pietrowe: {
    name: 'Łóżka piętrowe',
    place: 'pokoj',
    w: 1,
    h: 2,
    cost: { deski: 4 },
    work: TICKS_PER_HOUR / 2,
    effect: 'Dwa miejsca do spania, w spółdzielni zmieści się więcej ludzi.',
  },
  ogrodek: {
    name: 'Ogródek',
    place: 'podworko',
    w: 3,
    h: 2,
    cost: { deski: 2 },
    work: TICKS_PER_HOUR / 2,
    effect: 'Po kilku dniach daje jedzenie, latem więcej, jesienią mało.',
  },
  zasieki: {
    name: 'Zasieki',
    place: 'obwod',
    w: 1,
    h: 1,
    cost: { zlom: 3 },
    work: TICKS_PER_HOUR / 4,
    effect: 'Mocniejsze od siatki, szabrownik się na nich rani.',
  },
};

/** plan budowy w toku (st.builds): materiały doniesione (have) z potrzebnych (need) i praca w tickach (work);
    by: pionek, który przy nim pracuje (−1: nikt). Gotowa budowla to rzecz w st.things o tym samym id i kind. */
export interface BuildPlan {
  id: number;
  kind: BuildKind;
  /** lewy górny kafelek i obrót (rozmiar z BUILDS, przy rot 1 i 3 zamieniony) */
  x: number;
  y: number;
  rot: number;
  need: Partial<Record<Mat, number>>;
  have: Partial<Record<Mat, number>>;
  work: number;
  by: number;
}

/** rozmiar budowli przy danym obrocie */
export function footprint(kind: BuildKind, rot: number): { w: number; h: number } {
  const d = BUILDS[kind];
  return rot % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}
