/* Wydarzenia ulicy domów i miejsc z mapy (projekt: docs/superpowers/specs/2026-10-17-wydarzenia-z-miejsca-design.md,
   punkt 6): ogród, garaże i szopy, sąsiedzi zza płotu, satyra na dzisiejszą technikę oglądaną z 2051 roku i to, co
   z niej przetrwało bakterię (szczelne: lakier, żywica, szkło). Od drugiego dnia, raz na grę, w dzień. Teksty to
   pierwszy zestaw do przeczytania przez Mateusza. */

import { g } from '../content/people.ts';
import type { GEventDef, GovHost } from './tresc.ts';

const dom = (h: GovHost) => h.place().kind === 'dom';
/** wydarzenie ulicy domów: w domu, od drugiego dnia, z sąsiadami w okolicy */
const ulica = (h: GovHost) => dom(h) && h.day() >= 2 && h.neighbour() !== null;
const W = 0.8;

export const STREET_EVENTS: GEventDef[] = [
  {
    id: 'jablka',
    once: true,
    when: ['dzien'],
    // październik: antonówki; tylko jesienią
    w: (h) => (h.season() === 0 && h.day() >= 2 ? W : 0),
    make: () => ({}),
    title: () => 'Jabłka',
    text: (h) =>
      h.place().near !== 'bloki'
        ? 'Dom za płotem stoi pusty od lat, a jabłonie w jego ogrodzie uginają się od antonówek.'
        : 'Na skwerze między blokami stare jabłonie uginają się od antonówek. Nikt ich nie zbiera.',
    choices: (h) => [
      {
        label: 'Zebrać, ile się da (Jedzenie 4)',
        ok: true,
        run: () => {
          h.addRes('jedzenie', 4);
          const p = h.rested();
          if (p) h.needsOf(p.id, { rest: -8 });
          h.log('Antonówki leżą w skrzynkach przy kozie. Starczy na kompot i na zimę.');
        },
      },
      {
        label: 'Podzielić się z sąsiadami (Jedzenie 2)',
        ok: true,
        run: () => {
          h.addRes('jedzenie', 2);
          h.mood(2, 0);
          h.log('Połowa skrzynek poszła do sąsiadów. Zapamiętają to.');
        },
      },
    ],
  },
  {
    id: 'kury',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) && h.holes() > 0 ? W : 0),
    make: () => ({}),
    title: () => 'Kury sąsiadów',
    text: (h) => `Przez dziurę ${h.weakName()} weszły do ogrodu trzy kury sąsiadów. Jedna zniosła jajko pod schodami.`,
    choices: (h) => [
      {
        label: 'Odnieść kury i jajko',
        ok: true,
        run: () => {
          h.mood(2, 0);
          h.log('Kury wróciły za płot. Sąsiedzi dziękują i pytają, czy nie trzeba wam jajek.');
        },
      },
      {
        label: 'Zatrzymać jajko',
        ok: true,
        run: () => {
          h.addRes('jedzenie', 1);
          h.mood(0, 1);
          h.log('Jajko poszło na śniadanie. Sąsiedzi liczą kury dwa razy dziennie.');
        },
      },
      {
        label: 'Załatać dziurę (Złom 2)',
        ok: h.res.zlom >= 2,
        run: () => {
          h.pay({ zlom: 2 });
          h.patchHole();
          h.log('Dziura załatana. Kury muszą szukać innej drogi.');
        },
      },
    ],
  },
  {
    id: 'kosiarka',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => 'Robot koszący',
    text: () =>
      'W ogrodzie obok od 2048 roku jeździ robot koszący. Trawnik ma równy jak w reklamie, ale co godzinę piszczy, że trzeba zaktualizować mapę ogrodu.',
    choices: (h) => [
      {
        label: 'Rozebrać na części (Części 2)',
        ok: true,
        run: () => {
          h.addRes('czesci', 2);
          h.log('W środku silnik pod lakierem, cały, i akumulator w żywicy. Reszta kabli zielona od bakterii.');
        },
      },
      {
        label: 'Niech kosi',
        ok: true,
        run: () => {
          h.mood(1, -1);
          h.log('Robot kosi dalej. Dzieciaki z ulicy jeżdżą na nim jak na kucyku.');
        },
      },
    ],
  },
  {
    id: 'szopa',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => 'Szopa po sąsiedzie',
    text: () =>
      'W szopie w ogrodzie obok wiszą narzędzia i leży stos suchych desek. Sąsiad wyjechał do syna w 2034 roku i już nie wrócił.',
    choices: (h) => [
      {
        label: 'Zabrać deski na opał (Drewno 3)',
        ok: true,
        run: () => {
          h.addRes('opal', 3);
          h.log('Deski z szopy leżą przy kozie. Suche, palą się jak papier.');
        },
      },
      {
        label: 'Zabrać narzędzia na złom (Złom 3)',
        ok: true,
        run: () => {
          h.addRes('zlom', 3);
          h.log('Narzędzia poszły na złom. Piła była za tępa, żeby jej żałować.');
        },
      },
      { label: 'Zostawić, to nie nasze', ok: true, run: () => h.mood(1, 0) },
    ],
  },
  {
    id: 'plot',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) && h.place().near === 'domy' ? W : 0),
    make: () => ({}),
    title: () => 'Spór o płot',
    text: () =>
      'Sąsiad zza płotu przyszedł z mapą z geodezji z 2019 roku. Mówi, że wasza siatka stoi metr na jego działce, i chce ją przesunąć jeszcze dziś.',
    choices: (h) => [
      {
        label: 'Przesunąć siatkę o metr',
        ok: true,
        run: () => {
          h.mood(1, 1);
          h.log('Siatka przesunięta o metr. Sąsiad mierzył trzy razy.');
        },
      },
      {
        label: 'Dać mu drewno na zgodę (Drewno 2)',
        ok: h.res.opal >= 2,
        run: () => {
          h.addRes('opal', -2);
          h.mood(2, 0);
          h.log('Sąsiad wziął drewno i zapomniał o mapie.');
        },
      },
      {
        label: 'Powiedzieć, że geodeta już nie przyjedzie',
        ok: true,
        run: () => {
          h.mood(-1, -1);
          h.log('Sąsiad poszedł, ale mapę zostawił na płocie.');
        },
      },
    ],
  },
  {
    id: 'panele',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => 'Panele u sąsiada',
    text: () =>
      'Na dachu domu obok panele dalej łapią słońce, bo ogniwa zalane szkłem przeżyły bakterię. W garażu falownik miga na czerwono: „Wymagana aktywna subskrypcja”.',
    choices: (h) => [
      {
        label: 'Rozkręcić falownik na części (Części 2)',
        ok: true,
        run: () => {
          h.addRes('czesci', 2);
          h.log('Z falownika zostały płytki w żywicy, całe. Panele dalej świecą do nikogo.');
        },
      },
      {
        label: 'Zostawić, przyda się, kiedy znajdzie się elektryk',
        ok: true,
        run: () => {
          h.mood(1, 0);
          h.log('Na drzwiach garażu kartka: „Nie ruszać. Prąd będzie.”');
        },
      },
    ],
  },
  {
    id: 'przychodnia',
    once: true,
    when: ['dzien'],
    // przychodnia albo apteka z mapy w okolicy
    w: (h) => (h.place().clinic !== null && h.day() >= 2 ? W : 0),
    make: () => ({}),
    title: () => 'Kartka na przychodni',
    text: () =>
      'Na drzwiach przychodni wisi kartka: „Rejestracja tylko przez aplikację”. Od 2041 roku nikt jej nie zdjął, a w środku podobno zostały apteczki.',
    choices: (h) => [
      {
        label: 'Wysłać kogoś po apteczki (Leki 1)',
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (!p) return;
          h.needsOf(p.id, { rest: -10 });
          h.addRes('leki', 1);
          h.log(`${p.name} ${g(p, 'przyniósł', 'przyniosła')} z przychodni dwie apteczki. Jedna była pusta.`);
        },
      },
      { label: 'Nie ryzykować', ok: true, run: () => {} },
    ],
  },
];
