# Wydarzenia z prawdziwymi ludźmi: projekt

Stan: projekt z rozmowy z Mateuszem 19.10.2026, gałąź `wydarzenia` od `pelna-gra` 7ca3bf8. Ocena, z której wyrasta: `docs/OCENA-wydarzenia.md` (spis kart na grze jak na serwerze testowym, liczby i diagnoza).

Oznaczenia: „Mateusz” przy decyzji znaczy, że ustalił to Mateusz. „Moja decyzja” znaczy, że to założenie projektującego, które Mateusz może zmienić. Reszta wynika z kodu albo z zasad repo.

## Po co

Mateusz: wydarzenia mają być bogate, niestandardowe, za każdym razem inne, generatywne, związane z prawdziwymi mechanikami i postaciami. „Nie chcę mieć tak, że ktoś przychodzi, mogę go przyjąć, a tak naprawdę nic nikogo nie ma”.

Dziś karty zarządu żyją obok prawdziwych obcych z symulacji. Karta „Handlarz” wypada 28 razy w 10 grach przy 2–3 wizytach prawdziwego handlarza, a w trybie zombie 11 razy w 5 grach bez żadnej. Karta wędrowca przychodzi wieczorem i w nocy, kiedy pod bramą nikogo nie ma. Mieszkańcy siedziby mają imiona z generatora, ale zarząd zna tylko ich liczbę, więc karty wymyślają panią Krysię, fachowca o innym imieniu i złodzieja, którym jest ostatni mieszkaniec z listy. Gra ma około 35 kart w 5 dobach przy puli 31–34, prawie te same w każdej grze, a tryb zombie dostaje karty zwykłego trybu.

## Ustalone z Mateuszem (19.10.2026)

1. Generatywne to klocki składane przez samą grę, bez modelu AI w trakcie gry. Treść klocków i łańcuchów powstaje offline (Mateusz).
2. Zasada: najpierw człowiek, potem karta. Jedna obsada ludzi dla kart i dla mapy (Mateusz, „poprawiony fundament się zgadza”).
3. Karta „Handlarz” znika, wymiana zostaje przy prawdziwym handlarzu. Karta o wędrowcu otwiera się tylko przy prawdziwym gościu pod bramą. Wpuszczony idzie bramą do ogniska, złodziej w nocy naprawdę idzie do kuchni (Mateusz).
4. Karty widzą mieszkańców z generatora: fachowcem zostaje ten sam mieszkaniec, sprawca kradzieży to konkretny głodny sąsiad, wyrzucony wychodzi bramą. Przyjęci do zarządu wchodzą bramą. Pies i kot są pionkami (Mateusz).
5. Tryb zombie ma własną pulę w klimacie The Walking Dead, bez handlarza z karty, czynszu i tokenów (Mateusz).
6. Karty z prawdziwego stanu (kradzież z głodu, kłótnia najbardziej wkurzonych, pogrzeb po śmierci, ślady przy największej dziurze) i jeden narrator z krzywą napięcia, bez wyboru narratora (Mateusz, „pasuje”).
7. Tempo jak dziś: około 35 kart na 5 dób, w pierwszych 10 minutach decyzja mniej więcej co minutę (Mateusz, „pasuje”).
8. Gość z klocków (kto, czego chce, co ma, haczyk, skąd), pamięć o znajomych, łańcuchy z hakami, wątki sezonu: pula 12 łańcuchów, 3 na grę. Każdy wybór zostawia ślad na mapie, karta ma „Pokaż”. Treść pisze Claude, Mateusz czyta ton przed wejściem do gry (Mateusz, „niczego nie brakuje, wdrażaj już do końca”).

## Cele

- Każda karta, która mówi o człowieku poza zarządem, mówi o pionku, który jest na mapie albo był (zmarły, odszedł bramą).
- Wybór w karcie zmienia to, co widać: gość wchodzi albo odchodzi, mieszkaniec przechodzi do zarządu albo wychodzi bramą, złodziej idzie do kuchni.
- Dwie gry na tym samym adresie mają różne historie: inni goście, inne wątki sezonu, inni znajomi wracają.
- Tryb zombie nie dostaje kart, które w nim nie mają sensu.
- Obie wersje językowe od pierwszego dnia, ze słowami miejsca (dom albo blok).

## Poza zakresem

- Model językowy w grze, serwer do wydarzeń.
- Zmiana treści 0.3 w `src/content/events.ts` (pilnuje jej test zgodności z 0.3 w `node:vm`). Przeróbki idą w warstwie zarządu (`src/gov/warianty.ts` i nowe moduły).
- Okno kroniki w interfejsie. Kronika (`GovState.log`) dziś nie ma widoku; projekt zapisuje miejsce przy wpisie, a przycisk „Pokaż” dostaje tylko karta (moja decyzja).
- Nowe przedmioty z grafiką na mapie (latarka przy bramie, puszki na siatce). Ślad na mapie to to, co symulacja już umie pokazać: ludzie, sterty, łaty, zwierzęta z tego projektu (moja decyzja).
- Wesele (wyłączone do czasu par z generatora) i relacje między osobami.
- Handel kartą. Handlarz zostaje taki, jak jest w symulacji.

## Czego nie chcemy, nawet jeśli działa

- Karta o kimś, kogo nie ma na mapie, albo pionek, który pojawia się z powietrza przed drzwiami.
- Liczba w karcie albo w kronice inna niż liczba pionków.
- Imię w karcie inne niż imię pionka, którego karta dotyczy.
- Polskie słowo w angielskiej wersji albo odwrotnie.
- Inny przebieg tej samej gry w Node i w przeglądarce, inny po zapisie i wczytaniu.
- Teksty, które przypinają postać do piętra albo numeru mieszkania (RODO, tylko klatka), prawdziwe nazwiska polityków, nazwa firmy jako postać.

## Twarde ograniczenia

- Zarząd (`src/gov`) nie importuje `src/sim` i nie dotyka DOM (test w `tests/unit/zarzad.test.ts`). Most to `src/sim/gov.ts`: `govInput()` buduje `GovInput`, `applyGov()` stosuje `GovEffects`.
- Determinizm: zarząd losuje tylko ze swojego ziarna (`st.rng` zarządu), symulacja tylko ze swojego. Tasowanie Fishera-Yatesa. Bez `Math.random`, bez `Math.hypot`/`sin`/`cos` w decyzjach. Zmiany przechodniości i dróg przez kolejkę poleceń w stanie symulacji.
- Zapis: nowe pola stanu zarządu i symulacji są opcjonalne z wartością domyślną (`??=` w konstruktorze `Sim`, przy odczycie w zarządzie). Nowe pola z tekstem `Tx` w stanie zarządu dopisać do `normalizujTeksty` (`src/gov/zarzad.ts`). Wersje zapisu bez zmian.
- Teksty w obu językach (`Tx`, `tx()` z `src/core/jezyk.ts`), angielski według `docs/SLOWNICZEK-EN.md`, słowa miejsca przez `words()`/`wordsEn()` hosta.
- Liczby w tekstach przez `src/ui/tekst.ts` tam, gdzie idą do interfejsu.
- Lore z `docs/GDD.md` i zasady RODO z `CLAUDE.md`. Postaci zmyślone.
- Bramka każdego etapu: `npm test`, `npx biome check src tests tools index.html`, `npm run build`, boty (`npm run bot`, `npm run bot:zombie`, `npm run bot -- --mieszkancy`), spis kart (skrypt z oceny), zrzuty nowych scenariuszy obejrzane w Chromium. Zmienione skróty botów opisane w `docs/POSTEP.md` z przyczyną.

## Jak to działa w skrócie

Pięć etapów, każdy grywalny sam w sobie i scalany po swojej bramce:

1. Karty, które kłamią: wyłączone karty bez ludzi, pule według trybu, przyjęci do zarządu wchodzą bramą, nowa karta zombie z prawdziwym szwendaczem.
2. Mieszkańcy widoczni dla zarządu: osoby mieszkańców w `GovInput`, awans, wyrzucenie bramą, karty z sytuacji (kradzież z głodu, kłótnia, bezsenność, pogrzeb, sąsiadka z imieniem).
3. Gość z klocków i zwierzęta: zarząd składa gościa, symulacja go wystawia, karta otwiera się pod bramą, wybór jest poleceniem; pies i kot jako pionki.
4. Pamięć o znajomych: kto był i jak go potraktowano, powroty, znajomy wśród szabrowników.
5. Łańcuchy, wątki sezonu i narrator.

## 1. Karty, które kłamią

### Pule według trybu

`GEventDef` i nakładka `OldEvent` dostają opcjonalne pole `tryby?: readonly GameMode[]` (domyślnie oba). `fitsMode` sprawdza je razem z dzisiejszym wykluczeniem wydarzeń ulicy w trybie zombie.

| Karta | Zwykły | Zombie | Dlaczego |
|---|---|---|---|
| `handlarz` | nie | nie | prawdziwy handlarz jest w symulacji (Mateusz) |
| `wedrowiec` | od etapu 3 jako gość | od etapu 3 jako gość | w etapie 1 waga 0, bo nikogo nie ma pod bramą |
| `czynsz`, `krypto` | tak | nie | Mateusz |
| `aktywisci`, `influencer`, `obserwacja` | tak | nie | protest i vlog przy stadzie, a obserwacja zapowiada szabrowników, których w trybie zombie nie ma (moja decyzja) |
| `uchodzcy` | tak | nie, od etapu 3 ocaleni jako goście | ukryte ugryzienie potrzebuje gościa (moja decyzja) |
| `slady` | tak | wariant zombie | „udawać” nie może podbijać napadu szabrowników; w trybie zombie ślady to wydeptana ścieżka szwendaczy, wybory: łata albo warta z dzidą (moja decyzja) |
| reszta | tak | tak | |

### Szwendacz w siatce (zombie)

Nowa karta `szwendacz` w trybie zombie, za dnia, gdy `GovInput.horde.pressing > 0` albo przy siatce stoi szwendacz (`near > 0`). Mówi o prawdziwym szwendaczu: symulacja podaje w `GovInput` kafelek najbliższego napierającego (`horde.przy?: {x, y}`), karta ma „Pokaż”. Wybory: „Dobić dzidą” (dostępne, gdy ktoś z zarządu ma dzidę i nie śpi: ta osoba idzie na posterunek przy siatce najbliżej szwendacza na godzinę, a dobija warta, która już dziś bije przez siatkę), „Zostawić, niech wisi” (bezpieczeństwo −3 wszystkim), „Zasłonić kocem, żeby dzieci nie patrzyły” (nastrój +, bez walki).

### Przyjęci do zarządu wchodzą bramą

`addCore` dostaje tryb przyjścia jak `addResidents(…, arrive)`: nowa osoba zarządu czeka za bramą i idzie do siedziby pracą przyjścia, a interfejs pokazuje ją w komunikacie „idzie od bramy” z „Pokaż” (`src/ui/przybycie.ts` liczy dziś tylko mieszkańców; rozszerzyć o zarząd w przyjściu). `applyGov` używa przyjścia dla wszystkich `fx.join`.

## 2. Mieszkańcy widoczni dla zarządu

### Wejście

`GovInput.lokatorzy?: GovLokator[]` z pionków mieszkańców siedziby, które mają osobę z generatora (`pawn.person >= 0`), w kolejności pionków:

```ts
interface GovLokator {
  pawn: number; id: string; name: string; first: string; f: boolean; age: number;
  prof: string; skills: Partial<Record<Dom, number>>; traits: string[];
  needs: GovNeeds; asleep: boolean; inside: boolean; tile: number;
}
```

Bez generatora lista jest pusta i karty działają jak dziś (bez imion). Liczba `residents` zostaje.

### Skutki

- `GovEffects.awans?: string[]`: mieszkaniec przechodzi do zarządu. Ten sam pionek, ta sama osoba w `st.people`, `kind` z `resident` na `core`, potrzeby i miejsce zostają, łóżko zostaje jego. Dziś takiej drogi nie ma; wzorem jest `przyjmijGospodarstwo` w `src/sim/sim.ts` (sąsiad zostaje mieszkańcem przez zmianę `kind`, mieszkanie, potrzeby i pracę przyjścia).
- `GovEffects.wyrzuc?: string[]`: mieszkaniec idzie do bramy (przez bramę przechodzi warstwą zarządu, jak w pracy `arrive`), za bramą idzie po stronie ulicy do kafelka daleko od siatki i znika (jak przechodnie z `PASSERS` w fazie 4). Łóżko jest wolne od razu.

Host zarządu dostaje: `lokatorzy()`, `lokator(id)`, `awansuj(id)`, `wyrzuc(id)`.

### Karty z sytuacji

- `fachowiec` w bloku: kandydat to mieszkaniec z umiejętnością w dziedzinie, której zarząd nie zna (`know(d) < 3`), najstarszy z najwyższą umiejętnością; tekst z jego imieniem i fachem; „Wciągnąć do roboty” to awans. Bez kandydata karty nie ma. W domu bez zmian (sąsiad zza płotu dołącza przez przyjście bramą).
- `kradziez`: tylko gdy ktoś z mieszkańców ma `needs.food <= 20` (moja decyzja zamiast „od kilku godzin”: symulacja nie liczy czasu głodu); sprawca to najbardziej głodny. Wybory: sąd koleżeński (z uchwałą), „Wyrzucić z osiedla” (wyrzucenie bramą), nowe „Dać mu jeść z kotła” (Jedzenie 2, jego jedzenie +30, zaufanie +1), „Przymknąć oko”. Strata jedzenia jak w 0.3. Odstęp 48 godzin gry zamiast 16.
- `klotnia`: para z zarządu z najniższym nastrojem (remis: kolejność osób); bez dwóch osób z nastrojem poniżej 55 karty nie ma (moja decyzja co do progu).
- `bezsennosc`: osoba z najniższym bezpieczeństwem, która nie śpi, zamiast losowej.
- `dym` (sąsiadka z klatki) i `latarka` (pani z trzeciego piętra): w bloku z mieszkańcami z osobą bohaterką jest najstarsza mieszkanka (albo mieszkaniec, z rodzajem przez `g()`), z imieniem i klatką zamiast piętra. Słoik od niej trafia do kuchni jak dziś. Bez mieszkańców z osobą tekst jak dziś.
- Nowa karta `pogrzeb` (oba tryby): po śmierci kogoś z zarządu albo mieszkańca z imieniem (licznik jak `deadN`, osobne pole `pogrzebN`), w ciągu doby, w dzień albo wieczorem. Wybory: pochować pod trzepakiem (wszystkim nastrój „Pożegnaliśmy X” +2 na dobę, kto kopał, odpoczynek −10), pożegnać przy kozie (nastrój +1), bez ceremonii (wkurzenie +1). W trybie zombie dodatkowo w tekście: czy ciało dobito (z listy zgonów: przyczyna).

## 3. Gość z klocków i zwierzęta

### Klocki

Nowy moduł `src/gov/goscie.ts` (czyste dane i funkcje, teksty w obu językach). Gość:

```ts
interface Gosc {
  id: string;            // 'g1', 'g2'… z licznika w stanie zarządu
  osoba: Person;         // imię, płeć, wiek, fach, cechy
  kto: KtoId; chce: ChceId; ma: MaId; haczyk: HaczykId;
  skad: { strona: 'n' | 'e' | 's' | 'w'; nazwa: Tx; klucz?: string };  // klucz miejsca z okolicy, gdy jest
  satyra?: SatyraId;
  wraca?: string;        // id znajomego przy powrocie (etap 4)
}
```

| Klocek | Wartości (pierwsza paczka) |
|---|---|
| kto | wędrowiec, rodzina z dziećmi, dezerter z ochrony zamkniętego osiedla, uciekinier z sąsiedniej spółdzielni, chory, samotne dziecko, ktoś, kto zna kogoś z zarządu; zombie: ocaleni, ktoś z ugryzionym bliskim |
| czego chce | nocleg, jedzenie, leki, wymiana, dołączyć, przechować coś, wiadomość; zombie: dobić bliskiego |
| co ma | fach, rzecz, wiadomość o miejscu z okolicy, ostrzeżenie, nic |
| haczyk | mówi prawdę, kłamie, jest chory, ktoś za nim idzie; zombie: ugryziony |
| skąd | miejsce z okolicy (`GovInput.okolica`, najbliższe od strony wejścia) albo opis kierunku („od strony obwodnicy”), bez nazw, które wyglądają na imię i nazwisko |
| satyra | jedna linijka o dawnych czasach: abonament, paczkomat, hulajnoga na minuty, token, opaska do mierzenia snu |

Klocki mają wagi zależne od trybu, pory i stanu (zima: częściej chory; dużo jedzenia w zapasie: częściej kłamie; po napaści na wędrowca: rzadziej przychodzą). Niezgodne pary są wykluczone tabelą (samotne dziecko nie dezerteruje). Tekst karty składa się z: kto i skąd, czego chce, jedno zdanie, po którym uważny gracz zgadnie haczyk („ogląda się co chwilę za siebie”, „trzyma rękę w kieszeni kurtki”), linijka satyry.

Osoba gościa: `makePerson` z ziarna zarządu z fachem i wiekiem pasującymi do archetypu (moja decyzja na teraz: imiona z list 0.3, bez tabel generatora, bo zarząd ich nie ma; podmiana na imiona z generatora to osobny krok, interfejs `Gosc.osoba` się nie zmienia).

### Wizyta

1. Goście chodzą tylko w grze z obcymi (`SimOpts.obcy`, jak handlarz i wędrowcy; gra włącza ją domyślnie, boty i testy bez niej grają bez gości). Zarząd wie o tym z `GovInput.goscie` (pole jest, choćby puste, tylko z obcymi). Pula kart dostaje wydarzenie `gosc` (oba tryby, dzień, wieczór i noc, waga jak dziś wędrowiec razem z uchodźcami; bez `GovInput.goscie` waga 0). Kiedy wypada, zarząd nie pokazuje karty, tylko składa gościa i wysyła plan: `GovEffects.gosc?: { id; osoba; look; strona }`. Najwyżej jeden gość naraz. Stan zarządu `st.goscie?: { n: number; aktywny?: { gosc: Gosc; od: number /*sekunda przy ekranie*/ } }`.
2. Symulacja wystawia pionek gościa: nowy rodzaj `gosc` z osobą w `st.people` (`person >= 0`) i wyglądem z planu. Start bez losowania ze `st.rng`: najdalszy kafelek strony ulicy (`lay.outside`) po podanej stronie mapy; cel to kafelek przy bramie od zewnątrz (`outsideOf(gateTiles)`). Póki jest za siatką, chodzi warstwą ulicy jak wędrowiec; wpuszczony przechodzi bramę warstwą zarządu jak w pracy `arrive`. W trybie zombie szwendacze na niego polują (`isPrey`) i płoszy się jak wędrowiec (`spooked`): ucieka, plan kończy się fazą `poszedl`. `GovInput.goscie?: { id; faza: 'idzie' | 'brama' | 'w_srodku' | 'odchodzi' | 'zlapany' | 'poszedl' | 'nie_doszedl' | 'zginal'; tile; pawn }[]`, zakończone wpisy znikają po odczycie przez zarząd (licznik jak `napadN`).
3. Karta otwiera się, gdy gość ma fazę `brama` (i nic innego nie czeka na decyzję). Karta ma „Pokaż” na kafelku gościa. Gdy nie dojdzie w 2 godziny gry (zablokowana droga, szwendacze), plan przepada bez karty.
4. Wybory to polecenia dla gościa: `GovEffects.goscRozkaz?: { id; co: 'odejdz' | 'jedzenie' | 'noc' | 'zostan' | 'zarzad' }[]`:
   - „Odprawić”: odchodzi tam, skąd przyszedł.
   - „Podać jedzenie przez siatkę (Jedzenie 1)”: jedna porcja znika ze zapasów, gość odchodzi.
   - „Wpuścić na noc” (bez uchwały o bramie na kłódkę): wchodzi bramą, idzie do ogniska albo kozy, siedzi, śpi przy ogniu; rano między 6 a 8 wychodzi bramą.
   - „Przyjąć do spółdzielni” (gdy chce dołączyć i są wolne miejsca): zostaje mieszkańcem jak w `przyjmijGospodarstwo` (rodzaj `resident`, mieszkanie, potrzeby, praca przyjścia, łóżko); z fachem, którego zarząd nie zna, do wyboru „Przyjąć do zarządu” (rodzaj `core` jak przy awansie).
   - Wymiana i leki: gdy chce wymiany albo leków, wybór z kosztem (Jedzenie, Leki) i nagrodą z klocka „co ma”.
5. Haczyk działa w symulacji albo w zarządzie:
   - kłamie i wpuszczony na noc: o 2:00 idzie do najbliższej sterty jedzenia, bierze do 3 porcji i wychodzi bramą albo dziurą; gdy po drodze ktoś z zarządu nie śpi w promieniu 8 m (warta, dyżur przy kozie), gość jest złapany (`zlapany`), a zarząd pokazuje kartę „Złapany” z wyborami: oddać i wyrzucić, wyrzucić z łupem, zatrzymać do rana (pilnuje go ktoś z zarządu, odpoczynek −10);
   - chory i wpuszczony albo przyjęty: rano choroba jednej osoby (`fx.sick`);
   - ktoś za nim idzie i wpuszczony: zwykły tryb: szansa napadu tej nocy razy 1,5 i napad przy bramie; zombie: hałas przy bramie przyciąga szwendaczy z okolicy;
   - ugryziony (zombie) i wpuszczony albo przyjęty: pionek dostaje ugryzienie jak dziś ludzie (`infect`), więc gorączka i przemiana idą znaną drogą; wybór „Obejrzeć ręce” (zawsze dostępny w trybie zombie) odsłania ugryzienie z pewnością, a przy zdrowym gościu kosztuje zaufanie −1 i karta pokazuje się dalej bez tego wyboru.
6. Co ma, po przyjęciu, nakarmieniu albo nocy: fach (przy przyjęciu do zarządu), rzecz (broń albo amunicja do magazynu przez `fx.arms`/`fx.ammo`, leki, latarka jako dzisiejsza flaga), wiadomość o miejscu z okolicy (`GovState.wskazowki?: Record<kluczMiejsca, { dzien }>`: następna wyprawa tam ma ryzyko razy 0,5 i łup razy 1,5; bez mapy miasta wiadomość o celu z `TARGETS`), ostrzeżenie (podwójna warta tej nocy jak `setAlertNight`).
7. Rano po nocy z gościem linia w raporcie (`later()`), po kradzieży z liczbą zabranych porcji.

Dzisiejsze wędrowce za dnia w symulacji (zagadać, napaść, wieść) zostają bez zmian obok gości z kart.

### Pies i kot

Flaga `dog` z karty „Pies przy siatce” wystawia pionek psa (nowy rodzaj `pies`, własny atlas rysowany kodem jak szwendacze, bez postaci z PixelLab; po śmierci nie wstaje i nie trafia do listy zmarłych): przychodzi zza siatki, kręci się po podwórku przy bramie, nocą leży przy bramie. Gdy wróg (szabrownik, szwendacz, wrogi człowiek) jest w promieniu 15 m, pies szczeka: napis nad nim, a w trybie zombie hałas (`addNoise`) w promieniu 12 m. Obrona z flagi zostaje. Kot z karty „Kot w piwnicy” (nowa flaga `cat`) to pionek `kot`, który śpi przy kozie zarządu i chodzi po mieszkaniu. Oba rysowane kodem, bez zamówienia w PixelLab; nie mają potrzeb i nie biorą poleceń. Zwierzę ginie od szwendacza tak jak człowiek (moja decyzja: pies tak, kot w środku nie).

## 4. Pamięć o znajomych

`GovState.znajomi?: Znajomy[]`:

```ts
interface Znajomy {
  id: string; osoba: Pick<Person, 'first' | 'name' | 'f' | 'age'>;
  kto: string;            // KtoId gościa albo 'lokator'
  jak: 'nakarmiony' | 'nocleg' | 'przyjety' | 'odprawiony' | 'okradl' | 'wyrzucony' | 'zlapany';
  nastawienie: number;    // −2..2
  dzien: number; wizyty: number;
}
```

- Wpis po każdej decyzji o gościu i po wyrzuceniu mieszkańca. Nastawienie: nakarmiony +1, nocleg +1, przyjęty +2, odprawiony 0 (−1, gdy chciał jedzenia, a zapasy były), okradł −1, złapany i wyrzucony −2, wyrzucony mieszkaniec −2.
- Powrót: w puli kart wydarzenie `powrot` z wagą od liczby znajomych sprzed co najmniej 2 dni, najwyżej raz na znajomego na 4 dni. Dodatni wraca jako gość z tą samą osobą i darem (brat albo siostra, czyli drugi gość do przyjęcia, worek jedzenia 2–4 porcji, wiadomość o miejscu). Ujemny w zwykłym trybie dołącza do najbliższego napadu: plan napadu dostaje `znajomy?: { imie: Tx; epitet: Tx }`, raport rano mówi „Wśród nich był X, ten od słoików”, a jeden z szabrowników ma jego wygląd. W trybie zombie ujemny nie wraca (moja decyzja).
- Epitet z tego, co się stało: „ten od słoików”, „ta, którą wyrzuciliście w deszcz”, w obu językach.

## 5. Łańcuchy, wątki sezonu i narrator

### Łańcuchy

Nowy moduł `src/gov/watki.ts`. Łańcuch to 2–4 kroki; krok to karta (`GEventDef`) z warunkiem na hak w stanie zarządu i najmniejszym odstępem od poprzedniego kroku. Hak to `GovState.watki.haki[id] = { t: minuta gry, d?: dane }`. Krok może planować gościa z ustalonymi klockami (chłopak z babcią pod bramą to gość z `kto: 'dziecko'`, `chce: 'nocleg'`).

Pula: 12 łańcuchów, w tym 3 tylko dla trybu zombie i 3 tylko dla zwykłego, reszta w obu. Przykład z rozmowy: światło w oknie naprzeciwko → rano chłopak z babcią → po 2 dobach babcia choruje, chłopak prosi o leki → dali: wiadomość o nieruszonej aptece (wskazówka na miejsce z okolicy kategorii apteka albo cel `apteka` z `TARGETS`); nie dali: chłopak zostaje znajomym z nastawieniem −2 (etap 4 robi resztę).

### Wątki sezonu

`GovState.watki.wybrane`: na początku gry (przy pierwszym wywołaniu wydarzeń) ziarno zarządu wybiera 3 łańcuchy z pasujących do trybu; tylko one mogą się zacząć. Pierwszy krok łańcucha wchodzi do zwykłej puli z wagą jak inne karty; kolejne kroki mają pierwszeństwo, kiedy ich hak dojrzał.

### Narrator

`GovState.napiecie?: number` (0–100): rośnie od napadu (+20, wtargnięcie +30), zgonu (+25), rany (+10), głodu (średnie jedzenie zarządu poniżej 30: +5 na godzinę gry), przerwania siatki w trybie zombie (+15); maleje o 2 na godzinę gry. Karty mają `ton?: 'ostre' | 'lagodne'` (bez pola: zwykłe). Przy napięciu powyżej 60 waga kart ostrych razy 0,3, łagodnych razy 2; poniżej 20 przez więcej niż dobę gry ostre razy 2, a goście częściej z haczykiem. Odstęp między kartami bez zmian.

## Pokaż i ślad na mapie

Prompt wydarzenia dostaje `gdzie?: { x: number; y: number }` (kafelki) z karty (`GEventDef.gdzie?(h, d)`). Karta z miejscem ma przycisk „Pokaż”, który przesuwa kamerę (`flyTo`) bez zamykania okna. Wpis w kronice zapisuje `gdzie` na później.

## Jak sprawdzamy

- Testy jednostkowe na etap: pule według trybu, awans i wyrzucenie w `applyGov`, gość od planu do bramy i każdy rozkaz, kradzież złapana i niezłapana, przemiana ugryzionego, pies szczeka przy wrogu, znajomy wraca i trafia do napadu, łańcuch przechodzi kroki, wybór wątków zależy tylko od ziarna, narrator zmienia wagi.
- Determinizm: ten sam skrót po kilku dobach z gośćmi, zapis i wczytanie w połowie wizyty nie zmienia przebiegu, stary zapis bez nowych pól się wczytuje.
- Spis kart (skrypt z oceny) po każdym etapie: w zwykłym trybie zero kart „Handlarz”, karta gościa tylko z pionkiem pod bramą, w zombie zero kart z listy wykluczonych, liczba kart na grę 30–40.
- Każda karta i każdy nowy napis bez polskich słów po angielsku (`tests/unit/zarzad-jezyk.test.ts` rozszerzony o nowe moduły).
- Zrzuty w Chromium (nowe scenariusze w `tools/shots.ts`): gość pod bramą z kartą i „Pokaż”, gość przy ognisku nocą, złapany złodziej, szwendacz w siatce, pies przy bramie, kot przy kozie, awans fachowca (karta osoby po awansie), po angielsku karta gościa.

## Co zostaje dla budującego

Podział na pliki poza wymienionymi, nazwy prac w symulacji, dokładne kafelki wejścia i ogniska, wygląd psa i kota w kodzie, liczby do strojenia botem (wagi klocków, progi narratora), brzmienie tekstów w granicach tonu, kolejność testów.

## Moje decyzje do przejrzenia

- Bez okna kroniki; „Pokaż” tylko na karcie.
- Bez nowych przedmiotów z grafiką jako śladu wyboru.
- `aktywisci`, `influencer`, `obserwacja` i `uchodzcy` wyłączone w trybie zombie; ślady z wariantem zombie.
- Głód sprawcy kradzieży jako próg potrzeby (20), bez liczenia godzin.
- Imiona gości z list 0.3 do czasu podpięcia generatora.
- Ujemny znajomy w trybie zombie nie wraca.
- Kot nie ginie w środku, pies może zginąć od szwendacza.
- Liczby narratora i nastawień jak wyżej, do strojenia.
