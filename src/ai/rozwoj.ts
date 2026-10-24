/* Warstwa rozwoju silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 5).
   Powód: osada, która tylko przeżywa, nie rośnie: bez wolnych łóżek nie ma kogo przyjąć, bez warsztatu nie ma desek, a bez
   badań poza kozą nie ma ani pieczarek, ani szklarni (cel etapu: pierwszy kamień ludności i co najmniej jedna budowla na
   trzy dni gry, docs/superpowers/specs/2026-10-20-osada-ai-design.md, „Bramka”).

   `turaRozwoju` idzie co 30 sekund przy ekranie (pilnuje tego `silnik` w src/ai/silnik.ts) i robi cztery rzeczy, każdą
   rękami gry (`Rece`), jak gracz z menu:
   - budowa z kolejki, najwyżej jeden plan naraz (także gdy plan czeka jeszcze w kolejce poleceń albo stoi plan ogródka
     z warstwy jedzenia). Kolejka: łóżka piętrowe w mieszkaniu zarządu, gdy łóżek nie ma więcej niż osób w zarządzie (bez
     wolnego łóżka werbunek wędrowca jest zablokowany, a zarząd śpi na podłodze); magazyn przy pełnym składzie drewna (20 sztuk
     na dwóch kafelkach, `STACK` na kafelek); warsztat (deski z drewna, bez niego desek przybywa tylko z rozbiórki); pieczarkarnia
     i szklarnia po badaniach `t_grzyby` i `t_szklarnia`; zasieki na otwartej dziurze w siatce. Tylko rodzaje odblokowane
     (`isUnlocked`) i bez wykorzystanego limitu (`limitWhy`), po jednym stojącym albo planowanym (warsztat, magazyn, pieczarkarnia,
     szklarnia), z miejscem (`miejsceNa`) i tylko gdy materiał na całą budowlę już jest w zapasach: plan, który czeka na deski,
     zatrzymałby wszystkie następne, a deski, które automat pracy zniósł do planu, nie wystarczałyby innym. Dopóki warstwa zimy
     (src/ai/zima.ts, `zimaWToku`) nie ma za sobą pracowni, badania i postawienia kozy z beczki w pokoju zarządu, budowy
     rozwoju czekają: koza grzeje sypialnię zarządu i ma pierwszeństwo do desek, złomu i części;
   - badania z `KOLEJKA_BADAN` po kolei: gdy nic się nie bada (albo wybrane stoi bez wiedzy), pierwsze z kolejki, na które osada ma
     wiedzę (`kartka` w stanie „do wzięcia”); badanie, które trwa, zostaje;
   - tabela Pracy: priorytet 1 Badań dla osoby z największą umiejętnością w dziedzinie bieżącego badania (przy remisie niższy
     numer osoby; bez nikogo z umiejętnością co najmniej 1 nic, bo wtedy badanie niosą mieszkańcy albo książki) i próg drewna
     dwa razy większy niż drewno na noc (`drewnoNaNoc`): automat Drwala trzyma zapas na dwie noce, a warsztat piłuje deski
     z drewna ponad ten zapas;
   - werbunek: wędrowiec stojący przy siatce dostaje rozmowę najbliższej wolnej osoby z zarządu (`najblizszaWolna` z
     src/ai/osoby.ts; menu `commandsAt`, polecenie `talk`), a po rozmowie zaproszenie (`zapros`), gdy po przyjęciu starcza
     jedzenia (`stacNaPrzyjecie`) i jest wolne łóżko (`okazjaWerbunku`). Wędrowiec stoi przy siatce 20–40 minut gry i godzinę
     po rozmowie, a warstwa idzie co 30 sekund przy ekranie, więc większość wędrowców dostaje rozmowę i zaproszenie dokładnie
     jeden raz.

   Warstwa czyta stan gry jak gracz (`wejscie`, `SimState`, świat) i działa tylko rękami; nie ma własnego stanu poza stanem gry
   (łóżka, plany, badania i tabela Pracy wynikają z niego, więc zapis i wczytanie w połowie nic nie zmieniają), niczego nie
   losuje i nie czyta zegara. Moduły gra.ts, silnik.ts i rozwoj.ts importują się nawzajem; cykl jest bezpieczny, bo nikt nie używa
   cudzego importu przy ładowaniu modułu, tylko w ciele funkcji. */

import type { GovInput } from '../gov/typy.ts';
import { kartka, TECH_BY } from '../sim/badania.ts';
import { BUILDS, type BuildKind, isUnlocked, limitWhy, type Mat } from '../sim/budowle.ts';
import { houseOf, inHomeApt } from '../sim/house.ts';
import { commandsAt } from '../sim/orders.ts';
import { priorytet, progi, ZARZAD_MAX } from '../sim/praca.ts';
import { okazjaWerbunku, type SimState, STACK } from '../sim/sim.ts';
import { snapshot } from '../sim/snapshot.ts';
import { modeOf } from '../sim/tryb.ts';
import type { World } from '../world/world.ts';
import { type GraAi, type Rece, wejscie } from './gra.ts';
import { stacNaPrzyjecie } from './jedzenie.ts';
import { LOZKA, type Miejsce, miejscaNa, miejsceNa, pokojZarzadu } from './miejsca.ts';
import { najblizszaWolna, zarzad } from './osoby.ts';
import { drewnoNaNoc, zimaWToku } from './zima.ts';

/** badania po kolei: koza z beczki (zima), okna (+3°C w naszych mieszkaniach), konserwy, grzyby (pieczarkarnia), zielarstwo, szklarnia */
export const KOLEJKA_BADAN: readonly string[] = [
  't_kozy',
  't_okna',
  't_konserwy',
  't_grzyby',
  't_zielarstwo',
  't_szklarnia',
];

/** miejsca do spania w mieszkaniu zarządu (łóżka całe po jednym, piętrowe po dwa), jak `bedsIn` w symulacji */
function lozkaZarzadu(st: SimState, w: World): number {
  const h = houseOf(w);
  if (!h) return 0;
  return st.things.reduce((a, t) => a + (!t.broken && inHomeApt(h, t.y * w.size + t.x) ? (LOZKA[t.kind] ?? 0) : 0), 0);
}

/** czy w mieszkaniu zarządu nie ma wolnego łóżka, choć zarząd może jeszcze rosnąć (od `ZARZAD_MAX` nowi trafiają do mieszkańców) */
function brakLozek(st: SimState, w: World): boolean {
  const ludzie = zarzad(st).length;
  return ludzie < ZARZAD_MAX && lozkaZarzadu(st, w) <= ludzie;
}

/** pełny skład drewna: każdy kafelek składu ma stos `STACK` sztuk */
function skladPelny(w: World, i: GovInput): boolean {
  const sklad = houseOf(w)?.sklad ?? [];
  return sklad.length > 0 && (i.stock.woodSklad ?? 0) >= sklad.length * STACK;
}

/** pierwsze miejsce w mieszkaniu zarządu: najpierw pokój, w którym śpi zarząd, potem pozostałe pokoje tego mieszkania */
function miejsceWMieszkaniuZarzadu(st: SimState, w: World, kind: BuildKind): Miejsce | null {
  const h = houseOf(w);
  if (!h) return null;
  const pierwszy = pokojZarzadu(st, w);
  const pokoje = [pierwszy, ...h.rooms.filter((r) => r.apt === h.home && r.id !== pierwszy).map((r) => r.id)];
  for (const id of pokoje) {
    const miejsce = id >= 0 ? miejsceNa(st, w, kind, id) : null;
    if (miejsce) return miejsce;
  }
  return null;
}

/** Zasieki: pierwsze miejsce na kafelku otwartej dziury (zasieki zamykają dziurę); null, gdy żadna dziura nie jest otwarta. */
function miejsceNaDziurze(st: SimState, w: World): Miejsce | null {
  const otwarte = (st.fence?.holes ?? []).filter((d) => !d.patch);
  return miejscaNa(st, w, 'zasieki').find((m) => otwarte.some((d) => d.tiles.includes(m.y * w.size + m.x))) ?? null;
}

/** Budowla z kolejki: rodzaj, czy jest potrzebna teraz (bez badań, limitu i materiału, które sprawdza wybór) i gdzie stanie. */
interface Kandydat {
  kind: BuildKind;
  potrzebna: boolean;
  miejsce: () => Miejsce | null;
}

/** Kolejka budowy w kolejności pierwszeństwa. Warsztat, magazyn, pieczarkarnia i szklarnia po jednej sztuce (stojącej albo planowanej). */
function kolejkaBudowy(st: SimState, w: World, i: GovInput): Kandydat[] {
  const jest = (kind: BuildKind): boolean =>
    st.things.some((t) => t.kind === kind) || st.builds.some((b) => b.kind === kind);
  return [
    {
      kind: 'lozka_pietrowe',
      potrzebna: brakLozek(st, w),
      miejsce: () => miejsceWMieszkaniuZarzadu(st, w, 'lozka_pietrowe'),
    },
    { kind: 'magazyn', potrzebna: !jest('magazyn') && skladPelny(w, i), miejsce: () => miejsceNa(st, w, 'magazyn') },
    { kind: 'warsztat', potrzebna: !jest('warsztat'), miejsce: () => miejsceNa(st, w, 'warsztat') },
    { kind: 'pieczarkarnia', potrzebna: !jest('pieczarkarnia'), miejsce: () => miejsceNa(st, w, 'pieczarkarnia') },
    { kind: 'szklarnia', potrzebna: !jest('szklarnia'), miejsce: () => miejsceNa(st, w, 'szklarnia') },
    { kind: 'zasieki', potrzebna: !!st.fence?.holes.some((d) => !d.patch), miejsce: () => miejsceNaDziurze(st, w) },
  ];
}

/** czy zapasy starczą na całą budowlę (plany w toku nie istnieją, bo budowa idzie pojedynczo) */
const stac = (mats: Readonly<Record<Mat, number>>, kind: BuildKind): boolean =>
  (Object.entries(BUILDS[kind].cost) as [Mat, number][]).every(([m, ile]) => mats[m] >= ile);

/** Budowa z kolejki: najwyżej jeden plan naraz, dopiero gdy warstwa zimy ma swoje za sobą; pierwsza budowla z kolejki, która jest
    potrzebna, odblokowana, bez limitu, ma miejsce i na którą starcza materiału. */
function turaBudowy(g: GraAi, r: Rece, i: GovInput): void {
  const { sim, w } = g;
  const st = sim.st;
  if (st.builds.length || st.cmds.some((c) => c.t === 'build') || zimaWToku(g)) return;
  let mats: Record<Mat, number> | null = null;
  for (const k of kolejkaBudowy(st, w, i)) {
    if (!k.potrzebna || !isUnlocked(st, k.kind) || limitWhy(st, k.kind)) continue;
    mats ??= snapshot(st, w).stock.mats;
    if (!stac(mats, k.kind)) continue;
    const miejsce = k.miejsce();
    if (!miejsce) continue;
    r.polecenie({ t: 'build', ids: [], kind: k.kind, ...miejsce });
    return;
  }
}

/** Badania z kolejki: gdy nic się nie bada (albo wybrane stoi bez wiedzy), pierwsze z `KOLEJKA_BADAN`, na które osada ma wiedzę.
    Zwraca badanie, które idzie po tej turze (bieżące albo wybrane), albo null. Bez pracowni nic. */
function turaBadan(g: GraAi, r: Rece): string | null {
  const st = g.sim.st;
  if (!st.things.some((t) => t.kind === 'pracownia')) return null;
  const mode = modeOf(st);
  const cur = st.research?.cur ?? null;
  const znane = cur !== null && Object.hasOwn(TECH_BY, cur);
  if (znane && kartka(st, cur, mode).stan !== 'stoi') return cur;
  const nastepne = KOLEJKA_BADAN.find((id) => kartka(st, id, mode).stan === 'do_wziecia');
  if (!nastepne) return znane ? cur : null;
  r.polecenie({ t: 'research', ids: [], tech: nastepne });
  return nastepne;
}

/** Tabela Pracy: próg drewna dwa razy większy niż drewno na noc i priorytet 1 Badań dla osoby z największą umiejętnością
    w dziedzinie badania `tech` (przy remisie niższy numer osoby; tylko z umiejętnością co najmniej 1). */
function turaPracy(g: GraAi, r: Rece, i: GovInput, tech: string | null): void {
  const st = g.sim.st;
  const prog = 2 * drewnoNaNoc(i);
  if (progi(st).drewno !== prog) r.polecenie({ t: 'prog', ids: [], co: 'drewno', n: prog });
  if (tech === null || !Object.hasOwn(TECH_BY, tech)) return;
  const dom = TECH_BY[tech].dom;
  let najlepsza: { osoba: number; umiejetnosc: number } | null = null;
  for (const p of st.pawns) {
    const osoba = p.kind === 'core' ? st.people[p.person] : undefined;
    if (!osoba) continue;
    const umiejetnosc = osoba.skills[dom] ?? 0;
    if (
      !najlepsza ||
      umiejetnosc > najlepsza.umiejetnosc ||
      (umiejetnosc === najlepsza.umiejetnosc && p.person < najlepsza.osoba)
    )
      najlepsza = { osoba: p.person, umiejetnosc };
  }
  if (najlepsza && najlepsza.umiejetnosc >= 1 && priorytet(st, najlepsza.osoba, 'badania') !== 1)
    r.polecenie({ t: 'prio', ids: [], osoba: najlepsza.osoba, rodzaj: 'badania', prio: 1 });
}

/** Werbunek: wędrowiec przy siatce dostaje rozmowę (menu `commandsAt`), a po niej zaproszenie, gdy starcza jedzenia na jedno
    przyjęcie i jest wolne łóżko. Rozmowy, która już trwa, nie ponawia. */
function turaWedrowca(g: GraAi, r: Rece, i: GovInput): void {
  const { sim, w } = g;
  const st = sim.st;
  if (!st.obcy) return;
  const wedrowiec = st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1);
  const kto = wedrowiec && najblizszaWolna(st, wedrowiec);
  if (!wedrowiec || !kto) return;
  const kafelek = Math.floor(wedrowiec.y) * w.size + Math.floor(wedrowiec.x);
  const menu = commandsAt(st, w, [kto.id], kafelek);
  const rozmowa = menu.find((m) => m.cmd.t === 'talk');
  if (rozmowa) {
    if (!st.pawns.some((p) => p.job?.t === 'talk' && p.job.target === wedrowiec.id)) r.polecenie(rozmowa.cmd);
    return;
  }
  const zaproszenie = menu.find((m) => m.cmd.t === 'zapros' && !m.off);
  if (zaproszenie && stacNaPrzyjecie(i, 1) && okazjaWerbunku(st, w).wolneLozko) r.polecenie(zaproszenie.cmd);
}

/** Jedna tura warstwy (co 30 s przy ekranie): budowa z kolejki, badania, tabela Pracy i werbunek wędrowca. */
export function turaRozwoju(g: GraAi, r: Rece): void {
  const i = wejscie(g);
  turaBudowy(g, r, i);
  const badanie = turaBadan(g, r);
  turaPracy(g, r, i, badanie);
  turaWedrowca(g, r, i);
}
