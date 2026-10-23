/* Gość z klocków (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Klocki”): czyste dane i funkcje,
   bez hosta i bez stanu zarządu. Gość to grupa od 1 do 12 osób, które przychodzą razem; pierwsza mówi. Składa się z klocków:
   kto (archetyp), czego chce, co ma, haczyk (czy mówi prawdę), skąd (miejsce z okolicy albo kierunek) i satyra
   o dawnych czasach. Karta zarządu (zadanie 10) bierze z tego plan dla symulacji i tekst, a karty z 0.3, w których ktoś
   przychodzi pod bramę (zadanie 11), biorą stąd `osobyGrupy`. Ten plik to logika składania; zdania w obu językach,
   tytuł i tekst karty są w goscie-teksty.ts i stąd re-eksportowane (`tekstGoscia`, `tytulGoscia`, `wariantyGoscia`,
   `SATYRA`), więc import z goscie.ts wystarcza.

   Kontrakt.
   - Losowanie tylko z podanego `Rng` (ziarno zarządu), w stałej kolejności: kto, haczyk, czego chce, co ma, skąd, osoby,
     rzecz, ugryziony, satyra. Ten sam `Rng` i ten sam kontekst dają tego samego gościa. Wybór ważony to jedno
     losowanie na wybór, tasowania nie ma.
   - Tabela wykluczeń: archetyp ogranicza „czego chce” (`KTO`), „co ma” (`MA_KTO`) i haczyk (`haczykiMozliwe`); dalej
     parami: kto prosi o wymianę, ma co wymienić; kto przynosi wiadomość, ma wiadomość albo ostrzeżenie; kłamca nie
     przynosi prawdziwych wiadomości; pościg nie handluje; przechowanie to rzecz (zapłata za przechowanie); dobicie tylko
     dla ugryzionego bliskiego i bez niczego w zamian. `zgodnyGosc` sprawdza całego gościa, a każda ścieżka tabeli
     zostawia niepusty wybór (pilnuje test).
   - Tryb: ocaleni, ktoś z ugryzionym bliskim i haczyk „ugryziony” tylko w zombie; haczyk „kłamie” i „pościg” tylko
     w zwykłym (w zombie kłamstwo to ukryte ugryzienie, a pościg robią szwendacze). Ocaleni i ludzie z ugryzionym
     bliskim mówią jak w The Walking Dead (strach, ukrywanie), bez satyry; samotne dzieci też jej nie mają.
   - Wagi: zima ×2 dla chorego (archetyp i haczyk), zapasy powyżej 20 ×1,5 dla kłamcy, narrator po spokoju
     (`ostrzej`) ×1,5 dla każdego haczyka poza prawdą, fach, który zarząd już ma, kusi mniej, pora i dom przesuwają
     „czego chce” i archetyp rodziny. Każda napaść na obcego odbiera 20% szansy na gościa: to nie waga klocka, tylko
     mnożnik wydarzenia (`wagaGoscia`).
   - Osoby: `makePerson` z listy imion 0.3 (zarząd nie ma tabel generatora), fach z puli archetypu (dezerter tylko jako
     ochroniarz), wiek mówiącego z `KTO[kto].wiek`, reszta grupy z wiekiem rodziny (dzieci 4–15, dziadkowie 65–85); w rodzinie
     partner jest płci przeciwnej niż mówiący; rodzina, dzieci i ktoś z ugryzionym bliskim mają nazwisko mówiącego (forma
     męska albo żeńska z `SURN`). Osoby gościa mają id `g<n>p<i>`, żeby nie zderzyły się z identyfikatorami `s<n>` osób
     zarządu i mieszkańców. Zawód dzieci i reszty grupy to „dziecko” i „mieszkaniec”/„mieszkanka” (są w tabeli
     angielskich nazw zawodów). Fach gościa (`ma: fach`) znaczy umiejętność od `PROG_FACHU` w dziedzinie spoza `znane`.
   - Skąd: strona wejścia z jednakowym prawdopodobieństwem, a po niej najbliższe miejsce z `okolica` leżące po tej stronie
     (oś dominująca z liczb całkowitych, bez atan2; remis idzie na oś y). Bez miejsca po tej stronie skąd to kierunek
     świata, bez klucza. Wiadomość („co ma” = wiadomość) może dotyczyć miejsca `skad.klucz`, a bez klucza celu z TARGETS;
     wybór robi karta (zadanie 10), tu jest tylko zdanie, które mówi, że gość coś wie.
   - Nazwy miejsc (RODO). Moduł UFA filtrowi hosta: `okolica` ma przychodzić z `GovInput.okolica`, czyli przez
     `nazwaDoOkolicy` (src/mieszkancy/kronika.ts), a `Miejsce.nazwa` jest tam już przefiltrowana (bez tabel imion
     gminy pusta, zostaje sama kategoria). Pełnego filtra tu nie ma i nie powinno być: potrzebuje tabel imion
     mieszkańców, których zarząd nie ma. `wygladaNaOsobe` to tylko tania dodatkowa siatka na imiona i nazwiska z list 0.3
     (60 słów, kilka przypadków, „u Zbyszka”, tytuł przed nazwiskiem); prawdziwie wyglądające nazwy („Piekarnia Jana”,
     „Bistro Kasia”) przepuszcza, co dokumentuje test. Nikt nie ma na niej polegać. Nazwa trafia do tekstu w cudzysłowie po
     kategorii („od strony apteki „Pod Różą””), bez słowa kategorii, które już w niej było; nazwa z kategorią w środku
     albo równa kategorii odpada.
   - Teksty (goscie-teksty.ts): wybór wariantu zdania zależy tylko od gościa (skrót z id, imienia mówiącego i archetypu),
     więc ten sam gość czyta się tak samo przy każdym otwarciu i po wczytaniu zapisu. Każdy klocek ma po 3 warianty
     w obu językach, `wariantyGoscia` wystawia wszystkie (testy angielskiego sprawdzają każdy, nie tylko wybrany).
   - Powrót znajomego (`skladPowrotu`, etap 4): ten sam człowiek (imię, nazwisko, płeć, wiek, zawód z wpisu `Znajomy`) z tym
     samym archetypem, o ile to archetyp pojedynczego człowieka (rodzina, ocaleni i ktoś z ugryzionym bliskim wracają jako
     wędrowiec: ich karty mówią o liczbie osób w grupie), bez haczyka, z darem do wyboru: rodzeństwo do
     przyjęcia (drugi gość, to samo nazwisko), worek jedzenia 2–4 porcji (`Gosc.porcje`) albo wiadomość o miejscu. Losowania
     po kolei: dar, skąd, porcje, rodzeństwo; chory nie przyprowadza rodzeństwa (nie prosi o przyjęcie). */

import { type Dom, NAMES, POICAT, PROFS, type Prof, SEASONS, SURN } from '../content/data.ts';
import { KAT_EN } from '../content/miejsca.en.ts';
import { makePerson, type Person } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { pick, type Rng, ri } from '../core/rng.ts';
import type { Miejsce } from '../world/miasto.ts';
import { AMUNICJA, BRON, frazaSkad, KATEGORIA_SKAD, KIERUNEK, SATYRA_KLUCZE } from './goscie-teksty.ts';
import type { Pora } from './tresc.ts';
import type { GameMode } from './typy.ts';
import type { Znajomy } from './znajomi.ts';

export {
  AMUNICJA,
  BRON,
  KATEGORIA_SKAD,
  SATYRA,
  tekstGoscia,
  tytulGoscia,
  type WariantyGoscia,
  wariantyGoscia,
} from './goscie-teksty.ts';

// ---------------------------------------------------------------- typy

export type KtoId =
  | 'wedrowiec'
  | 'rodzina'
  | 'dezerter'
  | 'uciekinier'
  | 'chory'
  | 'dziecko'
  | 'znajomy'
  | 'ocaleni'
  | 'z_ugryzionym';
export type ChceId = 'nocleg' | 'jedzenie' | 'leki' | 'wymiana' | 'dolaczyc' | 'przechowac' | 'wiadomosc' | 'dobic';
export type MaId = 'fach' | 'rzecz' | 'wiadomosc' | 'ostrzezenie' | 'nic';
export type HaczykId = 'prawda' | 'klamie' | 'chory' | 'poscig' | 'ugryziony';
export type Strona = 'n' | 'e' | 's' | 'w';

export interface Gosc {
  id: string;
  /** 1–12 osób, [0] mówi */
  osoby: Person[];
  /** indeks w osoby, gdy haczyk to ugryzienie (zombie) */
  ugryziony?: number;
  kto: KtoId;
  chce: ChceId;
  ma: MaId;
  haczyk: HaczykId;
  skad: { strona: Strona; nazwa: Tx; klucz?: string };
  /** klucz linijki z `SATYRA` */
  satyra?: string;
  /** id znajomego (`Znajomy.id`), gdy to jego powrót (`skladPowrotu`): karta rozpoznaje go po imieniu i epitecie */
  wraca?: string;
  /** powrót z darem w jedzeniu: tyle porcji (2–4) dostaje zarząd rano po wpuszczeniu, przyjęciu i nakarmieniu, nie po odprawie */
  porcje?: number;
  rzecz?: { arms?: string; meds?: number; ammo?: Partial<Record<'naboje' | 'loftki' | 'belty', number>> };
}

export interface KontekstGoscia {
  mode: GameMode;
  pora: Pora;
  season: number;
  zapasy: number;
  okolica: readonly Miejsce[];
  znane: ReadonlySet<Dom>;
  napady: number;
  dom: boolean;
  /** narrator po długim spokoju (zadanie 16): haczyk inny niż 'prawda' ×1,5 */
  ostrzej?: boolean;
}

const TRYBY_OBA: readonly GameMode[] = ['zwykly', 'zombie'];

/** Archetypy: w których trybach przychodzą, czego mogą chcieć, wiek i liczba osób (mówiący, grupa). */
export const KTO: Record<
  KtoId,
  { tryby: readonly GameMode[]; chce: readonly ChceId[]; wiek: [number, number]; ilu: [number, number] }
> = {
  wedrowiec: {
    tryby: TRYBY_OBA,
    chce: ['nocleg', 'jedzenie', 'wymiana', 'dolaczyc', 'wiadomosc'],
    wiek: [22, 60],
    ilu: [1, 1],
  },
  rodzina: { tryby: TRYBY_OBA, chce: ['nocleg', 'jedzenie', 'dolaczyc', 'leki'], wiek: [28, 50], ilu: [3, 5] },
  dezerter: {
    tryby: TRYBY_OBA,
    chce: ['nocleg', 'jedzenie', 'dolaczyc', 'wymiana', 'przechowac'],
    wiek: [24, 45],
    ilu: [1, 1],
  },
  uciekinier: {
    tryby: TRYBY_OBA,
    chce: ['nocleg', 'jedzenie', 'dolaczyc', 'przechowac', 'wiadomosc'],
    wiek: [20, 60],
    ilu: [1, 1],
  },
  chory: { tryby: TRYBY_OBA, chce: ['leki', 'nocleg', 'jedzenie'], wiek: [30, 75], ilu: [1, 1] },
  dziecko: { tryby: TRYBY_OBA, chce: ['jedzenie', 'nocleg', 'dolaczyc'], wiek: [8, 15], ilu: [1, 2] },
  znajomy: {
    tryby: TRYBY_OBA,
    chce: ['nocleg', 'wymiana', 'przechowac', 'wiadomosc', 'dolaczyc'],
    wiek: [25, 70],
    ilu: [1, 1],
  },
  ocaleni: {
    tryby: ['zombie'],
    chce: ['nocleg', 'jedzenie', 'dolaczyc', 'leki', 'wiadomosc'],
    wiek: [22, 55],
    ilu: [2, 4],
  },
  z_ugryzionym: { tryby: ['zombie'], chce: ['dobic', 'leki', 'nocleg'], wiek: [25, 55], ilu: [2, 2] },
};

const KTOS = Object.keys(KTO) as KtoId[];
export const STRONY: readonly Strona[] = ['n', 'e', 's', 'w'];

// ---------------------------------------------------------------- tabela wykluczeń

/** co archetyp może mieć (dziecko nie ma fachu, ugryziony bliski nie ostrzega i nie ma fachu) */
const MA_KTO: Record<KtoId, readonly MaId[]> = {
  wedrowiec: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  rodzina: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  dezerter: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  uciekinier: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  chory: ['fach', 'rzecz', 'wiadomosc', 'nic'],
  dziecko: ['rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  znajomy: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  ocaleni: ['fach', 'rzecz', 'wiadomosc', 'ostrzezenie', 'nic'],
  z_ugryzionym: ['rzecz', 'wiadomosc', 'nic'],
};

const HACZYKI_TRYB: Record<GameMode, readonly HaczykId[]> = {
  zwykly: ['prawda', 'klamie', 'chory', 'poscig'],
  zombie: ['prawda', 'chory', 'ugryziony'],
};

/** Haczyki archetypu w trybie: ktoś z ugryzionym bliskim ma zawsze ugryzienie, chory nie jest ścigany (nie ma siły
    uciekać), w zombie nikt nie kłamie ani nie ucieka przed ludźmi, w zwykłym nikt nie jest ugryziony. */
export function haczykiMozliwe(kto: KtoId, mode: GameMode): HaczykId[] {
  if (kto === 'z_ugryzionym') return ['ugryziony'];
  return HACZYKI_TRYB[mode].filter((h) => !(kto === 'chory' && h === 'poscig'));
}

/** Czego chce archetyp przy haczyku: kłamca nie przynosi wiadomości, pościg nie handluje ani nie gada. */
export function chceMozliwe(kto: KtoId, haczyk: HaczykId): ChceId[] {
  return KTO[kto].chce.filter((c) => {
    if (haczyk === 'klamie') return c !== 'wiadomosc';
    if (haczyk === 'poscig') return c !== 'wymiana' && c !== 'wiadomosc';
    return true;
  });
}

type RodzajRzeczy = 'bron' | 'amunicja' | 'leki';
/** co archetyp może mieć przy sobie (rzecz) */
const RZECZ_KTO: Record<KtoId, readonly RodzajRzeczy[]> = {
  wedrowiec: ['bron', 'amunicja', 'leki'],
  rodzina: ['bron', 'leki'],
  dezerter: ['bron', 'amunicja'],
  uciekinier: ['bron', 'amunicja', 'leki'],
  chory: ['bron'],
  dziecko: ['leki'],
  znajomy: ['bron', 'amunicja', 'leki'],
  ocaleni: ['bron', 'amunicja', 'leki'],
  z_ugryzionym: ['bron', 'amunicja', 'leki'],
};
/** kto prosi o leki, nie niesie leków */
const rodzajeRzeczy = (kto: KtoId, chce: ChceId): RodzajRzeczy[] =>
  RZECZ_KTO[kto].filter((r) => !(r === 'leki' && chce === 'leki'));

/** Co może mieć archetyp przy tym, czego chce, i przy haczyku: wymiana potrzebuje towaru albo wiadomości, wiadomość
    wiadomości albo ostrzeżenia, przechowanie rzeczy (zapłaty), dobicie niczego; kłamca nie przynosi wiadomości ani
    ostrzeżeń; rzecz tylko, gdy archetyp ma co nieść (kto prosi o leki, nie niesie leków). */
export function maMozliwe(kto: KtoId, chce: ChceId, haczyk: HaczykId): MaId[] {
  return MA_KTO[kto].filter((m) => {
    if (haczyk === 'klamie' && (m === 'wiadomosc' || m === 'ostrzezenie')) return false;
    if (m === 'rzecz' && rodzajeRzeczy(kto, chce).length === 0) return false;
    if (chce === 'wymiana') return m === 'rzecz' || m === 'wiadomosc';
    if (chce === 'wiadomosc') return m === 'wiadomosc' || m === 'ostrzezenie';
    if (chce === 'przechowac') return m === 'rzecz';
    if (chce === 'dobic') return m === 'nic';
    return true;
  });
}

/** Czy klocki gościa zgadzają się z trybem i tabelą wykluczeń (też po wczytaniu zapisu). */
export function zgodnyGosc(g: Pick<Gosc, 'kto' | 'chce' | 'ma' | 'haczyk' | 'rzecz'>, mode: GameMode): boolean {
  return (
    KTO[g.kto].tryby.includes(mode) &&
    haczykiMozliwe(g.kto, mode).includes(g.haczyk) &&
    chceMozliwe(g.kto, g.haczyk).includes(g.chce) &&
    maMozliwe(g.kto, g.chce, g.haczyk).includes(g.ma) &&
    (g.ma === 'rzecz') === (g.rzecz !== undefined)
  );
}

// ---------------------------------------------------------------- wagi

/** Mnożnik szansy na gościa po napaściach na obcych: każda napaść odbiera 20% (0,8 do potęgi liczby napaści). */
export function wagaGoscia(ctx: Pick<KontekstGoscia, 'napady'>): number {
  let w = 1;
  for (let i = 0; i < ctx.napady && i < 60; i++) w *= 0.8;
  return w;
}

type Opcje<T> = readonly (readonly [T, number])[];

/** Jedno losowanie z wag; opcje z wagą ≤ 0 odpadają. */
function wybierz<T>(rng: Rng, opcje: Opcje<T>): T {
  let suma = 0;
  for (const [, w] of opcje) if (w > 0) suma += w;
  let r = rng() * suma;
  let ostatnia: T | undefined;
  for (const [v, w] of opcje) {
    if (w <= 0) continue;
    ostatnia = v;
    r -= w;
    if (r < 0) return v;
  }
  if (ostatnia === undefined) throw new Error('goscie: wybór bez opcji');
  return ostatnia;
}

/** numer pory roku „zima” według SEASONS (zimą chory częściej) */
export const ZIMA = SEASONS.indexOf('zima');

/** poziom umiejętności, od którego zawód gościa liczy się jako fach (`ma: fach`) */
export const PROG_FACHU = 2;

const BAZA_KTO: Record<KtoId, number> = {
  wedrowiec: 5,
  rodzina: 3,
  dezerter: 1.5,
  uciekinier: 2.5,
  chory: 1.5,
  dziecko: 1.5,
  znajomy: 1.5,
  ocaleni: 4,
  z_ugryzionym: 2,
};

function wagiKto(ctx: KontekstGoscia): Opcje<KtoId> {
  return KTOS.filter((k) => KTO[k].tryby.includes(ctx.mode)).map((k) => {
    let w = BAZA_KTO[k];
    if (k === 'chory' && ctx.season === ZIMA) w *= 2;
    // w domu mniej miejsca: duże rodziny przychodzą rzadziej
    if (k === 'rodzina' && ctx.dom) w *= 0.7;
    return [k, w] as const;
  });
}

const BAZA_HACZYK: Record<HaczykId, number> = { prawda: 4, klamie: 1.4, chory: 1, poscig: 1, ugryziony: 1.4 };

function wagiHaczyka(ctx: KontekstGoscia, kto: KtoId): Opcje<HaczykId> {
  return haczykiMozliwe(kto, ctx.mode).map((h) => {
    let w = BAZA_HACZYK[h];
    if (h === 'klamie' && ctx.zapasy > 20) w *= 1.5;
    if (h === 'chory') {
      if (ctx.season === ZIMA) w *= 2;
      // kto jest chory, ten zwykle zaraża
      if (kto === 'chory') w *= 2;
    }
    if (h !== 'prawda' && ctx.ostrzej) w *= 1.5;
    return [h, w] as const;
  });
}

const BAZA_CHCE: Record<ChceId, number> = {
  nocleg: 3,
  jedzenie: 2.5,
  leki: 1,
  wymiana: 1.2,
  dolaczyc: 1.2,
  przechowac: 0.7,
  wiadomosc: 0.8,
  dobic: 3,
};
/** ktoś z ugryzionym bliskim najczęściej prosi o dobicie */
const BAZA_CHCE_KTO: Partial<Record<KtoId, Partial<Record<ChceId, number>>>> = {
  z_ugryzionym: { dobic: 3, leki: 1.5, nocleg: 1.5 },
};

function wagiChce(ctx: KontekstGoscia, kto: KtoId, haczyk: HaczykId): Opcje<ChceId> {
  return chceMozliwe(kto, haczyk).map((c) => {
    let w = BAZA_CHCE_KTO[kto]?.[c] ?? BAZA_CHCE[c];
    // po zmroku częściej o dach, za dnia częściej o jedzenie
    if (c === 'nocleg') w *= ctx.pora === 'dzien' ? 0.6 : ctx.pora === 'wieczor' ? 1.4 : 1.6;
    if (c === 'jedzenie') w *= ctx.pora === 'dzien' ? 1.3 : ctx.pora === 'noc' ? 0.7 : 1;
    if (c === 'dolaczyc' && ctx.dom) w *= 0.7;
    return [c, w] as const;
  });
}

const BAZA_MA: Record<MaId, number> = { fach: 1.5, rzecz: 1.5, wiadomosc: 1.2, ostrzezenie: 0.8, nic: 2 };

function wagiMa(ctx: KontekstGoscia, kto: KtoId, chce: ChceId, haczyk: HaczykId): Opcje<MaId> {
  return maMozliwe(kto, chce, haczyk).map((m) => {
    let w = BAZA_MA[m];
    // fach, którego zarząd już ma w pełni, kusi mniej
    if (m === 'fach') w = Math.max(0.3, w - 0.15 * ctx.znane.size);
    return [m, w] as const;
  });
}

// ---------------------------------------------------------------- osoby

/** Pule zawodów mówiącego według archetypu (męskie nazwy z PROFS). */
const FACHY_KTO: Record<KtoId, readonly string[]> = {
  wedrowiec: [
    'Kurier',
    'Mechanik samochodowy',
    'Murarz',
    'Hydraulik',
    'Elektryk',
    'Ogrodnik',
    'Kucharz',
    'Działkowiec',
    'Monter klimatyzacji',
    'Doradca ds. ESG',
    'Influencer survivalowy',
    'Weterynarz',
  ],
  rodzina: [
    'Hydraulik',
    'Elektryk',
    'Nauczyciel fizyki',
    'Pielęgniarz',
    'Kucharz',
    'Murarz',
    'Ogrodnik',
    'Informatyk z urzędu',
    'Mechanik samochodowy',
  ],
  // zdania o dezerterze mówią „Ochrona” i „były ochroniarz”, więc zawód musi pasować
  dezerter: ['Ochroniarz z galerii'],
  uciekinier: [
    'Pielęgniarz',
    'Hydraulik',
    'Programista',
    'Kucharz',
    'Ogrodnik',
    'Informatyk z urzędu',
    'Student biotechnologii',
    'Prompt engineer',
    'Elektryk',
  ],
  chory: ['Emerytowany inżynier', 'Działkowiec', 'Murarz', 'Nauczyciel fizyki', 'Kurier', 'Lekarz rodzinny'],
  dziecko: [],
  znajomy: [
    'Lekarz rodzinny',
    'Pielęgniarz',
    'Elektryk',
    'Hydraulik',
    'Programista',
    'Nauczyciel fizyki',
    'Mechanik samochodowy',
    'Weterynarz',
    'Informatyk z urzędu',
    'Kucharz',
  ],
  ocaleni: [
    'Pielęgniarz',
    'Ratownik medyczny',
    'Ochroniarz z galerii',
    'Mechanik samochodowy',
    'Nauczyciel fizyki',
    'Murarz',
    'Hydraulik',
    'Student biotechnologii',
    'Kurier',
    'Ogrodnik',
  ],
  z_ugryzionym: [
    'Hydraulik',
    'Elektryk',
    'Nauczyciel fizyki',
    'Kucharz',
    'Kurier',
    'Pielęgniarz',
    'Mechanik samochodowy',
  ],
};

/** zawód z PROFS po męskiej nazwie */
function profPo(nazwa: string): Prof {
  const p = PROFS.find((x) => x[0] === nazwa);
  if (!p) throw new Error(`goscie: brak zawodu „${nazwa}” w PROFS`);
  return p;
}

/** zawód z wiekiem zawężonym do zakresu archetypu; null, gdy zakresy się nie przecinają */
function profZWiekiem(p: Prof, wiek: readonly [number, number]): Prof | null {
  const lo = Math.max(p[3][0], wiek[0]);
  const hi = Math.min(p[3][1], wiek[1]);
  return lo <= hi ? [p[0], p[1], p[2], [lo, hi]] : null;
}

/** Zawód mówiącego: z puli archetypu z wiekiem mieszczącym się w jego przedziale. Gość z fachem dostaje zawód z
    umiejętnością (od `PROG_FACHU`) w dziedzinie, której zarząd jeszcze nie zna, a gdy takiego nie ma, jakąkolwiek z
    umiejętnością. */
function wybierzProf(rng: Rng, kto: KtoId, ma: MaId | null, znane: ReadonlySet<Dom>): Prof {
  const wiek = KTO[kto].wiek;
  const pula = FACHY_KTO[kto].map((n) => profZWiekiem(profPo(n), wiek)).filter((p): p is Prof => p !== null);
  if (ma === 'fach') {
    const umie = (p: Prof) => Object.entries(p[2]).filter(([, v]) => (v ?? 0) >= PROG_FACHU);
    const nowe = pula.filter((p) => umie(p).some(([d]) => !znane.has(d as Dom)));
    if (nowe.length) return pick(nowe, rng);
    const zUmiejetnoscia = pula.filter((p) => umie(p).length > 0);
    if (zUmiejetnoscia.length) return pick(zUmiejetnoscia, rng);
  }
  return pick(pula, rng);
}

/** zawód bez umiejętności dla reszty grupy */
const dziecieProf = (lo: number, hi: number): Prof => ['dziecko', 'dziecko', {}, [lo, hi]];
const doroslyProf = (lo: number, hi: number): Prof => ['mieszkaniec', 'mieszkanka', {}, [lo, hi]];

const przytnij = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** forma nazwiska dla płci: Kowalski ↔ Kowalska, Nowak ↔ Nowak */
function nazwiskoDla(nazwisko: string, f: boolean): string {
  const para = SURN.find((s) => s[0] === nazwisko || s[1] === nazwisko);
  return para ? para[f ? 1 : 0] : nazwisko;
}

/** Osoby grupy. Pierwsza mówi i ma zawód z puli archetypu (albo podany) oraz wiek z `KTO[kto].wiek`. Reszta zależy od
    archetypu: rodzina to partner płci przeciwnej, dzieci 4–15 i czasem dziadek albo babcia (65–85, gdy mówiący ma 40+); dziecko to
    młodsze rodzeństwo; ktoś z ugryzionym bliskim to partner (płci przeciwnej), dziecko albo rodzic; reszta to dorośli. Rodzina, dzieci
    i bliski dzielą nazwisko mówiącego. Imiona się nie powtarzają i nie powtarzają `used`. Identyfikatory osób z `n`
    jak w `makePerson`. Wielkość grupy podaje wywołujący (1–12), nie tylko `KTO.ilu`: używają tego też karty z gościem.
    Z `mowiacy` (osoba gotowa, np. fachowiec z karty) pierwsza jest ta osoba, a reszta grupy układa się wokół niej. */
function grupa(
  rng: Rng,
  n: () => number,
  kto: KtoId,
  ilu: number,
  used: ReadonlySet<string>,
  profMowiacego?: Prof,
  mowiacy?: Person,
): Person[] {
  const zajete = new Set(used);
  if (mowiacy) zajete.add(mowiacy.first);
  const dodaj = (prof: Prof, f?: boolean): Person => {
    const p = makePerson(rng, zajete, n, f === undefined ? { prof } : { prof, f });
    zajete.add(p.first);
    // dzieci bez cech: „Mistrz Excela” w wieku siedmiu lat to za wiele
    if (p.age < 16) p.traits = [];
    return p;
  };
  const wiek = KTO[kto].wiek;
  const profKto = (): Prof =>
    kto === 'dziecko' ? dziecieProf(wiek[0], wiek[1]) : (profMowiacego ?? wybierzProf(rng, kto, null, new Set()));
  const mow = mowiacy ?? dodaj(profKto());
  const osoby: Person[] = [mow];
  const wspolneNazwisko = kto === 'rodzina' || kto === 'dziecko' || kto === 'z_ugryzionym';
  const nazwisko = mow.name.slice(mow.first.length + 1);
  const krewny = kto === 'z_ugryzionym' ? rng() : 0;
  let dziadkowie = 0;
  for (let i = 1; i < ilu; i++) {
    let p: Prof;
    // partner jest płci przeciwnej niż mówiący, żeby wspólne nazwisko czytało się jak para, nie jak rodzeństwo
    let f: boolean | undefined;
    if (kto === 'rodzina') {
      if (i === 1) {
        const a = przytnij(mow.age + ri(-6, 6, rng), 20, 80);
        p = doroslyProf(a, a);
        f = !mow.f;
      } else if (i >= 3 && mow.age >= 40 && dziadkowie < 2 && rng() < 0.25) {
        dziadkowie++;
        const a = przytnij(mow.age + ri(24, 34, rng), 65, 85);
        p = doroslyProf(a, a);
      } else {
        p = dziecieProf(4, Math.max(5, Math.min(15, mow.age - 20)));
      }
    } else if (kto === 'dziecko') {
      p = dziecieProf(Math.max(4, mow.age - 5), mow.age);
    } else if (kto === 'z_ugryzionym' && i === 1) {
      if (krewny < 1 / 3) {
        const a = przytnij(mow.age + ri(-6, 6, rng), 20, 80);
        p = doroslyProf(a, a);
        f = !mow.f;
      } else if (krewny < 2 / 3) {
        p = dziecieProf(4, Math.max(5, Math.min(15, mow.age - 20)));
      } else {
        const a = przytnij(mow.age + ri(24, 32, rng), 50, 85);
        p = doroslyProf(a, a);
      }
    } else {
      p = doroslyProf(18, 62);
    }
    const o = dodaj(p, f);
    if (wspolneNazwisko) o.name = `${o.first} ${nazwiskoDla(nazwisko, o.f)}`;
    osoby.push(o);
  }
  return osoby;
}

/** Osoby grupy dla gościa z klocków i dla kart z gościem (zadanie 11): `ilu` osób archetypu `kto`, pierwsza mówi. Karta,
    która ma już mówiącego (fachowiec w grupie uchodźców), podaje go w `mowiacy`: ten sam człowiek stoi pierwszy, a rodzina
    dzieli jego nazwisko. */
export function osobyGrupy(
  rng: Rng,
  n: () => number,
  kto: KtoId,
  ilu: number,
  used: ReadonlySet<string>,
  mowiacy?: Person,
): Person[] {
  return grupa(rng, n, kto, ilu, used, undefined, mowiacy);
}

// ---------------------------------------------------------------- skąd

/** Strona mapy, z której leży miejsce (x na wschód, y na południe): oś dominująca, remis idzie na oś y. Same liczby
    całkowite i porównania, bez atan2. */
export function stronaMiejsca(x: number, y: number): Strona {
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'n' : 's';
  return x > 0 ? 'e' : 'w';
}

/** Odmienione formy imienia albo nazwiska, jakie wpadają w nazwy lokali („u Marka”, „Kowalskiego”, „Nowaka”). */
function formy(slowo: string): string[] {
  const s = slowo.toLowerCase();
  const wynik = [s, `${s}a`, `${s}u`, `${s}owi`, `${s}em`, `${s}y`];
  if (s.endsWith('a')) {
    const t = s.slice(0, -1);
    wynik.push(`${t}y`, `${t}i`, `${t}ie`, `${t}ę`, `${t}ą`, `${t}o`);
  }
  if (s.endsWith('ek')) {
    const t = s.slice(0, -2);
    wynik.push(`${t}ka`, `${t}kowi`, `${t}kiem`, `${t}ku`);
  }
  if (s.endsWith('ski') || s.endsWith('cki') || s.endsWith('dzki')) {
    const t = s.slice(0, -1);
    wynik.push(`${t}iego`, `${t}iej`, `${t}iemu`, `${t}im`, `${t}imi`, `${t}ich`, `${t}a`, `${t}ą`, `${t}ie`);
  }
  return wynik;
}

const OSOBA_FORMY: ReadonlySet<string> = new Set([...NAMES.m, ...NAMES.f, ...SURN.flat()].flatMap(formy));
/** „u Zbyszka”, „Dr Nowak”, „mgr Kowalska”: właściciel po przyimku albo tytuł przed nazwiskiem */
const WZORZEC_WLASCICIELA = /(?:^|[^\p{L}])(?:u|U)\s+\p{Lu}/u;
const WZORZEC_TYTULU = /(?:^|[^\p{L}])(?:[Dd]r|[Mm]gr|lek|[Pp]rof|[Ii]nż)\.?\s*\p{Lu}/u;

/** Tania dodatkowa siatka, nie filtr RODO: czy nazwa miejsca wygląda na osobę według 60 słów z list 0.3 (imię albo nazwisko
    w kilku przypadkach, „u Zbyszka”, tytuł przed nazwiskiem). Prawdziwie wyglądające nazwy („Piekarnia Jana”, „Bistro
    Kasia”) przepuszcza; właściwy filtr jest po stronie hosta (`nazwaDoOkolicy`), nikt nie ma polegać na tej funkcji. */
export function wygladaNaOsobe(nazwa: string): boolean {
  if (WZORZEC_WLASCICIELA.test(nazwa) || WZORZEC_TYTULU.test(nazwa)) return true;
  return nazwa.split(/[^\p{L}]+/u).some((t) => t.length > 0 && OSOBA_FORMY.has(t.toLowerCase()));
}

/** Własna nazwa miejsca do tekstu po kategorii („od strony apteki „Pod Różą””). Pusta, gdy wygląda na osobę (siatka
    lokalna, patrz nagłówek), jest równa kategorii albo ma słowo kategorii w środku; słowo kategorii na początku
    („Apteka Pod Różą”, „Sklep Żabka”) odpada, bo kategoria stoi już przed nazwą. */
function nazwaWlasna(m: Miejsce, kat: string): string {
  const n = m.nazwa.trim();
  if (!n || wygladaNaOsobe(n)) return '';
  const pl = POICAT[kat].name;
  const l = n.toLowerCase();
  for (const slowo of [pl, KAT_EN[kat], pl.split(' ')[0]]) {
    const w = slowo.toLowerCase();
    if (l === w) return '';
    if (l.startsWith(w) && !/\p{L}/u.test(n.charAt(w.length)))
      return n
        .slice(w.length)
        .replace(/^[\s,.:;–-]+/u, '')
        .trim();
  }
  // słowo kategorii w środku nazwy: zostaje sama kategoria
  return new RegExp(`(^|[^\\p{L}])${pl.split(' ')[0]}([^\\p{L}]|$)`, 'iu').test(n) ? '' : n;
}

/** Miejsce z okolicy w zdaniu po „od strony” („od strony apteki „Pod Różą””): kategoria i własna nazwa po filtrze
    nazw hosta (`nazwaWlasna`); kategoria spoza `KATEGORIA_SKAD` to sklep. Tak samo opisuje miejsce `skad` gościa i
    wiadomość, którą gość przynosi (src/gov/wizyta.ts). */
export function frazaMiejsca(m: Miejsce): Tx {
  const kat = Object.hasOwn(KATEGORIA_SKAD, m.kat) ? m.kat : 'sklep';
  return frazaSkad(kat, nazwaWlasna(m, kat));
}

/** Samo miejsce z okolicy, w mianowniku, do zdania o nim („apteka „Pod Różą””, „the pharmacy “Pod Różą””): kategoria
    z POICAT małą literą i własna nazwa po filtrze hosta (`nazwaWlasna`); bez nazwy sama kategoria. Używa tego wiadomość
    od gościa (src/gov/wizyta.ts): mówi, o jakim miejscu gość coś wie, a nie z której strony przyszedł. */
export function opisMiejsca(m: Miejsce): Tx {
  const kat = Object.hasOwn(KATEGORIA_SKAD, m.kat) ? m.kat : 'sklep';
  const wlasna = nazwaWlasna(m, kat);
  const pl = POICAT[kat].name.toLowerCase();
  const en = KATEGORIA_SKAD[kat].en;
  return wlasna ? tx(`${pl} „${wlasna}”`, `${en} “${wlasna}”`) : tx(pl, en);
}

/** Skąd przychodzi gość: losowa strona wejścia, a po niej najbliższe miejsce z okolicy po tej stronie (porównanie
    kwadratów odległości, przy remisie pierwsze z listy). Bez miejsca po tej stronie kierunek świata. */
function wybierzSkad(rng: Rng, okolica: readonly Miejsce[]): Gosc['skad'] {
  const strona = pick(STRONY, rng);
  let najblizsze: Miejsce | null = null;
  let najblizsza = Number.POSITIVE_INFINITY;
  for (const m of okolica) {
    if (stronaMiejsca(m.x, m.y) !== strona) continue;
    const d = m.x * m.x + m.y * m.y;
    if (d < najblizsza) {
      najblizsza = d;
      najblizsze = m;
    }
  }
  if (!najblizsze) return { strona, nazwa: KIERUNEK[strona] };
  return { strona, klucz: najblizsze.klucz, nazwa: frazaMiejsca(najblizsze) };
}

// ---------------------------------------------------------------- rzecz

/** id broni, które gość może nieść (te same co `WeaponId` w src/sim/bron.ts; zarząd nie importuje symulacji, test je przypina) */
export const BRON_ZWYKLA = ['noz', 'siekiera', 'lom', 'kij', 'dzida', 'kusza', 'rewolwer', 'strzelba'];
/** dezerter z ochrony ma raczej kij, łom albo broń strzelającą */
export const BRON_DEZERTERA = ['kij', 'lom', 'kusza', 'rewolwer', 'strzelba'];

/** Co gość ma przy sobie: broń (strzelająca z amunicją), sama amunicja albo leki, według archetypu i tego, o co prosi. */
function losujRzecz(rng: Rng, kto: KtoId, chce: ChceId): NonNullable<Gosc['rzecz']> {
  const rodzaj = pick(rodzajeRzeczy(kto, chce), rng);
  if (rodzaj === 'leki') return { meds: ri(1, 3, rng) };
  if (rodzaj === 'amunicja') {
    const typ = pick(['naboje', 'loftki', 'belty'] as const, rng);
    return { ammo: { [typ]: ri(AMUNICJA[typ].ile[0], AMUNICJA[typ].ile[1], rng) } };
  }
  const id = pick(kto === 'dezerter' ? BRON_DEZERTERA : BRON_ZWYKLA, rng);
  const typ = BRON[id].amunicja;
  return typ ? { arms: id, ammo: { [typ]: ri(AMUNICJA[typ].ile[0], AMUNICJA[typ].ile[1], rng) } } : { arms: id };
}

// ---------------------------------------------------------------- satyra

/** szansa na linijkę satyry: za dnia w zwykłym trybie częściej, w zombie rzadziej; ocaleni i ludzie z ugryzionym
    bliskim jej nie mają (tam jest strach, nie żart) */
const SZANSA_SATYRY: Record<GameMode, number> = { zwykly: 0.6, zombie: 0.3 };
const BEZ_SATYRY: ReadonlySet<KtoId> = new Set(['ocaleni', 'z_ugryzionym', 'dziecko']);

// ---------------------------------------------------------------- składanie gościa

/**
 * Składa gościa z klocków. `n` to numer gościa (id `g<n>`), `used` imiona już zajęte na osiedlu. Kontekst podaje tryb,
 * porę, porę roku, zapasy jedzenia, okolicę z mapy miasta, dziedziny znane zarządowi i miejsce (dom albo blok).
 */
export function skladGoscia(rng: Rng, n: number, ctx: KontekstGoscia, used: ReadonlySet<string>): Gosc {
  const kto = wybierz(rng, wagiKto(ctx));
  const haczyk = wybierz(rng, wagiHaczyka(ctx, kto));
  const chce = wybierz(rng, wagiChce(ctx, kto, haczyk));
  const ma = wybierz(rng, wagiMa(ctx, kto, chce, haczyk));
  const skad = wybierzSkad(rng, ctx.okolica);
  const id = `g${n}`;
  const ilu = ri(KTO[kto].ilu[0], KTO[kto].ilu[1], rng);
  let licznik = 1;
  const prof = kto === 'dziecko' ? undefined : wybierzProf(rng, kto, ma, ctx.znane);
  const osoby = grupa(rng, () => licznik++, kto, ilu, used, prof);
  osoby.forEach((p, i) => {
    p.id = `${id}p${i}`;
  });
  const rzecz = ma === 'rzecz' ? losujRzecz(rng, kto, chce) : undefined;
  const ugryziony = haczyk === 'ugryziony' ? (kto === 'z_ugryzionym' ? 1 : ri(0, osoby.length - 1, rng)) : undefined;
  const maSatyre = rng() < SZANSA_SATYRY[ctx.mode] && !BEZ_SATYRY.has(kto);
  const satyra = maSatyre ? pick(SATYRA_KLUCZE, rng) : undefined;
  return {
    id,
    osoby,
    ...(ugryziony !== undefined ? { ugryziony } : {}),
    kto,
    chce,
    ma,
    haczyk,
    skad,
    ...(satyra !== undefined ? { satyra } : {}),
    ...(rzecz ? { rzecz } : {}),
  };
}

// ---------------------------------------------------------------- powrót znajomego

/** archetypy całych grup: jeden powracający (z rodzeństwem co najwyżej) nie jest już rodziną ani ocalałymi, więc wraca jako
    wędrowiec; karty tych archetypów mówią o liczbie osób, a powracający ma ją w zdaniu o darze */
const GRUPOWE: ReadonlySet<KtoId> = new Set(['rodzina', 'ocaleni', 'z_ugryzionym']);

/** dar powracającego znajomego: rodzeństwo do przyjęcia, worek jedzenia albo wiadomość o miejscu */
export type DarPowrotu = 'rodzenstwo' | 'jedzenie' | 'wiesc';

const BAZA_DAR: Record<DarPowrotu, number> = { rodzenstwo: 1, jedzenie: 1.2, wiesc: 1 };

/** zawód z PROFS po nazwie w którejkolwiek formie (męskiej albo żeńskiej) */
const profPoFormie = (nazwa: string | undefined): Prof | undefined =>
  nazwa === undefined ? undefined : PROFS.find((p) => p[0] === nazwa || p[1] === nazwa);

/** Ta sama osoba co w wpisie znajomego: imię, nazwisko, płeć i wiek z wpisu, zawód z jego nazwy (nieznany: dziecko
    albo „mieszkaniec”), reszta (cechy) z ziarna. Id nadaje wywołujący. */
function osobaZnajomego(rng: Rng, z: Pick<Znajomy, 'osoba' | 'prof'>, kto: KtoId, used: ReadonlySet<string>): Person {
  const zawod = profPoFormie(z.prof);
  const wiek = z.osoba.age;
  const prof: Prof = zawod
    ? [zawod[0], zawod[1], zawod[2], [wiek, wiek]]
    : kto === 'dziecko' || wiek < 16
      ? dziecieProf(wiek, wiek)
      : doroslyProf(wiek, wiek);
  const p = makePerson(rng, new Set([...used, z.osoba.first]), () => 0, { f: z.osoba.f, prof });
  if (p.age < 16) p.traits = [];
  return { ...p, first: z.osoba.first, name: z.osoba.name, age: wiek };
}

/** Brat albo siostra mówiącego: to samo nazwisko (w formie płci rodzeństwa), nowe imię, wiek blisko jego wieku. */
function rodzenstwo(rng: Rng, mow: Person, used: ReadonlySet<string>): Person {
  const f = rng() < 0.5;
  const wiek = mow.age < 16 ? przytnij(mow.age + ri(-4, 3, rng), 4, 15) : przytnij(mow.age + ri(-8, 8, rng), 18, 80);
  const prof = wiek < 16 ? dziecieProf(wiek, wiek) : doroslyProf(wiek, wiek);
  const p = makePerson(rng, new Set([...used, mow.first]), () => 0, { f, prof });
  if (p.age < 16) p.traits = [];
  const nazwisko = mow.name.slice(mow.first.length + 1);
  p.name = `${p.first} ${nazwiskoDla(nazwisko, f)}`;
  return p;
}

/**
 * Składa powrót znajomego (`GovState.znajomi`): ten sam człowiek co w wpisie, archetyp ten sam, jeśli da się go odtworzyć
 * (rodzina, ocaleni, ktoś z ugryzionym bliskim, lokator i archetyp spoza trybu wracają jako wędrowiec), haczyk „prawda” i dar. `dar` wymusza rodzaj daru (testy);
 * chory nie przyprowadza rodzeństwa, więc dostaje wtedy worek jedzenia. Losowanie w stałej kolejności: dar, skąd, porcje,
 * rodzeństwo (płeć, wiek, imię). `n` to numer gościa (id `g<n>`), `used` imiona już zajęte na osiedlu.
 */
export function skladPowrotu(
  rng: Rng,
  n: number,
  z: Pick<Znajomy, 'id' | 'osoba' | 'prof' | 'kto'>,
  ctx: Pick<KontekstGoscia, 'mode' | 'okolica' | 'dom'>,
  used: ReadonlySet<string>,
  dar?: DarPowrotu,
): Gosc {
  const kto: KtoId =
    z.kto === 'lokator' || GRUPOWE.has(z.kto) || !KTO[z.kto].tryby.includes(ctx.mode) ? 'wedrowiec' : z.kto;
  const losowy = wybierz(
    rng,
    (Object.keys(BAZA_DAR) as DarPowrotu[]).map(
      (d) => [d, d === 'rodzenstwo' && kto === 'chory' ? 0 : BAZA_DAR[d]] as const,
    ),
  );
  let wybrany = dar ?? losowy;
  if (wybrany === 'rodzenstwo' && kto === 'chory') wybrany = 'jedzenie';
  const skad = wybierzSkad(rng, ctx.okolica);
  const porcje = wybrany === 'jedzenie' ? ri(2, 4, rng) : undefined;
  const mow = osobaZnajomego(rng, z, kto, used);
  const osoby = wybrany === 'rodzenstwo' ? [mow, rodzenstwo(rng, mow, used)] : [mow];
  const id = `g${n}`;
  osoby.forEach((p, i) => {
    p.id = `${id}p${i}`;
  });
  return {
    id,
    osoby,
    kto,
    chce: wybrany === 'rodzenstwo' ? 'dolaczyc' : 'nocleg',
    ma: wybrany === 'wiesc' ? 'wiadomosc' : 'nic',
    haczyk: 'prawda',
    skad,
    wraca: z.id,
    ...(porcje !== undefined ? { porcje } : {}),
  };
}
