/* Gra z sąsiadami na karcie startowej (gra sieciowa, etap 2, docs/superpowers/specs/2026-10-18-multiplayer-design.md):
   HTML bloku #siec z index.html i znaczników zajętych klatek na mapie. Czyste funkcje (testy w Node); zdarzenia
   i sieć spina src/net/gra.ts. Blok pokazuje się tylko z ?siec=1 w adresie strony i przy działającym serwerze,
   bo informację o danych osobowych i administratora danych musi jeszcze dać Mateusz.

   Napisy w bieżącym języku (src/core/jezyk.ts) przy rysowaniu; komunikat w widoku może być Tx, więc po zmianie języka
   blok rysuje się od nowa w nowym języku (GraSieciowa.przerysuj). Nick zostaje taki, jak go wpisano. */

import './siec.css';
import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { esc } from './tekst.ts';

export interface WidokSieci {
  /** wylogowani: formularz; zalogowani: nick, wylogowanie i zapis z chmury */
  stan: 'wylogowani' | 'zalogowani';
  nick?: string;
  /** opis zapisu w chmurze („Lanciego, dzień 2, 06:40”), gdy jest */
  chmura?: string | null;
  /** komunikat dla gracza (błąd albo co się stało); Tx w obu językach albo napis */
  komunikat?: Tx | string;
  /** żądanie w toku: przyciski wyłączone */
  czeka?: boolean;
}

/** HTML bloku „Gra z sąsiadami” */
export function htmlSieci(v: WidokSieci): string {
  const off = v.czeka ? ' disabled' : '';
  const kom = v.komunikat ? `<p class="sc-msg" role="status">${esc(tr(v.komunikat))}</p>` : '';
  const head = `<p class="sc-title" id="scTitle">${L('Gra z sąsiadami', 'Play with the neighbours')} <small>${L('próba', 'beta')}</small></p>`;
  if (v.stan === 'zalogowani') {
    const chmura = v.chmura
      ? `<button type="button" class="btn go" data-siec="chmura"${off}>${L('Kontynuuj z chmury', 'Continue from the cloud')}: ${esc(v.chmura)}</button>`
      : '';
    const kto = L(
      `Gracie jako <b>${esc(v.nick ?? '')}</b>. Wpiszcie adres: jeśli wasza klatka jest wolna, zostaje wasza. Jeśli ktoś ją zajął, zaczynacie bez domu.`,
      `Playing as <b>${esc(v.nick ?? '')}</b>. Enter your address: if your stairwell is free, it’s yours. If someone has taken it, you start out homeless.`,
    );
    return `${head}<p class="sc-who">${kto}</p><div class="sc-row">${chmura}<button type="button" class="btn ghost" data-siec="wyloguj"${off}>${L('Wyloguj', 'Log out')}</button></div>${kom}`;
  }
  const notka = L(
    'Konto to tylko nick i hasło, bez e-maila. Zapomniane hasło to stracone konto.',
    'An account is just a username and a password, with no email, so a forgotten password means a lost account.',
  );
  return `${head}<div class="sc-form"><input id="scNick" name="nick" autocomplete="username" placeholder="${L('nick', 'username')}" aria-label="${L('Nick', 'Username')}" maxlength="24"${off}><input id="scHaslo" name="haslo" type="password" autocomplete="current-password" placeholder="${L('hasło', 'password')}" aria-label="${L('Hasło', 'Password')}" maxlength="200"${off}><button type="button" class="btn go" data-siec="zaloguj"${off}>${L('Zaloguj', 'Log in')}</button><button type="button" class="btn" data-siec="zaloz"${off}>${L('Załóż konto', 'Create account')}</button></div><p class="sc-note">${notka}</p>${kom}`;
}

/** napis przy znaczniku klatki na mapie (w bieżącym języku przez tr) */
export const NAPIS_ZNACZNIKA = {
  obca: tx('zajęte', 'taken'),
  nasza: tx('wasza klatka', 'your stairwell'),
  cel: tx('wolna klatka', 'free stairwell'),
} as const satisfies Record<string, Tx>;
