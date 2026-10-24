/* Wiki w grze, kategoria „Sąsiedzi i wspólny płot”: sąsiednie budynki (karta, znani lokatorzy), stany drzwi i otwieranie,
   pukanie, wyważanie, przeszukiwanie pomieszczeń i pięter, spotkanie z lokatorami za drzwiami, wspólny płot (koszt, czas,
   najdłuższy płot, jeden plan naraz bez odwołania), przyłączony teren i nocni goście. Liczby biorą się z tabel gry
   (src/sim/sasiedzi.ts: czasy pracy przy drzwiach, `HALAS`, znani sąsiedzi, piętra, nocni goście, `kosztPlotu`, `PLOT_TICKS_M`,
   `szansaWalki`, `szansaPrzegonienia`; src/world/plot.ts: `PLOT_MAX`; src/sim/mieszkania.ts: `searchTicks`), a polecenia z menu,
   zdania gry i karta budynku z src/content/napisy-sasiedzi.ts (`MENU`, `BUDYNEK`, `KARTA`, `WYBOR`, `zdanie`), więc wiki mówi
   tymi samymi słowami co gra. Zasady są wspólne dla obu trybów; różnice trybu zombie (ocaleni, szwendacz za drzwiami, ukryte
   ugryzienie, nocni goście) opisują uwagi (`WikiCtx.zombie`). */

import { BUDYNEK, HALAS_ZOMBIE, KARTA, MENU, PO_POLECENIU, WYBOR, zdanie } from '../content/napisy-sasiedzi.ts';
import { L, tr } from '../core/jezyk.ts';
import type { Mat } from '../sim/budowle.ts';
import { searchTicks } from '../sim/mieszkania.ts';
import { PATCH_HP, REINFORCED_HP } from '../sim/perimeter.ts';
import {
  HALAS,
  kosztPlotu,
  LUP_MATS,
  NOC_BIORA,
  NOC_GOSC,
  NOC_GOSC_LUP,
  NOC_GOSC_ZOMBIE,
  NOC_POKOJE,
  NOC_ZOSTAJA,
  ODBIJANIE_TICKS,
  OTWIERANIE_TICKS,
  PIETRO_LUDZIE,
  PIETRO_SZWENDACZ,
  PIETRO_TICKS,
  PLOT_DESKI_DRZWI,
  PLOT_TICKS_M,
  PUKANIE_TICKS,
  szansaPrzegonienia,
  szansaWalki,
  UKRYTY_UGRYZIONY,
  WARIANTY_PLOTU,
  WYWAZ_KLATKA_TICKS,
  WYWAZ_MIESZKANIE_TICKS,
  ZABIJANIE_DESKI,
  ZABIJANIE_TICKS,
  ZNANI_BUDYNKI,
  ZNANI_M,
  ZOMBIE_PRZEZYLO,
  ZOMBIE_W_MIESZKANIU,
} from '../sim/sasiedzi.ts';
import { PLOT_MAX } from '../world/plot.ts';
import { num } from './tekst.ts';
import { czasTickow, listaI, polecenie, proc, wCyt } from './wiki-slowa.ts';
import { type Def, def, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';
import { matNazwa } from './wiki-zasoby.ts';

// ---------------------------------------------------------------- drobiazgi

const NB = ' ';

/** metry z jednostką (twarda spacja jak w wiki-slowa) */
const m = (v: number): string => `${num(v, v === Math.round(v) ? 0 : 1)}${NB}m`;

/** Uwaga o różnicy trybu zombie: w trybie zombie „Grasz w trybie zombie: …”, w zwykłym „W trybie zombie …” (zdanie `pl`/`en`
    musi pasować do obu początków, np. „szwendacz czeka …”). */
function uwagaZombie(c: WikiCtx, pl: string, en: string): string {
  return c.zombie
    ? L(`Grasz w trybie zombie: ${pl}`, `You are playing Zombie mode: ${en}`)
    : L(`W trybie zombie ${pl}`, `In Zombie mode ${en}`);
}

/** napis Tx bez nawiasu z końca („Zaprosić do nas (45% szans)” → „Zaprosić do nas”) */
const rdzen = (t: Parameters<typeof tr>[0]): string => tr(t).replace(/\s*\(.*\)$/, '');

/** zdanie gry z `zdanie()` w bieżącym języku, w cudzysłowie */
const cytatGry = (co: string): string => wCyt(tr(zdanie(co, {})));

/** nazwy stanów drzwi w kolejności typu `StanDrzwi` (jak karta budynku: „Drzwi na zewnątrz: 1 otwarte, 2 na klucz.”) */
export const STANY_DRZWI: readonly [string, string, string][] = [
  ['zamkniete', 'zamknięte', 'closed'],
  ['na_klucz', 'na klucz', 'locked'],
  ['otwarte', 'otwarte', 'open'],
  ['wywazone', 'wyważone', 'forced'],
  ['zabite', 'zabite deskami', 'nailed shut'],
];

/** koszt jako „deski 12, złom 10” w bieżącym języku */
const kosztTekst = (need: Partial<Record<Mat, number>>): string =>
  (Object.entries(need) as [Mat, number][]).map(([mat, n]) => `${matNazwa(mat)} ${n}`).join(', ');

/** Płot do przykładu w faktach: 10 m nowej siatki i jedne drzwi do zabicia deskami. */
export const PRZYKLAD_PLOTU = { dlugosc: 10, zabic: [0] };

const WARIANT_NAZWA: Record<(typeof WARIANTY_PLOTU)[number], [string, string]> = {
  mieszany: ['deska i złom', 'planks and scrap'],
  deski: ['same deski', 'planks only'],
  zlom: ['sam złom', 'scrap only'],
};

/** ile sztuk materiału na metr płotu z jednego materiału (2) i z dwóch (po jednej) */
const NA_METR = kosztPlotu({ dlugosc: 1, zabic: [] }, 'deski').need.deski ?? 0;

// ---------------------------------------------------------------- artykuły

export function definicjeSasiedzi(): Def[] {
  return [
    def(
      'sasiedzi:budynki',
      'sasiedzi',
      () => L('Sąsiednie budynki', 'Neighbouring buildings'),
      (c): Tresc => ({
        zdania: [
          L(
            'Budynki wokół siedziby można odwiedzać: przy cudzych drzwiach otwieracie, pukacie albo wyważacie, w środku przeszukujecie pomieszczenia i rozmawiacie z lokatorami.',
            'You can visit the buildings around the HQ: at someone else’s door you open, knock or force it, inside you search rooms and talk to the people who live there.',
          ),
          c.touch
            ? L(
                'Stuknięcie w cudzy budynek, gdy nikt nie jest zaznaczony, pokazuje jego kartę: rodzaj i wysokość, znajomych lokatorów, drzwi na zewnątrz i ile pomieszczeń już przeszukano.',
                'Tapping someone else’s building while nobody is selected shows its card: the kind and height, the people you know, the outside doors and how many rooms have been searched.',
              )
            : L(
                'Kliknięcie w cudzy budynek, gdy nikt nie jest zaznaczony, pokazuje jego kartę: rodzaj i wysokość, znajomych lokatorów, drzwi na zewnątrz i ile pomieszczeń już przeszukano.',
                'Clicking someone else’s building while nobody is selected shows its card: the kind and height, the people you know, the outside doors and how many rooms have been searched.',
              ),
          L(
            `Z widzenia znacie lokatorów ${ZNANI_BUDYNKI} najbliższych budynków mieszkalnych w promieniu ${m(ZNANI_M)} od drzwi siedziby, a reszty nie.`,
            `You know by sight the people in the ${ZNANI_BUDYNKI} nearest residential buildings within ${m(ZNANI_M)} of the HQ door, and nobody else.`,
          ),
          L(
            'Czego nie widzieliście, tego karta nie zdradza: wnętrze budynku i stan lokatorów poznajecie dopiero przy drzwiach.',
            'The card does not give away what you have not seen: you learn the inside of a building and the state of its people only at the door.',
          ),
          L(
            'Otwarty budynek, którego nie otoczycie wspólnym płotem, odwiedzają nocą obcy.',
            'An open building you do not put inside a shared fence is visited by strangers at night.',
          ),
        ],
        uwaga: uwagaZombie(
          c,
          `nikogo nie znacie z widzenia, przeżywa ${proc(ZOMBIE_PRZEZYLO)} gospodarstw, reszta mieszkań stoi pusta, a w ${proc(ZOMBIE_W_MIESZKANIU)} takich mieszkań czeka szwendacz.`,
          `you know nobody by sight, ${proc(ZOMBIE_PRZEZYLO)} of the households survive, the rest of the flats stand empty, and in ${proc(ZOMBIE_W_MIESZKANIU)} of those a shambler waits.`,
        ),
        fakty: [
          fakt(
            'znani',
            L('Znani sąsiedzi', 'Neighbours you know'),
            L(`${ZNANI_BUDYNKI} budynki`, `${ZNANI_BUDYNKI} buildings`),
          ),
          fakt('promien', L('Znani w promieniu', 'Known within'), m(ZNANI_M)),
          fakt('stany', L('Stany drzwi', 'Door states'), STANY_DRZWI.map(([, pl, en]) => L(pl, en)).join(', ')),
        ],
        jak: [tr(BUDYNEK.jak(c.touch))],
        zobacz: ['sasiedzi:drzwi', 'sasiedzi:przeszukiwanie', 'sasiedzi:lokatorzy', 'sasiedzi:plot', 'sasiedzi:noc'],
      }),
      'budynek sąsiad lokator karta building neighbour resident card',
    ),

    def(
      'sasiedzi:drzwi',
      'sasiedzi',
      () => L('Drzwi sąsiadów', 'Neighbours’ doors'),
      (c): Tresc => ({
        zdania: [
          L(
            `Drzwi w cudzym budynku są w jednym z pięciu stanów: ${listaI(STANY_DRZWI.map(([, pl]) => pl))}.`,
            `A door in someone else’s building is in one of five states: ${listaI(STANY_DRZWI.map(([, , en]) => en))}.`,
          ),
          L(
            `Zamknięte drzwi próbujecie otworzyć klamką (${czasTickow(OTWIERANIE_TICKS)}), a jeśli są na klucz, gra mówi: ${cytatGry('na_klucz')}`,
            `You try a closed door by the handle (${czasTickow(OTWIERANIE_TICKS)}), and if it is locked the game says: ${cytatGry('na_klucz')}`,
          ),
          L(
            'W zamieszkanych budynkach większość drzwi jest na klucz, w trybie zombie wszystkie, a w pustych część jest już wyważona.',
            'In inhabited buildings most doors are locked, in Zombie mode all of them, and in empty ones some are already forced.',
          ),
          L(
            `Drzwi od ulicy budynku, który stoi przy waszym podwórku, są zawsze na klucz, a menu dopisuje przy nich ${wCyt(tr(MENU.wylom).replace(/^\s*\(|\)\s*$/g, ''))}.`,
            `The street door of a building that stands next to your yard is always locked, and the menu adds ${wCyt(tr(MENU.wylom).replace(/^\s*\(|\)\s*$/g, ''))} next to it.`,
          ),
          L(
            `Otwarte albo wyważone drzwi budynku można zabić deskami (${ZABIJANIE_DESKI} deski, ${czasTickow(ZABIJANIE_TICKS)}) i odbić (${czasTickow(ODBIJANIE_TICKS)}).`,
            `You can nail an open or forced building door shut (${ZABIJANIE_DESKI} planks, ${czasTickow(ZABIJANIE_TICKS)}) and pull the planks off (${czasTickow(ODBIJANIE_TICKS)}).`,
          ),
        ],
        fakty: [
          fakt('otwieranie', L('Otwieranie klamką', 'Trying the handle'), czasTickow(OTWIERANIE_TICKS)),
          fakt('otwieranie-halas', L('Hałas otwierania', 'Noise of opening'), m(HALAS.otwieranie)),
          fakt('zabijanie', L('Zabijanie deskami', 'Nailing shut'), czasTickow(ZABIJANIE_TICKS)),
          fakt(
            'zabijanie-deski',
            L('Deski na drzwi', 'Planks per door'),
            L(`${ZABIJANIE_DESKI} szt.`, `${ZABIJANIE_DESKI} pieces`),
          ),
          fakt('zabijanie-halas', L('Hałas zabijania', 'Noise of nailing'), m(HALAS.deski)),
          fakt('odbijanie', L('Odbijanie desek', 'Pulling the planks off'), czasTickow(ODBIJANIE_TICKS)),
          fakt('odbijanie-halas', L('Hałas odbijania', 'Noise of pulling off'), m(HALAS.odbijanie)),
        ],
        jak: [
          polecenie(c, ['cudzych drzwiach', 'someone else’s door'], [MENU.otworz.pl, MENU.otworz.en]),
          polecenie(c, ['otwartych drzwiach budynku', 'an open building door'], [MENU.zabij.pl, MENU.zabij.en]),
        ],
        zobacz: ['sasiedzi:pukanie', 'sasiedzi:wywazanie', 'sasiedzi:budynki', 'zasob:deski'],
      }),
      'drzwi zamek klucz otworzyć klamka door lock open nail boards',
    ),

    def(
      'sasiedzi:pukanie',
      'sasiedzi',
      () => L('Pukanie do drzwi', 'Knocking'),
      (c): Tresc => ({
        zdania: [
          L(
            `Pukanie trwa ${czasTickow(PUKANIE_TICKS)} i słychać je na ${m(HALAS.pukanie)}, a pukać można tylko do zamkniętych drzwi budynku mieszkalnego.`,
            `Knocking takes ${czasTickow(PUKANIE_TICKS)} and can be heard ${m(HALAS.pukanie)} away, and you can only knock on closed doors of a residential building.`,
          ),
          L(
            'Jeśli ktoś jest w domu, może otworzyć i zaczyna się spotkanie: chętniej otwierają życzliwi i zdesperowani, rzadziej nieufni i wrodzy.',
            'If someone is at home they may open up and a meeting begins: friendly and desperate people open more readily, wary and hostile ones less.',
          ),
          L(
            'Nieufni otwierają rzadziej nocą, a w trybie zombie rzadziej otwierają wszyscy.',
            'Wary people open less often at night, and in Zombie mode everybody opens less often.',
          ),
          L(
            `Gdy nikt nie otwiera, gra mówi ${cytatGry('nikt')} albo ${cytatGry('ktos')}`,
            `When nobody opens, the game says ${cytatGry('nikt')} or ${cytatGry('ktos')}`,
          ),
          L(
            'W odróżnieniu od wyważania pukanie nie psuje stosunków z lokatorami, a pukający czeka potem przy drzwiach, żeby zapukać jeszcze raz albo wyważyć.',
            'Unlike forcing a door, knocking does not sour relations with the residents, and whoever knocked then waits by the door to knock again or force it.',
          ),
        ],
        uwaga: uwagaZombie(
          c,
          `przy mieszkaniu ze szwendaczem zamiast ciszy słychać szuranie: ${cytatGry('szuranie')}`,
          `at a flat with a shambler in it you hear shuffling instead of silence: ${cytatGry('szuranie')}`,
        ),
        fakty: [
          fakt('czas', L('Pukanie trwa', 'Knocking takes'), czasTickow(PUKANIE_TICKS)),
          fakt('halas', L('Hałas pukania', 'Noise of knocking'), m(HALAS.pukanie)),
        ],
        jak: [
          polecenie(c, ['cudzych drzwiach', 'someone else’s door'], [MENU.zapukaj.pl, MENU.zapukaj.en]),
          L(
            `Przy drzwiach mieszkania menu mówi ${wCyt(MENU.zapukajMieszkanie.pl)}.`,
            `At a flat door the menu says ${wCyt(MENU.zapukajMieszkanie.en)}.`,
          ),
        ],
        zobacz: ['sasiedzi:lokatorzy', 'sasiedzi:wywazanie', 'sasiedzi:drzwi'],
      }),
      'pukanie pukać lokator drzwi knock door residents',
    ),

    def(
      'sasiedzi:wywazanie',
      'sasiedzi',
      () => L('Wyważanie drzwi', 'Forcing a door'),
      (c): Tresc => ({
        zdania: [
          L(
            `Wyważenie trwa ${czasTickow(WYWAZ_KLATKA_TICKS)} przy drzwiach budynku i ${czasTickow(WYWAZ_MIESZKANIE_TICKS)} przy drzwiach mieszkania, a z łomem w rękach o połowę krócej.`,
            `Forcing a door takes ${czasTickow(WYWAZ_KLATKA_TICKS)} at a building door and ${czasTickow(WYWAZ_MIESZKANIE_TICKS)} at a flat door, and half as long with a crowbar in hand.`,
          ),
          L(
            `Jest głośne: słychać je na ${m(HALAS.wywazanie)} przy drzwiach budynku i ${m(HALAS.mieszkanie)} przy mieszkaniu, z łomem na ${m(HALAS.wywazanieLom)} i ${m(HALAS.mieszkanieLom)}.`,
            `It is loud: it carries ${m(HALAS.wywazanie)} at a building door and ${m(HALAS.mieszkanie)} at a flat, and ${m(HALAS.wywazanieLom)} and ${m(HALAS.mieszkanieLom)} with a crowbar.`,
          ),
          L(
            'Wyważone drzwi zostają wyważone na stałe, chyba że ktoś zabije je deskami.',
            'A forced door stays forced for good, unless somebody nails it shut.',
          ),
          L(
            'Lokatorzy, którzy są w domu, słyszą hałas: ich stosunek do was spada, a nocą są przestraszeni albo wściekli, i wrodzy rzucają się na was od razu.',
            'Residents who are at home hear the noise: how they feel about you drops, at night they are scared or furious, and hostile ones attack you at once.',
          ),
          L(
            `Po wydaniu polecenia gra ostrzega: ${wCyt(PO_POLECENIU.force[0].pl)}`,
            `After you give the order the game warns: ${wCyt(PO_POLECENIU.force[0].en)}`,
          ),
        ],
        uwaga: uwagaZombie(
          c,
          `hałas wyważania ściąga szwendaczy, więc gra dopisuje ${wCyt(HALAS_ZOMBIE.pl.trim())}, a za drzwiami mieszkania może czekać szwendacz.`,
          `the noise of forcing a door draws shamblers, so the game adds ${wCyt(HALAS_ZOMBIE.en.trim())}, and a shambler may be waiting behind a flat door.`,
        ),
        fakty: [
          fakt('czas-budynek', L('Drzwi budynku', 'Building door'), czasTickow(WYWAZ_KLATKA_TICKS)),
          fakt('czas-mieszkanie', L('Drzwi mieszkania', 'Flat door'), czasTickow(WYWAZ_MIESZKANIE_TICKS)),
          fakt('halas-budynek', L('Hałas: drzwi budynku', 'Noise: building door'), m(HALAS.wywazanie)),
          fakt(
            'halas-budynek-lom',
            L('Hałas: drzwi budynku z łomem', 'Noise: building door with a crowbar'),
            m(HALAS.wywazanieLom),
          ),
          fakt('halas-mieszkanie', L('Hałas: drzwi mieszkania', 'Noise: flat door'), m(HALAS.mieszkanie)),
          fakt(
            'halas-mieszkanie-lom',
            L('Hałas: drzwi mieszkania z łomem', 'Noise: flat door with a crowbar'),
            m(HALAS.mieszkanieLom),
          ),
        ],
        jak: [polecenie(c, ['cudzych drzwiach', 'someone else’s door'], [MENU.wywaz.pl, MENU.wywaz.en])],
        zobacz: ['zombie:halas', 'sasiedzi:pukanie', 'sasiedzi:lokatorzy', 'sasiedzi:drzwi'],
      }),
      'wyważanie łom drzwi hałas force crowbar door noise',
    ),

    def(
      'sasiedzi:przeszukiwanie',
      'sasiedzi',
      () => L('Przeszukiwanie sąsiadów', 'Searching the neighbours'),
      (c): Tresc => ({
        zdania: [
          L(
            'W otwartym budynku przeszukujecie pomieszczenia po jednym i każde tylko raz: sale, hale, zaplecza i puste mieszkania.',
            'In an open building you search rooms one at a time and each only once: halls, sheds, back rooms and empty flats.',
          ),
          L(
            `Przeszukanie trwa od ${czasTickow(searchTicks(0))} do ${czasTickow(searchTicks(1e6))}, zależnie od wielkości pomieszczenia, a łup osoba sama niesie na podwórko, bo dopóki leży w cudzym budynku, nie jest wasz.`,
            `Searching takes ${czasTickow(searchTicks(0))} to ${czasTickow(searchTicks(1e6))} depending on the size of the room, and the person carries the loot into the yard on their own, because while it lies in someone else’s building it is not yours.`,
          ),
          L(
            `Mieszkanie lokatorów można przeszukać tylko pod ich nieobecność i to jest szaber: polecenie ${wCyt(MENU.okradnij.pl)} pyta o potwierdzenie, a okradzeni stają się wrodzy.`,
            `You can only search a residents’ flat while they are away, and that is robbery: the order ${wCyt(MENU.okradnij.en)} asks for confirmation, and the people you rob turn hostile.`,
          ),
          L(
            `Na schodach otwartego budynku piętro zajmuje ${czasTickow(PIETRO_TICKS)}, daje łup z pustych mieszkań i bywa niebezpieczne: w zwykłej grze lokatorzy zastają was w ${proc(PIETRO_LUDZIE)} przypadków, w trybie zombie czeka szwendacz w ${proc(PIETRO_SZWENDACZ)}.`,
            `On the stairs of an open building a floor takes ${czasTickow(PIETRO_TICKS)}, yields loot from the empty flats and can be dangerous: in the normal game residents catch you in ${proc(PIETRO_LUDZIE)} of cases, in Zombie mode a shambler waits in ${proc(PIETRO_SZWENDACZ)}.`,
          ),
          L(
            `Z sąsiadów niesie się do siedziby ${listaI([...LUP_MATS].map((mat) => matNazwa(mat as Mat)))}.`,
            `From the neighbours you carry back ${listaI([...LUP_MATS].map((mat) => matNazwa(mat as Mat)))}.`,
          ),
        ],
        uwaga: uwagaZombie(
          c,
          'w pustych mieszkaniach po wymarciu jest dwa razy więcej jedzenia, a na piętrze może czekać szwendacz.',
          'empty flats left by the die-off hold twice as much food, and a shambler may be waiting upstairs.',
        ),
        fakty: [
          fakt(
            'czas-min',
            L('Przeszukanie pomieszczenia, najkrócej', 'Searching a room, shortest'),
            czasTickow(searchTicks(0)),
          ),
          fakt(
            'czas-max',
            L('Przeszukanie pomieszczenia, najdłużej', 'Searching a room, longest'),
            czasTickow(searchTicks(1e6)),
          ),
          fakt('pietro', L('Przeszukanie piętra', 'Searching a floor'), czasTickow(PIETRO_TICKS)),
          fakt(
            'pietro-lokatorzy',
            L('Lokatorzy zastają na piętrze', 'Residents catch you upstairs'),
            proc(PIETRO_LUDZIE),
          ),
          fakt(
            'pietro-szwendacz',
            L('Szwendacz na piętrze (zombie)', 'Shambler upstairs (Zombie mode)'),
            proc(PIETRO_SZWENDACZ),
          ),
          fakt(
            'lup',
            L('Łup z sąsiadów', 'Loot from the neighbours'),
            [...LUP_MATS].map((mat) => matNazwa(mat as Mat)).join(', '),
          ),
        ],
        jak: [
          polecenie(
            c,
            ['pomieszczeniu otwartego budynku', 'a room in an open building'],
            ['Przeszukać …', 'Search the …'],
          ),
          polecenie(
            c,
            ['schodach otwartego budynku', 'the stairs of an open building'],
            ['Przeszukać piętro', 'Search a floor upstairs'],
          ),
          polecenie(c, ['stercie łupu', 'a heap of loot'], ['Zanieść na podwórko', 'Carry into the yard']),
        ],
        zobacz: ['sasiedzi:budynki', 'sasiedzi:lokatorzy', 'zasob:odzysk', 'praca:szaber'],
      }),
      'przeszukiwanie łup szaber piętro sąsiedzi search loot rob floor',
    ),

    def(
      'sasiedzi:lokatorzy',
      'sasiedzi',
      () => L('Lokatorzy za drzwiami', 'People behind the door'),
      (c): Tresc => {
        const sz = (n: number) => proc(szansaWalki(n));
        const sp = (n: number) => proc(szansaPrzegonienia(n));
        return {
          zdania: [
            L(
              `Gdy lokatorzy otworzą drzwi albo wyważycie im je, pojawia się karta ${wCyt(tr(KARTA.naglowek))}: widać na niej, czy ich znacie, jak na was patrzą, w jakim są nastroju i jaki mają do was stosunek.`,
              `When the residents open the door, or you force it, the ${wCyt(tr(KARTA.naglowek))} card appears: it shows whether you know them, how they look at you, their mood and how they feel about you.`,
            ),
            L(
              `Zwykle możecie ${wCyt(rdzen(WYBOR.rozmowa()))}, ${wCyt(tr(WYBOR.jedzenie()))}, ${wCyt(rdzen(WYBOR.zaproszenie('')))}, ${wCyt(rdzen(WYBOR.zabranie('')))} albo ${wCyt(rdzen(WYBOR.odejscie()))}.`,
              `You can usually ${wCyt(rdzen(WYBOR.rozmowa()))}, ${wCyt(tr(WYBOR.jedzenie()))}, ${wCyt(rdzen(WYBOR.zaproszenie('')))}, ${wCyt(rdzen(WYBOR.zabranie('')))} or ${wCyt(rdzen(WYBOR.odejscie()))}.`,
            ),
            L(
              'Zaproszenie dostajecie, gdy dobrze ich znacie albo są życzliwi lub zdesperowani, a przy wyborach z ryzykiem karta podaje szansę.',
              'The invitation is offered when you know them well or they are friendly or desperate, and for choices with a risk the card shows the chance.',
            ),
            L(
              'Zabranie zapasów psuje stosunki na dobre: lokatorzy stają się wrodzy i wściekli, a gdy się postawią, wynik rozstrzyga szarpanina.',
              'Taking their supplies sours things for good: the residents turn hostile and furious, and if they resist, a scuffle decides it.',
            ),
            L(
              `Szansa szarpaniny rośnie z uzbrojonymi z waszej strony: bez broni ${sz(0)}, z jednym ${sz(1)}, z dwoma ${sz(2)}.`,
              `The chance in a scuffle rises with the armed people on your side: ${sz(0)} with none, ${sz(1)} with one, ${sz(2)} with two.`,
            ),
          ],
          uwaga: uwagaZombie(
            c,
            `w ${proc(UKRYTY_UGRYZIONY)} gospodarstw ktoś ukrywa ugryzienie: wybór ${wCyt(rdzen(WYBOR.reka()))} je ujawnia, a ugryziony zostaje, gdy reszta przyjdzie do was.`,
            `in ${proc(UKRYTY_UGRYZIONY)} of the households somebody hides a bite: the choice ${wCyt(rdzen(WYBOR.reka()))} reveals it, and the bitten person stays behind if the rest join you.`,
          ),
          fakty: [
            fakt('walka-0', L('Szarpanina bez uzbrojonych', 'Scuffle, nobody armed'), sz(0)),
            fakt('walka-1', L('Szarpanina z jednym uzbrojonym', 'Scuffle, one armed'), sz(1)),
            fakt('walka-2', L('Szarpanina z dwoma uzbrojonymi', 'Scuffle, two armed'), sz(2)),
            fakt(
              'przegonienie-0',
              L('Przegonienie szabrowników bez broni', 'Driving looters off, nobody armed'),
              sp(0),
            ),
            fakt(
              'przegonienie-1',
              L('Przegonienie szabrowników z jednym uzbrojonym', 'Driving looters off, one armed'),
              sp(1),
            ),
            fakt(
              'przegonienie-2',
              L('Przegonienie szabrowników z dwoma uzbrojonymi', 'Driving looters off, two armed'),
              sp(2),
            ),
            fakt(
              'atak',
              L('Gdy rzucają się na was', 'When they attack'),
              [WYBOR.obrona(''), WYBOR.uspokojenie(''), WYBOR.ucieczka()].map(rdzen).join(', '),
            ),
            fakt(
              'szabrownicy',
              L('Gdy w budynku siedzą szabrownicy', 'When looters sit in the building'),
              [WYBOR.przegonic(''), WYBOR.rozmowa(), WYBOR.odejscie()].map(rdzen).join(', '),
            ),
          ],
          zobacz: ['sasiedzi:pukanie', 'sasiedzi:wywazanie', 'sasiedzi:noc', 'zasob:jedzenie'],
        };
      },
      'lokatorzy spotkanie zaproszenie jedzenie zapasy szarpanina residents meeting invite supplies',
    ),

    def(
      'sasiedzi:plot',
      'sasiedzi',
      () => L('Wspólny płot', 'The shared fence'),
      (c): Tresc => {
        const w = c.words;
        const e = c.e;
        const ile = (v: (typeof WARIANTY_PLOTU)[number]) => kosztPlotu(PRZYKLAD_PLOTU, v);
        return {
          zdania: [
            L(
              'Wspólny płot obejmuje otwarty sąsiedni budynek razem z waszym podwórkiem: siatka rośnie o korytarz do jego drzwi i budynek zostaje w środku.',
              'A shared fence takes an open neighbouring building in together with your yard: the fence grows a corridor to its doors and the building ends up inside.',
            ),
            L(
              `Koszt liczy się od długości nowej siatki: deska i złom na metr (albo po ${NA_METR} sztuki jednego z tych materiałów) oraz ${PLOT_DESKI_DRZWI} deski na każde drzwi do zabicia, a praca to ${czasTickow(PLOT_TICKS_M)} na metr i ${czasTickow(ZABIJANIE_TICKS)} na takie drzwi.`,
              `The cost depends on the length of the new fence: a plank and a piece of scrap per metre (or ${NA_METR} pieces of one of those materials) plus ${PLOT_DESKI_DRZWI} planks for each door that has to be nailed shut, and the work is ${czasTickow(PLOT_TICKS_M)} per metre and ${czasTickow(ZABIJANIE_TICKS)} per such door.`,
            ),
            L(
              `Nowego płotu może być najwyżej ${m(PLOT_MAX)}, a korytarz nie przechodzi przez jezdnię, i wtedy menu mówi ${wCyt(MENU.plotNie('jezdnia').pl)}.`,
              `The new fence can be at most ${m(PLOT_MAX)} long, and the corridor does not cross a road, in which case the menu says ${wCyt(MENU.plotNie('jezdnia').en)}.`,
            ),
            L(
              `Płot stawia się jak budowę: ludzie sami noszą materiał i pracują, a wolni ludzie z ${w.zarzad.dk} dokończą plan, który ktoś zaczął i porzucił.`,
              `The fence goes up like a build: people fetch the material and work on their own, and free people from ${e.krotko} will finish a plan that somebody started and abandoned.`,
            ),
            L(
              `Plan płotu jest jeden naraz i nie da się go odwołać: dopóki nie stanie, nie zaczniecie następnego, a na tym samym budynku polecenie znaczy ${wCyt(MENU.plotDalej.pl)}.`,
              `There is one fence plan at a time and it cannot be cancelled: you cannot start another until it stands, and on the same building the order means ${wCyt(MENU.plotDalej.en)}.`,
            ),
          ],
          fakty: [
            fakt('max', L('Najwięcej nowego płotu', 'Longest new fence'), m(PLOT_MAX)),
            fakt('praca-metr', L('Praca na metr', 'Work per metre'), czasTickow(PLOT_TICKS_M)),
            fakt(
              'praca-drzwi',
              L('Praca na drzwi do zabicia', 'Work per door to nail shut'),
              czasTickow(ZABIJANIE_TICKS),
            ),
            fakt('deski-drzwi', L('Deski na drzwi do zabicia', 'Planks per door to nail shut'), `${PLOT_DESKI_DRZWI}`),
            ...WARIANTY_PLOTU.map((v) =>
              fakt(
                `przyklad-${v}`,
                L(
                  `Przykład: 10 m i jedne drzwi, ${WARIANT_NAZWA[v][0]}`,
                  `Example: 10 m and one door, ${WARIANT_NAZWA[v][1]}`,
                ),
                `${kosztTekst(ile(v).need)}, ${czasTickow(ile(v).total)}`,
              ),
            ),
            fakt('plany', L('Planów płotu naraz', 'Fence plans at once'), '1'),
            fakt('odwolanie', L('Odwołanie planu płotu', 'Cancelling a fence plan'), L('nie ma', 'not possible')),
          ],
          jak: [
            polecenie(
              c,
              ['drzwiach albo pomieszczeniu otwartego budynku', 'a door or a room of an open building'],
              ['Otoczyć wspólnym płotem …', 'Put up a shared fence …'],
            ),
            L(
              'Najpierw budynek musi być otwarty: otwórzcie albo wyważcie jego drzwi.',
              'The building has to be open first: open or force its door.',
            ),
          ],
          zobacz: ['sasiedzi:teren', 'sasiedzi:drzwi', 'drogi:teren', 'zasob:deski', 'zasob:zlom'],
        };
      },
      'wspólny płot otoczyć siatka obwód teren shared fence enclose perimeter',
    ),

    def(
      'sasiedzi:teren',
      'sasiedzi',
      () => L('Przyłączony teren', 'Joined ground'),
      (): Tresc => ({
        zdania: [
          L(
            `Gdy wspólny płot stanie, budynek jest za waszą siatką, a jego karta mówi: ${wCyt(tr(BUDYNEK.otoczony))}`,
            `Once the shared fence stands, the building is behind your fence, and its card says: ${wCyt(tr(BUDYNEK.otoczony))}`,
          ),
          L(
            'Taki budynek jest waszym terenem, tak jak podwórko i siedziba: ludzie podejmują tam prace bez polecenia, na przykład budowę, naprawy i noszenie.',
            'Such a building counts as your own ground, like the yard and the HQ: people take up jobs there without orders, such as building, repairs and carrying.',
          ),
          L(
            'Pierwszy otoczony budynek zalicza pierwszy kamień drogi „Za Murem”.',
            'The first building you enclose earns the first milestone of the “Za Murem” road.',
          ),
          L(
            `Nowa siatka zostawia wytrzymałość starych kafelków, a nowe dostają świeżą łatę (wytrzymałość ${PATCH_HP}), w trybie zombie tak mocną jak wzmocniona siatka na starcie (${REINFORCED_HP}).`,
            `The new fence keeps the durability of the old tiles, and the new ones get a fresh patch (durability ${PATCH_HP}), in Zombie mode as strong as the reinforced fence at the start (${REINFORCED_HP}).`,
          ),
          L(
            'Dziury, przez które przeszło podwórko, znikają, a drzwi na obwodzie zostają zabite deskami.',
            'Holes the yard has grown over disappear, and doors left on the perimeter are nailed shut.',
          ),
        ],
        fakty: [
          fakt('lup', L('Łup w środku', 'Loot inside'), L('wasz', 'yours')),
          fakt('goscie', L('Nocni goście', 'Night visitors'), L('nie wchodzą', 'cannot get in')),
          fakt('lata', L('Nowy płot, zwykła gra', 'New fence, normal game'), `${PATCH_HP}`),
          fakt('wzmocniony', L('Nowy płot, tryb zombie', 'New fence, Zombie mode'), `${REINFORCED_HP}`),
        ],
        zobacz: ['sasiedzi:plot', 'sasiedzi:noc', 'drogi:teren', 'drogi:ekran'],
      }),
      'teren przyłączony za płotem otoczony joined ground enclosed territory',
    ),

    def(
      'sasiedzi:noc',
      'sasiedzi',
      () => L('Nocni goście u sąsiadów', 'Night visitors next door'),
      (c): Tresc => ({
        zdania: [
          L(
            'W nocy do otwartego budynku z wejściem od ulicy może wejść obcy: w zwykłej grze szabrownicy, w trybie zombie szwendacze.',
            'At night a stranger may walk into an open building with a street entrance: looters in the normal game, shamblers in Zombie mode.',
          ),
          L(
            `Szansa na budynek i noc wynosi ${proc(NOC_GOSC)}, przy stertach łupu w środku ${proc(NOC_GOSC_LUP)}, a w trybie zombie ${proc(NOC_GOSC_ZOMBIE)}.`,
            `The chance per building and night is ${proc(NOC_GOSC)}, ${proc(NOC_GOSC_LUP)} with heaps of loot inside, and ${proc(NOC_GOSC_ZOMBIE)} in Zombie mode.`,
          ),
          L(
            `Szabrownicy biorą do ${NOC_BIORA} sztuk ze stert i przeszukują do ${NOC_POKOJE} pomieszczeń, a w ${proc(NOC_ZOSTAJA)} budynków zostają i biorą co noc.`,
            `Looters take up to ${NOC_BIORA} pieces from the heaps and search up to ${NOC_POKOJE} rooms, and in ${proc(NOC_ZOSTAJA)} of the buildings they stay and take more every night.`,
          ),
          L(
            `Ci, którzy zostali, czekają w środku, a gra mówi o nich: ${wCyt(tr(KARTA.szabrownicy))}`,
            `The ones who stayed wait inside, and the game says of them: ${wCyt(tr(KARTA.szabrownicy))}`,
          ),
          L(
            `Budynek za wspólnym płotem i taki bez wejścia od ulicy są bezpieczne, a rano gra daje znać: ${cytatGry('noc')}`,
            `A building inside a shared fence and one with no street entrance are safe, and in the morning the game lets you know: ${cytatGry('noc')}`,
          ),
        ],
        uwaga: uwagaZombie(
          c,
          `zamiast szabrowników wchodzą szwendacze, a rano gra mówi: ${cytatGry('noc_zombie')}`,
          `shamblers walk in instead of looters, and in the morning the game says: ${cytatGry('noc_zombie')}`,
        ),
        fakty: [
          fakt('szansa', L('Szansa na budynek i noc', 'Chance per building and night'), proc(NOC_GOSC)),
          fakt('szansa-lup', L('Szansa, gdy w środku jest łup', 'Chance with loot inside'), proc(NOC_GOSC_LUP)),
          fakt('szansa-zombie', L('Szansa w trybie zombie', 'Chance in Zombie mode'), proc(NOC_GOSC_ZOMBIE)),
          fakt('bio', L('Szabrownicy biorą sztuk', 'Looters take pieces'), `${NOC_BIORA}`),
          fakt('pokoje', L('Przeszukują pomieszczeń', 'Rooms they search'), `${NOC_POKOJE}`),
          fakt('zostaja', L('Szansa, że zostają', 'Chance they stay'), proc(NOC_ZOSTAJA)),
        ],
        zobacz: ['sasiedzi:plot', 'sasiedzi:teren', 'sasiedzi:lokatorzy', 'noc:napad'],
      }),
      'noc szabrownicy goście budynek łup night visitors looters building loot',
    ),
  ];
}
