/* Wiki w grze, kategoria „Badania”: jak działają badania (pracownia, tablica, wiedza osady, książki, ery, dziedziny) i po
   jednym artykule na każdą technologię z `TECHS` (src/sim/badania.ts). Fakty technologii liczą się z tabeli: era, dziedzina,
   poziom wiedzy (`lvl`), koszt w punktach (`kosztTech`, z mnożnikiem ery), wymagania (`req`), budowle, które odblokowuje
   (`odblokowuje`), tryb gry i to, czy technologia już działa (`dziala`). Zdania o działaniu technologii, które działają,
   piszemy tu ze stałych (`OKNA_PLUS`, `KONSERWY_PLON`, `SPAWANIE_TEMPO`…) i ze słownika miejsca, bo opisy z tabeli mówią
   o „naszych mieszkaniach” także w domu; technologie, które jeszcze nie działają, mają opis z tabeli (albo „Do tego trzeba
   prądu”) i zdanie, że karta leży odwrócona. */

import { DOM_EN } from '../content/data.en.ts';
import { DOM, TECH_DOMS, type TechDom } from '../content/data.ts';
import { L, mnogaPl, tr } from '../core/jezyk.ts';
import {
  AMBU_TEMPO,
  dodajKsiazke,
  ERY,
  KONSERWY_PLON,
  KOSZT_ERY,
  kosztDoPokazania,
  kosztTech,
  maWlasnyOpis,
  nazwaEry,
  nazwaTech,
  OKNA_PLUS,
  RESEARCH_SEATS,
  SPAWANIE_TEMPO,
  SZANSA_KSIAZKI,
  TECHS,
  TEMPO_BAZOWE,
  type TechNowa,
  tempoOsoby,
  ZIELARSTWO_SZANSA,
} from '../sim/badania.ts';
import type { BuildKind } from '../sim/budowle.ts';
import { TEMPO_KROK } from '../sim/praca.ts';
import type { SimState } from '../sim/sim.ts';
import { buildName } from './budowa.ts';
import { num } from './tekst.ts';
import { cyt, listaI, polecenie, proc } from './wiki-slowa.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';

/** nazwa dziedziny w bieżącym języku */
export const domNazwa = (d: TechDom): string => L(DOM[d], DOM_EN[d]);

/** ile książek z jednej dziedziny liczy się do wiedzy: sprawdza to sama półka (`dodajKsiazke`), bez kopiowania liczby */
let KSIAZEK: number | null = null;
function ksiazekNaDziedzine(): number {
  if (KSIAZEK === null) {
    const st = {} as SimState;
    let n = 0;
    while (dodajKsiazke(st, 'bud') === 'polka' && n < 99) n++;
    KSIAZEK = n;
  }
  return KSIAZEK;
}

/** mnożnik tempa badań od cechy, liczony z `tempoOsoby` (bez kopiowania liczb: pracowity, leniwy, Mistrz Excela) */
const mnoznikCechy = (cecha: string): number =>
  tempoOsoby({ skills: {}, traits: [cecha] }, 'bud') / tempoOsoby({ skills: {}, traits: [] }, 'bud');

/** nazwy budowli odblokowywanych przez technologię */
const budowlyTech = (t: TechNowa): string[] => t.odblokowuje.map((k) => buildName(k as BuildKind));

/** Zdanie o działaniu technologii, która działa: z liczbami ze stałych i słowami miejsca (dom: „naszego domu”). Technologie
    bez wpisu tutaj biorą opis z tabeli (`TechNowa.dzialanie`); test sprawdza, że w domu nie ma w nim słów z bloku. */
const DZIALANIE: Record<string, (c: WikiCtx) => string> = {
  t_kozy: (c) =>
    L(
      `Koza z beczki do postawienia w pokoju, kuchni albo przedpokoju ${c.words.lokal.d}, blisko okna (rura przez okno). Grzeje pokój jak koza w kuchni i tak samo pali drewno. ${c.words.Zarzad} dokłada do niej sam.`,
      `A potbelly stove made from a barrel, set up in a room, the kitchen or the hallway of ${c.e.lokal.w}, close to a window (the flue goes out through it). Heats the room like the kitchen stove and burns wood the same way. ${c.e.Zarzad} stokes it on its own.`,
    ),
  t_okna: (c) =>
    L(
      `+${OKNA_PLUS}°C w pomieszczeniach ${c.words.lokal.d}, za darmo.`,
      `+${OKNA_PLUS}°C in the rooms of ${c.e.lokal.w}, free of charge.`,
    ),
  t_konserwy: () =>
    L(
      `+${Math.round((KONSERWY_PLON - 1) * 100)}% plonu ogródków, szklarni i pieczarkarni.`,
      `+${Math.round((KONSERWY_PLON - 1) * 100)}% yield from vegetable patches, greenhouses and mushroom farms.`,
    ),
  t_zielarstwo: () =>
    L(
      `Ogródek przy plonie daje czasem lek: jeden lek z szansą 1 do ${Math.round(1 / ZIELARSTWO_SZANSA)}.`,
      `A vegetable patch sometimes gives meds at harvest: one med, with a one in ${Math.round(1 / ZIELARSTWO_SZANSA)} chance.`,
    ),
  t_spawanie: () =>
    L(
      `Warsztat robi części ${num(SPAWANIE_TEMPO)}× szybciej.`,
      `The workshop makes parts ${num(SPAWANIE_TEMPO)}× faster.`,
    ),
  t_wezel: (c) =>
    c.dom
      ? L(
          'Kocioł w przedpokoju domu grzeje naraz cały dom, ale pali dużo drewna. Komitet ulicy dokłada do niego sam.',
          'A boiler in the hallway of the house heats the whole house at once, but burns a lot of wood. The street committee stokes it on its own.',
        )
      : L(
          'Kocioł na klatce siedziby grzeje naraz wszystkie nasze mieszkania, ale pali dużo drewna. Zarząd dokłada do niego sam.',
          'A boiler in the HQ stairwell heats all your flats at once, but burns a lot of wood. The board stokes it on its own.',
        ),
  t_grzyby: (c) =>
    L(
      `Pieczarkarnia w łazience ${c.words.lokal.d}. Plon mniejszy niż w ogródku wiosną i latem, ale taki sam przez cały rok, także zimą.`,
      `A mushroom farm in the bathroom of ${c.e.lokal.w}. A smaller yield than a vegetable patch in spring and summer, but the same all year round, winter included.`,
    ),
  t_ambu: () =>
    L(
      `Zdrowie wraca ${num(AMBU_TEMPO)}× szybciej (rany po walce, wychłodzenie, głód).`,
      `Health comes back ${num(AMBU_TEMPO)}× faster (wounds from fighting, chill, hunger).`,
    ),
  t_fabryka_hum: (c) =>
    L(
      `Fabryka humanoidalnych żołnierzy. Wyjdą z ${c.words.brama.d} i oczyszczą miasto ze szwendaczy.`,
      `A factory of humanoid soldiers. They will march out of ${c.e.brama} and clear the city of walkers.`,
    ),
};

/** zdanie o technologii: własne z `DZIALANIE`, inaczej z tabeli */
const opisTech = (t: TechNowa, c: WikiCtx): string => (DZIALANIE[t.id] ? DZIALANIE[t.id](c) : tr(t.dzialanie));

/** poziom wiedzy w tekście: „1” … „4” */
const poziomy = (t: TechNowa): number => t.lvl;

function faktyTech(t: TechNowa): Fakt[] {
  const budowle = budowlyTech(t);
  return [
    fakt('era', L('Era', 'Era'), `${t.era}: ${tr(nazwaEry(t.era))}`),
    fakt('dziedzina', L('Dziedzina', 'Field'), domNazwa(t.dom)),
    fakt('poziom', L('Wymagana wiedza osady', 'Knowledge needed'), `${poziomy(t)}`),
    fakt(
      'koszt',
      L('Koszt', 'Cost'),
      L(`${kosztDoPokazania(kosztTech(t.id))} pkt`, `${kosztDoPokazania(kosztTech(t.id))} pts`),
    ),
    fakt(
      'wymaga',
      L('Najpierw trzeba zbadać', 'Research first'),
      t.req.length ? t.req.map((r) => tr(nazwaTech(r))).join(', ') : L('nic', 'nothing'),
    ),
    fakt(
      'odblokowuje',
      L('Odblokowuje', 'Unlocks'),
      budowle.length
        ? budowle.join(', ')
        : t.dziala
          ? L('premię, bez nowej budowli', 'a bonus, no new building')
          : L('nic na razie', 'nothing yet'),
    ),
    fakt(
      'stan',
      L('W grze', 'In the game'),
      t.dziala
        ? L('działa', 'works')
        : L('jeszcze nie działa: karta leży odwrócona', 'does not work yet: the card is face down'),
    ),
    ...(t.tryb
      ? [
          fakt(
            'tryb',
            L('Tryb gry', 'Game mode'),
            t.tryb === 'zombie'
              ? L('tylko tryb zombie', 'Zombie mode only')
              : L('tylko tryb zwykły', 'Normal mode only'),
          ),
        ]
      : []),
    ...(t.id === 't_okna' ? [fakt('liczba', L('Premia', 'Bonus'), `+${OKNA_PLUS}°C`)] : []),
  ];
}

function technologia(t: TechNowa): Def {
  return def(
    `badanie:${t.id}`,
    'badania',
    () => tr(nazwaTech(t.id)),
    (c): Tresc => {
      const nazwa = tr(nazwaTech(t.id));
      const budowle = budowlyTech(t);
      const zdania = [
        L(
          `„${nazwa}” to technologia z ery ${t.era} („${tr(nazwaEry(t.era))}”), z dziedziny: ${domNazwa(t.dom).toLowerCase()}.`,
          `“${nazwa}” is an era ${t.era} technology (“${tr(nazwaEry(t.era))}”) in ${domNazwa(t.dom)}.`,
        ),
        t.dziala
          ? opisTech(t, c)
          : maWlasnyOpis(t)
            ? L(
                `${opisTech(t, c)} Na razie nie da się jej zbadać: karta na tablicy leży odwrócona, bo czeka na prąd.`,
                `${opisTech(t, c)} It cannot be researched yet: its card on the research board lies face down, waiting for power.`,
              )
            : L(
                'Do tego trzeba prądu: na razie nie da się jej zbadać, karta na tablicy leży odwrócona.',
                'This needs power: it cannot be researched yet, and its card on the research board lies face down.',
              ),
        L(
          `Badanie kosztuje ${mnogaPl(kosztDoPokazania(kosztTech(t.id)), 'punkt', 'punkty', 'punktów')}, a osada musi znać dziedzinę na poziomie ${poziomy(t)}.`,
          `Research costs ${kosztDoPokazania(kosztTech(t.id))} points, and the settlement must know the field at level ${poziomy(t)}.`,
        ),
        t.req.length
          ? L(
              `Najpierw trzeba zbadać: ${listaI(t.req.map((r) => tr(nazwaTech(r))))}.`,
              `You have to research this first: ${listaI(t.req.map((r) => tr(nazwaTech(r))))}.`,
            )
          : L('Nie wymaga żadnych innych badań.', 'It needs no other research.'),
        ...(budowle.length ? [L(`Odblokowuje: ${listaI(budowle)}.`, `It unlocks: ${listaI(budowle)}.`)] : []),
      ];
      return {
        zdania,
        fakty: faktyTech(t),
        jak: t.dziala
          ? [
              L(
                'Postawcie pracownię (panel Budowa, zakładka Dom), a potem otwórzcie tablicę badań.',
                'Build a research room (Build panel, Home tab), then open the Research board.',
              ),
              L(
                `Na tablicy wybierzcie kartkę ${cyt(nazwaPl(t), nazwa)} i ${cyt('Badać', 'Research')}; badają zaznaczeni ludzie przy stole.`,
                `On the research board pick the card ${cyt(nazwaPl(t), nazwa)} and ${cyt('Badać', 'Research')}; the people you have selected research it at the desk.`,
              ),
              polecenie(c, ['pracowni', 'the research room'], [`Badać: ${nazwaPl(t)}`, `Research: ${nazwa}`]),
            ]
          : [],
        zobacz: [
          ...t.req.map((r) => `badanie:${r}`),
          ...t.odblokowuje.map((k) => `budowla:${k}`),
          'badania:jak',
          'badania:dziedziny',
        ],
      };
    },
  );
}

/** polska nazwa technologii (do polecenia w menu, które w angielskiej wersji ma angielską nazwę po dwukropku) */
const nazwaPl = (t: TechNowa): string => nazwaTech(t.id).pl;

export function definicjeBadania(): Def[] {
  return [
    def(
      'badania:jak',
      'badania',
      () => L('Jak działają badania', 'How research works'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              'Badania dają nowe budowle i premie: stawiacie pracownię, wybieracie kartkę na tablicy badań, a przy stole siadają ludzie.',
              'Research gives new buildings and bonuses: you build a research room, pick a card on the Research board, and people sit down at the desk.',
            ),
            L(
              `Przy stole pracują naraz najwyżej ${RESEARCH_SEATS} osoby, a im lepiej ktoś zna dziedzinę, tym szybciej idzie.`,
              `At most ${RESEARCH_SEATS} people work at the desk at once, and the better someone knows the field, the faster it goes.`,
            ),
            L(
              'Badanie można zacząć dopiero wtedy, gdy zbadane są wymagania, a wiedza osady w dziedzinie dorównuje jego poziomowi.',
              'A research can start only once its requirements are done and the settlement’s knowledge of the field matches its level.',
            ),
            L(
              `Po ukończeniu pojawia się karta „Odkrycie”, a ${w.zarzad.m} zyskuje trochę zaufania.`,
              `When it finishes a “Discovery” card appears, and ${e.krotko} gains a little trust.`,
            ),
          ],
          fakty: [
            fakt('miejsca', L('Miejsca przy stole', 'Seats at the desk'), `${RESEARCH_SEATS}`),
            fakt(
              'tempo',
              L('Tempo bazowe', 'Base speed'),
              L(`${num(TEMPO_BAZOWE)} pkt na godzinę`, `${num(TEMPO_BAZOWE)} pts per hour`),
            ),
            fakt('umiejetnosc', L('Każdy poziom umiejętności', 'Each skill level'), `+${proc(TEMPO_KROK)}`),
            ...[...new Set(TECHS.map((t) => t.era))]
              .sort((a, b) => a - b)
              .map((era) =>
                fakt(
                  `era-${era}`,
                  L(`Mnożnik kosztu, era ${era}`, `Cost multiplier, era ${era}`),
                  `×${num(KOSZT_ERY[era])}`,
                ),
              ),
          ],
          jak: [
            c.touch
              ? L(
                  'Pracownię stawia się w panelu budowy, w zakładce Dom. Kiedy stoi, przycisk Badania u góry otwiera tablicę badań.',
                  'The research room is built in the build panel, on the Home tab. Once it stands, the Research button at the top opens the Research board.',
                )
              : L(
                  'Pracownię stawia się w panelu budowy, w zakładce Dom. Kiedy stoi, przycisk Badania u góry albo klawisz T otwiera tablicę badań.',
                  'The research room is built in the build panel, on the Home tab. Once it stands, the Research button at the top, or the T key, opens the Research board.',
                ),
            polecenie(c, ['pracowni', 'the research room'], ['Badać: …', 'Research: …']),
          ],
          zobacz: [
            'budowla:pracownia',
            'badania:wiedza',
            'badania:ksiazki',
            'badania:ery',
            'badania:dziedziny',
            'praca:badania',
          ],
        };
      },
      'tablica badań technologie odkrycie pracownia research',
    ),

    def(
      'badania:wiedza',
      'badania',
      () => L('Wiedza osady', 'Settlement knowledge'),
      (c) => {
        const { words: w, e } = c;
        return {
          zdania: [
            L(
              `Wiedza w dziedzinie to najwyższa umiejętność wśród osób z ${w.zarzad.dk} i ${w.mieszkancy.d} siedziby, które są na miejscu, plus książki z tej dziedziny.`,
              `Knowledge in a field is the highest skill among the people from ${e.krotko} and the ${e.mieszkancy} of the HQ who are on site, plus the books in that field.`,
            ),
            L(
              `Do wiedzy liczą się najwyżej ${ksiazekNaDziedzine()} książki z jednej dziedziny.`,
              `At most ${ksiazekNaDziedzine()} books from one field count towards it.`,
            ),
            L(
              'Kto jest na wyprawie albo nie żyje, wiedzy nie daje; goście i ludzie z innych budynków też nie.',
              'Whoever is out on a supply run or dead adds nothing, and neither do guests or people from other buildings.',
            ),
            L(
              'Tablica badań mówi, kto w osadzie zna dane pole i czego brakuje, gdy karta stoi.',
              'The Research board shows who in the settlement knows a field and what is missing when a card is stuck.',
            ),
          ],
          fakty: [
            fakt('ksiazki', L('Książek na dziedzinę', 'Books per field'), `${ksiazekNaDziedzine()}`),
            fakt(
              'pracowity',
              L('Pracowity, przy stole', 'Hard-working, at the desk'),
              `×${num(mnoznikCechy('pracowity'), 2)}`,
            ),
            fakt('leniwy', L('Leniwy, przy stole', 'Lazy, at the desk'), `×${num(mnoznikCechy('leniwy'), 2)}`),
            fakt(
              'excel',
              L('Mistrz Excela, przy stole', 'Excel wizard, at the desk'),
              `×${num(mnoznikCechy('excel'), 2)}`,
            ),
          ],
          zobacz: ['badania:jak', 'badania:ksiazki', 'ludzie:umiejetnosci', 'ludzie:cechy', 'badania:dziedziny'],
        };
      },
      'umiejętność poziom wiedza knowledge',
    ),

    def(
      'badania:ksiazki',
      'badania',
      () => L('Książki', 'Books'),
      (c) => ({
        zdania: [
          L(
            'Przeszukiwane pomieszczenia czasem kryją książkę z jednej z sześciu dziedzin.',
            'Rooms you search sometimes hide a book from one of the six fields.',
          ),
          L(
            `Książka na półce osady dodaje 1 do wiedzy w swojej dziedzinie, ale liczą się najwyżej ${ksiazekNaDziedzine()} na dziedzinę.`,
            `A book on the settlement’s shelf adds 1 to knowledge in its field, but at most ${ksiazekNaDziedzine()} per field count.`,
          ),
          L(
            'Każda następna książka z tej samej dziedziny idzie na podpałkę i daje trochę drewna.',
            'Every further book from the same field goes for kindling and gives a little wood.',
          ),
        ],
        fakty: [
          fakt(
            'mieszkanie',
            L('Szansa w jednym przeszukanym pomieszczeniu siedziby', 'Chance per searched room at HQ'),
            proc(SZANSA_KSIAZKI.mieszkanie),
          ),
          fakt(
            'szkola',
            L('Szansa w sali szkoły u sąsiadów', 'Chance per school room next door'),
            proc(SZANSA_KSIAZKI.szkola),
          ),
        ],
        jak: [
          c.words.szukanie.jak[c.touch ? 'dotyk' : 'mysz']
            ? L(c.words.szukanie.jak[c.touch ? 'dotyk' : 'mysz'], c.e.szukanie.jak[c.touch ? 'dotyk' : 'mysz'])
            : '',
        ].filter(Boolean),
        zobacz: ['badania:wiedza', 'badania:jak', 'zasob:odzysk'],
      }),
      'książka półka biblioteka podpałka',
    ),

    def(
      'badania:ery',
      'badania',
      () => L('Ery badań', 'Research eras'),
      () => {
        const dzialaja = ERY.filter((e) => TECHS.some((t) => t.era === e.nr && t.dziala)).map((e) => e.nr);
        const czekaja = ERY.filter((e) => !dzialaja.includes(e.nr)).map((e) => e.nr);
        return {
          zdania: [
            L(
              `Technologie leżą w ${ERY.length} erach, od pierwszych tygodni po sieć bez miedzi i fabrykę.`,
              `The technologies sit in ${ERY.length} eras, from the first weeks to the copper-free grid and the factory.`,
            ),
            L(
              'Im późniejsza era, tym droższe badanie: koszt kartki mnoży się przez mnożnik ery.',
              'The later the era, the dearer the research: a card’s cost is multiplied by the era multiplier.',
            ),
            czekaja.length
              ? L(
                  `Ery ${listaI(dzialaja.map(String))} działają w grze, a ${listaI(czekaja.map(String))} czekają na prąd i na tablicy mają karty odwrócone.`,
                  `Eras ${listaI(dzialaja.map(String))} work in the game, while ${listaI(czekaja.map(String))} wait for power and have their cards face down on the research board.`,
                )
              : L('Wszystkie ery działają w grze.', 'All eras work in the game.'),
          ],
          fakty: ERY.map((e) =>
            fakt(
              `era-${e.nr}`,
              `${e.nr}: ${tr(e.nazwa)}`,
              `×${num(KOSZT_ERY[e.nr])}; ${TECHS.filter((t) => t.era === e.nr)
                .map((t) => tr(nazwaTech(t.id)))
                .join(', ')}`,
            ),
          ),
          zobacz: ['badania:jak', 'badania:dziedziny', 'drogi:technologia'],
        };
      },
      'era epoka mnożnik prąd',
    ),

    def(
      'badania:dziedziny',
      'badania',
      () => L('Dziedziny wiedzy', 'Fields of knowledge'),
      () => ({
        zdania: [
          L(
            'Każda technologia należy do jednej z sześciu dziedzin: budowa, ciepło, elektryka, medycyna, uprawa i informatyka.',
            'Every technology belongs to one of six fields: building, heating, electrics, medicine, farming and IT.',
          ),
          L(
            'Umiejętność ludzi w danej dziedzinie wyznacza, jaką wiedzę osada ma do badań i jak szybko ktoś bada.',
            'People’s skill in a field sets the knowledge the settlement has for research and how fast someone researches.',
          ),
          L(
            'Ta sama umiejętność przyspiesza też pracę: budowa przyspiesza budowanie, ciepło drwala, uprawa gotowanie.',
            'The same skill also speeds up work: building speeds up construction, heating speeds up the woodcutter, farming speeds up cooking.',
          ),
        ],
        fakty: TECH_DOMS.map((d) =>
          fakt(
            `dziedzina-${d}`,
            domNazwa(d),
            TECHS.filter((t) => t.dom === d)
              .map((t) => tr(nazwaTech(t.id)))
              .join(', '),
          ),
        ),
        zobacz: ['ludzie:umiejetnosci', 'badania:wiedza', 'badania:ery', 'badania:jak'],
      }),
      'dziedzina umiejętność budowa ciepło elektryka medycyna uprawa informatyka',
    ),

    ...TECHS.map(technologia),
  ];
}
