/* Wiki w grze, kategoria „Mapa miasta i wyprawy”: mapa miasta, wyprawy po łup (dzienna z mapy i nocna z karty nocy), droga i
   czas, ryzyko, łup i zapas miejsca, a do tego po jednym artykule na każdą kategorię miejsca z tabeli gry (`KAT_EN` w
   src/content/miejsca.en.ts, czyli `POICAT` z 0.3 bez `mieszkania`; id `miejsce:<kategoria>`). Liczby biorą się z funkcji i stałych
   gry: łup i ryzyko kategorii z `celZMiejsca` (src/gov/wyprawy.ts: `POICAT` przeliczone na zapasy zarządu, ryzyko razy
   (1 + odległość / `RYZYKO_ODL_M`)), czas z `czasWyprawyMin` i `powrotMin`, odmowy wysłania z `powodOdmowy`
   (src/gov/dzienne.ts), progi „spokojnie, niepewnie, groźnie” z `ryzykoSlowem`, cele zmyślone z `TARGETS`. Kategorie
   `garaz` i `hala` są w tabeli, ale `poiCat` (src/world/osm.ts) nie daje ich żadnemu punktowi z OpenStreetMap, więc na mapie miasta
   ich nie ma i artykuł o nich to mówi. Zasady są wspólne dla obu trybów; różnice trybu zombie (ryzyko, szwendacze,
   ugryzienie) opisują uwagi (`WikiCtx.zombie`). */

import { POICAT } from '../content/data.ts';
import { KAT_EN } from '../content/miejsca.en.ts';
import { L, tr, wielka } from '../core/jezyk.ts';
import { powodOdmowy } from '../gov/dzienne.ts';
import { CARD_HOUR, MORNING } from '../gov/noc.ts';
import { TARGETS, targetNameTx } from '../gov/tresc.ts';
import type { GovInput, LootKey } from '../gov/typy.ts';
import {
  BLISKO_DO_M,
  type Cel,
  celZMiejsca,
  czasWyprawyMin,
  KRZYWIZNA_ULIC,
  MAX_DROGA_M,
  MAX_OKOLICA_M,
  METROW_NA_MIN,
  nazwaKategorii,
  PRZESZUKANIE_KROK_MIN,
  PRZESZUKANIE_MIN,
  PRZESZUKANIE_NAJKROCEJ_MIN,
  PUSTE_MIEJSCA,
  RYZYKO_ODL_M,
  ryzykoSlowem,
  SKALA_LUPU,
  UDZWIG_NA_OSOBE,
  WSKAZOWKA_LUP,
  WSKAZOWKA_RYZYKO,
  wlaczMiasto,
  ZAPAS_MAX,
  ZAPAS_MNOZNIK_OD,
  ZAPAS_MNOZNIK_ROZSTEP,
} from '../gov/wyprawy.ts';
import { newGov } from '../gov/zarzad.ts';
import { type Miejsce, PROMIEN_MAPY_LOKALNEJ } from '../world/miasto.ts';
import { LOOT } from './okna.ts';
import { num } from './tekst.ts';
import { cyt, kliknijcie, listaI, proc, wCyt } from './wiki-slowa.ts';
import { type Def, def, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

// ---------------------------------------------------------------- drobiazgi

const NB = ' ';

/** kategorie miejsc z tabeli gry w kolejności tabeli (`POICAT` bez `mieszkania`, jak `KAT_EN`) */
export const KATEGORIE_MIEJSC: readonly string[] = Object.keys(KAT_EN);

/** kategorie, których `poiCat` nie daje żadnemu punktowi z OSM: garaże i hale to budynki, nie sklepy ani usługi */
export const BEZ_PUNKTOW: ReadonlySet<string> = new Set(['garaz', 'hala']);

/** odległości z przykładów: mapa osiedla, granica „blisko”, zasięg karty nocy, kawałek dalej i najdalszy cel dzienny */
const ODLEGLOSCI = [PROMIEN_MAPY_LOKALNEJ, BLISKO_DO_M, MAX_OKOLICA_M, 1500, MAX_DROGA_M];

/** metry albo kilometry z jednostką (twarda spacja): „300 m”, „1,5 km” */
const odleglosc = (m: number): string => (m < 1000 ? `${num(m, 0)}${NB}m` : `${num(m / 1000, 1)}${NB}km`);

/** czas w minutach: „45 min”, „3 h”, „3 h 17 min” */
function czas(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}${NB}h${NB}${m}${NB}min` : `${h}${NB}h`) : `${m}${NB}min`;
}

/** liczba z dwoma miejscami, jak na karcie ryzyka: „0,30” → „0,3” */
const ryzykoTekst = (r: number): string => num(r, 2);

/** ryzyko słowem w bieżącym języku */
const slowem = (r: number): string => tr(ryzykoSlowem(r));

/** przedział łupu jak na karcie miejsca: „3” albo „3–7” */
const zakres = ([a, b]: [number, number]): string => (a === b ? `${a}` : `${a}–${b}`);

/** Fałszywe miejsce w danej odległości do liczenia celu (kategoria, odległość); gra liczy z niego cel tak samo jak z prawdziwego
    punktu z OSM. */
function miejsce(kat: string, odl: number): Miejsce {
  return { klucz: `poi:wiki:${kat}:${odl}`, kat, x: odl, y: 0, odl, nazwa: '' };
}

/** cel wyprawy do miejsca danej kategorii w odległości `odl` (jak na karcie miejsca) */
export const celKategorii = (kat: string, odl = 0): Cel => celZMiejsca(miejsce(kat, odl));

/** Progi ryzyka słowem: pierwsze ryzyko, od którego gra mówi „niepewnie”, i pierwsze, od którego „groźnie” (z `ryzykoSlowem`,
    krok 0,01). */
export function progiRyzyka(): [number, number] {
  const progi: number[] = [];
  let poprzednie = tr(ryzykoSlowem(0));
  for (let r = 1; r <= 100; r++) {
    const slowo = tr(ryzykoSlowem(r / 100));
    if (slowo !== poprzednie) progi.push(r / 100);
    poprzednie = slowo;
  }
  return [progi[0], progi[1]];
}

/** Powody, dla których wyprawa dzienna nie wyjdzie, z `powodOdmowy` na świeżym stanie z mapą miasta: po zmroku, za daleko,
    wybrane do cna, miejsce na mapie osiedla. `powodOdmowy` czyta z odczytu tylko godzinę, więc wystarcza mu odczyt z samą
    godziną. */
export function powodyOdmowy(place?: WikiCtx['place']): { noc: string; daleko: string; cna: string; osiedle: string } {
  const st = newGov(1);
  wlaczMiasto(st);
  const odczyt = (hour: number) => ({ hour, place }) as unknown as GovInput;
  const pelne = (odl: number): Cel => ({ ...celKategorii('sklep', odl), zapas: 10 });
  const powod = (hour: number, cel: Cel) => tr(powodOdmowy(st, odczyt(hour), cel));
  return {
    noc: powod(CARD_HOUR + 1, pelne(500)),
    daleko: powod(12, pelne(MAX_DROGA_M + 1)),
    cna: powod(12, { ...pelne(500), zapas: 0 }),
    osiedle: powod(12, pelne(PROMIEN_MAPY_LOKALNEJ - 50)),
  };
}

/** Uwaga o trybie zombie: w trybie zombie „Grasz w trybie zombie: …”, w zwykłym „W trybie zombie …”. */
function uwagaZombie(c: WikiCtx, pl: string, en: string): string {
  return c.zombie
    ? L(`Grasz w trybie zombie: ${pl}`, `You are playing Zombie mode: ${en}`)
    : L(`W trybie zombie ${pl}`, `In Zombie mode ${en}`);
}

/** nazwy łupu w kolejności zapasów zarządu */
const lupNazwa = (k: LootKey): string => tr(LOOT[k]);

/** łup kategorii w kolejności z karty miejsca (kolejność wpisów celu), bez pustych przedziałów */
function lupWiersze(kat: string): [LootKey, [number, number]][] {
  return (Object.entries(celKategorii(kat).lup) as [LootKey, [number, number]][]).filter(([, [, b]]) => b > 0);
}

/** Co dana kategoria zwykle daje, jak na karcie miejsca: „leki 1–3, części 0–1” (przedziały z `celZMiejsca`) */
function lupTekst(kat: string): string {
  return lupWiersze(kat)
    .map(([k, przedzial]) => `${lupNazwa(k)} ${zakres(przedzial)}`)
    .join(', ');
}

/** jakie obiekty z OpenStreetMap trafiają do kategorii (`poiCat` w src/world/osm.ts): opis po polsku i angielsku; kategorie
    bez punktów (garaże, hale) mają null */
const OSM: Record<string, [string, string] | null> = {
  spozywczy: [
    'sklepy spożywcze wszelkiego rodzaju: sklepiki, supermarkety, piekarnie, rzeźnicy, warzywniaki i kioski',
    'food shops of every kind: corner shops, supermarkets, bakeries, butchers, greengrocers and kiosks',
  ],
  apteka: ['apteki i sklepy z wyrobami medycznymi', 'pharmacies and medical supply shops'],
  przychodnia: [
    'przychodnie, gabinety lekarskie i dentystyczne oraz szpitale',
    'clinics, doctors’ and dentists’ surgeries and hospitals',
  ],
  budowlany: [
    'sklepy budowlane, z narzędziami, farbami i częściami samochodowymi oraz warsztaty samochodowe',
    'DIY and hardware shops, paint, tool and car parts shops, and car repair workshops',
  ],
  elektronika: [
    'sklepy z elektroniką, telefonami, komputerami i sprzętem AGD',
    'shops selling electronics, phones, computers and appliances',
  ],
  szkola: ['szkoły i przedszkola', 'schools and kindergartens'],
  biblioteka: ['biblioteki', 'libraries'],
  bank: ['banki', 'banks'],
  stacja: ['stacje paliw', 'petrol stations'],
  ubrania: [
    'sklepy z ubraniami, butami, torbami i materiałami oraz sklepy z używaną odzieżą',
    'clothes, shoe, bag and fabric shops and second-hand shops',
  ],
  urzad: [
    'urzędy miejskie, poczty, komisariaty, remizy, domy kultury i targowiska',
    'town halls, post offices, police stations, fire stations, community centres and marketplaces',
  ],
  kosciol: ['kościoły i inne miejsca kultu', 'churches and other places of worship'],
  sklep: ['pozostałe sklepy', 'all other shops'],
  ogrodnik: ['sklepy ogrodnicze, kwiaciarnie i sklepy rolnicze', 'garden centres, florists and agricultural shops'],
  garaz: null,
  hala: null,
};

/** słowa do wyszukiwarki dla kategorii (oba języki naraz) */
const SLOWA_KATEGORII: Record<string, string> = {
  spozywczy: 'jedzenie sklep spożywczy żywność food supermarket grocery',
  apteka: 'leki apteka pharmacy meds medicine',
  przychodnia: 'leki lekarz szpital dentysta clinic doctor hospital meds',
  budowlany: 'złom części narzędzia hardware tools scrap parts',
  elektronika: 'części elektronika electronics parts',
  szkola: 'szkoła przedszkole school kindergarten',
  biblioteka: 'biblioteka library books',
  bank: 'bank pieniądze money',
  stacja: 'stacja paliw benzyna fuel petrol station',
  ubrania: 'ubrania odzież clothes',
  urzad: 'urząd poczta komisariat office post police',
  kosciol: 'kościół kaplica church',
  sklep: 'sklep shop',
  ogrodnik: 'ogrodnik kwiaciarnia garden centre florist',
  garaz: 'garaże garages',
  hala: 'hala magazyn warehouse',
};

const nazwaMiejsca = (kat: string): string => tr(nazwaKategorii(kat));

// ---------------------------------------------------------------- artykuły o kategoriach

function artykulMiejsca(kat: string): Def {
  return def(
    `miejsce:${kat}`,
    'miasto',
    () => nazwaMiejsca(kat),
    (c): Tresc => {
      const nazwa = nazwaMiejsca(kat);
      const glowne = lupWiersze(kat).map(([k]) => lupNazwa(k));
      const r = (odl: number) => celKategorii(kat, odl).ryzyko;
      const najwyzsze = KATEGORIE_MIEJSC.every((k) => POICAT[k].risk <= POICAT[kat].risk);
      const najnizsze = KATEGORIE_MIEJSC.every((k) => POICAT[k].risk >= POICAT[kat].risk);
      const osm = OSM[kat];
      const zdania = [
        L(
          `Kategoria ${wCyt(nazwa)} to cel wypraw po ${listaI(glowne)}.`,
          `The ${wCyt(nazwa)} kind is a target for supply runs for ${listaI(glowne)}.`,
        ),
        L(
          `Na karcie miejsca stoi: ${wCyt(`Zwykle jest tu: ${lupTekst(kat)}.`)} (łup na jedną wyprawę, w jednostkach zapasów ${c.words.zarzad.dk}).`,
          `The place card says: ${wCyt(`Usually here: ${lupTekst(kat)}.`)} (loot per supply run, in the units of ${c.e.krotko}’s stock).`,
        ),
        L(
          `Ryzyko bazowe wynosi ${ryzykoTekst(POICAT[kat].risk)}, a z odległością rośnie: na ${odleglosc(BLISKO_DO_M)} jest ${ryzykoTekst(r(BLISKO_DO_M))} (${wCyt(slowem(r(BLISKO_DO_M)))}), na ${odleglosc(MAX_OKOLICA_M)} ${ryzykoTekst(r(MAX_OKOLICA_M))} (${wCyt(slowem(r(MAX_OKOLICA_M)))}).`,
          `The base risk is ${ryzykoTekst(POICAT[kat].risk)} and it grows with distance: at ${odleglosc(BLISKO_DO_M)} it is ${ryzykoTekst(r(BLISKO_DO_M))} (${wCyt(slowem(r(BLISKO_DO_M)))}), at ${odleglosc(MAX_OKOLICA_M)} ${ryzykoTekst(r(MAX_OKOLICA_M))} (${wCyt(slowem(r(MAX_OKOLICA_M)))}).`,
        ),
        osm
          ? L(`Należą tu ${osm[0]}.`, `This covers ${osm[1]}.`)
          : L(
              'Ta kategoria jest w tabeli miejsc, ale żaden punkt z OpenStreetMap jej dziś nie dostaje, więc na mapie miasta jej nie zobaczycie.',
              'This category is in the table of places, but no OpenStreetMap point gets it today, so you will not see it on the city map.',
            ),
        ...(najwyzsze
          ? [
              L(
                'Ma najwyższe ryzyko bazowe ze wszystkich kategorii.',
                'It has the highest base risk of all the categories.',
              ),
            ]
          : najnizsze
            ? [
                L(
                  'Ma najniższe ryzyko bazowe ze wszystkich kategorii.',
                  'It has the lowest base risk of all the categories.',
                ),
              ]
            : []),
      ];
      return {
        zdania,
        fakty: [
          fakt('ryzyko-bazowe', L('Ryzyko bazowe', 'Base risk'), ryzykoTekst(POICAT[kat].risk)),
          ...[PROMIEN_MAPY_LOKALNEJ, BLISKO_DO_M, MAX_OKOLICA_M, MAX_DROGA_M].map((odl) =>
            fakt(
              `ryzyko-${odl}`,
              L(`Ryzyko na ${odleglosc(odl)}`, `Risk at ${odleglosc(odl)}`),
              `${ryzykoTekst(r(odl))} (${slowem(r(odl))})`,
            ),
          ),
          ...lupWiersze(kat).map(([k, przedzial]) =>
            fakt(`lup-${k}`, L(`Łup: ${lupNazwa(k)}`, `Loot: ${lupNazwa(k)}`), zakres(przedzial)),
          ),
          fakt(
            'powrot',
            L('Powrót z karty nocy', 'Return on the Night orders'),
            L(
              `${celKategorii(kat, BLISKO_DO_M).powrot}:00 do ${odleglosc(BLISKO_DO_M)}, dalej ${celKategorii(kat, BLISKO_DO_M + 1).powrot}:00`,
              `${celKategorii(kat, BLISKO_DO_M).powrot}:00 up to ${odleglosc(BLISKO_DO_M)}, ${celKategorii(kat, BLISKO_DO_M + 1).powrot}:00 further out`,
            ),
          ),
        ],
        jak: [
          L(
            `${wielka(kliknijcie(c))} znak tej kategorii na mapie miasta i ${cyt('Wyślij wyprawę', 'Send a supply run')}.`,
            `${wielka(kliknijcie(c))} a sign of this kind on the city map and pick ${cyt('Wyślij wyprawę', 'Send a supply run')}.`,
          ),
        ],
        zobacz: [
          'miasto:mapa',
          'miasto:wyprawa',
          'miasto:lup',
          'miasto:ryzyko',
          ...(kat === 'apteka' || kat === 'przychodnia' ? ['zasob:leki'] : []),
          ...(kat === 'spozywczy' || kat === 'ogrodnik' ? ['zasob:jedzenie'] : []),
          ...(kat === 'budowlany' || kat === 'garaz' || kat === 'hala' ? ['zasob:zlom', 'zasob:czesci'] : []),
        ],
      };
    },
    `${SLOWA_KATEGORII[kat]} miejsce wyprawa place supply run`,
  );
}

// ---------------------------------------------------------------- artykuły ogólne

export function definicjeMiasto(): Def[] {
  return [
    def(
      'miasto:mapa',
      'miasto',
      () => L('Mapa miasta', 'The city map'),
      (c): Tresc => ({
        zdania: [
          L(
            `Przycisk „Mapa miasta” u góry${c.touch ? '' : ' (klawisz M)'} otwiera mapę okolicy ze sklepami i usługami z OpenStreetMap, które są celami wypraw.`,
            `The “City map” button at the top${c.touch ? '' : ' (the M key)'} opens a map of the surroundings with the shops and services from OpenStreetMap that are targets for supply runs.`,
          ),
          c.touch
            ? L(
                'Jeden palec przesuwa mapę, dwa ją przybliżają, a stuknięcie w znak pokazuje kartę miejsca.',
                'One finger moves the map, two fingers zoom it, and tapping a sign shows the place card.',
              )
            : L(
                'Przeciąganie przesuwa mapę, kółko ją przybliża, a kliknięcie znaku pokazuje kartę miejsca.',
                'Dragging moves the map, the wheel zooms it, and clicking a sign shows the place card.',
              ),
          L(
            `Koło wokół siedziby (${odleglosc(PROMIEN_MAPY_LOKALNEJ)}) to ${c.dom ? 'mapa ulicy' : 'mapa osiedla'}: miejsca w nim są przygaszone, bo tam chodzi się pieszo i nie są celami wypraw.`,
            `The circle around the HQ (${odleglosc(PROMIEN_MAPY_LOKALNEJ)}) is ${c.dom ? 'your street map' : 'the estate map'}: places in it are dimmed, because you walk there and they are not targets for supply runs.`,
          ),
          L(
            'Karta miejsca podaje odległość i czas drogi, ryzyko słowem, co tam zwykle jest, ile zostało i kiedy byliście tu ostatnio, a „Wyślij wyprawę” jest wyszarzone, gdy wyprawa nie wyjdzie.',
            'The place card gives the distance and walking time, the risk in a word, what is usually there, how much is left and when you were last there, and “Send a supply run” is greyed out when a run cannot leave.',
          ),
          L(
            'Mała mapa w prawym dolnym rogu (na wąskim ekranie jej nie ma) otwiera tę samą mapę, a w stopce okna zawsze stoi atrybucja: współtwórcy OpenStreetMap, OpenFreeMap i OpenMapTiles.',
            'The small map in the bottom right corner (there is none on a narrow screen) opens the same map, and the window footer always carries the credit: OpenStreetMap contributors, OpenFreeMap and OpenMapTiles.',
          ),
        ],
        fakty: [
          fakt(
            'osiedle',
            c.dom
              ? L('Mapa ulicy (promień)', 'Street map (radius)')
              : L('Mapa osiedla (promień)', 'Estate map (radius)'),
            odleglosc(PROMIEN_MAPY_LOKALNEJ),
          ),
          fakt(
            'najdalej',
            L('Najdalszy cel wyprawy dziennej', 'Farthest target for a day run'),
            odleglosc(MAX_DROGA_M),
          ),
          fakt(
            'okolica',
            L('Zasięg propozycji na karcie nocy', 'Range of the Night orders’ suggestions'),
            odleglosc(MAX_OKOLICA_M),
          ),
          fakt('kategorie', L('Rodzajów miejsc', 'Kinds of places'), `${KATEGORIE_MIEJSC.length}`),
        ],
        jak: [
          L(
            `${wielka(kliknijcie(c))} ${cyt('Mapa miasta', 'City map')} u góry albo ${c.touch ? 'przycisk „Mapa” na wąskim ekranie' : 'wciśnijcie M'}.`,
            `${wielka(kliknijcie(c))} ${cyt('Mapa miasta', 'City map')} at the top or ${c.touch ? 'the “Map” button on a narrow screen' : 'press M'}.`,
          ),
        ],
        zobacz: ['miasto:wyprawa', 'miasto:dzienna', 'miasto:lup', 'miasto:ryzyko', 'miejsce:sklep'],
      }),
      'mapa miasta minimapa sklepy punkty OpenStreetMap city map minimap shops places',
    ),

    def(
      'miasto:wyprawa',
      'miasto',
      () => L('Wyprawy po łup', 'Supply runs'),
      (c): Tresc => ({
        zdania: [
          L(
            `Wyprawa to wyjście kilku osób z ${c.words.zarzad.dk} do sklepu albo usługi poza ${c.dom ? 'waszą ulicą' : 'osiedlem'} po ${listaI([LOOT.supplies, LOOT.meds, LOOT.parts, LOOT.scrap, LOOT.wood].map((t) => tr(t)))}.`,
            `A supply run is a trip by a few people from ${c.e.krotko} to a shop or service beyond ${c.dom ? 'your street' : 'the estate'} for ${listaI([LOOT.supplies, LOOT.meds, LOOT.parts, LOOT.scrap, LOOT.wood].map((t) => tr(t)))}.`,
          ),
          L(
            'Wysyłacie ją na dwa sposoby: za dnia z mapy miasta albo w nocy z karty nocy, wybierając „Wyprawa blisko” albo „Wyprawa daleko”.',
            'You send one in two ways: by day from the city map, or at night from the Night orders by picking “Short run” or “Long run”.',
          ),
          L(
            'Wyprawa wraca z łupem z przedziału miejsca, a po drodze mogą się zdarzyć kłopoty, które obcinają łup o połowę i ranią kogoś z wyprawy.',
            'A run comes back with loot from the place’s range, and on the way trouble may strike, which halves the loot and hurts someone on the run.',
          ),
          L(
            `W miejscu jest skończony zapas łupu, a jedna osoba unosi najwyżej ${UDZWIG_NA_OSOBE} sztuk.`,
            `A place holds a limited stock of loot, and one person carries at most ${UDZWIG_NA_OSOBE} pieces.`,
          ),
          L(
            'Po powrocie ludzie są zmęczeni, daleka wyprawa bardziej niż bliska, a łup poprawia ich nastrój i podnosi zaufanie o 1.',
            'People come back tired, more after a long run than a short one, and loot lifts their mood and raises trust by 1.',
          ),
        ],
        uwaga: uwagaZombie(
          c,
          'kłopoty na wyprawie to szwendacze, ryzyko jest wyższe, a ranny może wrócić ugryziony.',
          'trouble on a run means shamblers, the risk is higher, and a hurt person may come back bitten.',
        ),
        fakty: [
          fakt(
            'udzwig',
            L('Udźwig jednej osoby', 'One person carries'),
            L(`${UDZWIG_NA_OSOBE} szt.`, `${UDZWIG_NA_OSOBE} pieces`),
          ),
          fakt('dzienna', L('Wyprawa z mapy wychodzi', 'A run from the map leaves'), `${MORNING}:00–${CARD_HOUR}:00`),
          fakt(
            'powrot-blisko',
            L('Wyprawa blisko z karty nocy wraca o', 'A short run from the Night orders returns at'),
            `${celKategorii('sklep', BLISKO_DO_M).powrot}:00`,
          ),
          fakt(
            'powrot-daleko',
            L('Wyprawa daleko z karty nocy wraca o', 'A long run from the Night orders returns at'),
            `${celKategorii('sklep', BLISKO_DO_M + 1).powrot}:00`,
          ),
        ],
        zobacz: [
          'miasto:mapa',
          'miasto:dzienna',
          'miasto:nocna',
          'miasto:droga',
          'miasto:ryzyko',
          'miasto:lup',
          'zasob:jedzenie',
          'zasob:leki',
        ],
      }),
      'wyprawa szaber łup wyjście za bramę supply run loot expedition scavenging',
    ),

    def(
      'miasto:dzienna',
      'miasto',
      () => L('Wyprawa z mapy miasta', 'A run from the city map'),
      (c): Tresc => {
        const p = powodyOdmowy(c.place);
        return {
          zdania: [
            L(
              `Kliknijcie miejsce na mapie miasta i ${cyt('Wyślij wyprawę', 'Send a supply run')}, wybierzcie osoby z ${c.words.zarzad.dk} i potwierdźcie: okno planu pokazuje czas, powrót, ryzyko, ile uniosą i ile zostało w miejscu.`,
              `Click a place on the city map and ${cyt('Wyślij wyprawę', 'Send a supply run')}, pick people from ${c.e.krotko} and confirm: the plan window shows the time, the return, the risk, how much they can carry and how much is left in the place.`,
            ),
            L(
              `Po zmroku okno planu odmawia słowami ${wCyt(p.noc)}, więc wyprawę wysyła się za dnia, między ${MORNING}:00 a ${CARD_HOUR}:00.`,
              `After dark the plan window refuses with ${wCyt(p.noc)}, so runs are sent by day, between ${MORNING}:00 and ${CARD_HOUR}:00.`,
            ),
            L(
              `Odmowa pada też z powodów miejsca, na przykład ${wCyt(p.daleko)}, ${wCyt(p.cna)} albo ${wCyt(p.osiedle)}, i wtedy trzeba wybrać inne miejsce.`,
              `A run is also refused for reasons of the place, such as ${wCyt(p.daleko)}, ${wCyt(p.cna)} or ${wCyt(p.osiedle)}, and then you pick another place.`,
            ),
            L(
              'Nie wyjdzie ugryziony ani ten, kto nie ma sił na taką drogę, ani ten, kto jest już na wyprawie, a do jednego miejsca nie idą dwie wyprawy naraz.',
              'Nobody who is bitten, too worn out for the walk or already out on a run can go, and two runs do not go to the same place at once.',
            ),
            L(
              'Powrót po 20:00 przesuwa się na 6:00 następnego dnia, a o powrocie gra pisze w kronice i w komunikacie.',
              'A return after 20:00 moves to 6:00 the next day, and the game reports the return in the chronicle and in a message.',
            ),
          ],
          fakty: [
            fakt(
              'godziny',
              L('Wyprawa wychodzi między', 'A run leaves between'),
              L(`${MORNING}:00 i ${CARD_HOUR}:00`, `${MORNING}:00 and ${CARD_HOUR}:00`),
            ),
            fakt('najdalej', L('Najdalej od adresu', 'Farthest from the address'), odleglosc(MAX_DROGA_M)),
            fakt('osiedle', L('Miejsca bliżej niż', 'Places closer than'), odleglosc(PROMIEN_MAPY_LOKALNEJ)),
          ],
          jak: [
            L(
              `Otwórzcie mapę miasta i ${c.touch ? 'stuknijcie' : 'kliknijcie'} znak miejsca, potem ${cyt('Wyślij wyprawę', 'Send a supply run')}.`,
              `Open the city map and ${c.touch ? 'tap' : 'click'} a sign, then ${cyt('Wyślij wyprawę', 'Send a supply run')}.`,
            ),
            L(
              `W oknie planu wybierzcie osoby i potwierdźcie tym samym przyciskiem ${cyt('Wyślij wyprawę', 'Send a supply run')}.`,
              `In the plan window pick the people and confirm with the same ${cyt('Wyślij wyprawę', 'Send a supply run')} button.`,
            ),
          ],
          zobacz: ['miasto:mapa', 'miasto:droga', 'miasto:ryzyko', 'miasto:lup', 'miasto:nocna'],
        };
      },
      'wyprawa dzienna wyślij plan okno mapa daily run send plan window',
    ),

    def(
      'miasto:nocna',
      'miasto',
      () => L('Wyprawy z karty nocy', 'Runs from the Night orders'),
      (c): Tresc => ({
        zdania: [
          L(
            'Na karcie nocy każda osoba ma wśród opcji „Wyprawa blisko” i „Wyprawa daleko” z nazwą miejsca i odległością.',
            'On the Night orders each person has a “Short run” and a “Long run” among the options, with the name of the place and its distance.',
          ),
          L(
            `„Blisko” to najbliższe niewybrane do cna miejsce spoza ${c.dom ? 'mapy ulicy' : 'mapy osiedla'} do ${odleglosc(BLISKO_DO_M)} (a gdy go nie ma, po prostu najbliższe), a „daleko” to inne miejsce do ${odleglosc(MAX_OKOLICA_M)}, które najlepiej załata braki jedzenia, leków i części.`,
            `“Short” is the nearest place outside ${c.dom ? 'your street map' : 'the estate map'} up to ${odleglosc(BLISKO_DO_M)} that is not picked clean (or simply the nearest one if there is none), and “long” is another place up to ${odleglosc(MAX_OKOLICA_M)} that best makes up for the shortage of food, meds and parts.`,
          ),
          L(
            `Bliska wyprawa wraca o ${celKategorii('sklep', BLISKO_DO_M).powrot}:00, daleka o ${celKategorii('sklep', BLISKO_DO_M + 1).powrot}:00, a do dalekiej trzeba więcej sił i zdrowia.`,
            `A short run returns at ${celKategorii('sklep', BLISKO_DO_M).powrot}:00, a long one at ${celKategorii('sklep', BLISKO_DO_M + 1).powrot}:00, and a long run needs more strength and health.`,
          ),
          L(
            'Gdy mapa miasta nie ma żadnego miejsca do zaproponowania albo jej nie włączono, karta proponuje zmyślone cele z krótkiej listy.',
            'When the city map has nothing to suggest, or it is not switched on, the Night orders offer made-up targets from a short list.',
          ),
          L(
            'Cele z tej listy nie wyczerpują się, ale z każdą wizytą dają coraz mniej łupu.',
            'Targets from that list never run out, but they give less loot with every visit.',
          ),
        ],
        uwaga: uwagaZombie(
          c,
          'po pierwszej nocy karta nie proponuje wypraw, bo wyprawa wróciłaby w stado pod siatką, ale nadal można je wybrać ręcznie.',
          'after the first night the Night orders no longer suggest runs, because a run would come back into the herd at the fence, but you can still pick one by hand.',
        ),
        fakty: [
          fakt('blisko', L('„Blisko” do', '“Short” up to'), odleglosc(BLISKO_DO_M)),
          fakt('okolica', L('Propozycje do', 'Suggestions up to'), odleglosc(MAX_OKOLICA_M)),
          fakt(
            'powrot-blisko',
            L('Powrót wyprawy blisko', 'Return of a short run'),
            `${celKategorii('sklep', BLISKO_DO_M).powrot}:00`,
          ),
          fakt(
            'powrot-daleko',
            L('Powrót wyprawy daleko', 'Return of a long run'),
            `${celKategorii('sklep', BLISKO_DO_M + 1).powrot}:00`,
          ),
          ...TARGETS.map((t) =>
            fakt(
              `cel-${t.id}`,
              wielka(tr(targetNameTx(t, c.place))),
              L(
                `${t.range}, ryzyko ${ryzykoTekst(t.risk)}, powrót ${t.back}:00`,
                `${t.range === 'daleko' ? 'long' : 'short'}, risk ${ryzykoTekst(t.risk)}, back ${t.back}:00`,
              ),
            ),
          ),
        ],
        zobacz: ['miasto:wyprawa', 'miasto:droga', 'miasto:ryzyko', 'miasto:lup', 'noc:napad'],
      }),
      'wyprawa nocna karta nocy blisko daleko night orders short run long run',
    ),

    def(
      'miasto:droga',
      'miasto',
      () => L('Droga i czas wyprawy', 'Distance and time of a run'),
      (): Tresc => {
        const kmh = (METROW_NA_MIN * 60) / 1000;
        return {
          zdania: [
            L(
              `Droga liczy się w linii prostej od adresu, powiększonej ${num(KRZYWIZNA_ULIC, 1)} raza na kręte ulice, przy marszu ${num(kmh, 0)} km/h.`,
              `The way is measured in a straight line from the address, multiplied by ${num(KRZYWIZNA_ULIC, 1)} for winding streets, at a walking pace of ${num(kmh, 0)} km/h.`,
            ),
            L(
              `Przeszukanie zajmuje jednej osobie ${czas(PRZESZUKANIE_MIN)}, każda następna skraca je o ${czas(PRZESZUKANIE_KROK_MIN)}, a najkrócej trwa ${czas(PRZESZUKANIE_NAJKROCEJ_MIN)}.`,
              `Searching takes one person ${czas(PRZESZUKANIE_MIN)}, each additional person shortens it by ${czas(PRZESZUKANIE_KROK_MIN)}, and the shortest it gets is ${czas(PRZESZUKANIE_NAJKROCEJ_MIN)}.`,
            ),
            L(
              'Cała wyprawa to droga tam i z powrotem plus przeszukanie, więc na dalekie miejsce opłaca się wysłać kilka osób.',
              'The whole run is the walk there and back plus the search, so for a far place it pays to send several people.',
            ),
            L(
              `Wyprawa, która wróciłaby po ${CARD_HOUR}:00, wraca dopiero o ${MORNING}:00 następnego dnia.`,
              `A run that would return after ${CARD_HOUR}:00 comes back only at ${MORNING}:00 the next day.`,
            ),
            L(
              `Dalej niż ${odleglosc(MAX_DROGA_M)} od adresu wyprawa dzienna nie wyjdzie.`,
              `A day run does not leave for anything farther than ${odleglosc(MAX_DROGA_M)} from the address.`,
            ),
          ],
          fakty: [
            fakt('krzywizna', L('Ulice są dłuższe razy', 'Streets are longer by a factor of'), num(KRZYWIZNA_ULIC, 1)),
            fakt('tempo', L('Marsz', 'Walking pace'), `${num(kmh, 0)} km/h`),
            fakt('szukanie-1', L('Przeszukanie, jedna osoba', 'Search, one person'), czas(czasWyprawyMin(0, 1))),
            fakt('szukanie-3', L('Przeszukanie, trzy osoby', 'Search, three people'), czas(czasWyprawyMin(0, 3))),
            ...ODLEGLOSCI.map((odl) =>
              fakt(
                `wyprawa-${odl}`,
                L(`Cała wyprawa na ${odleglosc(odl)}`, `The whole run to ${odleglosc(odl)}`),
                L(
                  `${czas(czasWyprawyMin(odl, 1))} (1 osoba), ${czas(czasWyprawyMin(odl, 3))} (3 osoby)`,
                  `${czas(czasWyprawyMin(odl, 1))} (1 person), ${czas(czasWyprawyMin(odl, 3))} (3 people)`,
                ),
              ),
            ),
            fakt('najdalej', L('Najdalszy cel dzienny', 'Farthest day target'), odleglosc(MAX_DROGA_M)),
          ],
          zobacz: ['miasto:wyprawa', 'miasto:dzienna', 'miasto:ryzyko'],
        };
      },
      'droga czas odległość marsz przeszukanie distance time walking search',
    ),

    def(
      'miasto:ryzyko',
      'miasto',
      () => L('Ryzyko wyprawy', 'Risk of a run'),
      (c): Tresc => {
        const [niepewnie, grozno] = progiRyzyka();
        return {
          zdania: [
            L(
              `Ryzyko miejsca to jego ryzyko bazowe razy (1 + odległość / ${num(RYZYKO_ODL_M, 0)} m), więc rośnie z odległością.`,
              `The risk of a place is its base risk times (1 + distance / ${num(RYZYKO_ODL_M, 0)} m), so it grows with distance.`,
            ),
            L(
              `Karta pokazuje je słowem: poniżej ${num(niepewnie, 2)} „${tr(ryzykoSlowem(0))}”, poniżej ${num(grozno, 2)} „${tr(ryzykoSlowem(niepewnie))}”, od ${num(grozno, 2)} „${tr(ryzykoSlowem(grozno))}”.`,
              `The card shows it as a word: below ${num(niepewnie, 2)} “${tr(ryzykoSlowem(0))}”, below ${num(grozno, 2)} “${tr(ryzykoSlowem(niepewnie))}”, from ${num(grozno, 2)} “${tr(ryzykoSlowem(grozno))}”.`,
            ),
            L(
              'Szansa kłopotów zależy od osoby: rośnie, gdy jest zmęczona, ranna albo tchórzliwa, a maleje, gdy jest odważna, umie się bronić, ma broń albo idzie w grupie.',
              'The chance of trouble depends on the person: it rises when they are tired, hurt or cowardly, and falls when they are brave, can fight, carry a weapon or go in a group.',
            ),
            L(
              'Kłopoty obcinają łup o połowę, ranią jedną osobę z wyprawy, a wszyscy wracają przestraszeni.',
              'Trouble halves the loot, hurts one person on the run, and everybody comes back shaken.',
            ),
            L(
              `Wskazówka od gościa na dane miejsce zmniejsza ryzyko do ${proc(WSKAZOWKA_RYZYKO)} i zwiększa łup do ${proc(WSKAZOWKA_LUP)}, ale działa na jedną wyprawę.`,
              `A tip from a guest about a place cuts the risk to ${proc(WSKAZOWKA_RYZYKO)} and raises the loot to ${proc(WSKAZOWKA_LUP)}, but it works for one run only.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            'ryzyko wyprawy jest wyższe, a kłopoty to szwendacze, po których ranny może wrócić ugryziony.',
            'the risk of a run is higher, and trouble means shamblers, after which the hurt person may come back bitten.',
          ),
          fakty: [
            fakt(
              'wspolczynnik',
              L('Ryzyko = bazowe razy', 'Risk = base times'),
              L(`(1 + odległość / ${num(RYZYKO_ODL_M, 0)} m)`, `(1 + distance / ${num(RYZYKO_ODL_M, 0)} m)`),
            ),
            fakt('prog-niepewnie', L('„Niepewnie” od', '“Uncertain” from'), num(niepewnie, 2)),
            fakt('prog-grozno', L('„Groźnie” od', '“Dangerous” from'), num(grozno, 2)),
            fakt('wskazowka-ryzyko', L('Wskazówka: ryzyko razy', 'Tip: risk times'), num(WSKAZOWKA_RYZYKO, 1)),
            fakt('wskazowka-lup', L('Wskazówka: łup razy', 'Tip: loot times'), num(WSKAZOWKA_LUP, 1)),
            ...KATEGORIE_MIEJSC.filter((k) => !BEZ_PUNKTOW.has(k)).map((k) =>
              fakt(
                `bazowe-${k}`,
                L(`Ryzyko bazowe: ${nazwaMiejsca(k)}`, `Base risk: ${nazwaMiejsca(k)}`),
                ryzykoTekst(POICAT[k].risk),
              ),
            ),
          ],
          zobacz: ['miasto:wyprawa', 'miasto:droga', 'miasto:lup', 'wydarzenia:prosby', 'zombie:ugryzienie'],
        };
      },
      'ryzyko kłopoty niebezpieczeństwo szabrownicy szwendacze risk trouble danger',
    ),

    def(
      'miasto:lup',
      'miasto',
      () => L('Łup i zapas miejsca', 'Loot and the stock of a place'),
      (c): Tresc => ({
        zdania: [
          L(
            `Każda kategoria miejsc ma przedział łupu z tabeli gry, który gra mnoży przez ${num(SKALA_LUPU, 1)} na zapasy ${c.words.zarzad.dk}; na karcie miejsca to „Zwykle jest tu”.`,
            `Each kind of place has a loot range from the game’s table, which the game multiplies by ${num(SKALA_LUPU, 1)} for the stock of ${c.e.krotko}; on the place card it is “Usually here”.`,
          ),
          L(
            'Z wyprawy wraca się z losowym łupem z tego przedziału, a grupa przynosi więcej niż jedna osoba.',
            'A run comes back with random loot from that range, and a group brings more than one person.',
          ),
          L(
            `Miejsce ma skończony zapas: ${proc(PUSTE_MIEJSCA)} miejsc jest pustych od początku, a reszta ma zapas ${ZAPAS_MNOZNIK_OD}–${ZAPAS_MNOZNIK_OD + ZAPAS_MNOZNIK_ROZSTEP} razy większy niż średni łup, najwyżej ${ZAPAS_MAX}.`,
            `A place has a limited stock: ${proc(PUSTE_MIEJSCA)} of the places are empty from the start, and the rest hold ${ZAPAS_MNOZNIK_OD} to ${ZAPAS_MNOZNIK_OD + ZAPAS_MNOZNIK_ROZSTEP} times the average loot, at most ${ZAPAS_MAX}.`,
          ),
          L(
            'Zapas jest ten sam u każdego gracza w mieście, a wyniesione ubywa: karta mówi „Nietknięte”, „Ktoś tu był” albo „Wybrane do cna”.',
            'The stock is the same for every player in the city, and what has been carried off is gone: the card says “Untouched”, “Somebody has been here” or “Picked clean”.',
          ),
          L(
            `Jedna osoba unosi najwyżej ${UDZWIG_NA_OSOBE} sztuk, więc na bogate miejsce warto wysłać kilka osób; czasem wraca się też z amunicją albo bronią.`,
            `One person carries at most ${UDZWIG_NA_OSOBE} pieces, so for a rich place it pays to send several people; sometimes a run also brings back ammunition or a weapon.`,
          ),
        ],
        fakty: [
          fakt('skala', L('Łup z tabeli razy', 'Table loot times'), num(SKALA_LUPU, 1)),
          fakt('puste', L('Miejsc pustych od początku', 'Places empty from the start'), proc(PUSTE_MIEJSCA)),
          fakt(
            'zapas',
            L('Zapas miejsca (razy średni łup)', 'Stock of a place (times the average loot)'),
            `${ZAPAS_MNOZNIK_OD}–${ZAPAS_MNOZNIK_OD + ZAPAS_MNOZNIK_ROZSTEP}`,
          ),
          fakt('zapas-max', L('Zapas najwyżej', 'Stock at most'), `${ZAPAS_MAX}`),
          fakt(
            'udzwig',
            L('Udźwig jednej osoby', 'One person carries'),
            L(`${UDZWIG_NA_OSOBE} szt.`, `${UDZWIG_NA_OSOBE} pieces`),
          ),
          fakt('wskazowka', L('Wskazówka od gościa: łup razy', 'Tip from a guest: loot times'), num(WSKAZOWKA_LUP, 1)),
        ],
        zobacz: [
          'miasto:wyprawa',
          'miasto:ryzyko',
          'zasob:jedzenie',
          'zasob:leki',
          'zasob:zlom',
          'zasob:czesci',
          'zasob:drewno',
        ],
      }),
      'łup zapas wyczerpany wybrane do cna loot stock picked clean',
    ),

    ...KATEGORIE_MIEJSC.map(artykulMiejsca),
  ];
}
