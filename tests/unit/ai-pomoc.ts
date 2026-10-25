/* Wspólne pomocniki testów silnika osady AI (tests/unit/ai-*.test.ts), etap 1 osady AI
   (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md): tick danego dnia gry, rzecz do dołożenia do stanu gry i ręce-szpieg,
   które tylko zapisują ruchy decydenta. Testy zimy, jedzenia i rozwoju miały po własnej kopii każdego z nich; tu jest jedna,
   a szpieg zapisuje wszystko naraz (ruchy jako tekst, polecenia gry, wyprawy i uchwały), żeby każdy test brał to, co mu trzeba.
   Do tego świeży świat dema (`swiezySwiat`) dla testów, które porównują kilka gier: gra zmienia swój świat w miejscu.

   Gry-prefiksy (etap 2, zadanie 1): wiele testów jednego pliku zaczyna od tej samej gry (to samo demo, ziarno, opcje i decydent)
   rozegranej do tej samej chwili, a gra kosztuje około 0,3–1 s na dobę. `graDoTicku` i `graPoDniach` liczą taką grę raz na plik
   testów (pamięć procesu, więc każdy plik ma własną): rozgrywają ją od zera albo od najbliższego wcześniejszego punktu kontrolnego
   i zostawiają punkt na każdej granicy doby, a testowi oddają zawsze nową, niezależną grę wczytaną z zapisu (`zapiszGre` i
   `wczytajGre`, świeży świat), więc to, co test z nią zrobi, nie wraca do pamięci. Wczytana gra idzie dalej tak samo jak ta bez
   przerwy (pilnują tego testy determinizmu, a `graPoDniach` ma własny test w ai-pomoc.test.ts). Nie nadaje się do testów, które
   porównują grę ciągłą z wczytaną (tę ciągłą trzeba zagrać bez przerw). `krokGry` łapie błędy decydenta (gra idzie dalej, błąd jest
   tylko w `GraAi.bledy`, który nie wchodzi do zapisu), więc test całej gry nie widziałby wyjątku z silnika; dlatego pomocnik
   sprawdza każdy odcinek, zanim zrobi z niego punkt kontrolny, i rzuca z pierwszym zachowanym błędem. To samo dotyczy każdej
   gry zagranej w teście wprost (`grajDo`, `krokGry`): `krokGry` łapie też nieudaną asercję w haku decydenta (np. w `przed` testów
   dyżuru), więc po takiej grze test sprawdza `expect(g.bledy).toEqual([])`. Gry, które same grają z decydentem rzucającym (testy
   w ai-gra.test.ts), nie idą przez pomocnika. Dziennik ruchów (opcja `dziennik`) nie wchodzi do zapisu
   gry, więc pomocnik trzyma go osobno przy punkcie kontrolnym i wstawia do wczytanej gry. Plik nie jest testem (nazwa bez
   `.test`) i niczego nie sprawdza. */

import fs from 'node:fs';
import path from 'node:path';
import {
  type Decydent,
  type GraAi,
  grajDo,
  nowaGraAi,
  type OpcjeGryAi,
  type Rece,
  type RuchRak,
  wczytajGre,
  type ZapisGryAi,
  zapiszGre,
} from '../../src/ai/gra.ts';
import { pokojZarzadu } from '../../src/ai/miejsca.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { hashString } from '../../src/core/rng.ts';
import type { Cel } from '../../src/gov/wyprawy.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { houseOf } from '../../src/sim/house.ts';
import type { Command, Thing } from '../../src/sim/sim.ts';
import { buildWorld, type World } from '../../src/world/world.ts';

/** Świeży świat dema, zbudowany tak jak `demoWorld` z tests/unit/sasiedzi-pomoc.ts (ziarno z adresu), ale bez pamięci
    podręcznej. Gra zmienia siatkę swojego świata w miejscu (`ustawSiatke`, `initFence` i `dociagnijSiatke` w src/sim/sim.ts:
    ścięte drzewo z linii obwodu staje się kafelkiem siatki, a przywrócenie nie jest dokładną odwrotnością), więc druga gra
    na tym samym obiekcie świata startuje od innego stanu niż pierwsza. Test, który porównuje kilka gier (równoważność z
    `playWithGov`, przeplot, zapis i wczytanie), daje każdej własny świat; w przeglądarce każdy start też buduje świat od
    nowa. Budowa trwa 20–60 ms. */
export function swiezySwiat(klucz: string): World {
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${klucz}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** tick danego dnia gry o pełnej godzinie (gra zaczyna się o 15:00 dnia 1; godzina przed 15:00 to ten sam dzień) */
export const tickDnia = (dzien: number, godzina: number): number =>
  (dzien - 1) * TICKS_PER_DAY + (godzina - 15) * TICKS_PER_HOUR;

/** czy koza z beczki stoi w pokoju, w którym śpi zarząd */
export function kozaWPokoju(g: GraAi): boolean {
  const pokoj = pokojZarzadu(g.sim.st, g.w);
  const h = houseOf(g.w)!;
  return pokoj >= 0 && g.sim.st.things.some((t) => t.kind === 'koza_beczka' && h.room[t.y * g.w.size + t.x] === pokoj);
}

/** rzecz z gry (do dokładania w testach: drewno, jedzenie, sterty) */
export function rzecz(g: GraAi, kind: string, x: number, y: number, n = 0): Thing {
  return { id: g.sim.st.nextThing++, kind, x, y, w: 1, h: 1, rot: 0, n, fuel: 0, by: -1, owner: -1 };
}

/** Ruchy ręki-szpiega: co zrobił decydent, w kilku widokach naraz. */
export interface Szpieg {
  r: Rece;
  /** wszystkie ruchy po kolei jako tekst: `polecenie:{json}`, `raport`, `uchwala:id`, `noc:osoba=klucz`, `zatwierdz`,
      `wydarzenie:k`, `dalej`, `wyprawa` */
  ruchy: string[];
  /** polecenia gry po kolei (`Rece.polecenie`) */
  polecenia: Command[];
  /** wyprawy wysłane ręką `wyslij` (zawsze się udają) */
  wyslano: { cel: Cel; ids: string[] }[];
  /** uchwały podpisane ręką `podpisz` (null: zarząd nic nie uchwala) */
  uchwaly: (string | null)[];
}

/** Ręce, które tylko zapisują ruchy. Przydział odmawia, gdy klucz jest na liście `odmow` (reszta się udaje), wyprawa zawsze
    się udaje. */
export function szpieg(odmow: readonly string[] = []): Szpieg {
  const ruchy: string[] = [];
  const polecenia: Command[] = [];
  const wyslano: Szpieg['wyslano'] = [];
  const uchwaly: (string | null)[] = [];
  const r: Rece = {
    polecenie: (c) => {
      polecenia.push(structuredClone(c));
      ruchy.push(`polecenie:${JSON.stringify(c)}`);
    },
    potwierdzRaport: () => ruchy.push('raport'),
    podpisz: (id) => {
      uchwaly.push(id);
      ruchy.push(`uchwala:${id}`);
    },
    przydziel: (osoba, klucz) => {
      if (odmow.includes(klucz)) return false;
      ruchy.push(`noc:${osoba}=${klucz}`);
      return true;
    },
    zatwierdzNoc: () => ruchy.push('zatwierdz'),
    wybierz: (k) => ruchy.push(`wydarzenie:${k}`),
    grajDalej: () => ruchy.push('dalej'),
    wyslij: (cel, ids) => {
      wyslano.push({ cel, ids });
      ruchy.push('wyprawa');
      return true;
    },
  };
  return { r, ruchy, polecenia, wyslano, uchwaly };
}

// ---------------------------------------------------------------- gry-prefiksy liczone raz na plik

/** punkt kontrolny gry: zapis w danym ticku i (dla gry z opcją `dziennik`) dziennik ruchów do tej chwili */
interface PunktGry {
  tick: number;
  zapis: ZapisGryAi;
  dziennik?: RuchRak[];
}

/** punkty kontrolne wedle klucza gry (demo, ziarno, decydent, opcje), rosnąco po ticku; pamięć procesu, czyli jednego pliku testów */
const punktyGier = new Map<string, PunktGry[]>();
/** numery decydentów do klucza gry: różni decydenci (np. `silnik` i jego wariant z testu) mają osobne punkty kontrolne */
const numeryDecydentow = new WeakMap<Decydent, number>();
let ostatniNumerDecydenta = 0;

function kluczGry(demo: string, ziarno: number, opcje: OpcjeGryAi, decydent: Decydent): string {
  let numer = numeryDecydentow.get(decydent);
  if (numer === undefined) {
    numer = ++ostatniNumerDecydenta;
    numeryDecydentow.set(decydent, numer);
  }
  return `${demo}|${ziarno}|${numer}|${JSON.stringify(opcje)}`;
}

/** Gra `demo` z `ziarno` i `opcje` rozegrana decydentem (domyślnie `silnik`) do ticku `tick` albo do końca gry, jeśli ten
    przyjdzie wcześniej. Pierwsze wywołanie dla danej gry rozgrywa ją od zera (albo od najbliższego wcześniejszego punktu) i zapisuje
    punkty kontrolne na granicach dób oraz w `tick`; kolejne biorą punkt z pamięci. Zawsze oddaje nową grę ze świeżym światem
    wczytaną z zapisu, niezależną od innych wywołań. Z opcją `dziennik` gra ma też dziennik ruchów od ticku 0 (kopia z punktu). */
export function graDoTicku(
  demo: string,
  ziarno: number,
  tick: number,
  opcje: OpcjeGryAi = {},
  decydent: Decydent = silnik,
): GraAi {
  const klucz = kluczGry(demo, ziarno, opcje, decydent);
  const punkty = punktyGier.get(klucz) ?? [];
  punktyGier.set(klucz, punkty);
  /** gra wczytana z punktu, z jego dziennikiem (zapis dziennika nie zawiera) */
  const zPunktu = (p: PunktGry): GraAi => {
    const g = wczytajGre(swiezySwiat(demo), p.zapis);
    if (p.dziennik) g.dziennik = structuredClone(p.dziennik);
    return g;
  };
  let punkt = punkty.findLast((p) => p.tick <= tick);
  if (punkt?.tick !== tick) {
    const g = punkt ? zPunktu(punkt) : nowaGraAi(swiezySwiat(demo), ziarno, { ...opcje });
    const zapamietaj = (): PunktGry => {
      // odcinek z błędem decydenta nie staje się punktem: wczytana z niego gra miałaby pustą listę błędów i test niczego by nie zauważył
      if (g.bledowRazem > 0) {
        const razy = `${g.bledowRazem} ${g.bledowRazem === 1 ? 'raz' : 'razy'}`;
        throw new Error(
          `graDoTicku: decydent rzucił błąd w grze (${razy}, w pamięci ostatnie ${g.bledy.length}); najwcześniejszy zachowany: ${JSON.stringify(g.bledy[0])}`,
        );
      }
      const nowy: PunktGry = { tick: g.sim.st.tick, zapis: zapiszGre(g) };
      if (g.dziennik) nowy.dziennik = structuredClone(g.dziennik);
      if (!punkty.some((p) => p.tick === nowy.tick)) punkty.push(nowy);
      punkty.sort((a, b) => a.tick - b.tick);
      return nowy;
    };
    // kolejne granice dób, żeby późniejsze pytania o wcześniejszą chwilę nie liczyły gry od zera
    for (
      let granica = (Math.floor(g.sim.st.tick / TICKS_PER_DAY) + 1) * TICKS_PER_DAY;
      granica < tick;
      granica += TICKS_PER_DAY
    ) {
      grajDo(g, decydent, granica);
      zapamietaj();
    }
    grajDo(g, decydent, tick);
    punkt = zapamietaj();
  }
  return zPunktu(punkt);
}

/** `graDoTicku` w dobach od startu gry (o 15:00 dnia 1): `dni` może mieć część ułamkową */
export function graPoDniach(
  demo: string,
  ziarno: number,
  dni: number,
  opcje: OpcjeGryAi = {},
  decydent: Decydent = silnik,
): GraAi {
  return graDoTicku(demo, ziarno, Math.round(dni * TICKS_PER_DAY), opcje, decydent);
}
