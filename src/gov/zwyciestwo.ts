/* Warunki zwycięstwa, etap 1 (docs/superpowers/specs/2026-10-19-warunki-zwyciestwa-design.md): pięć dróg, ich kamienie
   milowe i krok zarządu, który je zalicza. Czyste funkcje na `GovInput` i `GovState`, bez symulacji (src/gov nie
   importuje src/sim), bez rysowania i bez losowania: ten sam ciąg wejść daje ten sam stan, także po zapisie i wczytaniu.

   Drogi: `technologia` („Prąd bez miedzi”), `teren` („Za Murem”), `lek`, `ludnosc` („Nowe osiedle”) i `cuda`. Na tym
   etapie gotowa jest ludnościowa w całości i pierwszy kamień terenu; technologia, lek i cuda czekają na projekty, na
   których stoją, więc ekran dróg pokazuje przy nich „Wkrótce: …” (`PostepDrogi.wkrotce`). Treść dróg (`DROGI`) jest
   w obu językach (Tx); nazwa drogi leku zależy od trybu gry (`nazwaDrogi`).

   Stan (`GovState.zwyciestwo`, `StanZwyciestwa`) powstaje dopiero po `wlaczZwyciestwo`, tak jak `miasto` po `wlaczMiasto`
   (src/gov/wyprawy.ts): `newGov` go nie ma, `krokZwyciestwa` bez niego nie robi nic, więc skróty zarządu w botach i testach
   bez tej opcji zostają bez zmian. Gra włącza drogi przy nowej grze i przy wczytaniu starego zapisu. Kamienie, które stan
   już spełnia, zapisują się wtedy raz (jeden wpis w kronice na kamień, potem cisza), a epilog nie przychodzi wstecz:
   zwycięstwo ludnościowe wymaga siedmiu poranków liczonych od włączenia.

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

   Licznik celu (`dniCelu`). Dzień gry liczy się raz na zmianę `GovInput.day` (`ostatniDzien`), rano od 6:00, więc to doby gry,
   a nie sekundy przy ekranie. O tej porze licznik rośnie o 1, gdy ludność jest co najmniej równa celowi, nikt z zarządu nie ma
   jedzenia poniżej 25, a zaufanie wynosi co najmniej 50; inaczej wraca do zera. Siódmy poranek z rzędu zalicza piąty
   kamień ludnościowy. Po zwycięstwie licznik stoi.

   Zwycięstwo to zaliczenie ostatniego kamienia drogi. Krok zapisuje je w `wygrane` (droga, dzień i godzina gry) i ustawia
   `epilog`, który `pending` (src/gov/zarzad.ts) oddaje przed innymi oknami jako `{ k: 'zwyciestwo', droga }`. „Graj dalej”
   (`grajDalej`) tylko zdejmuje epilog: gra i zapis zostają, ta sama droga nie wygrywa drugi raz (pilnuje tego `wygrane`),
   a zwycięstwo innej drogi później dostaje własny epilog. Epilog czeka jeden naraz: gdyby dwie drogi wygrały w tym samym
   kroku, obie trafiają do `wygrane`, a okno dostaje pierwsza w kolejności ekranu (do rozszerzenia, gdy powstaną
   kolejne drogi z kamieniami).

   Krok nie zmienia zaufania, wkurzenia, zapasów ani ziarna: żadnych bonusów do balansu, tylko kronika i podpowiedź
   (ostatni wpis w `fx.log`, który gra pokazuje jak każdy inny). Bez hypot, sin i cos; napisy od razu po polsku i angielsku. */

import { type Tx, tx } from '../core/jezyk.ts';
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
  /** droga, której epilog czeka w oknie; null: nic nie czeka */
  epilog: Droga | null;
}

/** Jedna droga na ekranie dróg: nazwa, kamienie, ile zaliczono, „wkrótce” i postęp liczbowy. */
export interface PostepDrogi {
  droga: Droga;
  nazwa: Tx;
  /** wszystkie kamienie drogi po kolei, także zaliczone */
  kamienie: Tx[];
  /** ile kamieni zapisano w stanie zarządu (0, gdy drogi nie włączono) */
  zaliczone: number;
  /** zdanie „Wkrótce: …” dla drogi, której podstawa jeszcze nie powstała; null: droga działa i nie ma nic do dodania */
  wkrotce: Tx | null;
  /** liczby do paska („{ile} z {cel}”) dla drogi, która ma co liczyć; null: bez liczb */
  postep: { ile: number; cel: number } | null;
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

/** „Wkrótce: …” dla dróg bez podstawy; ludność działa w całości i go nie ma, teren pokazuje go dopiero po pierwszym kamieniu. */
const WKROTCE: Readonly<Record<Exclude<Droga, 'ludnosc'>, Tx>> = {
  technologia: tx('Wkrótce: badania w pracowni i sieć bez miedzi.', 'Coming soon: research and a copper-free grid.'),
  teren: tx('Wkrótce: sąsiednie kwadraty i mur.', 'Coming soon: neighbouring squares and the wall.'),
  lek: tx('Wkrótce: dalekie wyprawy po lek.', 'Coming soon: long runs for the cure.'),
  cuda: tx('Wkrótce: cuda z późnych badań.', 'Coming soon: wonders from late research.'),
};

/** drogi w kolejności ekranu */
const KOLEJNOSC: readonly Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];

/** progi osób dla pierwszych trzech kamieni ludności; czwarty to połowa celu, piąty licznik */
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

/** Nazwa drogi w trybie gry: droga leku w zombie nazywa się „Lek”, reszta tak samo w obu trybach. */
export function nazwaDrogi(droga: Droga, mode: GameMode): Tx {
  const def = DROGI[droga];
  return mode === 'zombie' && def.nazwaZombie ? def.nazwaZombie : def.nazwa;
}

/** Włącza drogi w stanie zarządu: dokłada puste liczniki. Idempotentne, bez losowania; wołają to gra przy nowej grze
    i przy wczytaniu starego zapisu. `newGov` bez opcji tego nie robi. */
export function wlaczZwyciestwo(st: GovState): void {
  st.zwyciestwo ??= { kamienie: {}, wygrane: [], dniCelu: 0, ostatniDzien: 0, epilog: null };
}

/** Cel drogi ludnościowej: połowa ludności kwadratu domu z 2021 roku w przedziale 120–500, bez danych (albo z liczbą bez
    sensu) 250; w trybie zombie połowa tego. Zawsze liczba całkowita w przedziale: zwykły 120–500, zombie 60–250. */
export function celLudnosci(i: Pick<GovInput, 'ludnosc2021'>, mode: GameMode): number {
  const n = i.ludnosc2021;
  const baza =
    typeof n === 'number' && Number.isFinite(n) && n > 0
      ? Math.min(CEL_MAX, Math.max(CEL_MIN, Math.round(n / 2)))
      : CEL_BEZ_DANYCH;
  return mode === 'zombie' ? Math.round(baza / 2) : baza;
}

/** Ludzie pod naszym zarządem: pole `ludnosc` z odczytu, a bez niego zarząd i mieszkańcy siedziby. */
export function ludnoscOf(i: GovInput): number {
  const n = i.ludnosc;
  if (typeof n === 'number' && Number.isFinite(n)) return Math.max(0, n);
  return i.people.length + (i.residents ?? 0);
}

/** Czy droga już wygrała (jest w `wygrane`). */
const wygrana = (z: { wygrane: { droga: Droga }[] }, droga: Droga): boolean => z.wygrane.some((w) => w.droga === droga);

/** Ile pierwszych kamieni drogi spełnia sam odczyt (kamienie idą po kolei, więc liczy się początek listy). Piąty kamień
    ludności nie wchodzi w rachubę, bo daje go licznik poranków; drogi bez odczytu mają 0. */
function spelnione(droga: Droga, i: GovInput, mode: GameMode): number {
  if (droga === 'teren') return (i.teren?.przylaczone ?? 0) >= 1 ? 1 : 0;
  if (droga !== 'ludnosc') return 0;
  const ile = ludnoscOf(i);
  const progi = [...PROGI_LUDNOSCI, Math.ceil(celLudnosci(i, mode) / 2)];
  let n = 0;
  while (n < progi.length && ile >= progi[n]) n++;
  return n;
}

/** „Wkrótce” drogi przy `zaliczone` kamieniach: ludność go nie ma, teren dopiero po pierwszym kamieniu (wcześniej
    pierwszy kamień jest do zdobycia od razu), reszta zawsze. */
function wkrotceDrogi(droga: Droga, zaliczone: number): Tx | null {
  if (droga === 'ludnosc') return null;
  if (droga === 'teren' && zaliczone < 1) return null;
  return WKROTCE[droga];
}

/** Postęp pięciu dróg w kolejności ekranu (technologia, teren, lek, ludność, cuda) z odczytu i stanu zarządu. Czysta:
    nic nie zmienia i niczego nie losuje. `zaliczone` to kamienie zapisane w stanie (0 bez `wlaczZwyciestwo`), a nie
    chwilowy odczyt, więc kamień raz zaliczony nie znika, gdy ludność spadnie; `postep` ma tylko ludność. */
export function ocenDrogi(st: GovState, i: GovInput): PostepDrogi[] {
  const mode = st.mode ?? 'zwykly';
  return KOLEJNOSC.map((droga) => {
    const def = DROGI[droga];
    const zaliczone = Math.min(st.zwyciestwo?.kamienie[droga] ?? 0, def.kamienie.length);
    return {
      droga,
      nazwa: nazwaDrogi(droga, mode),
      kamienie: [...def.kamienie],
      zaliczone,
      wkrotce: wkrotceDrogi(droga, zaliczone),
      postep: droga === 'ludnosc' ? { ile: ludnoscOf(i), cel: celLudnosci(i, mode) } : null,
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

/** Krok zarządu dla dróg (woła go `govUpdate` po `checkOver`, tylko w trwającej grze): zalicza kamienie, które spełnia
    odczyt, liczy poranki celu ludności i zgłasza zwycięstwo z epilogiem. Bez `st.zwyciestwo` nie robi nic. Nie losuje i nie
    zmienia niczego poza stanem zwycięstwa i kroniką (`fx.log`). */
export function krokZwyciestwa(st: GovState, i: GovInput, fx: GovEffects): void {
  const z = st.zwyciestwo;
  if (!z) return;
  const mode = st.mode ?? 'zwykly';
  for (const droga of KOLEJNOSC) zalicz(st, i, fx, droga, spelnione(droga, i, mode));
  // doba gry liczy się raz, rano od 6:00 pierwszego kroku po zmianie dnia
  if (i.hour >= PORANEK && i.day !== z.ostatniDzien) {
    z.ostatniDzien = i.day;
    if (!wygrana(z, 'ludnosc')) {
      const trzyma =
        ludnoscOf(i) >= celLudnosci(i, mode) &&
        st.trust >= ZAUFANIE_OD &&
        !i.people.some((p) => p.needs.food < GLOD_PONIZEJ);
      z.dniCelu = trzyma ? z.dniCelu + 1 : 0;
      if (z.dniCelu >= DNI_CELU) zalicz(st, i, fx, 'ludnosc', DROGI.ludnosc.kamienie.length);
    }
  }
  for (const droga of KOLEJNOSC) {
    if ((z.kamienie[droga] ?? 0) < DROGI[droga].kamienie.length || wygrana(z, droga)) continue;
    z.wygrane.push({ droga, dzien: i.day, godzina: i.hour });
    z.epilog ??= droga;
  }
}

/** „Graj dalej”: zdejmuje epilog. Wygrana zostaje w `wygrane`, zapis i gra idą dalej, ta sama droga nie wygra drugi raz.
    Bez stanu zwycięstwa nic nie robi. */
export function grajDalej(st: GovState): void {
  if (st.zwyciestwo) st.zwyciestwo.epilog = null;
}
