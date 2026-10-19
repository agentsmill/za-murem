/* Dane technologii nowej gry (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Technologie ery 1 i 2”,
   „Ery 3–5” i „Dane”). Bierze 24 technologie z `TECH` i `ERAS` w src/content/data.ts (nazwa, era, dziedzina, poziom,
   koszt, wymagania; tamte tablice zostają bajt w bajt dla testu zgodności z 0.3) i dokłada to, czego w nich nie ma:
   czy technologia działa w nowej grze, jakie budowle odblokowuje, opis działania w obu językach oraz szóstą erę
   z technologią końcową „Sieć bez miedzi”.

   Kontrakt. Moduł to same dane i czyste odczyty: nie ma stanu, losowania ani języka bieżącego (napisy to `Tx`), nie
   importuje budowle.ts ani sim.ts. Budowle są identyfikatorami `BuildKind` jako napisy, bo nowe rodzaje dochodzą
   dopiero z budowlami. Technologia z `dziala: false` nie ma jeszcze działania i na tablicy leży odwrócona; projekt
   prądu odwraca kartkę z powrotem przez dopisanie działania tutaj. Jej `dzialanie` to „Do tego trzeba prądu.”, poza
   technologią końcową, która opisuje swoją sieć (dopisek o prądzie pokazuje tablica ze stanu kartki). Ery i kolumny
   tablicy wynikają z `ERY`, nie z liczby 5. Stan badań, pracownia i funkcje stanu kartki dochodzą w kolejnych
   modułach. */

import type { TechDef, TechDom } from '../content/data.ts';
import { ERAS, TECH } from '../content/data.ts';
import type { Tx } from '../core/jezyk.ts';
import { tx } from '../core/jezyk.ts';
import { DZIALANIE_EN, NAZWY_ERY_EN, NAZWY_TECH_EN, PRAD_EN, SIEC_EN, SIEC_ZOMBIE_EN } from './badania.en.ts';
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
