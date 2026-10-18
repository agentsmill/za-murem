/* Cele pierwszego dnia: kroki samouczka ze stanu symulacji (st.tut), drewno na noc i „przetrwać noc”
   z raportów zarządu. Czyste funkcje bez DOM: interfejs dostaje listę z tekstem celu i podpowiedzią
   do bieżącego kroku, w bieżącym języku (kroki samouczka to Tx, wybór przy rysowaniu). Zarząd i miejsce suchego
   drzewa według słownika miejsca (w domu komitet i ogród), po angielsku z wordsEn. */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { GovState } from '../gov/typy.ts';
import { START_KIT } from '../sim/bron.ts';
import { BUILDS_EN } from '../sim/budowle.en.ts';
import { BUILDS, type BuildKind } from '../sim/budowle.ts';
import { type SimState, SPEAR_BOARDS, SPEAR_SCRAP } from '../sim/sim.ts';
import { TUT_STEPS, type TutStep, WARM_ENOUGH } from '../sim/tutorial.ts';
import { costText } from './budowa.ts';
import { deg, manyEn } from './tekst.ts';

export interface Goal {
  key: TutStep | 'drewno' | 'noc' | 'przeszukaj' | 'budowla' | 'obwod' | 'dzida' | 'drewno2';
  text: string;
  /** jak to zrobić (tylko bieżący krok ma sens) */
  how: string;
  done: boolean;
  /** cel przepadł (noc przyszła bez zapasu drewna): skreślony, ale bez ptaszka */
  missed?: boolean;
}

/** tyle drewna na zapas (w składzie, luzem i w rękach) wystarcza, żeby koza dotrwała do snu */
export const NIGHT_WOOD = 6;

const WOOD_GOAL = tx('Przygotujcie drewno na noc.', 'Get wood in for the night.');

const CHOP = tx(
  'Rąbanie trwa chwilę. Przycisk 3× u góry przyspiesza czekanie.',
  'Chopping takes a while. The 3× button at the top speeds up the wait.',
);
// symulacja zalicza krok, kiedy drwal bierze stos (w sekundę po ścięciu), więc nie ma tu czego klikać
const CARRY = tx(
  'Drwal sam bierze drewno i niesie je do składu przy kozie.',
  'Your woodcutter picks up the wood and carries it to the woodpile by the stove.',
);
const HEAT = tx(
  'Koza grzeje powoli, a 3× u góry przyspiesza czekanie.',
  'The stove heats up slowly, and 3× at the top speeds up the wait.',
);

const steps = (w: Words, e: WordsEn): Record<TutStep, { text: Tx; mouse: Tx; touch: Tx }> => ({
  zaznacz: {
    text: tx(`Zaznaczcie kogoś z ${w.zarzad.dk}.`, `Select someone from ${e.krotko}.`),
    mouse: tx('Kliknijcie człowieka w kuchni siedziby.', 'Click a person in the HQ kitchen.'),
    touch: tx('Stuknijcie człowieka w kuchni siedziby.', 'Tap a person in the HQ kitchen.'),
  },
  rozkaz: {
    text: tx(`Wyślijcie go do suchego drzewa ${w.drzewo}.`, `Send them to the dead tree ${e.drzewo}.`),
    mouse: tx(
      'Prawy przycisk na suchym drzewie, potem „Ściąć drzewo”.',
      'Right-click the dead tree, then “Chop down the tree”.',
    ),
    touch: tx(
      'Stuknijcie pień suchego drzewa albo przytrzymajcie na nim palec.',
      'Tap the trunk of the dead tree, or press and hold on it.',
    ),
  },
  sciete: { text: tx('Zetnijcie suche drzewo.', 'Chop down the dead tree.'), mouse: CHOP, touch: CHOP },
  sklad: {
    text: tx('Zanieście drewno do składu przy kozie.', 'Take the wood to the woodpile by the stove.'),
    mouse: CARRY,
    touch: CARRY,
  },
  koza: {
    text: tx('Rozpalcie kozę.', 'Light the stove.'),
    mouse: tx(
      'Prawy przycisk na kozie w kuchni: „Dołożyć do kozy”.',
      'Right-click the stove in the kitchen: “Feed the stove”.',
    ),
    touch: tx('Stuknijcie kozę w kuchni.', 'Tap the stove in the kitchen.'),
  },
  cieplo: {
    text: tx(`Ogrzejcie kuchnię do ${WARM_ENOUGH}°C.`, `Warm the kitchen up to ${WARM_ENOUGH}°C.`),
    mouse: HEAT,
    touch: HEAT,
  },
});

/** lista celów; pusta, gdy samouczek wyłączony i noc już przetrwana */
export function goalsOf(
  st: SimState,
  gov: GovState | null,
  o: {
    touch: boolean;
    kitchen: number | null;
    hour: number;
    selected?: boolean;
    /** drewno na zapas teraz i czy zapas na noc już raz był */
    wood?: number;
    woodReady?: boolean;
    /** słowa miejsca po polsku i po angielsku (bez nich jak w bloku) */
    words?: Words;
    wordsEn?: WordsEn;
  },
): Goal[] {
  const out: Goal[] = [];
  const t = st.tut;
  const w = o.words ?? wordsOf(BLOK);
  const e = o.wordsEn ?? wordsEn(BLOK);
  const tut = steps(w, e);
  if (t.step >= 0)
    TUT_STEPS.forEach((key, k) => {
      const s = tut[key];
      let how = tr(o.touch ? s.touch : s.mouse);
      if (key === 'cieplo' && o.kitchen !== null)
        how = L(`W kuchni teraz ${deg(o.kitchen)}. ${how}`, `The kitchen is at ${deg(o.kitchen)} now. ${how}`);
      // zaznaczenie dociera do symulacji z następnym krokiem, a na pauzie nie od razu: cel widać jako zrobiony
      out.push({ key, text: tr(s.text), how, done: k < t.step || (key === 'zaznacz' && !!o.selected) });
    });
  const survived = !!gov && gov.reports.length > 0;
  // drewno na noc: po samouczku koza zjada resztę drewna do wieczora; cel liczy się, kiedy zapas raz był
  if (t.step >= 0) {
    const late = survived || !!gov?.night?.confirmed;
    out.push({
      key: 'drewno',
      text: tr(WOOD_GOAL),
      how: L(
        `Drewna na zapas: ${o.wood ?? 0} z ${NIGHT_WOOD}. ${
          o.touch
            ? 'Stuknijcie pień dowolnego drzewa albo przytrzymajcie palec na meblu, żeby go spalić.'
            : 'Prawy przycisk na dowolnym drzewie: „Ściąć drzewo”. W ostateczności spalcie mebel.'
        }`,
        `Wood stocked: ${o.wood ?? 0} of ${NIGHT_WOOD}. ${
          o.touch
            ? 'Tap the trunk of any tree, or press and hold on a piece of furniture to burn it.'
            : 'Right-click any tree: “Chop down the tree”. If all else fails, burn some furniture.'
        }`,
      ),
      done: !!o.woodReady || late,
      missed: !o.woodReady && late,
    });
  }
  const night = o.hour >= 20 || o.hour < 6;
  out.push({
    key: 'noc',
    text: L('Przetrwajcie pierwszą noc.', 'Survive the first night.'),
    how: night
      ? L(
          `Szabrownicy przychodzą po dwudziestej trzeciej. Rano ${w.zarzad.krotko} dostanie raport.`,
          `Looters come after 23:00. In the morning ${e.krotko} gets a report.`,
        )
      : L(
          `O 19:30 zebranie ${w.zarzad.dk}, o 20:00 karta nocy: kto śpi, kto pilnuje siatki.`,
          `${e.Zarzad === 'The board' ? 'Board' : 'Committee'} meeting at 19:30, Night orders at 20:00: who sleeps and who watches the fence.`,
        ),
    done: survived,
  });
  return out;
}

/** bieżący cel (pierwszy niezrobiony) albo null */
export const currentGoal = (goals: Goal[]): Goal | null => goals.find((g) => !g.done) ?? null;

/** znacznik nad suchym drzewem: dopóki zarząd go nie zetnie */
export const markTree = (st: SimState): boolean => st.tut.step >= 0 && st.tut.step <= TUT_STEPS.indexOf('sciete');

/** drewno na drugą noc: noc 22–6 zjada około 16 sztuk (2 na godzinę), także z dyżurem przy kozie */
export const DAY2_WOOD = 16;

/** czy to już drugi dzień: po pierwszym raporcie rano, do raportu po drugiej nocy */
export const isDay2 = (gov: GovState | null): boolean => !!gov && gov.reports.length === 1;

/** Cele drugiego dnia (docs/M2-fala-1.md): przeszukać puste mieszkanie (w domu jednorodzinnym dom komitetu, słowa
    ze słownika miejsca), postawić pierwszą budowlę (dowolną; warsztat bierze tyle materiału, że zarząd stawia go
    zwykle 3. albo 4. dnia), wzmocnić obwód, mieć drewno na noc. Co przeszukane, daje stan gry (st.apts); budowle
    i zasieki to gotowe rzeczy w st.things; obwód liczy się też, gdy żadna dziura nie jest otwarta. */
export function goalsDay2(
  st: SimState,
  gov: GovState | null,
  o: {
    touch: boolean;
    /** drewno na zapas teraz i czy zapas na noc już raz był */
    wood: number;
    woodReady: boolean;
    /** otwarte dziury w siatce */
    holes: number;
    /** słowa miejsca po polsku i po angielsku (bez nich jak w bloku) */
    words?: Words;
    wordsEn?: WordsEn;
  },
): Goal[] {
  const w = o.words ?? wordsOf(BLOK);
  const e = o.wordsEn ?? wordsEn(BLOK);
  const searched = st.apts.some((a) => a.searched.length > 0);
  const built = (kind: string) => st.things.some((t) => t.kind === kind);
  const late = !!gov?.night?.confirmed || (gov?.reports.length ?? 0) > 1;
  const b = o.touch
    ? L('Przycisk Budowa u góry', 'The Build button at the top')
    : L('Budowa (przycisk u góry albo B)', 'Build (button at the top, or B)');
  // w trybie zombie siatka jest wzmocniona i bez dziur, a zasieki przed szwendaczami nie chronią lepiej niż ona:
  // zamiast obwodu dzida dla warty (dzidy w rękach zarządu i w magazynie ponad te ze startu)
  const zombie = gov?.mode === 'zombie';
  const spears =
    st.pawns.filter((p) => p.kind === 'core' && p.weapon === 'dzida').length +
    (st.store.arms ?? []).filter((x) => x === 'dzida').length;
  const startSpears = [...START_KIT.zombie.core, ...START_KIT.zombie.store].filter((x) => x === 'dzida').length;
  // dwie budowle, które biorą najmniej materiału (koszty stroi bot, więc nie wpisuję ich na sztywno)
  const cheap = (Object.keys(BUILDS) as BuildKind[])
    .map((k) => ({ k, n: Object.values(BUILDS[k].cost).reduce((a: number, v) => a + (v ?? 0), 0) }))
    .sort((x, y) => x.n - y.n)
    .slice(0, 2)
    .map(({ k }) => `${L(BUILDS[k].name.toLowerCase(), BUILDS_EN[k].the)} (${costText(BUILDS[k].cost)})`);
  return [
    {
      key: 'przeszukaj',
      text: L(`Przeszukajcie ${w.szukanie.b}.`, `Search ${e.szukanie.b}.`),
      how: o.touch ? L(w.szukanie.jak.dotyk, e.szukanie.jak.dotyk) : L(w.szukanie.jak.mysz, e.szukanie.jak.mysz),
      done: searched,
    },
    {
      key: 'budowla',
      text: L('Postawcie pierwszą budowlę.', 'Put up your first structure.'),
      how: L(
        `${b}: dowolna budowla. Najmniej materiału biorą ${cheap.join(' i ')}. ${w.Zarzad} sam przyniesie materiały i zbuduje.`,
        `${b}: any structure will do. The cheapest are ${cheap.join(' and ')}. ${e.Zarzad} will fetch the materials and do the building.`,
      ),
      done: st.things.some((t) => t.kind in BUILDS),
    },
    zombie
      ? {
          key: 'dzida',
          text: L('Zróbcie dzidę dla warty.', 'Make a spear for the watch.'),
          how: L(
            `${o.touch ? 'Przytrzymajcie palec na stercie desek albo złomu' : 'Prawy przycisk na stercie desek albo złomu'}: „Zrobić dzidę” (${SPEAR_BOARDS} deski i ${SPEAR_SCRAP} złom). Dzida sięga szwendaczy przez siatkę. Deski i złom dają przeszukiwanie ${w.szukanie.d} i rozbiórka.`,
            `${o.touch ? 'Press and hold on a pile of planks or scrap' : 'Right-click a pile of planks or scrap'}: “Make a spear” (${manyEn(SPEAR_BOARDS, 'plank', 'planks')} and ${SPEAR_SCRAP} scrap). A spear reaches shamblers through the fence. Planks and scrap come from searching ${e.szukanie.d} and taking things apart.`,
          ),
          done: spears > startSpears,
        }
      : {
          key: 'obwod',
          text: L('Wzmocnijcie obwód.', 'Strengthen the perimeter.'),
          how: L(
            `${b}: Zasieki w miejscu odcinka siatki (${costText(BUILDS.zasieki.cost)}) albo załatajcie dziury${
              o.touch ? ' (przytrzymajcie palec na dziurze)' : ' (prawy przycisk na dziurze)'
            }. Otwartych dziur: ${o.holes}.`,
            `${b}: a ${BUILDS_EN.zasieki.name} in place of a stretch of fence (${costText(BUILDS.zasieki.cost)}), or patch the holes${
              o.touch ? ' (press and hold on a hole)' : ' (right-click a hole)'
            }. Open holes: ${o.holes}.`,
          ),
          done: built('zasieki') || o.holes === 0,
        },
    {
      key: 'drewno2',
      text: tr(WOOD_GOAL),
      how: L(
        `Drewna na zapas: ${o.wood} z ${DAY2_WOOD}. Noc zjada około 2 sztuk na godzinę, a przy kozie może ktoś czuwać.`,
        `Wood stocked: ${o.wood} of ${DAY2_WOOD}. The night eats about 2 pieces an hour, and someone can sit up with the stove.`,
      ),
      done: o.woodReady || late,
      missed: !o.woodReady && late,
    },
  ];
}
