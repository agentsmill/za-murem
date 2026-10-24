/* Wydarzenia ulicy domów i miejsc z mapy (projekt: docs/superpowers/specs/2026-10-17-wydarzenia-z-miejsca-design.md,
   punkt 6): ogród, garaże i szopy, sąsiedzi zza płotu, satyra na dzisiejszą technikę oglądaną z 2051 roku i to, co
   z niej przetrwało bakterię (szczelne: lakier, żywica, szkło). Od drugiego dnia, raz na grę, w dzień. Teksty to
   pierwszy zestaw do przeczytania przez Mateusza. */

import { g } from '../content/people.ts';
import { tx } from '../core/jezyk.ts';
import type { GEventDef, GovHost } from './tresc.ts';

const dom = (h: GovHost) => h.place().kind === 'dom';
/** wydarzenie ulicy domów: w domu wśród domów, od drugiego dnia */
const ulica = (h: GovHost) => dom(h) && h.day() >= 2 && h.neighbours() === 'domy';
const W = 0.8;

export const STREET_EVENTS: GEventDef[] = [
  {
    id: 'jablka',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    // październik: antonówki; tylko jesienią
    w: (h) => (h.season() === 0 && h.day() >= 2 && h.neighbours() !== null ? W : 0),
    make: () => ({}),
    title: () => tx('Jabłka', 'Apples'),
    text: (h) =>
      h.neighbours() === 'domy'
        ? tx(
            'Dom za płotem stoi pusty od lat, a jabłonie w jego ogrodzie uginają się od antonówek.',
            'The house over the fence has stood empty for years, and the apple trees in its garden are bending under the Antonovkas.',
          )
        : tx(
            'Na skwerze między blokami stare jabłonie uginają się od antonówek. Nikt ich nie zbiera.',
            'On the green between the blocks, the old apple trees are bending under the Antonovkas. Nobody picks them.',
          ),
    choices: (h) => [
      {
        label: tx('Zebrać, ile się da (Jedzenie 4)', 'Pick as many as you can (Food 4)'),
        ok: true,
        run: () => {
          h.addRes('jedzenie', 4);
          const p = h.rested();
          if (p) h.needsOf(p.id, { rest: -8 });
          h.log(
            tx(
              'Antonówki leżą w skrzynkach przy kozie. Starczy na kompot i na zimę.',
              'The Antonovkas sit in crates by the stove. Enough for compote and for the winter.',
            ),
          );
        },
      },
      {
        label: tx('Podzielić się z sąsiadami (Jedzenie 2)', 'Share them with the neighbours (Food 2)'),
        ok: true,
        run: () => {
          h.addRes('jedzenie', 2);
          h.mood(2, 0);
          h.log(
            tx(
              'Połowa skrzynek poszła do sąsiadów. Zapamiętają to.',
              'Half the crates went to the neighbours. They will remember that.',
            ),
          );
        },
      },
    ],
  },
  {
    id: 'kury',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) && h.holes() > 0 ? W : 0),
    make: () => ({}),
    title: () => tx('Kury sąsiadów', 'The neighbours’ hens'),
    text: (h) => {
      const where = h.weakName();
      return tx(
        `Przez dziurę ${where.pl} weszły do ogrodu trzy kury sąsiadów. Jedna zniosła jajko pod schodami.`,
        `Three of the neighbours’ hens got into the garden through the hole ${where.en}. One of them laid an egg under the steps.`,
      );
    },
    choices: (h) => [
      {
        label: tx('Odnieść kury i jajko', 'Return the hens and the egg'),
        ok: true,
        run: () => {
          h.mood(2, 0);
          h.log(
            tx(
              'Kury wróciły za płot. Sąsiedzi dziękują i pytają, czy nie trzeba wam jajek.',
              'The hens are back over the fence. The neighbours say thanks and ask if you need any eggs.',
            ),
          );
        },
      },
      {
        label: tx('Zatrzymać jajko', 'Keep the egg'),
        ok: true,
        run: () => {
          h.addRes('jedzenie', 1);
          h.mood(0, 1);
          h.log(
            tx(
              'Jajko poszło na śniadanie. Sąsiedzi liczą kury dwa razy dziennie.',
              'The egg went into breakfast. The neighbours now count their hens twice a day.',
            ),
          );
        },
      },
      {
        label: tx('Załatać dziurę (Złom 2)', 'Patch the hole (Scrap 2)'),
        ok: h.res.zlom >= 2,
        run: () => {
          h.pay({ zlom: 2 });
          h.patchHole();
          h.log(
            tx(
              'Dziura załatana. Kury muszą szukać innej drogi.',
              'Hole patched. The hens will have to find another way.',
            ),
          );
        },
      },
    ],
  },
  {
    id: 'kosiarka',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => tx('Robot koszący', 'The robot mower'),
    text: () =>
      tx(
        'W ogrodzie obok od 2048 roku jeździ robot koszący. Trawnik ma równy jak w reklamie, ale co godzinę piszczy, że trzeba zaktualizować mapę ogrodu.',
        'A robot mower has been doing laps of the garden next door since 2048. The lawn looks like an advert, but every hour it beeps that the garden map needs an update.',
      ),
    choices: (h) => [
      {
        label: tx('Rozebrać na części (Części 2)', 'Strip it for parts (Parts 2)'),
        ok: true,
        run: () => {
          h.addRes('czesci', 2);
          h.log(
            tx(
              'W środku silnik pod lakierem, cały, i akumulator w żywicy. Reszta kabli zielona od bakterii.',
              'Inside: a lacquered motor, intact, and a battery sealed in resin. The rest of the wiring is green with the bacterium.',
            ),
          );
        },
      },
      {
        label: tx('Niech kosi', 'Let it mow'),
        ok: true,
        run: () => {
          h.mood(1, -1);
          h.log(
            tx(
              'Robot kosi dalej. Dzieciaki z ulicy jeżdżą na nim jak na kucyku.',
              'The robot keeps mowing. The kids from the street ride it like a pony.',
            ),
          );
        },
      },
    ],
  },
  {
    id: 'szopa',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => tx('Szopa po sąsiedzie', 'The neighbour’s old shed'),
    text: () =>
      tx(
        'W szopie w ogrodzie obok wiszą narzędzia i leży stos suchych desek. Sąsiad wyjechał do syna w 2034 roku i już nie wrócił.',
        'In the shed in the garden next door there are tools on the wall and a stack of dry planks. The neighbour went to stay with his son in 2034 and never came back.',
      ),
    choices: (h) => [
      {
        label: tx('Zabrać deski na opał (Drewno 3)', 'Take the planks for firewood (Wood 3)'),
        ok: true,
        run: () => {
          h.addRes('opal', 3);
          h.log(
            tx(
              'Deski z szopy leżą przy kozie. Suche, palą się jak papier.',
              'The planks from the shed are by the stove. Bone dry, they burn like paper.',
            ),
          );
        },
      },
      {
        label: tx('Zabrać narzędzia na złom (Złom 3)', 'Take the tools for scrap (Scrap 3)'),
        ok: true,
        run: () => {
          h.addRes('zlom', 3);
          h.log(
            tx(
              'Narzędzia poszły na złom. Piła była za tępa, żeby jej żałować.',
              'The tools went for scrap. The saw was too blunt to miss.',
            ),
          );
        },
      },
      { label: tx('Zostawić, to nie nasze', 'Leave it, it isn’t ours'), ok: true, run: () => h.mood(1, 0) },
    ],
  },
  {
    id: 'plot',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => tx('Spór o płot', 'A boundary dispute'),
    text: () =>
      tx(
        'Sąsiad zza płotu przyszedł z mapą z geodezji z 2019 roku. Mówi, że wasza siatka stoi metr na jego działce, i chce ją przesunąć jeszcze dziś.',
        'The neighbour from over the fence has turned up with a land survey map from 2019. He says your fence stands a metre into his plot, and he wants it moved today.',
      ),
    choices: (h) => [
      {
        label: tx('Przesunąć siatkę o metr', 'Move the fence a metre'),
        ok: true,
        run: () => {
          h.mood(1, 1);
          h.log(
            tx(
              'Siatka przesunięta o metr. Sąsiad mierzył trzy razy.',
              'The fence has moved a metre. The neighbour measured three times.',
            ),
          );
        },
      },
      {
        label: tx('Dać mu drewno na zgodę (Drewno 2)', 'Give him some wood to keep the peace (Wood 2)'),
        ok: h.res.opal >= 2,
        run: () => {
          h.addRes('opal', -2);
          h.mood(2, 0);
          h.log(
            tx('Sąsiad wziął drewno i zapomniał o mapie.', 'The neighbour took the wood and forgot all about the map.'),
          );
        },
      },
      {
        label: tx('Powiedzieć, że geodeta już nie przyjedzie', 'Tell him the surveyor isn’t coming any more'),
        ok: true,
        run: () => {
          h.mood(-1, -1);
          h.log(
            tx('Sąsiad poszedł, ale mapę zostawił na płocie.', 'The neighbour left, but pinned the map to the fence.'),
          );
        },
      },
    ],
  },
  {
    id: 'panele',
    ton: 'lagodne',
    once: true,
    when: ['dzien'],
    w: (h) => (ulica(h) ? W : 0),
    make: () => ({}),
    title: () => tx('Panele u sąsiada', 'The neighbour’s solar panels'),
    text: () =>
      tx(
        'Na dachu domu obok panele dalej łapią słońce, bo ogniwa zalane szkłem przeżyły bakterię. W garażu falownik miga na czerwono: „Wymagana aktywna subskrypcja”.',
        'On the roof next door the panels are still catching the sun, because cells sealed under glass survived the bacterium. In the garage the inverter blinks red: “Active subscription required”.',
      ),
    choices: (h) => [
      {
        label: tx('Rozkręcić falownik na części (Części 2)', 'Strip the inverter for parts (Parts 2)'),
        ok: true,
        run: () => {
          h.addRes('czesci', 2);
          h.log(
            tx(
              'Z falownika zostały płytki w żywicy, całe. Panele dalej świecą do nikogo.',
              'All that’s left of the inverter is a couple of circuit boards in resin, intact. The panels carry on soaking up the sun for nobody.',
            ),
          );
        },
      },
      {
        label: tx('Zostawić, przyda się, kiedy znajdzie się elektryk', 'Leave it for when you find an electrician'),
        ok: true,
        run: () => {
          h.mood(1, 0);
          h.log(
            tx(
              'Na drzwiach garażu kartka: „Nie ruszać. Prąd będzie.”',
              'A note on the garage door: “Do not touch. Power is coming.”',
            ),
          );
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
    title: () => tx('Kartka na przychodni', 'A notice on the clinic door'),
    text: () =>
      tx(
        'Na drzwiach przychodni wisi kartka: „Rejestracja tylko przez aplikację”. Od 2041 roku nikt jej nie zdjął, a w środku podobno zostały apteczki.',
        'A notice hangs on the clinic door: “Appointments via the app only”. Nobody has taken it down since 2041, and supposedly there are still first-aid kits inside.',
      ),
    choices: (h) => [
      {
        label: tx('Wysłać kogoś po apteczki (Leki 1)', 'Send someone for the first-aid kits (Meds 1)'),
        ok: !!h.rested(),
        run: () => {
          const p = h.rested();
          if (!p) return;
          h.needsOf(p.id, { rest: -10 });
          h.addRes('leki', 1);
          h.log(
            tx(
              `${p.name} ${g(p, 'przyniósł', 'przyniosła')} z przychodni dwie apteczki. Jedna była pusta.`,
              `${p.name} brought two first-aid kits back from the clinic. One of them was empty.`,
            ),
          );
        },
      },
      { label: tx('Nie ryzykować', 'Don’t risk it'), ok: true, run: () => {} },
    ],
  },
];
