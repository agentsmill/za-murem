/* Potrzeby ludzi z rdzenia w skali 0–100, liczone co HEAT_EVERY ticków razem z ciepłem.
   Nastrój nie ma własnej dynamiki: wynika z pozostałych potrzeb (później dojdą cechy i wydarzenia).
   Zdrowie na razie tylko spada i wraca; choroby, leczenie i śmierć przyjdą razem z systemami z 0.3 (M3). */

export interface Needs {
  /** najedzenie */
  food: number;
  /** ciepło, od temperatury pod nogami */
  warm: number;
  /** siły */
  rest: number;
  /** zdrowie: spada od zimna, głodu i wyczerpania, wraca powoli */
  health: number;
  /** nastrój, wynika z pozostałych */
  mood: number;
}

export const NEED_LABELS: Record<keyof Needs, string> = {
  food: 'Najedzenie',
  warm: 'Ciepło',
  rest: 'Siły',
  health: 'Zdrowie',
  mood: 'Nastrój',
};

export interface NeedCtx {
  /** temperatura pod nogami (°C) */
  temp: number;
  /** stoi przy palącej się kozie */
  fire: boolean;
  asleep: boolean;
  /** ciężka praca: rąbanie, noszenie */
  busy: boolean;
}

/** poniżej tej temperatury ciepło spada (o punkt na godzinę za każdy stopień), powyżej rośnie */
export const COMFORT = 18;
/** progi, przy których zarząd sam idzie jeść, grzać się i spać */
export const HUNGRY = 35;
export const COLD = 40;
export const WARMED = 90;
export const TIRED = 15;

const clamp100 = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/** potrzeby na starcie: po obiedzie, zmarznięci po zimnej nocy, w połowie dnia */
export function startNeeds(): Needs {
  const n: Needs = { food: 55, warm: 45, rest: 65, health: 100, mood: 0 };
  n.mood = moodOf(n);
  return n;
}

/** nastrój: średnia ważona potrzeb, każda bardzo niska odejmuje 10 punktów */
export function moodOf(n: Needs): number {
  let m = 0.3 * n.food + 0.3 * n.warm + 0.2 * n.rest + 0.2 * n.health;
  for (const v of [n.food, n.warm, n.rest, n.health]) if (v < 15) m -= 10;
  return clamp100(m);
}

/** h: godziny gry od ostatniego kroku */
export function stepNeeds(n: Needs, c: NeedCtx, h: number): void {
  n.food = clamp100(n.food - (c.asleep ? 2 : 4) * h);
  n.rest = clamp100(n.rest + (c.asleep ? 12 : c.busy ? -9 : -5) * h);
  // pod kocem o 6°C cieplej; przy palącej się kozie grzeje się szybko bez względu na pokój
  const t = c.temp + (c.asleep ? 6 : 0);
  const dw = c.fire ? 40 : t >= COMFORT ? 15 : t - COMFORT;
  n.warm = clamp100(n.warm + dw * h);
  let dh = 0;
  if (n.warm < 15) dh -= 1.5;
  if (n.food < 10) dh -= 1;
  if (n.rest < 10) dh -= 0.5;
  if (dh === 0 && n.warm > 50 && n.food > 30) dh = 0.5;
  n.health = clamp100(n.health + dh * h);
  n.mood = moodOf(n);
}
