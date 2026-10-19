/* Bramka determinizmu silników JS (MMO, etap 0: docs/superpowers/specs/2026-10-19-mmo-design.md, „Bramka etapu 0”):
   czy Chromium, Firefox, WebKit (Safari) i Node 24 liczą tę samą grę bit w bit. Ten sam ustalony przebieg gry
   (tools/determinizm/przebieg.ts: świat z dema, zarząd z polityką „zawsze warta”, stałe polecenia) idzie w każdym
   silniku, a skrót świata zaraz po zbudowaniu i skrót stanu po każdej pełnej godzinie gry są porównywane. Każdy
   silnik liczy każdy scenariusz dwa razy w tym samym procesie (powtarzalność w obrębie silnika: inaczej rozbieżność
   między silnikami nic nie znaczy).

   Nogi: Node bieżący i Node 24 (osobne procesy; 24 z ZM_NODE24, nvm albo Homebrew, jeśli bieżący to nie 24),
   Chromium, Firefox i WebKit z Playwright (strona tools/determinizm/strona.html z serwera Vite w procesie, jak w
   tools/shots.ts) oraz systemowy jsc z macOS (JavaScriptCore bez przeglądarki: przebieg zbudowany w jeden plik ES
   przez Vite, geo dema wstawione do pliku). Czego nie ma na tej maszynie, tego nie pobieramy: wiersz „brak (…)” z
   poleceniem, które to uzupełni, i kod wyjścia 2.

   Gdy skróty się rozjadą, narzędzie liczy tę godzinę gry jeszcze raz z nagrywaniem wywołań Math w każdym silniku
   (tools/determinizm/nagrywanie.ts), znajduje pierwsze wywołanie z innym wynikiem (funkcja, argumenty, wyniki) i jego
   miejsce w kodzie (plik:linia ze stosu Node). Rozbieżność już w skrócie świata znaczy buildWorld, więc nagrywa się
   wtedy budowę świata.

   Uruchomienie: npm run determinizm [-- --demo=przymorze|lanciego|zielonki] [--godziny=24] [--zombie|--zwykly]
                                       [--seed=12345[,2,3]] [--silniki=node,chromium,jsc] [--json=plik.json]
                                       [--nagraj[=godzina]] [--psuj=silnik:funkcja] [--bez-swiata] [--latka=mat]
   Bez --demo: trzy dema; bez --zombie i --zwykly: oba tryby gry. --nagraj: nagrywanie przy rozbieżności jest
   domyślne; z numerem godziny (od 0) nagrywa tę godzinę gry w każdym scenariuszu, także gdy skróty są zgodne.
   --psuj=jsc:hypot to samotest bramki: noga jsc zwiększa każdy wynik hypot o jeden bit, a bramka ma to zauważyć.
   --bez-swiata pomija porównanie świata zaraz po zbudowaniu (kafelki, budynki, drzewa), zostawia same skróty stanu gry.
   --latka=mat to próba poprawki: w każdej nodze Math.hypot, atan2, sin i cos zastępuje deterministyczna matematyka
   z tools/determinizm/mat-proba.ts (prototyp src/core/mat.ts). Jeśli silniki z łatką się zgadzają, a bez niej nie,
   poprawka działa; spisu różnic Math z łatką nie robimy (liczyłby natywne funkcje, nie łatkę).
   Kod wyjścia: 0 przy zgodzie wszystkich silników docelowych (Chromium, Firefox, WebKit, Node 24), 1 przy
   rozbieżności, niepowtarzalnym albo padniętym silniku (z godziną gry i skrótami każdego silnika), 2 przy braku silnika
   docelowego albo gdy żaden z wybranych silników nie jest dostępny, 64 przy złych argumentach. Silniki dodatkowe (Node
   bieżący, jsc) liczą się do zgodności, ale ich brak nie daje kodu 2. Noga, która padnie na jednym scenariuszu, nie
   dostaje kolejnych (raport je wymienia jako pominięte), żeby zepsuta przeglądarka nie czekała na limit czasu przy
   każdym z nich.

   Układ: ten plik tylko spina całość. Argumenty: tools/determinizm/argumenty.ts, nogi (silniki): nogi.ts (strona w
   przeglądarce: przegladarka.ts, procesy potomne: proces.ts), liczenie scenariuszy, raport i kod wyjścia: bramka.ts
   (czyste, sprawdzane w testach na udawanych nogach). */

import fs from 'node:fs';
import path from 'node:path';
import { BladArgumentow, parsujArgumenty, type Ustawienia, UZYCIE } from './determinizm/argumenty.ts';
import { uruchomBramke } from './determinizm/bramka.ts';
import { zbierzNoge } from './determinizm/nogi.ts';

const KORZEN = path.resolve(import.meta.dirname, '..');

let ustawienia: Ustawienia;
try {
  ustawienia = parsujArgumenty(process.argv.slice(2), (demo) =>
    fs.existsSync(path.join(KORZEN, `public/demo/${demo}.json`)),
  );
} catch (e) {
  if (!(e instanceof BladArgumentow)) throw e;
  console.error(`${e.message}\n${UZYCIE}`);
  process.exit(64);
}
const { opcje, json } = ustawienia;

const { noge, zamknijSerwer } = await zbierzNoge(opcje.filtr, KORZEN);
try {
  process.exitCode = await uruchomBramke(
    opcje,
    noge,
    {
      wypisz: (linia) => console.log(linia),
      postep: (linia) => console.error(linia),
      zapiszJson: json ? (dane) => fs.writeFileSync(json, JSON.stringify(dane)) : undefined,
    },
    KORZEN,
  );
} finally {
  await zamknijSerwer();
}
