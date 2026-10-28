/* Gra z sąsiadami na karcie startowej (gra sieciowa, docs/superpowers/specs/2026-10-18-multiplayer-design.md):
   HTML bloku #siec z index.html i znaczników zajętych klatek na mapie. Czyste funkcje (testy w Node); zdarzenia
   i sieć spina src/net/gra.ts. Blok pokazuje się tylko przy włączonej sieci (src/net/flaga.ts) i działającym serwerze.

   Trzy stany bloku:
   - druzyna: gra w sieci bez formularza. Drużyna powstaje sama przy pierwszej grze na prawdziwym adresie (bez e-maila,
     nicku i hasła), więc blok mówi tylko to i daje dwie drogi z boku: pole kodu powrotu (data-siec="powrot", #scKod) dla
     kogoś, kto wraca z innej przeglądarki, oraz odnośnik do dawnego logowania nickiem (data-siec="logowanie"); pod spodem
     odnośnik do informacji o prywatności (prywatnosc.html). Gdy drużyna już jest, blok pokazuje jej znak („#12”) i zapis
     z chmury, bez wylogowania (bez kodu powrotu drużyny nie dałoby się odzyskać),
   - zalogowani: konto z nickiem jak dotąd (nick, zapis z chmury, wylogowanie),
   - logowanie: dawny formularz z nickiem i hasłem (logowanie i zakładanie konta) z przyciskiem „Wróć” (data-siec="wroc").

   Napisy w bieżącym języku (src/core/jezyk.ts) przy rysowaniu; komunikat w widoku może być Tx, więc po zmianie języka
   blok rysuje się od nowa w nowym języku (GraSieciowa.przerysuj). Nick i kod zostają takie, jak je wpisano. */

import './siec.css';
import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { esc } from './tekst.ts';

export interface WidokSieci {
  /** druzyna: bez formularza (kod powrotu, odnośniki); zalogowani: nick, wylogowanie i zapis z chmury; logowanie:
      formularz z nickiem i hasłem */
  stan: 'druzyna' | 'zalogowani' | 'logowanie';
  nick?: string;
  /** stan druzyna: znak drużyny, która już jest („#12”); bez niego drużyna powstanie przy pierwszej grze */
  znak?: string;
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
  const head = `<p class="sc-title" id="scTitle">${L('Gra z sąsiadami', 'Play with the neighbours')}</p>`;
  const chmura = v.chmura
    ? `<button type="button" class="btn go" data-siec="chmura"${off}>${L('Kontynuuj z chmury', 'Continue from the cloud')}: ${esc(v.chmura)}</button>`
    : '';
  if (v.stan === 'zalogowani') {
    const kto = L(
      `Gracie jako <b>${esc(v.nick ?? '')}</b>. Wpiszcie adres: jeśli wasza klatka jest wolna, zostaje wasza. Jeśli ktoś ją zajął, zaczynacie bez domu.`,
      `Playing as <b>${esc(v.nick ?? '')}</b>. Enter your address: if your stairwell is free, it’s yours. If someone has taken it, you start out homeless.`,
    );
    return `${head}<p class="sc-who">${kto}</p><div class="sc-row">${chmura}<button type="button" class="btn ghost" data-siec="wyloguj"${off}>${L('Wyloguj', 'Log out')}</button></div>${kom}`;
  }
  if (v.stan === 'logowanie') {
    const notka = L(
      'Konto to tylko nick i hasło, bez e-maila. Zapomniane hasło to stracone konto.',
      'An account is just a username and a password, with no email, so a forgotten password means a lost account.',
    );
    return `${head}<div class="sc-form"><input id="scNick" name="nick" autocomplete="username" placeholder="${L('nick', 'username')}" aria-label="${L('Nick', 'Username')}" maxlength="24"${off}><input id="scHaslo" name="haslo" type="password" autocomplete="current-password" placeholder="${L('hasło', 'password')}" aria-label="${L('Hasło', 'Password')}" maxlength="200"${off}><button type="button" class="btn go" data-siec="zaloguj"${off}>${L('Zaloguj', 'Log in')}</button><button type="button" class="btn" data-siec="zaloz"${off}>${L('Załóż konto', 'Create account')}</button><button type="button" class="btn ghost" data-siec="wroc"${off}>${L('Wróć', 'Back')}</button></div><p class="sc-note">${notka}</p>${kom}`;
  }
  // druzyna: bez formularza
  const opis = v.znak
    ? `<p class="sc-who">${L(
        `Gracie jako <b>drużyna ${esc(v.znak)}</b>. Wpiszcie adres: jeśli wasza klatka jest wolna, zostaje wasza. Jeśli ktoś ją zajął, zaczynacie bez domu.`,
        `Playing as <b>team ${esc(v.znak)}</b>. Enter your address: if your stairwell is free, it’s yours. If someone has taken it, you start out homeless.`,
      )}</p>`
    : `<p class="sc-note">${L(
        'Drużyna powstaje przy pierwszej grze na prawdziwym adresie, a konto nie ma e-maila ani hasła.',
        'Your team is created when you first play a real address, and the account has no email and no password.',
      )}</p>`;
  const wiersz = chmura ? `<div class="sc-row">${chmura}</div>` : '';
  const kod = `<div class="sc-kod"><label class="sc-lab" for="scKod">${L('Masz kod powrotu?', 'Have a return code?')}</label><input id="scKod" name="kod" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" maxlength="24"${off}><button type="button" class="btn" data-siec="powrot"${off}>${L('Wróć do drużyny', 'Rejoin your team')}</button></div>`;
  const linki = `<p class="sc-links"><button type="button" class="sc-link" data-siec="logowanie"${off}>${L('Mam konto z nickiem i hasłem', 'I have a username and password')}</button><a href="prywatnosc.html" class="sc-link" target="_blank" rel="noopener">${L('Prywatność', 'Privacy')}</a></p>`;
  return `${head}${opis}${wiersz}${kod}${kom}${linki}`;
}

/** napis przy znaczniku klatki na mapie (w bieżącym języku przez tr) */
export const NAPIS_ZNACZNIKA = {
  obca: tx('zajęte', 'taken'),
  nasza: tx('wasza klatka', 'your stairwell'),
  cel: tx('wolna klatka', 'free stairwell'),
} as const satisfies Record<string, Tx>;
