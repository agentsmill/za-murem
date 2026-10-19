/* Technologie nowej gry i odczyty stanu badań (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje
   „Technologie ery 1 i 2”, „Ery 3–5”, „Dane”, „Wiedza”, „Tempo” i „Stan, polecenia, determinizm”). Bierze 24 technologie
   z `TECH` i `ERAS` w src/content/data.ts (nazwa, era, dziedzina, poziom, koszt, wymagania; tamte tablice zostają bajt
   w bajt dla testu zgodności z 0.3) i dokłada to, czego w nich nie ma: czy technologia działa w nowej grze, jakie
   budowle odblokowuje, opis działania w obu językach oraz szóstą erę z technologią końcową „Sieć bez miedzi”.

   Dane. Technologia z `dziala: false` nie ma jeszcze działania i na tablicy leży odwrócona; projekt prądu odwraca
   kartkę z powrotem przez dopisanie działania tutaj. Jej `dzialanie` to „Do tego trzeba prądu.”, poza technologią
   końcową, która opisuje swoją sieć (dopisek o prądzie pokazuje tablica ze stanu kartki). Ery i kolumny tablicy
   wynikają z `ERY`, nie z liczby 5. Budowle są identyfikatorami `BuildKind` jako napisami, bo nowe rodzaje dochodzą
   dopiero z budowlami.

   Odczyty stanu. Pola `research` i `books` w `SimState` (src/sim/sim.ts) są opcjonalne i powstają dopiero przy
   pierwszym użyciu; funkcje stąd tylko je czytają, niczego do stanu nie dopisują, nie losują i nie znają języka
   bieżącego (napisy to `Tx`). Z sim.ts moduł importuje wyłącznie typ `SimState`, żeby sim.ts mógł importować stąd.
   `wiedza` to jedna wiedza osady dla tablicy i zarządu, `kartka` to stan jednej kartki tablicy, `tempoOsoby` to postęp
   na godzinę gry jednej siedzącej osoby. Dodawanie postępu w kroku, pracownia i polecenia `research` i `study` są
   w `Sim` (src/sim/sim.ts: chooseResearch, startResearch, researchTick), tak samo plan dnia lokatorów z wiedzą i ich
   droga do pracowni (plan, labOpen); limit i napisy pracowni w budowle.ts. */

import type { TechDef, TechDom } from '../content/data.ts';
import { ERAS, TECH } from '../content/data.ts';
import type { Person } from '../content/people.ts';
import type { Tx } from '../core/jezyk.ts';
import { tx } from '../core/jezyk.ts';
import { DZIALANIE_EN, NAZWY_ERY_EN, NAZWY_TECH_EN, PRAD_EN, SIEC_EN, SIEC_ZOMBIE_EN } from './badania.en.ts';
import type { SimState } from './sim.ts';
import type { GameMode } from './tryb.ts';

export interface TechNowa {
  id: string;
  /** epoka technologii (kolumna tablicy); poziom w dziedzinie to osobne `lvl`, próg wiedzy z 0.3 */
  era: number;
  dom: TechDom;
  lvl: number;
  /** technologie, które trzeba zbadać wcześniej */
  req: readonly string[];
  /** budowle (`BuildKind` jako napisy), które muszą stać; żadna technologia jeszcze tego nie używa */
  wymagaBudowli?: readonly string[];
  /** budowle (`BuildKind` jako napisy), które odblokowuje zbadanie */
  odblokowuje: readonly string[];
  /** czy technologia coś robi w nowej grze; bez tego jest odwrócona kartką, której nie da się wybrać */
  dziala: boolean;
  /** technologia końcowa drzewka: dokładnie jedna, do niej prowadzą wszystkie ery */
  koncowa?: true;
  /** tryb gry, w którym technologia jest dostępna; brak: oba */
  tryb?: GameMode;
  dzialanie: Tx;
  /** opis w trybie zombie, jeśli różni się od `dzialanie` (dziś tylko sieć, która w tym trybie jest cicha); UI w trybie
      zombie bierze `dzialanieZombie ?? dzialanie` */
  dzialanieZombie?: Tx;
}

/** to, czego potrzebuje kartka od wpisu z 0.3; sieć końcowa ma wpis w tej samej postaci */
type Wpis = Pick<TechDef, 'name' | 'era' | 'dom' | 'lvl' | 'cost' | 'req'>;

const ID_KONCOWA = 't_siec';
/** koszt bazowy technologii końcowej; w 0.3 jej nie ma, a 150 leży nad najdroższą stamtąd (model językowy, 110) */
const KOSZT_BAZOWY_SIECI = 150;
const ERA_KONCOWA = 6;

/** wpisy wszystkich technologii: 24 z 0.3 w kolejności data.ts i sieć końcowa na końcu */
const WPISY: Readonly<Record<string, Wpis>> = {
  ...TECH,
  [ID_KONCOWA]: {
    name: 'Sieć bez miedzi',
    era: ERA_KONCOWA,
    dom: 'elek',
    lvl: 4,
    cost: KOSZT_BAZOWY_SIECI,
    req: ['t_model', 't_pompy', 't_hydro', 't_druk', 't_drony'],
  },
};

/** technologie, które coś robią w nowej grze (era 1 i 2): opis po polsku i odblokowane budowle; opis angielski
    leży w badania.en.ts. Premie (okna, konserwy, zielarstwo, spawanie, ambulatorium) nic nie odblokowują. */
const DZIALAJA: Readonly<Record<string, { odblokowuje?: readonly string[]; pl: string }>> = {
  t_kozy: {
    odblokowuje: ['koza_beczka'],
    pl: 'Koza z beczki do postawienia w pokoju naszego mieszkania, przy oknie (rura przez okno). Grzeje pokój jak koza w kuchni i tak samo pali drewno. Zarząd dokłada do niej sam.',
  },
  t_okna: { pl: '+3°C w pomieszczeniach naszych mieszkań, za darmo.' },
  t_konserwy: { pl: '+20% plonu ogródków, szklarni i pieczarkarni.' },
  t_zielarstwo: { pl: 'Ogródek przy plonie daje czasem leki: jeden lek z szansą 1/3.' },
  t_wieza: {
    odblokowuje: ['wieza'],
    pl: 'Wieża na podwórku i nowy posterunek „Wieża” na karcie nocy.',
  },
  t_spawanie: { pl: 'Warsztat robi części 1,5× szybciej.' },
  t_barykady: {
    odblokowuje: ['barykada'],
    pl: 'Barykada na odcinku siatki, mocniejsza od zasieków. Kosztuje głównie złom.',
  },
  t_wezel: {
    odblokowuje: ['kociol'],
    pl: 'Kocioł na klatce siedziby (w domu w przedpokoju) grzeje naraz wszystkie nasze mieszkania, ale pali dużo drewna. Zarząd dokłada do niego sam.',
  },
  t_szklarnia: {
    odblokowuje: ['szklarnia'],
    pl: 'Szklarnia na podwórku: jak ogródek, ale zimą rodzi jak jesienią.',
  },
  t_grzyby: {
    odblokowuje: ['pieczarkarnia'],
    pl: 'Pieczarkarnia w łazience naszego mieszkania. Mniejszy plon niż ogródek, ale równy przez cały rok.',
  },
  t_ambu: { pl: 'Zdrowie wraca 1,6× szybciej (rany po walce, wychłodzenie, głód).' },
};

const PRAD: Tx = tx('Do tego trzeba prądu.', PRAD_EN);

const SIEC_PL =
  'Sieć z aluminium zamiast miedzi, światłowodu i ogniw zalanych żywicą: prąd, którego bakteria nie ruszy.';

/** technologia końcowa opisuje sieć, a nie „Do tego trzeba prądu”: ten dopisek pokazuje tablica ze stanu odwróconej
    kartki; w trybie zombie ta sama sieć jest dodatkowo cicha (projekt warunków zwycięstwa) */
const SIEC: Tx = tx(SIEC_PL, SIEC_EN);
const SIEC_ZOMBIE: Tx = tx(`${SIEC_PL} W tym trybie jest też cicha, bo hałas ściąga stado.`, SIEC_ZOMBIE_EN);

function techNowa(id: string, w: Wpis): TechNowa {
  const d = DZIALAJA[id];
  return {
    id,
    era: w.era,
    dom: w.dom,
    lvl: w.lvl,
    req: [...w.req],
    odblokowuje: d?.odblokowuje ?? [],
    dziala: d !== undefined,
    dzialanie: d ? tx(d.pl, DZIALANIE_EN[id]) : PRAD,
  };
}

export const TECHS: readonly TechNowa[] = Object.entries(WPISY).map(
  ([id, w]): TechNowa =>
    id === ID_KONCOWA
      ? { ...techNowa(id, w), koncowa: true, dzialanie: SIEC, dzialanieZombie: SIEC_ZOMBIE }
      : techNowa(id, w),
);

export const TECH_BY: Readonly<Record<string, TechNowa>> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** ery 1–5 z `ERAS` (polskie nazwy bajt w bajt) i era 6 technologii końcowej; tablica bierze kolumny stąd */
export const ERY: readonly { nr: number; nazwa: Tx }[] = [...ERAS.slice(1), 'Bez miedzi'].map((pl, i) => ({
  nr: i + 1,
  nazwa: tx(pl, NAZWY_ERY_EN[i + 1]),
}));

/** mnożnik kosztu technologii według ery; ery 1 i 2 zostają jak w 0.3, resztę stroi bot (zadanie 11 planu) */
export const KOSZT_ERY: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 1.5, 4: 2, 5: 2.5, 6: 3 };

/** wpis technologii po identyfikatorze; nieznany identyfikator to błąd, a nie cichy brak */
function wpis(id: string): Wpis {
  if (!Object.hasOwn(WPISY, id)) throw new Error(`Nieznana technologia: ${id}`);
  return WPISY[id];
}

/** koszt badania: koszt z `TECH` (dla sieci końcowej 150) razy mnożnik jej ery */
export function kosztTech(id: string): number {
  const w = wpis(id);
  return w.cost * KOSZT_ERY[w.era];
}

/** nazwa technologii w obu językach */
export function nazwaTech(id: string): Tx {
  return tx(wpis(id).name, NAZWY_TECH_EN[id]);
}

/** nazwa ery w obu językach; nieznany numer to błąd */
export function nazwaEry(nr: number): Tx {
  const e = ERY.find((x) => x.nr === nr);
  if (!e) throw new Error(`Nieznana era: ${nr}`);
  return e.nazwa;
}

/** punkty postępu na godzinę gry dla mnożnika 1 (umiejętność 0 daje 0,7 tego, umiejętność 2 równo tyle); wstępna
    wartość, stroi ją bot z mieszkańcami (zadanie 11 planu) */
export const TEMPO_BAZOWE = 1.2;

/** mnożnik tempa pracy według poziomu umiejętności. To kopia `tempoPracy` z gałęzi `praca-ludzi` (src/sim/praca.ts),
    żeby zawód działał wszędzie tak samo; przy scaleniu gałęzi ustępuje oryginałowi. */
export const krzywaUmiejetnosci = (poziom: number): number => 0.7 + 0.15 * poziom;

/** postęp na godzinę gry jednej siedzącej osoby w badaniu z dziedziny `dom`: tempo bazowe, krzywa umiejętności osoby
    w tej dziedzinie i cechy z 0.3 (pracowity ×1,1, leniwy ×0,9, Mistrz Excela ×1,05). Badać może każdy, także bez
    umiejętności; próg wiedzy dotyczy osady (`wiedza`), nie siedzącego. */
export function tempoOsoby(o: Pick<Person, 'skills' | 'traits'>, dom: TechDom): number {
  const cecha = (c: string, mnoznik: number): number => (o.traits.includes(c) ? mnoznik : 1);
  return (
    TEMPO_BAZOWE *
    krzywaUmiejetnosci(o.skills[dom] ?? 0) *
    cecha('pracowity', 1.1) *
    cecha('leniwy', 0.9) *
    cecha('excel', 1.05)
  );
}

/** wiedza osady w dziedzinie: najwyższa umiejętność wśród żywych osób zarządu i lokatorów siedziby, którzy są na
    miejscu (nie na wyprawie), plus najwyżej 2 książki z tej dziedziny. Pionek na liście `st.pawns` żyje (zmarły
    schodzi z niej po kroku). Lokator bez osoby (`person` −1), sąsiedzi i obcy się nie liczą. */
export function wiedza(st: SimState, dom: TechDom): number {
  let najlepsza = 0;
  for (const p of st.pawns) {
    if ((p.kind !== 'core' && p.kind !== 'resident') || p.person < 0 || p.away) continue;
    najlepsza = Math.max(najlepsza, st.people[p.person]?.skills[dom] ?? 0);
  }
  return najlepsza + Math.min(2, st.books?.[dom] ?? 0);
}

/** stan kartki na tablicy: zbadana (pieczątka), w toku (wybrana, wiedza starcza), stoi (wybrana, ale wiedza spadła
    poniżej poziomu: postęp zostaje, nikt nie robi kroku dalej), do wzięcia, brak wiedzy („nikt się nie zna”), najpierw
    (brak technologii albo budowli z wymagań), odwrócona (bez działania w nowej grze albo z innego trybu gry) */
export type StanKartki = 'zbadana' | 'w_toku' | 'stoi' | 'do_wziecia' | 'brak_wiedzy' | 'najpierw' | 'odwrocona';

export interface Kartka {
  id: string;
  stan: StanKartki;
  /** zapisany postęp badania w punktach (0 przed pierwszym krokiem) */
  postep: number;
  /** koszt w punktach, może być ułamkiem (mnożnik ery), więc porównania nic nie zaokrąglają */
  koszt: number;
  /** przy stanie „najpierw”: identyfikatory niezbadanych technologii z wymagań, potem niepostawionych budowli; poza
      tym stanem puste */
  brakuje: string[];
  /** wiedza osady w dziedzinie technologii i próg, którego technologia wymaga (`lvl`) */
  ma: number;
  trzeba: number;
}

/** stan kartki technologii `id` w trybie `mode`. Kolejność sprawdzeń ma znaczenie: zbadana, odwrócona, najpierw,
    dopiero potem wybór (w toku albo stoi) i brak wiedzy; inaczej „stoi” nie dałoby się osiągnąć, bo wybrana
    technologia z niedoborem wiedzy byłaby „brakiem wiedzy”. */
export function kartka(st: SimState, id: string, mode: GameMode): Kartka {
  if (!Object.hasOwn(TECH_BY, id)) throw new Error(`Nieznana technologia: ${id}`);
  const t = TECH_BY[id];
  const ma = wiedza(st, t.dom);
  const wynik = (stan: StanKartki, brakuje: string[] = []): Kartka => ({
    id,
    stan,
    postep: st.research?.prog[id] ?? 0,
    koszt: kosztTech(id),
    brakuje,
    ma,
    trzeba: t.lvl,
  });
  if (st.techDone?.includes(id)) return wynik('zbadana');
  if (!t.dziala || (t.tryb !== undefined && t.tryb !== mode)) return wynik('odwrocona');
  const brakuje = [
    ...t.req.filter((r) => !st.techDone?.includes(r)),
    ...(t.wymagaBudowli ?? []).filter((b) => !st.things.some((rzecz) => rzecz.kind === b)),
  ];
  if (brakuje.length) return wynik('najpierw', brakuje);
  if (st.research?.cur === id) return wynik(ma < t.lvl ? 'stoi' : 'w_toku');
  return wynik(ma < t.lvl ? 'brak_wiedzy' : 'do_wziecia');
}

/** dziedzina bieżącego badania; null, gdy nic nie wybrano (albo wybrano technologię spoza drzewka, np. ze starego
    zapisu) */
export function badaniaDom(st: SimState): TechDom | null {
  const cur = st.research?.cur;
  return cur && Object.hasOwn(TECH_BY, cur) ? TECH_BY[cur].dom : null;
}

/** czy badania w ogóle są w grze: stoi pracownia albo stan badań już istnieje (np. po rozbiórce pracowni) */
export function badaniaWidoczne(st: SimState): boolean {
  return st.research !== undefined || st.things.some((t) => t.kind === 'pracownia');
}

/** najwyższa era wśród zbadanych technologii, 0 bez badań; identyfikatory spoza drzewka się nie liczą */
export function eraBadan(st: SimState): number {
  let era = 0;
  for (const id of st.techDone ?? []) if (Object.hasOwn(TECH_BY, id)) era = Math.max(era, TECH_BY[id].era);
  return era;
}

/** czy technologia końcowa drzewka jest zbadana */
export function koncowaZbadana(st: SimState): boolean {
  return TECHS.some((t) => t.koncowa === true && !!st.techDone?.includes(t.id));
}
