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
   pierwszym użyciu. Odczyty (`wiedza`, `kartka`, `tempoOsoby`, `kosztTech` i reszta) tylko czytają stan, niczego do
   niego nie dopisują, nie losują i nie znają języka bieżącego (napisy to `Tx`); jedyne wyjątki to opisane niżej
   książki: `dodajKsiazke` dopisuje `st.books`, a `ksiazkaZ` losuje z własnego generatora. Z sim.ts moduł importuje
   wyłącznie typ `SimState`, żeby sim.ts mógł importować stąd.
   `wiedza` to jedna wiedza osady dla tablicy i zarządu (`znajacy` wylicza, kto ją daje, do szczegółów kartki),
   `kartka` to stan jednej kartki tablicy, `tempoOsoby` to postęp na godzinę gry jednej siedzącej osoby. Dodawanie
   postępu w kroku, pracownia i polecenia `research` i `study` są w `Sim` (src/sim/sim.ts: chooseResearch,
   startResearch, researchTick), tak samo plan dnia lokatorów z wiedzą i ich droga do pracowni (plan, labOpen); limit
   i napisy pracowni w budowle.ts. Miejsca przy stole: `RESEARCH_SEATS`, `zajmujeMiejsce` i `wolneMiejsca` to jedno
   źródło predykatu „miejsce zajęte” dla `Sim.startResearch`, menu pracowni (orders.ts) i podpowiedzi po „Badać”.

   Książki. `ksiazkaZ` losuje książkę z przeszukanego pomieszczenia z osobnego generatora z ziarna gry i klucza
   pomieszczenia (inna stała niż `wreckRng`), więc przeszukanie nie przesuwa `st.rng` ani innych losowań; szanse
   leżą w `SZANSA_KSIAZKI`. `dodajKsiazke` kładzie książkę na półce osady (`st.books`, najwyżej 2 na dziedzinę, pole
   powstaje przy pierwszej) i mówi, czy trzecia z dziedziny poszła na podpałkę. Drewno z podpałki dokłada wołający,
   bo ten moduł nie zna map ani stert: `Sim` przy pracowni albo w składzie (dropMat), `applyGov` przy bramie.

   Premie ery 1–2 i paleniska. Stałe premii (OKNA_PLUS, KONSERWY_PLON, ZIELARSTWO_SZANSA, SPAWANIE_TEMPO, AMBU_TEMPO,
   PIECZARKI_PLON) i wagi drewna w paleniskach (PALENISKA) leżą tu, a stosują je wołający: `Sim` (ciepło, plon,
   dokładanie, potrzeby), `pracaPrzepisu` w surowce.ts i karta nocy zarządu (`GovInput.paleniska`). Premia działa
   tylko po zbadaniu (`st.techDone`), więc gra bez badań ma te same liczby co przed nimi.

   Odkrycia. `odkrycia(st)` to zbadane technologie z tickiem ukończenia (`research.at`), od najstarszej: czyta je tablica,
   karta „Odkrycie” i kronika zarządu (`govInput()`, src/gov/znaleziska.ts); dziennik znalezisk książek to
   `SimState.bookLog` (pisze go `Sim.znajdzKsiazke`).

   Odczyt dla warunków zwycięstwa. `liczbaZbadanych`, `eraBadan`, `koncowaZbadana` i `siecWlaczona` składają
   `GovInput.badania` (src/sim/gov.ts) dla ramy zwycięstwa. Sieć włącza polecenie `siec` w pracowni (menu pracowni w
   orders.ts, `Sim.wlaczSiec`): tylko po zbadaniu technologii końcowej przy stojącej pracowni, a znacznik
   (`st.research.siec`) powstaje dopiero wtedy i zostaje, także po rozbiórce pracowni. */

import type { TechDef, TechDom } from '../content/data.ts';
import { BOOKS, ERAS, TECH, TECH_DOMS } from '../content/data.ts';
import type { Person } from '../content/people.ts';
import type { Tx } from '../core/jezyk.ts';
import { tx } from '../core/jezyk.ts';
import { mulberry } from '../core/rng.ts';
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
    pl: 'Koza z beczki do postawienia w pokoju, kuchni albo przedpokoju naszego mieszkania, blisko okna (rura przez okno). Grzeje pokój jak koza w kuchni i tak samo pali drewno. Zarząd dokłada do niej sam.',
  },
  t_okna: { pl: '+3°C w pomieszczeniach naszych mieszkań, za darmo.' },
  t_konserwy: { pl: '+20% plonu ogródków, szklarni i pieczarkarni.' },
  t_zielarstwo: { pl: 'Ogródek przy plonie daje czasem leki: jeden lek z szansą 1/3.' },
  t_wieza: {
    odblokowuje: ['wieza'],
    pl: 'Wieża na podwórku i nowy posterunek „Warta na wieży” na karcie nocy: stojący tam dokłada połowę swojej warty do obrony każdego innego posterunku.',
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
    pl: 'Pieczarkarnia w łazience naszego mieszkania. Plon mniejszy niż w ogródku wiosną i latem, ale taki sam przez cały rok, także zimą.',
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

/** mnożnik kosztu technologii według ery. Era 1 zostaje jak w 0.3 (12–15 punktów), era 2 kosztuje o 30% więcej (22–35
    punktów z 0.3 → 29–46): bot z badaniami (tools/bot-badania.ts, 19.10.2026, zadanie 11 planu) pokazał, że przy
    mnożniku 1 gracz z lokatorami o pasujących fachach kończy pierwszą erę około dnia 7 i do zimy (dzień 11) ma 7–9
    technologii zamiast 4–6; wyższy mnożnik ery 2 zatrzymuje tę erę na zimę, a nie zmienia pierwszej technologii. Ery 3–6
    to wartości wstępne do czasu projektu prądu (resztę stroi bot, kiedy te ery zaczną działać). */
export const KOSZT_ERY: Readonly<Record<number, number>> = { 1: 1, 2: 1.3, 3: 1.5, 4: 2, 5: 2.5, 6: 3 };

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

/** punkty postępu na godzinę gry dla mnożnika 1 (osoba bez umiejętności daje równo tyle, każdy poziom umiejętności
    dokłada 10%). Wartość z bota z badaniami (tools/bot-badania.ts, 19.10.2026, zadanie 11 planu, przebiegi z mieszkańcami
    z adresu): przy 1,0 pierwsza technologia była gotowa w dobie po pracowni tylko w 9 z 14 przebiegów (64%), bo jedna
    osoba zarządu siada za dnia na 13 godzin (7:00–20:00), a najtańsza technologia ma 12 punktów; przy 1,1 w 12–13 z 15
    (80–87%). Do zimy (dzień 11) 4–6 technologii wychodzi na większości ziaren (10 z 15) tylko w świecie z głodem, czyli
    z botem jak zwykle; bez głodu jest ich średnio 6,9 i do przedziału wpada 7 z 15. Zależy to od demo: Przymorze
    (lokatorzy z fachami do badań) bada szybciej, Zielonki (bez lokatorów z osobą) wolniej. Tabele: docs/POSTEP.md. */
export const TEMPO_BAZOWE = 1.1;

/** mnożnik tempa pracy według poziomu umiejętności: bez umiejętności dzisiejsze tempo, umiejętność tylko przyspiesza
    (decyzja integratora i sesji pracy ludzi, 19.10.2026). To kopia `tempoPoziomu` (`1 + TEMPO_KROK * poziom`,
    `TEMPO_KROK = 0.1`) z gałęzi `praca-ludzi` (src/sim/praca.ts), a nie `tempoPracy`, która ma jeszcze bramkę
    pierwszego dnia, niepotrzebną badaniom. Przy scaleniu gałęzi ustępuje oryginałowi. */
export const krzywaUmiejetnosci = (poziom: number): number => 1 + 0.1 * poziom;

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

/** ile książek z jednej dziedziny liczy się do wiedzy i mieści się na półce; kolejne idą na podpałkę */
const KSIAZEK_NA_DZIEDZINE = 2;

/** wiedza osady w dziedzinie: najwyższa umiejętność wśród żywych osób zarządu i lokatorów siedziby, którzy są na
    miejscu (nie na wyprawie), plus najwyżej 2 książki z tej dziedziny. Pionek na liście `st.pawns` żyje (zmarły
    schodzi z niej po kroku). Lokator bez osoby (`person` −1), sąsiedzi i obcy się nie liczą. */
export function wiedza(st: SimState, dom: TechDom): number {
  let najlepsza = 0;
  for (const p of st.pawns) {
    if (!doWiedzy(p)) continue;
    najlepsza = Math.max(najlepsza, st.people[p.person]?.skills[dom] ?? 0);
  }
  return najlepsza + Math.min(KSIAZEK_NA_DZIEDZINE, st.books?.[dom] ?? 0);
}

/** czy pionek liczy się do wiedzy osady: zarząd albo lokator siedziby z osobą, na miejscu (nie na wyprawie) */
const doWiedzy = (p: SimState['pawns'][number]): boolean =>
  (p.kind === 'core' || p.kind === 'resident') && p.person >= 0 && !p.away;

/** osoby, które liczą się do wiedzy osady w dziedzinie `dom` i mają w niej umiejętność co najmniej 1 (te same co
    w `wiedza`, bez książek), od najwyższej umiejętności; imię i zawód do szczegółów kartki na tablicy */
export function znajacy(st: SimState, dom: TechDom): { name: string; prof: string; skill: number }[] {
  const out: { name: string; prof: string; skill: number }[] = [];
  for (const p of st.pawns) {
    if (!doWiedzy(p)) continue;
    const o = st.people[p.person];
    const skill = o?.skills[dom] ?? 0;
    if (skill >= 1) out.push({ name: o.name, prof: o.prof, skill });
  }
  // sort jest stabilny: przy równej umiejętności zostaje kolejność pionków
  return out.sort((a, b) => b.skill - a.skill);
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

/** ile technologii z drzewka jest zbadanych; identyfikatory spoza drzewka (np. testowe) się nie liczą */
export function liczbaZbadanych(st: SimState): number {
  return (st.techDone ?? []).filter((id) => Object.hasOwn(TECH_BY, id)).length;
}

/** Odkrycia: zbadane technologie z tickiem ukończenia (`research.at`), od najstarszego (przy tym samym ticku po
    identyfikatorze). Czyta je tablica (`snapshot().tablica.odkrycia`), karta „Odkrycie” i kronika zarządu
    (`govInput()`), więc kolejność jest wszędzie ta sama. Bez stanu badań pusta lista. */
export function odkrycia(st: Pick<SimState, 'research'>): { id: string; tick: number }[] {
  return Object.entries(st.research?.at ?? {})
    .map(([id, tick]) => ({ id, tick }))
    .sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : 1));
}

/** czy technologia końcowa drzewka jest zbadana */
export function koncowaZbadana(st: SimState): boolean {
  return TECHS.some((t) => t.koncowa === true && !!st.techDone?.includes(t.id));
}

/** przy stole pracowni siedzą najwyżej dwie osoby naraz (każda dodaje swój postęp) */
export const RESEARCH_SEATS = 2;

/** napis menu i podpowiedzi, gdy przy stole nie ma już wolnego miejsca */
export const BRAK_MIEJSCA: Tx = tx('Przy stole nie ma miejsca.', 'No free seat at the table.');

/** Czy pionek zajmuje miejsce przy stole pracowni `lab`: ma pracę badania z tym stołem w celu, czyli idzie do niego
    albo przy nim siedzi. To jedyne miejsce, które to rozstrzyga: `Sim.startResearch`, menu pracowni i podpowiedź po
    „Badać” liczą miejsca przez `wolneMiejsca`. */
export const zajmujeMiejsce = (p: SimState['pawns'][number], lab: number): boolean =>
  p.job?.t === 'research' && p.job.target === lab;

/** Ile miejsc przy stole pracowni `lab` zostaje dla `zaznaczonych` (id pionków): RESEARCH_SEATS minus pionki spoza
    zaznaczenia, które miejsca już zajmują. Zaznaczeni, którzy już siedzą, miejsc nie blokują, bo zaraz dostają to samo
    polecenie i zajmą je od nowa. */
export function wolneMiejsca(pawns: SimState['pawns'], lab: number, zaznaczeni: readonly number[] = []): number {
  const inni = pawns.filter((p) => !zaznaczeni.includes(p.id) && zajmujeMiejsce(p, lab)).length;
  return Math.max(0, RESEARCH_SEATS - inni);
}

/** czy sieć jest już włączona (polecenie `siec` w pracowni, `Sim.wlaczSiec`); pole powstaje dopiero przy włączeniu */
export function siecWlaczona(st: SimState): boolean {
  return st.research?.siec === true;
}

/** Waga drewna w paleniskach (premie ery 1–2 i dokładanie): ile razy szybciej pali palenisko tego rodzaju. Koza
    zarządu i koza z beczki zjadają sztukę w pół godziny (BURN_TICKS), kocioł trzy razy szybciej (BURN_TICKS / 3 na
    sztukę). `Thing.fuel` takiego paleniska liczy się w jednostkach drewna: sztuka dodaje BURN_TICKS w każdym, krok ciepła
    odejmuje HEAT_EVERY × waga, a zbiornik mieści KOZA_CAP × waga sztuk (kocioł 12). Czas ognia to więc fuel / waga, a
    wszystkie liczby zostają całkowite. */
export const PALENISKA: Readonly<Record<string, number>> = { koza: 1, koza_beczka: 1, kociol: 3 };

/** t_okna: o tyle °C cieplej w pomieszczeniach naszych mieszkań, za darmo (dodatek do temperatury bazowej w heatStep) */
export const OKNA_PLUS = 3;
/** t_konserwy: plon ogródków, szklarni i pieczarkarni razy tyle; ułamek przenosi `plonKonserw` */
export const KONSERWY_PLON = 1.2;
/** t_zielarstwo: szansa na lek przy plonie ogródka */
export const ZIELARSTWO_SZANSA = 1 / 3;
/** t_spawanie: części w warsztacie robią się tyle razy szybciej (src/sim/surowce.ts, pracaPrzepisu) */
export const SPAWANIE_TEMPO = 1.5;
/** t_ambu: zdrowie wraca tyle razy szybciej (pole `heal` kontekstu potrzeb) */
export const AMBU_TEMPO = 1.6;
/** pieczarkarnia: stały plon co GARDEN_TICKS przez cały rok, bez względu na porę (wartość wstępna, stroi zadanie 11) */
export const PIECZARKI_PLON = 2;

/** Plon po t_konserwy: `baza` razy KONSERWY_PLON, a ułamek, którego plon nie mieści, zostaje w `reszta` (to
    `Thing.n` rzeczy uprawnej) i dołącza do następnego plonu. Liczone na całkowitych setnych, więc dziesięć plonów
    daje dokładnie 1,2 × plon bez badania, bez dryfu liczb zmiennoprzecinkowych. */
export function plonKonserw(baza: number, reszta: number): { n: number; reszta: number } {
  const setne = Math.round(baza * KONSERWY_PLON * 100 + reszta * 100);
  return { n: Math.floor(setne / 100), reszta: (setne % 100) / 100 };
}

/** Czy ogródek o `id` daje lek przy plonie w ticku `tick` (t_zielarstwo): szansa 1/3 z generatora z ziarna gry, id
    ogródka i ticku, inna stała niż w łupie z pomieszczeń i wraków. Nie dotyka `st.rng`, więc plon nie przesuwa
    innych losowań. */
export function lekZPlonu(seed: number, id: number, tick: number): boolean {
  const rnd = mulberry(
    (Math.imul(seed | 0, 7919) ^ Math.imul(id + 1, 2654435) ^ Math.imul(tick + 1, 1299709) ^ 0x2c1e) >>> 0,
  );
  return rnd() < ZIELARSTWO_SZANSA;
}

/** szansa na książkę w jednym przeszukanym pomieszczeniu: puste mieszkanie jak opuszczone mieszkania w 0.3
    (POICAT.mieszkania.book), sala w szkole u sąsiadów więcej (liczba budującego: szkoła ma kilka sal, a dziedzin jest
    sześć). Reszta usług u sąsiadów książek nie daje. To dane do strojenia; testy zmieniają je na czas jednego testu. */
export const SZANSA_KSIAZKI = { mieszkanie: 0.12, szkola: 0.25 };

/** Książka z przeszukania pomieszczenia o kluczu `klucz` (w siedzibie numer pomieszczenia, u sąsiadów
    gid(k + 1, pokój), więc klucze się nie zbiegają): null, gdy rzut nie trafił, a gdy trafił, dziedzina losowana ze
    wszystkich sześciu i tytuł z `BOOKS`. Generator z ziarna gry i klucza, inna stała niż `wreckRng`; nie dotyka
    `st.rng`. Szansa 1 daje zawsze książkę, 0 nigdy. */
export function ksiazkaZ(
  seed: number,
  klucz: number,
  szansa = SZANSA_KSIAZKI.mieszkanie,
): { dom: TechDom; tytul: string } | null {
  const rnd = mulberry((Math.imul(seed | 0, 7907) ^ Math.imul(klucz + 1, 1299709) ^ 0x6b6b) >>> 0);
  if (rnd() >= szansa) return null;
  const dom = TECH_DOMS[Math.floor(rnd() * TECH_DOMS.length)];
  const tytuly = BOOKS[dom];
  return { dom, tytul: tytuly[Math.floor(rnd() * tytuly.length)] };
}

/** Książka z dziedziny `dom` na półkę osady: `st.books` (pole powstaje przy pierwszej), najwyżej 2 na dziedzinę.
    Trzecia i kolejne nic nie zmieniają w stanie i wracają jako 'podpalka': wołający dokłada za nią 1 drewna. */
export function dodajKsiazke(st: SimState, dom: TechDom): 'polka' | 'podpalka' {
  const ma = st.books?.[dom] ?? 0;
  if (ma >= KSIAZEK_NA_DZIEDZINE) return 'podpalka';
  (st.books ??= {})[dom] = ma + 1;
  return 'polka';
}
