/* Gość z klocków (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Klocki”): czyste dane i funkcje,
   bez hosta i bez stanu zarządu. Gość to grupa od 1 do 12 osób, które przychodzą razem; pierwsza mówi. Składa się z klocków:
   kto (archetyp), czego chce, co ma, haczyk (czy mówi prawdę), skąd (miejsce z okolicy albo kierunek) i satyra
   o dawnych czasach. Karta zarządu (zadanie 10) bierze z tego plan dla symulacji i tekst, a karty z 0.3, w których ktoś
   przychodzi pod bramę (zadanie 11), biorą stąd `osobyGrupy`.

   Kontrakt.
   - Losowanie tylko z podanego `Rng` (ziarno zarządu), w stałej kolejności: kto, haczyk, czego chce, co ma, skąd, osoby,
     rzecz, ugryziony, satyra. Ten sam `Rng` i ten sam kontekst dają tego samego gościa. Wybór ważony to jedno
     losowanie na wybór, tasowania nie ma.
   - Tabela wykluczeń: archetyp ogranicza „czego chce” (`KTO`), „co ma” (`MA_KTO`) i haczyk (`haczykiMozliwe`); dalej
     parami: kto prosi o wymianę, ma co wymienić; kto przynosi wiadomość, ma wiadomość albo ostrzeżenie; kłamca nie
     przynosi prawdziwych wiadomości; pościg nie handluje; przechowanie to rzecz (zapłata za przechowanie); dobicie tylko dla ugryzionego
     bliskiego i bez niczego w zamian. `zgodnyGosc` sprawdza całego gościa, a każda ścieżka tabeli zostawia niepusty wybór (pilnuje test).
   - Tryb: ocaleni, ktoś z ugryzionym bliskim i haczyk „ugryziony” tylko w zombie; haczyk „kłamie” i „pościg” tylko
     w zwykłym (w zombie kłamstwo to ukryte ugryzienie, a pościg robią szwendacze). Ocaleni i ludzie z ugryzionym
     bliskim mówią jak w The Walking Dead (strach, ukrywanie), bez satyry; samotne dzieci też jej nie mają.
   - Wagi: zima ×2 dla chorego (archetyp i haczyk), zapasy powyżej 20 ×1,5 dla kłamcy, narrator po spokoju
     (`ostrzej`) ×1,5 dla każdego haczyka poza prawdą, fach, który zarząd już ma, kusi mniej, pora i dom przesuwają
     „czego chce” i archetyp rodziny. Każda
     napaść na obcego odbiera 20% szansy na gościa: to nie waga klocka, tylko mnożnik wydarzenia (`wagaGoscia`).
   - Osoby: `makePerson` z listy imion 0.3 (zarząd nie ma tabel generatora), fach z puli archetypu, wiek mówiącego z
     `KTO[kto].wiek`, reszta grupy z wiekiem rodziny (dzieci 4–15, dziadkowie 65–85); rodzina, dzieci i ktoś z
     ugryzionym bliskim mają nazwisko mówiącego (forma męska albo żeńska z `SURN`). Osoby gościa mają id `g<n>p<i>`,
     żeby nie zderzyły się z identyfikatorami `s<n>` osób zarządu i mieszkańców. Zawód dzieci i reszty grupy to
     „dziecko” i „mieszkaniec”/„mieszkanka” (są w tabeli angielskich nazw zawodów).
   - Skąd: strona wejścia z jednakowym prawdopodobieństwem, a po niej najbliższe miejsce z `okolica` leżące po tej stronie
     (oś dominująca z liczb całkowitych, bez atan2; remis idzie na oś y). Nazwa, która wygląda na osobę (imię lub nazwisko
     z list 0.3 w dowolnym przypadku, „u Zbyszka”, tytuł przed nazwiskiem), odpada i zostaje sama kategoria (RODO). To druga
     linia obrony: `GovInput.okolica` przychodzi już przefiltrowana przez `nazwaDoOkolicy`, ale pełny filtr
     (src/mieszkancy/kronika.ts) potrzebuje tabel imion mieszkańców, których zarząd nie ma. Bez miejsca po tej stronie
     skąd to kierunek świata, bez klucza. Wiadomość („co ma” = wiadomość) może dotyczyć miejsca `skad.klucz`, a bez klucza
     celu z TARGETS; wybór robi karta (zadanie 10), tu jest tylko zdanie, które mówi, że gość coś wie.
   - Teksty: wybór wariantu zdania zależy tylko od gościa (skrót z id, imienia mówiącego i archetypu), więc ten sam gość
     czyta się tak samo przy każdym otwarciu i po wczytaniu zapisu. Zdania mówią „pod bramą”/„pod furtką” według `Words`,
     angielskie według `WordsEn`, bez pięter i numerów mieszkań. Każdy klocek ma po 3 warianty w obu językach,
     `wariantyGoscia` wystawia wszystkie (testy angielskiego sprawdzają każdy, nie tylko wybrany). */

import { zawodEn } from '../content/data.en.ts';
import { type Dom, NAMES, POICAT, PROFS, type Prof, SURN } from '../content/data.ts';
import { KAT_EN } from '../content/miejsca.en.ts';
import { makePerson, type Person, g as plec } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { hashString, pick, type Rng, ri } from '../core/rng.ts';
import { zPrzedimkiem } from '../mieszkancy/szablony.en.ts';
import type { Miejsce } from '../world/miasto.ts';
import type { Words, WordsEn } from './miejsce.ts';
import type { Pora } from './tresc.ts';
import type { GameMode } from './typy.ts';

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
  /** id znajomego przy powrocie (etap 4) */
  wraca?: string;
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

const ZIMA = 1;

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
  dezerter: ['Ochroniarz z galerii', 'Ochroniarz z galerii', 'Kurier', 'Ratownik medyczny'],
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
    umiejętnością (poziom ≥ 2) w dziedzinie, której zarząd jeszcze nie zna, a gdy takiego nie ma, jakąkolwiek z
    umiejętnością. */
function wybierzProf(rng: Rng, kto: KtoId, ma: MaId | null, znane: ReadonlySet<Dom>): Prof {
  const wiek = KTO[kto].wiek;
  const pula = FACHY_KTO[kto].map((n) => profZWiekiem(profPo(n), wiek)).filter((p): p is Prof => p !== null);
  if (ma === 'fach') {
    const umie = (p: Prof) => Object.entries(p[2]).filter(([, v]) => (v ?? 0) >= 2);
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
    archetypu: rodzina to partner, dzieci 4–15 i czasem dziadek albo babcia (65–85, gdy mówiący ma 40+); dziecko to
    młodsze rodzeństwo; ktoś z ugryzionym bliskim to partner, dziecko albo rodzic; reszta to dorośli. Rodzina, dzieci
    i bliski dzielą nazwisko mówiącego. Imiona się nie powtarzają i nie powtarzają `used`. Identyfikatory osób z `n`
    jak w `makePerson`. Wielkość grupy podaje wywołujący (1–12), nie tylko `KTO.ilu`: używają tego też karty z gościem. */
function grupa(
  rng: Rng,
  n: () => number,
  kto: KtoId,
  ilu: number,
  used: ReadonlySet<string>,
  profMowiacego?: Prof,
): Person[] {
  const zajete = new Set(used);
  const dodaj = (prof: Prof): Person => {
    const p = makePerson(rng, zajete, n, { prof });
    zajete.add(p.first);
    // dzieci bez cech: „Mistrz Excela” w wieku siedmiu lat to za wiele
    if (p.age < 16) p.traits = [];
    return p;
  };
  const wiek = KTO[kto].wiek;
  const prof =
    kto === 'dziecko' ? dziecieProf(wiek[0], wiek[1]) : (profMowiacego ?? wybierzProf(rng, kto, null, new Set()));
  const mow = dodaj(prof);
  const osoby: Person[] = [mow];
  const wspolneNazwisko = kto === 'rodzina' || kto === 'dziecko' || kto === 'z_ugryzionym';
  const nazwisko = mow.name.slice(mow.first.length + 1);
  const krewny = kto === 'z_ugryzionym' ? rng() : 0;
  let dziadkowie = 0;
  for (let i = 1; i < ilu; i++) {
    let p: Prof;
    if (kto === 'rodzina') {
      if (i === 1) {
        const a = przytnij(mow.age + ri(-6, 6, rng), 20, 80);
        p = doroslyProf(a, a);
      } else if (i >= 3 && mow.age >= 40 && dziadkowie < 2 && rng() < 0.25) {
        dziadkowie++;
        const a = przytnij(mow.age + ri(24, 34, rng), 65, 85);
        p = doroslyProf(a, a);
      } else {
        p = dziecieProf(4, Math.min(15, mow.age - 20));
      }
    } else if (kto === 'dziecko') {
      p = dziecieProf(Math.max(4, mow.age - 5), mow.age);
    } else if (kto === 'z_ugryzionym' && i === 1) {
      if (krewny < 1 / 3) {
        const a = przytnij(mow.age + ri(-6, 6, rng), 20, 80);
        p = doroslyProf(a, a);
      } else if (krewny < 2 / 3) {
        p = dziecieProf(4, Math.min(15, mow.age - 20));
      } else {
        const a = przytnij(mow.age + ri(24, 32, rng), 50, 85);
        p = doroslyProf(a, a);
      }
    } else {
      p = doroslyProf(18, 62);
    }
    const o = dodaj(p);
    if (wspolneNazwisko) o.name = `${o.first} ${nazwiskoDla(nazwisko, o.f)}`;
    osoby.push(o);
  }
  return osoby;
}

/** Osoby grupy dla gościa z klocków i dla kart z gościem (zadanie 11): `ilu` osób archetypu `kto`, pierwsza mówi. */
export function osobyGrupy(rng: Rng, n: () => number, kto: KtoId, ilu: number, used: ReadonlySet<string>): Person[] {
  return grupa(rng, n, kto, ilu, used);
}

// ---------------------------------------------------------------- skąd

/** Strona mapy, z której leży miejsce (x na wschód, y na południe): oś dominująca, remis idzie na oś y. Same liczby
    całkowite i porównania, bez atan2. */
export function stronaMiejsca(x: number, y: number): Strona {
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'n' : 's';
  return x > 0 ? 'e' : 'w';
}

const KIERUNEK: Record<Strona, Tx> = {
  n: tx('z północy', 'from the north'),
  e: tx('ze wschodu', 'from the east'),
  s: tx('z południa', 'from the south'),
  w: tx('z zachodu', 'from the west'),
};

/** Miejsce po „od strony” (dopełniacz) i po „from the direction of” według kategorii POICAT bez `mieszkania`. */
export const KATEGORIA_SKAD: Record<string, Tx> = {
  spozywczy: tx('sklepu spożywczego', 'the food shop'),
  apteka: tx('apteki', 'the pharmacy'),
  przychodnia: tx('przychodni', 'the clinic'),
  budowlany: tx('sklepu budowlanego', 'the DIY shop'),
  elektronika: tx('sklepu z elektroniką', 'the electronics shop'),
  szkola: tx('szkoły', 'the school'),
  biblioteka: tx('biblioteki', 'the library'),
  bank: tx('banku', 'the bank'),
  stacja: tx('stacji paliw', 'the petrol station'),
  ubrania: tx('sklepu z ubraniami', 'the clothes shop'),
  urzad: tx('urzędu', 'the council office'),
  kosciol: tx('kościoła', 'the church'),
  sklep: tx('sklepu', 'the shop'),
  ogrodnik: tx('sklepu ogrodniczego', 'the garden centre'),
  garaz: tx('garaży', 'the garages'),
  hala: tx('hali', 'the warehouse'),
};

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

/** Czy nazwa miejsca wygląda na osobę (imię albo nazwisko z list 0.3 w dowolnym przypadku, właściciel, tytuł). */
export function wygladaNaOsobe(nazwa: string): boolean {
  if (WZORZEC_WLASCICIELA.test(nazwa) || WZORZEC_TYTULU.test(nazwa)) return true;
  return nazwa.split(/[^\p{L}]+/u).some((t) => t.length > 0 && OSOBA_FORMY.has(t.toLowerCase()));
}

/** Własna nazwa miejsca do nawiasu: pusta, gdy wygląda na osobę albo powtarza kategorię (w którymkolwiek języku). */
function nazwaWlasna(m: Miejsce, kat: string): string {
  const n = m.nazwa.trim();
  if (!n || wygladaNaOsobe(n)) return '';
  const l = n.toLowerCase();
  if (l === POICAT[kat].name.toLowerCase() || l === KAT_EN[kat]?.toLowerCase()) return '';
  return n;
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
  const kat = Object.hasOwn(KATEGORIA_SKAD, najblizsze.kat) ? najblizsze.kat : 'sklep';
  const rodzaj = KATEGORIA_SKAD[kat];
  const wlasna = nazwaWlasna(najblizsze, kat);
  const dopisek = wlasna ? ` (${wlasna})` : '';
  return {
    strona,
    klucz: najblizsze.klucz,
    nazwa: tx(`od strony ${rodzaj.pl}${dopisek}`, `from the direction of ${rodzaj.en}${dopisek}`),
  };
}

// ---------------------------------------------------------------- rzecz

/** broń, którą gość może nieść (id z src/sim/bron.ts; zarząd nie importuje symulacji, więc nazwy są tu) */
const BRON: Record<string, { mian: string; bier: string; en: string; amunicja?: 'naboje' | 'loftki' | 'belty' }> = {
  noz: { mian: 'nóż', bier: 'nóż', en: 'a knife' },
  siekiera: { mian: 'siekiera', bier: 'siekierę', en: 'an axe' },
  lom: { mian: 'łom', bier: 'łom', en: 'a crowbar' },
  kij: { mian: 'kij z gwoździami', bier: 'kij z gwoździami', en: 'a nail bat' },
  dzida: { mian: 'dzida', bier: 'dzidę', en: 'a spear' },
  kusza: { mian: 'kusza', bier: 'kuszę', en: 'a crossbow', amunicja: 'belty' },
  rewolwer: { mian: 'rewolwer', bier: 'rewolwer', en: 'a revolver', amunicja: 'naboje' },
  strzelba: { mian: 'strzelba', bier: 'strzelbę', en: 'a shotgun', amunicja: 'loftki' },
};
const BRON_ZWYKLA = ['noz', 'siekiera', 'lom', 'kij', 'dzida', 'kusza', 'rewolwer', 'strzelba'];
const BRON_DEZERTERA = ['kij', 'lom', 'kusza', 'rewolwer', 'strzelba'];
const AMUNICJA: Record<'naboje' | 'loftki' | 'belty', { pl: string; en: string; ile: [number, number] }> = {
  naboje: { pl: 'naboje', en: 'rounds', ile: [4, 10] },
  loftki: { pl: 'loftki', en: 'buckshot', ile: [3, 8] },
  belty: { pl: 'bełty', en: 'bolts', ile: [5, 12] },
};

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

/** Linijki o dawnych czasach z 2051 roku: abonament, paczkomat, hulajnoga na minuty, token, opaska do snu i kilka
    innych. Bez pauz i bez prawdziwych nazw firm. Gość dostaje klucz (`Gosc.satyra`). */
export const SATYRA: Record<string, Tx> = {
  abonament: tx(
    'Przy pasku wisi plakietka „Premium”. Abonament wygasł lata temu, ale nikt nie anulował dumy.',
    'A “Premium” badge hangs from a belt. The subscription ran out years ago, but nobody cancelled the pride.',
  ),
  paczkomat: tx(
    'W kieszeni leży kod odbioru z paczkomatu. Przesyłka czeka tam od 2036 roku i pewnie ma się dobrze.',
    'A parcel locker pickup code sits in a pocket. The parcel has been waiting there since 2036 and is probably doing fine.',
  ),
  hulajnoga: tx(
    'Do plecaka przypięty jest kluczyk od hulajnogi na minuty. Hulajnogi dawno nie ma, ale ostatnia minuta podobno wciąż się nalicza.',
    'A key to a pay-per-minute scooter is clipped to a rucksack. The scooter is long gone, but the last minute is said to be still running.',
  ),
  token: tx(
    'Z kieszeni wystaje portfel na tokeny. Przed Wielkim Wylogowaniem kurs był wyższy niż złota, dziś nadaje się najwyżej na podpałkę.',
    'A token wallet sticks out of a pocket. Before the Great Logout it traded above gold. Now it is good for kindling at best.',
  ),
  opaska: tx(
    'Na nadgarstku tkwi opaska do mierzenia snu. Wyświetlacz od lat pokazuje zero godzin i radzi się wyspać.',
    'A sleep-tracking band sits on a wrist. The display has shown zero hours for years and advises getting some rest.',
  ),
  kredyty: tx(
    'W zeszycie złożony wydruk z kredytami węglowymi. Według tabeli starczy ich na rok jazdy samochodem, którego nie ma od ośmiu lat.',
    'A printout of carbon credits is folded into a notebook. By the table they would cover a year of driving a car that has not existed for eight years.',
  ),
  asystent: tx(
    'Z plecaka odzywa się cienki głosik: „Jak mogę pomóc?”. To asystent w telefonie bez sieci. Nikomu jeszcze nie pomógł, ale się stara.',
    'A thin voice pipes up from a rucksack: “How can I help?” It is an assistant on a phone with no signal. It has not helped anyone yet, but it keeps trying.',
  ),
  regulamin: tx(
    'Pod kurtką wydrukowany regulamin aplikacji do wynajmu rowerów miejskich. Czyta się go wieczorami: dawniej nikt nie dobrnął do końca, a teraz jest czas.',
    'Under a jacket there is a printed rulebook of a city bike-hire app. It gets read in the evenings: nobody ever reached the end before, and now there is time.',
  ),
};
const SATYRA_KLUCZE = Object.keys(SATYRA);

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

// ---------------------------------------------------------------- teksty

const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** „3 osoby”, „5 osób”: forma rzeczownika po liczbie */
const osobPl = (n: number): string => (n === 1 ? 'osoba' : n >= 2 && n <= 4 ? 'osoby' : 'osób');
const LICZBY_EN = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

/** czasownik w 3. osobie liczby pojedynczej: ask → asks, have → has, do → does, hold → holds */
function trzeciaOsoba(base: string): string {
  if (base === 'have') return 'has';
  if (/(?:s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** zawód po angielsku z przedimkiem („a plumber”, „an ESG consultant”) i bez („plumber”) */
function zawodMowiacego(p: Person): { pl: string; en: string; enA: string } {
  const en = zawodEn(p.prof.toLowerCase())
    .replace(/^shopping centre security$/, 'shopping centre security guard')
    .replace(/^council IT support$/, 'council IT technician');
  return { pl: p.prof.toLowerCase(), en, enA: zPrzedimkiem(en) };
}

/** Rzecz gościa w zdaniu: mianownik i biernik po polsku, po angielsku z przedimkiem („a crowbar and bolts”). */
function opisRzeczy(r: Gosc['rzecz']): { mian: string; bier: string; en: string } {
  const mian: string[] = [];
  const bier: string[] = [];
  const en: string[] = [];
  if (r?.arms) {
    const b = Object.hasOwn(BRON, r.arms) ? BRON[r.arms] : null;
    mian.push(b?.mian ?? 'broń');
    bier.push(b?.bier ?? 'broń');
    en.push(b?.en ?? 'a weapon');
  }
  for (const typ of ['naboje', 'loftki', 'belty'] as const) {
    if (r?.ammo?.[typ]) {
      mian.push(AMUNICJA[typ].pl);
      bier.push(AMUNICJA[typ].pl);
      en.push(AMUNICJA[typ].en);
    }
  }
  if (r?.meds) {
    mian.push('leki');
    bier.push('leki');
    en.push('some meds');
  }
  if (!mian.length) return { mian: 'coś przydatnego', bier: 'coś przydatnego', en: 'something useful' };
  return { mian: mian.join(' i '), bier: bier.join(' i '), en: en.join(' and ') };
}

/** Wszystko, czego potrzebuje zdanie o gościu: mówiący, grupa, słowa miejsca, zaimki, formy czasowników. */
interface C {
  g: Gosc;
  p: Person;
  /** ugryziony bliski (ktoś z ugryzionym bliskim), a bez niego mówiący */
  b: Person;
  n: number;
  /** grupa (więcej niż jedna osoba) */
  m: boolean;
  s: Words;
  e: WordsEn;
  skad: Tx;
  osobPl: string;
  /** Pod bramą, Przy bramie (wielką literą), bramę, bramy */
  Pod: string;
  Przy: string;
  bramaB: string;
  bramaD: string;
  /** the gate | the garden gate */
  gate: string;
  /** polska forma mówiącego: z('Przyszedł', 'Przyszła') */
  z: (m: string, f: string) => string;
  /** polskie czasowniki grupy: V('Prosi', 'Proszą') */
  V: (sg: string, pl: string) => string;
  /** angielskie zaimki mówiącego (on albo ona) */
  he: string;
  He: string;
  his: string;
  him: string;
  himself: string;
  man: string;
  boy: string;
  /** zaimki grupy: they dla grupy, inaczej he albo she */
  they: string;
  They: string;
  /** czasownik zgodny z grupą: v('ask') → ask | asks */
  v: (base: string) => string;
  rz: { mian: string; bier: string; en: string };
  prof: { pl: string; en: string; enA: string };
  /** liczba dzieci słownie: dwoje dzieci, troje dzieci; Two children */
  dzieciPl: string;
  DzieciEn: string;
}

function kontekst(g: Gosc, s: Words, e: WordsEn): C {
  const p = g.osoby[0];
  const n = g.osoby.length;
  const m = n > 1;
  const f = p.f;
  const he = f ? 'she' : 'he';
  const they = m ? 'they' : he;
  const dzieciPl = n === 2 ? 'dwoje dzieci' : n === 3 ? 'troje dzieci' : n === 4 ? 'czworo dzieci' : `${n} dzieci`;
  return {
    g,
    p,
    b: g.osoby[g.ugryziony ?? 1] ?? p,
    n,
    m,
    s,
    e,
    skad: g.skad.nazwa,
    osobPl: osobPl(n),
    Pod: wielka(s.brama.pod),
    Przy: wielka(s.brama.przy),
    bramaB: s.brama.b,
    bramaD: s.brama.d,
    gate: e.brama,
    z: (mu, ko) => plec(p, mu, ko),
    V: (sg, pl) => (m ? pl : sg),
    he,
    He: wielka(he),
    his: f ? 'her' : 'his',
    him: f ? 'her' : 'him',
    himself: f ? 'herself' : 'himself',
    man: f ? 'woman' : 'man',
    boy: f ? 'girl' : 'boy',
    they,
    They: wielka(they),
    v: (base) => (m ? base : trzeciaOsoba(base)),
    rz: opisRzeczy(g.rzecz),
    prof: zawodMowiacego(p),
    dzieciPl,
    DzieciEn: n >= 2 && n < LICZBY_EN.length ? `${LICZBY_EN[n]} children` : `${n} children`,
  };
}

type Wariant = (c: C) => Tx;
type Trzy = readonly [Wariant, Wariant, Wariant];

/** angielska nazwa wspólnoty bez rodzajnika: the co-op → co-op, the street → street */
const bezThe = (s: string): string => s.replace(/^the /, '');

/** Kto i skąd: jedno albo dwa krótkie zdania, w tym skąd przyszedł. */
const KTO_TEKST: Record<KtoId, Trzy> = {
  wedrowiec: [
    (c) =>
      tx(
        `${c.Pod} stoi ${c.z('chudy mężczyzna', 'chuda kobieta')} z plecakiem i workiem na sznurku. ${c.z('Przyszedł', 'Przyszła')} ${c.skad.pl}.`,
        `A thin ${c.man} with a rucksack and a sack on a string is standing at ${c.gate}. ${c.He} came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} czeka ${c.z('wędrowiec', 'wędrowniczka')} z kijem i kocem zwiniętym na plecach. Idzie ${c.skad.pl}, ${c.z('sam', 'sama')} od kilku dni.`,
        `A wanderer with a stick and a blanket rolled up on ${c.his} back is waiting at ${c.gate}. ${c.He} is walking ${c.skad.en}, alone for days now.`,
      ),
    (c) =>
      tx(
        `Ktoś wali kijem w ${c.bramaB}. To ${c.z('wędrowiec', 'wędrowniczka')} ${c.p.name}, ${c.z('który', 'która')} ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
        `Someone is banging on ${c.gate} with a stick. It is a wanderer called ${c.p.name}, who came ${c.skad.en}.`,
      ),
  ],
  rodzina: [
    (c) =>
      tx(
        `${c.Pod} stoi rodzina: ${c.n} ${c.osobPl}, wózek pełen garnków i jeden zmęczony głos. ${c.p.name} mówi, że przyszli ${c.skad.pl}.`,
        `A family is standing at ${c.gate}: ${c.n} people, a pram full of pots and one tired voice. ${c.p.name} says they came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} czeka rodzina z bagażem, w sumie ${c.n} ${c.osobPl}. Idą ${c.skad.pl}, a ${c.z('mężczyzna', 'kobieta')} na przedzie przedstawia się jako ${c.p.name}.`,
        `A family with luggage is waiting at ${c.gate}, ${c.n} people in all. They are coming ${c.skad.en}, and the ${c.man} at the front gives ${c.his} name as ${c.p.name}.`,
      ),
    (c) =>
      tx(
        `Ktoś stuka łyżką w garnek ${c.s.brama.przy}. To ${c.p.name} z rodziną, razem ${c.n} ${c.osobPl}. Przyszli ${c.skad.pl}.`,
        `Someone taps a spoon on a pot at ${c.gate}. It is ${c.p.name} and family, ${c.n} people in all. They came ${c.skad.en}.`,
      ),
  ],
  dezerter: [
    (c) =>
      tx(
        `${c.Pod} stoi ${c.z('facet', 'kobieta')} w kurtce z napisem „Ochrona”, ale bez odznaki. ${c.z('Zwiał', 'Zwiała')} z zamkniętego osiedla i ${c.z('szedł', 'szła')} ${c.skad.pl}.`,
        `A ${c.man} in a jacket marked “Security”, but with no badge, is standing at ${c.gate}. ${c.He} walked out of a gated estate and has been coming ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `Czapka z logo firmy ochroniarskiej, wojskowe buty, ręce w górze. ${c.p.name} ${c.z('porzucił', 'porzuciła')} posterunek przy szlabanie zamkniętego osiedla i ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
        `A security firm cap, army boots, hands raised. ${c.p.name} abandoned ${c.his} post at the barrier of a gated estate and came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} czeka ${c.z('były ochroniarz', 'była ochroniarka')} z zamkniętego osiedla, ${c.z('który miał', 'która miała')} dość tłumaczenia, czemu szlaban opuszcza się sam. Idzie ${c.skad.pl}.`,
        `A former security guard from a gated estate is waiting at ${c.gate}, tired of explaining why the barrier lowers itself. ${c.He} is coming ${c.skad.en}.`,
      ),
  ],
  uciekinier: [
    (c) =>
      tx(
        `${c.Pod} stoi ${c.z('człowiek', 'kobieta')} z jedną torbą i zdartymi łokciami. ${c.z('Uciekł', 'Uciekła')} z sąsiedniej ${c.s.wspolnota.d}, to znaczy ${c.skad.pl}.`,
        `A ${c.man} with a single bag and scraped elbows is standing at ${c.gate}. ${c.He} ran away from the neighbouring ${bezThe(c.e.wspolnota)}, which is to say ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} stoi ${c.p.name}, ${c.z('uciekinier', 'uciekinierka')} z sąsiedniej ${c.s.wspolnota.d}. Mówi, że ${c.z('wyszedł', 'wyszła')} nocą i ${c.z('szedł', 'szła')} ${c.skad.pl}.`,
        `${c.p.name}, a runaway from the neighbouring ${bezThe(c.e.wspolnota)}, is standing at ${c.gate}. ${c.He} says ${c.he} left in the night and has been coming ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.z('Zdyszany mężczyzna', 'Zdyszana kobieta')} opiera się o słupek ${c.bramaD} i łapie oddech. ${c.z('Uciekł', 'Uciekła')} z sąsiedniej ${c.s.wspolnota.d} i ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
        `A breathless ${c.man} leans on the gatepost, catching ${c.his} breath. ${c.He} ran away from the neighbouring ${bezThe(c.e.wspolnota)} and came ${c.skad.en}.`,
      ),
  ],
  chory: [
    (c) =>
      tx(
        `${c.Pod} stoi ${c.z('mężczyzna, który', 'kobieta, która')} ledwo trzyma się na nogach. ${c.z('Przyszedł', 'Przyszła')} ${c.skad.pl}.`,
        `A ${c.man} who can barely stay on ${c.his} feet is standing at ${c.gate}. ${c.He} came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} ktoś siedzi na plecaku, bo stać już nie ma siły. To ${c.p.name}, ${c.z('który', 'która')} ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
        `Someone is sitting on a rucksack at ${c.gate}, with no strength left to stand. It is ${c.p.name}, who came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.z('Chory mężczyzna', 'Chora kobieta')} opiera czoło o słupek ${c.bramaD} i mówi coś cicho. ${c.z('Szedł', 'Szła')} ${c.skad.pl}.`,
        `A sick ${c.man} rests ${c.his} forehead against the gatepost and says something quietly. ${c.He} walked ${c.skad.en}.`,
      ),
  ],
  dziecko: [
    (c) =>
      c.m
        ? tx(
            `${c.Pod} stoi ${c.dzieciPl}, trzymają się za ręce. Przyszły ${c.skad.pl}, z jednym plecakiem na wszystkie.`,
            `${c.DzieciEn} are standing at ${c.gate}, holding hands. They came ${c.skad.en} with one rucksack between them.`,
          )
        : tx(
            `${c.Pod} stoi ${c.z('chłopiec', 'dziewczynka')} z plecakiem większym od ${c.z('niego', 'niej')}, ${c.z('sam', 'sama')} jak palec. ${c.z('Przyszedł', 'Przyszła')} ${c.skad.pl}.`,
            `A ${c.boy} with a rucksack bigger than ${c.him} is standing at ${c.gate}, all on ${c.his} own. ${c.He} came ${c.skad.en}.`,
          ),
    (c) =>
      c.m
        ? tx(
            `${c.Przy} na krawężniku siedzi ${c.dzieciPl}. Najstarsze przedstawia się jako ${c.p.first}. Przyszły ${c.skad.pl}.`,
            `${c.DzieciEn} are sitting on the kerb by ${c.gate}. The eldest gives the name ${c.p.first}. They came ${c.skad.en}.`,
          )
        : tx(
            `${c.Przy} na krawężniku siedzi ${c.z('chłopiec', 'dziewczynka')} ${c.p.name}. ${c.z('Przyszedł', 'Przyszła')} ${c.skad.pl}.`,
            `${c.p.name}, a ${c.boy}, is sitting on the kerb by ${c.gate}. ${c.He} came ${c.skad.en}.`,
          ),
    (c) =>
      c.m
        ? tx(
            `Cienki głos z drugiej strony ${c.bramaD}: „Przepraszamy, czy można?”. To ${c.p.first} i reszta, razem ${c.dzieciPl}. Przyszły ${c.skad.pl}.`,
            `“Excuse me, may we come in?” asks a thin voice from the other side of ${c.gate}. It is ${c.p.first} and the rest, ${c.n} children in all. They came ${c.skad.en}.`,
          )
        : tx(
            `Cienki głos z drugiej strony ${c.bramaD}: „Przepraszam, czy można?”. To ${c.z('chłopiec', 'dziewczynka')} ${c.p.first}, ${c.z('który', 'która')} ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
            `“Excuse me, may I come in?” asks a thin voice from the other side of ${c.gate}. It is ${c.p.first}, a ${c.boy} who came ${c.skad.en}.`,
          ),
  ],
  znajomy: [
    (c) =>
      tx(
        `${c.Pod} stoi ${c.z('mężczyzna, który macha', 'kobieta, która macha')} do wszystkich po kolei, jakby się znali, i twierdzi, że zna kogoś z ${c.s.zarzad.d}. ${c.z('Przyszedł', 'Przyszła')} ${c.skad.pl}.`,
        `A ${c.man} at ${c.gate} waves at everyone in turn as if they all knew each other, and claims to know someone on ${c.e.zarzad}. ${c.He} came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.Przy} czeka ${c.p.name}, ${c.z('który', 'która')} twierdzi, że przed Wielkim Wylogowaniem ${c.z('widział', 'widziała')} się z kimś z ${c.s.zarzad.d} i że ten ktoś na pewno się ucieszy. Idzie ${c.skad.pl}.`,
        `${c.p.name} is waiting at ${c.gate}, claiming that ${c.he} met someone on ${c.e.zarzad} before the Great Logout and that this person will surely be glad. ${c.He} is coming ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `Zza ${c.bramaD} ktoś woła do was jak do starych sąsiadów. To ${c.p.name}, ${c.z('który', 'która')} zna kogoś z ${c.s.zarzad.d} i ${c.z('przyszedł', 'przyszła')} ${c.skad.pl}.`,
        `From behind ${c.gate} someone calls out to you like old neighbours. It is ${c.p.name}, who knows someone on ${c.e.zarzad} and came ${c.skad.en}.`,
      ),
  ],
  ocaleni: [
    (c) =>
      tx(
        `${c.Pod} stoją ${c.n} ${c.osobPl}, brudne, głodne i bardzo ciche, które dwie doby przesiedziały w piwnicy i ruszyły dopiero, gdy ucichło. Idą ${c.skad.pl}.`,
        `${c.n} people are standing at ${c.gate}, filthy, hungry and very quiet, having spent two days in a cellar and set off only when the groaning stopped. They are coming ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `Ktoś syczy „cicho!” do reszty. Ocaleni, ${c.n} ${c.osobPl}, stoją ${c.s.brama.przy} i patrzą, czy coś za nimi nie idzie. Przyszli ${c.skad.pl}.`,
        `Someone hisses “quiet!” at the others. The survivors, ${c.n} of them, stand by ${c.gate} and keep checking whether anything is following. They came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.p.name} mówi, że jest ich ${c.n} i wszyscy żywi. „Sprawdziliśmy”, dodaje szeptem. Przyszli ${c.skad.pl}.`,
        `${c.p.name} says there are ${c.n} of them and all alive. “We checked,” ${c.he} adds in a whisper. They came ${c.skad.en}.`,
      ),
  ],
  z_ugryzionym: [
    (c) =>
      tx(
        `${c.Pod} stoi dwoje ludzi: ${c.p.name} i ${c.b.first}, ${c.b.f ? 'która' : 'który'} ledwo idzie, trzymając się ${c.z('jego', 'jej')} ramienia. Przyszli ${c.skad.pl}.`,
        `Two people are standing at ${c.gate}: ${c.p.name} and ${c.b.first}, who can barely walk and clings to ${c.his} arm. They came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `${c.p.name} mówi wolno i cicho, jak do spłoszonego psa, a za ${c.z('jego', 'jej')} plecami siedzi ${c.b.first} i nie chce wstać. Przyszli ${c.skad.pl}.`,
        `${c.p.name} speaks slowly and quietly, as to a startled dog, while behind ${c.his} back ${c.b.first} sits and will not get up. They came ${c.skad.en}.`,
      ),
    (c) =>
      tx(
        `„Nie strzelajcie, to my!” woła ${c.p.name} zza ${c.bramaD}, a obok ${c.b.first} kołysze się jak na wietrze. Przyszli ${c.skad.pl}.`,
        `“Don’t shoot, it’s us!” ${c.p.name} calls from behind ${c.gate}, while ${c.b.first} beside ${c.him} sways in the wind. They came ${c.skad.en}.`,
      ),
  ],
};

/** Czego chce: jedno krótkie zdanie (przy dobiciu dwa). */
const CHCE_TEKST: Record<ChceId, Trzy> = {
  nocleg: [
    (c) =>
      tx(
        `${c.V('Prosi', 'Proszą')} o miejsce do spania na jedną noc, choćby na podłodze.`,
        `${c.They} ${c.v('ask')} for a place to sleep for one night, even on the floor.`,
      ),
    (c) =>
      tx(
        `${c.V('Chce', 'Chcą')} przenocować i ${c.V('obiecuje', 'obiecują')}, że rano ${c.V('zniknie', 'znikną')} bez śladu.`,
        `${c.They} ${c.v('want')} to spend the night and ${c.v('promise')} to be gone by morning without a trace.`,
      ),
    (c) =>
      tx(
        `${c.V('Pyta', 'Pytają')}, czy znalazłby się jakiś kąt na noc, bo dalej nie ma dokąd pójść.`,
        `${c.They} ${c.v('ask')} whether there might be a corner for the night, as there is nowhere else to go.`,
      ),
  ],
  jedzenie: [
    (c) =>
      tx(
        `${c.V('Prosi', 'Proszą')} o coś do jedzenia, choćby jeden słoik na drogę.`,
        `${c.They} ${c.v('ask')} for something to eat, even a single jar for the road.`,
      ),
    (c) =>
      tx(
        `Nie ${c.V('prosi', 'proszą')} o dach nad głową, tylko o jedzenie: ostatni raz ${c.V(c.z('jadł', 'jadła'), 'jedli')} trzy dni temu.`,
        `${c.They} ${c.v('ask')} for food, not for a roof: the last proper meal was three days ago.`,
      ),
    (c) =>
      tx(
        `${c.V('Pokazuje', 'Pokazują')} pusty słoik i ${c.V('pyta', 'pytają')}, czy da się go czymś napełnić.`,
        `${c.They} ${c.v('hold')} up an empty jar and ${c.v('ask')} whether it can be filled with something.`,
      ),
  ],
  leki: [
    (c) =>
      tx(
        `${c.V('Szuka', 'Szukają')} leków: czegokolwiek na gorączkę, na ból, na kaszel.`,
        `${c.They} ${c.v('need')} meds: anything for fever, pain or a cough.`,
      ),
    (c) =>
      tx(
        `${c.V('Pyta', 'Pytają')} o apteczkę i ${c.V('obiecuje', 'obiecują')} się odwdzięczyć, choć pieniędzy nie ma.`,
        `${c.They} ${c.v('ask')} about a first-aid kit and ${c.v('promise')} to make it up to you, though there is no money.`,
      ),
    (c) =>
      tx(
        `${c.V('Prosi', 'Proszą')} o jakiekolwiek leki, choćby przeterminowane, nawet te z datą sprzed Wylogowania.`,
        `${c.They} ${c.v('ask')} for any meds at all, even out of date, even ones dated before the Great Logout.`,
      ),
  ],
  wymiana: [
    (c) =>
      tx(
        `${c.V('Proponuje', 'Proponują')} wymianę, bo pieniędzy nikt już nie bierze: towar za towar.`,
        `${c.They} ${c.v('offer')} a swap, as nobody takes money any more: goods for goods.`,
      ),
    (c) =>
      tx(
        `${c.V('Chce', 'Chcą')} się targować, zanim ktokolwiek zdążył otworzyć usta.`,
        `${c.They} ${c.v('want')} to haggle before anyone has had a chance to open their mouth.`,
      ),
    (c) =>
      tx(
        `${c.V('Pyta', 'Pytają')}, czy bierzecie rzeczy zamiast pieniędzy, skoro pieniądze skończyły się razem z bankomatami.`,
        `${c.They} ${c.v('ask')} whether you take things instead of money, now that money has run out together with the cash machines.`,
      ),
  ],
  dolaczyc: [
    (c) =>
      tx(
        `${c.V('Chce', 'Chcą')} zostać na stałe, jeśli ${c.s.zarzad.m} pozwoli.`,
        `${c.They} ${c.v('want')} to stay for good, if ${c.e.zarzad} allows it.`,
      ),
    (c) =>
      tx(
        `${c.V('Pyta', 'Pytają')}, czy znalazłoby się miejsce ${c.s.mieszkamy} na stałe, i ${c.V('obiecuje', 'obiecują')} wziąć dyżur przy kozie od pierwszego wieczoru.`,
        `${c.They} ${c.v('ask')} whether there is room ${c.e.mieszkamy} for good, and ${c.v('promise')} to take stove watch from the first evening.`,
      ),
    (c) =>
      tx(
        `${c.V('Mówi', 'Mówią')}, że ${c.V('ma', 'mają')} dość wędrowania i ${c.V('chce', 'chcą')} mieć wreszcie sąsiadów, i ${c.V('pyta', 'pytają')}, jak się zapisać.`,
        `${c.They} ${c.v('say')} ${c.they} ${c.v('have')} had enough of wandering and ${c.v('want')} neighbours at last, and ${c.v('ask')} how to sign up.`,
      ),
  ],
  przechowac: [
    (c) =>
      tx(
        `${c.V('Chce', 'Chcą')} zostawić u was coś na przechowanie i wrócić po to, jak będzie można, ale nie ${c.V('mówi', 'mówią')}, co to jest.`,
        `${c.They} ${c.v('want')} to leave something with you for safekeeping and come back for it when ${c.they} can, but ${c.they} ${c.v('do')} not say what it is.`,
      ),
    (c) =>
      tx(
        `${c.V('Prosi', 'Proszą')} o przechowanie zawiniątka: ${c.V('zostawi', 'zostawią')} je pod waszą opieką i ${c.V('obiecuje', 'obiecują')} wrócić po nie przy pierwszej okazji.`,
        `${c.They} ${c.v('ask')} you to look after a bundle: ${c.they} will leave it in your care and ${c.v('promise')} to come back for it at the first opportunity.`,
      ),
    (c) =>
      tx(
        `${c.V('Pyta', 'Pytają')}, czy da się zostawić tu torbę, bo z nią dalej się nie da, i ${c.V('zapłaci', 'zapłacą')} za przechowanie jak na dworcu za dawnych czasów.`,
        `${c.They} ${c.v('ask')} whether a bag can be left here, as ${c.they} cannot go on with it, and will pay for the storage like at a station in the old days.`,
      ),
  ],
  wiadomosc: [
    (c) =>
      tx(
        `${c.V('Mówi', 'Mówią')}, że ${c.V('ma', 'mają')} wiadomość dla ${c.s.zarzad.d} i że nie ${c.V('powie', 'powiedzą')} jej przez siatkę.`,
        `${c.They} ${c.v('say')} ${c.they} ${c.v('have')} a message for ${c.e.zarzad} and that it will not be said through the fence.`,
      ),
    (c) =>
      tx(
        `${c.V('Chce', 'Chcą')} coś przekazać, ale najpierw ${c.V('pyta', 'pytają')}, kto tu decyduje.`,
        `${c.They} ${c.v('want')} to pass something on, but first ${c.v('ask')} who decides here.`,
      ),
    (c) =>
      tx(
        `${c.V(c.z('Przyszedł', 'Przyszła'), 'Przyszli')} powiedzieć, co się dzieje po drodze, zanim ktoś zdąży zamknąć ${c.bramaB}.`,
        `${c.They} came to tell you what is going on out there before anyone shuts ${c.gate}.`,
      ),
  ],
  dobic: [
    (c) =>
      tx(
        `Prosi o jedno: żeby ktoś dobił ${c.b.f ? 'ją' : 'go'}, bo ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i nie dożyje rana, a ${c.z('sam', 'sama')} nie potrafi.`,
        `${c.He} asks for one thing: for someone to put ${c.b.f ? 'her' : 'him'} down, because ${c.b.first} is bitten and will not see the morning, and ${c.he} cannot do it ${c.himself}.`,
      ),
    (c) =>
      tx(
        `Mówi, że ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i że trzeba to zrobić szybko: dzida albo łom, jeden cios. ${c.z('Sam', 'Sama')} nie da rady.`,
        `${c.He} says ${c.b.first} is bitten and that it has to be quick: a spear or a crowbar, one blow. ${c.He} cannot do it ${c.himself}.`,
      ),
    (c) =>
      tx(
        `${c.z('Ręce mu się trzęsą', 'Ręce jej się trzęsą')}. ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i jeszcze wczoraj sam${c.b.f ? 'a' : ''} prosił${c.b.f ? 'a' : ''}, żeby nie czekać, a ${c.z('on', 'ona')} pyta, czy ktoś tu zrobi to bez gadania.`,
        `${wielka(c.his)} hands are shaking. ${c.b.first} is bitten and begged only yesterday not to be left waiting, and ${c.he} asks whether anyone here will do it without a fuss.`,
      ),
  ],
};

/** Co ma: fach mówiącego, rzecz, wiadomość o okolicy, ostrzeżenie albo nic; jedno zdanie. */
const MA_TEKST: Record<MaId, Trzy> = {
  fach: [
    (c) =>
      tx(
        `${c.m ? `${c.p.first} z zawodu to` : 'Z zawodu to'} ${c.prof.pl}, więc ręce wciąż pamiętają robotę.`,
        `${c.m ? c.p.first : c.He} is ${c.prof.enA} by trade, so the hands still remember the work.`,
      ),
    (c) =>
      tx(
        `${c.p.first} mówi, że z zawodu to ${c.prof.pl} i że chętnie się przyda, jeśli tylko ktoś da ${c.z('mu', 'jej')} zajęcie.`,
        `${c.p.first} says ${c.he} is ${c.prof.enA} by trade and would gladly make ${c.himself} useful if somebody gave ${c.him} something to do.`,
      ),
    (c) =>
      tx(
        `Na pytanie, co umie, ${c.p.first} odpowiada jednym słowem: ${c.prof.pl}.`,
        `Asked what ${c.he} can do, ${c.p.first} answers in one word: ${c.prof.en}.`,
      ),
  ],
  rzecz: [
    (c) =>
      tx(
        `${c.V('Ma', 'Mają')} przy sobie ${c.rz.bier} i nie ${c.V('ukrywa', 'ukrywają')} tego.`,
        `${c.m ? 'They are' : `${c.He} is`} carrying ${c.rz.en} and ${c.v('make')} no secret of it.`,
      ),
    (c) =>
      tx(
        `W plecaku: ${c.rz.mian}; ${c.V('odda', 'oddadzą')} to chętnie za odrobinę życzliwości.`,
        `In the rucksack: ${c.rz.en}, which ${c.they} would gladly part with for a little kindness.`,
      ),
    (c) =>
      tx(
        `Nie ${c.V('jest', 'są')} z pustymi rękami: ${c.rz.mian}, do wymiany albo w podzięce.`,
        `Not empty-handed: ${c.rz.en}, for a swap or as thanks.`,
      ),
  ],
  wiadomosc: [
    (c) =>
      tx(
        `${c.V('Zna', 'Znają')} okolicę, z której ${c.V(c.z('przyszedł', 'przyszła'), 'przyszli')}, i ${c.V('wie', 'wiedzą')}, co tam jeszcze leży, a ${c.V('powie', 'powiedzą')}, jeśli ktoś zapyta.`,
        `${c.They} ${c.v('know')} the area ${c.they} came from and what is still lying about there, and will say if asked.`,
      ),
    (c) =>
      tx(
        `Po drodze ${c.V(c.z('widział', 'widziała'), 'widzieli')} rzeczy, o których warto wiedzieć, i ${c.V('opowie', 'opowiedzą')}, co gdzie jest, byle ktoś posłuchał.`,
        `${c.They} saw things on the way that are worth knowing about, and will tell you what is where, if only somebody listens.`,
      ),
    (c) =>
      tx(
        `${c.V('Ma', 'Mają')} wiadomość o miejscu niedaleko stąd: nikt tam nie zaglądał od miesięcy.`,
        `${c.They} ${c.v('have')} news of a place not far from here: nobody has looked in there for months.`,
      ),
  ],
  ostrzezenie: [
    (c) =>
      tx(
        `${c.V('Ma', 'Mają')} ostrzeżenie: coś niedobrego kręci się po okolicy i może tu zajrzeć tej nocy.`,
        `${c.They} ${c.v('have')} a warning: something nasty is prowling the area and may call in tonight.`,
      ),
    (c) =>
      tx(
        `${c.V('Mówi', 'Mówią')} półgłosem, że tej nocy lepiej nie spać, i ${c.V('woli', 'wolą')} nie mówić dlaczego.`,
        `${c.They} ${c.v('say')} under ${c.m ? 'their' : c.his} breath that it is better not to sleep tonight, and ${c.v('prefer')} not to say why.`,
      ),
    (c) =>
      tx(
        `${c.V('Radzi', 'Radzą')}, żeby tej nocy wystawić na wartę dwie osoby zamiast jednej, ale skąd to ${c.V('wie', 'wiedzą')}, nie ${c.V('powie', 'powiedzą')}.`,
        `${c.They} ${c.v('advise')} putting two people on watch tonight instead of one, but will not say how ${c.they} ${c.v('know')}.`,
      ),
  ],
  nic: [
    (c) =>
      tx(
        `${c.V('Nie ma', 'Nie mają')} nic przydatnego: ani torby, ani niczego do wymiany, tylko to, co na grzbiecie.`,
        `${c.They} ${c.v('have')} nothing useful: no bag, nothing to swap, only what is on ${c.m ? 'their' : c.his} back.`,
      ),
    () =>
      tx(
        'Kieszenie przetrząśnięte do dna: nic do jedzenia, nic do wymiany.',
        'Pockets searched to the bottom: nothing to eat, nothing to swap.',
      ),
    () =>
      tx(
        'Nic przydatnego poza imieniem i prośbą, resztę wzięła droga.',
        'Nothing useful but a name and a request, the road took the rest.',
      ),
  ],
};

/** Zdanie z tropem haczyka: po nim uważny gracz zgaduje, co z gościem jest nie tak (albo że nic). */
const TROP_TEKST: Record<HaczykId, Trzy> = {
  prawda: [
    () =>
      tx(
        'Opowieść trzyma się kupy: za drugim razem te same szczegóły i ten sam spokojny głos.',
        'The story holds together: the same details the second time round, the same level voice.',
      ),
    () =>
      tx(
        'Buty zdarte do cna, jak po długim marszu, a ręce cały czas na wierzchu.',
        'Boots worn right through, as after a long march, and hands kept in plain sight the whole time.',
      ),
    () =>
      tx(
        'Gdy ktoś zapyta o szczegół, odpowiedź przychodzi bez zastanowienia i bez ozdobników.',
        'Ask about a detail and the answer comes without a pause and without embroidery.',
      ),
  ],
  klamie: [
    () =>
      tx(
        'Gdy zapytać drugi raz o drogę, nazwa ulicy jest już inna.',
        'Ask about the route a second time and the street has a different name.',
      ),
    () =>
      tx(
        'Oczy biegają po podwórku, jakby liczyły, co gdzie stoi.',
        'The eyes run over the yard as if counting what stands where.',
      ),
    () =>
      tx(
        'Pytania o wasze zapasy padają szybciej niż pytanie o to, jak się nazywacie.',
        'Questions about your stores come faster than the question of what you are called.',
      ),
  ],
  chory: [
    (c) =>
      tx(
        `${c.m ? 'Ktoś z nich kaszle' : 'Kaszle'} w rękaw i za każdym razem przeprasza.`,
        `${c.m ? 'One of them coughs' : `${c.He} coughs`} into a sleeve and apologises every time.`,
      ),
    () => tx('Oczy szkliste, czoło mokre mimo chłodu.', 'Glassy eyes and a damp forehead in spite of the cold.'),
    (c) =>
      tx(
        `${c.m ? 'Ktoś z nich trzyma' : 'Trzyma'} się słupka ${c.bramaD} i co chwilę odwraca twarz, żeby nikogo nie zarazić.`,
        `${c.m ? 'One of them holds' : `${c.He} holds`} on to the gatepost and keeps turning away so as not to breathe on anyone.`,
      ),
  ],
  poscig: [
    (c) =>
      tx(
        `${c.m ? 'Co chwilę ktoś z nich ogląda' : 'Co chwilę ogląda'} się za siebie, jakby ktoś szedł tym samym śladem.`,
        `${c.m ? 'Every so often one of them looks' : `Every so often ${c.he} looks`} back, as if someone were following the same tracks.`,
      ),
    (c) =>
      tx(
        `${c.V('Stoi', 'Stoją')} bokiem do drogi i nie ${c.V('spuszcza', 'spuszczają')} z niej oka.`,
        `${c.They} ${c.v('stand')} sideways to the road and ${c.v('keep')} watching it.`,
      ),
    (c) =>
      tx(
        `Pierwsze pytanie: czy ${c.s.brama.m} zamyka się od środka i jak szybko.`,
        `The first question is whether ${c.gate} locks from the inside, and how fast.`,
      ),
  ],
  ugryziony: [
    () =>
      tx(
        'Rękaw naciągnięty na dłoń i dłoń ani razu nie wychyla się z rękawa.',
        'A sleeve pulled down over a hand, and the hand never once comes out of it.',
      ),
    () =>
      tx(
        'Spod kurtki wystaje brzeg bandaża, a gdy ktoś o niego zapyta, rozmowa zaraz schodzi na pogodę.',
        'The edge of a bandage sticks out from under a jacket. Ask about it, and the conversation drifts to the weather.',
      ),
    () =>
      tx(
        'Rumieniec na policzkach, pot na czole i gorączkowy upór, że to tylko od marszu.',
        'Flushed cheeks, sweat on the forehead and a feverish insistence that it is only from the walk.',
      ),
  ],
};

/** Trop, gdy ktoś prosi o dobicie bliskiego: ugryzienie jest jawne, więc zdanie pokazuje, jak z nim jest źle. */
const TROP_BLISKI: Trzy = [
  (c) =>
    tx(
      `${c.b.first}: rękaw ciemny od krwi, dłoń siwa, a oddech płytki i szybki.`,
      `${c.b.first}’s sleeve is dark with blood, the hand grey, the breath shallow and quick.`,
    ),
  () =>
    tx(
      'Spod bandaża zrobionego z koszuli sączy się coś ciemnego, a gorączkę czuć na metr.',
      'Something dark seeps through a bandage made from a shirt, and the fever can be felt from a metre away.',
    ),
  (c) =>
    tx(
      `${c.b.first} ma oczy otwarte, ale nikogo nie widzi.`,
      `${c.b.first} has ${c.b.f ? 'her' : 'his'} eyes open, but sees nobody.`,
    ),
];

/** Tytuł karty: kto pod bramą (albo furtką), rodzaj według mówiącego, grupa w liczbie mnogiej. */
const TYTUL: Record<KtoId, (c: C) => Tx> = {
  wedrowiec: (c) => tx(`${c.z('Wędrowiec', 'Wędrowniczka')} ${c.s.brama.pod}`, `A drifter at ${c.gate}`),
  rodzina: (c) => tx(`Rodzina ${c.s.brama.pod}`, `A family at ${c.gate}`),
  dezerter: (c) => tx(`${c.z('Dezerter', 'Dezerterka')} ${c.s.brama.pod}`, `A deserter at ${c.gate}`),
  uciekinier: (c) => tx(`${c.z('Uciekinier', 'Uciekinierka')} ${c.s.brama.pod}`, `A runaway at ${c.gate}`),
  chory: (c) => tx(`${c.z('Chory', 'Chora')} ${c.s.brama.pod}`, `A sick ${c.man} at ${c.gate}`),
  dziecko: (c) =>
    c.m
      ? tx(`Dzieci ${c.s.brama.pod}`, `Children at ${c.gate}`)
      : tx(`Dziecko ${c.s.brama.pod}`, `A child at ${c.gate}`),
  znajomy: (c) => tx(`${c.z('Znajomy', 'Znajoma')} ${c.s.brama.pod}`, `An acquaintance at ${c.gate}`),
  ocaleni: (c) => tx(`Ocaleni ${c.s.brama.pod}`, `Survivors at ${c.gate}`),
  z_ugryzionym: (c) => tx(`Dwoje ludzi ${c.s.brama.pod}`, `Two people at ${c.gate}`),
};

export interface WariantyGoscia {
  kto: Tx[];
  chce: Tx[];
  ma: Tx[];
  trop: Tx[];
  /** linijka satyry gościa albo null */
  satyra: Tx | null;
}

/** Wszystkie warianty zdań dla tego gościa (3 na klocek), w kolejności, z której `tekstGoscia` wybiera po jednym. */
export function wariantyGoscia(g: Gosc, s: Words, e: WordsEn): WariantyGoscia {
  const c = kontekst(g, s, e);
  const zRodzaju = (t: Trzy): Tx[] => t.map((w) => w(c));
  return {
    kto: zRodzaju(KTO_TEKST[g.kto]),
    chce: zRodzaju(CHCE_TEKST[g.chce]),
    ma: zRodzaju(MA_TEKST[g.ma]),
    trop: zRodzaju(g.kto === 'z_ugryzionym' && g.chce === 'dobic' ? TROP_BLISKI : TROP_TEKST[g.haczyk]),
    satyra: g.satyra !== undefined && Object.hasOwn(SATYRA, g.satyra) ? SATYRA[g.satyra] : null,
  };
}

/** Tytuł karty gościa, np. „Wędrowiec pod bramą” / „A drifter at the gate”. Nie zdradza haczyka. */
export function tytulGoscia(g: Gosc, s: Words, e: WordsEn): Tx {
  return TYTUL[g.kto](kontekst(g, s, e));
}

/** numer wariantu 0–2 dla miejsca `i` (0 kto, 1 chce, 2 ma, 3 trop) z jednego skrótu gościa */
function wariant(h: number, i: number): number {
  return Math.floor(h / 3 ** i) % 3;
}

/**
 * Tekst karty: kto i skąd, czego chce, co ma (poza prośbą o dobicie), zdanie z tropem haczyka, linijka satyry. Wariant
 * każdego zdania wybiera skrót z id gościa, imienia i archetypu mówiącego, więc tekst nie zależy od niczego poza gościem.
 */
export function tekstGoscia(g: Gosc, s: Words, e: WordsEn): Tx {
  const w = wariantyGoscia(g, s, e);
  const h = Number.parseInt(hashString(`${g.id}|${g.osoby[0].name}|${g.kto}`), 16);
  // przy prośbie o dobicie bliskiego nikt nie targuje się ani nie chwali kieszeniami: bez zdania o tym, co ma
  const czesci: Tx[] = [
    w.kto[wariant(h, 0)],
    w.chce[wariant(h, 1)],
    ...(g.chce === 'dobic' ? [] : [w.ma[wariant(h, 2)]]),
    w.trop[wariant(h, 3)],
    ...(w.satyra ? [w.satyra] : []),
  ];
  return { pl: czesci.map((t) => t.pl).join(' '), en: czesci.map((t) => t.en).join(' ') };
}
