# M2, fala 1: przeszukiwanie, naprawy i budowa

Cel: po pierwszej nocy gracz ma co robić co minutę. Przeszukuje i naprawia puste mieszkania (materiały, nowe miejsca dla ludzi), stawia pierwsze budowle w pomieszczeniach i na podwórku, wzmacnia obwód. To odpowiedź na pierwszą uwagę Mateusza po playteście („nie wiedziałem, co budować”) i na jego pomysł z 18.10.2026: „W tych mieszkaniach to w sumie powinny być śmieci często do odzyskania albo coś do naprawienia”.

Rozstrzygnięcia w tym dokumencie są koordynatora, do zmiany przez Mateusza. Zasady budowania z `docs/M1-wycinek.md` obowiązują.

## Pętla fali 1

- Rano po pierwszej nocy cele dnia 2: przeszukać puste mieszkanie, rozebrać śmieci, zbudować warsztat, wzmocnić obwód, mieć drewno na noc.
- Materiały jako rzeczy na ziemi i w składzie: drewno (jest), deski, złom, części, jedzenie (jest), leki. Gruz to śmieci, z których rozbiórka daje deski i złom.
- Każda budowla i naprawa kosztuje materiały i pracę; materiały biorą się głównie z przeszukiwania i rozbiórki, więc gracz wybiera, co rozebrać, a co zostawić.

## Mieszkania

- Każde mieszkanie siedziby ma stan: `zarzad` (mieszkanie zarządu), `mieszkancy` (mieszkają ludzie), `puste` (z powodem `why` i rokiem `year` opuszczenia). Mniej więcej połowa pustych (potwierdzone przez Mateusza 18.10.2026).
- Powody (`why`): `wyjazd` (meble zostały), `wymarcie` (meble i rzeczy osobiste, stęchlizna), `splądrowanie` (przewrócone meble, śmieci, wyważone drzwi), `zalanie` (zalana podłoga, zniszczone meble, cieknąca rura), `pozar` (spalenizna, wybite okno, część mebli spalona).
- Do czasu generatora mieszkańców (sesja „Generowanie historii postaci w grze”, gałąź `mieszkancy-z-adresu`) stany losuje świat deterministycznie z ziarna budynku, w tym samym kształcie. Generator podmieni je w swoim kroku 5.

Kontrakt świata (`src/world`):

- `World.apts: AptState[]`, gdzie `AptState = { bid: number; apt: number; state: 'zarzad' | 'mieszkancy' | 'puste'; why?: 'wyjazd' | 'wymarcie' | 'splądrowanie' | 'zalanie' | 'pozar'; year?: number }`.
- Zawartość pustych mieszkań z powodu, deterministycznie: meble z `broken?: true` tam, gdzie zniszczone, sterty śmieci jako `World.props` `{ kind: 'smieci', x, y, w: 1, h: 1, n }`, uszkodzenia `World.damage: { kind: 'okno' | 'drzwi' | 'rura' | 'podloga' | 'piec'; tile: number; apt: number; bid: number }[]`.

Prace (`src/sim`):

- Przeszukać pomieszczenie: czas zależny od wielkości, łup z tabeli według `why` (deski, złom, części, czasem leki albo jedzenie), deterministycznie, raz na pomieszczenie.
- Rozebrać mebel albo śmieci: materiały (stół 2 deski, meblościanka 4 deski, kuchenka 2 złom, lodówka 3 złom i 1 część, śmieci według `n`).
- Naprawić uszkodzenie: koszt i czas (okno 2 deski, drzwi 3 deski, rura 1 złom i 1 część, podłoga 2 deski, piec 2 złom i 1 część).
- Zająć mieszkanie: mieszkanie staje się nasze. Po naprawie wszystkich uszkodzeń daje miejsca dla nowych mieszkańców (`cap` rośnie o liczbę łóżek).

## Budowa

- Menu budowy (przycisk na pasku i klawisz B): kategorie pomieszczenie, podwórko, obwód; przy każdej budowli koszt, czas i miejsce.
- Tryb stawiania: dozwolone kafelki podświetlone, plan (duch) idzie za kursorem albo palcem, lewy klik albo stuknięcie stawia, prawy klik, Esc albo przycisk anuluje. Gotowy plan czeka na mapie; zarząd sam przynosi materiały i buduje (praca `build`), gracz może wskazać, kto.
- Budowle fali 1 (koszty i czasy do strojenia botem):

| rodzaj | nazwa | miejsce | rozmiar | koszt | działanie |
|---|---|---|---|---|---|
| `warsztat` | Warsztat | pokój w naszym mieszkaniu | 2×1 | 4 deski, 2 złom | łaty i naprawy szybciej, rozbiórka daje więcej |
| `kuchnia_spoleczna` | Kuchnia społeczna | kuchnia w naszym mieszkaniu | 2×1 | 3 złom, 2 części | jedno gotowanie dla wszystkich, mniej jedzenia na osobę |
| `magazyn` | Magazyn | pokój w naszym mieszkaniu | 2×2 | 6 desek | zapasy w magazynie trudniej ukraść przy napadzie |
| `lozka_pietrowe` | Łóżka piętrowe | pokój w naszym mieszkaniu | 1×2 | 4 deski | 2 miejsca do spania, `cap` rośnie |
| `ogrodek` | Ogródek | podwórko | 3×2 | 2 deski | jedzenie po kilku dniach, zależne od pory roku |
| `zasieki` | Zasieki | obwód, w miejscu odcinka siatki | 1×1 | 3 złom | mocniejsze od siatki, szabrownik się rani |

Kontrakt symulacji (`src/sim`):

- `src/sim/budowle.ts`: `BuildKind` (rodzaje jak w tabeli), `BUILDS: Record<BuildKind, { name; place: 'pokoj' | 'kuchnia' | 'podworko' | 'obwod'; w; h; cost: Partial<Record<Mat, number>>; work: number }>` i `Mat = 'drewno' | 'deski' | 'zlom' | 'czesci' | 'jedzenie' | 'leki'`. Interfejs i rysowanie tylko to czytają.
- `canPlace(st, w, kind, x, y, rot): { ok: boolean; why?: string }`: czysta funkcja dla podglądu w trybie stawiania.
- Stan: `st.builds: { id; kind; x; y; rot; need; have; work; by }[]` (plany i budowy w toku); gotowa budowla to rzecz w `st.things` z `kind` równym rodzajowi budowli. `st.apts`: stan mieszkań w grze (nasze, naprawione, przeszukane pomieszczenia).
- Polecenia: `{ t: 'build', ids, kind, x, y, rot }`, `{ t: 'unbuild', ids, id }`, `{ t: 'search', ids, room }`, `{ t: 'dismantle', ids, thing }`, `{ t: 'repair', ids, damage }`, `{ t: 'claim', ids, apt }`. `commandsAt` dokłada w menu: „Przeszukać”, „Rozebrać”, „Naprawić”, „Zająć mieszkanie”.

## Rysowanie (`src/render`)

- Sprite'y budowli z tabeli (warsztat ze stołem z imadłem, kuchnia społeczna z kotłem, regały magazynu, łóżka piętrowe, grządki, drut kolczasty), śmieci w trzech wielkościach, zepsute meble.
- Uszkodzenia w przekroju: zalana podłoga, spalenizna, wybite okno, wyważone drzwi, cieknąca rura.
- Plan budowy jako półprzezroczysty duch z paskiem postępu; podgląd stawiania (`view.setPlacement`) z kafelkami dozwolonymi i niedozwolonymi.

## Interfejs (`src/ui`, `src/main.ts`)

- Przycisk „Budowa” i klawisz B, menu budowy, tryb stawiania z myszą i dotykiem, polecenia w menu pod prawym przyciskiem, pasek z deskami, złomem i częściami, karta mieszkania (stan, co do naprawy, co już przeszukane), cele dnia 2.

## Podział i kolejność

| Sesja | Pliki | Zakres |
|---|---|---|
| świat | `src/world/**` | `World.apts`, zawartość pustych mieszkań, `World.damage` |
| symulacja | `src/sim/**`, `tools/bot.ts` | materiały, `budowle.ts`, `canPlace`, prace, polecenia, stan mieszkań, bot dnia 2–5 |
| rysowanie | `src/render/**` (z grafiką) | sprite'y, uszkodzenia, duch planu, podgląd stawiania |
| interfejs | `src/ui/**`, `src/main.ts`, `index.html`, `src/style.css`, `src/gov/**` | menu budowy, tryb stawiania, polecenia, pasek, karta mieszkania, cele dnia 2 |

Wszyscy zaczynają od gałęzi `m2-fala-1` i trzymają się kontraktów z tego dokumentu. Zmiana kontraktu idzie najpierw do koordynatora. Kolejność łączenia: świat i symulacja, potem rysowanie i interfejs, na końcu bramka całej fali.

## Bramka fali 1

- Dzień 2 i 3 dają decyzję co najmniej raz na minutę przy ekranie (bot liczy, playtest sprawdza).
- Bot: dni 2–5 z przeszukiwaniem, rozbiórką i budową; przy przeszukiwaniu da się postawić 2–3 budowle do trzeciego dnia, bez niego nie.
- Testy, lint, build, bot, zrzuty (menu budowy, tryb stawiania, puste mieszkania w przekroju, budowle), wydajność bez spadku.
