/* Kronika odkryć i znalezionych książek (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Odkrycie”
   i „Książki”). Symulacja trzyma odkrycia (`research.at`) i dziennik znalezisk (`bookLog`), a `govInput()` oddaje je
   zarządowi jako `GovInput.odkrycia` i `znaleziska`. `znaleziska(st, i)` czyta wpisy z tickiem nowszym niż
   `GovState.czytane` (pamięć „ostatnio przeczytanego”, pole powstaje przy pierwszym wpisie), po kolei od najstarszego:
   odkrycie to wpis „Odkrycie: <nazwa>. <działanie>” i zaufanie +1 (raz na odkrycie, jak `mood(S, 1, 0)` w 0.3),
   książka to wpis „Znaleźli książkę „<tytuł>” (Uprawa +1).” albo, gdy poszła na podpałkę, zdanie o tym. Warunek
   `tick > czytane` zakłada, że zarząd czyta wejście wyłącznie między krokami symulacji (jak robi to pętla w
   src/main.ts): wpis z tego samego ticku, który pojawiłby się po odczycie, zostałby pominięty na zawsze. Gra bez badań
   i bez książek nie dostaje tych pól, więc stan zarządu zostaje bez zmian. Zarząd nie importuje src/sim: nazwy i opisy
   technologii przychodzą w wejściu jako Tx. Teksty (`tekstOdkrycia`, `tekstKsiazki`) czyta też interfejs do podpowiedzi,
   żeby kronika i podpowiedź mówiły tym samym zdaniem. */

import { DOM_EN } from '../content/data.en.ts';
import { DOM } from '../content/data.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import type { GovInput, GovState } from './typy.ts';
import { bookEn } from './warianty-dane.en.ts';
import { logGov, mood } from './wspolne.ts';

type Odkrycie = NonNullable<GovInput['odkrycia']>[number];
type Znalezisko = NonNullable<GovInput['znaleziska']>[number];

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

/** Nowe odkrycia i znaleziska książek do kroniki, po kolei od najstarszego (przy tym samym ticku odkrycie po książce).
    Odkrycie to zaufanie +1 i ważny wpis kroniki, książka zwykły wpis. Pamięć `czytane` rośnie do ticku ostatniego
    przeczytanego wpisu. */
export function znaleziska(st: GovState, i: GovInput): void {
  const od = st.czytane ?? -1;
  const nowe: { tick: number; odkrycie: boolean; txt: Tx }[] = [
    ...(i.znaleziska ?? [])
      .filter((k) => k.tick > od)
      .map((k) => ({ tick: k.tick, odkrycie: false, txt: tekstKsiazki(k) })),
    ...(i.odkrycia ?? [])
      .filter((o) => o.tick > od)
      .map((o) => ({ tick: o.tick, odkrycie: true, txt: tekstOdkrycia(o) })),
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
