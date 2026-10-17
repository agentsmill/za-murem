/* Kronika osiedla i filtr nazw miejsc. Kronika to wspólna, lokalna przeszłość z lat 2026-2051: kilkanaście zdarzeń
   przypiętych do prawdziwych miejsc z mapy (szkoły, przychodnie, sklepy, banki), do ulic z `addr:street` i do samego
   osiedla i spółdzielni. Wiele historii mieszkańców (krok 4, historie) odwołuje się do tych samych wpisów, więc osiedle
   ma jedną, spójną przeszłość. Lore z GDD: rok zero 2026 (bakteria z ekologicznego startupu), odkrycie około 2029, w latach
   trzydziestych i czterdziestych rozpad (sieci padają region po regionie, chmura, dolar na abonament, dziesiąta kadencja
   prezydenta USA bez imienia), w 2051 gra. Ton to satyra na dzisiejszą technologię i ekologię; żadnych nazwisk polityków.

   Wejście: `kronika(geo, budynki, imiona, ziarno)`. Ziarno to `losDla('kronika', ziarno)`; wywołujący podaje `rejon`
   budynku siedziby albo pierwszego budynku, więc ten sam adres daje tę samą kronikę. `budynki` dają tylko tło osiedla
   (bloki albo domy, wielka płyta, nowe bloki z "inteligentnym domem"), nic poza tym. Wynik jest deterministyczny i nie
   zmienia argumentów. Moduł działa w przeglądarce i w Node, bez trygonometrii i pierwiastków (odległość porównujemy
   w kwadratach), losowanie przez los.ts.

   Układ kroniki: łącznie 12-16 wpisów (losowane). Zawsze pięć o kablach, bakterii i prądzie (rok zero 2026-2027,
   odkrycie 2029, awaria prądu na ulicy 2031-2034, zielonkawy nalot w piwnicach 2036-2041, region bez sieci 2042-2046)
   i jeden zamykający w 2051. Reszta to miejsca z mapy (do ośmiu) i zdarzenia ogólne: spółdzielnia, osiedle, ulice,
   satyra (hulajnogi na minuty, paczkomaty, lodówki na abonament, dolar na abonament). Kategorie miejsc (szkoła,
   przedszkole, żłobek, przychodnia, apteka, sklep spożywczy, sklep z elektroniką, z ubraniami, z narzędziami, ogrodniczy,
   lokal, bank, stacja paliw, kościół, biblioteka, placówka) mają po 3-4 szablony z różnych epok. Dzięki temu nawet jedno
   miejsce na mapie (Zielonki mają trzy POI) daje co najmniej pięć wpisów z miejscem: to samo miejsce dostaje kilka różnych
   zdarzeń. Miejsca bierzemy z POI z niepustą nazwą. Pierwszeństwo mają te z obszaru gry (|x|, |y| do 192 m wokół `geo.c`);
   gdy w rodzinie kategorii (szkoła, przedszkole i żłobek to jedna) nie ma żadnego, bierzemy trzy najbliższe. Różne POI
   o tej samej nazwie (sieć sklepów) to jedno miejsce. Nazwy dłuższe niż 48 znaków wypadają, jeśli jest coś krótszego.

   Odmiana: nazw własnych nie odmieniamy, bo nie mamy skąd wziąć poprawnych form. Miejsce stoi w mianowniku w nawiasie
   po rzeczowniku kategorii w miejscowniku ("W szkole (Szkoła Podstawowa nr 12) odwołano lekcje informatyki"), albo
   rzeczownik jest podmiotem ("Przychodnia (Baltmed) przeszła na dyżury przy świecach"). Nazwa, która jest samym rzeczownikiem
   ("Sklep ogrodniczy"), nie powtarza się w nawiasie. Ulice są podmiotem przed dwukropkiem ("Ulica Spacerowa: latarnie
   zgasły…"); nazwa zaczynająca się od "Aleja", "Plac" itp. nie dostaje drugiego "Ulica". Wpisy o ulicach mają `miejsce`
   puste: ulica to tło, nie POI. Demo i kafelki nie niosą `addr:street` (budynki mają tylko numer), więc tam podmiotem
   jest "Główna ulica osiedla", "Droga dojazdowa do osiedla" i "Osiedlowa uliczka"; nazwy ulic są tylko z Overpass. Ulice
   z obszaru gry mają pierwszeństwo, najczęstsze pierwsze. Ulica, w której filtr nazw widzi osobę, odpada; ulica nazwana od
   osoby w dopełniaczu ("Marii Konopnickiej") wchodzi tak, jak jest na mapie, bo odmienionych nazwisk filtr nie łapie.

   Filtr nazw (`nazwaMiejsca`): sklep o nazwie "Sławomir Mielnik" albo "Usługi Remontowe Jan Nowak" to w tekście gry
   osoba, której nie chcemy wymieniać. Zamieniamy takie nazwy na opis kategorii ("sklep spożywczy przy bloku", "zakład
   usługowy na rogu", "apteka"), a nazwy marek i instytucji ("Żabka", "Szkoła Podstawowa nr 12", "Apteka Pod Lwem")
   zostają. Wykrywamy dokładnie dwa wzorce:
   1. słowo równe imieniu z listy (dopasowanie co do słowa, z uwzględnieniem wielkości liter, polskie litery),
      po którym po samych odstępach stoi słowo z wielkiej litery (także inicjał): "Jan Nowak", "Salon Anna K.";
   2. samodzielne "u" albo "U", po którym po odstępach stoi słowo z wielkiej litery: "Kwiaciarnia u Moniki", "U Sylwii".
      Ten wzór nie zależy od listy imion, bo "u Jana" to dopełniacz, którego lista imion (mianowniki) nie zawiera.
   Nazwa jest też porządkowana do wyświetlenia: jedna spacja między słowami, pauzy otoczone spacjami (" - ", " – ", " — ")
   zamieniają się na ", " (w tekstach dla gracza nie ma pauz), a patron po "im." albo "imienia" odpada ("Szkoła
   Podstawowa Nr 44 im. Adama Mickiewicza" to "Szkoła Podstawowa Nr 44"), bo kronika nie wymienia osób, a patronami bywają
   też politycy. Osoba przed patronem nadal się liczy.
   NIE jest łapane (nie ma jak odróżnić od marek bez słownika nazwisk i odmiany): samo imię ("Jubiler Monika", "Roland"),
   samo nazwisko ("Mielnik", "Gzella"), imię i nazwisko w innym przypadku niż mianownik ("Gabinet Anny Nowak", "Zakład Jana
   Nowaka"; poza tym, gdy forma odmieniona sama jest imieniem z listy, jak "Jana"; pełna odmiana dałaby błędne trafienia
   w nazwach kościołów, np. "Świętego Jana Chrzciciela"), patron bez "im." ("Szkoła Podstawowa Jana Pawła II", "Parafia
   św. Józefa"), imię spoza listy PESEL (zdrobnienia, obce), pisownia wielkimi albo małymi literami ("JAN NOWAK", "jan
   nowak"), imię i słowo rozdzielone przecinkiem, cudzysłowem albo znakiem ("Anna & Jan", "Jan, Nowak"). Odwrotnie, marka
   zaczynająca się od imienia i słowa z wielkiej litery ("Tom Tailor") zamieni się na opis; to koszt filtra, który woli nie
   wymienić marki, niż wymienić osobę. Nazwy ulic przechodzą przez filtr tylko po to, żeby odpaść, gdy zawierają osobę.

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

/** Czy nazwa (już bez patrona) wygląda na osobę: wzorce w nagłówku. */
function maOsobe(nazwa: string, imiona: ReadonlySet<string>): boolean {
  const s = slowa(nazwa);
  for (let i = 0; i + 1 < s.length; i++) {
    const nastepne = s[i + 1];
    if (!SAME_ODSTEPY.test(nazwa.slice(s[i].do, nastepne.od)) || !WIELKA.test(nastepne.s)) continue;
    if (imiona.has(s[i].s) || s[i].s === 'u' || s[i].s === 'U') return true;
  }
  return false;
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
  if (!maOsobe(glowa, imiona)) return { nazwa: glowa, zmieniona: false };
  return { nazwa: SLOWNIK[kluczKategorii(poi.c, poi.n)].opis.mian, zmieniona: true };
}

/** Nazwa miejsca do tekstów gry: nazwa z imieniem i nazwiskiem (albo właścicielem "u Jana") zamienia się na opis
    kategorii ("sklep spożywczy przy bloku", "apteka"), reszta zostaje. Szczegóły i luki w nagłówku pliku. Pusta nazwa
    POI daje pusty napis. */
export function nazwaMiejsca(poi: GeoPoi, imiona: ReadonlySet<string>): string {
  return ocenMiejsce(poi, imiona).nazwa;
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

/** Zdarzenia przypięte do miejsca, po 2-4 na kategorię, z różnych epok. Czasowniki w czasie teraźniejszym, bo
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
  ],
  przedszkole: [
    sz(2031, 2035, (m) => `${m.Gdzie} zgasły światła w czasie leżakowania i nikt nie zauważył różnicy.`),
    sz(2036, 2043, (m) => `${m.Gdzie} ogrzewana jest tylko jedna sala, a dzieci przychodzą w szalikach.`),
    sz(2044, 2050, (m) => `${m.Gdzie} dzieci uczą się liczyć na słoikach z przetworami.`),
  ],
  przychodnia: [
    sz(2031, 2036, (m) => `${m.kto} ${wRodzaju(m, 'przeszedł', 'przeszła', 'przeszło')} na dyżury przy świecach.`),
    sz(2037, 2043, (m) => `${m.Gdzie} przyjmuje felczer, a recepty wypisuje się na odwrocie dawnych ulotek.`),
    sz(2044, 2050, (m) => `${m.kto} od lat nie przyjmuje, ale kolejka z przyzwyczajenia ustawia się nadal.`),
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
  ],
  ubrania: [
    sz(2031, 2038, (m) => `${m.Gdzie} zaczęto wymieniać ubranie na ubranie, bo kasa nie ma prądu.`),
    sz(2039, 2048, (m) => `${m.kto} wygotowuje wszystko, co przyjmie, bo bakteria ginie we wrzątku.`),
    sz(2046, 2050, (m) => `${m.Gdzie} nikt nie pyta o rozmiar, tylko o to, czy wytrzyma zimę.`),
  ],
  budowlany: [
    sz(2030, 2034, (m) => `${m.Gdzie} smar, rurki i taśma do izolacji schodzą szybciej niż młotki.`),
    sz(2035, 2042, (m) => `${m.Gdzie} po gwoździe kolejka ustawia się od rana, a bank nikogo nie interesuje.`),
    sz(2043, 2050, (m) => `${m.Gdzie} wymienia się narzędzia na narzędzia, a gwoździe liczy się na sztuki.`),
  ],
  ogrodnik: [
    sz(2029, 2034, (m) => `${m.Gdzie} nasiona warzyw rozeszły się w tydzień, a o kwiatach nikt już nie pytał.`),
    sz(2035, 2043, (m) => `${m.kto} wymienia sadzonki ziemniaków na kluczyki do samochodów, którymi nikt nie jeździ.`),
    sz(2044, 2050, (m) => `${m.Gdzie} rośnie teraz więcej, niż się sprzedaje, i nikt tego nie uważa za problem.`),
  ],
  biblioteka: [
    sz(2032, 2038, (m) => `${m.Gdzie} wróciły do łask papierowe książki, bo czytniki przestały się ładować.`),
    sz(
      2039,
      2045,
      (m) => `${m.kto} wypożycza teraz narzędzia i nasiona, a książki, jak zawsze, ktoś oddaje po terminie.`,
    ),
    sz(2046, 2050, (m) => `${m.Gdzie} regały służą za przepierzenia, a księgozbiór czyta się wieczorami na głos.`),
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
  ],
  stacja: [
    sz(2030, 2034, (m) => `${m.Gdzie} pompy stanęły bez prądu, a paliwo wydawano kanistrem, na słowo honoru.`),
    sz(2037, 2044, (m) => `${m.kto} nie ma paliwa, ale zadaszenie przyjęło pod siebie targ.`),
    sz(2045, 2050, (m) => `${m.Gdzie} dystrybutory stoją jak pomniki dawnych czasów, a pod daszkiem suszy się pranie.`),
  ],
  kosciol: [
    sz(2030, 2037, (m) => `${m.Gdzie} dzwony bije się ręcznie, bo kable do napędu zjadła bakteria.`),
    sz(2038, 2046, (m) => `${m.Gdzie} msze odprawia się przy świecach, a po mszy ławki służą zebraniom spółdzielni.`),
    sz(
      2047,
      2050,
      (m) => `${m.kto} pełni dziś rolę świetlicy, noclegowni i punktu, gdzie słychać wieści z sąsiednich osiedli.`,
    ),
  ],
  urzad: [
    sz(2030, 2035, (m) => `${m.Gdzie} zgasł system kolejkowy, więc kolejka ustawia się znów na oko.`),
    sz(
      2036,
      2043,
      (m) => `${m.Gdzie} pieczątki są dziś cenniejsze niż pieniądze, bo tusz skończył się wcześniej niż dolar.`,
    ),
    sz(2044, 2050, (m) => `${m.kto} przyjmuje interesantów tak jak kiedyś, tylko bez numerków, prądu i cierpliwości.`),
  ],
};
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

const WZORZEC_RZECZOWNIKA_ULICY =
  /^(ulica|ul\.|aleja|aleje|al\.|plac|pl\.|rondo|skwer|osiedle|os\.|bulwar|park|droga|szosa|trakt|promenada|rynek|most|wybrzeże|nabrzeże|zaułek|przejście|ścieżka)(\s|$)/i;

/** Ulice z `addr:street` budynków, najczęstsze pierwsze (przy remisie alfabetycznie). Z obszaru gry, a gdy tam żaden
    budynek nie ma ulicy, ze wszystkich. Środek budynku to średnia wierzchołków obrysu. Ulica, w której filtr nazw widzi
    osobę (imię z listy i słowo z wielkiej litery), odpada. */
function ulice(geo: Geo, imiona: ReadonlySet<string>): string[] {
  const blisko = new Map<string, number>();
  const wszystkie = new Map<string, number>();
  for (const b of geo.b) {
    const u = (b.t['addr:street'] ?? '').replace(/\s+/g, ' ').trim();
    if (!u || b.p.length === 0 || maOsobe(u, imiona)) continue;
    let sx = 0;
    let sy = 0;
    for (const [x, y] of b.p) {
      sx += x;
      sy += y;
    }
    const x = sx / b.p.length;
    const y = sy / b.p.length;
    wszystkie.set(u, (wszystkie.get(u) ?? 0) + 1);
    if (Math.abs(x) <= POL_OBSZARU && Math.abs(y) <= POL_OBSZARU) blisko.set(u, (blisko.get(u) ?? 0) + 1);
  }
  const zrodlo = blisko.size ? blisko : wszystkie;
  return [...zrodlo.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([u]) => u);
}

/** "Ulica Spacerowa", "Aleja Zwycięstwa" albo, gdy nie znamy żadnej ulicy, "Główna ulica osiedla": podmiot przed
    dwukropkiem, więc bez odmiany i bez zgody czasownika. */
const nazwaUlicy = (u: string): string => (WZORZEC_RZECZOWNIKA_ULICY.test(u) ? wielka(u) : `Ulica ${u}`);

/** Podmioty wpisów o ulicach, gdy mapa nie ma żadnej nazwy ulicy (demo, kafelki): kolejne, żeby nie powtarzać jednego. */
const ULICE_BEZ_NAZW = ['Główna ulica osiedla', 'Droga dojazdowa do osiedla', 'Osiedlowa uliczka'] as const;

// ---------------------------------------------------------------- zdarzenia ogólne

interface Kontekst {
  /** Następna ulica z puli (po kolei, bez powtórzeń, dopóki starcza). */
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

  const kolejkaUlic = przetasuj(r, ulice(geo, imiona));
  let ktoraUlica = 0;
  const kontekst: Kontekst = {
    ulica: () => {
      const n = ktoraUlica++;
      if (kolejkaUlic.length === 0) return ULICE_BEZ_NAZW[n % ULICE_BEZ_NAZW.length];
      return nazwaUlicy(kolejkaUlic[n % kolejkaUlic.length]);
    },
  };
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
  for (let runda = 0; miejsca.length < celMiejsc; runda++) {
    let cosDodano = false;
    for (const klucz of klucze) {
      if (miejsca.length >= celMiejsc) break;
      const szablon = kolejki.get(klucz)?.[runda];
      if (!szablon) continue;
      const pula = pule.get(klucz) ?? [];
      const najmniej = Math.min(...pula.map((k) => uzycia.get(`${klucz}|${k.nazwa}`) ?? 0));
      const wolne = pula.filter((k) => (uzycia.get(`${klucz}|${k.nazwa}`) ?? 0) === najmniej);
      const wybrany = wolne[calkowita(r, 0, wolne.length - 1)];
      uzycia.set(`${klucz}|${wybrany.nazwa}`, najmniej + 1);
      const rok = calkowita(r, szablon.od, szablon.do);
      miejsca.push({ rok, tekst: szablon.tekst(miejsceWTekscie(wybrany)), miejsce: wybrany.nazwa });
      cosDodano = true;
    }
    if (!cosDodano) break;
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
