/* Cele pierwszego dnia: kroki samouczka ze stanu symulacji (st.tut) i „przetrwać noc” z raportów zarządu.
   Czyste funkcje bez DOM: interfejs dostaje listę z tekstem celu i podpowiedzią do bieżącego kroku. */

import type { GovState } from '../gov/typy.ts';
import type { SimState } from '../sim/sim.ts';
import { TUT_STEPS, type TutStep, WARM_ENOUGH } from '../sim/tutorial.ts';
import { deg } from './tekst.ts';

export interface Goal {
  key: TutStep | 'noc';
  text: string;
  /** jak to zrobić (tylko bieżący krok ma sens) */
  how: string;
  done: boolean;
}

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
    mouse: 'Rąbanie trwa chwilę. Drewno zostanie przy pniu.',
    touch: 'Rąbanie trwa chwilę. Drewno zostanie przy pniu.',
  },
  sklad: {
    text: 'Zanieście drewno do składu przy kozie.',
    mouse: 'Prawy przycisk na stosie drewna: „Zanieść do składu”.',
    touch: 'Stuknijcie stos drewna przy pniu.',
  },
  koza: {
    text: 'Rozpalcie kozę.',
    mouse: 'Prawy przycisk na kozie w kuchni: „Dołożyć do kozy”.',
    touch: 'Stuknijcie kozę w kuchni.',
  },
  cieplo: {
    text: `Ogrzejcie kuchnię do ${WARM_ENOUGH}°C.`,
    mouse: 'Koza grzeje powoli. Pilnujcie, żeby nie wygasła.',
    touch: 'Koza grzeje powoli. Pilnujcie, żeby nie wygasła.',
  },
};

/** lista celów; pusta, gdy samouczek wyłączony i noc już przetrwana */
export function goalsOf(
  st: SimState,
  gov: GovState | null,
  o: { touch: boolean; kitchen: number | null; hour: number; selected?: boolean },
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
