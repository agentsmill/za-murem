/* Warunki zwycięstwa, etap 1 (docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md): pięć dróg, ich kamienie
   milowe i krok zarządu, który je zalicza. Funkcje na `GovInput` i `GovState`, bez symulacji (src/gov nie importuje
   src/sim), bez rysowania i bez losowania: ten sam ciąg wejść daje ten sam stan, także po zapisie i wczytaniu. Czyste
   (nic nie zmieniają) są `ocenDrogi`, `celLudnosci`, `ludnoscOf` i `nazwaDrogi`; stan zmieniają tylko `wlaczZwyciestwo`,
   `krokZwyciestwa`, `grajDalej` i `wygrajDroge`, i to wyłącznie `GovState.zwyciestwo` (krok także kronikę: `st.log`
   i `fx.log`).

   Drogi: `technologia` („Prąd bez miedzi”), `teren` („Za Murem”), `lek`, `ludnosc` („Nowe osiedle”) i `cuda`. Na tym
   etapie gotowa jest ludnościowa w całości i pierwszy kamień terenu; technologia, lek i cuda czekają na projekty, na
   których stoją, więc ekran dróg pokazuje przy nich „Wkrótce: …” (`PostepDrogi.wkrotce`), dopóki droga nie jest przebyta
   do końca. Treść dróg (`DROGI`) jest w obu językach (Tx); nazwa drogi leku zależy od trybu gry (`nazwaDrogi`).

   Co dalej (`PostepDrogi.dalej`). Droga, którą da się grać już teraz (ludność w całości, pierwszy kamień terenu), mówi
   jednym zdaniem, co zrobić, żeby zaliczyć jej następny kamień: ludność „Zbierzcie N osób pod zarządem.” (N to próg
   kamienia, z polską liczbą mnogą), przy ostatnim kamieniu „Utrzymajcie cel 7 poranków z rzędu: …” z licznikiem poranków
   „(n z 7)”, teren „Otoczcie wspólnym płotem pierwszy sąsiedni budynek.”. Droga z „Wkrótce” i droga przebyta do końca nie
   mają zdania (`null`), więc „Wkrótce” i „co dalej” nigdy nie występują razem. Licznik poranków jest też liczbami
   w `PostepDrogi.seria` (`{ dni, z }`, tylko ludność).

   Stan (`GovState.zwyciestwo`, `StanZwyciestwa`) powstaje dopiero po `wlaczZwyciestwo`, tak jak `miasto` po `wlaczMiasto`
   (src/gov/wyprawy.ts): `newGov` go nie ma, `krokZwyciestwa` bez niego nie robi nic, więc skróty zarządu w botach i testach
   bez tej opcji zostają bez zmian. Gra włącza drogi przy nowej grze i przy wczytaniu starego zapisu (`enter` w src/main.ts,
   zaraz po `wlaczMiasto`); testy włączają je same, gdy je sprawdzają. Kamienie, które stan już spełnia, zapisują się wtedy
   raz (jeden wpis w kronice na kamień, potem cisza), a epilog nie przychodzi wstecz: zwycięstwo ludnościowe wymaga siedmiu
   poranków liczonych od włączenia.

   Kamienie. `kamienie[droga]` to liczba zaliczonych kamieni: rośnie po jednym, nigdy nie maleje (ludność spadła, kamień
   zostaje) i dostaje jeden wpis w kronice (`big`): „Droga „{nazwa}”: {kamień}.”. Kamień zalicza się po kolei, a odczyt
   spełnia zawsze początek listy (`spelnione`). `ocenDrogi` czyta zapisane kamienie, więc ekran dróg zgadza się z kroniką.
   - ludność: progi 10, 25 i 50 osób, potem połowa celu (`Math.ceil(cel / 2)`); piąty kamień to licznik 7 poranków;
   - teren: pierwszy kamień, gdy wspólny płot dołączył do naszego obwodu choć jeden budynek (`GovInput.teren`);
   - technologia, lek, cuda: jeszcze żaden, bo nie ma odczytu; dojdą z projektami, na których stoją.

   Ludność (`ludnoscOf`) to `GovInput.ludnosc` (zarząd i mieszkańcy pod zarządem), a bez pola zarząd i mieszkańcy
   siedziby (`people.length + residents`). Cel (`celLudnosci`) to połowa ludności kwadratu domu z 2021 roku
   (`GovInput.ludnosc2021`), nie mniej niż 120 i nie więcej niż 500; bez danych albo z liczbą bez sensu (0, ujemna, NaN,
   nieskończona) 250; w trybie zombie połowa tego (60–250). Cel nigdy nie jest zerem, NaN ani spoza przedziału.

   Cel zamrożony (`StanZwyciestwa.cel`). Pierwszy krok z użytecznymi danymi (`ludnosc2021` liczbą skończoną i dodatnią)
   zapisuje cel w stanie, a od tej chwili cała droga ludnościowa (progi kamieni, licznik, `ocenDrogi`) bierze zapisany
   cel, nie bieżący odczyt. Dzięki temu gra wznowiona bez tabel mieszkańców albo po zmianie generatora nie przestawia
   celu w trakcie licznika siedmiu dni (z 500 po cichu na 250). Bez danych i bez zapisanego celu cel liczy się na
   bieżąco jak dotąd; stary zapis bez pola działa tak samo, a zamrozi się przy pierwszych danych.

   Licznik celu (`dniCelu`). Dzień gry liczy się raz na zmianę `GovInput.day` (`ostatniDzien`), rano od 6:00, więc to doby gry,
   a nie sekundy przy ekranie. O tej porze licznik rośnie o 1, gdy ludność jest co najmniej równa celowi, nikt z zarządu nie ma
   jedzenia poniżej 25, a zaufanie wynosi co najmniej 50; inaczej wraca do zera, a jeśli seria już coś znaczyła (licznik
   większy od zera), krok dopisuje do kroniki (bez `big`) zdanie „Seria poranków do celu przerwana po {n} z 7.”, żeby
   gracz wiedział, czemu licznik wrócił do zera. Siódmy poranek z rzędu zalicza piąty kamień ludnościowy. Po zwycięstwie
   licznik stoi.

   Zwycięstwo to zaliczenie ostatniego kamienia drogi. Krok zapisuje je w `wygrane` (droga, dzień i godzina gry) i dokłada
   drogę na koniec kolejki epilogów `epilogi` (FIFO); `pending` (src/gov/zarzad.ts) oddaje przed innymi oknami pierwszy
   z kolejki jako `{ k: 'zwyciestwo', droga }`. „Graj dalej” (`grajDalej`) zdejmuje tylko ten pierwszy epilog: gra i zapis
   zostają, ta sama droga nie wygrywa drugi raz (pilnuje tego `wygrane`), a następny epilog z kolejki pokazuje się zaraz po
   nim. Gdy dwie drogi wygrają w tym samym kroku, obie trafiają do `wygrane` i do kolejki w kolejności ekranu, a gracz
   widzi dwa epilogi jeden po drugim; zwycięstwo, gdy epilog już czeka, staje w kolejce za nim. Stan sprzed kolejki (zapis
   deweloperski z jednym polem `epilog`: droga albo null) `wlaczZwyciestwo` czyta jak kolejkę z jednym epilogiem albo pustą
   i usuwa stare pole, bez podbijania wersji zapisu.

   Zwycięstwo na żądanie (`wygrajDroge`) służy tylko zrzutom i próbom (`window.zm.wygraj` w src/main.ts): włącza drogi,
   wpisuje wygraną (raz), zalicza komplet kamieni drogi i dokłada jej epilog na koniec kolejki (raz: epilog tej samej drogi,
   który już czeka, nie dubluje się). Nie pisze do kroniki i nie rusza niczego poza `GovState.zwyciestwo`; dla nieznanej
   drogi nic nie robi i zwraca `false`.

   Krok nie zmienia zaufania, wkurzenia, zapasów ani ziarna: żadnych bonusów do balansu, tylko kronika i podpowiedź
   (ostatni wpis w `fx.log`, który gra pokazuje jak każdy inny). Zaufanie +2 przy pierwszym kamieniu drogi, które
   wymienia projekt, jest świadomie pominięte: nagroda zmieniałaby zaufanie, od którego zależy licznik celu (próg 50),
   więc pierwszy kamień mógłby po cichu uratować licznik; do dodania razem ze strojeniem balansu. Bez hypot, sin i cos;
   napisy od razu po polsku i angielsku. */

import { mnogaPl, type Tx, tx } from '../core/jezyk.ts';
import type { GameMode, GovEffects, GovInput, GovState } from './typy.ts';
import { logGov } from './wspolne.ts';

export type Droga = 'technologia' | 'teren' | 'lek' | 'ludnosc' | 'cuda';

/** Stan zwycięstwa w zarządzie (JSON); pole `GovState.zwyciestwo` istnieje od `wlaczZwyciestwo`. */
export interface StanZwyciestwa {
  /** ile kamieni milowych każdej drogi już zaliczono; rośnie po jednym i nie maleje, brak wpisu: żadnego */
  kamienie: Partial<Record<Droga, number>>;
  /** zwycięstwa po kolei: droga oraz dzień i godzina gry, w której padło */
  wygrane: { droga: Droga; dzien: number; godzina: number }[];
  /** ile poranków z rzędu cel ludności był utrzymany bez głodu i przy zaufaniu co najmniej 50 (do 7) */
  dniCelu: number;
  /** dzień gry (`GovInput.day`), którego poranek licznik już policzył; 0: jeszcze żaden */
  ostatniDzien: number;
  /** epilogi czekające w oknie, w kolejności zwycięstw (FIFO): `pending` oddaje pierwszy, `grajDalej` go zdejmuje;
      pusta kolejka: nic nie czeka. Zapis sprzed kolejki ma w tym miejscu pole `epilog` (`wlaczZwyciestwo` je przepisuje) */
  epilogi: Droga[];
  /** cel drogi ludnościowej zapisany przy pierwszym kroku z użytecznymi danymi 2021 (po połowieniu w trybie zombie);
      brak pola: celu jeszcze nie zamrożono (nie było danych albo stary zapis), droga liczy go na bieżąco */
  cel?: number;
}

/** Jedna droga na ekranie dróg: nazwa, kamienie, ile zaliczono, „wkrótce”, „co dalej”, postęp liczbowy i seria poranków. */
export interface PostepDrogi {
  droga: Droga;
  nazwa: Tx;
  /** wszystkie kamienie drogi po kolei, także zaliczone */
  kamienie: Tx[];
  /** ile kamieni zapisano w stanie zarządu (0, gdy drogi nie włączono) */
  zaliczone: number;
  /** zdanie „Wkrótce: …” dla drogi, której podstawa jeszcze nie powstała; null: droga działa i nie ma nic do dodania albo
      jest już przebyta do końca (okno pokazuje to, co tu dostanie) */
  wkrotce: Tx | null;
  /** jedno zdanie „co dalej” do następnego otwartego kamienia drogi, którą da się grać już teraz (ludność w całości,
      pierwszy kamień terenu); null: droga ma „Wkrótce” (technologia, lek, cuda, teren po pierwszym kamieniu) albo jest
      przebyta do końca. Okno pokazuje je pod następnym kamieniem, więc „Wkrótce” i „co dalej” nie występują razem */
  dalej: Tx | null;
  /** liczby do paska („{ile} z {cel}”) dla drogi, która ma co liczyć; null: bez liczb */
  postep: { ile: number; cel: number } | null;
  /** licznik poranków celu ludności (`dni` z `z`, jak `StanZwyciestwa.dniCelu`) dla drogi ludnościowej, także po
      zwycięstwie (stoi na `z`); null: inne drogi nie mają serii */
  seria: { dni: number; z: number } | null;
}

/** Definicja drogi: nazwa i kamienie milowe po kolei, obie w obu językach. */
export interface DefDrogi {
  nazwa: Tx;
  /** nazwa w trybie zombie, gdy inna */
  nazwaZombie?: Tx;
  kamienie: readonly Tx[];
}

/** Pięć dróg: nazwy i kamienie milowe w obu językach (teksty według planu etapu 1). */
export const DROGI: Readonly<Record<Droga, DefDrogi>> = {
  technologia: {
    nazwa: tx('Prąd bez miedzi', 'Power without copper'),
    kamienie: [
      tx('Pracownia postawiona', 'Research room built'),
      tx('Pierwsze badanie', 'First research'),
      tx('Era 3', 'Era 3'),
      tx('Era 5', 'Era 5'),
      tx('Sieć bez miedzi', 'Copper-free grid'),
    ],
  },
  teren: {
    nazwa: tx('Za Murem', 'Za Murem'),
    kamienie: [
      tx('Pierwszy sąsiad za płotem', 'First neighbour behind the fence'),
      tx('Kwadrat domu za obwodem', 'Home square enclosed'),
      tx('Pierwszy sąsiedni kwadrat', 'First neighbouring square'),
      tx('Pięć kwadratów', 'Five squares'),
      tx('Dziewięć kwadratów za murem', 'Nine squares behind the wall'),
    ],
  },
  lek: {
    nazwa: tx('Wyłącznik z pakietu premium', 'The premium-tier kill switch'),
    nazwaZombie: tx('Lek', 'The cure'),
    kamienie: [
      tx('Trop', 'A lead'),
      tx('Pierwsza wyprawa daleka', 'First long run'),
      tx('Laboratorium w mieście wojewódzkim', 'The lab in the regional capital'),
      tx('Warszawa', 'Warsaw'),
      tx('Lek w domu', 'The cure at home'),
    ],
  },
  ludnosc: {
    nazwa: tx('Nowe osiedle', 'A new estate'),
    kamienie: [
      tx('10 osób', '10 people'),
      tx('25 osób', '25 people'),
      tx('50 osób', '50 people'),
      tx('Połowa celu', 'Halfway there'),
      tx('Cel przez 7 dni', 'Target held for 7 days'),
    ],
  },
  cuda: {
    nazwa: tx('Cuda', 'Wonders'),
    kamienie: [tx('Pierwszy cud', 'First wonder'), tx('Drugi cud', 'Second wonder'), tx('Trzeci cud', 'Third wonder')],
  },
};

/** „Wkrótce: …” dla dróg bez podstawy; ludność działa w całości i go nie ma, teren pokazuje go dopiero po pierwszym
    kamieniu, a droga przebyta do końca nigdy (`wkrotceDrogi`). */
const WKROTCE: Readonly<Record<Exclude<Droga, 'ludnosc'>, Tx>> = {
  technologia: tx('Wkrótce: badania w pracowni i sieć bez miedzi.', 'Coming soon: research and a copper-free grid.'),
  teren: tx('Wkrótce: sąsiednie kwadraty i mur.', 'Coming soon: neighbouring squares and the wall.'),
  lek: tx('Wkrótce: dalekie wyprawy po lek.', 'Coming soon: long runs for the cure.'),
  cuda: tx('Wkrótce: cuda z późnych badań.', 'Coming soon: wonders from late research.'),
};

/** „Co dalej” przy pierwszym kamieniu terenu (reszta terenu to „Wkrótce”, `wkrotceDrogi`) */
const DALEJ_TEREN = tx(
  'Otoczcie wspólnym płotem pierwszy sąsiedni budynek.',
  'Put a shared fence round the first building next door.',
);

/** drogi w kolejności ekranu */
const KOLEJNOSC: readonly Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];

/** progi osób dla pierwszych trzech kamieni ludności; czwarty to połowa celu (`progiLudnosci`), piąty licznik */
const PROGI_LUDNOSCI: readonly number[] = [10, 25, 50];
/** cel ludności: bez danych z 2021 roku, dolna i górna granica przy danych */
const CEL_BEZ_DANYCH = 250;
const CEL_MIN = 120;
const CEL_MAX = 500;
/** ile poranków z rzędu trzeba utrzymać cel */
const DNI_CELU = 7;
/** od której godziny nowy dzień gry liczy się do licznika */
const PORANEK = 6;
/** głodna jest osoba z jedzeniem poniżej tej wartości (0–100) */
const GLOD_PONIZEJ = 25;
/** zaufanie, przy którym cel się liczy */
const ZAUFANIE_OD = 50;

/** „Co dalej” dla kamieni ludności przed ostatnim: zebrać `n` osób pod zarządem (polska liczba mnoga: „63 osoby”) */
const dalejOsoby = (n: number): Tx =>
  tx(`Zbierzcie ${mnogaPl(n, 'osoba', 'osoby', 'osób')} pod zarządem.`, `Get ${n} people under the board.`);

/** „Co dalej” dla ostatniego kamienia ludności: utrzymać cel siedem poranków, z licznikiem `dni` z 7. Warunki w zdaniu
    to te same stałe, którymi liczy `krokZwyciestwa` (poranek, głód, zaufanie, liczba dni). */
const dalejSeria = (dni: number): Tx =>
  tx(
    `Utrzymajcie cel ${DNI_CELU} poranków z rzędu: o ${PORANEK}:00 nikt z zarządu nie jest głodny, a zaufanie wynosi co najmniej ${ZAUFANIE_OD} (${dni} z ${DNI_CELU}).`,
    `Hold the target for ${DNI_CELU} mornings in a row: at ${PORANEK}:00 nobody on the board is hungry and trust is at least ${ZAUFANIE_OD} (${dni} of ${DNI_CELU}).`,
  );

/** Nazwa drogi w trybie gry: droga leku w zombie nazywa się „Lek”, reszta tak samo w obu trybach. */
export function nazwaDrogi(droga: Droga, mode: GameMode): Tx {
  const def = DROGI[droga];
  return mode === 'zombie' && def.nazwaZombie ? def.nazwaZombie : def.nazwa;
}

/** Włącza drogi w stanie zarządu: dokłada puste liczniki. Idempotentne, bez losowania; wołają to gra przy nowej grze
    i przy wczytaniu starego zapisu. `newGov` bez opcji tego nie robi. Stan sprzed kolejki epilogów (zapis deweloperski
    z jednym polem `epilog`: droga albo null) czyta jak kolejkę z jednym epilogiem albo pustą i usuwa stare pole, bez
    podbijania wersji zapisu. */
export function wlaczZwyciestwo(st: GovState): void {
  st.zwyciestwo ??= { kamienie: {}, wygrane: [], dniCelu: 0, ostatniDzien: 0, epilogi: [] };
  const z: StanZwyciestwa & { epilog?: Droga | null } = st.zwyciestwo;
  if (!Array.isArray(z.epilogi)) z.epilogi = z.epilog && Object.hasOwn(DROGI, z.epilog) ? [z.epilog] : [];
  delete z.epilog;
}

/** Czy liczba ze spisu 2021 nadaje się do celu i do epilogu: skończona i dodatnia (0, ujemna, NaN i nieskończoność to
    brak danych). */
export const maDaneSpisu = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Cel drogi ludnościowej: połowa ludności kwadratu domu z 2021 roku w przedziale 120–500, bez danych (albo z liczbą bez
    sensu) 250; w trybie zombie połowa tego. Zawsze liczba całkowita w przedziale: zwykły 120–500, zombie 60–250. */
export function celLudnosci(i: Pick<GovInput, 'ludnosc2021'>, mode: GameMode): number {
  const n = i.ludnosc2021;
  const baza = maDaneSpisu(n) ? Math.min(CEL_MAX, Math.max(CEL_MIN, Math.round(n / 2))) : CEL_BEZ_DANYCH;
  return mode === 'zombie' ? Math.round(baza / 2) : baza;
}

/** Cel drogi ludnościowej w tej grze: zapisany w stanie (`StanZwyciestwa.cel`), a gdy go jeszcze nie ma, liczony na
    bieżąco z odczytu (`celLudnosci`). Tylko czyta. */
const celGry = (st: GovState, i: GovInput): number => st.zwyciestwo?.cel ?? celLudnosci(i, st.mode ?? 'zwykly');

/** Ludzie pod naszym zarządem: pole `ludnosc` z odczytu, a bez niego zarząd i mieszkańcy siedziby. */
export function ludnoscOf(i: GovInput): number {
  const n = i.ludnosc;
  if (typeof n === 'number' && Number.isFinite(n)) return Math.max(0, n);
  return i.people.length + (i.residents ?? 0);
}

/** Czy droga już wygrała (jest w `wygrane`). */
const wygrana = (z: { wygrane: { droga: Droga }[] }, droga: Droga): boolean => z.wygrane.some((w) => w.droga === droga);

/** Progi osób czterech pierwszych kamieni ludności przy celu `cel`: 10, 25, 50 i połowa celu w górę. Piąty kamień to
    licznik poranków, nie próg. Przy małym celu połowa bywa niższa od 50, ale kamienie idą po kolei (`spelnione`). */
const progiLudnosci = (cel: number): number[] => [...PROGI_LUDNOSCI, Math.ceil(cel / 2)];

/** Ile pierwszych kamieni drogi spełnia sam odczyt (kamienie idą po kolei, więc liczy się początek listy). Piąty kamień
    ludności nie wchodzi w rachubę, bo daje go licznik poranków; drogi bez odczytu mają 0. */
function spelnione(droga: Droga, i: GovInput, cel: number): number {
  if (droga === 'teren') return (i.teren?.przylaczone ?? 0) >= 1 ? 1 : 0;
  if (droga !== 'ludnosc') return 0;
  const ile = ludnoscOf(i);
  const progi = progiLudnosci(cel);
  let n = 0;
  while (n < progi.length && ile >= progi[n]) n++;
  return n;
}

/** „Wkrótce” drogi przy `zaliczone` kamieniach: ludność go nie ma, droga przebyta do końca też nie, teren dopiero po
    pierwszym kamieniu (wcześniej pierwszy kamień jest do zdobycia od razu), reszta zawsze. To jedyne miejsce tej reguły:
    okno pokazuje to, co dostanie w `PostepDrogi.wkrotce`. */
function wkrotceDrogi(droga: Droga, zaliczone: number): Tx | null {
  if (droga === 'ludnosc' || zaliczone >= DROGI[droga].kamienie.length) return null;
  if (droga === 'teren' && zaliczone < 1) return null;
  return WKROTCE[droga];
}

/** „Co dalej” drogi przy `zaliczone` kamieniach: jedno zdanie do następnego otwartego kamienia, ale tylko tam, gdzie da się
    go zdobyć już teraz, czyli gdzie nie ma „Wkrótce” (`wkrotceDrogi` rozstrzyga o tym jako jedyne): ludność w całości
    (zebrać próg kamienia, a przy ostatnim utrzymać cel przez siedem poranków z licznikiem `dniCelu`) i pierwszy kamień
    terenu (wspólny płot). Droga przebyta do końca i droga z „Wkrótce” nie mają zdania. */
function dalejDrogi(droga: Droga, zaliczone: number, cel: number, dniCelu: number): Tx | null {
  if (zaliczone >= DROGI[droga].kamienie.length || wkrotceDrogi(droga, zaliczone)) return null;
  if (droga === 'teren') return DALEJ_TEREN;
  if (droga !== 'ludnosc') return null;
  const progi = progiLudnosci(cel);
  return zaliczone < progi.length ? dalejOsoby(progi[zaliczone]) : dalejSeria(dniCelu);
}

/** Postęp pięciu dróg w kolejności ekranu (technologia, teren, lek, ludność, cuda) z odczytu i stanu zarządu. Czysta:
    nic nie zmienia i niczego nie losuje. `zaliczone` to kamienie zapisane w stanie (0 bez `wlaczZwyciestwo`), a nie
    chwilowy odczyt, więc kamień raz zaliczony nie znika, gdy ludność spadnie; `postep` i `seria` ma tylko ludność,
    `dalej` ludność i pierwszy kamień terenu, `wkrotce` pozostałe (nigdy oba naraz). */
export function ocenDrogi(st: GovState, i: GovInput): PostepDrogi[] {
  const mode = st.mode ?? 'zwykly';
  const cel = celGry(st, i);
  const dniCelu = st.zwyciestwo?.dniCelu ?? 0;
  return KOLEJNOSC.map((droga) => {
    const def = DROGI[droga];
    const zaliczone = Math.min(st.zwyciestwo?.kamienie[droga] ?? 0, def.kamienie.length);
    return {
      droga,
      nazwa: nazwaDrogi(droga, mode),
      kamienie: [...def.kamienie],
      zaliczone,
      wkrotce: wkrotceDrogi(droga, zaliczone),
      dalej: dalejDrogi(droga, zaliczone, cel, dniCelu),
      postep: droga === 'ludnosc' ? { ile: ludnoscOf(i), cel } : null,
      seria: droga === 'ludnosc' ? { dni: dniCelu, z: DNI_CELU } : null,
    };
  });
}

/** Dopisuje kamienie drogi do liczby `ile` (nigdy w dół): po jednym wpisie w kronice na każdy nowy, po kolei. */
function zalicz(st: GovState, i: GovInput, fx: GovEffects, droga: Droga, ile: number): void {
  const z = st.zwyciestwo!;
  const def = DROGI[droga];
  const nazwa = nazwaDrogi(droga, st.mode ?? 'zwykly');
  for (let k = z.kamienie[droga] ?? 0; k < Math.min(ile, def.kamienie.length); k++) {
    z.kamienie[droga] = k + 1;
    const kamien = def.kamienie[k];
    logGov(st, i, tx(`Droga „${nazwa.pl}”: ${kamien.pl}.`, `${nazwa.en}: ${kamien.en}.`), true, fx);
  }
}

/** Krok zarządu dla dróg (woła go `govUpdate` po `checkOver`, tylko w trwającej grze): zamraża cel ludności przy
    pierwszych danych z 2021 roku, zalicza kamienie, które spełnia odczyt, liczy poranki celu (z wpisem w kronice, gdy
    seria pęka) i zgłasza zwycięstwo z epilogiem w kolejce. Bez `st.zwyciestwo` nie robi nic. Nie losuje i nie zmienia
    niczego poza stanem zwycięstwa i kroniką (`st.log` i `fx.log`). */
export function krokZwyciestwa(st: GovState, i: GovInput, fx: GovEffects): void {
  const z = st.zwyciestwo;
  if (!z) return;
  // cel zamarza przy pierwszych użytecznych danych 2021; od tej chwili liczy się zapisany, nie bieżący odczyt
  if (z.cel === undefined && maDaneSpisu(i.ludnosc2021)) z.cel = celLudnosci(i, st.mode ?? 'zwykly');
  const cel = celGry(st, i);
  for (const droga of KOLEJNOSC) zalicz(st, i, fx, droga, spelnione(droga, i, cel));
  // doba gry liczy się raz, rano od 6:00 pierwszego kroku po zmianie dnia
  if (i.hour >= PORANEK && i.day !== z.ostatniDzien) {
    z.ostatniDzien = i.day;
    if (!wygrana(z, 'ludnosc')) {
      const trzyma =
        ludnoscOf(i) >= cel && st.trust >= ZAUFANIE_OD && !i.people.some((p) => p.needs.food < GLOD_PONIZEJ);
      const przed = z.dniCelu;
      z.dniCelu = trzyma ? przed + 1 : 0;
      // seria, która już coś znaczyła, a pękła: jedno zdanie w kronice (bez wielkiej czcionki), żeby gracz wiedział, czemu
      // licznik wrócił do zera; seria od zera nie ma czego przerywać
      if (!trzyma && przed > 0)
        logGov(
          st,
          i,
          tx(
            `Seria poranków do celu przerwana po ${przed} z ${DNI_CELU}.`,
            `The run of mornings towards the target broke after ${przed} of ${DNI_CELU}.`,
          ),
          false,
          fx,
        );
      if (z.dniCelu >= DNI_CELU) zalicz(st, i, fx, 'ludnosc', DROGI.ludnosc.kamienie.length);
    }
  }
  for (const droga of KOLEJNOSC) {
    if ((z.kamienie[droga] ?? 0) < DROGI[droga].kamienie.length || wygrana(z, droga)) continue;
    z.wygrane.push({ droga, dzien: i.day, godzina: i.hour });
    z.epilogi.push(droga);
  }
}

/** „Graj dalej”: zdejmuje pierwszy epilog z kolejki, a następny (jeśli czeka) pokaże się zaraz po nim. Wygrana zostaje
    w `wygrane`, zapis i gra idą dalej, ta sama droga nie wygra drugi raz. Bez stanu zwycięstwa albo przy pustej kolejce
    nic nie robi. */
export function grajDalej(st: GovState): void {
  st.zwyciestwo?.epilogi.shift();
}

/** Zwycięstwo drogi na żądanie, tylko do zrzutów i prób (`window.zm.wygraj` w src/main.ts): włącza drogi, wpisuje wygraną
    z dniem i godziną (raz na drogę), zalicza komplet jej kamieni i dokłada jej epilog na koniec kolejki (raz: epilog tej
    samej drogi, który już czeka, nie dubluje się). Nie pisze do kroniki, nie losuje i nie rusza niczego poza
    `GovState.zwyciestwo`. Zwraca `false` i nic nie zmienia, gdy `droga` nie jest drogą. */
export function wygrajDroge(st: GovState, droga: Droga, dzien: number, godzina: number): boolean {
  if (!Object.hasOwn(DROGI, droga)) return false;
  wlaczZwyciestwo(st);
  const z = st.zwyciestwo!;
  if (!wygrana(z, droga)) z.wygrane.push({ droga, dzien, godzina });
  z.kamienie[droga] = DROGI[droga].kamienie.length;
  if (!z.epilogi.includes(droga)) z.epilogi.push(droga);
  return true;
}
