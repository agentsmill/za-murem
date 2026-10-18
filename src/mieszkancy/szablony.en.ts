/* Angielskie bliźniaki szablonów historii (szablony.ts) i ich wypełnianie: z nich angielski.ts składa te same historie
   co po polsku, z tych samych wybranych szablonów i tych samych danych. Polskie szablony i tabele zostają bez zmian;
   tu jest tylko angielski tekst po identyfikatorze szablonu (`SZABLONY_EN`), rzeczowniki pokrewieństwa, kierunki
   wyjazdów i sloty.

   Sloty po angielsku (bez odmiany: imion po angielsku nie odmieniamy):
   - `{o}`, `{p}` imię osoby głównej i powiązanej, `{o:s}`, `{p:s}` z dopełniaczem saksońskim („Marek’s”);
   - `{k}` kim jest osoba powiązana dla głównej („mother”, `KREWNI_EN`);
   - `{g:he|she}`, `{pg:his|her}` forma po płci osoby głównej i powiązanej (zaimki);
   - `{rodzina}` nazwisko rodziny jako „the Kowalski family” (forma męska nazwiska, `rodzinaEn`);
   - `{rok}`, `{wiek}` liczby bez odmiany („was 12”);
   - `{dokad}`, `{skad}` kierunek wyjazdu i powrotu („to Germany”, „from the suburbs”, `DOKAD_EN`, `SKAD_EN`);
   - `{miejsce}` prawdziwa nazwa z kroniki, bez zmian, w nawiasie po angielskim rzeczowniku kategorii („the pharmacy
     ({miejsce})”) albo po dwukropku;
   - `{zawod}`, `{fach}` dawny zawód i fach po angielsku (fachy.en.ts), `{a:zawod}`, `{a:fach}` z przedimkiem
     („an ESG consultant”, `zPrzedimkiem`).
   Bliźniak używa tylko danych, które ma też polski szablon (test w mieszkancy-en.test.ts), więc gdy polski szablon
   pasuje, angielski ma czym się wypełnić. Polski szablon, który zaczyna się od osoby głównej jako podmiotu (`{o:mian} `),
   ma bliźniaka od `{o} `: gdy po polsku imię odpada, bo poprzednie zdanie zaczynało się od tej osoby, po angielsku
   imię zastępuje zaimek („She came back from Wrocław in 2031…”).

   Zasady tekstu jak po polsku: jedno zdanie na szablon, z kropką, bez pauz i półpauz jako znaków przestankowych, bez
   numerów mieszkań i pięter, bez zwracania się do gracza (bez „you”). Brytyjski angielski i słowniczek
   (docs/SLOWNICZEK-EN.md: flat, block, stairwell, estate, allotment, co-op, the board). Ton: sucha satyra na
   dzisiejszą technologię i ekologię oglądaną z 2051, konkret z codzienności, bez patosu i bez tłumaczenia żartów.
   Imiona i nazwy miejsc i miast zostają polskie, z polskimi znakami („to Kraków”); kraje po angielsku. Bez pierwszej
   osoby („I”), także dlatego, że test polskich słów bierze „i” za polskie. */

import type { Krewny } from './szablony.ts';

// ---------------------------------------------------------------- słowa

/** Rzeczowniki pokrewieństwa (kim jest krewny dla osoby głównej); `rodzice` w liczbie mnogiej. */
export const KREWNI_EN: Readonly<Record<Krewny, string>> = {
  matka: 'mother',
  ojciec: 'father',
  rodzice: 'parents',
  babcia: 'grandmother',
  dziadek: 'grandfather',
  syn: 'son',
  corka: 'daughter',
  wnuk: 'grandson',
  wnuczka: 'granddaughter',
  brat: 'brother',
  siostra: 'sister',
  maz: 'husband',
  zona: 'wife',
};

/** Kierunek wyjazdu z silnika (polski napis, klucze jak `SKAD` w szablony.ts) → [dokąd, skąd] po angielsku. Miasta
    zostają polskie, z polskimi znakami (słowniczek). */
const KIERUNKI: Readonly<Record<string, readonly [string, string]>> = {
  'do Warszawy': ['to Warszawa', 'from Warszawa'],
  'do Krakowa': ['to Kraków', 'from Kraków'],
  'do Wrocławia': ['to Wrocław', 'from Wrocław'],
  'do Łodzi': ['to Łódź', 'from Łódź'],
  'do Poznania': ['to Poznań', 'from Poznań'],
  'do Gdańska': ['to Gdańsk', 'from Gdańsk'],
  'do Wielkiej Brytanii': ['to Britain', 'from Britain'],
  'do Niemiec': ['to Germany', 'from Germany'],
  'do Holandii': ['to the Netherlands', 'from the Netherlands'],
  'do Norwegii': ['to Norway', 'from Norway'],
  'do Irlandii': ['to Ireland', 'from Ireland'],
  'za granicę': ['abroad', 'from abroad'],
  'na inne osiedle': ['to another estate', 'from another estate'],
  'na przedmieścia': ['to the suburbs', 'from the suburbs'],
  'do innego miasta': ['to another city', 'from another city'],
  'do pobliskiego miasta': ['to a nearby town', 'from a nearby town'],
  'do mniejszego miasta': ['to a smaller town', 'from a smaller town'],
  'do sąsiedniej wsi': ['to the next village', 'from the next village'],
  'na wieś pod miastem': ['to a village outside the city', 'from a village outside the city'],
  'na wieś do rodziny': ['to family in the country', 'from family in the country'],
  'do rodziny na wsi': ['to family in the country', 'from family in the country'],
  'w rodzinne strony': ['to the old family home', 'from the old family home'],
  'na działkę za miastem': ['to an allotment outside the city', 'from an allotment outside the city'],
  'do krewnych': ['to relatives', 'from relatives'],
};
export const DOKAD_EN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KIERUNKI).map(([pl, [dokad]]) => [pl, dokad]),
);
export const SKAD_EN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(KIERUNKI).map(([pl, [, skad]]) => [pl, skad]),
);

/** Nazwisko rodziny po angielsku z formy męskiej: „the Kowalski family” (także dla Kowalskiej z córką). Nazwisk
    w liczbie mnogiej po angielsku nie tworzymy: „the Kowalski family” pasuje do każdego polskiego nazwiska. */
export const rodzinaEn = (meskie: string): string => `the ${meskie} family`;

/** Rzeczownik z przedimkiem nieokreślonym: „an ESG consultant”, „an NFT creator”, „a herbalist”, „an e-scooter
    courier”. Skrót wielkimi literami czyta się po literach (F, H, L, M, N, R, S, X zaczynają się od samogłoski). */
export function zPrzedimkiem(nazwa: string): string {
  const skrot = /^[A-Z]{2,}(?![a-z])/.test(nazwa);
  const an = skrot
    ? 'AEFHILMNORSX'.includes(nazwa[0])
    : /^[aeio]/i.test(nazwa) || (/^u/i.test(nazwa) && !/^u(ni|s[eu]|ti|r[aei])/i.test(nazwa));
  return `${an ? 'an' : 'a'} ${nazwa}`;
}

/** wielka litera na początku zdania */
export const wielkaEn = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- sloty

/** Osoba w angielskim zdaniu: imię bez odmiany i płeć (do zaimków). */
export interface OsobaEn {
  imie: string;
  f: boolean;
}
/** Wartości slotów jednego angielskiego zdania. */
export interface KontekstEn {
  glowna: OsobaEn;
  powiazana?: OsobaEn;
  /** kim jest powiązana dla głównej, po angielsku */
  krewny?: string;
  /** „the Kowalski family” */
  rodzina?: string;
  rok?: number;
  wiek?: number;
  dokad?: string;
  skad?: string;
  miejsce?: string;
  zawod?: string;
  fach?: string;
}

const SLOT = /\{([^{}]*)\}/g;
const SLOT_PLCI = /^(g|pg):([^|]*)\|([^|]*)$/;
/** zapis slotu → klucz danych, których potrzebuje */
const PROSTE: Readonly<Record<string, string>> = {
  o: 'o',
  'o:s': 'o',
  p: 'p',
  'p:s': 'p',
  k: 'k',
  rodzina: 'rodzina',
  rok: 'rok',
  wiek: 'wiek',
  dokad: 'dokad',
  skad: 'skad',
  miejsce: 'miejsce',
  zawod: 'zawod',
  'a:zawod': 'zawod',
  fach: 'fach',
  'a:fach': 'fach',
};

function kluczEn(s: string): string {
  const pl = SLOT_PLCI.exec(s);
  if (pl) return pl[1];
  if (Object.hasOwn(PROSTE, s)) return PROSTE[s];
  throw new Error(`nieznany slot {${s}}`);
}

/** Klucze danych slotów angielskiego szablonu w kolejności (`o`, `g`, `rok`…). Nieznany slot albo niedomknięty nawias
    to wyjątek. */
export function slotyEn(tekst: string): string[] {
  const klucze = [...tekst.matchAll(SLOT)].map((m) => kluczEn(m[1]));
  if (/[{}]/.test(tekst.replace(SLOT, ''))) throw new Error(`niedomknięty slot w szablonie: ${tekst}`);
  return klucze;
}

function brak(s: string): never {
  throw new Error(`brak wartości dla slotu {${s}}`);
}

/** dopełniacz saksoński imienia: „Marek’s” */
const dzierzawczy = (imie: string): string => `${imie}’s`;

function wartoscEn(s: string, k: KontekstEn): string {
  const pl = SLOT_PLCI.exec(s);
  if (pl) {
    const kto = pl[1] === 'g' ? k.glowna : k.powiazana;
    return kto ? (kto.f ? pl[3] : pl[2]) : brak(s);
  }
  switch (s) {
    case 'o':
      return k.glowna.imie;
    case 'o:s':
      return dzierzawczy(k.glowna.imie);
    case 'p':
      return k.powiazana ? k.powiazana.imie : brak(s);
    case 'p:s':
      return k.powiazana ? dzierzawczy(k.powiazana.imie) : brak(s);
    case 'rok':
      return k.rok === undefined ? brak(s) : String(k.rok);
    case 'wiek':
      return k.wiek === undefined ? brak(s) : String(k.wiek);
    case 'a:zawod':
      return k.zawod ? zPrzedimkiem(k.zawod) : brak(s);
    case 'a:fach':
      return k.fach ? zPrzedimkiem(k.fach) : brak(s);
    case 'k':
      return k.krewny ? k.krewny : brak(s);
    case 'rodzina':
    case 'dokad':
    case 'skad':
    case 'miejsce':
    case 'zawod':
    case 'fach': {
      const v = k[s];
      return v ? v : brak(s);
    }
    default:
      return kluczEn(s);
  }
}

/** Wypełnia angielski szablon. Nieznany slot, slot bez wartości i niedomknięty nawias to wyjątek. Wielkiej litery na
    początku zdania nie dodaje (`wielkaEn`). */
export function wypelnijEn(szablon: string, kontekst: KontekstEn): string {
  slotyEn(szablon);
  return szablon.replace(SLOT, (_, s: string) => wartoscEn(s, kontekst));
}

// ---------------------------------------------------------------- szablony

/** Angielski bliźniak każdego szablonu z szablony.ts, po `Szablon.id`, w kolejności polskiego pliku. */
export const SZABLONY_EN: Readonly<Record<string, string>> = {
  // przydział
  'przydzial-po-dziadkach': '{o} lives in the flat {g:his|her} {k} was allocated in {rok}.',
  'przydzial-meble':
    '{o} lives where {g:his|her} {k} carried the first furniture into a freshly allocated flat in {rok}.',
  'przydzial-tapety': '{o:s} {k} was allocated the flat in {rok}, and nobody has changed the wallpaper since.',
  'przydzial-teczka':
    '{o} was allocated this flat in {rok} and keeps the paperwork in a folder, in case the co-op ever asks.',
  'przydzial-zamek': '{o} waited years for an allocation, got the keys in {rok} and changed the lock the same day.',
  'przydzial-malzonek': '{o} lives in the flat {g:his|her} {k}, {p}, was allocated in {rok}.',

  // wprowadzka
  'wprowadzka-aplikacja': '{rodzina} moved in back in {rok}, in the old days, and rented the flat through an app.',
  'wprowadzka-przelew': '{o} moved here in {rok}, when the rent still went out by bank transfer.',
  'wprowadzka-awarie': '{o} moved here in {rok}, when the cable faults were still being blamed on scrap thieves.',
  'wprowadzka-dyzury': 'In {rok} the co-op gave {o} an empty flat in return for stove watch shifts.',
  'wprowadzka-meble':
    '{rodzina} took over an empty flat in {rok} and got through the first winter thanks to the previous tenants’ furniture.',
  'wprowadzka-walizka': '{o} turned up on the estate in {rok} with one suitcase and stayed for good.',
  'wprowadzka-kropki':
    '{o} moved here in {rok}, when everyone already knew what was eating the cables and nobody quite believed it.',
  'wprowadzka-kartony':
    '{rodzina} arrived in {rok} with a stack of online shopping boxes and a fridge on subscription.',
  'wprowadzka-brama': '{o} took a flat that came free in {rok} and was on the gate rota before unpacking.',
  'wprowadzka-z-rodzicem': '{o} moved here with {g:his|her} {k} in {rok}.',

  // urodzenie
  'urodzenie-chmura':
    '{o} was born in {rok}, back in the old days, and has the photos to prove it in a cloud that no longer exists.',
  'urodzenie-rok-zero': '{o} was born in {rok}, year zero, although nobody called it that at the time.',
  'urodzenie-zlodzieje':
    '{o} was born in {rok}, when cables were failing everywhere and scrap thieves were getting the blame.',
  'urodzenie-odkrycie': '{o} was born in {rok}, the year it came out what had been eating the cables.',
  'urodzenie-malo-dzieci':
    '{o} was born in {rok}, when hardly any babies were born on the estate, so every neighbour still knows {g:him|her}.',
  'urodzenie-swieca':
    '{o} was born at home in {rok}, by candlelight, because there was no way left to get to the hospital.',
  'urodzenie-telefon': '{o} was born in {rok} and knows working phones only from {g:his|her} {k}’s stories.',
  'urodzenie-piec':
    '{o} was born in the winter of {rok} and spent the first year asleep in the kitchen, because that was where the stove stood.',

  // zgon
  'zgon-szpital': '{o:s} {k} died in {rok}, before the fall, in a hospital that still had power.',
  'zgon-zimno': '{o:s} {k} died in the winter of {rok}, when the flats were as cold as the stairwell.',
  'zgon-kurtka':
    '{o:s} {k} died in {rok}, and {pg:his|her} jacket still hangs by the door, because it is the warmest one they have.',
  'zgon-pierwsze-zimy': '{o} lost {g:his|her} {k} in {rok}, in one of the first winters without heating.',
  'zgon-leki': '{o:s} {k} died in {rok}, when the clinic ran out of imported meds.',
  'zgon-zakwas':
    '{o:s} {k} died in {rok} and left {g:him|her} a notebook of recipes and three jars of sourdough starter.',
  'zgon-mianownik': '{o:s} {k} died in {rok} and left a wind-up radio behind.',
  'zgon-mianownik-dawniej': '{o:s} {k} died in {rok}, while hospitals still had power.',
  'zgon-mianownik-imiennie': '{o:s} {k} {p} died in {rok}.',
  'zgon-imiennie-szpital': '{o:s} {k}, {p}, died in {rok}, before the fall, in a hospital that still had power.',
  'zgon-imiennie-kurtka':
    '{o:s} {k}, {p}, died in {rok}, and {pg:his|her} jacket still hangs by the door, because it is the warmest one they have.',
  'zgon-imiennie': '{o:s} {k}, {p}, died in {rok} and left a toolbox that nobody can open.',

  // wyprowadzka
  'wyprowadzka-odwiedziny': '{o:s} {k} moved {dokad} in {rok} and visits whenever the roads allow.',
  'wyprowadzka-pociagi': '{o:s} {k} moved {dokad} in {rok}, back when the trains still ran.',
  'wyprowadzka-po-jedzenie': 'In {rok} {o:s} {k} went {dokad} for food and never came back.',
  'wyprowadzka-generator': '{o:s} {k} moved {dokad} in {rok}, because word was they had a generator there.',
  'wyprowadzka-rodzice': '{o:s} parents moved {dokad} in {rok}, and {g:he|she} stayed put.',
  'wyprowadzka-rodzice-jedzenie':
    'In {rok} {o:s} parents went {dokad} for food, and {g:he|she} stayed behind to mind the place.',
  'wyprowadzka-rodzice-znac': '{o:s} parents moved {dokad} in {rok} and rarely send word.',
  'wyprowadzka-mianownik': '{o:s} {k} moved {dokad} in {rok}.',
  'wyprowadzka-mianownik-imiennie': '{o:s} {k} {p} moved {dokad} in {rok}.',
  'wyprowadzka-mianownik-rodzice': '{o:s} parents moved {dokad} in {rok}.',
  'wyprowadzka-imiennie-pociagi': '{o:s} {k}, {p}, moved {dokad} in {rok}, back when the trains still ran.',
  'wyprowadzka-imiennie-generator':
    '{o:s} {k}, {p}, moved {dokad} in {rok}, because word was they had a generator there.',
  'wyprowadzka-imiennie-jedzenie': 'In {rok} {o:s} {k}, {p}, went {dokad} for food and never came back.',
  'wyprowadzka-imiennie': '{o:s} {k}, {p}, moved {dokad} in {rok} and drops in whenever anyone is heading that way.',

  // emigracja
  'emigracja-cisza': '{o:s} {k} went {dokad} in {rok} and has not sent a word in years.',
  'emigracja-telefony':
    '{o:s} {k} went {dokad} in {rok}, and the messages kept coming for as long as the phones worked.',
  'emigracja-tam-dzialaly': 'In {rok} {o:s} {k} went {dokad}, because the cables there were said to still work.',
  'emigracja-pocztowka': '{o} keeps a postcard on the shelf from {g:his|her} {k}, who went {dokad} in {rok}.',
  'emigracja-dawno': '{o:s} {k} went {dokad} back in {rok}, long before the fall.',
  'emigracja-rodzice': '{o:s} parents went {dokad} in {rok}, and {g:he|she} refused to go with them.',
  'emigracja-rodzice-sami': '{o:s} parents went {dokad} in {rok} and stayed there for good.',
  'emigracja-mianownik': '{o:s} {k} went {dokad} in {rok} and never came back.',
  'emigracja-mianownik-imiennie': '{o:s} {k} {p} went {dokad} in {rok}.',
  'emigracja-mianownik-rodzice': '{o:s} parents went {dokad} in {rok}.',
  'emigracja-imiennie-telefony':
    '{o:s} {k}, {p}, went {dokad} in {rok}, and the messages kept coming for as long as the phones worked.',
  'emigracja-imiennie-pocztowka':
    '{o} keeps a postcard on the shelf from {g:his|her} {k} {p}, who went {dokad} in {rok}.',
  'emigracja-imiennie': '{o:s} {k}, {p}, went {dokad} in {rok} and has not been heard from in years.',

  // powrót
  'powrot-tam-tez': '{o} came back {skad} in {rok}, when it turned out something was eating the cables there too.',
  'powrot-do-krewnego': 'In {rok} {o} came back {skad} to {g:his|her} {k}.',
  'powrot-razem': '{o} came back {skad} in {rok} together with {g:his|her} {k}.',
  'powrot-puste': '{o} came back {skad} in {rok} and took over a flat the neighbours had left empty.',
  'powrot-pieszo': '{o} came back {skad} in {rok} on foot, with a rucksack and a jar of seeds.',
  'powrot-czynsz':
    '{o} came back {skad} in {rok}, before the fall, because the rent there was eating the whole salary.',
  'powrot-fala': '{o} came back {skad} in {rok}, when everyone was leaving the big cities for their family homes.',
  'powrot-osiedle': '{o} came back to the estate in {rok} and has not budged since.',

  // powrót do opieki
  'opieka-chodzenie': '{o} came back {skad} in {rok}, when {g:his|her} {k} could no longer walk.',
  'opieka-na-tydzien': 'In {rok} {o} came {skad} to stay with {g:his|her} {k} for a week and never left.',
  'opieka-jedyne': '{o} was the only one of the siblings to come back {skad}, moving in with {g:his|her} {k} in {rok}.',
  'opieka-historie':
    'Since {rok} {o} has been looking after {g:his|her} {k} and by now knows all {pg:his|her} stories from the old days by heart.',
  'opieka-po-smierci':
    '{o} came back {skad} in {rok} to look after {g:his|her} {k} and stayed on after {pg:he|she} died.',
  'opieka-tam-tez':
    'In {rok} {o} came back {skad} to {g:his|her} {k}, because something was eating the cables there too, and here at least someone was waiting for {g:him|her}.',
  'opieka-sam': '{o} came back in {rok}, when {g:his|her} {k} was left on {pg:his|her} own.',
  'opieka-dziecko': 'In {rok} {o:s} {k} came back {skad} to look after {g:him|her}.',
  'opieka-mianownik': '{o:s} {k} came back {skad} in {rok} to help {g:him|her} out.',

  // związek
  'zwiazek-aplikacja': '{o} met {p} in {rok} through a dating app that went bust a year later.',
  'zwiazek-woda': '{o} met {p} in the queue for water in {rok}.',
  'zwiazek-zebranie': 'In {rok} {o} and {p} got together at a co-op meeting, over a single candle.',
  'zwiazek-kubek': '{o} moved in with {p} in {rok}, bringing one bag and {g:his|her} own mug.',
  'zwiazek-mieszka': 'Since {rok} {o} has lived with {p}.',
  'zwiazek-generator':
    '{o} got together with {p} in {rok}, when everyone on the estate was looking for someone with a generator.',
  'zwiazek-mianownik': '{o} and {p} have been together since {rok}.',

  // owdowienie
  'owdowienie-sama': '{o} was widowed in {rok} and has lived alone ever since.',
  'owdowienie-obraczka': '{o} was widowed in {rok} and still wears the wedding ring on a string.',
  'owdowienie-kartka': '{o:s} {k}, {p}, died in {rok}, and {pg:his|her} handwritten rota still hangs on the door.',
  'owdowienie-zanim': '{o} was widowed in {rok}, before anyone knew what was wrecking the cables.',
  'owdowienie-zima': '{p}, {o:s} {k}, did not survive the winter of {rok}, when the clinic ran out of meds.',
  'owdowienie-lozko': 'After {o:s} {k} died in {rok}, {g:he|she} moved the bed into the kitchen, where it is warmest.',
  'owdowienie-gwar': '{o} was widowed in {rok}, but it is never quiet at home.',

  // dawne czasy
  'dawne-hulajnoga':
    'In the old days {o} rode to work on a pay-by-the-minute scooter and paid for the minutes at red lights as well.',
  'dawne-paczkomat':
    '{o} still remembers the code to the parcel locker where {g:his|her} parcel got stuck in year zero.',
  'dawne-lodowka':
    'In the old days {o} had a fridge on subscription and still does not know whether the last payment went through.',
  'dawne-dostawa':
    'From the old days {o} remembers food arriving at the door in half an hour, with the driver rated in stars.',
  'dawne-zegarek': '{o} once had a watch that counted {g:his|her} steps and reminded {g:him|her} to breathe.',
  'dawne-segregacja':
    'In the old days {o} sorted rubbish into five colours, and now there is hardly any rubbish, because everything comes in handy for something.',
  'dawne-ladowanie': '{o} remembers when a phone needed charging twice a day and nobody saw a problem with that.',
  'dawne-tablet':
    '{o} remembers childhood cartoons on a tablet that switched itself off when the subscription ran out.',
  'dawne-aplikacje': 'In the old days {o} had eight energy-saving apps and not a single candle.',
  'dawne-kawa':
    'In the old days {o} ordered coffee through an app to skip the queue, and now queues for water and treats it as a social occasion.',
  'dawne-ulubione': '{o} once had just one place nearby starred as a favourite on {g:his|her} phone map: {miejsce}.',
  'dawne-droga': '{o} still gives directions around the estate from one landmark of the old days: {miejsce}.',
  'dawne-karta': '{o} keeps a loyalty card from the old days in a drawer, with points nobody will ever redeem.',
  'dawne-kredyt-weglowy': 'In the old days {o} bought carbon credits for a forest that nobody has ever seen.',
  'dawne-ekologia':
    '{o} remembers that in year zero every company was green, and the greenest of all was the one that made the bacterium.',
  'dawne-pogoda': '{o} remembers when the weather forecast came from a phone rather than a knee.',
  'dawne-zawod-satyra':
    'In the old days {o} worked as {a:zawod}, and nobody on the estate has ever managed to explain what that involved.',
  'dawne-zawod-nadgodziny':
    'Before the fall {o} worked as {a:zawod} and had an app on {g:his|her} phone that counted the overtime.',
  'dawne-emerytura': 'In year zero {o} was already retired, the only one in the family who never had to retrain.',
  'dawne-z-opowiesci':
    '{o} knows the old days only from stories and refuses to believe anyone paid for a scooter ride by the minute.',
  'dawne-za-maly':
    '{o} was too young to remember the old days, but knows them from stories about food that turned up on its own.',

  // kronika osiedla
  'kronika-awarie':
    'In {rok}, when the odd cable faults started on the estate, {o} called an electrician and waited three weeks for him to turn up.',
  'kronika-kropki':
    'In {rok}, when it came out what was eating the cables, {o} threw every extension lead out of the door, as if that would help.',
  'kronika-latarnie':
    'When the street lights went out in {rok}, {o} was {wiek} and was scared to go out after dark for the first week only.',
  'kronika-swieczka':
    '{o} remembers {rok}, when the power vanished from the street and the neighbours first knocked on each other’s doors to borrow a candle.',
  'kronika-nalot':
    'Since {rok}, when a greenish film appeared on the cables in the basement, {o} has washed {g:his|her} shoes after every trip downstairs.',
  'kronika-region':
    'When the grid for the whole region went down in {rok}, {o} was {wiek} and thought it would be back within a week.',
  'kronika-zima': '{o} slept through the first winter without heating, in {rok}, in a coat and a woolly hat.',
  'kronika-windy': 'Since the lifts stopped in {rok}, {o} has known the number of steps in the stairwell by heart.',
  'kronika-paczkomat':
    '{o} was there when the last parcel locker was crowbarred open in {rok} and still insists the extension lead inside was {g:his|hers}.',
  'kronika-lodowki':
    'In {rok}, when the subscription fridges stopped cooling, {o} carried the meat down to the basement and has not trusted a subscription since.',
  'kronika-hulajnogi':
    '{o} remembers {rok}, when the pay-by-the-minute scooters vanished from the pavements and people could suddenly walk on them.',
  'kronika-dolar':
    'In {rok}, when the dollar moved to a subscription plan, {o} paid the service charge in potatoes for the first time.',
  'kronika-chmura':
    'When the cloud went down in {rok}, {o} lost every photo from the old days and one password {g:he|she} had forgotten anyway.',
  'kronika-autobus': '{o} saw the last bus go by in {rok} and waved at it from the stop.',
  'kronika-zebranie': 'In {rok} {o} went to the first candlelit co-op meeting and brought {g:his|her} own candle.',
  'kronika-piece':
    'Since the houses went over to stoves in {rok}, {o} has known every fence in the area, and has burned half of them.',
  'kronika-plyta': '{o} used to laugh at the concrete panel blocks, and since {rok} has spoken of them with respect.',
  'kronika-inteligentny-dom':
    'In {rok}, when the smart home went dark, {o} spent the night in the stairwell, because the front door opened by phone.',
  'kronika-domofony':
    'Ever since smart intercoms went into the stairwells in {rok}, {o} has carried an ordinary key, just in case.',
  'kronika-gmina': '{o} keeps the council’s last letter, from {rok}, in a drawer, because it is on good paper.',
  'kronika-zarzad':
    'Since the co-op board took over the water, the power and the gate in {rok}, {o} has had a weekly shift and keeps to it the way {g:he|she} once kept work deadlines.',
  'kronika-piony': '{o} is still waiting for the new riser pipes the co-op promised in {rok}.',
  'kronika-prezydent':
    '{o} heard about the President of the United States starting a tenth term a few years after {rok}, from someone on the next estate.',
  'kronika-korek':
    'In {rok} {o} sat in the street’s last traffic jam, with everyone driving off for the last of the petrol.',
  'kronika-piwnice':
    'Since {rok} {o} has kept more things in the basement than upstairs, because the basement is now the most important room on the estate.',
  'kronika-rower':
    'Since the cars vanished from the streets in {rok}, {o} has cycled down the middle of the road and nobody beeps at {g:him|her}.',

  // prawdziwe miejsca z kroniki
  'miejsce-szkola-informatyka': 'In {rok} {o} went to the school ({miejsce}) and still had IT lessons there.',
  'miejsce-szkola-polano': 'In {rok} {o} went to the school ({miejsce}) and took a log for the stove there every day.',
  'miejsce-przedszkole':
    'In {rok} {o} went to the nursery school ({miejsce}) and still knows the song about saving electricity.',
  'miejsce-zlobek': 'In {rok} {o} went to the day nursery ({miejsce}), though {g:he|she} has no memory of it.',
  'miejsce-przychodnia-karta':
    'At the clinic ({miejsce}) {o} has a patient card from {rok}, filled in by hand because the system was already down.',
  'miejsce-przychodnia-bandaz':
    'In {rok} {o} went to the clinic ({miejsce}) with {g:his|her} own bandage, because they had run out.',
  'miejsce-apteka': 'At the pharmacy ({miejsce}) {o} bought the last imported cough syrup in {rok}.',
  'miejsce-spozywczy': 'At the grocer’s ({miejsce}) {o} still has a debt in the notebook, going back to {rok}.',
  'miejsce-lokal': '{o} was a regular at the shop ({miejsce}) right up until {rok}.',
  'miejsce-elektronika': 'At the electronics shop ({miejsce}) {o} bought the last charger in a sealed case in {rok}.',
  'miejsce-ubrania': '{o} still wears a jacket from the clothes shop ({miejsce}), bought back in {rok}.',
  'miejsce-narzedzia': 'At the hardware shop ({miejsce}) {o} traded a bicycle for a crate of nails in {rok}.',
  'miejsce-ogrodniczy':
    'In {rok} {o} bought seeds at the garden shop ({miejsce}) that half the allotment now grows from.',
  'miejsce-biblioteka': '{o} has a book at home from the library ({miejsce}), borrowed in {rok} and never returned.',
  'miejsce-bank': '{o} had a loan at the bank ({miejsce}) that everyone forgot about in {rok}, the bank included.',
  'miejsce-stacja': 'At the petrol station ({miejsce}) {o} filled up for the last time in {rok} and kept the receipt.',
  'miejsce-kosciol': 'In {rok} {o} sat through a co-op meeting in the church ({miejsce}), called straight after Mass.',
  'miejsce-placowka': '{o} sorted out {g:his|her} last bit of business at the office ({miejsce}) online in {rok}.',

  // stan w 2051
  'stan-sam': '{o} is {wiek} and lives alone, but only locks the door at night.',
  'stan-windy': '{o} is {wiek}, lives alone and remembers when the lifts still ran.',
  'stan-para': '{o} and {p} live here on their own and only ever argue about whose turn it is to feed the stove.',
  'stan-pokolenia': 'Three generations and one stove share {o:s} home.',
  'stan-dzieci': '{o} is {wiek} and spends most of {g:his|her} time making sure the children leave the cables alone.',
  'stan-ciasno': 'It is cramped at {o:s}, but nobody complains in winter, because cramped means warm.',
  'stan-fach': 'Everyone round here knows {o} as the {fach}.',
  'stan-kiedys-dzis': '{o}: once {a:zawod}, now {a:fach}.',
  'stan-kroki': '{o} is {wiek} and recognises everyone in the stairwell by their footsteps.',
  'stan-grzadki': '{o} is {wiek} and keeps watch over the vegetable beds behind the house from dawn till dusk.',
};
