/* Nowy zarząd osady po odwołaniu, etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3,
   rozstrzygnięcie kontrolera 1 do decyzji 10 ze specyfikacji: „Odwołanie ich zarządu daje nowy zarząd zamiast końca osady”).

   Po co. `krokGry` (src/ai/gra.ts) staje, gdy `gov.over` jest ustawione: dla gracza to koniec gry. Osada w przeglądarce idzie krok w
   krok z naszą grą i nie może stanąć, więc gospodarz (src/ui/osada.ts) po każdym kroku sprawdza `gov.over`: odwołanie (wkurzenie 100)
   przechodzi przez `nowyZarzad` i gra idzie dalej, a pustka i exodus kończą osadę (to sprawa gospodarza: osada „upadła”, stoi). Ta
   funkcja jest osobno, a nie w `krokGry`, bo uprząż pomiarowa (`npm run bot:osada`, miara bramki: pierwsze odwołanie nie wcześniej
   niż w 30. dniu) ma dalej widzieć odwołanie jako koniec gry, a skróty jej przebiegów mają zostać takie, jakie są.

   Co robi. Przy `gov.over === 'odwolanie'` zdejmuje koniec gry, ustawia zaufanie i wkurzenie na nowy start (`START_ZAUFANIA`,
   `START_WKURZENIA`) i dopisuje do kroniki zarządu wpis w obu językach. Ludzie zarządu zostają ci sami (zebranie wybiera nowy zarząd
   z tych samych mieszkańców: ten sam stan symulacji, żadnych nowych ani zdjętych pionków, więc nie ma tu niczego, czego gracz by
   nie miał: osada niczego nie dostaje poza drugą szansą). Reszta stanu zarządu (uchwały, karty, wydarzenia, miasto, drogi do
   zwycięstwa, pamięć silnika) idzie dalej bez zmian: odwołanie zmienia nastrój ulicy, a nie to, co zarząd już podpisał i zrobił.
   Czysto i bez losowania (zero liczb z ziarna), więc przebieg zależy tylko od stanu gry; stan nowego zarządu jest w zapisie gry
   (`GovState`), więc zapis zrobiony tuż po nim daje ten sam przebieg (test).

   Liczby startu. Świeży zarząd startuje z zaufaniem 50 i wkurzeniem 20 (`newGov`). Nowy zarząd po odwołaniu ma być słabszy, ale nie
   skazany: ZAUFANIE 40 (o 10 mniej) i WKURZENIE 40 (o 20 więcej). Wybór z pomiaru (25.10.2026) na 40 grach osady z kwadratów
   wokół Przymorza i Lanciego (`wybierzOsade` dla ziaren 11–30, po 20 na demo; silnik `silnik`, 45 dni): pierwszy zarząd odwołano w
   31 grach (w dniach 17–45, mediana 23; 9 gier dożyło 45. dnia), przy zaufaniu 78–100 (mediana 96). Każdą z 31 gier zapisano w
   chwili odwołania i puszczono dalej do następnego końca z czterema startami (25 dni na odnogę, 31 odnóg na start, zero błędów):

       start (zaufanie, wkurzenie)   dni do następnego odwołania: mediana (najmniej–najwięcej)
       50, 20  (jak świeży zarząd)   17 (12–24; jedna odnoga żyje po 25 dniach)
       40, 40  (wybrany)             14 (7–19; jedna żyje)
       35, 50                        11 (6–18; jedna żyje)
       30, 60                        9 (4–17; dwie żyją)

   Wkurzenie rośnie w takiej osadzie o około 4,5 punktu na dobę ((100 − start) / mediana dni w każdym z czterech wierszy to 4,3–4,7),
   więc czas do następnego odwołania to mniej więcej (100 − start wkurzenia) / 4,5 doby, a zaufanie nie rozstrzyga: exodus (zaufanie 0) nie
   zdarzył się w żadnej odnodze, bo przy odwołaniu zaufanie bywa wysokie, a nowy start je tylko obniża. 40 i 40 daje zarządowi trzy
   czwarte zapasu wkurzenia świeżego zarządu (60 z 80 punktów) i około 80% jego czasu (14 dób wobec 17), a najkrócej 7 dób na
   poprawę, zanim zebranie znów go odwoła. Niżej (35 i 50 albo 30 i 60) najkrótsza odnoga to 4–6 dób, czyli osada, która po
   odwołaniu ginie, zanim silnik zdąży cokolwiek zmienić, a start jak świeżego zarządu (50 i 20) nie robi z nowego zarządu słabszego.
   Zaufanie 40 zamiast 50 to dziesięć punktów kary, jak dwa zgony w zarządzie (−5 za każdy); zostaje 40 punktów do exodusu.

   Moduł jest czysty: bez DOM, zegara i losowania (src/ai/*.ts pilnuje tego tests/unit/ai-czystosc.test.ts). */

import { tx } from '../core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../gov/miejsce.ts';
import { logGov } from '../gov/wspolne.ts';
import { type GraAi, wejscie } from './gra.ts';

/** zaufanie nowego zarządu po odwołaniu (świeży zarząd ma 50) */
export const START_ZAUFANIA = 40;
/** wkurzenie nowego zarządu po odwołaniu (świeży zarząd ma 20; odwołanie przy 100) */
export const START_WKURZENIA = 40;

/** Nowy zarząd po odwołaniu: zdejmuje koniec gry `odwolanie`, ustawia start zaufania i wkurzenia i wpisuje do kroniki zdanie o
    nowym zarządzie. true, gdy gra była odwołana i teraz idzie dalej; false (bez zmian w grze), gdy nie ma końca gry albo to pustka
    albo exodus (tym zajmuje się gospodarz). Czas gry się nie rusza. */
export function nowyZarzad(g: GraAi): boolean {
  const gov = g.gov;
  if (gov.over !== 'odwolanie') return false;
  gov.over = null;
  gov.trust = START_ZAUFANIA;
  gov.anger = START_WKURZENIA;
  const zarzad = wordsOfWorld(g.w).zarzad.krotko;
  const board = wordsEnOfWorld(g.w).krotko;
  logGov(
    gov,
    wejscie(g),
    tx(
      `Zebranie odwołało ${zarzad} i wybrało nowy. Zaufanie zaczyna się od nowa, ale wkurzenie nie opadło.`,
      `The meeting recalled ${board} and chose a new one. Trust starts over, but the anger has not gone.`,
    ),
    true,
  );
  return true;
}
