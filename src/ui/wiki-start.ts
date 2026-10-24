/* Wiki w grze, kategoria „Pierwsze kroki”: od czego zacząć, sterowanie, górny pasek, czas i pory roku, temperatura, cele
   dnia, zapis gry i słowniczek. Hasła prowadzą do artykułów o szczegółach, a „Jak grać” z Menu zostaje pod ręką (przycisk
   `wiki-pomoc` otwiera je w main.ts). Liczby biorą się z tabel gry (klimat z `outdoorTemp`, tempa z `SPEEDS`, start z
   `START_MINUTES`, drużyna z `OSOB_DOMYSLNIE`), słowa miejsca ze słownika (`WikiCtx.words`, `WikiCtx.e`). */

import { SEASONS_EN } from '../content/data.en.ts';
import { SEASON_DAYS, SEASONS } from '../content/data.ts';
import { OSOB_DOMYSLNIE, OSOB_MAX, OSOB_MIN } from '../content/druzyna.ts';
import { L } from '../core/jezyk.ts';
import { CARD_HOUR, MORNING } from '../gov/noc.ts';
import { LAW_HOUR, LAW_MINUTE } from '../gov/zarzad.ts';
import { outdoorTemp, SPEEDS, START_MINUTES, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../sim/clock.ts';
import { FOOD_START, MEAL_HOURS, WORK_START } from '../sim/sim.ts';
import { WARM_ENOUGH } from '../sim/tutorial.ts';
import { NIGHT_WOOD } from './cele.ts';
import { deg, num } from './tekst.ts';
import { cyt, prawy } from './wiki-slowa.ts';
import { type Def, def, fakt } from './wiki-typy.ts';

/** czas gry jako „15:00” */
const zegar = (minuty: number): string => {
  const m = ((minuty % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** ile sekund przy tempie 1× trwa godzina gry */
const SEKUND_NA_GODZINE = TICKS_PER_HOUR / TICKS_PER_SECOND;

/** Średnia temperatura w południe (14:00) dnia `dzien` z kilku ziaren: odchyłka dnia w `outdoorTemp` zależy od ziarna, więc
    uśredniona pokazuje przebieg pory roku, nie los jednej gry. */
function poludnie(dzien: number): number {
  const tick = Math.round((((dzien - 1) * 1440 + 14 * 60 - START_MINUTES) * TICKS_PER_HOUR) / 60);
  let suma = 0;
  const ziarna = 16;
  for (let s = 1; s <= ziarna; s++) suma += outdoorTemp(s, tick);
  return suma / ziarna;
}

/** zakres południowych temperatur w porze roku `p` (0 jesień…3 lato): najzimniejszy i najcieplejszy dzień */
function zakresPory(p: number): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let d = 1; d <= SEASON_DAYS; d++) {
    const t = poludnie(p * SEASON_DAYS + d);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [Math.round(lo), Math.round(hi)];
}

const pora = (p: number): string => L(SEASONS[p], SEASONS_EN[p]);

export function definicjeStart(): Def[] {
  return [
    def(
      'start:zacznij',
      'start',
      () => L('Zacznij tutaj', 'Start here'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Prowadzicie ${w.zarzad.pelny} w 2051 roku: kilka osób z imionami, kozę w kuchni i siatkę wokół podwórka.`,
              `You run ${e.pelny} in 2051: a few named people, a potbelly stove in the kitchen and a fence around the yard.`,
            ),
            L(
              'Ludzie sami jedzą, śpią i biorą się do pracy według priorytetów, a wy wydajecie polecenia, budujecie i decydujecie.',
              'People eat, sleep and pick up work on their own, following the priorities you set, while you give orders, build and decide.',
            ),
            L(
              `Najpierw zadbajcie o ogień: zetnijcie suche drzewo, zanieście drewno do składu przy kozie i rozpalcie ją, aż kuchnia ogrzeje się do ${WARM_ENOUGH}°C.`,
              `Look after the fire first: chop down the dead tree, carry the wood to the woodpile by the stove and light it until the kitchen warms up to ${WARM_ENOUGH}°C.`,
            ),
            L(
              `Wieczorem ${w.zarzad.m} podejmuje uchwałę, o ${CARD_HOUR}:00 przychodzi karta nocy, a o ${MORNING}:00 raport z tego, co się wydarzyło.`,
              `In the evening ${e.krotko} passes a resolution, at ${CARD_HOUR}:00 the Night orders come up, and at ${MORNING}:00 you get a report on what happened.`,
            ),
            L(
              `Kliknięcie czipa na górnym pasku (drewno, jedzenie, zaufanie…) otwiera jego artykuł${c.touch ? ' także na telefonie: wystarczy stuknąć' : ''}.`,
              `${c.touch ? 'Tapping' : 'Clicking'} a chip on the top bar (wood, food, trust…) opens its article.`,
            ),
          ],
          fakty: [
            fakt(
              'start',
              L('Start gry', 'Game start'),
              L(`dzień 1, ${zegar(START_MINUTES)}, jesień 2051`, `day 1, ${zegar(START_MINUTES)}, autumn 2051`),
            ),
            fakt(
              'osoby',
              L('Osób w zarządzie', 'People on the board'),
              L(
                `${OSOB_DOMYSLNIE} (na ekranie startowym od ${OSOB_MIN} do ${OSOB_MAX})`,
                `${OSOB_DOMYSLNIE} (from ${OSOB_MIN} to ${OSOB_MAX} on the start screen)`,
              ),
            ),
            fakt(
              'jedzenie',
              L('Jedzenie na start', 'Food at the start'),
              L(`${FOOD_START} porcji`, `${FOOD_START} portions`),
            ),
            fakt('ciepla', L('Ciepła kuchnia', 'A warm kitchen'), deg(WARM_ENOUGH)),
            fakt(
              'drewno',
              L('Drewno na wieczór', 'Wood for the evening'),
              L(`${NIGHT_WOOD} szt.`, `${NIGHT_WOOD} pieces`),
            ),
          ],
          jak: [
            L(
              `Zaznaczcie kogoś z ${w.zarzad.dk}, potem otwórzcie menu poleceń przy suchym drzewie (${prawy(c)}) i wybierzcie ${cyt('Ściąć drzewo', 'Chop down the tree')}.`,
              `Select someone from ${e.krotko}, then open the order menu on the dead tree (${prawy(c)}) and pick ${cyt('Ściąć drzewo', 'Chop down the tree')}.`,
            ),
            L(
              'Drwal sam niesie drewno do składu przy kozie. Kto ma drewno w rękach, dołoży też do ognia.',
              'The woodcutter carries the wood to the woodpile by the stove. Anyone holding wood will also feed the fire.',
            ),
            L(
              'Przycisk 3× u góry przyspiesza czekanie, spacja zatrzymuje grę.',
              'The 3× button at the top speeds up the waiting, and Space pauses the game.',
            ),
          ],
          zobacz: [
            'start:sterowanie',
            'zasob:drewno',
            'zasob:koza',
            'noc:karta',
            'zarzad:zaufanie',
            'start:slowniczek',
          ],
          przyciski: [{ act: 'wiki-pomoc', napis: L('Otwórz „Jak grać”', 'Open “How to play”') }],
        };
      },
      'początek start samouczek tutorial pierwszy dzień jak zacząć',
    ),

    def(
      'start:sterowanie',
      'start',
      () => L('Sterowanie', 'Controls'),
      (c) => {
        const { words: w, e } = c;
        const mysz = !c.touch;
        return {
          zdania: [
            L(
              mysz
                ? `Klik zaznacza człowieka z ${w.zarzad.dk}, a przeciągnięcie ramki z Shiftem zaznacza kilku naraz.`
                : `Stuknięcie w człowieka z ${w.zarzad.dk} zaznacza go.`,
              mysz
                ? `A click selects someone from ${e.krotko}, and Shift-drag selects several with a box.`
                : `Tapping someone from ${e.krotko} selects them.`,
            ),
            L(
              mysz
                ? 'Prawy przycisk pokazuje polecenia w danym miejscu: idź, zetnij, zanieś, dołóż do kozy, gotuj, spal mebel.'
                : 'Stuknięcie w miejsce wydaje najprostsze polecenie, a przytrzymanie palca pokazuje wszystkie polecenia w tym miejscu.',
              mysz
                ? 'Right-click shows the orders for that spot: go, chop, haul, feed the stove, cook, burn furniture.'
                : 'Tapping a spot gives the simplest order, and pressing and holding shows every order for that spot.',
            ),
            L(
              mysz
                ? 'Kółko przybliża, przeciąganie albo WASD przesuwają mapę.'
                : 'Jeden palec przesuwa mapę, dwa przybliżają.',
              mysz
                ? 'Scroll to zoom; drag or use WASD to move the map.'
                : 'One finger moves the map, two fingers zoom.',
            ),
            L(
              'Rząd portretów pod paskiem to wasi ludzie: z ikonami stanu, a kamera idzie za osobą po drugim kliknięciu.',
              'The row of portraits under the top bar is your people, with status icons; a second click makes the camera follow someone.',
            ),
          ],
          fakty: [
            fakt(
              'tempa',
              L('Tempa gry', 'Game speeds'),
              SPEEDS.map((s) => (s === 0 ? L('pauza', 'pause') : `${s}×`)).join(', '),
            ),
            ...(mysz
              ? [
                  fakt(
                    'klawisze',
                    L('Klawisze', 'Keys'),
                    L(
                      'spacja: pauza, 1–4: tempo, B: budowa, P: praca, M: mapa miasta, T: badania, Q i E: kolejna osoba',
                      'Space: pause, 1–4: speed, B: build, P: work, M: city map, T: research, Q and E: next person',
                    ),
                  ),
                ]
              : []),
          ],
          jak: [
            L(
              mysz
                ? 'Na gładziku kliknięcie dwoma palcami albo Ctrl+klik to prawy przycisk, szczypanie przybliża.'
                : 'Przytrzymanie palca na człowieku albo rzeczy otwiera menu poleceń.',
              mysz
                ? 'On a trackpad, a two-finger click or Ctrl+click works as a right-click, and pinching zooms.'
                : 'Pressing and holding on a person or an object opens the order menu.',
            ),
            L(
              'Gra staje na pauzie, gdy otwierasz Menu albo okno decyzji.',
              'The game pauses while the Menu or a decision window is open.',
            ),
          ],
          zobacz: ['start:zacznij', 'start:pasek', 'praca:polecenia'],
          przyciski: [{ act: 'wiki-pomoc', napis: L('Otwórz „Jak grać”', 'Open “How to play”') }],
        };
      },
      'mysz dotyk klawisze skróty polecenia zaznaczanie kamera',
    ),

    def(
      'start:pasek',
      'start',
      () => L('Pasek u góry', 'The top bar'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Górny pasek pokazuje zegar, tempo gry i to, od czego zależy życie: ciepło, drewno, materiały, jedzenie, zaufanie i wkurzenie.',
              'The top bar shows the clock, the game speed and what your people live on: warmth, wood, materials, food, trust and anger.',
            ),
            L(
              'Wartość każdego czipa ma kolor: zielony znaczy dobrze, żółty uwaga, czerwony źle.',
              'Each chip’s value has a colour: green is fine, amber means watch it, red means trouble.',
            ),
            L(
              'W trybie zombie zamiast temperatury na dworze stoją dwa czipy: siatka i stado.',
              'In Zombie mode, two chips replace the outside temperature: the fence and the herd.',
            ),
            L(
              'Obok czipów są przyciski: „Do broni!” (alarm), Mapa miasta, Praca, Budowa, Badania (od chwili, gdy stoi pracownia) i Menu.',
              'Next to the chips are the buttons: “To arms!” (alarm), City map, Work, Build, Research (once the research room stands) and Menu.',
            ),
          ],
          fakty: [
            fakt('dwor', L('dwór', 'outside'), L('temperatura na zewnątrz', 'the outside temperature')),
            fakt(
              'kuchnia',
              L('kuchnia', 'kitchen'),
              L(`temperatura w kuchni ${w.zarzad.dk}`, `the temperature in ${e.krotko}’s kitchen`),
            ),
            fakt(
              'koza',
              L('koza', 'stove'),
              L('na ile godzin starczy ognia w kozie', 'how many hours of fire the stove has left'),
            ),
            fakt(
              'drewno',
              L('drewno', 'wood'),
              L('drewno na zapas: skład, luzem i w rękach', 'wood in store: woodpile, loose and carried'),
            ),
            fakt(
              'materialy',
              L('deski, złom, części', 'planks, scrap, parts'),
              L(
                'materiały z odzysku (na telefonie jedno pole „d·z·cz”)',
                'salvaged materials (one “pl·sc·pa” chip on a phone)',
              ),
            ),
            fakt(
              'jedzenie',
              L('jedzenie', 'food'),
              L('porcje w zapasach i ugotowane porcje', 'portions in stock and cooked portions'),
            ),
            fakt(
              'zaufanie',
              L('zaufanie', 'trust'),
              L(`zaufanie ${w.mieszkancy.d} do ${w.zarzad.d}, 0–100`, `${e.mieszkancy}’ trust in ${e.krotko}, 0–100`),
            ),
            fakt(
              'wkurzenie',
              L('wkurzenie', 'anger'),
              L(`wkurzenie ${w.mieszkancy.d}, 0–100`, `${e.mieszkancy}’ anger, 0–100`),
            ),
          ],
          jak: [
            L(
              `${c.touch ? 'Stuknijcie' : 'Kliknijcie'} czip, żeby przeczytać o nim w wiki.`,
              `${c.touch ? 'Tap' : 'Click'} a chip to read about it in the wiki.`,
            ),
            L(
              'Najechanie na czip (na telefonie przytrzymanie) pokazuje podpowiedź z dokładnymi liczbami.',
              'Hovering over a chip (pressing and holding on a phone) shows a tooltip with the exact numbers.',
            ),
          ],
          zobacz: [
            'start:temperatura',
            'zasob:koza',
            'zasob:drewno',
            'zasob:odzysk',
            'zasob:jedzenie',
            'zarzad:zaufanie',
            'zarzad:wkurzenie',
            'zombie:siatka',
          ],
        };
      },
      'czip stan pasek wskaźniki',
    ),

    def(
      'start:czas',
      'start',
      () => L('Czas, doba i tempo', 'Time, the day and speed'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Godzina gry trwa ${num(SEKUND_NA_GODZINE, 0)} sekund przy tempie 1×, a doba ma 24 godziny.`,
              `A game hour lasts ${num(SEKUND_NA_GODZINE, 0)} seconds at 1× speed, and a day has 24 hours.`,
            ),
            L(
              `Za dnia ludzie pracują, o ${MEAL_HOURS.join(':00 i ')}:00 jedzą wspólny posiłek, wieczorem ${w.zarzad.m} się zbiera, a o ${CARD_HOUR}:00 zaczyna się noc.`,
              `By day people work, at ${MEAL_HOURS.join(':00 and ')}:00 they share a meal, in the evening ${e.krotko} meets, and at ${CARD_HOUR}:00 the night begins.`,
            ),
            L(
              'Gdy wszyscy śpią, noc biegnie szybciej (6×), a rano gra wraca do waszego tempa.',
              'When everyone is asleep the night runs faster (6×), and in the morning the game goes back to your own speed.',
            ),
            L(
              `Pory roku zmieniają się co ${SEASON_DAYS} dni: jesień, zima, wiosna, lato.`,
              `The seasons change every ${SEASON_DAYS} days: autumn, winter, spring, summer.`,
            ),
          ],
          fakty: [
            fakt(
              'godzina',
              L('Godzina gry', 'One game hour'),
              L(`${num(SEKUND_NA_GODZINE, 0)} s przy 1×`, `${num(SEKUND_NA_GODZINE, 0)} s at 1×`),
            ),
            fakt('praca', L('Początek pracy', 'Work starts'), `${WORK_START}:00`),
            fakt('posilki', L('Wspólne posiłki', 'Shared meals'), MEAL_HOURS.map((h) => `${h}:00`).join(', ')),
            fakt(
              'zebranie',
              L('Zebranie z uchwałą', 'Meeting with a resolution'),
              `${LAW_HOUR}:${String(LAW_MINUTE).padStart(2, '0')}`,
            ),
            fakt('karta', L('Karta nocy', 'Night orders'), `${CARD_HOUR}:00`),
            fakt('raport', L('Raport poranny', 'Morning report'), `${MORNING}:00`),
            fakt('pora', L('Pora roku trwa', 'A season lasts'), L(`${SEASON_DAYS} dni`, `${SEASON_DAYS} days`)),
          ],
          jak: [
            L(
              'Przyciski tempa są na górnym pasku: Pauza, 1×, 3×, 6× i 8×; z klawiatury spacja i cyfry 1–4.',
              'The speed buttons are on the top bar: Pause, 1×, 3×, 6× and 8×; from the keyboard use Space and the digits 1–4.',
            ),
          ],
          zobacz: ['start:temperatura', 'noc:karta', 'zarzad:zebranie', 'zarzad:raport'],
        };
      },
      'zegar godzina doba tempo pauza przyspieszenie',
    ),

    def(
      'start:temperatura',
      'start',
      () => L('Temperatura i pory roku', 'Temperature and the seasons'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Czip „na dworze” pokazuje temperaturę na zewnątrz, a czip „kuchnia” temperaturę w kuchni ${w.zarzad.dk}.`,
              `The “outside” chip shows the outside temperature and the “kitchen” chip shows the temperature in ${e.krotko}’s kitchen.`,
            ),
            L(
              'Kuchnię ogrzewa koza, więc bez ognia robi się tam tak zimno jak na dworze.',
              'The stove heats the kitchen, so without a fire it gets as cold in there as it is outside.',
            ),
            L(
              'Jesienią robi się coraz zimniej, zima jest najgorsza, wiosną ocieplenie wraca, a latem jest ciepło.',
              'It gets colder through the autumn, winter is the worst, warmth returns in spring and summer is warm.',
            ),
            L(
              `Poniżej ${WARM_ENOUGH}°C ludziom ubywa ciepła, a bez ciepła spada też zdrowie.`,
              `Below ${WARM_ENOUGH}°C people lose warmth, and without warmth their health drops too.`,
            ),
          ],
          fakty: [0, 1, 2, 3].map((p) => {
            const [lo, hi] = zakresPory(p);
            return fakt(
              `pora-${p}`,
              L(
                `${pora(p)[0].toUpperCase()}${pora(p).slice(1)} (w południe)`,
                `${pora(p)[0].toUpperCase()}${pora(p).slice(1)} (at noon)`,
              ),
              `${deg(lo)} … ${deg(hi)}`,
            );
          }),
          jak: [
            L(
              'Zimą trzymajcie w składzie drewno na kilka nocy z góry i palcie meble dopiero w ostateczności.',
              'In winter keep wood in the woodpile for several nights ahead, and burn furniture only as a last resort.',
            ),
          ],
          zobacz: ['zasob:koza', 'zasob:drewno', 'potrzeba:warm', 'start:czas'],
        };
      },
      'zimno ciepło mróz zima lato jesień wiosna stopnie celsjusza',
    ),

    def(
      'start:cele',
      'start',
      () => L('Cele dnia', 'Daily goals'),
      (c) => ({
        zdania: [
          L(
            'Okienko w lewym górnym rogu prowadzi was przez grę krok po kroku: bieżący cel ma pod sobą podpowiedź, jak go zrobić.',
            'The panel in the top-left corner walks you through the game step by step: the current goal has a hint underneath on how to do it.',
          ),
          L(
            'Cele są podzielone na rozdziały, od pierwszego dnia po pracę, badania i drogi do zwycięstwa.',
            'The goals come in chapters, from the first day through work and research to the roads to victory.',
          ),
          L(
            'Gdy zdarzy się coś ważnego, na przykład handlarz pod bramą albo ugryzienie, nad rozdziałem pojawia się krótka okazja z własnymi celami.',
            'When something important happens, such as a trader at the gate or a bite, a short opportunity with its own goals appears above the chapter.',
          ),
          L(
            'Cel, który przepadł, na przykład drewno na wieczór po nadejściu nocy, zostaje skreślony.',
            'A goal that is missed, such as the evening wood once night has fallen, is crossed out.',
          ),
        ],
        jak: [
          L(
            `${c.touch ? 'Stuknijcie' : 'Kliknijcie'} nagłówek okienka, żeby je zwinąć albo rozwinąć.`,
            `${c.touch ? 'Tap' : 'Click'} the panel header to collapse or expand it.`,
          ),
        ],
        zobacz: ['start:zacznij', 'drogi:ekran'],
      }),
      'cele zadania samouczek rozdziały okazje podpowiedź',
    ),

    def(
      'start:zapis',
      'start',
      () => L('Zapis gry', 'Saving the game'),
      () => ({
        zdania: [
          L(
            'Gra zapisuje się sama co godzinę gry i przy zamknięciu karty przeglądarki.',
            'The game saves itself every game hour and when you close the browser tab.',
          ),
          L(
            'Zapis leży tylko w tej przeglądarce, na tym urządzeniu.',
            'The save stays in this browser, on this device only.',
          ),
          L(
            'Na ekranie startowym przycisk wznawia ostatnią grę, a „Usuń zapis” kasuje ją na stałe.',
            'On the start screen a button resumes the last game, and “Delete save” removes it for good.',
          ),
          L(
            'Świat powstaje z danych mapy i ziarna, więc nie trafia do zapisu: zapisują się ludzie, rzeczy, zapasy i decyzje.',
            'The world is built from the map data and the seed, so it is not part of the save: people, things, stock and decisions are.',
          ),
        ],
        jak: [
          L(
            'Menu pokazuje, kiedy był ostatni zapis. Przycisk powrotu do ekranu startowego zapisuje grę przed wyjściem.',
            'The Menu shows when the last save was made. The button back to the start screen saves the game before leaving.',
          ),
        ],
        zobacz: ['start:zacznij'],
      }),
      'zapis wczytaj kontynuuj usuń zapis',
    ),

    def(
      'start:slowniczek',
      'start',
      () => L('Słowniczek: co jest czym', 'Glossary: what is what'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Najważniejsze słowa gry w jednym miejscu, każde w jednym zdaniu.',
              'The most important words of the game in one place, each in a single sentence.',
            ),
            L(
              'Pełne opisy mają osobne artykuły: skorzystajcie z listy po lewej albo z wyszukiwarki.',
              'Each has a full article of its own: use the list on the left or the search box.',
            ),
          ],
          fakty: [
            fakt(
              'zarzad',
              w.Zarzad,
              L(
                `Wy: kilka osób z imionami, którym wydajecie polecenia. ${w.Zarzad} odpowiada przed ${w.mieszkancy.m}.`,
                `You: a few named people to whom you give orders. ${e.Zarzad} answers to the ${e.mieszkancy}.`,
              ),
            ),
            fakt(
              'koza',
              L('Koza', 'Stove'),
              L(
                'Piecyk w kuchni siedziby. Pali drewno, grzeje kuchnię i pozwala gotować.',
                'The potbelly stove in the HQ kitchen. It burns wood, heats the kitchen and lets you cook.',
              ),
            ),
            fakt(
              'sklad',
              L('Skład', 'Woodpile'),
              L('Miejsce przy kozie, gdzie leży drewno na opał.', 'The spot by the stove where the firewood is kept.'),
            ),
            fakt(
              'siatka',
              L('Siatka', 'The fence'),
              L(
                'Ogrodzenie podwórka z dziurami i wytrzymałością. Łata się ją deskami albo złomem.',
                'The fence around the yard, with holes and a durability. You patch it with planks or scrap.',
              ),
            ),
            fakt(
              'brama',
              L(`${w.brama.m[0].toUpperCase()}${w.brama.m.slice(1)}`, `${e.brama[0].toUpperCase()}${e.brama.slice(1)}`),
              L(
                'Wejście na podwórko; można ją zamknąć, otworzyć albo pilnować.',
                'The way into the yard; it can be closed, opened or watched.',
              ),
            ),
            fakt(
              'podworko',
              L('Podwórko', 'The yard'),
              L(
                'Teren za siatką, na którym pracujecie za dnia i stawiacie budowle.',
                'The ground inside the fence, where you work by day and put up buildings.',
              ),
            ),
            fakt(
              'karta',
              L('Karta nocy', 'Night orders'),
              L(
                `Okno o ${CARD_HOUR}:00: kto śpi, kto pilnuje, kto czuwa przy kozie, kto idzie na wyprawę.`,
                `The window at ${CARD_HOUR}:00: who sleeps, who keeps watch, who sits up with the stove, who goes on a run.`,
              ),
            ),
            fakt(
              'warta',
              L('Warta', 'The watch'),
              L('Osoby, które nocą pilnują siatki albo bramy.', 'The people who guard the fence or the gate at night.'),
            ),
            fakt(
              'napad',
              L('Napad', 'Raid'),
              L(
                'Nocna próba szabrowników, żeby wejść na podwórko i coś zabrać.',
                'A night attempt by looters to get into the yard and take something.',
              ),
            ),
            fakt(
              'wyprawa',
              L('Wyprawa', 'Supply run'),
              L(
                'Wyjście kilku osób po łup do miejsca z mapy miasta.',
                'A trip by a few people for loot to a place on the city map.',
              ),
            ),
            fakt(
              'uchwala',
              L('Uchwała', 'Resolution'),
              L(
                'Decyzja ze stałym skutkiem, podejmowana na wieczornym zebraniu.',
                'A decision with a lasting effect, passed at the evening meeting.',
              ),
            ),
            fakt(
              'lata',
              L('Łata', 'Patch'),
              L(
                'Prowizoryczne zasłonięcie dziury w siatce deskami albo złomem.',
                'A makeshift cover for a hole in the fence, made of planks or scrap.',
              ),
            ),
            fakt(
              'wrak',
              L('Wrak', 'Wreck'),
              L(
                'Stary samochód, który można przeszukać i rozebrać na złom i części.',
                'An old car you can search and strip for scrap and parts.',
              ),
            ),
            fakt(
              'pracownia',
              L('Pracownia', 'Research room'),
              L(
                'Pokój ze stołem, przy którym ludzie badają nowe technologie.',
                'A room with a table where people research new technologies.',
              ),
            ),
            fakt(
              'szwendacz',
              L('Szwendacz', 'Shambler'),
              L(
                'Wolny, głupi umarlak z trybu zombie; idzie za hałasem i zbija się w stado.',
                'A slow, mindless dead walker from Zombie mode; it follows noise and gathers into a herd.',
              ),
            ),
          ],
          zobacz: [
            'zasob:koza',
            'noc:karta',
            'noc:warta',
            'noc:napad',
            'miasto:wyprawa',
            'zarzad:uchwaly',
            'zasob:wraki',
            'badania:jak',
            'zombie:szwendacze',
          ],
        };
      },
      'słowniczek definicje pojęcia glosariusz',
    ),
  ];
}
