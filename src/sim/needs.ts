/* Potrzeby ludzi z rdzenia w skali 0–100, liczone co HEAT_EVERY ticków razem z ciepłem.
   Nastrój nie ma własnej dynamiki: wynika z pozostałych potrzeb plus chwilowe nastroje (spalone meble,
   ciepły posiłek), później dojdą cechy i wydarzenia. Zdrowie na razie tylko spada i wraca; choroby,
   leczenie i śmierć przyjdą razem z systemami z 0.3. Powrót zdrowia mnoży `NeedCtx.heal` (ambulatorium polowe, t_ambu).
   Siły (`rest`) ubywają wolno (REST_AWAKE, REST_BUSY), żeby zarząd wytrzymał dzień pracy i noc warty; liczby i ich
   powód przy stałych niżej. Nazwy pasków są w obu językach (NEED_LABELS, NEED_LABELS_EN). */

export interface Needs {
  /** najedzenie */
  food: number;
  /** ciepło, od temperatury pod nogami */
  warm: number;
  /** siły */
  rest: number;
  /** zdrowie: spada od zimna, głodu i wyczerpania, wraca powoli */
  health: number;
  /** bezpieczeństwo: strach nocą, w ciemności i w samotności, spokój w środku, przy ogniu i z ludźmi */
  safe: number;
  /** nastrój, wynika z pozostałych */
  mood: number;
}

export const NEED_LABELS: Record<keyof Needs, string> = {
  food: 'Najedzenie',
  warm: 'Ciepło',
  rest: 'Siły',
  health: 'Zdrowie',
  safe: 'Bezpieczeństwo',
  mood: 'Nastrój',
};

/** te same paski po angielsku (słowniczek); wybór języka przy rysowaniu karty */
export const NEED_LABELS_EN: Record<keyof Needs, string> = {
  food: 'Fed',
  warm: 'Warmth',
  rest: 'Energy',
  health: 'Health',
  safe: 'Safety',
  mood: 'Mood',
};

export interface NeedCtx {
  /** temperatura pod nogami (°C) */
  temp: number;
  /** stoi przy palącej się kozie */
  fire: boolean;
  asleep: boolean;
  /** śpi na podłodze (bez łóżka): wypoczywa wolniej */
  floor?: boolean;
  /** ciężka praca: rąbanie, noszenie */
  busy: boolean;
  /** ciemno: noc i żadnego światła obok (koza, później ognisko i latarka) */
  dark: boolean;
  /** pod dachem, w pomieszczeniu */
  inside: boolean;
  /** ilu ludzi jest blisko (do 4 m) */
  company: number;
  /** ktoś trzyma wartę (nocą) */
  guard?: boolean;
  /** otwarte dziury w siatce (nocą) */
  holes?: number;
  /** obcy w zasięgu wzroku */
  strangers?: number;
  /** szabrownicy weszli na podwórko tej nocy: strach zostaje do rana */
  raided?: boolean;
  /** mnożnik spadku najedzenia (racje: głód wraca szybciej), domyślnie 1 */
  hunger?: number;
  /** mnożnik powrotu zdrowia (ambulatorium polowe, t_ambu), domyślnie 1; ubytku zdrowia nie rusza */
  heal?: number;
}

/** poniżej tej temperatury ciepło spada (o punkt na godzinę za każdy stopień), powyżej rośnie */
export const COMFORT = 18;
/** progi, przy których zarząd sam idzie jeść, grzać się i spać */
export const HUNGRY = 35;
/** od takiego najedzenia u kogokolwiek z zarządu ktoś zaczyna gotować (posiłek gotowy, zanim zgłodnieją) */
export const PECKISH = 45;
export const COLD = 40;
export const WARMED = 90;
export const TIRED = 15;

/** Siły na godzinę gry (zgłoszenie Mateusza z 19.10.2026, tryb zombie: „nie wytrzymają jednej pracy, nawet przez jedną
    noc”). Na nogach ubywa 3,5 (było 5), przy ciężkiej pracy (rąbanie, łatanie, noszenie drewna) 6 (było 9), więc po
    dniu na nogach od 6:00 zarząd ma wieczorem około 50 (dawniej 30) i warta od 20:00 do 6:00 kończy się z siłami
    ponad 0 (dawniej schodziły do zera około 2:00). Sen bez zmian: w łóżku +12, na podłodze +8. */
export const REST_AWAKE = 3.5;
export const REST_BUSY = 6;
/** siły na starcie: grę zaczyna się o 15:00 po nocy w łóżku, a nie w połowie zmęczenia (było 65) */
export const REST_START = 80;

const clamp100 = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/** potrzeby na starcie: po obiedzie, zmarznięci po zimnej nocy, niespokojni, w połowie dnia */
export function startNeeds(): Needs {
  const n: Needs = { food: 55, warm: 45, rest: REST_START, health: 100, safe: 60, mood: 0 };
  n.mood = moodOf(n);
  return n;
}

/** nastrój z potrzeb: średnia ważona, każda bardzo niska odejmuje 10 punktów */
export function moodOf(n: Needs): number {
  let m = 0.25 * n.food + 0.25 * n.warm + 0.15 * n.rest + 0.15 * n.health + 0.2 * n.safe;
  for (const v of [n.food, n.warm, n.rest, n.health, n.safe]) if (v < 15) m -= 10;
  return clamp100(m);
}

/** do tego poziomu dąży bezpieczeństwo: światło, dach, ludzie, ogień i warta uspokajają, ciemność, samotność,
    dziury w siatce i obcy straszą; dziury najwyżej o 15 punktów, a w środku, za ścianami, o jedną trzecią tego */
export function safeTarget(c: NeedCtx): number {
  let t = 50;
  t += c.dark ? -20 : 10;
  t += c.inside ? 15 : c.dark ? -15 : 0;
  t += c.company >= 2 ? 15 : c.company === 1 ? 8 : -10;
  if (c.fire) t += 10;
  if (c.guard) t += 10;
  const holes = Math.min(15, 5 * (c.holes ?? 0));
  t -= c.inside ? holes / 3 : holes;
  t -= 25 * (c.strangers ?? 0);
  if (c.raided) t -= 15;
  return clamp100(t);
}

/** mieszkańcy (tło): zmienia się tylko bezpieczeństwo, reszta potrzeb stoi; nastrój z potrzeb i chwilowych */
export function stepSafe(n: Needs, c: NeedCtx, h: number, bonus = 0): void {
  n.safe = clamp100(n.safe + (safeTarget(c) - n.safe) * Math.min(1, h / 2));
  n.mood = clamp100(moodOf(n) + bonus);
}

/** h: godziny gry od ostatniego kroku; bonus: suma chwilowych nastrojów (punkty) */
export function stepNeeds(n: Needs, c: NeedCtx, h: number, bonus = 0): void {
  n.food = clamp100(n.food - (c.asleep ? 2 : 4) * (c.hunger ?? 1) * h);
  n.rest = clamp100(n.rest + (c.asleep ? (c.floor ? 8 : 12) : c.busy ? -REST_BUSY : -REST_AWAKE) * h);
  // pod kocem o 6°C cieplej; przy palącej się kozie grzeje się szybko bez względu na pokój
  const t = c.temp + (c.asleep ? 6 : 0);
  const dw = c.fire ? 40 : t >= COMFORT ? 15 : t - COMFORT;
  n.warm = clamp100(n.warm + dw * h);
  let dh = 0;
  if (n.warm < 15) dh -= 1.5;
  if (n.food < 10) dh -= 1;
  if (n.rest < 10) dh -= 0.5;
  if (dh === 0 && n.warm > 50 && n.food > 30) dh = 0.5 * (c.heal ?? 1);
  n.health = clamp100(n.health + dh * h);
  // bezpieczeństwo dochodzi do celu ze stałą czasową 2 h
  n.safe = clamp100(n.safe + (safeTarget(c) - n.safe) * Math.min(1, h / 2));
  n.mood = clamp100(moodOf(n) + bonus);
}
