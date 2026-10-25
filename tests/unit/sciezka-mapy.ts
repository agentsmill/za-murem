/* Mapy i czynności gracza do testów rozdziałów R6–R8 ścieżki celów (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md):
   pięć map (trzy dema z public/demo i dwa osiedla zapasowe z `genProc`, czyli offline, bez położenia i bez mapy miasta),
   świeża gra na każdej z nich i to, co robi gracz przy badaniach, sąsiadach i płocie: materiały na podwórku, pracownia,
   badanie przy stole, pukanie aż do spotkania, otwarcie budynku, przeszukanie pomieszczenia, ludzie z kart wydarzeń,
   wspólny płot. Wszystko na prawdziwej symulacji, polecenie po poleceniu, bez zaglądania do wnętrza ścieżki.

   Świat jest własny dla gry (`swiezySwiat` buduje go od nowa), bo wspólny płot zmienia siatkę świata w miejscu, więc
   gra, która go stawia, nie może dzielić świata z innymi testami (inaczej niż `demoWorld`). Osiedle zapasowe jest
   w dwóch ziarnach: 2 ma trzech sąsiadów, których da się otoczyć wspólnym płotem, 1 żadnego (jak Przymorze). W trybie
   zombie droga do cudzych drzwi jest wolna od szwendaczy tylko wtedy, gdy gracz ją sobie zrobi (dzidą albo czekaniem,
   aż stado się rozejdzie); test robi to jednym wywołaniem `bezSzwendaczy` przed każdym wyjściem za siatkę.

   Pracownia bez prezentów (`planPracowni`, `graBezPrezentow`): plan budowy bez materiału i gra z automatem pracy ludzi,
   jak w prawdziwej grze (zarząd sam przeszukuje własny dom), z graczem-botem sąsiadów z tests/unit/sasiedzi-play.ts
   (opcja `--sasiedzi` botów: otwiera najbliższe budynki, przeszukuje, nosi łup). Na Zielonkach dom nie zapłaci pracowni
   (14 desek) z własnych pomieszczeń, więc dowodem, że cel `pracownia` da się tam zrobić, jest ta gra, a nie `dajMaterial`. */

import fs from 'node:fs';
import path from 'node:path';
import { makePerson } from '../../src/content/people.ts';
import { hashString, mulberry } from '../../src/core/rng.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { wlaczZwyciestwo } from '../../src/gov/zwyciestwo.ts';
import { kartka, TECHS } from '../../src/sim/badania.ts';
import { TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { applyGov } from '../../src/sim/gov.ts';
import {
  drzwiBudynku,
  kosztPlotu,
  ludzieNaStart,
  mieszkalny,
  moznaPrzeszukac,
  plotDla,
  type WyborSpotkania,
  wnetrze,
} from '../../src/sim/sasiedzi.ts';
import { createSim, type Pawn, Sim, type Thing } from '../../src/sim/sim.ts';
import type { GameMode } from '../../src/sim/tryb.ts';
import { modeOf } from '../../src/sim/tryb.ts';
import { allowedAnchors } from '../../src/ui/budowa.ts';
import { genProc } from '../../src/world/osm.ts';
import { wspolnyPlot } from '../../src/world/plot.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { type SasiedziLog, sasiedziPlayer } from './sasiedzi-play.ts';
import { core as rdzen } from './sasiedzi-pomoc.ts';
import {
  type Demo,
  doPierwszegoRaportu,
  ekran,
  type Gra,
  godzina,
  graj,
  graZSymulacji,
  sekunda,
} from './sciezka-pomoc.ts';

/** mapy: trzy dema (Przymorze i Lanciego to bloki, Zielonki to domy) i osiedle zapasowe w dwóch ziarnach */
export const MAPY = ['przymorze', 'lanciego', 'zielonki', 'zapasowe', 'zapasowe-bez-plotu'] as const;
export type Mapa = (typeof MAPY)[number];

/** ziarna osiedla zapasowego (`genProc(ziarno, 230)`): 2 ma trzech sąsiadów do otoczenia płotem, 1 żadnego */
const ZIARNO_ZAPASOWE: Readonly<Record<'zapasowe' | 'zapasowe-bez-plotu', number>> = {
  zapasowe: 2,
  'zapasowe-bez-plotu': 1,
};

/** czy na mapie wspólny płot dosięga choć jednego sąsiada (`doOtoczenia`): Przymorze 0, Lanciego 4, Zielonki 5, zapasowe 3 albo 0 */
export const PLOT_NA_MAPIE: Readonly<Record<Mapa, boolean>> = {
  przymorze: false,
  lanciego: true,
  zielonki: true,
  zapasowe: true,
  'zapasowe-bez-plotu': false,
};

/** siedziba to dom jednorodzinny (tylko Zielonki), reszta to bloki */
export const mapaDomowa = (m: Mapa): boolean => m === 'zielonki';

/** świat mapy zbudowany od nowa, z ziarnem z adresu (dema) albo z ziarna osiedla zapasowego */
export function swiezySwiat(mapa: Mapa): World {
  if (mapa === 'zapasowe' || mapa === 'zapasowe-bez-plotu') {
    const seed = ZIARNO_ZAPASOWE[mapa];
    return buildWorld(genProc(seed, 230), { seed, street: 'Zapasowa' });
  }
  const d = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../../public/demo/${mapa}.json`), 'utf8'));
  return buildWorld(d.geo, { seed: Number.parseInt(hashString(d.addr), 16) || 2051, street: d.street });
}

/** Świeża gra na własnym świecie mapy: cztery osoby zarządu, drogi do zwycięstwa włączone jak w grze (`enter` w
    src/main.ts), po pierwszym raporcie (drugi dzień, około 6:00; ścieżka w R1). */
export function swiezaGra(mapa: Mapa, mode: GameMode = 'zwykly', seed = 5): Gra {
  const w = swiezySwiat(mapa);
  const sim = new Sim(w, createSim(w, seed, { core: 4, mode }));
  // klucz dema służy testom tylko jako etykieta (blok albo dom), prawdziwa mapa jest w `sim.w`
  const g = graZSymulacji((mapa === 'zielonki' ? 'zielonki' : 'przymorze') as Demo, mode, seed, sim);
  wlaczZwyciestwo(g.gov);
  doPierwszegoRaportu(g);
  return g;
}

/** materiał na wolnych kafelkach podwórka (sterty po najwyżej 10), do którego zarząd sam sięga przy budowie */
export function dajMaterial(g: Gra, co: Readonly<Record<string, number>>): void {
  const { st, w } = g.sim;
  const wolne = w.fence.yard.filter((i) => !w.blocked[i] && !st.things.some((t) => t.y * w.size + t.x === i));
  let k = 0;
  for (const [kind, n] of Object.entries(co))
    for (let ile = n; ile > 0; ile -= 10) {
      const i = wolne[k++];
      if (i === undefined) throw new Error('na podwórku nie ma miejsca na materiał');
      st.things.push({
        id: st.nextThing++,
        kind,
        x: i % w.size,
        y: Math.floor(i / w.size),
        w: 1,
        h: 1,
        rot: 0,
        n: Math.min(10, ile),
        fuel: 0,
        by: -1,
        owner: -1,
      });
    }
}

/** W trybie zombie droga za siatkę jest wolna od szwendaczy, gdy gracz ją oczyści: tu znikają ze świata. Zwykły tryb bez zmian. */
export function bezSzwendaczy(g: Gra): void {
  const { st } = g.sim;
  if (st.pawns.some((p) => p.kind === 'zombie')) st.pawns = st.pawns.filter((p) => p.kind !== 'zombie');
}

/** Gracz dba o osobę, którą wysyła za siatkę: nakarmiona, wypoczęta i w cieple (inaczej pilna potrzeba przerywa każde jej
    polecenie i wraca do siedziby). */
function dbaj(kto: Pawn): void {
  if (!kto.needs) return;
  kto.needs.food = 100;
  kto.needs.rest = 100;
  kto.needs.warm = 100;
}

/** Kroki symulacji, dopóki `dalej()` jest prawdziwe (najwyżej `limit`); co sekundę przy ekranie osoba jest nakarmiona
    i wypoczęta (`dbaj`), a w trybie zombie droga oczyszczona ze szwendaczy, bo za dnia rodzą się one na bieżąco i przerywałyby
    wyjście do cudzych drzwi. */
function krokuj(g: Gra, kto: Pawn, dalej: () => boolean, limit: number): void {
  dbaj(kto);
  for (let n = 0; n < limit && dalej(); n++) {
    g.sim.step();
    if (n % TICKS_PER_SECOND === 0) {
      bezSzwendaczy(g);
      dbaj(kto);
    }
  }
}

/* ---------------------------------------------------------------- badania */

/** Polecenie budowy pracowni w pierwszym miejscu, które dopuszcza budowa (pokój naszego mieszkania), bez żadnego
    materiału: zarząd zbuduje ją, gdy deski i części znajdą się na podwórku. Błąd, gdy w mieszkaniu nie ma dla niej miejsca. */
export function planPracowni(g: Gra): void {
  const { sim } = g;
  const { st, w } = sim;
  for (const rot of [0, 1] as const) {
    const a = allowedAnchors(st, w, 'pracownia', rot)[0];
    if (a === undefined) continue;
    sim.push({ t: 'build', ids: [], kind: 'pracownia', x: a % w.size, y: Math.floor(a / w.size), rot });
    sim.step();
    return;
  }
  throw new Error('w mieszkaniu zarządu nie ma miejsca na pracownię');
}

/** Plan pracowni z materiałem na podwórku (prezent: starcza na każdej mapie, więc testy innych celów R6 nie zależą od
    szabru) i polecenie budowy. */
export function planujPracownie(g: Gra): void {
  dajMaterial(g, { deski: 20, czesci: 6 });
  planPracowni(g);
}

/** Pracownia: plan (`planujPracownie`) i czekanie, aż zarząd ją zbuduje. Zwraca postawioną rzecz. */
export function postawPracownie(g: Gra): Thing {
  planujPracownie(g);
  graj(g, (x) => x.sim.st.things.some((t) => t.kind === 'pracownia'), {}, 4000);
  return g.sim.st.things.find((t) => t.kind === 'pracownia')!;
}

/** Gra sekunda po sekundzie bez żadnego prezentu, aż `warunek` będzie spełniony (najwyżej `limit` sekund przy ekranie;
    domyślnie sześć dób). Zarząd ma automat pracy ludzi, jak w grze, a z `sasiedzi` co sekundę decyduje też gracz-bot
    sąsiadów (`sasiedziPlayer`): ostatnia osoba z zarządu otwiera najbliższe budynki, przeszukuje i nosi łup, w trybie
    zombie tylko za jasnego dnia i z bronią. Zwraca sekundy przy ekranie do spełnienia warunku (null, gdy nie doszło do
    skutku w limicie) i liczniki łupu u sąsiadów. */
export function graBezPrezentow(
  g: Gra,
  warunek: (g: Gra) => boolean,
  { sasiedzi = true, limit = 6 * 960 }: { sasiedzi?: boolean; limit?: number } = {},
): { sekundy: number | null; log: SasiedziLog } {
  const nb = sasiedziPlayer();
  for (let s = 0; s < limit; s++) {
    if (warunek(g)) return { sekundy: s, log: nb.log };
    if (sasiedzi) nb.player(g.sim, g.sim.w, ekran(g.sim.st), (c) => g.sim.push(c));
    sekunda(g);
  }
  return { sekundy: warunek(g) ? limit : null, log: nb.log };
}

/** kartki ery `era`, które osada może teraz wziąć (stan „do wzięcia”), od najtańszej */
export function kartkiDoWziecia(g: Gra, era: number): string[] {
  const { st } = g.sim;
  return TECHS.filter((t) => t.era === era)
    .map((t) => kartka(st, t.id, modeOf(st)))
    .filter((k) => k.stan === 'do_wziecia')
    .sort((a, b) => a.koszt - b.koszt)
    .map((k) => k.id);
}

/** wybór badania (polecenie `research`, które przyjmuje się bez nikogo z zarządu), od razu w symulacji */
export function wybierzBadanie(g: Gra, tech: string | null): void {
  g.sim.push({ t: 'research', ids: [], tech });
  g.sim.step();
}

/** dwie osoby z zarządu do stołu pracowni (polecenie `study`, „Badać: …” z menu pracowni), od razu w symulacji */
export function posadzPrzyStole(g: Gra, lab: Thing, ile = 2): Pawn[] {
  const kto = rdzen(g.sim).slice(0, ile);
  g.sim.push({ t: 'study', ids: kto.map((p) => p.id), thing: lab.id });
  g.sim.step();
  return kto;
}

/** Gra sekunda po sekundzie, aż warunek będzie spełniony; za dnia (7:00–20:00) sadza dwie osoby przy stole, gdy badanie
    jest wybrane, a nikt przy nim nie siedzi (badanie przerywa pilna potrzeba i noc, a rano samo nie wraca). */
export function badajDo(g: Gra, lab: Thing, warunek: (g: Gra) => boolean, limit = 9000): void {
  const { st } = g.sim;
  for (let s = 0; s < limit; s++) {
    if (warunek(g)) return;
    sekunda(g);
    const h = godzina(g);
    if (st.research?.cur && h >= 7 && h < 20 && !st.pawns.some((p) => p.job?.t === 'research')) posadzPrzyStole(g, lab);
  }
  throw new Error(`badanie nie doszło do skutku w ${limit} s przy ekranie (tick ${st.tick})`);
}

/* ---------------------------------------------------------------- sąsiedzi */

/** odległość do kwadratu (w kafelkach) od kafelka przed pierwszymi drzwiami siedziby do kafelka `t` */
const odSiedziby2 = (w: World, t: number): number => {
  const hq = w.buildings[w.hq].entrances[0].out;
  return ((t % w.size) - (hq % w.size)) ** 2 + (Math.floor(t / w.size) - Math.floor(hq / w.size)) ** 2;
};

/** Budynki mieszkalne z drzwiami na zewnątrz, od najbliższych drzwi siedziby: pierwsze drzwi na zewnątrz każdego. Tylko
    takie, w których na start ktoś mieszka (`ludzieNaStart`), albo tylko puste. */
export function budynkiSasiadow(w: World, zamieszkane: boolean): { bid: number; door: number }[] {
  return w.buildings
    .filter(
      (b) => b.id !== w.hq && b.entrances.length > 0 && mieszkalny(w, b.id) && ludzieNaStart(w, b.id) === zamieszkane,
    )
    .sort((a, b) => odSiedziby2(w, a.entrances[0].out) - odSiedziby2(w, b.entrances[0].out))
    .flatMap((b) => {
      const d = drzwiBudynku(w, b.id).zewn[0];
      return d ? [{ bid: b.id, door: d.tile }] : [];
    });
}

/** wybór w spotkaniu, który kończy je bez szkody: ucieczka, gdy rzucili się na nas, inaczej odejście */
export function zakonczSpotkanie(g: Gra): void {
  const { sim } = g;
  const sp = sim.st.sasiedzi?.spotkanie;
  if (!sp) return;
  const choice: WyborSpotkania = sp.atak ? 'ucieczka' : 'odejscie';
  sim.push({ t: 'meet', ids: [], nr: sp.nr, choice });
  sim.step();
}

/** pukanie do jednych drzwi: polecenie i czekanie, aż praca przy drzwiach się skończy (spotkanie, „nikt nie otwiera” albo
    „ktoś jest, ale nie otwiera”); zwraca, czy zaczęło się spotkanie */
export function zapukaj(g: Gra, kto: Pawn, door: number): boolean {
  const { sim } = g;
  const { st } = sim;
  bezSzwendaczy(g);
  dbaj(kto);
  sim.push({ t: 'knock', ids: [kto.id], door });
  sim.step();
  krokuj(g, kto, () => kto.job?.t === 'door' && !st.sasiedzi?.spotkanie, 9000);
  return !!st.sasiedzi?.spotkanie;
}

/** Pukanie do kolejnych zamieszkanych budynków, do każdych drzwi na zewnątrz (blok ma kilka klatek, a lokatorzy mieszkają
    za jedną z nich), po kilka razy do jednych drzwi (nie każdy otwiera od razu), aż zacznie się spotkanie. Zwraca numer
    budynku; spotkanie zostaje otwarte (zakończ je `zakonczSpotkanie`). */
export function pukajAzDoSpotkania(g: Gra, kto: Pawn = rdzen(g.sim).at(-1)!, budynki = 40, razy = 6): number {
  const { st, w } = g.sim;
  for (const { bid } of budynkiSasiadow(w, true).slice(0, budynki))
    for (const { tile } of drzwiBudynku(w, bid).zewn)
      for (let r = 0; r < razy; r++) {
        const n0 = st.sasiedzi?.napis?.n ?? 0;
        if (zapukaj(g, kto, tile)) return bid;
        // nikogo nie ma w domu: kolejne pukanie niczego nie zmieni
        const napis = st.sasiedzi?.napis;
        if (napis && napis.n > n0 && (napis.co === 'nikt' || napis.co === 'szuranie')) break;
      }
  throw new Error('nikt nie otworzył ani razu');
}

/** Otwarcie budynku sąsiada: „Otworzyć drzwi”, a zamknięte na klucz „Wyważyć drzwi” (do skutku); spotkania, które przy tym
    wybuchną (w domu drzwi prowadzą prosto do mieszkania), kończy. Zwraca numer wpisu w `st.sasiedzi.budynki`. */
export function otworzBudynek(g: Gra, kto: Pawn, bid: number, door: number): number {
  const { sim } = g;
  const { st } = sim;
  const otwarty = () => st.sasiedzi?.budynki.find((b) => b.bid === bid)?.otwarty === true;
  for (const t of ['open', 'force', 'force'] as const) {
    if (otwarty()) break;
    bezSzwendaczy(g);
    dbaj(kto);
    sim.push({ t, ids: [kto.id], door });
    sim.step();
    krokuj(g, kto, () => kto.job?.t === 'door', 12000);
    zakonczSpotkanie(g);
  }
  if (!otwarty()) throw new Error(`budynek ${bid} się nie otworzył`);
  return st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
}

/** Przeszukanie pierwszego pomieszczenia otwartego budynku, które da się przeszukać (polecenie `loot`, „Przeszukać …”), do
    skutku; zwraca numer pomieszczenia we wnętrzu budynku. */
export function przeszukajPokoj(g: Gra, kto: Pawn, bid: number): number {
  const { sim } = g;
  const { st, w } = sim;
  const k = st.sasiedzi!.budynki.findIndex((b) => b.bid === bid);
  const rooms = wnetrze(w, bid).rooms;
  const room = rooms.findIndex((_r, i) => moznaPrzeszukac(st, w, k, i) === 'tak');
  if (room < 0) throw new Error(`w budynku ${bid} nie ma czego przeszukać`);
  const dotkniete = () => {
    const b = st.sasiedzi!.budynki[k];
    return b.przeszukane.includes(room) || b.mieszkania.some((m) => m.przeszukane.includes(room));
  };
  bezSzwendaczy(g);
  dbaj(kto);
  sim.push({ t: 'loot', ids: [kto.id], bid, room });
  sim.step();
  krokuj(g, kto, () => !dotkniete(), 20000);
  if (!dotkniete()) throw new Error(`pomieszczenie ${room} budynku ${bid} się nie przeszukało`);
  return room;
}

/* ---------------------------------------------------------------- ludzie i płot */

/** `n` nowych osób do zarządu (karty wydarzeń: „Przyjąć wszystkich”), jak `fx.join` w zarządzie */
export function przyjmijLudzi(g: Gra, n: number, ziarno = 100): void {
  const fx = emptyEffects();
  for (let k = 0; k < n; k++) fx.join.push(makePerson(mulberry(ziarno + k), new Set(), () => ziarno + 1000 + k));
  applyGov(g.sim.st, g.sim.w, fx);
}

/** Budynki w 150 m od drzwi siedziby, które da się otoczyć wspólnym płotem (ksztalt z `wspolnyPlot` na pierwotnej siatce,
    jak liczy `doOtoczenia`), od najbliższego. Budynek nie musi być jeszcze otwarty (`plotDla` tego wymaga dopiero przy
    planie). */
export function budynkiDoOtoczenia(w: World): number[] {
  return w.buildings
    .filter((b) => b.id !== w.hq && b.entrances.length > 0 && odSiedziby2(w, b.entrances[0].out) <= 150 * 150)
    .sort((a, b) => odSiedziby2(w, a.entrances[0].out) - odSiedziby2(w, b.entrances[0].out))
    .filter(
      (b) =>
        wspolnyPlot(
          w,
          w.fence,
          drzwiBudynku(w, b.id).zewn.map((d) => ({ tile: d.tile, out: d.out })),
          new Set<number>(),
        )?.ok,
    )
    .map((b) => b.id);
}

/** Otoczenie sąsiedniego budynku wspólnym płotem do końca: otwarcie jego drzwi, materiał (z zapasem) na podwórku i
    polecenie „Otoczyć wspólnym płotem”, ponawiane, gdy pilna potrzeba przerwie budowę. Zwraca numer budynku. */
export function otoczPlotem(g: Gra, kto: Pawn = rdzen(g.sim)[0]): number {
  const { sim } = g;
  const { st, w } = sim;
  const bid = budynkiDoOtoczenia(w)[0];
  if (bid === undefined) throw new Error('na tej mapie nie ma budynku do otoczenia płotem');
  const door = drzwiBudynku(w, bid).zewn[0].tile;
  otworzBudynek(g, kto, bid, door);
  // koszt płotu (z zapasem na przerwane prace) z tego samego ksztaltu, który pokazuje menu (`plotDla`)
  const ksztalt = plotDla(st, w, bid);
  if (!ksztalt?.ok) throw new Error(`budynek ${bid} nie ma ksztaltu wspólnego płotu`);
  const { need } = kosztPlotu(ksztalt);
  dajMaterial(g, Object.fromEntries(Object.entries(need).map(([m, n]) => [m, n + 4])));
  bezSzwendaczy(g);
  dbaj(kto);
  sim.push({ t: 'enclose', ids: [kto.id], bid });
  sim.step();
  let n = 0;
  krokuj(
    g,
    kto,
    () => {
      // pilna potrzeba przerywa budowę: polecenie jeszcze raz
      if (++n % 400 === 0 && st.plot?.plan && kto.job?.t !== 'plot' && !st.cmds.length)
        sim.push({ t: 'enclose', ids: [kto.id], bid });
      return !st.plot?.bids.includes(bid);
    },
    60000,
  );
  if (!st.plot?.bids.includes(bid)) throw new Error(`płot wokół budynku ${bid} się nie zbudował`);
  return bid;
}
