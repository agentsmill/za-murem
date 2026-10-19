/* Warstwa tekstu gościa z klocków (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 3, „Klocki”):
   tabele zdań w obu językach i funkcje, które z gotowego `Gosc` składają tytuł i tekst karty. Logika składania gościa
   (wagi, tabela wykluczeń, osoby, skąd) jest w goscie.ts, który re-eksportuje stąd to, co wchodzi do jego interfejsu
   (`tekstGoscia`, `tytulGoscia`, `wariantyGoscia`, `SATYRA`), więc import z goscie.ts z briefu działa bez zmian.
   Zależność idzie w jedną stronę: goscie.ts importuje stąd tabele (`BRON`, `AMUNICJA`, `KIERUNEK`, `KATEGORIA_SKAD`,
   `SATYRA_KLUCZE`), a ten plik z goscie.ts bierze tylko typy.

   Kontrakt.
   - Każdy klocek (kto, czego chce, co ma, trop haczyka) ma 3 warianty zdania po polsku i po angielsku, plus 8 linijek
     satyry. Wariant wybiera skrót z id gościa, imienia i archetypu mówiącego (`tekstGoscia`), więc tekst zależy tylko od
     gościa, nie od losowania ani od kolejności wywołań; `wariantyGoscia` wystawia wszystkie warianty (testy sprawdzają
     angielski w każdym, nie tylko w wybranym).
   - Słowa miejsca przez `Words`/`WordsEn` (brama albo furtka, zarząd albo komitet, spółdzielnia albo ulica), angielski
     według docs/SLOWNICZEK-EN.md. Bez pięter, numerów mieszkań i pauz. Imię w tekście to imię pionka.
   - Zdania „co ma” nie twierdzą, że gość nie ma torby ani że ma puste kieszenie (kto-zdania pokazują plecak, worek, torbę,
     wózek), a satyra nie sięga do kieszeni; pilnuje tego test, który krzyżuje wszystkie archetypy z „nic” i satyrą.
   - Samotne dziecko nie obiecuje dyżuru przy kozie i nie radzi podwoić warty; prośba o dobicie nie cytuje „sam prosił”
     przy dziecku. Ocaleni i ludzie z ugryzionym bliskim mówią jak w The Walking Dead, bez satyry (decyzja w goscie.ts). */

import { zawodEn } from '../content/data.en.ts';
import { type Person, g as plec } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { hashString } from '../core/rng.ts';
import { zPrzedimkiem } from '../mieszkancy/szablony.en.ts';
import type { ChceId, Gosc, HaczykId, KtoId, MaId, Strona } from './goscie.ts';
import type { Words, WordsEn } from './miejsce.ts';

// ---------------------------------------------------------------- skąd

export const KIERUNEK: Record<Strona, Tx> = {
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

/** Opis miejsca „skąd”: kategoria i własna nazwa w cudzysłowie („od strony apteki „Pod Różą””, „from the direction of the
    pharmacy “Pod Różą””); bez nazwy sama kategoria. Nazwa przychodzi już bez słowa kategorii (`nazwaWlasna` w goscie.ts). */
export function frazaSkad(kat: string, nazwa: string): Tx {
  const rodzaj = KATEGORIA_SKAD[kat];
  return nazwa
    ? tx(`od strony ${rodzaj.pl} „${nazwa}”`, `from the direction of ${rodzaj.en} “${nazwa}”`)
    : tx(`od strony ${rodzaj.pl}`, `from the direction of ${rodzaj.en}`);
}

// ---------------------------------------------------------------- rzecz

/** broń, którą gość może nieść (id z src/sim/bron.ts; zarząd nie importuje symulacji, więc nazwy są tu) */
export const BRON: Record<
  string,
  { mian: string; bier: string; en: string; amunicja?: 'naboje' | 'loftki' | 'belty' }
> = {
  noz: { mian: 'nóż', bier: 'nóż', en: 'a knife' },
  siekiera: { mian: 'siekiera', bier: 'siekierę', en: 'an axe' },
  lom: { mian: 'łom', bier: 'łom', en: 'a crowbar' },
  kij: { mian: 'kij z gwoździami', bier: 'kij z gwoździami', en: 'a nail bat' },
  dzida: { mian: 'dzida', bier: 'dzidę', en: 'a spear' },
  kusza: { mian: 'kusza', bier: 'kuszę', en: 'a crossbow', amunicja: 'belty' },
  rewolwer: { mian: 'rewolwer', bier: 'rewolwer', en: 'a revolver', amunicja: 'naboje' },
  strzelba: { mian: 'strzelba', bier: 'strzelbę', en: 'a shotgun', amunicja: 'loftki' },
};
export const AMUNICJA: Record<'naboje' | 'loftki' | 'belty', { pl: string; en: string; ile: [number, number] }> = {
  naboje: { pl: 'naboje', en: 'rounds', ile: [4, 10] },
  loftki: { pl: 'loftki', en: 'buckshot', ile: [3, 8] },
  belty: { pl: 'bełty', en: 'bolts', ile: [5, 12] },
};

// ---------------------------------------------------------------- satyra

/** Linijki o dawnych czasach z 2051 roku: abonament, paczkomat, hulajnoga na minuty, token, opaska do snu i kilka
    innych. Bez pauz i bez prawdziwych nazw firm. Gość dostaje klucz (`Gosc.satyra`). */
export const SATYRA: Record<string, Tx> = {
  abonament: tx(
    'Przy pasku wisi plakietka „Premium”. Abonament wygasł lata temu, ale nikt nie anulował dumy.',
    'A “Premium” badge hangs from a belt. The subscription ran out years ago, but nobody cancelled the pride.',
  ),
  paczkomat: tx(
    'Do kurtki przypięta jest karteczka z kodem odbioru z paczkomatu. Przesyłka czeka tam od 2036 roku i pewnie ma się dobrze.',
    'A note with a parcel locker pickup code is pinned to a jacket. The parcel has been waiting there since 2036 and is probably doing fine.',
  ),
  hulajnoga: tx(
    'Do plecaka przypięty jest kluczyk od hulajnogi na minuty. Hulajnogi dawno nie ma, ale ostatnia minuta podobno wciąż się nalicza.',
    'A key to a pay-per-minute scooter is clipped to a rucksack. The scooter is long gone, but the last minute is said to be still running.',
  ),
  token: tx(
    'Na sznurku na szyi wisi portfel na tokeny. Przed Wielkim Wylogowaniem kurs był wyższy niż złota, dziś nadaje się najwyżej na podpałkę.',
    'A token wallet hangs on a string round the neck. Before the Great Logout it traded above gold. Now it is good for kindling at best.',
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
export const SATYRA_KLUCZE = Object.keys(SATYRA);

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
  const en = zawodEn(p.prof.toLowerCase());
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
  /** mówiący jest dzieckiem (poniżej 16 lat): nie obiecuje dyżuru przy kozie i nie radzi podwajać warty */
  dziecko: boolean;
  /** ugryziony bliski jest dzieckiem: nie „prosił” o nic */
  bDziecko: boolean;
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
    dziecko: p.age < 16,
    bDziecko: (g.osoby[g.ugryziony ?? 1] ?? p).age < 16,
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
      c.dziecko
        ? tx(
            `${c.V('Pyta', 'Pytają')}, czy znalazłoby się miejsce ${c.s.mieszkamy} na stałe, i ${c.V('obiecuje', 'obiecują')} nosić wodę i nie przeszkadzać.`,
            `${c.They} ${c.v('ask')} whether there is room ${c.e.mieszkamy} for good, and ${c.v('promise')} to carry water and keep out of the way.`,
          )
        : tx(
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
        `Prosi o jedno: ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i nie dożyje rana, więc niech ktoś ${c.b.f ? 'ją' : 'go'} dobije, bo ${c.z('sam', 'sama')} nie potrafi.`,
        `${c.He} asks for one thing: ${c.b.first} is bitten and will not see the morning, so someone has to put ${c.b.f ? 'her' : 'him'} down, because ${c.he} cannot do it ${c.himself}.`,
      ),
    (c) =>
      tx(
        `Mówi, że ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i że trzeba to zrobić szybko: dzida albo łom, jeden cios. ${c.z('Sam', 'Sama')} nie da rady.`,
        `${c.He} says ${c.b.first} is bitten and that it has to be quick: a spear or a crowbar, one blow. ${c.He} cannot do it ${c.himself}.`,
      ),
    (c) =>
      c.bDziecko
        ? tx(
            `${c.z('Ręce mu się trzęsą', 'Ręce jej się trzęsą')}. ${c.b.first} jest ugryzion${c.b.f ? 'a' : 'y'} i ${c.b.f ? 'zasnęła' : 'zasnął'}, a ${c.z('on', 'ona')} pyta, czy ktoś tu zrobi to bez gadania, zanim się obudzi.`,
            `${wielka(c.his)} hands are shaking. ${c.b.first} is bitten and has fallen asleep, and ${c.he} asks whether anyone here will do it without a fuss before ${c.b.f ? 'she' : 'he'} wakes.`,
          )
        : tx(
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
        `Na pytanie, co umie, ${c.p.first} odpowiada krótko: ${c.prof.pl}.`,
        `Asked what ${c.he} can do, ${c.p.first} answers briefly: ${c.prof.en}.`,
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
        `Wśród rzeczy: ${c.rz.mian}; ${c.V('odda', 'oddadzą')} to chętnie za odrobinę życzliwości.`,
        `Among the belongings: ${c.rz.en}, which ${c.they} would gladly part with for a little kindness.`,
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
      c.dziecko
        ? tx(
            `${c.V('Szepcze', 'Szepczą')}, że ${c.V(c.z('widział', 'widziała'), 'widzieli')} kogoś obcego przy siatce i że dobrze by było, żeby tej nocy ktoś nie spał.`,
            `${c.They} ${c.v('whisper')} that ${c.they} saw a stranger by the fence and that it would be wise for someone to stay awake tonight.`,
          )
        : tx(
            `${c.V('Radzi', 'Radzą')}, żeby tej nocy wystawić na wartę dwie osoby zamiast jednej, ale skąd to ${c.V('wie', 'wiedzą')}, nie ${c.V('powie', 'powiedzą')}.`,
            `${c.They} ${c.v('advise')} putting two people on watch tonight instead of one, but will not say how ${c.they} ${c.v('know')}.`,
          ),
  ],
  nic: [
    (c) =>
      tx(
        `${c.V('Nie ma', 'Nie mają')} niczego, czym dałoby się zapłacić albo wymienić.`,
        `${c.They} ${c.v('have')} nothing to pay or swap with.`,
      ),
    () => tx('Zapłacić nie ma czym, wymienić nie ma co.', 'Nothing to pay with, nothing to swap.'),
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
  // przy prośbie o dobicie bliskiego nikt się nie targuje ani nie zapowiada, co ma: bez zdania „co ma”
  const czesci: Tx[] = [
    w.kto[wariant(h, 0)],
    w.chce[wariant(h, 1)],
    ...(g.chce === 'dobic' ? [] : [w.ma[wariant(h, 2)]]),
    w.trop[wariant(h, 3)],
    ...(w.satyra ? [w.satyra] : []),
  ];
  return { pl: czesci.map((t) => t.pl).join(' '), en: czesci.map((t) => t.en).join(' ') };
}
