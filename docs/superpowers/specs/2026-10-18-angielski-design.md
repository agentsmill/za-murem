# Angielska wersja językowa: projekt

Zlecenie od koordynatora 18.10.2026 po południu, z wymagań Mateusza z rana: gra domyślnie po angielsku, polski do wyboru. Mateusz kazał decydować spójnie i bez pytań, więc wszystko, co niżej nie jest jego słowami ani ustaleniem koordynatora, to moje decyzje (zebrane na końcu w „Decyzjach do przejrzenia”). Słowniczek pojęć: `docs/SLOWNICZEK-EN.md`.

Ustalone przez koordynatora: tytuł „Za Murem” zostaje w obu językach (podtytuł tłumaczymy), angielski domyślnie niezależnie od języka przeglądarki, dokumenty w repo zostają po polsku.

## Po co

Mateusz chce pokazać grę ludziom spoza Polski. Gra stoi na prawdziwym polskim osiedlu i ma polski humor, więc angielska wersja ma brzmieć tak samo czarno i satyrycznie, a nie jak tłumaczenie z automatu. Polski zostaje pełnoprawnym językiem do wyboru.

## Cele

- Gra otwiera się po angielsku. Przełącznik EN/PL na karcie startowej i w Menu, zapamiętany w localStorage pod osobnym kluczem (`za-murem-0.4-jezyk`). Parametr adresu `lang=en|pl` do zrzutów i prób ręcznych (wygrywa z pamięcią, ale jej nie nadpisuje).
- Po angielsku jest wszystko, co gracz widzi: karta startowa (wstęp z lore w obu trybach, formularz adresu, „Wasz zarząd”, „Gra z sąsiadami” spod `?siec=1`), pasek, cele dnia, karta osoby, menu pod prawym przyciskiem, okna zarządu (karta nocy, uchwały, wydarzenia, raport rano, koniec gry), pomoc, budowa, komunikaty. W drugim etapie treść generowana: wydarzenia z 0.3 i M2, historie i kronika mieszkańców z adresu, historie drużyny.
- Ton jak po polsku (słowniczek, sekcja „Zasady”).
- Wybór języka nie zmienia symulacji ani zarządu: ten sam przebieg i te same skróty stanu w obu językach, boty (`npm run bot`, `npm run bot:zombie`) dają te same skróty co `pelna-gra`.
- Zmiana języka w trakcie gry działa od razu, bez przeładowania i bez utraty stanu, łącznie z kroniką, otwartą kartą nocy i raportem.

## Nie-cele

- Trzeci język. Mechanizm ma go nie blokować, ale słowniki są dwa.
- Tłumaczenie dokumentów w repo, komentarzy w kodzie, komunikatów dla programisty w konsoli i wyjścia botów (zostają po polsku).
- Tłumaczenie wersji 0.3 pod `/v03/` (zostaje polska, stoją na niej testy różnicowe).
- Tłumaczenie tekstów serwera gry sieciowej po stronie serwera. Klient tłumaczy znane kody błędów, nieznany komunikat pokazuje tak, jak przyszedł.
- Angielskie imiona, nazwy ulic i miejsc. Gra dzieje się na polskim osiedlu.

## Anty-cele (porażka, nawet jeśli działa)

- Inny skrót stanu symulacji po angielsku albo zapis, który po zmianie języka gra inaczej.
- Angielski, który czyta się jak tłumaczenie z automatu: kalki z polskiego, „cooperative board of the housing cooperative”, wyjaśnianie żartów.
- Kronika albo raport, w których po zmianie języka miesza się polski z angielskim (poza zapisami sprzed tej zmiany, opisanymi niżej).
- Napisy, które po angielsku nie mieszczą się na telefonie 390×844 (angielski bywa krótszy, ale „Night orders”, przyciski budowy i pasek trzeba obejrzeć).

## Ograniczenia z projektu

- Symulacja jest oddzielona od rysowania i deterministyczna, chodzi w Node bez przeglądarki (CLAUDE.md). `sim.hash()` to skrót `JSON.stringify(SimState)`, więc każdy napis w stanie symulacji wchodzi do skrótu.
- Treść przeniesiona z 0.3 (`src/content/data.ts`, `src/content/events.ts`) zostaje bajt w bajt, bo pilnują jej testy różnicowe z oryginałem w `node:vm`.
- Zarząd (`src/gov`) nie importuje `src/sim`, nie zna DOM.
- Stare zapisy mają dalej działać (zapis w localStorage i w chmurze).
- `verbatimModuleSyntax` i `erasableSyntaxOnly`: bez enumów i przestrzeni nazw, importy z `.ts`.

## Jak to działa

### Rdzeń: `src/core/jezyk.ts`

- `type Lang = 'en' | 'pl'`.
- `interface Tx { pl: string; en: string }` i `tx(pl, en)`: tekst w obu językach naraz.
- Bieżący język (`jezyk()`, `ustawJezyk(l)`, `poZmianieJezyka(f)` do słuchaczy). W module domyślnie polski, bo to język źródłowy kodu: testy, boty i narzędzia w Node widzą polskie teksty jak dotąd. Przeglądarka ustawia język gracza, zanim cokolwiek narysuje.
- `L(pl, en)`: napis w bieżącym języku do kodu, który rysuje w chwili wywołania. `tr(t)`: tekst ze stanu (`Tx` albo stary polski napis) w bieżącym języku.
- Zasada: na poziomie modułu nie wołamy `L()`, bo moduły ładują się przed ustawieniem języka. Stałe tablice napisów to `Tx` albo pary, a wybór języka dzieje się przy rysowaniu.

### Zasada stanu: żadnego tekstu zależnego od języka

- Stan symulacji (`SimState`) zostaje bez zmian. Polskie napisy w nim (powody nastrojów, zawody, cechy, przyczyny zgonów, historia i rodzina osób z generatora, historia z drużyny) są od teraz identyfikatorami: interfejs tłumaczy je przy rysowaniu przez tablice „polski napis → angielski” (z polskim, gdy wpisu brak; test pilnuje, że znane napisy mają tłumaczenie). Dzięki temu skróty botów się nie zmieniają.
- Stan zarządu (`GovState`) trzyma zdania, które zarząd sam składa: kronikę, linie raportu, kartę nocy, linie „na rano”. Od teraz każde takie zdanie to `Tx` z obiema wersjami, złożonymi w tej samej chwili z tych samych danych. Zmiana języka pokazuje od razu całą kronikę i otwarte okna w drugim języku, a stan nie zależy od wyboru. Angielska wersja nie losuje niczego sama: wariant tekstu wybiera to samo losowanie co polski (pary wariantów zamiast dwóch list).
- Stary zapis ma w tych miejscach zwykłe polskie napisy. Przy wczytaniu zapisu zarząd zamienia je na `Tx` z polskim tekstem po obu stronach, więc stare wpisy kroniki zostają po polsku także w angielskiej wersji, a nowe są w obu językach. Wersja zapisu zarządu się nie zmienia, bo odczyt zna oba kształty.
- Powód nastroju z zarządu (`GovMood.why`) trafia do stanu symulacji, więc zostaje polskim identyfikatorem jak powody z symulacji.

### Zarząd w obu językach

- Zdania składane w kodzie zarządu: `tx(polski, angielski)` obok siebie, z tymi samymi danymi. Polskie zdania się nie zmieniają, więc testy zarządu sprawdzają `.pl`.
- Słowa miejsca: obok `wordsOf(place)` (polskie przypadki) jest `wordsEn(place)`: co-op albo street, board albo street committee, gate albo garden gate, residents albo neighbours.
- Tabele treści zarządu (uchwały M1, cele wypraw, nazwy dziur, zakończenia przy domu): angielskie odpowiedniki w plikach `*.en.ts` obok polskich, po tych samych kluczach.
- Wydarzenia nowe (`NEW_EVENTS` w `tresc.ts`, `STREET_EVENTS` w `ulica.ts`): tytuł, tekst i napisy wyborów zwracają `Tx`, wpisy do kroniki i linie na rano też.
- Wydarzenia z 0.3 (`src/content/events.ts` z nakładkami z `warianty.ts`): polska treść zostaje bajt w bajt, a angielska jest w `src/content/events.en.ts`: tytuł, tekst i napisy wyborów z tych samych danych wydarzenia (`ActiveEvent.d`) i tego samego gospodarza, oraz tłumacz wpisów do kroniki (polski wpis z wyboru i dane wydarzenia → angielski wpis). Tłumacz po polskim tekście jest tu bezpieczny, bo treść 0.3 jest zamrożona testem. Test puszcza każde wydarzenie z 0.3 z każdym wyborem na wielu ziarnach i sprawdza, że każdy wpis ma angielską wersję.
- Okna liczone na żądanie (`pending()`, `lawOptions()`, `eventView()`) też oddają `Tx`, żeby zarząd nigdy nie czytał bieżącego języka.

### Interfejs

- Teksty interfejsu (`src/ui`, `src/main.ts`, napisy z `src/sim/orders.ts`, `budowle.ts`, `needs.ts`, `bron.ts`, `src/net`, komunikaty `src/world/load.ts`) idą przez `L()` przy rysowaniu albo przez tablice `Tx`.
- Statyczne napisy z `index.html` (pasek, przyciski, formularz, przypisy) ustawia przy starcie i po każdej zmianie języka `src/ui/jezyk.ts` z jednej tablicy (id albo selektor → `Tx`, osobno tekst, `title`, `aria-label`, `placeholder`). W `index.html` zostają angielskie napisy jako wersja przed uruchomieniem skryptu, `<html lang>` ustawia skrypt.
- Liczby: `num`, `signed`, `deg`, `pct` w `src/ui/tekst.ts` według bieżącego języka (kropka po angielsku). Do tego angielska liczba mnoga (`many(n, one, other)`) i zaimki z płci.
- Przełącznik EN/PL: dwa przyciski na karcie startowej (w rogu karty) i w Menu gry. Zmiana języka woła słuchaczy: karta startowa rysuje się od nowa (wstęp, przykłady, wznowienie, „Wasz zarząd”, „Gra z sąsiadami”), a w grze pasek, cele, karta osoby, otwarte okno i budowa. Menu pod prawym przyciskiem się zamyka.
- Przełącznik pokazuje się zawsze, także przy `?lang=`.

### Treść generowana (drugi etap)

- Historie drużyny (`src/content/historia.ts`): angielskie kawałki w `historia.en.ts`, składane tym samym losowaniem (to samo ziarno daje tę samą historię w obu językach). Panel „Wasz zarząd” składa historię w bieżącym języku i składa ją od nowa po zmianie języka, dopóki gracz jej nie zmieni ręcznie. Historia, która poszła do gry, jest tekstem gracza: na karcie osoby zostaje w języku, w którym powstała (jak historia wpisana ręcznie).
- Mieszkańcy z adresu (`src/mieszkancy`): stan symulacji dostaje polskie historie, rodzinę i zawody jak dziś. Angielskie powstają poza stanem z tego samego wyniku generatora: każdy szablon zdania dostaje identyfikator i angielskiego bliźniaka (bez odmiany, z zaimkami z płci), historie składają się z tych samych wybranych szablonów, a rodzina i zawód z danych osoby. Interfejs trzyma je w mapie po `Person.ref`, liczonej przy starcie i wznowieniu gry, kiedy i tak liczy się generator. Bez danych generatora (zapis sprzed kroku 5) karta pokazuje polskie teksty ze stanu.
- Edytor imienia: po angielsku z angielskimi podpisami i zdaniem, że formy przypadków służą polskiej wersji.

### Co zostaje po polsku

Zawsze: imiona i nazwy miejsc, tytuł, dokumenty, komentarze, wyjście botów i narzędzi, wersja `/v03/`, `LICENCJE.md` z danymi mieszkańców (podpis linku tłumaczymy), wpisy kroniki ze starych zapisów, historia drużyny wpisana albo zatwierdzona po polsku. To, czego drugi etap nie zdąży, ma listę w „Co jeszcze po polsku” w `docs/POSTEP.md`.

## Testy i sprawdzanie

- Testy jednostkowe zostają po polsku (domyślny język w Node), a nowe testy z `ustawJezyk('en')` sprawdzają: rdzeń języka i liczby; że karta startowa, pasek, karta osoby, okna zarządu i budowa po angielsku nie mają polskich znaków poza imionami i nazwami miejsc; że przebieg zarządu i symulacji jest ten sam w obu językach (ten sam skrót po kilku dobach z zarządem, gdy język zmienia się w trakcie); pokrycie tablic „polski napis → angielski” dla znanych napisów; wpisy z wydarzeń 0.3.
- Boty: te same skróty co `pelna-gra` po jej wciągnięciu.
- Zrzuty (`npm run shots`): scenariusze EN i PL dla karty startowej, paska, karty osoby, karty nocy i raportu, na komputerze i telefonie 390×844. Każdy nowy zrzut obejrzany.

## Decyzje do przejrzenia (moje)

1. Angielski brytyjski (estate, flat, allotment, neighbour).
2. Słowa z `docs/SLOWNICZEK-EN.md`, m.in. szwendacze to „shamblers”, stado to „the herd”, karta nocy to „Night orders”, wyprawa to „run”, wkurzenie to „anger”, koza to „the stove”, klatka to „stairwell”, osiedle to „the estate”.
3. Stan symulacji bez zmian, a polskie napisy w nim to identyfikatory tłumaczone przy rysowaniu. Zarząd zapisuje zdania w obu językach naraz.
4. Stare wpisy kroniki zostają po polsku także w angielskiej wersji.
5. Historia drużyny, która poszła do gry, zostaje w języku, w którym powstała.
6. Zegar 24-godzinny i stopnie Celsjusza po angielsku.
7. Parametr `lang` wygrywa z pamięcią, ale jej nie nadpisuje.
8. Tryb zwykły po angielsku to „Normal”.
9. Komunikaty serwera gry sieciowej tłumaczy klient po kodzie błędu; serwer zostaje po polsku.
