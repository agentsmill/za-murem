/* Warstwa rozwoju silnika osady AI (src/ai/rozwoj.ts, `silnik` w src/ai/silnik.ts) i okna zarządu w prawdziwej grze, etap 1 osady
   AI (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 5). Pilnuje:
   - budowy z kolejki: łóżka piętrowe w pokoju zarządu, gdy łóżek nie ma więcej niż osób, magazyn przy pełnym składzie drewna,
     warsztat, pieczarkarnia i szklarnia po badaniach, zasieki na otwartej dziurze; tylko z odblokowanych, tylko gdy materiał
     już jest, najwyżej jeden plan naraz (także gdy plan czeka w kolejce poleceń) i dopiero gdy warstwa zimy ma swoje za sobą;
   - badań z `KOLEJKA_BADAN` po kolei, gdy nic się nie bada (albo wybrane stoi bez wiedzy), z `t_ambu` (zdrowie wraca 1,6× szybciej)
     na końcu: pracownia nie stoi bez zajęcia od 7. dnia, a zdrowie zarządu to wąskie gardło przeżycia (zadanie 6);
   - tabeli Pracy: priorytet 1 Badań dla osoby z największą umiejętnością w dziedzinie badania i próg drewna 2 × drewno na noc;
   - werbunku: wędrowiec pod bramą dostaje rozmowę, a po niej zaproszenie, gdy starcza jedzenia na przyjęcie (porcje na osobę
     zarządu, bez mieszkańców); wolne łóżko zwiększa szansę zaproszenia w symulacji (+0,15), ale go nie wymaga (zadanie 7);
   - kosztu (warstwy najwyżej raz na 30 sekund przy ekranie), determinizmu (zapis i wczytanie) i celu etapu (budowle do 12. dnia);
     przebieg prawdziwej gry (Przymorze, ziarno 11, jak w przeglądarce) jest w tests/unit/ai-rozwoj-przebieg.test.ts.
   Decydent „bez rozwoju” to silnik, któremu ręce nie pozwalają na nic z warstwy rozwoju (budowy jej rodzajów, badania ponad
   kozę, tabela Pracy, rozmowy z wędrowcami): stan sprzed warstwy, na którym ustawia się warunki testów. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type Decydent,
  type GraAi,
  grajDo,
  krokGry,
  nowaGraAi,
  type Rece,
  skrotGry,
  wczytajGre,
  wejscie,
  type ZapisGryAi,
  zapiszGre,
  zrobRece,
} from '../../src/ai/gra.ts';
import { miejscaNa, miejsceNa, pokojZarzadu } from '../../src/ai/miejsca.ts';
import { KOLEJKA_BADAN, turaRozwoju } from '../../src/ai/rozwoj.ts';
import { silnik } from '../../src/ai/silnik.ts';
import { drewnoNaNoc, zimaWToku } from '../../src/ai/zima.ts';
import { kartka } from '../../src/sim/badania.ts';
import { BUILDS, canPlace } from '../../src/sim/budowle.ts';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { houseOf, inHomeApt } from '../../src/sim/house.ts';
import { priorytet, progi } from '../../src/sim/praca.ts';
import { type Command, okazjaWerbunku, STACK } from '../../src/sim/sim.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { budowleStojace } from '../../tools/osada-ocena.ts';
import { graDoTicku, graPoDniach, rzecz, type Szpieg, swiezySwiat, szpieg, tickDnia } from './ai-pomoc.ts';
import { okolicaZGeo } from './miasto-play.ts';
import { demoWorld } from './sasiedzi-pomoc.ts';

const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../public/demo/przymorze.json'), 'utf8'));
const okolica = okolicaZGeo(demo.geo);

type Budowa = Extract<Command, { t: 'build' }>;

/** polecenia z warstwy rozwoju (rodzaje budowli rozwoju, badania ponad kozę, tabela Pracy, rozmowy z wędrowcami) */
const BUDOWLE_ROZWOJU = new Set(['lozka_pietrowe', 'magazyn', 'warsztat', 'pieczarkarnia', 'szklarnia', 'zasieki']);
function zRozwoju(c: Command): boolean {
  switch (c.t) {
    case 'prio':
    case 'prog':
    case 'talk':
    case 'zapros':
      return true;
    case 'build':
      return BUDOWLE_ROZWOJU.has(c.kind);
    case 'research':
      return c.tech !== 't_kozy';
    default:
      return false;
  }
}

/** ręce bez niczego z warstwy rozwoju */
const receBezRozwoju = (r: Rece): Rece => ({ ...r, polecenie: (c) => (zRozwoju(c) ? undefined : r.polecenie(c)) });

/** Silnik „bez rozwoju”: warstwy zimy i jedzenia oraz okna jak w `silnik`, a rozwojowi ręce nic nie przepuszczają. */
const silnikBezRozwoju: Decydent = { ...silnik, tura: (g, r) => silnik.tura(g, receBezRozwoju(r)) };

const budowy = (s: Szpieg): Budowa[] => s.polecenia.filter((c): c is Budowa => c.t === 'build');

/** w zapasach dokładnie tyle desek, złomu i części (reszta zapasów bez zmian) */
function ustawMaterialy(g: GraAi, m: { deski?: number; zlom?: number; czesci?: number }): void {
  const st = g.sim.st;
  st.things = st.things.filter((t) => t.kind !== 'deski' && t.kind !== 'zlom' && t.kind !== 'czesci');
  st.store.parts = 0;
  const kafelek = houseOf(g.w)!.sklad[0];
  const [x, y] = [kafelek % g.w.size, Math.floor(kafelek / g.w.size)];
  if (m.deski) st.things.push(rzecz(g, 'deski', x, y, m.deski));
  if (m.zlom) st.things.push(rzecz(g, 'zlom', x, y, m.zlom));
  if (m.czesci) st.things.push(rzecz(g, 'czesci', x, y, m.czesci));
}

/** łóżka w mieszkaniu zarządu (całe po jednym, piętrowe po dwa) */
function lozkaZarzadu(g: GraAi): number {
  const st = g.sim.st;
  const h = houseOf(g.w)!;
  return st.things
    .filter(
      (t) =>
        ['lozko', 'wersalka', 'lozka_pietrowe'].includes(t.kind) && !t.broken && inHomeApt(h, t.y * g.w.size + t.x),
    )
    .reduce((a, t) => a + (t.kind === 'lozka_pietrowe' ? 2 : 1), 0);
}

const rdzen = (g: GraAi): number => g.sim.st.pawns.filter((p) => p.kind === 'core').length;

/** dokłada łóżka w pokoju zarządu, aż jest wolne (łóżek więcej niż osób w zarządzie) */
function dolozLozka(g: GraAi): void {
  const st = g.sim.st;
  const miejsce = miejsceNa(st, g.w, 'lozka_pietrowe', pokojZarzadu(st, g.w))!;
  for (let k = lozkaZarzadu(g); k <= rdzen(g); k++) st.things.push(rzecz(g, 'lozko', miejsce.x, miejsce.y));
}

/** skład drewna: pusty albo pełny (każdy kafelek składu ze stosem `STACK` sztuk) */
function ustawSklad(g: GraAi, pelny: boolean): void {
  const st = g.sim.st;
  const sklad = houseOf(g.w)!.sklad;
  st.things = st.things.filter((t) => !(t.kind === 'drewno' && sklad.includes(t.y * g.w.size + t.x)));
  if (pelny) for (const i of sklad) st.things.push(rzecz(g, 'drewno', i % g.w.size, Math.floor(i / g.w.size), STACK));
}

// ---------------------------------------------------------------- budowa, badania, praca

describe('turaRozwoju: przygotowanie warunków (Przymorze, ziarno 11, dzień 6, 10:00)', () => {
  let podstawa: GraAi;
  const kopia = (): GraAi => wczytajGre(podstawa.w, JSON.parse(JSON.stringify(zapiszGre(podstawa))) as ZapisGryAi);

  /** gra z czystym polem do budowy: bez planów i poleceń w kolejce, z materiałem i drewnem w składzie jak w teście */
  function gra(m: Parameters<typeof ustawMaterialy>[1] = { deski: 40, zlom: 30, czesci: 8 }): GraAi {
    const g = kopia();
    g.sim.st.builds = [];
    g.sim.st.cmds = [];
    ustawMaterialy(g, m);
    ustawSklad(g, false);
    return g;
  }

  beforeAll(() => {
    // z pamięci pliku: tę samą grę (silnik bez rozwoju do 6. dnia, 10:00) przedłuża niżej test „cel etapu”
    podstawa = graDoTicku('przymorze', 11, tickDnia(6, 10), { okolica }, silnikBezRozwoju);
  }, 120_000);

  it('warunki: pracownia i koza z beczki stoją, kozę zbadano, w mieszkaniu zarządu brakuje wolnego łóżka', () => {
    const st = podstawa.sim.st;
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(true);
    expect(st.things.some((t) => t.kind === 'koza_beczka')).toBe(true);
    expect(st.techDone).toContain('t_kozy');
    expect(lozkaZarzadu(podstawa)).toBeLessThanOrEqual(rdzen(podstawa));
  });

  describe('budowa', () => {
    it('bez wolnego łóżka plan łóżek piętrowych w mieszkaniu zarządu, jeden plan', () => {
      const g = gra();
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(budowy(s)).toHaveLength(1);
      const [plan] = budowy(s);
      expect(plan.kind).toBe('lozka_pietrowe');
      expect(plan.ids).toEqual([]);
      expect(inHomeApt(houseOf(g.w)!, plan.y * g.w.size + plan.x)).toBe(true);
      expect(canPlace(g.sim.st, g.w, 'lozka_pietrowe', plan.x, plan.y, plan.rot).ok).toBe(true);
    });

    it('z wolnym łóżkiem nie stawia łóżek, tylko warsztat', () => {
      const g = gra();
      dolozLozka(g);
      expect(lozkaZarzadu(g)).toBeGreaterThan(rdzen(g));
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(budowy(s).map((b) => b.kind)).toEqual(['warsztat']);
      expect(canPlace(g.sim.st, g.w, 'warsztat', budowy(s)[0].x, budowy(s)[0].y, budowy(s)[0].rot).ok).toBe(true);
    });

    it('magazyn przy pełnym składzie drewna, przed warsztatem; przy niepełnym nie', () => {
      // skład to dwa kafelki po `STACK` sztuk: pełny, gdy jest w nim 20 sztuk drewna; magazyn kosztuje 30 desek
      expect(houseOf(podstawa.w)!.sklad.length * STACK).toBe(20);
      expect(BUILDS.magazyn.cost.deski).toBe(30);
      const pelny = gra();
      dolozLozka(pelny);
      ustawSklad(pelny, true);
      const a = szpieg();
      turaRozwoju(pelny, a.r);
      expect(budowy(a).map((b) => b.kind)).toEqual(['magazyn']);

      const pusty = gra();
      dolozLozka(pusty);
      const b = szpieg();
      turaRozwoju(pusty, b.r);
      expect(budowy(b).map((x) => x.kind)).toEqual(['warsztat']);
    });

    it('stojący albo planowany warsztat i magazyn nie powstają drugi raz', () => {
      const g = gra();
      dolozLozka(g);
      ustawSklad(g, true);
      const st = g.sim.st;
      const miejsce = miejsceNa(st, g.w, 'magazyn')!;
      st.things.push({ ...rzecz(g, 'magazyn', miejsce.x, miejsce.y), w: 2, h: 2 });
      const s = szpieg();
      turaRozwoju(g, s.r);
      // magazyn już stoi: dalej warsztat
      expect(budowy(s).map((b) => b.kind)).toEqual(['warsztat']);

      // warsztat stoi: nic z kolejki (zasieków nie ma gdzie, pieczarkarni nie odblokowano)
      const miejsceW = miejsceNa(st, g.w, 'warsztat')!;
      st.things.push({ ...rzecz(g, 'warsztat', miejsceW.x, miejsceW.y), w: 2 });
      const t = szpieg();
      turaRozwoju(g, t.r);
      expect(budowy(t)).toEqual([]);
    });

    it('najwyżej jeden plan naraz: plan w toku albo budowa w kolejce poleceń wstrzymują kolejną', () => {
      const wToku = gra();
      wToku.sim.st.builds.push({
        id: 999,
        kind: 'ogrodek',
        x: 1,
        y: 1,
        rot: 0,
        need: { deski: 14 },
        have: {},
        work: 0,
        by: -1,
      });
      const a = szpieg();
      turaRozwoju(wToku, a.r);
      expect(budowy(a)).toEqual([]);

      const wKolejce = gra();
      wKolejce.sim.st.cmds.push({ t: 'build', ids: [], kind: 'koza_beczka', x: 1, y: 1, rot: 0 });
      const b = szpieg();
      turaRozwoju(wKolejce, b.r);
      expect(budowy(b)).toEqual([]);
    });

    it('stawia plan tylko wtedy, gdy materiał już jest: bez desek nic, z samymi deskami łóżka (20), ale nie warsztat (20 + 10 złomu)', () => {
      const bez = gra({ deski: 5, zlom: 30, czesci: 8 });
      const a = szpieg();
      turaRozwoju(bez, a.r);
      expect(budowy(a)).toEqual([]);

      const deski = gra({ deski: 20 });
      const b = szpieg();
      turaRozwoju(deski, b.r);
      expect(budowy(b).map((x) => x.kind)).toEqual(['lozka_pietrowe']);

      const bezZlomu = gra({ deski: 20 });
      dolozLozka(bezZlomu);
      const c = szpieg();
      turaRozwoju(bezZlomu, c.r);
      expect(budowy(c)).toEqual([]);
    });

    it('pieczarkarnia i szklarnia dopiero po badaniach (t_grzyby, t_szklarnia), gdy starcza materiału', () => {
      const bezBadan = gra({ deski: 12, zlom: 0, czesci: 4 });
      dolozLozka(bezBadan);
      const a = szpieg();
      turaRozwoju(bezBadan, a.r);
      expect(budowy(a)).toEqual([]);

      const grzyby = gra({ deski: 8 });
      dolozLozka(grzyby);
      grzyby.sim.st.techDone = [...(grzyby.sim.st.techDone ?? []), 't_grzyby'];
      expect(miejsceNa(grzyby.sim.st, grzyby.w, 'pieczarkarnia')).not.toBeNull();
      const b = szpieg();
      turaRozwoju(grzyby, b.r);
      expect(budowy(b).map((x) => x.kind)).toEqual(['pieczarkarnia']);

      const szklarnia = gra({ deski: 10, czesci: 4 });
      dolozLozka(szklarnia);
      szklarnia.sim.st.techDone = [...(szklarnia.sim.st.techDone ?? []), 't_szklarnia'];
      expect(miejsceNa(szklarnia.sim.st, szklarnia.w, 'szklarnia')).not.toBeNull();
      const c = szpieg();
      turaRozwoju(szklarnia, c.r);
      expect(budowy(c).map((x) => x.kind)).toEqual(['szklarnia']);
    });

    it('zasieki tylko na otwartej dziurze w siatce', () => {
      const g = gra({ zlom: 10 });
      dolozLozka(g);
      const st = g.sim.st;
      // bez otwartych dziur nic
      for (const h of st.fence!.holes) h.patch = 1;
      const a = szpieg();
      turaRozwoju(g, a.r);
      expect(budowy(a)).toEqual([]);
      // otwarta dziura: zasieki na jej kafelku
      const dziura = st.fence!.holes.find((h) =>
        miejscaNa(st, g.w, 'zasieki').some((m) => h.tiles.includes(m.y * g.w.size + m.x)),
      );
      expect(dziura, 'świat ma dziurę, na której da się postawić zasieki').toBeDefined();
      dziura!.patch = 0;
      const b = szpieg();
      turaRozwoju(g, b.r);
      expect(budowy(b)).toHaveLength(1);
      expect(budowy(b)[0].kind).toBe('zasieki');
      expect(dziura!.tiles).toContain(budowy(b)[0].y * g.w.size + budowy(b)[0].x);
    });

    it('czeka na zimę: bez pracowni, z badaniem kozy w zasięgu albo z niepostawioną kozą z beczki nic nie buduje', () => {
      const bezPracowni = gra();
      bezPracowni.sim.st.things = bezPracowni.sim.st.things.filter((t) => t.kind !== 'pracownia');
      const a = szpieg();
      turaRozwoju(bezPracowni, a.r);
      expect(budowy(a)).toEqual([]);

      // kozy jeszcze nie zbadano, a osada ma na to wiedzę: warstwa zimy zaraz ją zbada i postawi
      const przedBadaniem = gra();
      przedBadaniem.sim.st.things = przedBadaniem.sim.st.things.filter((t) => t.kind !== 'koza_beczka');
      przedBadaniem.sim.st.techDone = (przedBadaniem.sim.st.techDone ?? []).filter((t) => t !== 't_kozy');
      expect(kartka(przedBadaniem.sim.st, 't_kozy', modeOf(przedBadaniem.sim.st)).stan).toBe('do_wziecia');
      const b = szpieg();
      turaRozwoju(przedBadaniem, b.r);
      expect(budowy(b)).toEqual([]);

      // koza zbadana, w pokoju zarządu jest dla niej miejsce, ale jeszcze nie stoi
      const bezKozy = gra();
      bezKozy.sim.st.things = bezKozy.sim.st.things.filter((t) => t.kind !== 'koza_beczka');
      expect(
        miejsceNa(bezKozy.sim.st, bezKozy.w, 'koza_beczka', pokojZarzadu(bezKozy.sim.st, bezKozy.w)),
      ).not.toBeNull();
      const c = szpieg();
      turaRozwoju(bezKozy, c.r);
      expect(budowy(c)).toEqual([]);

      // ta sama koza w planie też wstrzymuje rozwój (plan zimy, nie rozwoju)
      const plan = gra();
      plan.sim.st.things = plan.sim.st.things.filter((t) => t.kind !== 'koza_beczka');
      plan.sim.st.cmds.push({ t: 'build', ids: [], kind: 'koza_beczka', x: 1, y: 1, rot: 0 });
      const d = szpieg();
      turaRozwoju(plan, d.r);
      expect(budowy(d)).toEqual([]);
    });

    it('nie czeka na zimę, której nikt nie zacznie: badanie kozy bez wiedzy w osadzie', () => {
      const g = gra();
      const st = g.sim.st;
      st.things = st.things.filter((t) => t.kind !== 'koza_beczka');
      st.techDone = (st.techDone ?? []).filter((t) => t !== 't_kozy');
      st.books = {};
      for (const o of st.people) o.skills.cieplo = 0;
      expect(kartka(st, 't_kozy', modeOf(st)).stan).toBe('brak_wiedzy');
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(budowy(s).map((b) => b.kind)).toEqual(['lozka_pietrowe']);
    });
  });

  describe('badania z KOLEJKA_BADAN', () => {
    it('kolejka: kozy, okna, konserwy, grzyby, zielarstwo, szklarnia, ambulatorium', () => {
      expect(KOLEJKA_BADAN).toEqual([
        't_kozy',
        't_okna',
        't_konserwy',
        't_grzyby',
        't_zielarstwo',
        't_szklarnia',
        't_ambu',
      ]);
    });

    /** gra z wiedzą we wszystkich dziedzinach (książki), bez bieżącego badania i z podanymi badaniami za sobą */
    function graBadan(zrobione: string[], cur: string | null = null): GraAi {
      const g = gra();
      const st = g.sim.st;
      st.books = { cieplo: 2, bud: 2, uprawa: 2, med: 2 };
      st.techDone = zrobione;
      st.research = { cur, prog: {}, at: {} };
      return g;
    }
    const badanie = (s: Szpieg): string[] =>
      s.polecenia
        .filter((c) => c.t === 'research')
        .map((c) => (c as Extract<Command, { t: 'research' }>).tech ?? 'null');

    it('wybiera po kolei następne badanie, gdy nic się nie bada', () => {
      const wybor = (zrobione: string[]): string[] => {
        const s = szpieg();
        turaRozwoju(graBadan(zrobione), s.r);
        return badanie(s);
      };
      expect(wybor([])).toEqual(['t_kozy']);
      expect(wybor(['t_kozy'])).toEqual(['t_okna']);
      expect(wybor(['t_kozy', 't_okna'])).toEqual(['t_konserwy']);
      expect(wybor(['t_kozy', 't_okna', 't_konserwy'])).toEqual(['t_grzyby']);
      expect(wybor(['t_kozy', 't_okna', 't_konserwy', 't_grzyby'])).toEqual(['t_zielarstwo']);
      expect(wybor(['t_kozy', 't_okna', 't_konserwy', 't_grzyby', 't_zielarstwo'])).toEqual(['t_szklarnia']);
      expect(wybor(['t_kozy', 't_okna', 't_konserwy', 't_grzyby', 't_zielarstwo', 't_szklarnia'])).toEqual(['t_ambu']);
      // kolejka wyczerpana
      expect(wybor([...KOLEJKA_BADAN])).toEqual([]);
    });

    it('po sześciu badaniach pracownia nie stoi bez zajęcia: t_ambu (zdrowie wraca 1,6× szybciej), a bez wiedzy z medycyny nic', () => {
      // Pomiar (15 przebiegów, ziarna 11–15): w Przymorzu i Lanciego sześć badań jest gotowych w dniach 6–8 i stół pracowni stoi
      // pusty, choć t_ambu jest do wzięcia, a zdrowie zarządu jest wąskim gardłem: pożar co dobę (−20 najzdrowszej osobie),
      // rany z wypraw (−20…−35) i napady wyprzedzają regenerację (+0,5 na godzinę, tylko przy cieple i sytości).
      const szesc = KOLEJKA_BADAN.filter((id) => id !== 't_ambu');
      const z = graBadan(szesc);
      expect(kartka(z.sim.st, 't_ambu', modeOf(z.sim.st)).stan).toBe('do_wziecia');
      const a = szpieg();
      turaRozwoju(z, a.r);
      expect(badanie(a)).toEqual(['t_ambu']);

      // Zielonki: nikt z zarządu nie zna się na medycynie (książek też brak), więc t_ambu czeka na wiedzę i kolejka jest pusta
      const bez = graBadan(szesc);
      bez.sim.st.books = { cieplo: 2, bud: 2, uprawa: 2 };
      for (const p of bez.sim.st.people) p.skills.med = 0;
      expect(kartka(bez.sim.st, 't_ambu', modeOf(bez.sim.st)).stan).toBe('brak_wiedzy');
      const b = szpieg();
      turaRozwoju(bez, b.r);
      expect(badanie(b)).toEqual([]);
    });

    it('pomija badanie, na które osada nie ma wiedzy, i bierze następne', () => {
      const g = graBadan(['t_kozy']);
      // „Okna” (budownictwo) bez wiedzy: ani umiejętności, ani książek
      g.sim.st.books = { cieplo: 2, uprawa: 2, med: 2 };
      for (const p of g.sim.st.people) p.skills.bud = 0;
      expect(kartka(g.sim.st, 't_okna', modeOf(g.sim.st)).stan).toBe('brak_wiedzy');
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(badanie(s)).toEqual(['t_konserwy']);
    });

    it('nie rusza badania, które trwa; zastępuje to, które stoi bez wiedzy', () => {
      const trwa = graBadan(['t_kozy'], 't_okna');
      expect(kartka(trwa.sim.st, 't_okna', modeOf(trwa.sim.st)).stan).toBe('w_toku');
      const a = szpieg();
      turaRozwoju(trwa, a.r);
      expect(badanie(a)).toEqual([]);

      const stoi = graBadan(['t_kozy'], 't_okna');
      stoi.sim.st.books = { cieplo: 2, uprawa: 2, med: 2 };
      for (const p of stoi.sim.st.people) p.skills.bud = 0;
      expect(kartka(stoi.sim.st, 't_okna', modeOf(stoi.sim.st)).stan).toBe('stoi');
      const b = szpieg();
      turaRozwoju(stoi, b.r);
      expect(badanie(b)).toEqual(['t_konserwy']);
    });

    it('bez pracowni nie wybiera badania', () => {
      const g = graBadan([]);
      g.sim.st.things = g.sim.st.things.filter((t) => t.kind !== 'pracownia');
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(badanie(s)).toEqual([]);
    });
  });

  describe('tabela Pracy', () => {
    /** poleceń `prio` i `prog` ze świeżej tury */
    const prio = (s: Szpieg) => s.polecenia.filter((c): c is Extract<Command, { t: 'prio' }> => c.t === 'prio');
    const prog = (s: Szpieg) => s.polecenia.filter((c): c is Extract<Command, { t: 'prog' }> => c.t === 'prog');

    /** gra z badaniem z uprawy w toku i umiejętnościami uprawy ustawionymi osobom zarządu po kolei */
    function graZUprawa(umiejetnosci: number[]): GraAi {
      const g = gra();
      const st = g.sim.st;
      st.books = { cieplo: 2, bud: 2, uprawa: 2, med: 2 };
      st.techDone = ['t_kozy'];
      st.research = { cur: 't_konserwy', prog: {}, at: {} };
      const rdzenPionki = st.pawns.filter((p) => p.kind === 'core');
      rdzenPionki.forEach((p, k) => {
        st.people[p.person].skills.uprawa = umiejetnosci[k] ?? 0;
      });
      st.praca = undefined;
      return g;
    }

    it('priorytet 1 Badań dla osoby z największą umiejętnością w dziedzinie bieżącego badania', () => {
      // domyślnie priorytet 1 ma dopiero umiejętność 3; dwójka jest najlepsza w zarządzie, więc dostaje jedynkę
      const g = graZUprawa([1, 2, 1, 0, 0, 0, 0, 0]);
      const st = g.sim.st;
      const rdzenPionki = st.pawns.filter((p) => p.kind === 'core');
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(prio(s)).toEqual([{ t: 'prio', ids: [], osoba: rdzenPionki[1].person, rodzaj: 'badania', prio: 1 }]);
    });

    it('przy remisie umiejętności niższy numer osoby, a gdy priorytet już jest 1, nic', () => {
      const g = graZUprawa([2, 2, 1, 0, 0, 0, 0, 0]);
      const st = g.sim.st;
      const rdzenPionki = st.pawns.filter((p) => p.kind === 'core');
      const pierwsza = Math.min(rdzenPionki[0].person, rdzenPionki[1].person);
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(prio(s).map((c) => c.osoba)).toEqual([pierwsza]);
      // po zastosowaniu polecenia kolejna tura go nie powtarza
      const r = zrobRece(g);
      for (const c of s.polecenia) r.polecenie(c);
      g.sim.step();
      expect(priorytet(st, pierwsza, 'badania')).toBe(1);
      const t = szpieg();
      turaRozwoju(g, t.r);
      expect(prio(t)).toEqual([]);
    });

    it('bez nikogo z umiejętnością w dziedzinie badania, bez badania i z badaniem z innej dziedziny nie rusza tabeli', () => {
      const nikt = graZUprawa([0, 0, 0, 0, 0, 0, 0, 0]);
      const a = szpieg();
      turaRozwoju(nikt, a.r);
      expect(prio(a)).toEqual([]);

      const bez = graZUprawa([3, 3, 3, 3, 3, 3, 3, 3]);
      bez.sim.st.research = { cur: null, prog: {}, at: {} };
      bez.sim.st.techDone = [...KOLEJKA_BADAN];
      const b = szpieg();
      turaRozwoju(bez, b.r);
      expect(prio(b)).toEqual([]);
    });

    it('próg drewna to dwa razy drewno na noc, ustawiany raz', () => {
      const g = gra();
      const i = wejscie(g);
      const prog20 = 2 * drewnoNaNoc(i);
      expect(prog20).toBeGreaterThan(0);
      const s = szpieg();
      turaRozwoju(g, s.r);
      expect(prog(s)).toEqual([{ t: 'prog', ids: [], co: 'drewno', n: prog20 }]);
      // po zastosowaniu nie powtarza
      const r = zrobRece(g);
      for (const c of s.polecenia) r.polecenie(c);
      g.sim.step();
      expect(progi(g.sim.st).drewno).toBe(prog20);
      const t = szpieg();
      turaRozwoju(g, t.r);
      expect(prog(t)).toEqual([]);
    });
  });
});

describe('turaRozwoju: Lanciego (sypialnie bez okna, koza z beczki nie ma miejsca)', () => {
  it('zimaWToku jest fałszem po badaniu kozy, którą nie ma gdzie postawić, więc rozwój buduje', () => {
    const g = nowaGraAi(demoWorld('lanciego'), 11, { okolica });
    grajDo(g, silnikBezRozwoju, tickDnia(7, 10));
    const st = g.sim.st;
    expect(st.techDone).toContain('t_kozy');
    expect(st.things.some((t) => t.kind === 'pracownia')).toBe(true);
    // koza zbadana, ale w pokoju zarządu nie ma dla niej miejsca: nic nie czeka na zimę
    expect(st.things.some((t) => t.kind === 'koza_beczka')).toBe(false);
    expect(miejsceNa(st, g.w, 'koza_beczka', pokojZarzadu(st, g.w))).toBeNull();
    expect(zimaWToku(g)).toBe(false);
    st.builds = [];
    st.cmds = [];
    ustawMaterialy(g, { deski: 40, zlom: 30, czesci: 8 });
    ustawSklad(g, false);
    const s = szpieg();
    turaRozwoju(g, s.r);
    expect(budowy(s)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- werbunek wędrowców

describe('turaRozwoju: wędrowiec pod bramą', () => {
  /** gra z obcymi, doprowadzona do chwili, w której wędrowiec stoi przy siatce i nikt z nim nie rozmawia */
  function graZWedrowcem(): { g: GraAi; id: number } {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica, obcy: true });
    const st = g.sim.st;
    const jest = () => st.pawns.find((p) => p.kind === 'wedrowiec' && p.job?.phase === 1 && p.job.what !== 'zagadany');
    while (!jest() && st.tick < tickDnia(4, 0)) krokGry(g, silnikBezRozwoju);
    const t = jest();
    if (!t) throw new Error('żaden wędrowiec nie stanął przy siatce');
    return { g, id: t.id };
  }

  /** po rozmowie: ten sam wędrowiec zagadany, z jedzeniem na przyjęcie i wolnym łóżkiem */
  function poRozmowie(): { g: GraAi; id: number } {
    const { g, id } = graZWedrowcem();
    const st = g.sim.st;
    const r = zrobRece(g);
    turaRozwoju(g, r);
    const t = st.pawns.find((p) => p.id === id)!;
    while (t.job?.what !== 'zagadany' && st.tick < tickDnia(4, 0)) {
      krokGry(g, silnikBezRozwoju);
      if (!st.pawns.some((p) => p.id === id)) throw new Error('wędrowiec odszedł przed końcem rozmowy');
    }
    expect(t.job?.what).toBe('zagadany');
    return { g, id };
  }

  /** zapas jedzenia w skład */
  function ustawJedzenie(g: GraAi, porcje: number): void {
    const st = g.sim.st;
    st.things = st.things.filter((t) => t.kind !== 'jedzenie' && t.kind !== 'posilek');
    const kafelek = houseOf(g.w)!.sklad[0];
    if (porcje > 0) st.things.push(rzecz(g, 'jedzenie', kafelek % g.w.size, Math.floor(kafelek / g.w.size), porcje));
  }

  it('zagaduje wędrowca: polecenie talk najbliższej wolnej osoby z zarządu', () => {
    const { g, id } = graZWedrowcem();
    const s = szpieg();
    turaRozwoju(g, s.r);
    const rozmowy = s.polecenia.filter((c): c is Extract<Command, { t: 'talk' }> => c.t === 'talk');
    expect(rozmowy).toHaveLength(1);
    expect(rozmowy[0].target).toBe(id);
    expect(rozmowy[0].ids).toHaveLength(1);
    const kto = g.sim.st.pawns.find((p) => p.id === rozmowy[0].ids[0])!;
    expect(kto.kind).toBe('core');
    expect(kto.away).toBeFalsy();
    expect(kto.job?.t).not.toBe('sleep');
    expect(kto.job?.t).not.toBe('guard');
  });

  it('nie zagaduje drugi raz, gdy ktoś już z nim rozmawia', () => {
    const { g } = graZWedrowcem();
    const r = zrobRece(g);
    turaRozwoju(g, r);
    const st = g.sim.st;
    // rozmowa ruszyła (praca talk)
    while (!st.pawns.some((p) => p.job?.t === 'talk') && st.tick < tickDnia(4, 0)) krokGry(g, silnikBezRozwoju);
    expect(st.pawns.some((p) => p.job?.t === 'talk')).toBe(true);
    const s = szpieg();
    turaRozwoju(g, s.r);
    expect(s.polecenia.filter((c) => c.t === 'talk')).toEqual([]);
  });

  it('po rozmowie zaprasza, gdy starcza jedzenia na przyjęcie i jest wolne łóżko', () => {
    const { g, id } = poRozmowie();
    ustawJedzenie(g, 500);
    dolozLozka(g);
    expect(okazjaWerbunku(g.sim.st, g.w).wolneLozko).toBe(true);
    const s = szpieg();
    turaRozwoju(g, s.r);
    const zaproszenia = s.polecenia.filter((c): c is Extract<Command, { t: 'zapros' }> => c.t === 'zapros');
    expect(zaproszenia).toHaveLength(1);
    expect(zaproszenia[0].target).toBe(id);
    expect(s.polecenia.filter((c) => c.t === 'talk')).toEqual([]);
  });

  it('po rozmowie nie zaprasza bez jedzenia na przyjęcie', () => {
    const glodny = poRozmowie();
    ustawJedzenie(glodny.g, 0);
    dolozLozka(glodny.g);
    const a = szpieg();
    turaRozwoju(glodny.g, a.r);
    expect(a.polecenia.filter((c) => c.t === 'zapros')).toEqual([]);
  });

  it('po rozmowie zaprasza także bez wolnego łóżka: zwerbowany śpi na podłodze, a wolne łóżko to tylko +0,15 do szansy', () => {
    // wcześniej wolne łóżko było warunkiem: w Przymorzu 11 wędrowców było kilkudziesięciu, rozmów 16–23 w 20 dni, zaproszeń 0
    const bezLozka = poRozmowie();
    ustawJedzenie(bezLozka.g, 500);
    const st = bezLozka.g.sim.st;
    const h = houseOf(bezLozka.g.w)!;
    st.things = st.things.filter(
      (t) => !(['lozko', 'wersalka', 'lozka_pietrowe'].includes(t.kind) && inHomeApt(h, t.y * bezLozka.g.w.size + t.x)),
    );
    expect(okazjaWerbunku(st, bezLozka.g.w).wolneLozko).toBe(false);
    const b = szpieg();
    turaRozwoju(bezLozka.g, b.r);
    expect(b.polecenia.filter((c) => c.t === 'zapros')).toHaveLength(1);
  });

  it('jedzenie na przyjęcie liczy się na osoby zarządu: mieszkańcy siedziby go nie zmniejszają', () => {
    // zapas dokładnie na 2 porcje na osobę zarządu po przyjęciu jednej osoby; mieszkańców jest kilku (nie jedzą z zapasu zarządu),
    // więc z nimi w głowach (po staremu) zapasu by nie starczało
    const { g } = poRozmowie();
    const zarzad = rdzen(g);
    const i = wejscie(g);
    expect(i.residents).toBeGreaterThan(0);
    ustawJedzenie(g, 2 * (zarzad + 1));
    const s = szpieg();
    turaRozwoju(g, s.r);
    expect(s.polecenia.filter((c) => c.t === 'zapros')).toHaveLength(1);
    // o porcję mniej i zaproszenia nie ma
    const g2 = poRozmowie().g;
    ustawJedzenie(g2, 2 * (rdzen(g2) + 1) - 1);
    const s2 = szpieg();
    turaRozwoju(g2, s2.r);
    expect(s2.polecenia.filter((c) => c.t === 'zapros')).toEqual([]);
  });

  it('bez wędrowca pod bramą nie rusza niczego w sprawie wędrowców', () => {
    const g = nowaGraAi(demoWorld('przymorze'), 11, { okolica, obcy: true });
    grajDo(g, silnikBezRozwoju, 200);
    expect(g.sim.st.pawns.some((p) => p.kind === 'wedrowiec')).toBe(false);
    const s = szpieg();
    turaRozwoju(g, s.r);
    expect(s.polecenia.filter((c) => c.t === 'talk' || c.t === 'zapros')).toEqual([]);
  });
});

describe('koszt i determinizm', () => {
  it('warstwy najwyżej raz na 30 sekund przy ekranie: w dobie gry każda z nich rusza najwyżej 33 razy', () => {
    const g = graPoDniach('przymorze', 11, 1, { okolica });
    const licznik = g.pamiec.wywolania ?? {};
    for (const warstwa of ['zima', 'jedzenie', 'rozwoj']) {
      expect(licznik[warstwa], warstwa).toBeGreaterThan(0);
      expect(licznik[warstwa], warstwa).toBeLessThanOrEqual(33);
    }
    // 30 sekund przy ekranie to 600 ticków: w dobie (19 200 ticków) dokładnie 32 pełne okresy
    expect(licznik.rozwoj).toBe(Math.floor(TICKS_PER_DAY / (30 * TICKS_PER_SECOND)));
  });

  it('zapis i wczytanie w połowie (po planie, w środku badania) nie zmieniają przebiegu z warstwą rozwoju', () => {
    // jedna gra ciągła mija obie przerwy: zapis w przerwie to odczyt, który jej nie rusza, a gra wczytana z niego ma dojść do
    // tego samego skrótu co ona (osobne gry doliczane od zera do przerw kosztowałyby jeszcze 5,3 doby gry z obcymi)
    const ciagla = nowaGraAi(swiezySwiat('przymorze'), 11, { okolica, obcy: true });
    const zapisy: ZapisGryAi[] = [];
    for (const przerwa of [tickDnia(3, 12) + 7, tickDnia(5, 2) + 123]) {
      grajDo(ciagla, silnik, przerwa);
      zapisy.push(JSON.parse(JSON.stringify(zapiszGre(ciagla))) as ZapisGryAi);
    }
    grajDo(ciagla, silnik, tickDnia(7, 0));
    for (const zapis of zapisy) {
      const b = wczytajGre(swiezySwiat('przymorze'), zapis);
      expect(b.pamiec).toEqual(zapis.pamiec);
      grajDo(b, silnik, tickDnia(7, 0));
      expect(skrotGry(b)).toBe(skrotGry(ciagla));
    }
  }, 120_000);
});

describe('cel etapu: wzrost osady', () => {
  // Cel z planu: co najmniej jedna budowla na trzy dni do 30. dnia (stojące budowle w dniu 30 co najmniej 10). Przymorze 11 dożywa
  // 45. dnia z czterema budowlami. W 15 przebiegach uprzęży (trzy dema, ziarna 11–15, z łańcuchami kart) na koniec stoi 4–5 budowli
  // na Przymorzu, 1–2 na Lanciego i 2 na Zielonkach (cel w dniu 45 to 15); ze 300 deskami na starcie w składzie 10, 8 i 6 (na 60
  // przebiegach), czyli deski (13 od 4. dnia, po pieczarkarni 5) starczają na cztery budowle i to one, nie silnik, są wąskim
  // gardłem. Cel mierzy bramka etapu (zadanie 7, `npm run bot:osada`: budowle na koniec przebiegu), więc tu zostaje zapowiedzią.
  it.todo('cel etapu (bramka zadania 7): w dniu 30 stoi co najmniej 10 budowli');

  it('budowle: rozwój dokłada do trzech z bazy (pracownia, koza z beczki, ogródek) co najmniej jedną budowlę do 12. dnia', () => {
    // z pamięci pliku: silnik bez rozwoju przedłuża grę z początku pliku (6. dzień, 10:00), silnik zaczyna od doby z testu kosztu
    const budowleDo12 = (decydent: Decydent): number =>
      budowleStojace(graDoTicku('przymorze', 11, tickDnia(12, 6), { okolica }, decydent).sim.st.things);
    const z = budowleDo12(silnik);
    const bez = budowleDo12(silnikBezRozwoju);
    expect(z).toBeGreaterThan(bez);
  }, 120_000);
});
