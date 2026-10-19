/* Kronika odkryć, znalezionych książek i przepadłych poleceń (docs/superpowers/specs/2026-10-19-badania-design.md,
   sekcje „Odkrycie” i „Książki”). Symulacja trzyma odkrycia (`research.at`), dziennik znalezisk (`bookLog`) i dziennik
   poleceń, które przepadły po trzech przerwaniach przez wroga (`przerwane`, z tym, kto przerwał ostatni raz), a
   `govInput()` oddaje je zarządowi jako `GovInput.odkrycia`, `znaleziska` i `przerwane`. `znaleziska(st, i)` czyta
   wpisy z tickiem nowszym niż `GovState.czytane` (pamięć „ostatnio przeczytanego”, pole powstaje przy pierwszym
   wpisie), po kolei od najstarszego: odkrycie to wpis „Odkrycie: <nazwa>. <działanie>” i zaufanie +1 (raz na odkrycie,
   jak `mood(S, 1, 0)` w 0.3), książka to wpis „Znaleźli książkę „<tytuł>” (Uprawa +1).” albo, gdy poszła na podpałkę,
   zdanie o tym, przepadłe polecenie to zwykły wpis „<imię> przerywa: <co> (szwendacze).” (w nawiasie szwendacze,
   szabrownicy albo napastnicy, wedle tego, kto przerwał; bez zaufania i wkurzenia). Warunek `tick > czytane` zakłada,
   że zarząd czyta wejście wyłącznie między krokami symulacji (jak robi to pętla w src/main.ts): wpis z tego samego
   ticku, który pojawiłby się po odczycie, zostałby pominięty na zawsze. Gra bez badań i bez książek nie dostaje tych
   pól, więc stan zarządu zostaje bez zmian. Zarząd nie importuje src/sim: nazwy i opisy technologii przychodzą w
   wejściu jako Tx. Teksty (`tekstOdkrycia`, `tekstKsiazki`) czyta też interfejs do podpowiedzi, żeby kronika i
   podpowiedź mówiły tym samym zdaniem. */

import { DOM_EN } from '../content/data.en.ts';
import { DOM } from '../content/data.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import type { GovInput, GovState } from './typy.ts';
import { bookEn } from './warianty-dane.en.ts';
import { logGov, mood } from './wspolne.ts';

type Odkrycie = NonNullable<GovInput['odkrycia']>[number];
type Znalezisko = NonNullable<GovInput['znaleziska']>[number];
type Przerwane = NonNullable<GovInput['przerwane']>[number];

/** co robiła osoba, której polecenie przepadło (klucz z GovInput.przerwane), do zdania „<imię> przerywa: <co> (szwendacze).”;
    rzeczownik po polsku i po angielsku. Klucze to rodzaje komend gracza (Sim POLECENIA_WZNAWIANE), przy wraku z dopiskiem. */
const CO_PRZERWALA: Record<string, readonly [string, string]> = {
  move: ['marsz na miejsce', 'walking to the spot'],
  chop: ['ścinanie drzewa', 'felling a tree'],
  haul: ['noszenie drewna', 'hauling wood'],
  refuel: ['dokładanie do paleniska', 'feeding the stove'],
  burn: ['rozbieranie mebla na opał', 'breaking up furniture for fuel'],
  cook: ['gotowanie', 'cooking'],
  patch: ['łatanie siatki', 'patching the fence'],
  campfire: ['rozpalanie ogniska', 'lighting a campfire'],
  finish: ['dobijanie zwłok', 'putting down a body'],
  craft: ['robienie dzidy', 'making a spear'],
  brace: ['wzmacnianie siatki', 'reinforcing the fence'],
  search: ['przeszukiwanie pomieszczenia', 'searching a room'],
  dismantle: ['rozbiórka', 'dismantling'],
  repair: ['naprawa', 'repairs'],
  claim: ['zajmowanie mieszkania', 'claiming a flat'],
  build: ['budowa', 'building'],
  wreck: ['praca przy wraku', 'working on a wreck'],
  'wreck:szukaj': ['przeszukiwanie wraku', 'searching a wreck'],
  'wreck:rozbierz': ['rozbiórka wraku', 'stripping a wreck'],
  carry: ['noszenie łupu', 'hauling loot'],
  saw: ['praca w warsztacie', 'working at the workshop'],
  study: ['badania', 'research'],
  open: ['otwieranie drzwi', 'opening a door'],
  knock: ['pukanie do drzwi', 'knocking at a door'],
  force: ['wyważanie drzwi', 'forcing a door'],
  board: ['zabijanie drzwi deskami', 'boarding up a door'],
  unboard: ['odbijanie desek z drzwi', 'pulling boards off a door'],
  loot: ['przeszukiwanie cudzego pomieszczenia', 'searching a neighbour’s room'],
  upstairs: ['przeszukiwanie piętra', 'searching the next floor'],
  enclose: ['stawianie wspólnego płotu', 'building a shared fence'],
  trade: ['wymiana z handlarzem', 'trading'],
  rob: ['napaść na handlarza', 'robbing the trader'],
  talk: ['rozmowa z wędrowcem', 'talking to the wanderer'],
  mug: ['napaść na wędrowca', 'mugging the wanderer'],
  shoo: ['przeganianie obcej ekipy', 'driving off a crew'],
};

/** kto przerwał (słowo w nawiasie wpisu): szwendacze, szabrownicy albo wrodzy ludzie */
const KTO_PRZERWAL: Record<NonNullable<Przerwane['kto']>, readonly [string, string]> = {
  zombie: ['szwendacze', 'shamblers'],
  szabrownik: ['szabrownicy', 'looters'],
  wrogi: ['napastnicy', 'attackers'],
};

/** wpis o przepadłym poleceniu: „<imię> przerywa: <co> (szwendacze).”; bez `kto` (i dla szwendaczy) szwendacze,
    szabrownicy i napastnicy mają własne słowo */
export function tekstPrzerwania(k: Pick<Przerwane, 'imie' | 'co' | 'kto'>): Tx {
  const [pl, en] = CO_PRZERWALA[k.co] ?? ['polecenie', 'the order'];
  const [kpl, ken] = KTO_PRZERWAL[k.kto ?? 'zombie'] ?? KTO_PRZERWAL.zombie;
  return tx(`${k.imie} przerywa: ${pl} (${kpl}).`, `${k.imie} breaks off: ${en} (${ken}).`);
}

/** wpis o odkryciu: „Odkrycie: <nazwa>. <działanie>” */
export function tekstOdkrycia(o: Pick<Odkrycie, 'nazwa' | 'dzialanie'>): Tx {
  return tx(`Odkrycie: ${o.nazwa.pl}. ${o.dzialanie.pl}`, `Discovery: ${o.nazwa.en}. ${o.dzialanie.en}`);
}

/** zdanie o znalezionej książce: „Znaleźli książkę „<tytuł>” (Uprawa +1).”; trzecia z dziedziny mówi, że poszła na
    podpałkę */
export function tekstKsiazki(k: Pick<Znalezisko, 'dom' | 'tytul' | 'podpalka'>): Tx {
  const en = bookEn(k.tytul);
  return k.podpalka
    ? tx(
        `Znaleźli książkę „${k.tytul}”, ale ${DOM[k.dom]} ma już dwie książki. Poszła na podpałkę.`,
        `Found a book: “${en}”, but ${DOM_EN[k.dom]} already has two. It went for kindling.`,
      )
    : tx(`Znaleźli książkę „${k.tytul}” (${DOM[k.dom]} +1).`, `Found a book: “${en}” (${DOM_EN[k.dom]} +1).`);
}

/** Nowe odkrycia, znaleziska książek i przepadłe polecenia do kroniki, po kolei od najstarszego (przy tym samym ticku
    książka, odkrycie, przerwane polecenie). Odkrycie to zaufanie +1 i ważny wpis kroniki, książka i przerwane polecenie
    zwykły wpis. Pamięć `czytane` rośnie do ticku ostatniego przeczytanego wpisu. */
export function znaleziska(st: GovState, i: GovInput): void {
  const od = st.czytane ?? -1;
  const nowe: { tick: number; odkrycie: boolean; txt: Tx }[] = [
    ...(i.znaleziska ?? [])
      .filter((k) => k.tick > od)
      .map((k) => ({ tick: k.tick, odkrycie: false, txt: tekstKsiazki(k) })),
    ...(i.odkrycia ?? [])
      .filter((o) => o.tick > od)
      .map((o) => ({ tick: o.tick, odkrycie: true, txt: tekstOdkrycia(o) })),
    ...(i.przerwane ?? [])
      .filter((k) => k.tick > od)
      .map((k) => ({ tick: k.tick, odkrycie: false, txt: tekstPrzerwania(k) })),
  ];
  if (!nowe.length) return;
  // sort stabilny: przy tym samym ticku zostaje kolejność powyżej (książki przed odkryciami)
  nowe.sort((a, b) => a.tick - b.tick);
  for (const n of nowe) {
    if (n.odkrycie) mood(st, 1, 0);
    // tylko do kroniki, bez fx.log: kartę „Odkrycie” i podpowiedź o książce pokazuje interfejs sam, więc zarząd nie dokłada
    // drugiej (długiej) podpowiedzi z tym samym zdaniem
    logGov(st, i, n.txt, n.odkrycie);
  }
  st.czytane = nowe[nowe.length - 1].tick;
}
