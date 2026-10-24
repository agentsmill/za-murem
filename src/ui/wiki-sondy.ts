/* Wiki w grze: sondy do czystych funkcji gry. Zamiast przepisywać do artykułów liczby, które w grze siedzą w funkcjach
   (tempo spadku potrzeb, mnożniki warty, szansa napadu, dzienny dryf zaufania), wiki woła te funkcje na małych, sztucznych
   wejściach i pokazuje wynik, więc zmiana liczby w grze zmienia i wiki. Sondy niczego nie zapisują, nie losują i nie
   dotykają symulacji: dostają świeży stan zarządu (`newGov`), minimalne wejście (`GovInput`) i osobę (`GovPerson`) z samymi
   polami, które czytają funkcje, więc wejście jest rzutowane, a testy (tests/unit/wiki-sondy.test.ts) pilnują, że sondowane
   funkcje dają to, co wiki o nich mówi. */

import { makeCard } from '../gov/noc.ts';
import type { GovInput, GovPerson, GovState } from '../gov/typy.ts';
import { newGov } from '../gov/zarzad.ts';
import { moodOf, type NeedCtx, type Needs, stepNeeds } from '../sim/needs.ts';

/** świeży stan zarządu (zaufanie 50, wkurzenie 20, bez uchwał i flag) */
export const sondaStan = (): GovState => newGov(1);

/** osoba z zarządu z pełnymi potrzebami; reszta pól z `o` */
export const sondaOsoba = (o: Partial<GovPerson> = {}): GovPerson => ({
  pawn: 0,
  id: 'x',
  name: 'X',
  first: 'X',
  f: false,
  age: 30,
  prof: '',
  skills: {},
  traits: [],
  job: null,
  asleep: false,
  inside: false,
  ...o,
  needs: { food: 100, warm: 100, rest: 100, health: 100, safe: 100, mood: 100, ...(o.needs ?? {}) },
});

/** wejście zarządu z samymi polami, które czytają sondowane funkcje (dzień 1, 20:00, siatka bez dziur, brak światła) */
export const sondaWejscie = (o: Partial<GovInput> = {}): GovInput =>
  ({
    tick: 0,
    day: 1,
    hour: 20,
    minute: 0,
    season: 0,
    night: false,
    outdoor: 5,
    kitchen: 10,
    kozaLit: false,
    people: [],
    stock: { wood: 0, supplies: 0 },
    screen: 0,
    fence: { holes: [], durability: 0.5 },
    light: { campfire: false, gateLamp: false },
    ...o,
  }) as GovInput;

/** Jak zmienia się potrzeba `klucz` w ciągu godziny gry w danym otoczeniu, od wartości `start` (pozostałe potrzeby
    zaczynają od 60). Odpowiedź w punktach na godzinę, z jedną cyfrą po przecinku. Woła prawdziwe `stepNeeds`. */
export function stawka(klucz: keyof Needs, ctx: Partial<NeedCtx> = {}, start: Partial<Needs> = {}): number {
  const n: Needs = { food: 60, warm: 60, rest: 60, health: 60, safe: 60, mood: 60, ...start };
  const przed = n[klucz];
  const c: NeedCtx = {
    temp: 20,
    fire: false,
    asleep: false,
    busy: false,
    dark: false,
    inside: true,
    company: 2,
    ...ctx,
  };
  stepNeeds(n, c, 1);
  return Math.round((n[klucz] - przed) * 10) / 10;
}

/** Stan zarządu z podpisanymi uchwałami `ids` (do sprawdzenia, co dana uchwała zmienia w liczbach gry). */
export function sondaStanZUchwalami(...ids: string[]): GovState {
  const st = newGov(1);
  for (const id of ids) st.laws.signed[id] = true;
  return st;
}

/** Granica warunku, który zmienia się raz w przedziale 0–100: dzieli go w połowie 40 razy i zaokrągla do liczby całkowitej.
    Gra trzyma progi w porównaniach (`n.food < 10`), więc wiki szuka ich tą drogą zamiast je przepisywać. */
export function granica(f: (v: number) => boolean): number {
  let lo = 0;
  let hi = 100;
  const dol = f(lo);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) === dol) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/** krok krótszy niż cokolwiek w grze: zmiana potrzeby na godzinę da się z niego odczytać bez zaokrągleń */
const KROTKI = 1e-6;

/** zmiana zdrowia na godzinę w bardzo krótkim kroku `stepNeeds` (reszta potrzeb pełna, zdrowie 80, pokój 20°C) */
function zdrowieNaGodzine(start: Partial<Needs>, ctx: Partial<NeedCtx> = {}): number {
  const n: Needs = { food: 100, warm: 100, rest: 100, health: 80, safe: 60, mood: 60, ...start };
  const przed = n.health;
  const c: NeedCtx = {
    temp: 20,
    fire: false,
    asleep: false,
    busy: false,
    dark: false,
    inside: true,
    company: 2,
    ...ctx,
  };
  stepNeeds(n, c, KROTKI);
  return (n.health - przed) / KROTKI;
}

/** Progi zdrowia z `stepNeeds`: poniżej ilu ciepło, najedzenie i siły zabierają zdrowie oraz powyżej ilu ciepło i
    najedzenie pozwalają mu wracać. */
export function progiZdrowia(): {
  zimno: number;
  glod: number;
  zmeczenie: number;
  powrotCiepla: number;
  powrotJedzenia: number;
} {
  return {
    zimno: granica((v) => zdrowieNaGodzine({ warm: v }) < 0),
    glod: granica((v) => zdrowieNaGodzine({ food: v }) < 0),
    zmeczenie: granica((v) => zdrowieNaGodzine({ rest: v }) < 0),
    powrotCiepla: granica((v) => zdrowieNaGodzine({ warm: v }) > 0),
    powrotJedzenia: granica((v) => zdrowieNaGodzine({ food: v }) > 0),
  };
}

/** Kara nastroju za potrzebę poniżej progu: próg i punkty (z `moodOf`, na potrzebie najedzenia, reszta po 50). */
export function karaNastroju(): { prog: number; punkty: number } {
  const a: Needs = { food: 50, warm: 50, rest: 50, health: 50, safe: 50, mood: 0 };
  const liniowo = (v: number) => moodOf({ ...a, food: v }) - (moodOf({ ...a, food: 50 }) + (v - 50) * 0.25);
  return { prog: granica((v) => Math.abs(liniowo(v)) < 1e-9), punkty: Math.round(-liniowo(0) * 10) / 10 };
}

/** Najmniejsza liczba całkowita z przedziału 0–100, dla której `ok` jest prawdziwe (100, gdy dla żadnej). Dla progów
    typu „od 25 w górę”, które gra ma w porównaniach, a wiki chce je odczytać z działającej funkcji. */
export function odKtorej(ok: (v: number) => boolean): number {
  for (let v = 0; v <= 100; v++) if (ok(v)) return v;
  return 100;
}

/** opcje karty nocy dla jednej osoby o danych potrzebach (siedziba z kozą w kuchni, noc 1, bez wieży i miasta): klucz → czy wolno */
function opcjeKarty(needs: Partial<Needs>): Record<string, boolean> {
  const i = sondaWejscie({ people: [sondaOsoba({ needs: needs as Needs })], kitchen: 10 });
  const { card } = makeCard(sondaStan(), i);
  return Object.fromEntries(card.people[0].options.map((o) => [o.key, o.ok]));
}

/** Progi zdrowia i sił, od których karta nocy pozwala na wartę, dyżur przy kozie i wyprawy (z `makeCard`, więc z tych samych
    porównań, które liczą kartę): zdrowie dla warty i kozy, zdrowie i siły dla wyprawy blisko i daleko. */
export function progiKarty(): {
  warta: number;
  koza: number;
  blisko: { rest: number; health: number };
  daleko: { rest: number; health: number };
} {
  const zdrowie = (klucz: string) => odKtorej((v) => opcjeKarty({ health: v })[klucz]);
  const sily = (klucz: string) => odKtorej((v) => opcjeKarty({ rest: v })[klucz]);
  return {
    warta: zdrowie('warta:brama'),
    koza: zdrowie('warta:koza'),
    blisko: { rest: sily('wyprawa:blisko'), health: zdrowie('wyprawa:blisko') },
    daleko: { rest: sily('wyprawa:daleko'), health: zdrowie('wyprawa:daleko') },
  };
}
