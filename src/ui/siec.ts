/* Gra z sąsiadami na karcie startowej (gra sieciowa, docs/superpowers/specs/2026-10-18-multiplayer-design.md):
   HTML bloku #siec z index.html i znaczników zajętych klatek na mapie. Czyste funkcje (testy w Node); zdarzenia
   i sieć spina src/net/gra.ts. Blok pokazuje się tylko przy włączonej sieci (src/net/flaga.ts) i działającym serwerze.

   Trzy stany bloku:
   - druzyna: gra w sieci bez formularza. Drużyna powstaje sama przy pierwszej grze na prawdziwym adresie (bez e-maila,
     nicku i hasła), więc blok mówi tylko to i daje dwie drogi z boku: pole kodu powrotu (data-siec="powrot", #scKod) dla
     kogoś, kto wraca z innej przeglądarki, oraz odnośnik do dawnego logowania nickiem (data-siec="logowanie"); pod spodem
     odnośniki do informacji o prywatności (prywatnosc.html) i regulaminu (regulamin.html), oba z public/. Gdy drużyna już jest, blok pokazuje jej znak („#12”) i zapis
     z chmury, bez wylogowania (bez kodu powrotu drużyny nie dałoby się odzyskać),
   - zalogowani: konto z nickiem jak dotąd (nick, zapis z chmury, wylogowanie),
   - logowanie: dawny formularz z nickiem i hasłem (logowanie i zakładanie konta) z przyciskiem „Wróć” (data-siec="wroc").

   Napisy w bieżącym języku (src/core/jezyk.ts) przy rysowaniu; komunikat w widoku może być Tx, więc po zmianie języka
   blok rysuje się od nowa w nowym języku (GraSieciowa.przerysuj). Nick i kod zostają takie, jak je wpisano.

   W grze (nie na karcie startowej) ten moduł daje jeszcze dwa okna Menu i kopiowanie kodu, wszystko jako czyste
   funkcje bez DOM, które obsługuje main.ts:
   - kodSheet: kod powrotu drużyny dużą czcionką z przyciskiem kopiowania (`kod-kopiuj`) i zamknięciem (`kod-ok`, jedyne
     zamknięcie okna z kodem: serwer pokazuje kod raz); bez kodu (serwer nie odpowiedział) pokazuje powód i przypomina,
     że kod jest w Menu, a Esc też zamyka. Pokazuje się raz po pierwszym porannym raporcie drużyny anonimowej i na
     żądanie z Menu (`menu-kod`),
   - usunSheet (tone `usun`): pytanie o usunięcie drużyny z serwera (`usun-tak`, `usun-nie`) z powodem porażki, gdy
     serwer odmówił,
   - kopiujKod: kod do schowka, a gdy schowka brak albo odmawia (brak zgody, strona bez https), zaznaczenie tekstu
     kodu bez żadnego błędu na ekranie. */

import './siec.css';
import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { btn, type Sheet } from './okna.ts';
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
  const linki = `<p class="sc-links"><button type="button" class="sc-link" data-siec="logowanie"${off}>${L('Mam konto z nickiem i hasłem', 'I have a username and password')}</button><a href="prywatnosc.html" class="sc-link" target="_blank" rel="noopener">${L('Prywatność', 'Privacy')}</a><a href="regulamin.html" class="sc-link" target="_blank" rel="noopener">${L('Regulamin', 'Terms')}</a></p>`;
  return `${head}${opis}${wiersz}${kod}${kom}${linki}`;
}

/** napis przy znaczniku klatki na mapie (w bieżącym języku przez tr) */
export const NAPIS_ZNACZNIKA = {
  obca: tx('zajęte', 'taken'),
  nasza: tx('wasza klatka', 'your stairwell'),
  cel: tx('wolna klatka', 'free stairwell'),
} as const satisfies Record<string, Tx>;

/** Okno z kodem powrotu drużyny (Menu i pierwszy poranek). `kod` null: serwer nie dał kodu, `blad` mówi czemu (Tx albo
    napis), a kod wciąż można wziąć z Menu; takie okno zamyka też Esc. Ostrzeżenie o unieważnieniu jest w oknie, bo każdy
    nowy kod wyłącza stary. */
export function kodSheet(kod: string | null, blad?: Tx | string): Sheet {
  const kicker = L('Gra z sąsiadami', 'Play with the neighbours');
  const title = L('Kod powrotu drużyny', 'Team return code');
  if (kod === null) {
    const powod = tr(blad ?? tx('Nie udało się pobrać kodu powrotu.', 'Could not get the return code.'));
    return {
      tone: 'menu',
      kicker,
      title,
      body: `<p class="kod-blad" role="alert">${esc(powod)}</p><p>${L(
        'Kod powrotu możecie wziąć w każdej chwili z Menu.',
        'You can get a return code from the Menu at any time.',
      )}</p>`,
      foot: btn('kod-ok', L('Zamknij', 'Close'), 'btn go'),
      closable: true,
    };
  }
  return {
    tone: 'menu',
    kicker,
    title,
    body: `<p class="kod-wartosc"><code class="kod-kod" id="kodWartosc">${esc(kod)}</code></p><p>${L(
      'Zapiszcie go. Z tym kodem wrócicie do drużyny w innej przeglądarce. Nowy kod unieważnia poprzedni.',
      'Write it down. This code brings you back to your team in another browser. A new code invalidates the previous one.',
    )}</p>`,
    foot: `${btn('kod-kopiuj', L('Kopiuj', 'Copy'), 'btn')}${btn('kod-ok', L('Zapisane', 'Saved it'), 'btn go')}`,
    // z kodem tylko przycisk zamyka okno: serwer pokazuje kod raz, więc przypadkowy Esc albo klik obok nie może go zabrać
    closable: false,
  };
}

/** Pytanie o usunięcie drużyny anonimowej z serwera (z Menu). `blad`: powód, dla którego poprzednia próba się nie udała. */
export function usunSheet(blad?: Tx | string): Sheet {
  return {
    tone: 'usun',
    kicker: L('Na pewno?', 'Are you sure?'),
    title: L('Usunąć drużynę z serwera?', 'Delete the team from the server?'),
    body: `<p>${L(
      'Z serwera znikną klatki drużyny, zapis w chmurze i kod powrotu. Ta gra toczy się dalej w tej przeglądarce, ale bez sieci.',
      'The team’s stairwells, cloud save and return code disappear from the server. This game carries on in this browser, but offline.',
    )}</p><p>${L('Tego nie da się cofnąć.', 'This cannot be undone.')}</p>${
      blad ? `<p class="kod-blad" role="alert">${esc(tr(blad))}</p>` : ''
    }`,
    foot: `${btn('usun-nie', L('Nie', 'No'), 'btn ghost')}${btn('usun-tak', L('Usuń drużynę', 'Delete the team'), 'btn go')}`,
    closable: true,
  };
}

/** Kopiuje kod do schowka. Gdy schowka nie ma albo odmawia (brak zgody, strona bez https), woła `zaznacz` (zaznaczenie
    tekstu kodu, żeby gracz skopiował go sam) i nie zgłasza żadnego błędu. Prawda tylko wtedy, gdy kod trafił do schowka. */
export async function kopiujKod(
  kod: string,
  schowek: { writeText(tekst: string): Promise<void> } | undefined,
  zaznacz: () => void,
): Promise<boolean> {
  try {
    if (schowek) {
      await schowek.writeText(kod);
      return true;
    }
  } catch {
    // schowek odmówił: zostaje zaznaczenie
  }
  zaznacz();
  return false;
}
