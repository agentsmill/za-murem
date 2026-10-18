/* Karta sąsiedniego budynku (M2 fala 2, docs/M2-fala-2.md): po kliknięciu w cudzy budynek bez zaznaczonego zarządu, jak
   karta mieszkania siedziby. Mówi, co zarząd wie: rodzaj i wysokość budynku, znajomych lokatorów (w zwykłym trybie trzy
   najbliższe domy i bloki), drzwi na zewnątrz, gdy ktoś ich już dotknął, ile pomieszczeń przeszukano w otwartym
   budynku i jak się do niego dobrać. Czego zarząd nie widział, tego karta nie zdradza: stan znajomych tylko po
   spotkaniu albo gdy to my ich przyjęliśmy lub wypędziliśmy, a nieznanych lokatorów karta nie liczy.
   widokBudynku czyta wpis budynku z gry albo podgląd z symulacji (ten sam wpis, który powstanie przy pierwszym
   dotknięciu, bez zapisu w stanie); kartaBudynku robi z niego HTML. Napisy z src/content/napisy-sasiedzi.ts. */

import type { BuildingClass } from '../content/data.ts';
import { BUDYNEK, KARTA } from '../content/napisy-sasiedzi.ts';
import {
  drzwiBudynku,
  type Gdzie,
  mieszkalny,
  type SasiedniBudynek,
  type StanDrzwi,
  wnetrze,
} from '../sim/sasiedzi.ts';
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
  znajomi: ZnajomiWidok[];
}

/** widok karty z wpisu budynku (z gry albo z podglądu); dotkniety: wpis jest w stanie gry */
export function widokBudynku(w: World, b: SasiedniBudynek, dotkniety: boolean): WidokBudynku {
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
    znajomi: b.domy
      .filter((g) => g.znani || g.ludzie)
      .map((g) => ({
        osoby: g.osoby.map((o) => ({ name: o.name, age: o.age, prof: o.prof })),
        klatka: multi ? g.klatka : -1,
        gdzie: g.ludzie || g.gdzie === 'u_nas' || g.gdzie === 'odeszli' ? g.gdzie : null,
      })),
  };
}

/** HTML karty budynku do panelu karty (jak karta mieszkania) */
export function kartaBudynku(v: WidokBudynku, touch: boolean): string {
  const sub = [BUDYNEK.rodzaj(v.cls).pl, v.cls === 'blok' && v.levels > 1 ? BUDYNEK.pietra(v.levels).pl : '']
    .filter(Boolean)
    .join(', ');
  const people = v.znajomi.length
    ? `<h3 class="apt-h">${esc(BUDYNEK.znacieStad.pl)}</h3><ul class="apt-list">${v.znajomi
        .map((z) => {
          const names = z.osoby.map((o) => KARTA.osoba(o.name, o.age, o.prof).pl).join('; ');
          const where = [z.klatka >= 0 ? BUDYNEK.klatka(z.klatka).pl : '', z.gdzie ? BUDYNEK.gdzie(z.gdzie).pl : '']
            .filter(Boolean)
            .join(', ');
          return `<li class="apt-i"><span>${esc(names)}</span>${where ? `<b class="apt-c">${esc(where)}</b>` : ''}</li>`;
        })
        .join('')}</ul>`
    : '';
  const unknown = v.mieszkalny
    ? `<p class="apt-none">${esc((v.znajomi.length ? BUDYNEK.wiecejLudzi : BUDYNEK.nieWiecie).pl)}</p>`
    : `<p class="apt-none">${esc(BUDYNEK.bezMieszkan.pl)}</p>`;
  return [
    `<h2>${esc(v.name)}</h2>`,
    `<p class="sub">${esc(sub)}</p>`,
    people,
    unknown,
    v.drzwi ? `<p class="apt-why">${esc(BUDYNEK.drzwi(v.drzwi).pl)}</p>` : '',
    v.pokoje
      ? `<p class="apt-why">${esc(BUDYNEK.przeszukane(v.pokoje.n, v.pokoje.z).pl)}</p>`
      : `<p class="apt-why">${esc(BUDYNEK.zamkniety.pl)}</p>`,
    `<p class="doing">${esc(BUDYNEK.jak(touch).pl)}</p>`,
  ].join('');
}
