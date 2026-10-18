/* Gra z sąsiadami na karcie startowej (gra sieciowa, etap 2, docs/superpowers/specs/2026-10-18-multiplayer-design.md):
   HTML bloku #siec z index.html i znaczników zajętych klatek na mapie. Czyste funkcje (testy w Node); zdarzenia
   i sieć spina src/net/gra.ts. Blok pokazuje się tylko z ?siec=1 w adresie strony i przy działającym serwerze,
   bo informację o danych osobowych i administratora danych musi jeszcze dać Mateusz. */

import './siec.css';
import { esc } from './tekst.ts';

export interface WidokSieci {
  /** wylogowani: formularz; zalogowani: nick, wylogowanie i zapis z chmury */
  stan: 'wylogowani' | 'zalogowani';
  nick?: string;
  /** opis zapisu w chmurze („Lanciego, dzień 2, 06:40”), gdy jest */
  chmura?: string | null;
  /** komunikat dla gracza (błąd albo co się stało) */
  komunikat?: string;
  /** żądanie w toku: przyciski wyłączone */
  czeka?: boolean;
}

const NOTKA = 'Konto to tylko nick i hasło, bez e-maila. Zapomniane hasło to stracone konto.';

/** HTML bloku „Gra z sąsiadami” */
export function htmlSieci(v: WidokSieci): string {
  const off = v.czeka ? ' disabled' : '';
  const kom = v.komunikat ? `<p class="sc-msg" role="status">${esc(v.komunikat)}</p>` : '';
  const head = '<p class="sc-title" id="scTitle">Gra z sąsiadami <small>próba</small></p>';
  if (v.stan === 'zalogowani') {
    const chmura = v.chmura
      ? `<button type="button" class="btn go" data-siec="chmura"${off}>Kontynuuj z chmury: ${esc(v.chmura)}</button>`
      : '';
    return `${head}<p class="sc-who">Gracie jako <b>${esc(v.nick ?? '')}</b>. Wpiszcie adres: jeśli wasza klatka jest wolna, zostaje wasza. Jeśli ktoś ją zajął, zaczynacie bez domu.</p><div class="sc-row">${chmura}<button type="button" class="btn ghost" data-siec="wyloguj"${off}>Wyloguj</button></div>${kom}`;
  }
  return `${head}<div class="sc-form"><input id="scNick" name="nick" autocomplete="username" placeholder="nick" aria-label="Nick" maxlength="24"${off}><input id="scHaslo" name="haslo" type="password" autocomplete="current-password" placeholder="hasło" aria-label="Hasło" maxlength="200"${off}><button type="button" class="btn go" data-siec="zaloguj"${off}>Zaloguj</button><button type="button" class="btn" data-siec="zaloz"${off}>Załóż konto</button></div><p class="sc-note">${NOTKA}</p>${kom}`;
}

/** napis przy znaczniku klatki na mapie */
export const NAPIS_ZNACZNIKA = { obca: 'zajęte', nasza: 'wasza klatka', cel: 'wolna klatka' } as const;
