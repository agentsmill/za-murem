/* Cele pierwszego dnia: kroki samouczka ze stanu symulacji (st.tut), drewno na wieczór i „przetrwać noc”
   z raportów zarządu. Czyste funkcje bez DOM: interfejs dostaje listę z tekstem celu i podpowiedzią do bieżącego kroku,
   w bieżącym języku (kroki samouczka to Tx, wybór przy rysowaniu). Zarząd i miejsce suchego drzewa według słownika
   miejsca (w domu komitet i ogród), po angielsku z wordsEn. Podpowiedzi mówią o tym, co naprawdę da się zrobić:
   `najtanszeBudowle` wybiera budowle, które da się teraz postawić (bez tych za badaniem i z wolnym limitem), a
   `drzewoWObwodzie` mówi, czy w obrębie siatki zostało drzewo do ścięcia, bo w trybie zombie drzewa za siatką stoją
   wśród szwendaczy i drewno trzeba wtedy brać z mebli.

   To jest rozdział R0 ścieżki celów: src/ui/sciezka-rozdzialy.ts opakowuje `goalsOf` w rozdział „Pierwszy dzień”
   i trzyma zaliczenie drewna na wieczór w stanie ścieżki (silnik i stan: src/ui/sciezka.ts). Cele drugiego dnia
   mieszkają w rozdziale R1 tamże (z potrzebą drewna na noc liczoną jak karta nocy), więc tu zostają tylko pomocniki,
   których używają kolejne rozdziały: `najtanszeBudowle` i `zombieMode`. */

import { L, type Tx, tr, tx } from '../core/jezyk.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsOf } from '../gov/miejsce.ts';
import type { GovState } from '../gov/typy.ts';
import { BUILDS, type BuildKind, isUnlocked, limitWhy } from '../sim/budowle.ts';
import { type SimState, trunkOf } from '../sim/sim.ts';
import { modeOf } from '../sim/tryb.ts';
import { TUT_STEPS, type TutStep, WARM_ENOUGH } from '../sim/tutorial.ts';
import { HORDE_FROM } from '../sim/zombie.ts';
import type { World } from '../world/world.ts';
import { deg } from './tekst.ts';

export interface Goal {
  key: TutStep | 'drewno' | 'noc';
  text: string;
  /** jak to zrobić (tylko bieżący krok ma sens) */
  how: string;
  done: boolean;
  /** cel przepadł (noc przyszła bez zapasu drewna): skreślony, ale bez ptaszka */
  missed?: boolean;
}

/** tyle drewna na zapas (w składzie, luzem i w rękach) wystarcza, żeby koza dotrwała do snu: trzy godziny ognia */
export const NIGHT_WOOD = 3;

/** pierwszy dzień: zapas na wieczór (ogień do snu), resztę nocy liczy dopiero karta nocy o 20:00 */
const WOOD_GOAL = tx('Przygotujcie drewno na wieczór.', 'Get wood in for the evening.');
/** tryb zombie ze stanu symulacji albo zarządu (w grze oba się zgadzają, atrapy w testach mają czasem tylko jedno) */
export const zombieMode = (st: SimState, gov: GovState | null): boolean =>
  modeOf(st) === 'zombie' || gov?.mode === 'zombie';

/** Czy w obrębie siatki stoi jeszcze drzewo do ścięcia: nieścięte, nie krzak i nie suche drzewo, dopóki trwa samouczek
    (należy do jego kroków), a jego pień leży na kafelku podwórka siatki albo tuż obok niego (pień na linii obwodu jest
    częścią płotu i da się go rąbać z podwórka). Drzewa za siatką się nie liczą: w trybie zombie stoją wśród szwendaczy.
    Na Przymorzu i na Lanciego jedynym takim drzewem jest suche z samouczka, w Zielonkach dochodzi drugie w ogrodzie.
    Świat czyta tylko `fence.yard`, drzewa i pnie. */
export function drzewoWObwodzie(st: SimState, w: World): boolean {
  const size = w.size;
  const yard = new Set(w.fence.yard);
  if (!yard.size) return false;
  const samouczek = st.tut.step >= 0 && st.tut.step < TUT_STEPS.length;
  return w.trees.some((tree, k) => {
    if (tree.kind === 2) return false;
    const t = trunkOf(w, tree);
    const x = t % size;
    const przy =
      yard.has(t) ||
      yard.has(t - size) ||
      yard.has(t + size) ||
      (x > 0 && yard.has(t - 1)) ||
      (x < size - 1 && yard.has(t + 1));
    return przy && !st.felled.includes(k) && !(samouczek && k === w.dryTree);
  });
}

/** Budowle o najmniejszej sumie kosztu spośród tych, które da się teraz postawić: odblokowane (bez badania albo po nim)
    i z wolnym limitem (pracownia jest jedna: stojąca albo zaplanowana wypada z listy). Remis rozstrzyga kolejność
    w BUILDS (sortowanie jest stabilne). Koszty stroi bot, więc podpowiedź ich nie wpisuje na sztywno. */
export function najtanszeBudowle(st: Pick<SimState, 'techDone' | 'things' | 'builds'>, n = 2): BuildKind[] {
  return (Object.keys(BUILDS) as BuildKind[])
    .filter((k) => isUnlocked(st, k) && limitWhy(st, k) === null)
    .map((k) => ({ k, suma: Object.values(BUILDS[k].cost).reduce((a: number, v) => a + (v ?? 0), 0) }))
    .sort((x, y) => x.suma - y.suma)
    .slice(0, n)
    .map(({ k }) => k);
}

/** Podpowiedź do celu „drewno na wieczór”: zapas z liczbą, potem drzewo, a w trybie zombie bez drzewa w obrębie siatki
    mebel z pustego mieszkania (w domu własny). Spalony mebel trafia najpierw do kozy, reszta na skład. */
function drewnoJak(n: number, touch: boolean, bezDrzewa: boolean, w: Words, e: WordsEn): string {
  const zapasPl = `Drewna na zapas: ${n} z ${NIGHT_WOOD}, czyli ogień do snu.`;
  const zapasEn = `Wood stocked: ${n} of ${NIGHT_WOOD}, enough fire to last till bedtime.`;
  if (bezDrzewa)
    return L(
      `${zapasPl} Drzewa za siatką stoją wśród szwendaczy: ${touch ? 'przytrzymajcie palec' : 'prawy przycisk'} na meblu ${w.szukanie.w}: „Spalić …”. Trafi najpierw do kozy, reszta na skład.`,
      `${zapasEn} The trees outside the fence are among the shamblers: ${touch ? 'press and hold on' : 'right-click'} a piece of furniture ${e.szukanie.w}: “Burn the …”. It goes into the stove first, the rest onto the woodpile.`,
    );
  return L(
    `${zapasPl} ${touch ? 'Stuknijcie pień drzewa.' : 'Prawy przycisk na drzewie: „Ściąć drzewo”.'} W ostateczności spalcie mebel${
      touch ? ' (przytrzymajcie na nim palec)' : ''
    }: trafi najpierw do kozy, reszta na skład.`,
    `${zapasEn} ${touch ? 'Tap the trunk of a tree.' : 'Right-click a tree: “Chop down the tree”.'} If all else fails, burn some furniture${
      touch ? ' (press and hold on it)' : ''
    }: it goes into the stove first, the rest onto the woodpile.`,
  );
}

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
  // w trakcie samouczka zarząd sam dokłada do kozy, gdy drewno dojdzie do składu (kozaWanted w sim.ts): polecenie
  // przyspiesza, ale krok zaliczy się i bez niego
  koza: {
    text: tx('Rozpalcie kozę.', 'Light the stove.'),
    mouse: tx(
      'Prawy przycisk na kozie w kuchni: „Dołożyć do kozy”. Kto ma drewno, dołoży też sam.',
      'Right-click the stove in the kitchen: “Feed the stove”. Whoever has wood will also feed it on their own.',
    ),
    touch: tx(
      'Stuknijcie kozę w kuchni. Kto ma drewno, dołoży też sam.',
      'Tap the stove in the kitchen. Whoever has wood will also feed it on their own.',
    ),
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
    /** świat gry: z nim podpowiedź drewna w trybie zombie wie, czy w obrębie siatki zostało drzewo (drzewoWObwodzie);
        bez niego jak w zwykłym trybie */
    w?: World;
  },
): Goal[] {
  const out: Goal[] = [];
  const t = st.tut;
  const w = o.words ?? wordsOf(BLOK);
  const e = o.wordsEn ?? wordsEn(BLOK);
  const zombie = zombieMode(st, gov);
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
  // drewno na wieczór: po samouczku koza zjada resztę drewna do wieczora; cel liczy się, kiedy zapas raz był. W trybie
  // zombie drzewa za siatką stoją wśród szwendaczy, więc gdy w obrębie siatki nie ma już drzewa, podpowiedź poleca mebel
  if (t.step >= 0) {
    const late = survived || !!gov?.night?.confirmed;
    const bezDrzewa = zombie && !!o.w && !drzewoWObwodzie(st, o.w);
    out.push({
      key: 'drewno',
      text: tr(WOOD_GOAL),
      how: drewnoJak(o.wood ?? 0, o.touch, bezDrzewa, w, e),
      done: !!o.woodReady || late,
      missed: !o.woodReady && late,
    });
  }
  const night = o.hour >= 20 || o.hour < 6;
  // w trybie zombie szabrowników nie ma (src/gov/noc.ts): od HORDE_FROM wychodzi stado i do rana napiera na siatkę
  const nocnie = zombie
    ? L(
        `Stado wychodzi z okolicy od ${HORDE_FROM}:00 i do rana napiera na siatkę. Rano ${w.zarzad.krotko} dostanie raport.`,
        `The herd comes out of the area from ${HORDE_FROM}:00 and presses on the fence until morning. In the morning ${e.krotko} gets a report.`,
      )
    : L(
        `Szabrownicy przychodzą po dwudziestej trzeciej. Rano ${w.zarzad.krotko} dostanie raport.`,
        `Looters come after 23:00. In the morning ${e.krotko} gets a report.`,
      );
  out.push({
    key: 'noc',
    text: L('Przetrwajcie pierwszą noc.', 'Survive the first night.'),
    how: night
      ? nocnie
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
