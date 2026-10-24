/* Łańcuchy kart i wątki sezonu zarządu (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 5). Łańcuch to
   2–4 kroki; krok to karta (`GEventDef`) z numerem w łańcuchu, najmniejszym odstępem w godzinach gry i, od drugiego kroku,
   wymaganym hakiem. Hak to fakt w stanie zarządu (`GovState.watki.haki[id] = { t, d? }`, `t` w minutach gry od północy
   pierwszego dnia), który ustawia wybór gracza na karcie przez `GovHost.hak(id, d?)`; następny krok wypada dopiero wtedy,
   gdy hak istnieje od `po` godzin gry. Ten moduł to sam silnik: stan, wybór wątków i gotowość kroków. Pulę, pierwszeństwo
   dojrzałych kroków i pacing ma `eventTick` (wydarzenia.ts), a dwanaście prawdziwych łańcuchów leży w watki-tresc.ts i
   jest tu `LANCUCHY`.

   Kontrakt.
   - Pusta lista (albo żaden łańcuch nie pasuje do trybu) nie robi nic: żadnego losowania z ziarna zarządu, żadnego zapisu
     w `GovState.watki`, więc skróty gry bez łańcuchów zostają takie jak przed silnikiem. Stan `watki` powstaje dopiero przy
     wyborze wątków albo pierwszym haku.
   - Wątki sezonu: `wybierzWatki` raz na grę (przy pierwszym `eventTick` z niepustą listą pasujących łańcuchów, także w starym
     zapisie bez `watki`) losuje z ziarna zarządu (Fisher-Yates, jak `EventHost.shuffle`) do trzech łańcuchów z pasujących do
     trybu (mniej, gdy tyle nie pasuje) i zapisuje je w `watki.wybrane`; tylko wybrane mogą się zacząć. W grze bez obcych
     (`GovInput.goscie` brak) do wyboru nie wchodzą łańcuchy z jakimkolwiek krokiem z gościem (`GEventDef.gosc`): nie mogłyby
     się skończyć i zajmowałyby jedno z trzech miejsc na zawsze. Wybór zależy więc od ziarna, trybu i tego, czy gra ma obcych.
   - Przebieg łańcucha: `watki.krok[id]` to numer ostatniego rozpoczętego kroku (0 albo brak: żaden). Krok zaczyna się, gdy
     `eventTick` go wylosuje (karta otwiera się od razu albo, dla kroku z gościem, czeka pod bramą); rozstrzyga się, gdy gracz
     zamknie kartę wyborem, i wtedy silnik zapisuje hak o id tego kroku (`haki[krok.id]`, czas rozstrzygnięcia). Łańcuch nigdy
     nie prowadzi dwóch kroków naraz: następny jest gotowy dopiero po rozstrzygnięciu poprzedniego.
   - Gotowość (`krokiGotowe`): pierwszy krok wybranego łańcucha jest gotowy od razu; krok `nr > 1` z `hak` jest gotowy, gdy
     ten hak istnieje od `po` godzin gry, a bez `hak` po `po` godzinach od rozstrzygnięcia poprzedniego kroku. Kroki dojrzałe
     (`nr > 1`) idą w kolejności dojrzewania (czas haka plus `po` godzin, wcześniej dojrzały pierwszy; remis: kolejność
     `watki.wybrane`), potem pierwsze kroki w kolejności `watki.wybrane`.
   - Cicho kończące się łańcuchy (`porzadkuj`, co sekundę z `eventTick`): rozpoczęty krok, którego karta ani wizyta już nie
     istnieje, a gracz go nie rozstrzygnął (gość nie doszedł do bramy, zginął albo odszedł, zanim ktokolwiek zdecydował), kończy
     łańcuch bez wpisu; tak samo łańcuch z gościem w grze bez obcych (jeszcze niezaczęty z jakimkolwiek krokiem z gościem albo
     z następnym krokiem z gościem; to dla zapisu wczytanego do gry bez obcych, bo tam łańcuchów z gościem się nie wybiera).
     Krok z gościem, któremu `GEventDef.gosc` nie wystawiło nikogo, nie otwiera się bez gościa (`eventTick`): jest rozpoczęty,
     więc łańcuch kończy się po cichu. Skończony łańcuch ma `krok[id]` równy liczbie jego kroków.
   - Ids haków: przez konwencję zaczynają się od id łańcucha i kropki (`swiatlo.dali`); `sprawdzLancuch` i `sprawdzLancuchy` (cała
     lista: także powtórzone id kroku w dwóch łańcuchach) to sprawdzają. Dane haka
     `d` to zwykły JSON (kopia przez JSON, więc taka, jaką zapis odtworzy; `Tx` w środku jest zwykłym obiektem `{ pl, en }`
     i przechodzi zapis bez zmian).
   - Wszystko deterministyczne: jedyne losowanie to Fisher-Yates wyboru wątków z `GovState.rng`. */

import { rngOf } from '../core/rng.ts';
import type { GEventDef } from './tresc.ts';
import type { GameMode, GovInput, GovState } from './typy.ts';
import { LANCUCHY_TRESC } from './watki-tresc.ts';

/** krok łańcucha: karta z numerem (od 1, równym miejscu w `Lancuch.kroki` plus 1), odstępem w godzinach gry (`po`) i, od
    drugiego kroku, wymaganym hakiem; bez haka odstęp liczy się od rozstrzygnięcia poprzedniego kroku. Pierwszy krok nie
    czeka na nic (`po` i `hak` ignoruje). Krok może planować gościa z klocków przez `GEventDef.gosc`, jak karty z 0.3. */
export interface Krok extends GEventDef {
  lancuch: string;
  nr: number;
  /** najmniej godzin gry od haka, którego krok wymaga (albo od rozstrzygnięcia poprzedniego kroku) */
  po: number;
  /** wymagany hak (id z konwencją `lancuch.nazwa`) */
  hak?: string;
  /** Karta, która ma sens tylko chwilę (handlarz pod bramą stoi najwyżej kilka godzin gry): dojrzały i dostępny (`w(h) > 0`) krok
      wypada od razu, bez czekania na odstęp między wydarzeniami i na losowanie, ale najwcześniej `QUIET` sekund po ostatniej decyzji
      gracza i nie pierwszej nocy. Tego kroku nie obejmuje szansa `SZANSA_KROKU` ani kolejność dojrzewania, więc niczego nie losuje.
      Krok pilny nie ma gościa (`gosc`): karta z gościem czeka, aż grupa dojdzie do bramy, więc nie mogłaby wypaść od razu
      (`sprawdzLancuch` to odrzuca). */
  pilny?: boolean;
}

export interface Lancuch {
  id: string;
  /** w jakich trybach łańcuch może zostać wybrany na wątek sezonu */
  tryby: readonly GameMode[];
  kroki: readonly Krok[];
  /** Łańcuch potrzebuje obcych w grze (`GovInput.goscie`): wybiera go się tylko w grze z obcymi. Brak pola znaczy: tak, gdy
      któryś krok ma `gosc`; „Dług” podaje `true` jawnie, bo jego kroki czekają na handlarza pod bramą, a nie na gościa. */
  obcy?: boolean;
  /** Łańcuch potrzebuje mieszkańców z generatora (`GovInput.lokatorzy`: jego bohater to prawdziwy mieszkaniec siedziby);
      w grze bez nich go się nie wybiera. */
  lokatorzy?: boolean;
}

/** ile wątków sezonu wybiera się na grę */
export const WATKOW = 3;
/** szansa przy każdym losowaniu, że krok z dojrzałym hakiem wypadnie przed zwykłą pulą */
export const SZANSA_KROKU = 0.6;

/** prawdziwe łańcuchy gry: dwanaście, z src/gov/watki-tresc.ts */
export const LANCUCHY: readonly Lancuch[] = LANCUCHY_TRESC;

let rejestr: readonly Lancuch[] = LANCUCHY;
let indeks: Map<string, Krok> | null = null;

/** łańcuchy, które silnik uwzględnia: produkcyjne `LANCUCHY` albo lista podstawiona w teście */
export const lancuchy = (): readonly Lancuch[] => rejestr;

/** Tylko dla testów: podstawia listę łańcuchów zamiast `LANCUCHY` (null: z powrotem produkcyjna). */
export function podmienLancuchy(l: readonly Lancuch[] | null): void {
  rejestr = l ?? LANCUCHY;
  indeks = null;
}

const lancuch = (id: string): Lancuch | undefined => rejestr.find((l) => l.id === id);

/** krok o tym id karty (id kroku jest unikalny w całej grze); undefined: to nie krok łańcucha */
export function krokPoId(id: string): Krok | undefined {
  if (!indeks) {
    indeks = new Map();
    for (const l of rejestr) for (const k of l.kroki) indeks.set(k.id, k);
  }
  return indeks.get(id);
}

export const jestKrok = (e: GEventDef): e is Krok => krokPoId(e.id) === e;

/** stan wątków; pole `wybrane` puste znaczy, że wątki jeszcze nie były wybierane (pole mógł założyć już pierwszy hak) */
function stanWatkow(st: GovState): NonNullable<GovState['watki']> {
  return (st.watki ??= { wybrane: [], haki: {}, krok: {} });
}

/** czy któryś krok łańcucha wystawia gościa (`GEventDef.gosc`) */
const wymagaObcych = (l: Lancuch): boolean => l.obcy ?? l.kroki.some((k) => k.gosc !== undefined);

/** Wybór wątków sezonu: do `WATKOW` łańcuchów z pasujących do trybu, Fisher-Yates z ziarna zarządu, raz na grę (kolejne
    wołania oddają to samo bez losowania). W grze bez obcych (`bezObcych`) odpadają łańcuchy, które ich wymagają (`Lancuch.obcy`), a w grze bez mieszkańców z generatora (`bezLokatorow`) te z `Lancuch.lokatorzy`. Gdy żaden
    łańcuch nie pasuje, nic nie losuje i nic nie zapisuje. */
export function wybierzWatki(st: GovState, mode: GameMode, bezObcych = false, bezLokatorow = false): string[] {
  if (st.watki?.wybrane.length) return [...st.watki.wybrane];
  const ids = rejestr
    .filter((l) => l.tryby.includes(mode) && !(bezObcych && wymagaObcych(l)) && !(bezLokatorow && l.lokatorzy))
    .map((l) => l.id);
  if (!ids.length) return [];
  const r = rngOf(st.rng);
  for (let k = ids.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [ids[k], ids[j]] = [ids[j], ids[k]];
  }
  const w = stanWatkow(st);
  w.wybrane = ids.slice(0, WATKOW);
  return [...w.wybrane];
}

/** Ustawia hak `id` w minucie gry `t` (ponowne ustawienie przesuwa czas). Dane `d` to zwykły JSON: zapisuje się ich kopia
    przez JSON, czyli taka, jaką odtworzy zapis. */
export function hak(st: GovState, id: string, t: number, d?: unknown): void {
  stanWatkow(st).haki[id] = d === undefined ? { t } : { t, d: JSON.parse(JSON.stringify(d)) };
}

/** hak o danym id (kopia) albo null */
export function hakDane(st: GovState, id: string): { t: number; d?: unknown } | null {
  const x = st.watki?.haki[id];
  return x ? JSON.parse(JSON.stringify(x)) : null;
}

/** czy krok jest rozstrzygnięty: silnik zapisał hak o jego id, kiedy gracz zamknął kartę wyborem */
const rozstrzygniety = (w: NonNullable<GovState['watki']>, k: Krok): boolean => w.haki[k.id] !== undefined;

/** Kroki, które mogą teraz wypaść z wybranych łańcuchów pasujących do trybu: dojrzałe (nr > 1, w kolejności dojrzewania:
    czas haka plus `po` godzin, remis w kolejności `wybrane`), potem pierwsze kroki łańcuchów, które się jeszcze nie zaczęły. `t` to minuta gry. Czyta stan, niczego nie losuje. */
export function krokiGotowe(st: GovState, t: number, mode: GameMode): Krok[] {
  const w = st.watki;
  if (!w) return [];
  const dojrzale: { k: Krok; od: number }[] = [];
  const pierwsze: Krok[] = [];
  for (const id of w.wybrane) {
    const l = lancuch(id);
    if (!l?.tryby.includes(mode)) continue;
    const nr = w.krok[id] ?? 0;
    if (nr >= l.kroki.length) continue;
    if (nr === 0) {
      pierwsze.push(l.kroki[0]);
      continue;
    }
    const poprzedni = l.kroki[nr - 1];
    if (!rozstrzygniety(w, poprzedni)) continue;
    const k = l.kroki[nr];
    const hakK = k.hak ? w.haki[k.hak] : w.haki[poprzedni.id];
    if (hakK && t - hakK.t >= k.po * 60) dojrzale.push({ k, od: hakK.t + k.po * 60 });
  }
  // sort jest stabilny (ES2019): remis czasu dojrzewania zostaje w kolejności `wybrane`
  dojrzale.sort((a, b) => a.od - b.od);
  return [...dojrzale.map((x) => x.k), ...pierwsze];
}

/** Krok został wylosowany (karta otwiera się albo gość idzie pod bramę): łańcuch jest na tym kroku. */
export function rozpocznijKrok(st: GovState, k: Krok): void {
  stanWatkow(st).krok[k.lancuch] = k.nr;
}

/** Gracz zamknął kartę kroku wyborem: hak o id kroku z minutą gry (kolejny krok liczy od niego odstęp, gdy nie ma `hak`). */
export function rozstrzygnijKrok(st: GovState, id: string, t: number): void {
  const k = krokPoId(id);
  if (!k || !st.watki) return;
  st.watki.haki[id] ??= { t };
}

/** Łańcuch kończy się po cichu: nic już z niego nie wypadnie. */
function zakoncz(st: GovState, l: Lancuch): void {
  stanWatkow(st).krok[l.id] = l.kroki.length;
}

/** Sprzątanie łańcuchów (co sekundę z `eventTick`, po `goscTick`): łańcuch, którego rozpoczęty krok nie jest ani otwartą
    kartą, ani prowadzoną wizytą, a nie został rozstrzygnięty, kończy się po cichu; tak samo w grze bez obcych
    (`GovInput.goscie` brak) łańcuch niezaczęty z jakimkolwiek krokiem z gościem i zaczęty z następnym krokiem z gościem.
    Bez `watki` nic nie robi. */
export function porzadkuj(st: GovState, i: Pick<GovInput, 'goscie'>): void {
  const w = st.watki;
  if (!w) return;
  const otwarta = st.ev.active?.id;
  const wizyta = st.goscie?.aktywny;
  const kartaWizyty = wizyta && !wizyta.koniec ? wizyta.kartaId : undefined;
  for (const id of w.wybrane) {
    const l = lancuch(id);
    if (!l) continue;
    const nr = w.krok[id] ?? 0;
    if (nr >= l.kroki.length) continue;
    if (nr === 0) {
      if (!i.goscie && wymagaObcych(l)) zakoncz(st, l);
      continue;
    }
    const k = l.kroki[nr - 1];
    if (!rozstrzygniety(w, k)) {
      if (k.id !== otwarta && k.id !== kartaWizyty) zakoncz(st, l);
    } else if (l.kroki[nr].gosc && !i.goscie) zakoncz(st, l);
  }
}

/** Sprawdza łańcuch pod założenia silnika i konwencje; oddaje listę usterek (pustą, gdy wszystko gra). `zajete` to id kart,
    których kroki nie mogą powtórzyć (karty zwykłej puli i kroki innych łańcuchów); id powtórzone w samym łańcuchu też są
    usterką. Dla testów treści łańcuchów; całą listę sprawdza `sprawdzLancuchy`. */
export function sprawdzLancuch(l: Lancuch, zajete: ReadonlySet<string> = new Set()): string[] {
  const bledy: string[] = [];
  const swoje = new Set<string>();
  if (l.kroki.length < 2 || l.kroki.length > 4) bledy.push(`${l.id}: ${l.kroki.length} kroków zamiast 2–4`);
  if (!l.tryby.length) bledy.push(`${l.id}: brak trybów`);
  l.kroki.forEach((k, n) => {
    if (k.lancuch !== l.id) bledy.push(`${k.id}: lancuch ${k.lancuch} zamiast ${l.id}`);
    if (k.nr !== n + 1) bledy.push(`${k.id}: nr ${k.nr} zamiast ${n + 1}`);
    if (zajete.has(k.id)) bledy.push(`${k.id}: id zajęte przez kartę puli albo krok innego łańcucha`);
    if (swoje.has(k.id)) bledy.push(`${k.id}: id powtórzone w łańcuchu ${l.id}`);
    swoje.add(k.id);
    if (n === 0 && k.hak) bledy.push(`${k.id}: pierwszy krok nie czeka na hak`);
    if (k.hak && !k.hak.startsWith(`${l.id}.`)) bledy.push(`${k.id}: hak ${k.hak} poza przestrzenią ${l.id}.`);
    if (!(k.po >= 0)) bledy.push(`${k.id}: po ${k.po}`);
    if (k.pilny && k.gosc) bledy.push(`${k.id}: krok pilny z gościem (karta wypadłaby przed gościem pod bramą)`);
  });
  return bledy;
}

/** Sprawdza całą listę łańcuchów: każdy przez `sprawdzLancuch`, a do tego unikalność id łańcuchów i id kroków w całej liście
    (to samo id kroku w dwóch łańcuchach, bo id kroku to id karty w grze) oraz względem `zajete` (karty zwykłej puli). */
export function sprawdzLancuchy(lista: readonly Lancuch[], zajete: ReadonlySet<string> = new Set()): string[] {
  const bledy: string[] = [];
  const kroki = new Set(zajete);
  const lancuchy = new Set<string>();
  for (const l of lista) {
    if (lancuchy.has(l.id)) bledy.push(`${l.id}: łańcuch powtórzony na liście`);
    lancuchy.add(l.id);
    bledy.push(...sprawdzLancuch(l, kroki));
    for (const k of l.kroki) kroki.add(k.id);
  }
  return bledy;
}
