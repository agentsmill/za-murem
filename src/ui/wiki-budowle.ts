/* Wiki w grze, kategoria „Budowle”: po jednym artykule na każdy rodzaj z `BUILDS` (src/sim/budowle.ts) i artykuł o tym, jak
   działa budowa. Blok faktów każdej budowli jest liczony z tabeli: rozmiar, koszt (`costText`, tak jak w panelu budowy),
   czas pracy (`workText`), miejsce (jak `placeText`, ale dom czyta „przedpokój domu” zamiast „klatki siedziby”), badanie,
   które ją odblokowuje (`BuildDef.tech`), i limit (`BuildDef.max`). Zdania o działaniu są pisane tu, bo opisy z tabel
   (`BuildDef.effect`) nie zawsze mają wariant dla domu; liczby w nich biorą się z eksportowanych stałych (`ZASIEKI_HP`,
   `PALENISKA`, `GARDEN_YIELD`…). */

import { SEASONS_EN } from '../content/data.en.ts';
import { SEASONS } from '../content/data.ts';
import { L, tr } from '../core/jezyk.ts';
import { nazwaTech, PALENISKA, PIECZARKI_PLON, RESEARCH_SEATS } from '../sim/badania.ts';
import { BUILDS, type BuildCat, type BuildKind, ZASIEG_OKNA } from '../sim/budowle.ts';
import { BARYKADA_HP, GARDEN_YIELD, KOZA_CAP, SOCIAL_KITCHEN, WIEZA_ZASIEG, ZASIEKI_HP } from '../sim/sim.ts';
import { pracaPrzepisu, RECIPES } from '../sim/surowce.ts';
import { placeEn } from './budowa.en.ts';
import { buildName, costText, placeText, workText } from './budowa.ts';
import { num } from './tekst.ts';
import { cyt, proc, wCyt } from './wiki-slowa.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

/** nazwa zakładki panelu budowy (jak `CAT_TITLE` w src/ui/budowa.ts; test porównuje je z menu) */
export const ZAKLADKA: Record<BuildCat, [string, string]> = {
  dom: ['Dom', 'Home'],
  podworko: ['Podwórko', 'Yard'],
  obwod: ['Obwód', 'Perimeter'],
  cuda: ['Cuda', 'Wonders'],
};
const zakladka = (cat: BuildCat): string => L(ZAKLADKA[cat][0], ZAKLADKA[cat][1]);

/** Gdzie wolno postawić budowlę, w bieżącym języku. Jak `placeText` z panelu budowy, tylko klatka siedziby: w domu to
    przedpokój domu, w bloku klatka schodowa siedziby. */
export function miejsceBudowli(kind: BuildKind, c: WikiCtx): string {
  const place = BUILDS[kind].place;
  if (place === 'klatka')
    return c.dom
      ? L('w przedpokoju domu', 'in the hallway of the house')
      : L('na klatce schodowej siedziby', 'in the HQ stairwell');
  return L(placeText(place, c.words), placeEn(place, c.e));
}

/** nazwa badania, które odblokowuje budowlę, albo „od początku gry” */
export const odblokowanie = (kind: BuildKind): string => {
  const t = BUILDS[kind].tech;
  return t ? tr(nazwaTech(t)) : L('od początku gry', 'from the start of the game');
};

/** fakty wspólne dla każdej budowli, liczone z `BUILDS` */
function faktyBudowli(kind: BuildKind, c: WikiCtx): Fakt[] {
  const d = BUILDS[kind];
  return [
    fakt('rozmiar', L('Rozmiar (kafelki)', 'Size (tiles)'), `${d.w}×${d.h}`),
    fakt('koszt', L('Koszt', 'Cost'), costText(d.cost)),
    fakt('praca', L('Praca jednej osoby', 'Work for one person'), workText(d.work)),
    fakt('miejsce', L('Gdzie', 'Where'), miejsceBudowli(kind, c)),
    fakt('zakladka', L('Zakładka w panelu Budowa', 'Tab in the Build panel'), zakladka(d.cat)),
    fakt('odblokowanie', L('Odblokowuje badanie', 'Unlocked by'), odblokowanie(kind)),
    ...(d.max !== undefined
      ? [fakt('limit', L('Ile naraz', 'How many at once'), L(`najwyżej ${d.max}`, `at most ${d.max}`))]
      : []),
  ];
}

/** Treść specyficzna dla budowli: zdania o działaniu, dodatkowe fakty i odnośniki. */
type Opis = (c: WikiCtx) => { zdania: string[]; fakty?: Fakt[]; zobacz?: string[] };

const sezony = (wartosci: readonly number[]): string =>
  SEASONS.map((_, i) => `${L(SEASONS[i], SEASONS_EN[i])} ${wartosci[i]}`).join(', ');

const OPISY: Record<BuildKind, Opis> = {
  warsztat: (c) => ({
    zdania: [
      L(
        'Warsztat przerabia surowce: z drewna piłuje się w nim deski, a ze złomu robi części.',
        'The workshop processes raw materials: you saw planks from wood in it and make parts from scrap.',
      ),
      L(
        'Z warsztatem łaty, naprawy i wzmacnianie siatki idą szybciej, a rozbiórka mebli, sprzętów i wraków daje więcej.',
        'With a workshop, patches, repairs and shoring up the fence go faster, and taking furniture, appliances and wrecks apart yields more.',
      ),
      L(
        `${c.words.Zarzad} sam robi deski, części i dzidy do progów ustawionych w panelu Pracy.`,
        `${c.e.Zarzad} makes planks, parts and spears on its own, up to the levels set in the Work panel.`,
      ),
    ],
    fakty: [
      fakt(
        'przepis-deski',
        L('Deski', 'Planks'),
        `${RECIPES.deski.n} ${L('drewna', 'wood')} → 1, ${workText(pracaPrzepisu('deski'))}`,
      ),
      fakt(
        'przepis-czesci',
        L('Części', 'Parts'),
        `${RECIPES.czesci.n} ${L('złomu', 'scrap')} → 1, ${workText(pracaPrzepisu('czesci'))}`,
      ),
    ],
    zobacz: ['zasob:deski', 'zasob:czesci', 'praca:warsztat', 'badanie:t_spawanie', 'zasob:wraki'],
  }),

  kuchnia_spoleczna: (c) => ({
    zdania: [
      L(
        'Kuchnia społeczna to wspólny garnek: gotuje się raz dziennie, godzinę przed obiadem, od razu dla wszystkich.',
        'The community kitchen is one shared pot: cooking is done once a day, an hour before lunch, for everyone at once.',
      ),
      L(
        `Porcja z niej to ${proc(SOCIAL_KITCHEN)} zwykłej, więc ${c.words.zarzad.m} zjada mniej jedzenia na osobę.`,
        `A portion from it is ${proc(SOCIAL_KITCHEN)} of a normal one, so ${c.e.krotko} gets through less food per head.`,
      ),
      L(
        'Wspólny garnek da się też mieć bez budowy, uchwałą „Wspólny kocioł”, ale ta podnosi zużycie jedzenia.',
        'You can also have a shared pot without building anything, with the “The common pot” resolution, but that raises food use.',
      ),
    ],
    fakty: [fakt('porcja', L('Porcja', 'Portion'), proc(SOCIAL_KITCHEN))],
    zobacz: ['zasob:jedzenie', 'uchwala:u_kociol', 'potrzeba:food'],
  }),

  magazyn: () => ({
    zdania: [
      L(
        'Magazyn to półki na zapasy w jednym z pokoi.',
        'The storeroom is a set of shelves for supplies in one of the rooms.',
      ),
      L(
        'Zapasy leżące w pokoju z magazynem trudniej ukraść przy napadzie.',
        'Supplies lying in a room with a storeroom are harder to steal in a raid.',
      ),
    ],
    zobacz: ['noc:napad', 'zasob:jedzenie'],
  }),

  lozka_pietrowe: (c) => ({
    zdania: [
      L(
        'Łóżka piętrowe dają dwa miejsca do spania na powierzchni jednego łóżka.',
        'Bunk beds give two places to sleep in the space of one bed.',
      ),
      L(
        `Dzięki nim ${c.words.mieszkamy} zmieści się więcej ludzi, a kto ma łóżko, ten nie śpi na podłodze.`,
        `They make room for more people ${c.e.mieszkamy}, and anyone with a bed does not sleep on the floor.`,
      ),
    ],
    zobacz: ['ludzie:sen', 'potrzeba:rest', 'ludzie:zarzad'],
  }),

  ogrodek: () => ({
    zdania: [
      L(
        'Ogródek to grządki na podwórku, które po kilku dniach zaczynają rodzić jedzenie.',
        'The vegetable patch is a set of beds in the yard that start yielding food after a few days.',
      ),
      L(
        'Plon zależy od pory roku: latem jest największy, jesienią mały, a zimą nic nie rośnie.',
        'The yield depends on the season: biggest in summer, small in autumn, and nothing grows in winter.',
      ),
      L(
        'Badanie słoików zwiększa plon, a zielarstwo daje czasem lek przy zbiorze.',
        'The jars research raises the yield, and herbalism sometimes gives a pack of meds at harvest.',
      ),
    ],
    fakty: [fakt('plon', L('Plon co 3 dni (porcje)', 'Yield every 3 days (portions)'), sezony(GARDEN_YIELD))],
    zobacz: [
      'zasob:jedzenie',
      'budowla:szklarnia',
      'budowla:pieczarkarnia',
      'badanie:t_konserwy',
      'badanie:t_zielarstwo',
    ],
  }),

  zasieki: () => ({
    zdania: [
      L(
        'Zasieki to kafelek ze złomu na odcinku siatki.',
        'The barricade is a tile of scrap on a stretch of the fence.',
      ),
      L(
        'Są mocniejsze od zwykłej siatki i łaty, a postawione na dziurze zamykają ją.',
        'It is stronger than the plain fence and than a patch, and built over a hole it closes it.',
      ),
    ],
    fakty: [fakt('wytrzymalosc', L('Wytrzymałość kafelka', 'Tile durability'), `${ZASIEKI_HP}`)],
    zobacz: ['zasob:zlom', 'budowla:barykada', 'noc:napad', 'zombie:siatka'],
  }),

  pracownia: () => ({
    zdania: [
      L(
        'Pracownia to stół z lampą i półką na książki, przy którym badają nowe technologie.',
        'The research room is a desk with a lamp and a bookshelf where people research new technologies.',
      ),
      L(
        `Przy stole siedzą naraz najwyżej ${RESEARCH_SEATS} osoby, a pracownia jest jedna na grę.`,
        `At most ${RESEARCH_SEATS} people sit at the desk at once, and there is only one research room per game.`,
      ),
      L(
        'Od chwili, gdy stoi, na pasku pojawia się przycisk „Badania” z tablicą badań.',
        'Once it stands, a “Research” button with the Research board appears on the top bar.',
      ),
    ],
    fakty: [fakt('miejsca', L('Miejsca przy stole', 'Seats at the desk'), `${RESEARCH_SEATS}`)],
    zobacz: ['badania:jak', 'badania:wiedza', 'praca:badania'],
  }),

  koza_beczka: (c) => ({
    zdania: [
      L(
        'Koza z beczki to druga koza, którą stawia się w pokoju, kuchni albo przedpokoju, blisko okna.',
        'The barrel stove is a second stove that stands in a room, the kitchen or the hallway, near a window.',
      ),
      L(
        'Rura idzie przez okno, więc nie stanie w głębi pomieszczenia.',
        'The flue goes out through the window, so it cannot stand deep inside a room.',
      ),
      L(
        `Grzeje swoje pomieszczenie i pali drewno tak samo jak koza w kuchni; ${c.words.zarzad.m} dokłada do niej sam.`,
        `It heats its own room and burns wood just like the kitchen stove; ${c.e.krotko} feeds it on its own.`,
      ),
    ],
    fakty: [
      fakt('zasieg-okna', L('Od okna najwyżej', 'At most from a window'), `${ZASIEG_OKNA} m`),
      fakt('zuzycie', L('Zużycie drewna (koza = 1)', 'Wood use (stove = 1)'), `${PALENISKA.koza_beczka}`),
    ],
    zobacz: ['zasob:koza', 'badanie:t_kozy', 'zasob:drewno', 'potrzeba:warm'],
  }),

  kociol: (c) => ({
    zdania: [
      L(
        'Kocioł grzeje naraz całą siedzibę, ale pali dużo drewna.',
        'The boiler heats the whole HQ at once, but it burns a lot of wood.',
      ),
      L(
        c.dom
          ? 'Stoi w przedpokoju domu.'
          : 'Stoi na klatce schodowej siedziby, skąd ciepło idzie do mieszkań zarządu.',
        c.dom
          ? 'It stands in the hallway of the house.'
          : 'It stands in the HQ stairwell, from where heat goes to the board’s flats.',
      ),
      L(
        `${c.words.Zarzad} dokłada do niego sam, jak do kozy.`,
        `${c.e.Zarzad} feeds it on its own, as it does the stove.`,
      ),
    ],
    fakty: [
      fakt('zuzycie', L('Zużycie drewna (koza = 1)', 'Wood use (stove = 1)'), `${PALENISKA.kociol}`),
      fakt(
        'zbiornik',
        L('Zbiornik', 'Tank'),
        L(`${KOZA_CAP * PALENISKA.kociol} szt. drewna`, `${KOZA_CAP * PALENISKA.kociol} pieces of wood`),
      ),
    ],
    zobacz: ['zasob:koza', 'badanie:t_wezel', 'zasob:drewno', 'potrzeba:warm'],
  }),

  pieczarkarnia: () => ({
    zdania: [
      L(
        'Pieczarkarnia rośnie w łazience, w ciemności i wilgoci.',
        'The mushroom farm grows in a bathroom, in the dark and the damp.',
      ),
      L(
        'Plon jest mały, ale taki sam przez cały rok, także zimą, kiedy ogródek nic nie daje.',
        'The yield is small but the same all year round, winter included, when a vegetable patch gives nothing.',
      ),
    ],
    fakty: [fakt('plon', L('Plon co 3 dni (porcje)', 'Yield every 3 days (portions)'), `${PIECZARKI_PLON}`)],
    zobacz: ['zasob:jedzenie', 'budowla:ogrodek', 'badanie:t_grzyby'],
  }),

  szklarnia: () => ({
    zdania: [
      L(
        'Szklarnia działa jak ogródek, ale zimą rodzi tak jak jesienią.',
        'The greenhouse works like a vegetable patch, but in winter it yields as it does in autumn.',
      ),
      L(
        'Stoi na podwórku i zajmuje więcej miejsca niż zwykła grządka.',
        'It stands in the yard and takes up more room than a plain bed.',
      ),
    ],
    fakty: [
      fakt(
        'plon',
        L('Plon co 3 dni (porcje)', 'Yield every 3 days (portions)'),
        sezony(GARDEN_YIELD.map((v, i) => (i === 1 ? GARDEN_YIELD[0] : v))),
      ),
    ],
    zobacz: ['zasob:jedzenie', 'budowla:ogrodek', 'badanie:t_szklarnia'],
  }),

  barykada: () => ({
    zdania: [
      L(
        'Barykada z wraków to najmocniejszy kafelek obwodu: zamyka dziurę lepiej niż zasieki.',
        'The wreck wall is the strongest tile of the perimeter: it closes a hole better than the barricade.',
      ),
      L('Kosztuje głównie złom.', 'It costs mostly scrap.'),
    ],
    fakty: [fakt('wytrzymalosc', L('Wytrzymałość kafelka', 'Tile durability'), `${BARYKADA_HP}`)],
    zobacz: ['zasob:zlom', 'budowla:zasieki', 'badanie:t_barykady', 'zombie:siatka'],
  }),

  wieza: () => ({
    zdania: [
      L(
        'Wieża z rusztowań to posterunek, z którego widać całe podwórko.',
        'The scaffolding tower is a post from which you can see the whole yard.',
      ),
      L(
        'Na karcie nocy pojawia się „Warta na wieży”: stojący tam dokłada połowę swojej warty do obrony każdego innego posterunku.',
        'The Night orders gain a “Watch on the tower” post: whoever stands there adds half their watch to the defence of every other post.',
      ),
      L(
        `Jego lampa płoszy ${num(WIEZA_ZASIEG)} raza dalej, a w trybie zombie broń dystansowa sięga z wieży dalej.`,
        `Their lamp scares things off ${num(WIEZA_ZASIEG)} times as far, and in Zombie mode ranged weapons reach further from the tower.`,
      ),
      L('Można mieć jedną.', 'You can have one.'),
    ],
    zobacz: ['noc:warta', 'badanie:t_wieza', 'bron:rewolwer'],
  }),
};

function budowla(kind: BuildKind): Def {
  return def(
    `budowla:${kind}`,
    'budowle',
    () => buildName(kind),
    (c): Tresc => {
      const o = OPISY[kind](c);
      const d = BUILDS[kind];
      const tech = d.tech;
      const kroki = [
        ...(tech
          ? [
              L(
                `Najpierw zbadajcie „${tr(nazwaTech(tech))}” na tablicy badań.`,
                `First research “${tr(nazwaTech(tech))}” on the Research board.`,
              ),
            ]
          : []),
        L(
          `Otwórzcie panel Budowa (przycisk u góry${c.touch ? '' : ' albo klawisz B'}), zakładka ${cyt(ZAKLADKA[d.cat][0], ZAKLADKA[d.cat][1])}, i wybierzcie ${wCyt(buildName(kind))}.`,
          `Open the Build panel (the button at the top${c.touch ? '' : ' or the B key'}), the ${cyt(ZAKLADKA[d.cat][0], ZAKLADKA[d.cat][1])} tab, and pick ${wCyt(buildName(kind))}.`,
        ),
        c.touch
          ? L(
              'Plan jedzie za palcem: stuknięcie go stawia, przyciski na dole obracają i anulują. Zielony plan da się postawić, czerwony mówi, czemu nie.',
              'The plan follows your finger: a tap places it, the buttons at the bottom rotate and cancel. A green plan fits; a red one tells you why not.',
            )
          : L(
              'Plan jedzie za kursorem: lewy klik go stawia, R obraca, prawy klik albo Esc anuluje. Zielony plan da się postawić, czerwony mówi, czemu nie.',
              'The plan follows the cursor: left-click places it, R rotates, right-click or Esc cancels. A green plan fits; a red one tells you why not.',
            ),
        L(
          `${c.words.Zarzad} sam przynosi materiały i buduje.`,
          `${c.e.Zarzad} fetches the materials and does the building.`,
        ),
      ];
      return {
        zdania: o.zdania,
        fakty: [...faktyBudowli(kind, c), ...(o.fakty ?? [])],
        jak: kroki,
        zobacz: [...(tech ? [`badanie:${tech}`] : []), ...(o.zobacz ?? []), 'budowle:jak'],
      };
    },
  );
}

export function definicjeBudowle(): Def[] {
  return [
    def(
      'budowle:jak',
      'budowle',
      () => L('Jak działa budowa', 'How building works'),
      (c) => ({
        zdania: [
          L(
            `Plan budowli stawia się na mapie, a ${c.words.zarzad.m} sam przynosi materiały i buduje.`,
            `You place a building plan on the map, and ${c.e.krotko} fetches the materials and does the building.`,
          ),
          L(
            'Panel Budowa ma zakładki Dom, Podwórko i Obwód; każda budowla ma miniaturę, koszt, czas pracy i działanie.',
            'The Build panel has Home, Yard and Perimeter tabs; each building shows a thumbnail, cost, work time and effect.',
          ),
          L(
            'Budowle z badań są zamknięte kłódką, dopóki nie zbadacie odpowiedniej technologii; świeżo odblokowane mają znaczek NOWE.',
            'Buildings from research are padlocked until you research the matching technology; freshly unlocked ones carry a NEW tag.',
          ),
          L(
            'Rozebranie gotowej budowli zwraca około połowy kosztu, a odwołanie planu zostawia doniesione materiały na ziemi.',
            'Tearing down a finished building returns about half the cost, and cancelling a plan leaves the delivered materials on the ground.',
          ),
        ],
        fakty: (['dom', 'podworko', 'obwod'] as BuildCat[]).map((cat) =>
          fakt(
            `zakladka-${cat}`,
            zakladka(cat),
            (Object.keys(BUILDS) as BuildKind[])
              .filter((k) => BUILDS[k].cat === cat)
              .map((k) => buildName(k))
              .join(', '),
          ),
        ),
        jak: [
          c.touch
            ? L(
                'Przycisk Budowa u góry otwiera panel; po wyborze plan jedzie za palcem, stuknięcie go stawia.',
                'The Build button at the top opens the panel; once you pick a building the plan follows your finger, and a tap places it.',
              )
            : L(
                'Przycisk Budowa u góry albo klawisz B otwiera panel; po wyborze plan jedzie za kursorem, lewy klik go stawia.',
                'The Build button at the top, or the B key, opens the panel; once you pick a building the plan follows the cursor, and left-click places it.',
              ),
          L(
            `Gotową budowlę rozbiera się z menu poleceń przy niej (${c.touch ? 'przytrzymanie palca' : 'prawy przycisk'}): „Rozebrać …”, z potwierdzeniem.`,
            `Tear a finished building down from the order menu on it (${c.touch ? 'press and hold' : 'right-click'}): “Tear down …”, with a confirmation.`,
          ),
        ],
        zobacz: ['budowla:warsztat', 'zasob:odzysk', 'badania:jak', 'praca:budowa'],
      }),
      'budować plan panel budowy rozbiórka kłódka',
    ),
    ...(Object.keys(BUILDS) as BuildKind[]).map(budowla),
  ];
}
