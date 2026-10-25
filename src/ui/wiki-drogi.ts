/* Wiki w grze, kategoria „Drogi do zwycięstwa”: ekran dróg z Menu (src/ui/zwyciestwo.ts), po jednym artykule na każdą z pięciu
   dróg (`DROGI` w src/gov/zwyciestwo.ts: nazwa i kamienie milowe po polsku i angielsku) i artykuł o zwycięstwie z epilogiem.
   Nazwy dróg, kamienie, zdania „co dalej” i „Wkrótce” wiki bierze z `ocenDrogi` na świeżym stanie zarządu (czysta funkcja,
   bez losowania), więc gra i wiki mówią tym samym zdaniem, a liczby celu ludności, progów, poranków, głodu i zaufania z
   eksportowanych stałych (`PROGI_LUDNOSCI`, `celLudnosci`, `DNI_CELU`, `PORANEK`, `GLOD_PONIZEJ`, `ZAUFANIE_OD`).
   „Do zdobycia teraz” liczy się z tego, że gra podaje zdanie „co dalej” tylko przy kamieniu, który da się zaliczyć już
   teraz: gdy gra odblokuje kolejne kamienie, liczba rośnie sama. Kamienie są wspólne dla obu trybów, ale droga leku
   nazywa się w trybie zombie „Lek”, cel ludności jest wtedy o połowę niższy, a epilog technologii mówi o innej fabryce
   (`WikiCtx.zombie` wybiera nazwy; uwagi mówią o drugim trybie). */

import { WYBOR } from '../content/napisy-sasiedzi.ts';
import { L, mnogaPl, tr, wielka } from '../core/jezyk.ts';
import type { GameMode, GovInput } from '../gov/typy.ts';
import { newGov } from '../gov/zarzad.ts';
import {
  CEL_BEZ_DANYCH,
  CEL_MAX,
  CEL_MIN,
  celLudnosci,
  DNI_CELU,
  DROGI,
  type Droga,
  GLOD_PONIZEJ,
  nazwaDrogi,
  ocenDrogi,
  PORANEK,
  type PostepDrogi,
  PROGI_LUDNOSCI,
  wlaczZwyciestwo,
  ZAUFANIE_OD,
} from '../gov/zwyciestwo.ts';
import { nazwaTech } from '../sim/badania.ts';
import { NAPISY as OBCY } from '../sim/wedrowcy.ts';
import { manyEn, num } from './tekst.ts';
import { kliknijcie, listaI, polecenie, wCyt } from './wiki-slowa.ts';
import { type Def, def, type Fakt, fakt, type Tresc, type WikiCtx } from './wiki-typy.ts';
import { etykietaWyboru } from './wiki-wydarzenia.ts';

/** drogi w kolejności ekranu (tej, w której zwraca je `ocenDrogi`) */
export const DROGI_KOLEJNOSC: readonly Droga[] = ['technologia', 'teren', 'lek', 'ludnosc', 'cuda'];

const tryb = (c: WikiCtx): GameMode => (c.zombie ? 'zombie' : 'zwykly');

/** odczyt badań bez pracowni i bez badań: gra z badaniami, w której nic jeszcze nie stoi */
const BADANIA_PUSTE: NonNullable<GovInput['badania']> = {
  pracownia: false,
  zbadane: 0,
  era: 0,
  koncowa: false,
  siecWlaczona: false,
};

/** Wiersz drogi `d` tak, jak pokazuje go ekran dróg, gdy zarząd zaliczył `zaliczone` kamieni. `ocenDrogi` czyta z odczytu
    tylko ludność, badania, teren i miejsce, więc wystarcza mu odczyt z samych tych pól (bez ludzi, bez symulacji). */
export function wiersz(c: WikiCtx, d: Droga, zaliczone = 0, odczyt: Partial<GovInput> = {}): PostepDrogi {
  const st = newGov(1, tryb(c));
  wlaczZwyciestwo(st);
  st.zwyciestwo!.kamienie[d] = zaliczone;
  const wejscie = { people: [], place: c.place, badania: BADANIA_PUSTE, ...odczyt } as unknown as GovInput;
  return ocenDrogi(st, wejscie).find((p) => p.droga === d)!;
}

/** Ile pierwszych kamieni drogi da się zaliczyć już teraz: gra podaje zdanie „co dalej” tylko przy takim kamieniu. */
export function doZdobycia(c: WikiCtx, d: Droga): number {
  const wszystkie = DROGI[d].kamienie.length;
  let ile = 0;
  while (ile < wszystkie && wiersz(c, d, ile).dalej) ile++;
  return ile;
}

/** „Co dalej” drogi przy `zaliczone` kamieniach w bieżącym języku, jak na ekranie dróg (null: gra nic nie podaje) */
const dalej = (c: WikiCtx, d: Droga, zaliczone: number, odczyt: Partial<GovInput> = {}): string | null => {
  const t = wiersz(c, d, zaliczone, odczyt).dalej;
  return t ? tr(t) : null;
};

/** „Wkrótce: …” drogi przy `zaliczone` kamieniach w bieżącym języku (null: gra go nie pokazuje) */
const wkrotce = (c: WikiCtx, d: Droga, zaliczone: number, odczyt: Partial<GovInput> = {}): string | null => {
  const t = wiersz(c, d, zaliczone, odczyt).wkrotce;
  return t ? tr(t) : null;
};

/** nazwa drogi w bieżącym języku i trybie z kontekstu */
const nazwa = (c: WikiCtx, d: Droga): string => tr(nazwaDrogi(d, tryb(c)));

const kamien = (d: Droga, n: number): string => tr(DROGI[d].kamienie[n]);

/** numer czwartego kamienia drogi technologii (sieć bez miedzi): artykuł mówi o nim osobno */
const INDEKS_SIECI = 3;

const kamieni = (n: number): string =>
  L(mnogaPl(n, 'kamień', 'kamienie', 'kamieni'), manyEn(n, 'milestone', 'milestones'));

const osob = (n: number): string => L(mnogaPl(n, 'osoba', 'osoby', 'osób'), manyEn(n, 'person', 'people'));

/** Fakty wspólne dla każdej drogi: kamienie po kolei (jak na ekranie) i ile z nich da się zaliczyć już teraz. */
function faktyKamieni(c: WikiCtx, d: Droga): Fakt[] {
  const lista = DROGI[d].kamienie;
  return [
    ...lista.map((k, i) => fakt(`kamien-${i + 1}`, L(`Kamień ${i + 1}`, `Milestone ${i + 1}`), tr(k))),
    fakt(
      'teraz',
      L('Do zdobycia teraz', 'Can be earned now'),
      L(`${doZdobycia(c, d)} z ${lista.length}`, `${doZdobycia(c, d)} of ${lista.length}`),
    ),
  ];
}

/** Kamienie, które da się zaliczyć już teraz, jako lista w cudzysłowach („A” i „B”). */
const kamienieTeraz = (c: WikiCtx, d: Droga): string =>
  listaI(DROGI[d].kamienie.slice(0, doZdobycia(c, d)).map((k) => wCyt(tr(k))));

interface Opis {
  zdania: string[];
  uwaga?: string;
  fakty?: Fakt[];
  jak?: string[];
  zobacz?: string[];
}

const OPISY: Record<Droga, (c: WikiCtx) => Opis> = {
  technologia: (c) => {
    const n = doZdobycia(c, 'technologia');
    const dalsze = wkrotce(c, 'technologia', Math.max(n, 1));
    const siec = tr(nazwaTech('t_siec'));
    return {
      zdania: [
        L(
          `Droga ${wCyt(nazwa(c, 'technologia'))} to droga badań: od pracowni, przez sieć, której bakteria nie ruszy, do generatora fuzji i fabryki.`,
          `The ${wCyt(nazwa(c, 'technologia'))} road is the research road: from the research room, through a grid the bacterium cannot touch, to a fusion generator and a factory.`,
        ),
        n > 0
          ? L(
              `Już teraz da się zaliczyć ${kamienieTeraz(c, 'technologia')}.`,
              `You can already earn ${kamienieTeraz(c, 'technologia')}.`,
            )
          : L('Żadnego kamienia nie da się jeszcze zaliczyć.', 'No milestone can be earned yet.'),
        ...(dalsze ? [L(`Dalej ekran mówi: ${wCyt(dalsze)}`, `After that the screen says: ${wCyt(dalsze)}`)] : []),
        L(
          `Czwarty kamień, ${wCyt(kamien('technologia', INDEKS_SIECI))}, wymaga zbadania technologii „${siec}” i włączenia sieci w pracowni, czego nie da się cofnąć.`,
          `The fourth milestone, ${wCyt(kamien('technologia', INDEKS_SIECI))}, needs the “${siec}” technology researched and the grid switched on at the research room, which cannot be undone.`,
        ),
        L(
          `Ostatni kamień, ${wCyt(kamien('technologia', DROGI.technologia.kamienie.length - 1))}, kończy drogę zwycięstwem i epilogiem o fabryce.`,
          `The last milestone, ${wCyt(kamien('technologia', DROGI.technologia.kamienie.length - 1))}, ends the road with a victory and an epilogue about the factory.`,
        ),
      ],
      uwaga: c.zombie
        ? L(
            'Grasz w trybie zombie: fabryka z epilogu robi humanoidalnych żołnierzy, którzy czyszczą miasto ze szwendaczy.',
            'You are playing Zombie mode: the factory in the epilogue builds humanoid soldiers who clear the city of walkers.',
          )
        : L(
            'W trybie zombie fabryka z epilogu robi humanoidalnych żołnierzy, a w zwykłej grze, w której jesteście, bioroboty odporne na bakterię.',
            'In Zombie mode the factory in the epilogue builds humanoid soldiers; in the normal game, which you are playing, it builds biorobots the bacterium cannot touch.',
          ),
      fakty: [],
      jak: [
        ...[0, 1].map((k) => dalej(c, 'technologia', k)).filter((t): t is string => t !== null),
        polecenie(c, ['pracowni', 'the research room'], ['Włączyć sieć', 'Switch on the grid']),
      ],
      zobacz: ['budowla:pracownia', 'praca:badania', 'badanie:t_siec', 'badanie:t_fuzja'],
    };
  },

  teren: (c) => {
    const n = doZdobycia(c, 'teren');
    const dalsze = wkrotce(c, 'teren', 1);
    const przezJezdnie = wkrotce(c, 'teren', 0, { teren: { przylaczone: 0, mozliwe: 0 } });
    return {
      zdania: [
        L(
          `Droga ${wCyt(nazwa(c, 'teren'))} mierzy, jak daleko sięga wasz teren: od wspólnego płotu z pierwszym sąsiadem po dziewięć kwadratów miasta za murem.`,
          `The ${wCyt(nazwa(c, 'teren'))} road measures how far your ground reaches: from a shared fence with the first neighbour to nine city squares behind a wall.`,
        ),
        n > 0
          ? L(
              `Już teraz da się zaliczyć ${kamienieTeraz(c, 'teren')}: wspólny płot musi dołączyć do waszego obwodu choć jeden sąsiedni budynek.`,
              `You can already earn ${kamienieTeraz(c, 'teren')}: a shared fence has to bring at least one neighbouring building into your perimeter.`,
            )
          : L('Żadnego kamienia nie da się jeszcze zaliczyć.', 'No milestone can be earned yet.'),
        ...(przezJezdnie
          ? [
              L(
                `Tam, gdzie płot nie dosięga żadnego budynku (na przykład każdy stoi za jezdnią), ekran mówi zamiast tego: ${wCyt(przezJezdnie)}`,
                `Where a fence cannot reach any building (for example when each one stands across a road), the screen says instead: ${wCyt(przezJezdnie)}`,
              ),
            ]
          : []),
        ...(dalsze
          ? [
              L(
                `Pozostałe kamienie to dziś zapowiedź: ${wCyt(dalsze)}`,
                `The remaining milestones are only a promise for now: ${wCyt(dalsze)}`,
              ),
            ]
          : []),
      ],
      jak: [dalej(c, 'teren', 0)].filter((t): t is string => t !== null),
      zobacz: ['sasiedzi:plot', 'sasiedzi:teren', 'sasiedzi:budynki'],
    };
  },

  lek: (c) => {
    const brak = wkrotce(c, 'lek', 0);
    return {
      zdania: [
        L(
          `W zwykłej grze ta droga nazywa się ${wCyt(tr(nazwaDrogi('lek', 'zwykly')))}, a w trybie zombie ${wCyt(tr(nazwaDrogi('lek', 'zombie')))}.`,
          `In the normal game this road is called ${wCyt(tr(nazwaDrogi('lek', 'zwykly')))}, and in Zombie mode ${wCyt(tr(nazwaDrogi('lek', 'zombie')))}.`,
        ),
        L(
          `Jej kamienie to ${listaI(DROGI.lek.kamienie.map((k) => wCyt(tr(k))))}.`,
          `Its milestones are ${listaI(DROGI.lek.kamienie.map((k) => wCyt(tr(k))))}.`,
        ),
        brak
          ? L(
              `Na razie żadnego z nich nie da się zaliczyć, a ekran mówi: ${wCyt(brak)}`,
              `For now none of them can be earned, and the screen says: ${wCyt(brak)}`,
            )
          : L('Droga nie ma jeszcze wymagań.', 'The road has no requirements yet.'),
      ],
      zobacz: ['miasto:wyprawa', 'miasto:droga', 'miejsce:apteka', 'miejsce:przychodnia'],
    };
  },

  ludnosc: (c) => {
    const w = c.words;
    const e = c.e;
    const pierwsze = PROGI_LUDNOSCI.map(osob);
    const cel = (m: GameMode, ludnosc2021?: number): number => celLudnosci({ ludnosc2021 }, m);
    const zwykly = `${num(cel('zwykly', 1), 0)}–${num(cel('zwykly', 1e9), 0)}`;
    const zombie = `${num(cel('zombie', 1), 0)}–${num(cel('zombie', 1e9), 0)}`;
    const zombieOdDo = L(
      `od ${num(cel('zombie', 1), 0)} do ${num(cel('zombie', 1e9), 0)} osób`,
      `from ${num(cel('zombie', 1), 0)} to ${num(cel('zombie', 1e9), 0)} people`,
    );
    return {
      zdania: [
        L(
          `Droga ${wCyt(nazwa(c, 'ludnosc'))} liczy ludzi pod ${w.zarzad.n}: osoby z ${w.zarzad.dk} (także te na wyprawie) i ${w.mieszkancy.d} siedziby, ale nie ludzi z innych budynków.`,
          `The ${wCyt(nazwa(c, 'ludnosc'))} road counts the people under ${e.zarzad}: those in ${e.krotko} (including those out on a run) and the ${e.mieszkancy} of the HQ, but not people from other buildings.`,
        ),
        L(
          `Pierwsze kamienie to ${listaI(pierwsze)}, potem połowa celu i cel utrzymany przez ${DNI_CELU} poranków z rzędu.`,
          `The first milestones are ${listaI(pierwsze)}, then half the target and the target held for ${DNI_CELU} mornings in a row.`,
        ),
        L(
          `Cel to połowa ludności waszego kwadratu z 2021 roku według spisu, nie mniej niż ${CEL_MIN} i nie więcej niż ${CEL_MAX}, a bez danych spisu ${CEL_BEZ_DANYCH}.`,
          `The target is half the population of your square in 2021 according to the census, no less than ${CEL_MIN} and no more than ${CEL_MAX}, or ${CEL_BEZ_DANYCH} without census data.`,
        ),
        L(
          `Poranek liczy się do celu, gdy o ${PORANEK}:00 ludzi jest co najmniej tyle, co celu, nikt z ${w.zarzad.dk} nie ma jedzenia poniżej ${GLOD_PONIZEJ}, a zaufanie wynosi co najmniej ${ZAUFANIE_OD}.`,
          `A morning counts towards the target when at ${PORANEK}:00 there are at least as many people as the target, nobody from ${e.krotko} has food below ${GLOD_PONIZEJ}, and trust is at least ${ZAUFANIE_OD}.`,
        ),
        L(
          'Każdy inny poranek zeruje licznik, a kronika dopisuje wtedy zdanie o przerwanej serii.',
          'Any other morning resets the counter, and the chronicle adds a line about the broken run.',
        ),
      ],
      uwaga: c.zombie
        ? L(
            `Grasz w trybie zombie: cel jest o połowę niższy niż w zwykłej grze, ${zombieOdDo}.`,
            `You are playing Zombie mode: the target is half of the normal game’s, ${zombieOdDo}.`,
          )
        : L(
            `W trybie zombie cel jest o połowę niższy niż w zwykłej grze, ${zombieOdDo}.`,
            `In Zombie mode the target is half of the normal game’s, ${zombieOdDo}.`,
          ),
      fakty: [
        fakt('progi', L('Pierwsze kamienie', 'First milestones'), PROGI_LUDNOSCI.map((p) => osob(p)).join(', ')),
        fakt(
          'cel-zwykly',
          L('Cel w zwykłej grze', 'Target in the normal game'),
          L(`${zwykly} osób`, `${zwykly} people`),
        ),
        fakt('cel-zombie', L('Cel w trybie zombie', 'Target in Zombie mode'), L(`${zombie} osób`, `${zombie} people`)),
        fakt(
          'cel-bez-danych',
          L('Cel bez danych spisu', 'Target without census data'),
          L(`${cel('zwykly')} (zombie ${cel('zombie')})`, `${cel('zwykly')} (Zombie mode ${cel('zombie')})`),
        ),
        fakt('seria', L('Poranków z rzędu', 'Mornings in a row'), `${DNI_CELU}`),
        fakt('poranek', L('Liczy się o godzinie', 'Counted at'), `${PORANEK}:00`),
        fakt('glod', L('Głodny, gdy jedzenie poniżej', 'Hungry when food is below'), `${GLOD_PONIZEJ}`),
        fakt('zaufanie', L('Zaufanie co najmniej', 'Trust at least'), `${ZAUFANIE_OD}`),
      ],
      jak: [
        L(
          `Pierwszy kamień: zbierzcie ${osob(PROGI_LUDNOSCI[0])} pod ${w.zarzad.n}.`,
          `First milestone: get ${osob(PROGI_LUDNOSCI[0])} under ${e.zarzad}.`,
        ),
        L(
          `Ludzie przychodzą z kart gości (${wCyt(etykietaWyboru('zostan', c))}), od sąsiadów (${wCyt(tr(WYBOR.zaproszenie('')).replace(/\s*\(.*\)$/, ''))}) i spośród wędrowców (${wCyt(OBCY.zaprosicBez.pl)}). W trybie zombie zamiast wędrowców przychodzą ocalali.`,
          `People come from guest cards (${wCyt(etykietaWyboru('zostan', c))}), from next door (${wCyt(tr(WYBOR.zaproszenie('')).replace(/\s*\(.*\)$/, ''))}) and from wanderers (${wCyt(OBCY.zaprosicBez.en)}). In Zombie mode survivors come instead of wanderers.`,
        ),
      ],
      zobacz: ['potrzeba:food', 'wydarzenia:goscie', 'wydarzenia:wedrowcy', 'wydarzenia:werbunek', 'sasiedzi:budynki'],
    };
  },

  cuda: (c) => {
    const brak = wkrotce(c, 'cuda', 0);
    return {
      zdania: [
        L(
          `Droga ${wCyt(nazwa(c, 'cuda'))} ma kamienie: ${listaI(DROGI.cuda.kamienie.map((k) => wCyt(tr(k))))}.`,
          `The ${wCyt(nazwa(c, 'cuda'))} road has the milestones ${listaI(DROGI.cuda.kamienie.map((k) => wCyt(tr(k))))}.`,
        ),
        brak
          ? L(
              `Na razie żadnego z nich nie da się zaliczyć, a ekran mówi: ${wCyt(brak)}`,
              `For now none of them can be earned, and the screen says: ${wCyt(brak)}`,
            )
          : L('Droga nie ma jeszcze wymagań.', 'The road has no requirements yet.'),
      ],
      zobacz: [],
    };
  },
};

const SLOWA: Record<Droga, string> = {
  technologia: 'prąd bez miedzi fabryka fuzja sieć pracownia power without copper factory fusion grid',
  teren: 'za murem teren sąsiad kwadrat płot mur wall square neighbour fence',
  lek: 'wyłącznik pakiet premium lek cure kill switch',
  ludnosc: 'nowe osiedle ludność cel populacja population target new estate',
  cuda: 'cuda cud wonders',
};

function droga(d: Droga): Def {
  return def(
    `drogi:${d}`,
    'drogi',
    (c) => nazwa(c, d),
    (c): Tresc => {
      const o = OPISY[d](c);
      return {
        zdania: o.zdania,
        ...(o.uwaga ? { uwaga: o.uwaga } : {}),
        fakty: [...faktyKamieni(c, d), ...(o.fakty ?? [])],
        ...(o.jak?.length ? { jak: o.jak } : {}),
        zobacz: [...(o.zobacz ?? []), 'drogi:ekran', 'drogi:epilog'],
      };
    },
    `${SLOWA[d]} droga zwycięstwo road victory milestones kamienie milowe`,
  );
}

export function definicjeDrogi(): Def[] {
  return [
    def(
      'drogi:ekran',
      'drogi',
      () => L('Ekran dróg', 'The roads screen'),
      (c): Tresc => {
        const wszystkie = DROGI_KOLEJNOSC.map((d) => wiersz(c, d));
        return {
          zdania: [
            L(
              `Ekran „Drogi do zwycięstwa” otwiera się z Menu i pokazuje wszystkie drogi: ${listaI(wszystkie.map((p) => wCyt(tr(p.nazwa))))}.`,
              `The “Roads to victory” screen opens from the Menu and lists every road: ${listaI(wszystkie.map((p) => wCyt(tr(p.nazwa))))}.`,
            ),
            L(
              'Każda droga ma kamienie milowe po kolei: zaliczone mają znaczek, następny jest wyróżniony i ma pod sobą jedno zdanie o tym, co zrobić dalej, a reszta jest szara.',
              'Each road has its milestones in order: done ones have a tick, the next one is highlighted with one sentence under it on what to do next, and the rest are greyed out.',
            ),
            L(
              `Droga, której jeszcze nie da się przejść, ma zamiast wyróżnionego kamienia zdanie „Wkrótce: …”, a droga ${wCyt(nazwa(c, 'ludnosc'))} ma jeszcze pasek z liczbą ludzi i celem.`,
              `A road that cannot be walked yet has a “Coming soon: …” line instead of a highlighted milestone, and the ${wCyt(nazwa(c, 'ludnosc'))} road also has a bar with the number of people and the target.`,
            ),
            L(
              'Kamień raz zaliczony zostaje, także gdy ludzi ubędzie albo pracownię rozbierzecie, a każdy nowy dostaje wpis w kronice.',
              'A milestone, once done, stays done even if people leave or you tear the research room down, and each new one gets a line in the chronicle.',
            ),
            L(
              'Zwycięstwo nie kończy gry: możecie grać dalej.',
              'A victory does not end the game: you can keep playing.',
            ),
          ],
          fakty: [
            fakt('liczba', L('Dróg', 'Roads'), `${wszystkie.length}`),
            ...wszystkie.map((p) =>
              fakt(
                `droga-${p.droga}`,
                tr(p.nazwa),
                L(
                  `${kamieni(p.kamienie.length)}, do zdobycia teraz: ${doZdobycia(c, p.droga)}`,
                  `${kamieni(p.kamienie.length)}, can be earned now: ${doZdobycia(c, p.droga)}`,
                ),
              ),
            ),
          ],
          jak: [
            L(
              `${wielka(kliknijcie(c))} „Menu” u góry i wybierzcie „Drogi do zwycięstwa”. Gra stoi na pauzie, dopóki ekran jest otwarty.`,
              `${wielka(kliknijcie(c))} “Menu” at the top and pick “Roads to victory”. The game stays paused while the screen is open.`,
            ),
            c.touch
              ? L(
                  '„Wróć” wraca do Menu, a stuknięcie obok okna zamyka je.',
                  '“Back” returns to the Menu, and tapping outside the window closes it.',
                )
              : L(
                  '„Wróć” wraca do Menu, a Esc albo kliknięcie obok okna zamyka je.',
                  '“Back” returns to the Menu, and Esc or a click outside the window closes it.',
                ),
          ],
          zobacz: [
            'drogi:technologia',
            'drogi:teren',
            'drogi:lek',
            'drogi:ludnosc',
            'drogi:cuda',
            'drogi:epilog',
            'start:cele',
          ],
        };
      },
      'zwycięstwo wygrana kamienie milowe cele victory win milestones goals',
    ),
    ...DROGI_KOLEJNOSC.map(droga),
    def(
      'drogi:epilog',
      'drogi',
      () => L('Zwycięstwo i epilog', 'Victory and the epilogue'),
      (c): Tresc => ({
        zdania: [
          L(
            'Kiedy zaliczycie ostatni kamień którejś drogi, gra pokazuje okno zwycięstwa z nazwą drogi, krótką opowieścią i zdaniem o waszej ścieżce uchwał.',
            'When you earn the last milestone of a road, the game shows a victory window with the name of the road, a short story and a line about your path of resolutions.',
          ),
          L(
            'Okno pokazuje też cztery liczby: dzień, ludzi, zmarłych i uchwały.',
            'The window also shows four numbers: the day, people, deaths and resolutions.',
          ),
          L(
            'Zwycięstwo nie kończy gry: „Graj dalej” zamyka okno, a gra toczy się dalej na tym samym zapisie.',
            'A victory does not end the game: “Keep playing” closes the window and the game goes on with the same save.',
          ),
          L(
            '„Nowa gra” pyta o potwierdzenie i wraca na ekran startowy, a ta gra zostaje w zapisie, dopóki nowa jej nie nadpisze.',
            '“New game” asks for confirmation and goes back to the start screen, and this game stays saved until a new one overwrites it.',
          ),
          L(
            'Nagrody za zwycięstwo nie ma: zaufanie, wkurzenie i zapasy zostają takie, jakie były.',
            'There is no reward for a victory: trust, anger and supplies stay as they were.',
          ),
        ],
        ...(c.zombie
          ? {
              uwaga: L(
                'Grasz w trybie zombie: droga leku nazywa się w oknie zwycięstwa „Lek”.',
                'You are playing Zombie mode: the cure road is called “The cure” in the victory window.',
              ),
            }
          : {}),
        fakty: [
          fakt('przyciski', L('Przyciski', 'Buttons'), L('„Graj dalej”, „Nowa gra”', '“Keep playing”, “New game”')),
          fakt(
            'liczby',
            L('Liczby w oknie', 'Numbers in the window'),
            L('dzień, ludzie, zmarli, uchwały', 'day, people, deaths, resolutions'),
          ),
          fakt(
            'sciezki',
            L('Odmiany zdania o ścieżce', 'Versions of the path line'),
            L('Porządek, Wspólnota, Technokracja, brak ścieżki', 'Order, Community, Technocracy, no path'),
          ),
          fakt(
            'zapis',
            L('Zapis po zwycięstwie i po porażce', 'Save after a victory and after a defeat'),
            L('po zwycięstwie zostaje, po porażce znika', 'kept after a victory, deleted after a defeat'),
          ),
          fakt('powtorka', L('Ta sama droga', 'The same road'), L('wygrywa tylko raz', 'wins only once')),
          fakt(
            'kolejka',
            L('Dwie drogi naraz', 'Two roads at once'),
            L('okna jedno po drugim', 'the windows come one after the other'),
          ),
        ],
        zobacz: ['drogi:ekran', 'drogi:ludnosc', 'drogi:technologia'],
      }),
      'epilog zwycięstwo koniec graj dalej nowa gra victory epilogue keep playing',
    ),
  ];
}
