/* Warstwa zimy silnika osady AI, etap 1 (docs/superpowers/plans/2026-10-21-osada-ai-etap-1.md, zadanie 3).
   Powód: gry botów kończą się zimą w dniach 15–18, bo zarząd śpi w pokoju, który koza z kuchni grzeje tylko przez drzwi
   (kuchnia +16°C ponad pogodę, przedpokój +8, pokój +4), a śpiący traci ciepło o (18 − (temperatura pokoju + 6)) punktów
   na godzinę; ogrzany pokój zarządu daje 5–12 dni więcej (docs/ocena/2026-10-20-zima-w-grach-botow.md, sekcje 3.2 i 7).
   Warstwa prowadzi więc do kozy z beczki w pokoju, w którym śpi zarząd, trzyma drewno na noc i wystawia dyżur przy kozie.

   `turaZimy` idzie co 30 sekund przy ekranie (pilnuje tego `silnik` w src/ai/silnik.ts) i robi najwyżej jedną rzecz na
   raz, w tej kolejności: bez pracowni plan pracowni (`miejsceNa(..., 'pracownia')`, z dala od miejsc, na których stanie
   koza z beczki: w ciasnym pokoju stół zastawiłby ją okno); z pracownią i bez bieżącego badania
   wybór badania `t_kozy`, gdy osada ma do niego wiedzę (do stołu siadają ludzie sami albo ich sadza warstwa rozwoju
   z zadania 5); po `t_kozy` i bez kozy z beczki w pokoju zarządu plan `koza_beczka` w tym pokoju. Ręce do budowy i zbieranie
   materiału dają automat pracy ludzi (plan w grze czeka, aż ktoś go zacznie, a szaber, warsztat i noszenie znoszą
   materiały), więc warstwa nie ponawia planów, które już stoją. Jedna rzecz automat nie załatwia: w domu jednorodzinnym
   (Zielonki) po przeszukaniu pomieszczeń zostaje o kilka desek za mało na pracownię (14), a deski leżą w gruzie na
   podwórku. Gdy plan czeka na materiał, którego w zapasach brakuje, warstwa posyła kogoś do rozbiórki sterty śmieci albo
   gruzu (`zbierzMaterial`; rozbiórka daje deski i złom, `yieldOf`).

   Drewno na noc: `drewnoNaNoc` liczy jak karta nocy (WOOD_PER_HOUR razy 10 godzin od karty o 20:00 do 6:00 razy liczba
   palenisk), a `progDrewna` to zapas na dwie noce; silnik ścina drzewo na opał już poniżej tego progu (silnik podstawowy
   dopiero poniżej 6 sztuk).

   Dyżur przy kozie (`dyzurNaKarcie`) wystawia na karcie nocy najbardziej wypoczętą osobę ze zdrowiem co najmniej 40, która
   śpi (nie stoi na warcie przy siatce ani nie idzie na wyprawę), ale tylko gdy drewna starcza na noc i na dworze jest
   zimno: dyżurny nie śpi i dokłada do wszystkich palenisk (koza zarządu, koza z beczki), więc pokój zarządu ma ogień do
   rana (sztuka starcza na godzinę, koza mieści 4). Gdy karta nie ma tej opcji dla osoby (brak `warta:koza`), idzie
   polecenie `guard` na posterunku „koza” dla jej pionka.

   Warstwa czyta stan gry jak gracz (`wejscie`, `SimState`, świat) i działa tylko rękami (`Rece`); nie ma własnego stanu
   poza pamięcią silnika w grze, niczego nie losuje i nie czyta zegara. Moduły gra.ts, silnik.ts i zima.ts importują się
   nawzajem; cykl jest bezpieczny, bo nikt nie używa cudzego importu przy ładowaniu modułu, tylko w ciele funkcji. */

import { KOZA, KOZA_KEY, WOOD_PER_HOUR } from '../gov/noc.ts';
import type { GovInput, Prompt } from '../gov/typy.ts';
import { kartka } from '../sim/badania.ts';
import { BUILDS, type BuildKind, type BuildPlan, type Mat } from '../sim/budowle.ts';
import { hourOf } from '../sim/clock.ts';
import { houseOf } from '../sim/house.ts';
import { RUBBISH, yieldOf } from '../sim/mieszkania.ts';
import { dismantlable, type SimState } from '../sim/sim.ts';
import { snapshot } from '../sim/snapshot.ts';
import { modeOf } from '../sim/tryb.ts';
import type { World } from '../world/world.ts';
import { type GraAi, type Rece, wejscie } from './gra.ts';
import { miejscaNa, miejsceNa, pokojZarzadu } from './miejsca.ts';

/** Pamięć warstwy zimy (zwykły JSON w `PamiecSilnika.zima`, powstaje przy pierwszym użyciu): sterty (id rzeczy), którym
    zlecono rozbiórkę, po jednym wpisie na każde zlecenie (to samo id wraca, gdy zlecenie się nie powiodło). */
export interface PamiecZimy {
  rozbiorki: number[];
}

/** tyle razy zleca się rozbiórkę tej samej sterty, zanim uzna się, że nikt do niej nie dojdzie */
const PROB_ROZBIORKI = 2;

/** badanie, które odblokowuje kozę z beczki */
export const BADANIE_KOZY = 't_kozy';
/** noc od karty o 20:00 do 6:00 trwa tyle godzin, a koza zjada WOOD_PER_HOUR sztuk drewna na godzinę */
const GODZIN_NOCY = 10;
/** dyżurny musi mieć co najmniej tyle zdrowia (poniżej 40 schodziłby z posterunku w nocy; jak wartownik silnika podstawowego) */
const ZDROWIE_DYZURU = 40;
/** rozbiórkę na materiał zlecamy w ciągu dnia: od tej godziny do tej (w nocy zarząd śpi i trzyma wartę) */
const ROZBIORKA_OD_GODZINY = 7;
const ROZBIORKA_DO_GODZINY = 20;
/** dyżur przy kozie jest potrzebny, gdy na dworze w chwili karty jest poniżej tylu °C (ciepły jesienny wieczór go nie
    wymaga, a kosztuje komuś noc snu) */
const ZIMNO_DYZURU = 8;

/** Drewno na noc tak jak na karcie nocy (`nightWood` w src/gov/noc.ts): WOOD_PER_HOUR × 10 godzin × liczba palenisk
    (`GovInput.paleniska`: koza zarządu, kozy z beczek, kocioł; bez pola jedno). */
export function drewnoNaNoc(i: GovInput): number {
  return WOOD_PER_HOUR * GODZIN_NOCY * (i.paleniska ?? 1);
}

/** Zapas drewna, poniżej którego silnik ścina drzewo na opał: dwie noce. */
export function progDrewna(i: GovInput): number {
  return 2 * drewnoNaNoc(i);
}

/** pionek zarządu osoby o danym id (id osoby ze stanu, jak na karcie nocy) albo undefined */
function pionekOsoby(g: GraAi, osoba: string): number | undefined {
  const st = g.sim.st;
  return st.pawns.find((p) => p.kind === 'core' && st.people[p.person]?.id === osoba)?.id;
}

/** Materiały, których brakuje do budowli `kind` w zapasach (`SimStock.mats`): koszt minus to, co już doniesiono na jej
    plan, minus to, co leży w zapasach. Puste, gdy wszystkiego starcza. */
function brakujaceMaterialy(g: GraAi, kind: BuildKind, plan: BuildPlan | undefined): Partial<Record<Mat, number>> {
  const mats = snapshot(g.sim.st, g.w).stock.mats;
  const braki: Partial<Record<Mat, number>> = {};
  for (const [m, ile] of Object.entries(BUILDS[kind].cost) as [Mat, number][]) {
    const brak = ile - (plan?.have[m] ?? 0) - mats[m];
    if (brak > 0) braki[m] = brak;
  }
  return braki;
}

/** Zbiera materiał do planu, któremu czegoś brakuje: w ciągu dnia, gdy nikt nie rozbiera, posyła najbliższą wolną osobę do
    sterty śmieci albo gruzu, z której rozbiórki wyjdzie najwięcej z brakujących materiałów. Bez takiej sterty (albo bez
    wolnej osoby) nic; resztę materiału znosi i zbiera automat pracy ludzi. Tej samej sterty nie zleca się więcej niż
    `PROB_ROZBIORKI` razy (pamięć `PamiecZimy.rozbiorki`), żeby sterta, do której nikt nie dojdzie, nie dostawała
    polecenia co 30 sekund w kółko. */
function zbierzMaterial(g: GraAi, r: Rece, kind: BuildKind, plan: BuildPlan | undefined): void {
  const { sim, w } = g;
  const st = sim.st;
  const godzina = hourOf(st.tick);
  if (godzina < ROZBIORKA_OD_GODZINY || godzina >= ROZBIORKA_DO_GODZINY) return;
  const braki = brakujaceMaterialy(g, kind, plan);
  const brakow = Object.keys(braki) as Mat[];
  if (!brakow.length || st.pawns.some((p) => p.job?.t === 'dismantle')) return;
  const zysk = (t: { kind: string; n: number; broken?: boolean }): number => {
    const wynik = yieldOf(t.kind, t.n, !!t.broken);
    return brakow.reduce((suma, m) => suma + Math.min(wynik[m] ?? 0, braki[m] ?? 0), 0);
  };
  const zlecone = g.pamiec.zima?.rozbiorki ?? [];
  const sterta = st.things
    .filter(
      (t) =>
        RUBBISH.has(t.kind) &&
        t.by < 0 &&
        zysk(t) > 0 &&
        zlecone.filter((id) => id === t.id).length < PROB_ROZBIORKI &&
        dismantlable(st, w, t),
    )
    .sort((a, b) => zysk(b) - zysk(a) || a.id - b.id)[0];
  if (!sterta) return;
  const odleglosc = (p: { x: number; y: number }): number => (p.x - sterta.x) ** 2 + (p.y - sterta.y) ** 2;
  const kto = st.pawns
    .filter((p) => p.kind === 'core' && !p.away && p.job?.t !== 'sleep' && p.job?.t !== 'guard')
    .sort((a, b) => odleglosc(a) - odleglosc(b) || a.id - b.id)[0];
  if (!kto) return;
  (g.pamiec.zima ??= { rozbiorki: [] }).rozbiorki.push(sterta.id);
  r.polecenie({ t: 'dismantle', ids: [kto.id], thing: sterta.id });
}

/** Kafelki, na których koza z beczki mogłaby stanąć w pokoju zarządu po badaniu (z dostępem do stania): pracownia ich nie
    zajmuje, jeśli ma inne miejsce, bo w ciasnym pokoju zastawiłaby oknem jedyny dobry kafelek pod kozę. */
function kafelkiKozy(st: SimState, w: World): Set<number> {
  const pokoj = pokojZarzadu(st, w);
  if (pokoj < 0) return new Set();
  const poBadaniu = { ...st, techDone: [...(st.techDone ?? []), BADANIE_KOZY] };
  return new Set(miejscaNa(poBadaniu, w, 'koza_beczka', pokoj).map((m) => m.y * w.size + m.x));
}

/** Jedna tura warstwy (co 30 s przy ekranie): pracownia, badanie kozy, koza z beczki w pokoju zarządu. Najwyżej jedno
    polecenie na turę; plan, któremu brakuje materiału, dostaje rozbiórkę śmieci. */
export function turaZimy(g: GraAi, r: Rece): void {
  const { sim, w } = g;
  const st = sim.st;
  const pracownia = st.things.some((t) => t.kind === 'pracownia');
  // 1. bez pracowni nie ma badań: plan pracowni (jest jedna na grę, plan w toku też się liczy)
  if (!pracownia) {
    const plan = st.builds.find((b) => b.kind === 'pracownia');
    if (plan) zbierzMaterial(g, r, 'pracownia', plan);
    else {
      const miejsce = miejsceNa(st, w, 'pracownia', undefined, kafelkiKozy(st, w));
      if (miejsce) r.polecenie({ t: 'build', ids: [], kind: 'pracownia', ...miejsce });
    }
    return;
  }
  // 2. z pracownią i bez bieżącego badania: badanie kozy, o ile osada ma do niego wiedzę
  if (!st.techDone?.includes(BADANIE_KOZY)) {
    if (!st.research?.cur && kartka(st, BADANIE_KOZY, modeOf(st)).stan === 'do_wziecia')
      r.polecenie({ t: 'research', ids: [], tech: BADANIE_KOZY });
    return;
  }
  // 3. po badaniu i bez kozy z beczki w pokoju zarządu: plan kozy w tym pokoju (plan w toku też się liczy)
  const pokoj = pokojZarzadu(st, w);
  const h = houseOf(w);
  if (!h || pokoj < 0) return;
  const plan = st.builds.find((b) => b.kind === 'koza_beczka');
  if (plan) {
    zbierzMaterial(g, r, 'koza_beczka', plan);
    return;
  }
  if (st.things.some((t) => t.kind === 'koza_beczka' && h.room[t.y * w.size + t.x] === pokoj)) return;
  const miejsce = miejsceNa(st, w, 'koza_beczka', pokoj);
  if (miejsce) r.polecenie({ t: 'build', ids: [], kind: 'koza_beczka', ...miejsce });
}

/** Dyżur przy kozie na karcie nocy (przed jej zatwierdzeniem): najbardziej wypoczęta osoba ze zdrowiem co najmniej 40, która
    śpi, dostaje `warta:koza`; gdy karta nie ma tej opcji dla osoby, idzie polecenie `guard` na posterunku „koza”. Tylko gdy
    drewna starcza na noc, na dworze jest zimno i nikt jeszcze nie czuwa przy kozie. */
export function dyzurNaKarcie(g: GraAi, p: Extract<Prompt, { k: 'karta' }>, r: Rece): void {
  const i = wejscie(g);
  if (i.outdoor >= ZIMNO_DYZURU || i.stock.wood < drewnoNaNoc(i)) return;
  // przydział na żywo z zarządu (p.assign to kopia sprzed zmian), zmiany z tej samej karty widać od razu
  const przydzial = g.gov.night?.assign ?? {};
  if (Object.values(przydzial).includes(KOZA_KEY)) return;
  const dyzurny = [...p.card.people]
    .filter((o) => o.needs.health >= ZDROWIE_DYZURU && (przydzial[o.id] ?? 'sen') === 'sen')
    .sort((a, b) => b.needs.rest - a.needs.rest)[0];
  if (!dyzurny) return;
  if (dyzurny.options.some((o) => o.key === KOZA_KEY && o.ok) && r.przydziel(dyzurny.id, KOZA_KEY)) return;
  const pionek = pionekOsoby(g, dyzurny.id);
  if (pionek !== undefined) r.polecenie({ t: 'guard', ids: [pionek], post: KOZA });
}
