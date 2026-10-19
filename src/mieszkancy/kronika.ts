/* Kronika osiedla i filtr nazw miejsc. Kronika to wspólna, lokalna przeszłość z lat 2026-2051: kilkanaście zdarzeń
   przypiętych do prawdziwych miejsc z mapy (szkoły, przychodnie, sklepy, banki) oraz do samego osiedla, ulic (ogólnie) i
   spółdzielni. Wiele historii mieszkańców (krok 4, historie) odwołuje się do tych samych wpisów, więc osiedle ma jedną,
   spójną przeszłość. Lore z GDD: rok zero 2026 (bakteria z ekologicznego startupu), odkrycie około 2029, w latach
   trzydziestych i czterdziestych rozpad (sieci padają region po regionie, chmura, dolar na abonament, dziesiąta kadencja
   prezydenta USA bez imienia), w 2051 gra. Ton to satyra na dzisiejszą technologię i ekologię; żadnych nazwisk polityków.

   Wejście: `kronika(geo, budynki, imiona, ziarno)`. Ziarno to `losDla('kronika', ziarno)`; wywołujący podaje `rejon`
   budynku siedziby albo pierwszego budynku, więc ten sam adres daje tę samą kronikę. `budynki` dają tylko tło osiedla
   (bloki albo domy, wielka płyta, nowe bloki z "inteligentnym domem"), nic poza tym. Z mapy kronika czyta wyłącznie
   `geo.poi` (nazwy i położenie). Wynik jest deterministyczny i nie zmienia argumentów. Moduł działa w przeglądarce i w
   Node, bez trygonometrii i pierwiastków (odległość porównujemy w kwadratach), losowanie przez los.ts.

   Układ kroniki: łącznie 12-16 wpisów (losowane). Zawsze pięć o kablach, bakterii i prądzie (rok zero 2026-2027,
   odkrycie 2029, awaria prądu na ulicy 2031-2034, zielonkawy nalot w piwnicach 2036-2041, region bez sieci 2042-2046)
   i jeden zamykający w 2051. Reszta to miejsca z mapy (5-8) i zdarzenia ogólne: spółdzielnia, osiedle, ulice, satyra
   (hulajnogi na minuty, paczkomaty, lodówki na abonament, dolar na abonament). Kategorie miejsc (szkoła, przedszkole,
   żłobek, przychodnia, apteka, sklep spożywczy, sklep z elektroniką, z ubraniami, z narzędziami, ogrodniczy, lokal, bank,
   stacja paliw, kościół, biblioteka, placówka) mają po 4 szablony z różnych epok, a do tego jest siedem szablonów
   neutralnych, pasujących do każdej kategorii.
   Gwarancja miejsc: gdy na mapie jest choć jedno POI z niepustą nazwą (z obszaru gry albo, gdy żadnego tam nie ma,
   najbliższe), wpisów z `miejsce` jest co najmniej pięć. Najpierw idą szablony kategorii (po kolei po kategoriach, w
   kolejnych rundach kolejne szablony), a gdy ich zabraknie, szablony neutralne. To samo miejsce może więc wystąpić kilka
   razy, zawsze z innym zdarzeniem i z innego roku: rok szablonu losuje się spośród lat jego okna, w których miejsce nie ma
   jeszcze wpisu (`wolnyRok`; gdyby okno było wyczerpane, bierze się najbliższy wolny rok w [2026, 2051], a w praktyce to się
   nie zdarza: 30 000 przebiegów z jednym POI nie użyło tej drogi). Bez żadnego nazwanego POI wpisów z miejscem nie ma, a
   kronika ma te same 12-16 wpisów. Pierwszeństwo mają miejsca z obszaru gry (|x|, |y| do 192 m wokół `geo.c`); w rodzinie
   kategorii (szkoła, przedszkole i żłobek to jedna), w której nie ma żadnego, bierzemy trzy najbliższe. Różne POI o tej
   samej nazwie (sieć sklepów) to jedno miejsce. Nazwy dłuższe niż 48 znaków wypadają, jeśli jest coś krótszego.

   Odmiana: nazw własnych nie odmieniamy, bo nie mamy skąd wziąć poprawnych form. Miejsce stoi w mianowniku w nawiasie
   po rzeczowniku kategorii w miejscowniku ("W szkole (Szkoła Podstawowa nr 12) odwołano lekcje informatyki"), albo
   rzeczownik jest podmiotem ("Przychodnia (Baltmed) przeszła na dyżury przy świecach"). Nazwa, która jest samym rzeczownikiem
   ("Sklep ogrodniczy"), nie powtarza się w nawiasie.

   Ulice: kronika NIE używa prawdziwych nazw ulic, w ogóle nie czyta `addr:street`. Ulice noszą nazwiska osób (także
   polityków: "Lecha Kaczyńskiego", "Marii Konopnickiej"), a filtr nazw nie rozpoznaje odmienionych nazwisk, więc żadna
   nazwa ulicy nie jest bezpieczna. Wpisy o ulicach mają ogólny podmiot przed dwukropkiem ("Główna ulica osiedla: latarnie
   zgasły…"; kolejno: główna ulica osiedla, ulica przy bloku, droga dojazdowa do osiedla, osiedlowa uliczka) i puste
   `miejsce`: ulica to tło, nie POI.

   Filtr nazw (`nazwaMiejsca`): sklep o nazwie "Sławomir Mielnik" albo "Usługi Remontowe Jan Nowak" to w tekście gry
   osoba, której nie chcemy wymieniać. Zamieniamy takie nazwy na opis kategorii ("sklep spożywczy przy bloku", "zakład
   usługowy na rogu", "apteka"), a nazwy marek i instytucji ("Żabka", "Szkoła Podstawowa nr 12", "Apteka Pod Lwem")
   zostają. Wykrywamy dokładnie trzy wzorce:
   1. słowo równe imieniu z listy (dopasowanie co do słowa, z uwzględnieniem wielkości liter, polskie litery),
      po którym po samych odstępach stoi słowo z wielkiej litery (także inicjał): "Jan Nowak", "Salon Anna K.";
   2. samodzielne "u" albo "U", po którym po odstępach stoi słowo z wielkiej litery: "Kwiaciarnia u Moniki", "U Sylwii".
      Ten wzór nie zależy od listy imion, bo "u Jana" to dopełniacz, którego lista imion (mianowniki) nie zawiera;
   3. tytuł, po którym (po odstępie albo po kropce, ze spacją lub bez) stoi słowo z wielkiej litery: "Apteka Dr Nowak",
      "Apteka Dr.Nowak", "Gabinet lek. Nowak", "Gabinet lek. med. Kowalski", "Apteka mgr farm. Nowak", "Praktyka prof. dr hab.
      n. med. Kowalski". Tytuły bez kropki: dr, mgr, prof, inż; ze skrótem (kropka obowiązkowa, bo bez niej to zwykłe
      słowa, np. "Med Plus", "Farm Plus"): lek, med, dent, stom, wet, hab, doc, farm, n, spec, specj. W ciągu tytułów łapie
      ostatni, po którym stoi nazwisko. Wyjątek dla znanych sieci i marek: "Dr Max", "Dr. Max", "Dr Irena Eris", "Dr.
      Martens", "Dr. Oetker", "Dr. Scholl" zostają (lista `MARKI_Z_TYTULEM`; inne "Dr X" nie), ale tylko gdy po marce nie
      stoi słowo z wielkiej litery: "Dr Max Kowalski" to osoba, więc jest łapane.
   Adres w nazwie (R50) też zamienia nazwę na opis kategorii, bo prawdziwy adres w tekście gry wskazuje dom, a ulice noszą
   nazwiska osób (R45): „Apteka na Obrońców Wybrzeża 2”, „Apteka przy Lecha Kaczyńskiego”, „Sklep ul. Grunwaldzka 12”,
   „KEN 50”. Adres to (a) numer domu (1-4 cyfry, z literą albo „/”) po słowie z co najmniej dwóch liter, które nie jest
   „nr”, „no” ani „numer” („Szkoła Podstawowa nr 12” zostaje; „24h” to godziny, nie numer), albo (b) „na”, „przy”, „ul”,
   „al”, „os” (małymi literami, z kropką albo bez), „ulica”, „ulicy”, „aleja”, „alei”, „osiedle”, „osiedlu”, a także
   „Ul.”, „Al.”, „Os.” z kropką, przed słowem z wielkiej litery. Koszt w tę samą bezpieczną stronę co przy osobach: marki
   „Okno na Świat”, „Stare na Nowo” i numer urzędu pocztowego „FUP Gdańsk 53” też zamieniają się na opis (pinuje to test).
   Nazwa jest też porządkowana do wyświetlenia: jedna spacja między słowami, pauzy otoczone spacjami (" - ", " – ", " — ")
   zamieniają się na ", " (w tekstach dla gracza nie ma pauz), a patron po "im." albo "imienia" odpada ("Szkoła
   Podstawowa Nr 44 im. Adama Mickiewicza" to "Szkoła Podstawowa Nr 44"), bo kronika nie wymienia osób, a patronami bywają
   też politycy. Osoba przed patronem nadal się liczy.
   NIE jest łapane (nie ma jak odróżnić od marek bez słownika nazwisk i odmiany; każdy przypadek jest przypięty testem,
   w "granice filtra" albo w "po imieniu musi stać słowo z wielkiej litery"): samo imię ("Jubiler Monika", "Roland"),
   samo nazwisko ("Mielnik", "Gzella"), inicjał i nazwisko ("PHU J. Nowak"; "E. Leclerc" to marka), imię złożone ("Gabinet
   Anna-Maria Nowak": dopasowanie jest co do słowa, a "Anna-Maria" nie ma w liście), odwrócona kolejność ("Nowak Jan"),
   imię i nazwisko w innym przypadku niż mianownik ("Gabinet Anny Nowak", "Zakład Piotra Nowaka"; wyjątkiem jest forma, która
   sama jest imieniem z listy, jak "Jana"; pełna odmiana dałaby błędne trafienia w nazwach kościołów, np. "Świętego Jana
   Chrzciciela"), patron bez "im." ("Parafia św. Józefa", "Zespół Szkół Adama Mickiewicza"; "Szkoła Podstawowa Jana Pawła II"
   wpada tylko dlatego, że "Jana" jest też żeńskim imieniem na liście), imię spoza listy PESEL (zdrobnienia, obce: "Hair
   Studio Kasia Nowak"), pisownia wielkimi albo małymi literami ("JAN NOWAK", "jan nowak"; sam tytuł wielkimi literami jest
   łapany), imię i słowo rozdzielone przecinkiem, cudzysłowem albo znakiem ("Jan, Nowak i spółka", "Jan & Nowak").
   Odwrotnie, marka zaczynająca się od imienia z listy i słowa z wielkiej litery ("Hugo Boss", "Max Mara") zamieni się na
   opis; to koszt filtra, który woli nie wymienić marki, niż wymienić osobę (pinuje to test "granice filtra").

   `zbiorImion` składa zbiór imion z `lata`, `koszyki`, `powracajace` i `przyjezdni` w tabelach imion. */

import type { Rng } from '../core/rng.ts';
import type { Geo, GeoPoi } from '../world/geo.ts';
import { calkowita, losDla } from './los.ts';
import type { ImieZLiczba, TabeleImion } from './tabele.ts';
import type { Budynek } from './typy.ts';

export interface WpisKroniki {
  rok: number;
  tekst: string;
  /** Przefiltrowana nazwa prawdziwego miejsca z mapy (`nazwaMiejsca`), jeśli wpis jest do niego przypięty. */
  miejsce?: string;
}

const ROK_OD = 2026;
const ROK_DO = 2051;
/** Pół boku kwadratu gry (jak POL_KWADRATU w generuj.ts, bez importu, żeby nie robić cyklu), m. */
const POL_OBSZARU = 192;
const MAX_DLUGOSC_NAZWY = 48;
const MIN_WPISOW = 12;
const MAX_WPISOW = 16;
/** Ile miejsc z mapy najwyżej (reszta to zdarzenia ogólne). */
const MAX_MIEJSC = 8;
/** Wpisów o kablach jest zawsze pięć (tablica `KABLE`), a ogólnych co najmniej dwa: zamykający i jeden do losowania. */
const WPISY_KABLE = 5;
const MIN_OGOLNYCH = 2;
const NAJBLIZSZE_POZA_OBSZAREM = 3;

// ---------------------------------------------------------------- zbiór imion

/** Zbiór imion z tabel imion (nadania z lat, koszyki sprzed 2000 r., powracające i przyjezdni). */
export function zbiorImion(t: TabeleImion): Set<string> {
  const zbior = new Set<string>();
  const dodaj = (lista: readonly ImieZLiczba[]): void => {
    for (const [imie] of lista) zbior.add(imie);
  };
  for (const rok of Object.values(t.lata)) {
    dodaj(rok.M);
    dodaj(rok.K);
  }
  for (const koszyk of Object.values(t.koszyki)) {
    dodaj(koszyk.M);
    dodaj(koszyk.K);
  }
  for (const imie of t.powracajace.M) zbior.add(imie);
  for (const imie of t.powracajace.K) zbior.add(imie);
  dodaj(t.przyjezdni.M);
  dodaj(t.przyjezdni.K);
  return zbior;
}

// ---------------------------------------------------------------- słownik kategorii

type Rodzaj = 'm' | 'z' | 'n';
/** Rzeczownik: mianownik, miejscownik z przyimkiem ("w szkole", "na stacji paliw") i rodzaj (zgoda czasownika). */
interface Forma {
  mian: string;
  w: string;
  r: Rodzaj;
}
/** `rzecz` mówi o miejscu z prawdziwą nazwą (nazwa w nawiasie), `opis` zastępuje nazwę z osobą. */
interface Slownik {
  rzecz: Forma;
  opis: Forma;
}
const forma = (mian: string, w: string, r: Rodzaj): Forma => ({ mian, w, r });
const taki = (f: Forma): Slownik => ({ rzecz: f, opis: f });

const PLACOWKA_OSWIATOWA = forma('placówka oświatowa', 'w placówce oświatowej', 'z');

/** Jeden opis na kategorię POI (te, które daje poiCat w osm.ts i kafelki), plus `inne` na kategorie nieznane. */
const SLOWNIK: Record<string, Slownik> = {
  spozywczy: {
    rzecz: forma('sklep spożywczy', 'w sklepie spożywczym', 'm'),
    opis: forma('sklep spożywczy przy bloku', 'w sklepie spożywczym przy bloku', 'm'),
  },
  apteka: taki(forma('apteka', 'w aptece', 'z')),
  budowlany: taki(forma('sklep z narzędziami i częściami', 'w sklepie z narzędziami i częściami', 'm')),
  elektronika: taki(forma('sklep z elektroniką', 'w sklepie z elektroniką', 'm')),
  ubrania: taki(forma('sklep z ubraniami', 'w sklepie z ubraniami', 'm')),
  ogrodnik: taki(forma('sklep ogrodniczy', 'w sklepie ogrodniczym', 'm')),
  // kategoria `sklep` to też fryzjerzy, kosmetyczki i punkty usługowe, więc rzeczownik jest neutralny
  sklep: {
    rzecz: forma('lokal', 'w lokalu', 'm'),
    opis: forma('zakład usługowy na rogu', 'w zakładzie usługowym na rogu', 'm'),
  },
  przychodnia: {
    rzecz: forma('przychodnia', 'w przychodni', 'z'),
    opis: forma('gabinet lekarski', 'w gabinecie lekarskim', 'm'),
  },
  szkola: { rzecz: forma('szkoła', 'w szkole', 'z'), opis: PLACOWKA_OSWIATOWA },
  // podtypy szkoły rozpoznane po nazwie (kategoria `szkola` obejmuje też przedszkola i żłobki)
  przedszkole: { rzecz: forma('przedszkole', 'w przedszkolu', 'n'), opis: PLACOWKA_OSWIATOWA },
  zlobek: { rzecz: forma('żłobek', 'w żłobku', 'm'), opis: PLACOWKA_OSWIATOWA },
  biblioteka: taki(forma('biblioteka', 'w bibliotece', 'z')),
  bank: {
    rzecz: forma('bank', 'w banku', 'm'),
    opis: forma('oddział banku', 'w oddziale banku', 'm'),
  },
  stacja: taki(forma('stacja paliw', 'na stacji paliw', 'z')),
  kosciol: taki(forma('kościół', 'w kościele', 'm')),
  urzad: {
    rzecz: forma('placówka', 'w placówce', 'z'),
    opis: forma('punkt osiedlowy', 'w punkcie osiedlowym', 'm'),
  },
  inne: {
    rzecz: forma('lokal', 'w lokalu', 'm'),
    opis: forma('lokal na rogu', 'w lokalu na rogu', 'm'),
  },
};

/** Kategoria `szkola` to też przedszkola i żłobki: po nazwie rozpoznajemy podtyp, żeby nie odwoływać "lekcji informatyki"
    w przedszkolu. Nazwa ze słowem szkolnym na początku wyrazu ("Zespół Szkolno-Przedszkolny") zostaje szkołą; "Przedszkole"
    zawiera "szkol", ale w środku wyrazu, więc nie liczy się jako szkoła. */
const WZORZEC_PRZEDSZKOLA = /przedszk|krasnal|kindergarten/i;
const WZORZEC_ZLOBKA = /żłob/i;
const WZORZEC_SZKOLY = /(?:^|[^\p{L}])(?:szkoł|szkół|szkoln|liceum|technikum|gimnaz|podstawow)/iu;

/** Klucz słownika i szablonów dla POI. */
function kluczKategorii(c: string, nazwa: string): string {
  if (c === 'szkola' && !WZORZEC_SZKOLY.test(nazwa)) {
    if (WZORZEC_ZLOBKA.test(nazwa)) return 'zlobek';
    if (WZORZEC_PRZEDSZKOLA.test(nazwa)) return 'przedszkole';
  }
  return Object.hasOwn(SLOWNIK, c) ? c : 'inne';
}

// ---------------------------------------------------------------- filtr nazw

interface Slowo {
  s: string;
  od: number;
  do: number;
}
const WZORZEC_SLOWA = /[\p{L}\p{M}][\p{L}\p{M}'’]*(?:-[\p{L}\p{M}][\p{L}\p{M}'’]*)*/gu;
const WZORZEC_PATRONA = /(^|[^\p{L}])(?:im\.|imienia)(?![\p{L}])/iu;
/** Myślnik, półpauza, pauza i poziomy pasek (U+2012 do U+2015) między spacjami. */
const WZORZEC_PAUZY = /\s+[-\u2012-\u2015]\s+/gu;
const WIELKA = /^\p{Lu}/u;
const SAME_ODSTEPY = /^\s+$/;

function slowa(tekst: string): Slowo[] {
  const wynik: Slowo[] = [];
  for (const m of tekst.matchAll(WZORZEC_SLOWA)) wynik.push({ s: m[0], od: m.index, do: m.index + m[0].length });
  return wynik;
}

/** Nazwa przygotowana do wyświetlenia: jedna spacja między słowami, pauzy ze spacjami jako przecinek. */
function oczyscNazwe(n: string): string {
  return n.replace(WZORZEC_PAUZY, ', ').replace(/\s+/g, ' ').trim();
}

/** Tytuły przed nazwiskiem w nazwach aptek i gabinetów: "Apteka Dr Nowak", "Gabinet lek. med. Nowak", "Apteka mgr farm.
    Nowak". Część pisze się bez kropki (dr, mgr, prof, inż), reszta tylko ze skrótem, bo bez kropki to zwykłe słowa ("Med
    Plus", "Farm Plus", "Lek" jako marka). Ciąg tytułów łapie ostatni z nich: po nim stoi nazwisko z wielkiej litery,
    a wcześniejsze przechodzą dalej, bo po nich stoi mała litera ("prof. dr hab. n. med. Kowalski"). Spacja po kropce
    nie jest wymagana ("Dr.Nowak"). */
const TYTULY_BEZ_KROPKI = new Set(['dr', 'mgr', 'prof', 'inż', 'inz']);
const TYTULY_Z_KROPKA = new Set(['lek', 'med', 'dent', 'stom', 'wet', 'hab', 'doc', 'farm', 'n', 'spec', 'specj']);
const ODSTEP_PO_TYTULE = /^(?:\.\s*|\s+)$/;
const ODSTEP_PO_SKROCIE = /^\.\s*$/;
/** Znane sieci i marki z "Dr" w nazwie: zostają, bo nie są osobą (i muszą zostać, żeby "Dr Max" nie zniknął z mapy).
    Marka, po której stoi jeszcze słowo z wielkiej litery ("Dr Max Kowalski"), nie jest wyjątkiem: to osoba. */
const MARKI_Z_TYTULEM = /(^|[^\p{L}])dr(?:\.\s*|\s+)(?:max|irena\s+eris|martens|oetker|scholl)(?![\p{L}])/giu;
const WIELKA_PO_ODSTEPIE = /^\s+\p{Lu}/u;

/** Nazwa bez znanych marek z "Dr" (zastąpionych kropką pośrodku, żeby sąsiednie słowa się nie zlały); marka z wielką
    literą tuż po niej zostaje, żeby filtr zobaczył "Dr Max Kowalski". */
function bezMarekZTytulem(nazwa: string): string {
  return nazwa.replace(MARKI_Z_TYTULEM, (cala, przed: string, pozycja: number, wszystko: string) =>
    WIELKA_PO_ODSTEPIE.test(wszystko.slice(pozycja + cala.length)) ? cala : `${przed}·`,
  );
}

/** Czy nazwa (już bez patrona) wygląda na osobę: wzorce w nagłówku. */
function maOsobe(nazwa: string, imiona: ReadonlySet<string>): boolean {
  const tekst = bezMarekZTytulem(nazwa);
  const s = slowa(tekst);
  for (let i = 0; i + 1 < s.length; i++) {
    const nastepne = s[i + 1];
    if (!WIELKA.test(nastepne.s)) continue;
    const odstep = tekst.slice(s[i].do, nastepne.od);
    const slowo = s[i].s;
    if (SAME_ODSTEPY.test(odstep) && (imiona.has(slowo) || slowo === 'u' || slowo === 'U')) return true;
    const male = slowo.toLowerCase();
    if (TYTULY_BEZ_KROPKI.has(male) && ODSTEP_PO_TYTULE.test(odstep)) return true;
    if (TYTULY_Z_KROPKA.has(male) && ODSTEP_PO_SKROCIE.test(odstep)) return true;
  }
  return false;
}

/** Numer domu po słowie (grupa 1: słowo, grupa 2: numer). */
const NUMER_DOMU = /(\p{L}{2,})\.?\s+(\d{1,4}\p{L}?(?:\/\d+\p{L}?)?)(?![\p{L}\p{N}])/gu;
const NIE_ULICA = new Set(['nr', 'no', 'numer']);
const GODZINY = /^\d+h$/i;
/** Słowo ulicy przed nazwą z wielkiej litery: pełne słowo („na”, „przy”, „ulica”, „ul”) ze spacją, a skrót z kropką
    także bez spacji („ul.Grunwaldzka”). Bez lookbehind, którego Safari nie zna przed 16.4. */
const ADRES_SLOWEM =
  /(?:^|[^\p{L}])(?:(?:na|przy|ulica|ulicy|aleja|alei|osiedle|osiedlu|ul|al|os)\s+|(?:ul|al|os|Ul|Al|Os|UL|AL|OS)\.\s*)\p{Lu}/u;

/** Czy nazwa (już bez patrona) ma w sobie adres: wzorce w nagłówku (R50). */
function maAdres(nazwa: string): boolean {
  for (const m of nazwa.matchAll(NUMER_DOMU)) {
    if (!NIE_ULICA.has(m[1].toLowerCase()) && !GODZINY.test(m[2])) return true;
  }
  return ADRES_SLOWEM.test(nazwa);
}

interface OcenaMiejsca {
  /** Nazwa do pokazania graczowi: przefiltrowana, albo pusta, gdy POI nie ma nazwy. */
  nazwa: string;
  zmieniona: boolean;
}
function ocenMiejsce(poi: GeoPoi, imiona: ReadonlySet<string>): OcenaMiejsca {
  const czysta = oczyscNazwe(poi.n);
  if (!czysta) return { nazwa: '', zmieniona: false };
  // patron ("im. Adama Mickiewicza") odpada: kronika nie wymienia osób, a patronami bywają też żyjący albo politycy
  const patron = WZORZEC_PATRONA.exec(czysta);
  const poczatekPatrona = patron ? patron.index + patron[1].length : 0;
  const glowa = poczatekPatrona > 0 ? czysta.slice(0, poczatekPatrona).replace(/[\s,;:]+$/u, '') : czysta;
  if (!maOsobe(glowa, imiona) && !maAdres(glowa)) return { nazwa: glowa, zmieniona: false };
  return { nazwa: SLOWNIK[kluczKategorii(poi.c, poi.n)].opis.mian, zmieniona: true };
}

/** Nazwa miejsca do tekstów gry: nazwa z imieniem i nazwiskiem (albo właścicielem "u Jana") albo z adresem zamienia się
    na opis kategorii ("sklep spożywczy przy bloku", "apteka"), reszta zostaje. Szczegóły i luki w nagłówku pliku. Pusta nazwa
    POI daje pusty napis. */
export function nazwaMiejsca(poi: GeoPoi, imiona: ReadonlySet<string>): string {
  return ocenMiejsce(poi, imiona).nazwa;
}

/** Własna nazwa miejsca do tekstów w obu językach (cele wypraw z mapy miasta): jak `nazwaMiejsca`, ale gdy filtr zamienił
    nazwę (była w niej osoba albo adres), pusty napis, bo polski opis kategorii nie przetłumaczy się na angielski, a
    kategorię cel podaje sam. Nazwy marek i instytucji zostają, patron po „im.” odpada jak w `nazwaMiejsca`. */
export function nazwaWlasnaMiejsca(poi: GeoPoi, imiona: ReadonlySet<string>): string {
  const ocena = ocenMiejsce(poi, imiona);
  return ocena.zmieniona ? '' : ocena.nazwa;
}

/** Składa nazwę miejsca dla okolicy zarządu (`GovInput.okolica`, wywołanie `miejscaZPoi`). Ze zbiorem imion to
    `nazwaWlasnaMiejsca`. Bez zbioru (`null`: brak tabel mieszkańców, filtr nie zna imion) zawsze pusty napis, bo
    wtedy nazwa jednoosobowej firmy („Sławomir Mielnik”) przeszłaby przez filtr, a imię i nazwisko właściciela nie
    może trafić do tekstów gry (RODO); zostaje sama kategoria miejsca. */
export function nazwaDoOkolicy(imiona: ReadonlySet<string> | null): (poi: GeoPoi) => string {
  return (poi) => (imiona ? nazwaWlasnaMiejsca(poi, imiona) : '');
}

// ---------------------------------------------------------------- szablony

const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Miejsce w tekście: zawsze w mianowniku albo jako rzeczownik kategorii. */
interface Miejsce {
  /** "Szkoła (Szkoła Podstawowa nr 12)" albo "Gabinet lekarski": początek zdania, podmiot. */
  kto: string;
  /** "W szkole (Szkoła Podstawowa nr 12)" albo "W gabinecie lekarskim": początek zdania, okolicznik. */
  Gdzie: string;
  r: Rodzaj;
}
const wRodzaju = (m: Miejsce, meski: string, zenski: string, nijaki: string): string =>
  m.r === 'm' ? meski : m.r === 'z' ? zenski : nijaki;

interface SzablonMiejsca {
  od: number;
  do: number;
  tekst: (m: Miejsce) => string;
}
const sz = (od: number, doRoku: number, tekst: (m: Miejsce) => string): SzablonMiejsca => ({ od, do: doRoku, tekst });

/** Zdarzenia przypięte do miejsca, po 4 na kategorię, z różnych epok. Czasowniki w czasie teraźniejszym, bo
    zgoda rodzaju z nazwą własną nie jest możliwa; wyjątek "przeszła na dyżury", gdzie rodzaj bierzemy z rzeczownika. */
const SZABLONY: Record<string, readonly SzablonMiejsca[]> = {
  szkola: [
    sz(2030, 2033, (m) => `${m.Gdzie} odwołano lekcje informatyki, bo zgasł serwer.`),
    sz(
      2034,
      2040,
      (m) =>
        `${m.Gdzie} zeszyt w kratkę zastąpił dziennik elektroniczny, a oceny wpisuje się ołówkiem, żeby dało się je poprawić.`,
    ),
    sz(2041, 2048, (m) => `${m.Gdzie} lekcje odbywają się przy oknach, bo tylko tam jest światło.`),
    sz(2042, 2049, (m) => `${m.Gdzie} dzwonek zastąpił ktoś z gwizdkiem, bo prąd jest za cenny na przerwy.`),
  ],
  przedszkole: [
    sz(2031, 2035, (m) => `${m.Gdzie} zgasły światła w czasie leżakowania i nikt nie zauważył różnicy.`),
    sz(2036, 2043, (m) => `${m.Gdzie} ogrzewana jest tylko jedna sala, a dzieci przychodzą w szalikach.`),
    sz(2044, 2050, (m) => `${m.Gdzie} dzieci uczą się liczyć na słoikach z przetworami.`),
    sz(
      2032,
      2040,
      (m) => `${m.Gdzie} bajki czyta się na głos zamiast puszczać, bo projektor został w dawnych czasach.`,
    ),
  ],
  przychodnia: [
    sz(2031, 2036, (m) => `${m.kto} ${wRodzaju(m, 'przeszedł', 'przeszła', 'przeszło')} na dyżury przy świecach.`),
    sz(2037, 2043, (m) => `${m.Gdzie} przyjmuje felczer, a recepty wypisuje się na odwrocie dawnych ulotek.`),
    sz(2044, 2050, (m) => `${m.kto} od lat nie przyjmuje, ale kolejka z przyzwyczajenia ustawia się nadal.`),
    sz(2029, 2032, (m) => `${m.Gdzie} rejestracja internetowa przestała się otwierać, więc zapisy wróciły do zeszytu.`),
  ],
  apteka: [
    sz(
      2030,
      2035,
      (m) =>
        `${m.Gdzie} przestał działać system recept elektronicznych, więc farmaceuci polegają na pamięci i charakterze pisma.`,
    ),
    sz(2038, 2046, (m) => `${m.kto} sprzedaje teraz głównie zioła, spirytus salicylowy i cierpliwość.`),
    sz(
      2047,
      2050,
      (m) => `${m.Gdzie} na półce z napisem „leki” leżą dziś głównie bandaże z wygotowanych prześcieradeł.`,
    ),
    sz(2036, 2041, (m) => `${m.Gdzie} brakuje wszystkiego z importu, więc robi się maści z tego, co rośnie za oknem.`),
  ],
  spozywczy: [
    sz(2030, 2033, (m) => `${m.Gdzie} przestały działać karty, potem kasa, więc ceny liczy się na kartce.`),
    sz(2032, 2036, (m) => `${m.Gdzie} powstał punkt wymiany słoików.`),
    sz(2037, 2042, (m) => `${m.kto} przyjmuje płatności w ziemniakach, a kasa fiskalna stoi dla ozdoby.`),
    sz(2046, 2050, (m) => `${m.Gdzie} półki stoją puste, ale cennik wisi i ktoś co tydzień go aktualizuje.`),
  ],
  sklep: [
    sz(
      2030,
      2034,
      (m) => `${m.Gdzie} terminal płatniczy zasłonięto ścierką, bo karty przestały działać, a gotówka jeszcze nie.`,
    ),
    sz(2035, 2041, (m) => `${m.Gdzie} wprowadzono wymianę towaru za towar, a ceny podaje się w godzinach pracy.`),
    sz(2044, 2050, (m) => `${m.kto} nie ma już towaru, ale wciąż wszyscy przychodzą tu po wiadomości.`),
    sz(2038, 2046, (m) => `${m.Gdzie} szyld wisi jeszcze z dawnych czasów, a nikt nie ma czasu go zdjąć.`),
  ],
  elektronika: [
    sz(
      2030,
      2033,
      (m) => `${m.Gdzie} ostatnie ładowarki i kable rozeszły się w tydzień, od kiedy wiadomo, co je zjada.`,
    ),
    sz(
      2038,
      2046,
      (m) => `${m.kto} skupuje dziś wszystko, co zalano żywicą, laminatem albo olejem, bo tylko to przetrwało.`,
    ),
    sz(2047, 2050, (m) => `${m.Gdzie} najdroższy towar to dziś metr kabla w szczelnej izolacji.`),
    sz(
      2034,
      2040,
      (m) => `${m.Gdzie} naprawia się już tylko to, co ma lutowanie pod żywicą, resztę oddaje się na złom.`,
    ),
  ],
  ubrania: [
    sz(2031, 2038, (m) => `${m.Gdzie} zaczęto wymieniać ubranie na ubranie, bo kasa nie ma prądu.`),
    sz(2039, 2048, (m) => `${m.kto} wygotowuje wszystko, co przyjmie, bo bakteria ginie we wrzątku.`),
    sz(2046, 2050, (m) => `${m.Gdzie} nikt nie pyta o rozmiar, tylko o to, czy wytrzyma zimę.`),
    sz(2033, 2040, (m) => `${m.Gdzie} metki z ceną służą dziś za papier do rozpałki.`),
  ],
  budowlany: [
    sz(2030, 2034, (m) => `${m.Gdzie} smar, rurki i taśma do izolacji schodzą szybciej niż młotki.`),
    sz(2035, 2042, (m) => `${m.Gdzie} po gwoździe kolejka ustawia się od rana, a bank nikogo nie interesuje.`),
    sz(2043, 2050, (m) => `${m.Gdzie} wymienia się narzędzia na narzędzia, a gwoździe liczy się na sztuki.`),
    sz(
      2029,
      2032,
      (m) =>
        `${m.Gdzie} przedłużacze i rurki izolacyjne sprzedają się zestawami, bo ludzie dopiero zaczynają się bać własnych kabli.`,
    ),
  ],
  ogrodnik: [
    sz(2029, 2034, (m) => `${m.Gdzie} nasiona warzyw rozeszły się w tydzień, a o kwiatach nikt już nie pytał.`),
    sz(2035, 2043, (m) => `${m.kto} wymienia sadzonki ziemniaków na kluczyki do samochodów, którymi nikt nie jeździ.`),
    sz(2044, 2050, (m) => `${m.Gdzie} rośnie teraz więcej, niż się sprzedaje, i nikt tego nie uważa za problem.`),
    sz(
      2038,
      2045,
      (m) => `${m.Gdzie} sprzedaje się wygotowaną ziemię do doniczek, bo zwykła może mieć w sobie szczep.`,
    ),
  ],
  biblioteka: [
    sz(2032, 2038, (m) => `${m.Gdzie} wróciły do łask papierowe książki, bo czytniki przestały się ładować.`),
    sz(
      2039,
      2045,
      (m) => `${m.kto} wypożycza teraz narzędzia i nasiona, a książki, jak zawsze, ktoś oddaje po terminie.`,
    ),
    sz(2046, 2050, (m) => `${m.Gdzie} regały służą za przepierzenia, a księgozbiór czyta się wieczorami na głos.`),
    sz(
      2040,
      2048,
      (m) =>
        `${m.Gdzie} na książki o hodowli, studniach i lutowaniu zapisują się ludzie, a kolejka jest dłuższa niż kiedyś na romanse.`,
    ),
  ],
  bank: [
    sz(2033, 2038, (m) => `${m.Gdzie} bankomat wydaje już tylko pokwitowania, bo dolar przeszedł na abonament.`),
    sz(
      2039,
      2046,
      (m) =>
        `${m.Gdzie} została sucha serwerownia z dyskami. Jako jedna z nielicznych rzeczy w okolicy nie zjadła jej bakteria.`,
    ),
    sz(2047, 2050, (m) => `${m.kto} nie wydaje pieniędzy, ale wydaje zaświadczenia, kto komu ile jest winien.`),
    sz(
      2029,
      2032,
      (m) => `${m.Gdzie} aplikacja przestała pokazywać saldo, a pracownicy zapewniali, że to tylko chwilowe.`,
    ),
  ],
  stacja: [
    sz(2030, 2034, (m) => `${m.Gdzie} pompy stanęły bez prądu, a paliwo wydawano kanistrem, na słowo honoru.`),
    sz(2037, 2044, (m) => `${m.kto} nie ma paliwa, ale zadaszenie przyjęło pod siebie targ.`),
    sz(2045, 2050, (m) => `${m.Gdzie} dystrybutory stoją jak pomniki dawnych czasów, a pod daszkiem suszy się pranie.`),
    sz(2033, 2038, (m) => `${m.Gdzie} ostatni dostawca paliwa przyjechał, pomachał i odjechał z całą cysterną.`),
  ],
  kosciol: [
    sz(2030, 2037, (m) => `${m.Gdzie} dzwony bije się ręcznie, bo kable do napędu zjadła bakteria.`),
    sz(2038, 2046, (m) => `${m.Gdzie} msze odprawia się przy świecach, a po mszy ławki służą zebraniom spółdzielni.`),
    sz(
      2047,
      2050,
      (m) => `${m.kto} pełni dziś rolę świetlicy, noclegowni i punktu, gdzie słychać wieści z sąsiednich osiedli.`,
    ),
    sz(2036, 2044, (m) => `${m.Gdzie} ogłoszenia parafialne i ogłoszenia spółdzielni czyta się teraz jednym tchem.`),
  ],
  urzad: [
    sz(2030, 2035, (m) => `${m.Gdzie} zgasł system kolejkowy, więc kolejka ustawia się znów na oko.`),
    sz(
      2036,
      2043,
      (m) => `${m.Gdzie} pieczątki są dziś cenniejsze niż pieniądze, bo tusz skończył się wcześniej niż dolar.`,
    ),
    sz(2044, 2050, (m) => `${m.kto} przyjmuje interesantów tak jak kiedyś, tylko bez numerków, prądu i cierpliwości.`),
    sz(
      2027,
      2030,
      (m) => `${m.Gdzie} wprowadzono numerki w aplikacji, a pierwszą kolejką była kolejka do informatyka.`,
    ),
  ],
};
/** Zdarzenia neutralne: pasują do każdej kategorii (zdanie z podmiotem `Gdzie` i czasownikami bezosobowymi albo
    nieuzgadnianymi z rodzajem). Wchodzą dopiero wtedy, gdy szablony kategorii nie wystarczą na pięć wpisów z miejscem,
    np. na mapie z jednym nazwanym POI. Każdy użyty najwyżej raz w kronice, więc to samo miejsce może wystąpić kilka razy. */
const SZABLONY_NEUTRALNE: readonly SzablonMiejsca[] = [
  sz(
    2026,
    2028,
    (m) => `${m.Gdzie} po raz pierwszy zgasło światło na cały dzień i nikt jeszcze nie wiedział dlaczego.`,
  ),
  sz(2033, 2037, (m) => `${m.Gdzie} zawisła kartka: „Nie działa, wrócimy, jak będzie prąd”.`),
  sz(2036, 2041, (m) => `${m.Gdzie} wymieniono instalację na krótką, suchą i smarowaną co tydzień.`),
  sz(2038, 2042, (m) => `${m.Gdzie} stanął pierwszy generator na korbę, a chętnych do kręcenia nie brakowało.`),
  sz(2040, 2045, (m) => `${m.Gdzie} spotyka się dziś pół osiedla, bo tylko tu ktoś pilnuje ognia i słucha radia.`),
  sz(2044, 2048, (m) => `${m.Gdzie} ktoś co rano wiesza kartkę z wiadomościami z sąsiednich osiedli.`),
  sz(2047, 2050, (m) => `${m.Gdzie} wszystko da się załatwić za słoik, kilka godzin pracy albo dobre słowo.`),
];

/** Klucze słownika bez własnych szablonów: nieznana kategoria dostaje zdarzenia sklepu (pasują do każdego lokalu),
    żłobek zdarzenia przedszkola. */
const ZASTEPCZE_SZABLONY: Record<string, string> = { inne: 'sklep', zlobek: 'przedszkole' };
const szablonyDla = (klucz: string): readonly SzablonMiejsca[] =>
  SZABLONY[Object.hasOwn(ZASTEPCZE_SZABLONY, klucz) ? ZASTEPCZE_SZABLONY[klucz] : klucz];

// ---------------------------------------------------------------- tło osiedla

interface Tlo {
  bloki: number;
  domy: number;
  maxKondygnacji: number;
  /** Ile budynków ma znaną epokę i ile z nich jest z wielkiej płyty albo nowych. */
  zEpoka: number;
  plyta: number;
  nowe: number;
}
function tloOsiedla(budynki: readonly Budynek[]): Tlo {
  const tlo: Tlo = { bloki: 0, domy: 0, maxKondygnacji: 0, zEpoka: 0, plyta: 0, nowe: 0 };
  for (const b of budynki) {
    if (b.typ === 'blok') tlo.bloki++;
    else tlo.domy++;
    tlo.maxKondygnacji = Math.max(tlo.maxKondygnacji, b.kondygnacje);
    if (b.epoka) {
      tlo.zEpoka++;
      if (b.epoka === 'plyta') tlo.plyta++;
      if (b.epoka === 'nowa') tlo.nowe++;
    }
  }
  return tlo;
}

// ---------------------------------------------------------------- ulice

/** Podmioty wpisów o ulicach, kolejno, żeby nie powtarzać jednego. Nigdy prawdziwe nazwy: ulice noszą nazwiska osób
    (także polityków), których odmienionych form filtr nie łapie, więc `addr:street` w ogóle nie wchodzi do kroniki. */
const ULICE = ['Główna ulica osiedla', 'Ulica przy bloku', 'Droga dojazdowa do osiedla', 'Osiedlowa uliczka'] as const;

// ---------------------------------------------------------------- zdarzenia ogólne

interface Kontekst {
  /** Następny ogólny podmiot wpisu o ulicy (po kolei, bez powtórzeń, dopóki starcza). */
  ulica: () => string;
}
interface Ogolny {
  od: number;
  do: number;
  warianty: readonly ((k: Kontekst) => string)[];
  gdy?: (t: Tlo) => boolean;
}
const og = (od: number, doRoku: number, ...warianty: ((k: Kontekst) => string)[]): Ogolny => ({
  od,
  do: doRoku,
  warianty,
});

/** Pięć zdarzeń o kablach, bakterii i prądzie: zawsze w kronice, po jednym z okna lat. */
const KABLE: readonly Ogolny[] = [
  og(
    2026,
    2027,
    () => 'Na osiedlu zaczęły się dziwne awarie kabli. Administracja zwaliła je na starą instalację i złodziei złomu.',
  ),
  og(
    2029,
    2029,
    () =>
      'Ktoś wreszcie połączył kropki: kable zjada bakteria, o którą ekologiczny startup poprosił własny model AI. Startup przeprasza za niedogodności.',
  ),
  og(
    2031,
    2034,
    (k) => `${k.ulica()}: latarnie zgasły jedna po drugiej i prąd już nie wrócił. Miejska sieć padała ulica po ulicy.`,
    (k) => `${k.ulica()}: prąd zniknął tu na stałe, bo bakteria dobrała się do kabla pod chodnikiem.`,
  ),
  og(
    2036,
    2041,
    () =>
      'W piwnicach pojawił się zielonkawy nalot na kablach. Zarząd musiał wybierać: spalić instalację w jednej klatce czy ryzykować resztę.',
    () =>
      'Zielonkawy nalot na kablach w piwnicach przestał kogokolwiek dziwić. Spółdzielnia rozdała smar, rurki i instrukcję, jak nie nosić szczepu do domu na butach.',
  ),
  og(
    2042,
    2046,
    () =>
      'Sieć energetyczna regionu padła na dobre. Prąd został tam, gdzie ktoś miał generator w piwnicy albo panele na dachu.',
  ),
];

/** Wpis zamykający: stan na 2051, rok gry. */
const ZAMKNIECIE: Ogolny = og(
  2051,
  2051,
  () => 'Spółdzielnia policzyła ludzi, światło i zapasy na zimę. Wyszło mało, ale przynajmniej policzone.',
);

/** Zdarzenia ogólne do losowania: spółdzielnia, osiedle, ulice i satyra na dawne czasy. Z warunkiem (`gdy`) tylko tam,
    gdzie pasują do budynków. */
const OGOLNE: readonly Ogolny[] = [
  og(2026, 2028, () => 'Spółdzielnia podniosła opłaty na fundusz remontowy i obiecała, że tym razem wymieni piony.'),
  og(
    2027,
    2030,
    () =>
      'Spółdzielnia zamontowała na klatkach inteligentne domofony. Nikt nie zapytał, co będzie, gdy chmura przestanie odpowiadać.',
  ),
  og(
    2027,
    2030,
    () => 'Z chodników zniknęły hulajnogi na minuty. Aplikacja, przez którą je wynajmowano, przetrwała je o rok.',
  ),
  og(
    2032,
    2035,
    () => 'Lodówki na abonament przestały chłodzić, bo producent nie dostał przelewu. Mięso ratowano w piwnicach.',
  ),
  og(2032, 2035, (k) => `${k.ulica()}: po raz ostatni stanął tu korek, bo wszyscy jechali po resztki benzyny.`),
  og(
    2033,
    2036,
    () =>
      'Ostatni paczkomat na osiedlu otwarto łomem. W środku leżał przedłużacz zamówiony, jak się okazało, pięć lat wcześniej.',
  ),
  og(
    2034,
    2038,
    () =>
      'Zebranie spółdzielców po raz pierwszy odbyło się przy świecach. Obrady były krótsze, bo nikt nie mógł pokazać prezentacji.',
  ),
  og(
    2035,
    2038,
    () =>
      'Przyszła pierwsza zima bez ogrzewania z sieci. Część lokatorów wyjechała na wieś po jedzenie, część już nie wróciła.',
  ),
  og(
    2036,
    2040,
    () => 'Dolar przeszedł na abonament. Spółdzielnia zapytała, czy da się płacić ziemniakami, i okazało się, że da.',
  ),
  og(
    2037,
    2041,
    () =>
      'Prezydent Stanów Zjednoczonych zaczął dziesiątą kadencję. Na osiedlu nikt tego nie zauważył, bo radio i tak nie grało.',
  ),
  og(
    2037,
    2043,
    (k) => `${k.ulica()}: chwasty wyrosły między płytami, a rowery jeżdżą środkiem jezdni, bo samochodów nie ma.`,
  ),
  og(
    2038,
    2042,
    () =>
      'Ostatni autobus przejechał przez osiedle bez pasażerów i bez zapowiedzi. Przystanek zaczął służyć za wiatę na targu.',
  ),
  og(
    2039,
    2043,
    () =>
      'Padła chmura. Umowy, zdjęcia i hasła do domofonów zniknęły, a papierowe segregatory spółdzielni okazały się jedynym archiwum.',
  ),
  og(
    2042,
    2046,
    () =>
      'Gmina przysłała ostatnie pismo: przenosi się, adres nieznany. Spółdzielnia została jedyną instytucją na osiedlu.',
  ),
  og(
    2044,
    2048,
    () =>
      'Zarząd spółdzielni przejął obowiązki, których nikt wcześniej nie miał na liście, od wody i prądu po patrol przy bramie.',
  ),
  og(
    2046,
    2050,
    () =>
      'Piwnice przestały być komórkami na rowery. Zostały magazynami, maszynowniami i najważniejszymi pomieszczeniami osiedla.',
  ),
  // zależne od budynków
  {
    ...og(
      2034,
      2038,
      () => 'Windy w blokach stanęły na dobre. Schody zostały jedyną siłownią osiedla, a zakupy nosi się w plecakach.',
    ),
    gdy: (t) => t.bloki > 0 && t.bloki >= t.domy && t.maxKondygnacji >= 4,
  },
  {
    ...og(
      2034,
      2038,
      () =>
        'Domy jednorodzinne przeszły na piece. Kto miał kominek, miał gości, a płoty rozbierano na opał w pierwszej kolejności.',
    ),
    gdy: (t) => t.domy > t.bloki,
  },
  {
    ...og(2040, 2048, () => 'Wielka płyta, wyśmiewana przez pół wieku, okazała się najtrwalszym budynkiem w okolicy.'),
    gdy: (t) => t.zEpoka > 0 && 2 * t.plyta >= t.zEpoka,
  },
  {
    ...og(
      2032,
      2037,
      () => 'Nowe bloki z inteligentnym domem zgasły pierwsze: drzwi otwierał telefon, a telefon się nie ładował.',
    ),
    gdy: (t) => t.zEpoka > 0 && 4 * t.nowe >= t.zEpoka,
  },
];

// ---------------------------------------------------------------- miejsca z mapy

interface Kandydat {
  klucz: string;
  nazwa: string;
  zmieniona: boolean;
  /** Nazwa to tylko nazwa rodzaju miejsca ("Sklep ogrodniczy"): w tekście bez powtarzającego ją nawiasu. */
  ogolna: boolean;
  wObszarze: boolean;
  /** Kwadrat odległości od adresu, m². */
  odl2: number;
  /** Pozycja w `geo.poi`, do stabilnego porządku. */
  ind: number;
}

const rodzina = (klucz: string): string => (klucz === 'przedszkole' || klucz === 'zlobek' ? 'szkola' : klucz);

/** Miejsca z nazwą pogrupowane po kategorii; różne POI o tej samej nazwie w kategorii to jedno miejsce (lepsze:
    z obszaru gry, potem bliższe). */
function kandydaci(geo: Geo, imiona: ReadonlySet<string>): Map<string, Kandydat[]> {
  const grupy = new Map<string, Map<string, Kandydat>>();
  geo.poi.forEach((p, ind) => {
    const ocena = ocenMiejsce(p, imiona);
    if (!ocena.nazwa) return;
    const klucz = kluczKategorii(p.c, p.n);
    const k: Kandydat = {
      klucz,
      nazwa: ocena.nazwa,
      zmieniona: ocena.zmieniona,
      ogolna: ocena.nazwa.toLowerCase() === SLOWNIK[klucz].rzecz.mian,
      wObszarze: Math.abs(p.x) <= POL_OBSZARU && Math.abs(p.y) <= POL_OBSZARU,
      odl2: p.x * p.x + p.y * p.y,
      ind,
    };
    const grupa = grupy.get(klucz) ?? new Map<string, Kandydat>();
    const stary = grupa.get(k.nazwa);
    if (!stary || (k.wObszarze && !stary.wObszarze) || (k.wObszarze === stary.wObszarze && k.odl2 < stary.odl2))
      grupa.set(k.nazwa, k);
    grupy.set(klucz, grupa);
  });
  // pierwszeństwo obszaru gry liczymy na rodzinę kategorii (szkoła, przedszkole i żłobek to jedna): podtyp spoza obszaru
  // nie wypiera bliższej szkoły
  const rodzinaZObszaru = new Set<string>();
  for (const [klucz, grupa] of grupy) {
    if ([...grupa.values()].some((k) => k.wObszarze)) rodzinaZObszaru.add(rodzina(klucz));
  }
  const wynik = new Map<string, Kandydat[]>();
  for (const [klucz, grupa] of grupy) {
    const wszystkie = [...grupa.values()].sort((a, b) => a.odl2 - b.odl2 || a.ind - b.ind);
    let pula = rodzinaZObszaru.has(rodzina(klucz))
      ? wszystkie.filter((k) => k.wObszarze)
      : wszystkie.slice(0, NAJBLIZSZE_POZA_OBSZAREM);
    const krotkie = pula.filter((k) => k.nazwa.length <= MAX_DLUGOSC_NAZWY);
    if (krotkie.length) pula = krotkie;
    if (pula.length) wynik.set(klucz, pula);
  }
  return wynik;
}

function miejsceWTekscie(k: Kandydat): Miejsce {
  const s = SLOWNIK[k.klucz];
  if (k.zmieniona) return { kto: wielka(s.opis.mian), Gdzie: wielka(s.opis.w), r: s.opis.r };
  if (k.ogolna) return { kto: wielka(s.rzecz.mian), Gdzie: wielka(s.rzecz.w), r: s.rzecz.r };
  return {
    kto: `${wielka(s.rzecz.mian)} (${k.nazwa})`,
    Gdzie: `${wielka(s.rzecz.w)} (${k.nazwa})`,
    r: s.rzecz.r,
  };
}

// ---------------------------------------------------------------- losowanie

function przetasuj<T>(r: Rng, lista: readonly T[]): T[] {
  const wynik = [...lista];
  for (let i = wynik.length - 1; i > 0; i--) {
    const j = calkowita(r, 0, i);
    [wynik[i], wynik[j]] = [wynik[j], wynik[i]];
  }
  return wynik;
}

/** Rok wpisu dla miejsca, które ma już wpisy z lat `zajete`: losowy (`losuj(ile)` zwraca indeks 0..ile-1) z wolnych lat
    okna szablonu [od, doRoku], więc jedno miejsce nigdy nie ma dwóch wpisów z tego samego roku. Gdy okno jest wyczerpane,
    najbliższy wolny rok w [2026, 2051] bez losowania: w rosnącej odległości od okna, przy remisie najpierw rok po oknie, potem
    rok przed nim. Gdy
    zajęte są wszystkie lata, `od` (nieosiągalne: miejsce ma najwyżej osiem wpisów). */
export function wolnyRok(
  zajete: ReadonlySet<number>,
  od: number,
  doRoku: number,
  losuj: (ile: number) => number,
): number {
  const wolne: number[] = [];
  for (let rok = od; rok <= doRoku; rok++) if (!zajete.has(rok)) wolne.push(rok);
  if (wolne.length) return wolne[losuj(wolne.length)];
  for (let odleglosc = 1; odleglosc <= ROK_DO - ROK_OD; odleglosc++) {
    const wolny = [doRoku + odleglosc, od - odleglosc].find(
      (rok) => rok >= ROK_OD && rok <= ROK_DO && !zajete.has(rok),
    );
    if (wolny !== undefined) return wolny;
  }
  return od;
}

interface Surowy {
  rok: number;
  tekst: string;
  miejsce?: string;
}

/** Kronika osiedla: 12-16 wpisów z lat 2026-2051, rosnąco po roku (przy tym samym roku w kolejności tworzenia: najpierw
    kable, potem miejsca, potem zdarzenia ogólne). Co najmniej pięć o kablach, bakterii i prądzie, a przy mapie z nazwanymi
    POI co najmniej pięć z `miejsce`. Układ i luki w nagłówku pliku. */
export function kronika(
  geo: Geo,
  budynki: readonly Budynek[],
  imiona: ReadonlySet<string>,
  ziarno: string,
): WpisKroniki[] {
  const r = losDla('kronika', ziarno);
  const lacznie = calkowita(r, MIN_WPISOW, MAX_WPISOW);
  const tlo = tloOsiedla(budynki);

  let ktoraUlica = 0;
  const kontekst: Kontekst = { ulica: () => ULICE[ktoraUlica++ % ULICE.length] };
  const zOgolnego = (o: Ogolny): Surowy => {
    const rok = calkowita(r, o.od, o.do);
    const wariant = o.warianty[calkowita(r, 0, o.warianty.length - 1)];
    return { rok, tekst: wariant(kontekst) };
  };

  const wpisy: Surowy[] = [];
  for (const o of KABLE) wpisy.push(zOgolnego(o));

  // miejsca z mapy: po kolei po kategoriach, w kolejnych rundach kolejne szablony, żeby kategorii było jak najwięcej
  const celMiejsc = Math.min(lacznie - WPISY_KABLE - MIN_OGOLNYCH, MAX_MIEJSC);
  const pule = kandydaci(geo, imiona);
  const klucze = przetasuj(
    r,
    [...pule.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const kolejki = new Map<string, SzablonMiejsca[]>(klucze.map((k) => [k, przetasuj(r, szablonyDla(k))]));
  const uzycia = new Map<string, number>();
  const miejsca: Surowy[] = [];
  /** Wybiera miejsce z puli kategorii (`klucz`), które dotąd wystąpiło najrzadziej; remis losuje. */
  const nastepneMiejsce = (klucz: string): Kandydat => {
    const pula = pule.get(klucz) ?? [];
    const uzyte = (k: Kandydat): number => uzycia.get(`${klucz}|${k.nazwa}`) ?? 0;
    const najmniej = Math.min(...pula.map(uzyte));
    const wolne = pula.filter((k) => uzyte(k) === najmniej);
    const wybrany = wolne[calkowita(r, 0, wolne.length - 1)];
    uzycia.set(`${klucz}|${wybrany.nazwa}`, najmniej + 1);
    return wybrany;
  };
  const latMiejsc = new Map<string, Set<number>>();
  const dodajMiejsce = (szablon: SzablonMiejsca, wybrany: Kandydat): void => {
    const zajete = latMiejsc.get(wybrany.nazwa) ?? new Set<number>();
    const rok = wolnyRok(zajete, szablon.od, szablon.do, (ile) => calkowita(r, 0, ile - 1));
    latMiejsc.set(wybrany.nazwa, zajete.add(rok));
    miejsca.push({ rok, tekst: szablon.tekst(miejsceWTekscie(wybrany)), miejsce: wybrany.nazwa });
  };
  for (let runda = 0; miejsca.length < celMiejsc; runda++) {
    let cosDodano = false;
    for (const klucz of klucze) {
      if (miejsca.length >= celMiejsc) break;
      const szablon = kolejki.get(klucz)?.[runda];
      if (!szablon) continue;
      dodajMiejsce(szablon, nastepneMiejsce(klucz));
      cosDodano = true;
    }
    if (!cosDodano) break;
  }
  // szablony kategorii się skończyły, a miejsc jest za mało (np. jedno POI na mapie): zdarzenia neutralne, z miejsc
  // używanych dotąd najrzadziej, więc to samo miejsce wraca dopiero wtedy, gdy trzeba
  for (const szablon of przetasuj(r, SZABLONY_NEUTRALNE)) {
    if (miejsca.length >= celMiejsc || klucze.length === 0) break;
    const zNajmniejszymUzyciem = klucze
      .map((klucz) => ({
        klucz,
        uzycie: Math.min(...(pule.get(klucz) ?? []).map((k) => uzycia.get(`${klucz}|${k.nazwa}`) ?? 0)),
      }))
      .sort((a, b) => a.uzycie - b.uzycie);
    const wolneKlucze = zNajmniejszymUzyciem
      .filter((k) => k.uzycie === zNajmniejszymUzyciem[0].uzycie)
      .map((k) => k.klucz);
    dodajMiejsce(szablon, nastepneMiejsce(wolneKlucze[calkowita(r, 0, wolneKlucze.length - 1)]));
  }
  wpisy.push(...miejsca);

  // zdarzenia ogólne: reszta do `lacznie` (bez wpisu zamykającego, który dodajemy na końcu)
  const doLosowania = przetasuj(
    r,
    OGOLNE.filter((o) => !o.gdy || o.gdy(tlo)),
  );
  for (const o of doLosowania.slice(0, lacznie - wpisy.length - 1)) wpisy.push(zOgolnego(o));
  wpisy.push(zOgolnego(ZAMKNIECIE));

  return wpisy
    .map((w, ind) => ({ w, ind }))
    .sort((a, b) => a.w.rok - b.w.rok || a.ind - b.ind)
    .map(({ w }) => (w.miejsce ? { rok: w.rok, tekst: w.tekst, miejsce: w.miejsce } : { rok: w.rok, tekst: w.tekst }));
}
