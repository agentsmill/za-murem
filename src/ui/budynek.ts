/* Karta sąsiedniego budynku (M2 fala 2, docs/M2-fala-2.md): po kliknięciu w cudzy budynek bez zaznaczonego zarządu, jak
   karta mieszkania siedziby. Mówi, co zarząd wie: rodzaj i wysokość budynku, znajomych lokatorów (w zwykłym trybie trzy
   najbliższe domy i bloki), drzwi na zewnątrz, gdy ktoś ich już dotknął, ile pomieszczeń przeszukano w otwartym
   budynku i jak się do niego dobrać. Czego zarząd nie widział, tego karta nie zdradza: stan znajomych tylko po
   spotkaniu albo gdy to my ich przyjęliśmy lub wypędziliśmy, a nieznanych lokatorów karta nie liczy.
   widokBudynku czyta wpis budynku z gry albo podgląd z symulacji (ten sam wpis, który powstanie przy pierwszym
   dotknięciu, bez zapisu w stanie); kartaBudynku robi z niego HTML w bieżącym języku (tr; nazwa budynku z mapy i zawody po angielsku). Napisy
   z src/content/napisy-sasiedzi.ts. */

import type { BuildingClass } from '../content/data.ts';
import { BUDYNEK, ileTekst, KARTA } from '../content/napisy-sasiedzi.ts';
import { tr } from '../core/jezyk.ts';
import { dayOf } from '../sim/clock.ts';
import {
  drzwiBudynku,
  type Gdzie,
  mieszkalny,
  pietraBudynku,
  procentPlotu,
  type SasiedniBudynek,
  type StanDrzwi,
  wnetrze,
} from '../sim/sasiedzi.ts';
import type { PlotStan } from '../sim/sim.ts';
import type { World } from '../world/world.ts';
import { esc } from './tekst.ts';

export interface ZnajomiWidok {
  osoby: { name: string; age: number; prof: string }[];
  /** numer klatki (wejścia) w bloku z kilkoma wejściami, inaczej −1 */
  klatka: number;
  /** co z nimi, gdy to wiemy (spotkani, przyjęci albo wypędzeni), inaczej null */
  gdzie: Gdzie | null;
}

export interface WidokBudynku {
  name: string;
  cls: BuildingClass;
  levels: number;
  mieszkalny: boolean;
  /** ktoś z zarządu dotknął już drzwi (jest wpis w grze) */
  dotkniety: boolean;
  otwarty: boolean;
  /** drzwi na zewnątrz po stanie, gdy wpis jest w grze */
  drzwi: Partial<Record<StanDrzwi, number>> | null;
  /** przeszukane pomieszczenia i wszystkie do przeszukania w otwartym budynku */
  pokoje: { n: number; z: number } | null;
  /** etap 3: budynek za wspólnym płotem albo płot w budowie (procent pracy) */
  plot: { otoczony: boolean; pct: number | null };
  /** etap 2: przeszukane piętra (w otwartym budynku z piętrami) i ostatni nocny gość (dzień gry, kto, co zniknęło) */
  pietra: { n: number; z: number } | null;
  noc: { dzien: number; kto: 'szabrownicy' | 'szwendacze'; zabrali: Partial<Record<string, number>> } | null;
  znajomi: ZnajomiWidok[];
}

/** widok karty z wpisu budynku (z gry albo z podglądu); dotkniety: wpis jest w stanie gry; plot: wspólny płot ze stanu */
export function widokBudynku(w: World, b: SasiedniBudynek, dotkniety: boolean, plot?: PlotStan): WidokBudynku {
  const B = w.buildings[b.bid];
  const it = wnetrze(w, b.bid);
  const multi = B.entrances.length > 1;
  const drzwi: Partial<Record<StanDrzwi, number>> = {};
  for (const d of drzwiBudynku(w, b.bid).zewn) {
    const s = b.drzwi.find((x) => x.t === d.tile)?.s ?? 'zamkniete';
    drzwi[s] = (drzwi[s] ?? 0) + 1;
  }
  let n = b.przeszukane.length;
  for (const m of b.mieszkania) n += m.przeszukane.length;
  return {
    name: B.name,
    cls: B.cls,
    levels: B.levels,
    mieszkalny: mieszkalny(w, b.bid),
    dotkniety,
    otwarty: b.otwarty,
    drzwi: dotkniety ? drzwi : null,
    pokoje: b.otwarty ? { n, z: it.rooms.length } : null,
    plot: {
      otoczony: !!plot?.bids.includes(b.bid),
      pct: plot?.plan?.bid === b.bid ? procentPlotu(plot.plan) : null,
    },
    pietra: b.otwarty && pietraBudynku(w, b.bid) > 0 ? { n: b.pietra, z: pietraBudynku(w, b.bid) } : null,
    noc: b.noc ? { dzien: dayOf(b.noc.tick), kto: b.noc.kto, zabrali: b.noc.zabrali } : null,
    znajomi: b.domy
      .filter((g) => g.znani || g.ludzie)
      .map((g) => ({
        osoby: g.osoby.map((o) => ({ name: o.name, age: o.age, prof: o.prof })),
        klatka: multi ? g.klatka : -1,
        gdzie: g.ludzie || g.gdzie === 'u_nas' || g.gdzie === 'odeszli' ? g.gdzie : null,
      })),
  };
}

/** HTML karty budynku do panelu karty (jak karta mieszkania), w bieżącym języku */
export function kartaBudynku(v: WidokBudynku, touch: boolean): string {
  const sub = [tr(BUDYNEK.rodzaj(v.cls)), v.cls === 'blok' && v.levels > 1 ? tr(BUDYNEK.pietra(v.levels)) : '']
    .filter(Boolean)
    .join(', ');
  const people = v.znajomi.length
    ? `<h3 class="apt-h">${esc(tr(BUDYNEK.znacieStad))}</h3><ul class="apt-list">${v.znajomi
        .map((z) => {
          const names = z.osoby.map((o) => tr(KARTA.osoba(o.name, o.age, o.prof))).join('; ');
          const where = [z.klatka >= 0 ? tr(BUDYNEK.klatka(z.klatka)) : '', z.gdzie ? tr(BUDYNEK.gdzie(z.gdzie)) : '']
            .filter(Boolean)
            .join(', ');
          return `<li class="apt-i"><span>${esc(names)}</span>${where ? `<b class="apt-c">${esc(where)}</b>` : ''}</li>`;
        })
        .join('')}</ul>`
    : '';
  const unknown = v.mieszkalny
    ? `<p class="apt-none">${esc(tr(v.znajomi.length ? BUDYNEK.wiecejLudzi : BUDYNEK.nieWiecie))}</p>`
    : `<p class="apt-none">${esc(tr(BUDYNEK.bezMieszkan))}</p>`;
  return [
    `<h2>${esc(tr(BUDYNEK.nazwa(v.name)))}</h2>`,
    `<p class="sub">${esc(sub)}</p>`,
    people,
    unknown,
    v.drzwi ? `<p class="apt-why">${esc(tr(BUDYNEK.drzwi(v.drzwi)))}</p>` : '',
    v.pokoje
      ? `<p class="apt-why">${esc(tr(BUDYNEK.przeszukane(v.pokoje.n, v.pokoje.z)))}</p>`
      : `<p class="apt-why">${esc(tr(BUDYNEK.zamkniety))}</p>`,
    v.plot.otoczony ? `<p class="apt-why">${esc(tr(BUDYNEK.otoczony))}</p>` : '',
    v.plot.pct !== null ? `<p class="apt-why">${esc(tr(BUDYNEK.plotPlan(v.plot.pct)))}</p>` : '',
    v.pietra ? `<p class="apt-why">${esc(tr(BUDYNEK.pietraPrzeszukane(v.pietra.n, v.pietra.z)))}</p>` : '',
    v.noc ? `<p class="apt-why">${esc(tr(BUDYNEK.noc(v.noc.dzien, v.noc.kto, ileTekst(v.noc.zabrali))))}</p>` : '',
    `<p class="doing">${esc(tr(BUDYNEK.jak(touch)))}</p>`,
  ].join('');
}
