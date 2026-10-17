/* Cele pierwszego dnia: kroki samouczka ze stanu symulacji (st.tut), drewno na noc i „przetrwać noc”
   z raportów zarządu. Czyste funkcje bez DOM: interfejs dostaje listę z tekstem celu i podpowiedzią
   do bieżącego kroku. */

import type { GovState } from '../gov/typy.ts';
import { BUILDS } from '../sim/budowle.ts';
import type { SimState } from '../sim/sim.ts';
import { TUT_STEPS, type TutStep, WARM_ENOUGH } from '../sim/tutorial.ts';
import { aptsGame, costText } from './budowa.ts';
import { deg } from './tekst.ts';

export interface Goal {
  key: TutStep | 'drewno' | 'noc' | 'przeszukaj' | 'warsztat' | 'obwod' | 'drewno2';
  text: string;
  /** jak to zrobić (tylko bieżący krok ma sens) */
  how: string;
  done: boolean;
  /** cel przepadł (noc przyszła bez zapasu drewna): skreślony, ale bez ptaszka */
  missed?: boolean;
}

/** tyle drewna na zapas (w składzie, luzem i w rękach) wystarcza, żeby koza dotrwała do snu */
export const NIGHT_WOOD = 6;

const STEPS: Record<TutStep, { text: string; mouse: string; touch: string }> = {
  zaznacz: {
    text: 'Zaznaczcie kogoś z zarządu.',
    mouse: 'Kliknijcie człowieka w kuchni siedziby.',
    touch: 'Stuknijcie człowieka w kuchni siedziby.',
  },
  rozkaz: {
    text: 'Wyślijcie go do suchego drzewa przy trzepaku.',
    mouse: 'Prawy przycisk na suchym drzewie, potem „Ściąć drzewo”.',
    touch: 'Stuknijcie pień suchego drzewa albo przytrzymajcie na nim palec.',
  },
  sciete: {
    text: 'Zetnijcie suche drzewo.',
    mouse: 'Rąbanie trwa chwilę. Przycisk 3× u góry przyspiesza czekanie.',
    touch: 'Rąbanie trwa chwilę. Przycisk 3× u góry przyspiesza czekanie.',
  },
  sklad: {
    text: 'Zanieście drewno do składu przy kozie.',
    // symulacja zalicza krok, kiedy drwal bierze stos (w sekundę po ścięciu), więc nie ma tu czego klikać
    mouse: 'Drwal sam bierze drewno i niesie je do składu przy kozie.',
    touch: 'Drwal sam bierze drewno i niesie je do składu przy kozie.',
  },
  koza: {
    text: 'Rozpalcie kozę.',
    mouse: 'Prawy przycisk na kozie w kuchni: „Dołożyć do kozy”.',
    touch: 'Stuknijcie kozę w kuchni.',
  },
  cieplo: {
    text: `Ogrzejcie kuchnię do ${WARM_ENOUGH}°C.`,
    mouse: 'Koza grzeje powoli, a 3× u góry przyspiesza czekanie.',
    touch: 'Koza grzeje powoli, a 3× u góry przyspiesza czekanie.',
  },
};

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
  },
): Goal[] {
  const out: Goal[] = [];
  const t = st.tut;
  if (t.step >= 0)
    TUT_STEPS.forEach((key, k) => {
      const s = STEPS[key];
      let how = o.touch ? s.touch : s.mouse;
      if (key === 'cieplo' && o.kitchen !== null) how = `W kuchni teraz ${deg(o.kitchen)}. ${how}`;
      // zaznaczenie dociera do symulacji z następnym krokiem, a na pauzie nie od razu: cel widać jako zrobiony
      out.push({ key, text: s.text, how, done: k < t.step || (key === 'zaznacz' && !!o.selected) });
    });
  const survived = !!gov && gov.reports.length > 0;
  // drewno na noc: po samouczku koza zjada resztę drewna do wieczora; cel liczy się, kiedy zapas raz był
  if (t.step >= 0) {
    const late = survived || !!gov?.night?.confirmed;
    out.push({
      key: 'drewno',
      text: 'Przygotujcie drewno na noc.',
      how: `Drewna na zapas: ${o.wood ?? 0} z ${NIGHT_WOOD}. ${
        o.touch
          ? 'Stuknijcie pień dowolnego drzewa albo przytrzymajcie palec na meblu, żeby go spalić.'
          : 'Prawy przycisk na dowolnym drzewie: „Ściąć drzewo”. W ostateczności spalcie mebel.'
      }`,
      done: !!o.woodReady || late,
      missed: !o.woodReady && late,
    });
  }
  const night = o.hour >= 20 || o.hour < 6;
  out.push({
    key: 'noc',
    text: 'Przetrwajcie pierwszą noc.',
    how: night
      ? 'Szabrownicy przychodzą po dwudziestej trzeciej. Rano zarząd dostanie raport.'
      : 'O 19:30 zebranie zarządu, o 20:00 karta nocy: kto śpi, kto pilnuje siatki.',
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

/** Cele drugiego dnia (docs/M2-fala-1.md): przeszukać puste mieszkanie, zbudować warsztat, wzmocnić obwód,
    mieć drewno na noc. Co przeszukane, daje stan gry (st.apts); warsztat i zasieki to gotowe budowle
    w st.things; obwód liczy się też, gdy żadna dziura nie jest otwarta. */
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
  },
): Goal[] {
  const searched = (aptsGame(st) ?? []).some((a) => a.searched.length > 0);
  const built = (kind: string) => st.things.some((t) => t.kind === kind);
  const late = !!gov?.night?.confirmed || (gov?.reports.length ?? 0) > 1;
  const b = o.touch ? 'Przycisk Budowa u góry' : 'Budowa (przycisk u góry albo B)';
  return [
    {
      key: 'przeszukaj',
      text: 'Przeszukajcie puste mieszkanie.',
      how: o.touch
        ? 'Stuknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem przytrzymajcie w nim palec: „Przeszukać”.'
        : 'Kliknijcie mieszkanie w siedzibie: karta pokaże, czy jest puste i co w nim zostało. Potem prawy przycisk w nim: „Przeszukać”.',
      done: searched,
    },
    {
      key: 'warsztat',
      text: 'Zbudujcie warsztat.',
      how: `${b}: Warsztat w pokoju naszego mieszkania (${costText(BUILDS.warsztat.cost)}). Zarząd sam przyniesie materiały i zbuduje.`,
      done: built('warsztat'),
    },
    {
      key: 'obwod',
      text: 'Wzmocnijcie obwód.',
      how: `${b}: Zasieki w miejscu odcinka siatki (${costText(BUILDS.zasieki.cost)}) albo załatajcie dziury${
        o.touch ? ' (przytrzymajcie palec na dziurze)' : ' (prawy przycisk na dziurze)'
      }. Otwartych dziur: ${o.holes}.`,
      done: built('zasieki') || o.holes === 0,
    },
    {
      key: 'drewno2',
      text: 'Przygotujcie drewno na noc.',
      how: `Drewna na zapas: ${o.wood} z ${DAY2_WOOD}. Noc zjada około 2 sztuk na godzinę, a przy kozie może ktoś czuwać.`,
      done: o.woodReady || late,
      missed: !o.woodReady && late,
    },
  ];
}
