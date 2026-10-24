/* Pogrzeb po prawdziwej śmierci (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 2, „Karty z sytuacji”,
   „Nowa karta `pogrzeb`”): po zgonie kogoś z zarządu albo mieszkańca z imieniem (GovInput.dead z płcią `f`; zgony bez
   imienia karty nie mają) zarząd w ciągu doby, za dnia albo wieczorem, dostaje kartę z trzema wyborami: pochować pod
   trzepakiem (wszystkim nastrój „Pożegnaliśmy: Imię” +2 na dobę, kto kopał, odpoczynek −10), pożegnać przy kozie
   (nastrój +1) i bez ceremonii (wkurzenie +1). Każdy zgon najwyżej jedna karta (GovState.pogrzebN). W trybie zombie tekst
   mówi, czy ciało dobito (GovInput.dead[].cialo z prawdziwych zwłok w symulacji; póki ciało leży i może wstać, karta
   czeka). Host z atrapy zarządu, dwa przebiegi z zegarem co sekundę przy ekranie, odczyt GovInput.dead z prawdziwej
   symulacji (zwykły tryb z mieszkańcami z generatora i tryb zombie) oraz jedna gra z zarządem i mieszkańcami. */

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { nastrojEn } from '../../src/content/nastroje.en.ts';
import { mulberry } from '../../src/core/rng.ts';
import { type DanePogrzebu, poraOf } from '../../src/gov/tresc.ts';
import type { GovEffects, GovInput, GovLokator, GovState } from '../../src/gov/typy.ts';
import { emptyEffects, gameMin } from '../../src/gov/wspolne.ts';
import { M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, govUpdate, lawEffects, loadGov, newGov, pending, saveGov } from '../../src/gov/zarzad.ts';
import { wczytajDaneMieszkancow } from '../../src/mieszkancy/wczytaj.ts';
import { minutesAt, TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { govInput } from '../../src/sim/gov.ts';
import { mapaMieszkancow, mieszkancyNowejGry, opcjaMieszkancow } from '../../src/sim/osiedle.ts';
import { createSim, FEVER_TICKS, infect, RISE_TICKS, Sim } from '../../src/sim/sim.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { Atrapa, answer, at, TPH, TPS } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';
import { mockBlock } from './interior-mock.ts';
import { pl, polskieSlowa } from './po-angielsku.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
/** Atrapa `fetch`: ścieżka względna to plik w public/, brak pliku to 404 (jak w wydarzenia-lokatorzy.test.ts). */
const plikowy = (async (adr: string) => {
  const plik = path.join(PUBLIC, adr);
  if (!fs.existsSync(plik)) return new Response('brak', { status: 404 });
  return new Response(fs.readFileSync(plik));
}) as unknown as typeof fetch;

type Zgon = NonNullable<GovInput['dead']>[number];

const ev = M1_EVENTS.find((e) => e.id === 'pogrzeb')!;

/** tick atrapy dla dnia, godziny i minuty gry */
const tickAt = (day: number, hour: number, minute = 0): number =>
  Math.round(((at(day, hour, minute) - 15 * 60) * TPH) / 60);
const minAtrapy = (a: Atrapa): number => (a.day - 1) * 1440 + a.hour * 60 + a.minute;

/** zgon osoby z zarządu albo mieszkańca z imieniem (id puste); `min` to minuta gry zgonu, jak liczy ją symulacja */
const zgon = (name: string, min: number, over: Partial<Zgon> = {}): Zgon => ({
  id: '',
  name,
  cause: 'rany',
  tick: Math.round(((min - 15 * 60) * TPH) / 60),
  f: name.split(' ')[0].endsWith('a'),
  min,
  ...over,
});

interface Widziany {
  /** minuta gry, w której karta czekała na decyzję */
  min: number;
  hour: number;
  d: DanePogrzebu;
}

/** Zarząd na atrapie co sekundę przy ekranie z listą zgonów w wejściu (atrapa sama ich nie ma). Okna odpowiada jak gracz
    „propozycja” (pierwszy dostępny wybór), a karty pogrzebu zapisuje. `tempo` to tempo gry (8×: sekunda przy ekranie to
    pięć razy mniej niż godzina gry). */
function graj(gov: GovState, atr: Atrapa, doMin: number, zgony: () => Zgon[], r = mulberry(7), tempo = 1) {
  const widziane: Widziany[] = [];
  atr.tempo = tempo;
  const wej = (): GovInput => ({ ...atr.input(), dead: zgony() });
  while (minAtrapy(atr) < doMin) {
    atr.tick++;
    if (atr.tick % TPH === 0) atr.hourly(lawEffects(gov).foodMult);
    // sekunda przy ekranie: co 20 ticków przy 1×, co 20 × tempo ticków przy szybszym tempie
    if (atr.tick % (TPS * tempo) !== 0) continue;
    atr.apply(govUpdate(gov, wej()));
    for (let k = 0; k < 5; k++) {
      const p = pending(gov, wej());
      if (!p) break;
      if (p.k === 'wydarzenie' && p.id === 'pogrzeb')
        widziane.push({ min: minAtrapy(atr), hour: atr.hour, d: gov.ev.active!.d as DanePogrzebu });
      answer(gov, atr, p, 'propozycja', r);
    }
  }
  return widziane;
}

/** atrapa od dnia 3 o danej godzinie, z zapasami na kilka dób */
function start(seed = 1, hour = 9, mode: 'zwykly' | 'zombie' = 'zwykly') {
  const gov = newGov(seed, mode);
  const atr = new Atrapa(seed);
  atr.supplies = 40;
  atr.woodSklad = 40;
  atr.scrap = 5;
  atr.tick = tickAt(3, hour);
  return { gov, atr, t0: minAtrapy(atr) };
}

// ---------------------------------------------------------------- host

const MIESZKANCY: GovLokator[] = [
  mieszkaniec('r1', 'Halina Kowalska', true),
  mieszkaniec('r2', 'Marek Nowak', false),
  mieszkaniec('r3', 'Ewa Zielińska', true),
];
function mieszkaniec(id: string, name: string, f: boolean): GovLokator {
  return {
    pawn: 100 + Number(id.slice(1)),
    id,
    name,
    first: name.split(' ')[0],
    f,
    age: 50,
    prof: 'Elektryk',
    skills: {},
    traits: [],
    needs: { food: 60, warm: 60, rest: 60, health: 90, safe: 60, mood: 60 },
    asleep: false,
    inside: true,
    tile: 5000,
  };
}

/** zarząd, wejście (dzień 3, 10:00, trzech mieszkańców z imionami) i host */
function setup(over: Partial<GovInput> = {}, seed = 1, mode: 'zwykly' | 'zombie' = 'zwykly') {
  const gov = newGov(seed, mode);
  const atr = new Atrapa(seed);
  const i: GovInput = {
    ...atr.input(),
    day: 3,
    hour: 10,
    minute: 0,
    screen: 1000,
    residents: 3,
    lokatorzy: MIESZKANCY.map((l) => ({ ...l, needs: { ...l.needs } })),
    ...over,
  };
  const fx = emptyEffects();
  return { gov, i, fx, h: makeHost(gov, i, fx) };
}

const DANE: DanePogrzebu = { id: 's9', name: 'Janina Wrona', f: true, cause: 'rany' };
const DANE_M: DanePogrzebu = { id: '', name: 'Jan Wrona', f: false, cause: 'gorączka' };

function wybierz(d: DanePogrzebu, k: number, over: Partial<GovInput> = {}, mode: 'zwykly' | 'zombie' = 'zwykly') {
  const { gov, i } = setup(over, 1, mode);
  gov.ev.active = { id: 'pogrzeb', d };
  const fx: GovEffects = chooseEvent(gov, i, k);
  return { gov, i, fx };
}

describe('karta pogrzeb: treść i wybory', () => {
  it('jest w puli bez wagi (przychodzi z listy zgonów, nie z losowania), w obu trybach, za dnia i wieczorem', () => {
    expect(ev).toBeTruthy();
    expect(ev.w(setup().h)).toBe(0);
    expect(ev.when).toEqual(['dzien', 'wieczor']);
    expect(ev.tryby).toBeUndefined();
    expect(ev.once).toBeFalsy();
  });

  it('trzy wybory: pochować (nastrój „Pożegnaliśmy …” +2 na dobę wszystkim, kopiący odpoczynek −10), przy kozie (+1), bez ceremonii (wkurzenie +1)', () => {
    const { h, i } = setup();
    expect(ev.title(h, DANE).pl).toBe('Pogrzeb');
    expect(ev.choices(h, DANE).map((c) => c.label.pl)).toEqual([
      'Pochować pod trzepakiem',
      'Pożegnać przy kozie',
      'Bez ceremonii',
    ]);
    expect(ev.choices(h, DANE).every((c) => c.ok)).toBe(true);
    const wszyscy = [...i.people.map((p) => p.id), ...MIESZKANCY.map((l) => l.id)];

    // pochować: wszystkim +2 na dobę, kopie najbardziej wypoczęty spoza warty (−10 odpoczynku), zaufanie i wkurzenie bez zmian
    const a = wybierz(DANE, 0);
    expect(a.fx.moods.map((m) => m.id).sort()).toEqual([...wszyscy].sort());
    for (const m of a.fx.moods) expect(m).toMatchObject({ why: 'Pożegnaliśmy: Janina', d: 2, hours: 24 });
    const kopiacy = [...a.i.people].sort((x, y) => y.needs.rest - x.needs.rest || (x.id < y.id ? -1 : 1))[0];
    expect(a.fx.needs).toEqual([{ id: kopiacy.id, d: { rest: -10 } }]);
    expect(a.gov.trust).toBe(50);
    expect(a.gov.anger).toBe(20);
    expect(a.fx.log.map(pl).join(' ')).toContain('Janina Wrona leży teraz pod trzepakiem');
    expect(a.fx.log.map(pl).join(' ')).toContain(kopiacy.name);

    // przy kozie: nastrój +1 wszystkim, nikt nie kopie
    const b = wybierz(DANE, 1);
    expect(b.fx.moods).toHaveLength(wszyscy.length);
    for (const m of b.fx.moods) expect(m).toMatchObject({ why: 'Pożegnaliśmy: Janina', d: 1, hours: 24 });
    expect(b.fx.needs).toEqual([]);
    expect(b.gov.trust).toBe(50);
    expect(b.gov.anger).toBe(20);

    // bez ceremonii: wkurzenie +1, bez nastrojów
    const c = wybierz(DANE, 2);
    expect(c.fx.moods).toEqual([]);
    expect(c.fx.needs).toEqual([]);
    expect(c.gov.anger).toBe(21);
    expect(c.gov.trust).toBe(50);
    // każdy wybór zamyka kartę i zapisuje decyzję
    for (const x of [a, b, c]) {
      expect(x.gov.ev.active).toBeNull();
      expect(x.gov.decisions.at(-1)?.k).toBe('wydarzenie');
    }
  });

  it('kopie ktoś spoza warty, wyprawy i zabiegu; nikt nie może: nikt nie kopie, nastroje i tak wchodzą', () => {
    const baza = setup().i.people;
    // najbardziej wypoczęty stoi na warcie, więc kopie następny
    const najlepszy = [...baza].sort((x, y) => y.needs.rest - x.needs.rest || (x.id < y.id ? -1 : 1))[0];
    const ludzie = baza.map((p) => (p.id === najlepszy.id ? { ...p, post: 'brama' } : p));
    const bez = wybierz(DANE, 0, { people: ludzie });
    expect(bez.fx.needs).toHaveLength(1);
    expect(bez.fx.needs[0].id).not.toBe(najlepszy.id);
    // wszyscy z zarządu na warcie: nikt nie kopie
    const wszyscyNaWarcie = baza.map((p) => ({ ...p, post: 'brama' }));
    const nikt = wybierz(DANE, 0, { people: wszyscyNaWarcie });
    expect(nikt.fx.needs).toEqual([]);
    expect(nikt.fx.moods.length).toBe(baza.length + MIESZKANCY.length);
    expect(nikt.fx.log.map(pl).join(' ')).toContain('Janina Wrona leży teraz pod trzepakiem');
  });

  it('w domu zamiast trzepaka ogród; bez mieszkańców z osobą nastroje dostaje sam zarząd', () => {
    const baza = setup().h.place();
    const dom = { ...baza, kind: 'dom' as const, near: 'domy' as const, houses: 6, blocks: 0 };
    const { h } = setup({ place: dom, lokatorzy: undefined, residents: 0 });
    const t = ev.text(h, DANE);
    expect(t.pl).not.toMatch(/trzepak/);
    expect(t.en).not.toMatch(/carpet rack/);
    expect(ev.choices(h, DANE)[0].label.pl).toBe('Pochować w ogrodzie');
    expect(ev.choices(h, DANE)[0].label.en).toBe('Bury her in the garden');
    const { fx } = wybierz(DANE, 0, { place: dom, lokatorzy: undefined, residents: 0 });
    expect(fx.moods).toHaveLength(4);
    expect(fx.log.map(pl).join(' ')).toContain('Janina Wrona leży teraz w ogrodzie');
  });

  it('tekst: kto umarł i od czego, zarząd albo mieszkaniec, bez pięter i numerów mieszkań', () => {
    const { h } = setup();
    const zarzad = ev.text(h, { ...DANE, cause: 'gorączka' }).pl;
    expect(zarzad).toContain('Janina Wrona nie żyje, po ugryzieniu.');
    expect(zarzad).toContain('Była z zarządu.');
    const lokator = ev.text(h, DANE_M).pl;
    expect(lokator).toContain('Jan Wrona nie żyje, po ugryzieniu.');
    expect(lokator).toContain('Mieszkał w waszej klatce.');
    for (const t of [zarzad, lokator]) expect(t).not.toMatch(/piętr|numer|nr \d|mieszkanie \d/i);
    for (const cause of ['rany', 'gorączka', 'amputacja'])
      expect(ev.text(h, { ...DANE, cause }).pl).toContain(
        `nie żyje, ${{ rany: 'od ran', gorączka: 'po ugryzieniu', amputacja: 'przy amputacji' }[cause]}.`,
      );
  });

  it('tryb zombie: tekst mówi, czy ciało dobito; tryb zwykły o ciele milczy', () => {
    const { h } = setup({}, 1, 'zombie');
    const dobite = ev.text(h, { ...DANE, cialo: 'dobite' });
    expect(dobite.pl).toMatch(/Dobiliście ją, zanim zdążyła wstać/);
    expect(dobite.en).toMatch(/finished her off before she could get up/);
    const nie = ev.text(h, { ...DANE, cialo: 'brak' });
    expect(nie.pl).toMatch(/Nikt jej nie dobił/);
    expect(nie.en).toMatch(/Nobody finished her off/);
    const on = ev.text(h, { ...DANE_M, cialo: 'dobite' });
    expect(on.pl).toMatch(/Dobiliście go, zanim zdążył wstać/);
    expect(on.en).toMatch(/finished him off before he could get up/);
    expect(ev.text(h, { ...DANE_M, cialo: 'brak' }).pl).toMatch(/Nikt go nie dobił/);
    for (const t of [ev.text(setup().h, DANE), ev.text(setup().h, DANE_M)]) {
      expect(t.pl).not.toMatch(/dobi/i);
      expect(t.en).not.toMatch(/finish/i);
    }
    // bez ciała nie ma czego grzebać: tabliczka zamiast grobu
    expect(ev.choices(h, { ...DANE, cialo: 'brak' })[0].label.pl).toBe('Postawić tabliczkę pod trzepakiem');
    expect(ev.choices(h, { ...DANE, cialo: 'dobite' })[0].label.pl).toBe('Pochować pod trzepakiem');
    const { fx } = wybierz({ ...DANE, cialo: 'brak' }, 0, {}, 'zombie');
    expect(fx.log.map(pl).join(' ')).toContain('Pod trzepakiem stanęła tabliczka z napisem „Janina Wrona”');
    expect(fx.moods.every((m) => m.d === 2)).toBe(true);
  });

  it('polski: imię zmarłego zawsze w mianowniku (bez odmiany nie ma „wykreślił Ewelina”)', () => {
    const baza = setup().h.place();
    const miejsca = [{}, { place: { ...baza, kind: 'dom' as const, near: 'domy' as const, houses: 6, blocks: 0 } }];
    // przed imieniem może stać tylko początek zdania, cudzysłów, dwukropek albo czasownik, którego imię jest podmiotem
    const DOZWOLONE = /(^|[.!?] |„|: |wykopał |wykopała )@$/;
    let widzianych = 0;
    for (const miejsce of miejsca)
      for (const d of [DANE, DANE_M])
        for (const cialo of [undefined, 'dobite', 'brak'] as const) {
          const dane: DanePogrzebu = { ...d, ...(cialo ? { cialo } : {}) };
          const tryb = cialo ? 'zombie' : 'zwykly';
          const { h } = setup(miejsce, 1, tryb);
          const teksty = [ev.title(h, dane).pl, ev.text(h, dane).pl, ...ev.choices(h, dane).map((c) => c.label.pl)];
          for (let k = 0; k < 3; k++) teksty.push(...wybierz(dane, k, miejsce, tryb).fx.log.map(pl));
          for (const t of teksty)
            for (const m of t.matchAll(new RegExp(dane.name, 'g'))) {
              expect(`${t.slice(Math.max(0, m.index - 12), m.index)}@`, t).toMatch(DOZWOLONE);
              widzianych++;
            }
        }
    expect(widzianych).toBeGreaterThan(20);
    // wybór „Bez ceremonii” po imieniu w mianowniku po dwukropku
    expect(wybierz(DANE, 2).fx.log.map(pl).join(' ')).toContain(
      'Ktoś skreślił w grafiku dyżurów linijkę: Janina Wrona. I tyle.',
    );
    expect(
      wybierz(DANE, 2)
        .fx.log.map((l) => l.en)
        .join(' '),
    ).toContain('Somebody crossed a line off the duty rota: Janina Wrona.');
  });

  it('angielski bez polskich słów: tytuł, tekst, wybory i wpisy do kroniki, oba rodzaje, oba miejsca, oba tryby', () => {
    const baza = setup().h.place();
    const miejsca = [{}, { place: { ...baza, kind: 'dom' as const, near: 'domy' as const, houses: 6, blocks: 0 } }];
    for (const miejsce of miejsca)
      for (const d of [DANE, DANE_M, { ...DANE, id: 's3' }, { ...DANE_M, id: 's4' }]) {
        for (const cialo of [undefined, 'dobite', 'brak'] as const)
          for (const cause of ['rany', 'gorączka', 'amputacja']) {
            const dane: DanePogrzebu = { ...d, cause, ...(cialo ? { cialo } : {}) };
            const { h } = setup(miejsce, 1, cialo ? 'zombie' : 'zwykly');
            const teksty = [ev.title(h, dane).en, ev.text(h, dane).en, ...ev.choices(h, dane).map((c) => c.label.en)];
            for (let k = 0; k < 3; k++) {
              const { fx } = wybierz(dane, k, miejsce, cialo ? 'zombie' : 'zwykly');
              teksty.push(...fx.log.map((l) => l.en));
            }
            for (const t of teksty) expect(polskieSlowa(t, [dane.name, 'Atrapia 7']), t).toEqual([]);
            expect(teksty.join(' ')).toContain(dane.name);
          }
      }
    // powód nastroju po angielsku: imię w mianowniku, wzorzec w src/content/nastroje.en.ts
    const { fx } = wybierz(DANE, 0);
    expect(fx.moods[0].why).toBe('Pożegnaliśmy: Janina');
    expect(nastrojEn(fx.moods[0].why)).toBe('We said goodbye to Janina');
    expect(polskieSlowa(nastrojEn(fx.moods[0].why), ['Janina'])).toEqual([]);
  });
});

// ---------------------------------------------------------------- wyzwalacz

describe('karta pogrzeb: kiedy przychodzi', () => {
  it('po zgonie z imieniem karta pogrzeb przychodzi w ciągu doby za dnia albo wieczorem', () => {
    // [opis, godzina zgonu, minuta, osoba z zarządu?]
    const przypadki: [string, number, number, boolean][] = [
      ['rano', 9, 0, true],
      ['w południe, mieszkaniec', 12, 15, false],
      ['po południu', 16, 40, true],
      ['wieczorem', 20, 30, false],
      ['późnym wieczorem', 21, 55, true],
      ['w nocy', 23, 30, true],
      ['nad ranem, mieszkaniec', 3, 10, false],
    ];
    for (const [opis, hour, minute, zarzad] of przypadki) {
      const { gov, atr, t0 } = start(3, 9);
      // zgon w dniu 3 (godziny przed 9:00 to dzień 4)
      const dzien = hour < 9 ? 4 : 3;
      const kiedy = at(dzien, hour, minute);
      const lista: Zgon[] = [];
      const cel = zarzad ? atr.people[0] : null;
      const widziane = graj(gov, atr, kiedy + 1440 + 60, () => {
        if (minAtrapy(atr) >= kiedy && !lista.length) {
          // zmarły z zarządu znika z atrapy w chwili zgonu
          if (cel) atr.people = atr.people.filter((p) => p.id !== cel.id);
          lista.push(
            cel ? zgon(cel.name, kiedy, { id: cel.id, f: cel.f }) : zgon('Halina Kowalska', kiedy, { f: true }),
          );
        }
        return lista;
      });
      expect(t0).toBeLessThanOrEqual(kiedy);
      expect(widziane, opis).toHaveLength(1);
      const w = widziane[0];
      expect(w.min, opis).toBeGreaterThanOrEqual(kiedy);
      expect(w.min - kiedy, opis).toBeLessThanOrEqual(1440);
      expect(['dzien', 'wieczor'], `${opis} o ${w.hour}`).toContain(poraOf(w.hour));
      expect(w.d, opis).toMatchObject({
        id: lista[0].id,
        name: lista[0].name,
        f: lista[0].f,
        cause: 'rany',
      });
      expect(gov.pogrzebN, opis).toBe(1);
    }
  });

  it('za dnia karta przychodzi niedługo po zgonie, w nocy dopiero rano', () => {
    const wCzasie = (hour: number, minute: number) => {
      const { gov, atr } = start(3, 9);
      const kiedy = at(hour < 9 ? 4 : 3, hour, minute);
      const lista: Zgon[] = [];
      const w = graj(gov, atr, kiedy + 1440, () => {
        if (minAtrapy(atr) >= kiedy && !lista.length) lista.push(zgon('Halina Kowalska', kiedy));
        return lista;
      });
      return { opoznienie: w[0].min - kiedy, hour: w[0].hour };
    };
    // w południe: odstęp między wydarzeniami to najwyżej kilka godzin gry (200 s przy ekranie, górna granica odstępu, to 5 godzin)
    expect(wCzasie(12, 0).opoznienie).toBeLessThanOrEqual(5 * 60);
    // o 23:30 dopiero od 8:00
    const noc = wCzasie(23, 30);
    expect(noc.hour).toBeGreaterThanOrEqual(8);
    expect(noc.opoznienie).toBeGreaterThanOrEqual(8 * 60 + 30);
  });

  it('każdy zgon najwyżej jedna karta (pogrzebN); zgony bez imienia tylko przesuwają licznik', () => {
    const { gov, atr } = start(5, 9);
    const t = at(3, 10);
    const lista: Zgon[] = [];
    const dolozone = new Set<number>();
    const dolozZgon = (k: number, z: Zgon) => {
      if (!dolozone.has(k) && minAtrapy(atr) >= z.min!) {
        dolozone.add(k);
        lista.push(z);
      }
    };
    const widziane = graj(gov, atr, at(6, 12), () => {
      dolozZgon(0, zgon('Mieszkaniec', t, { f: undefined }));
      dolozZgon(1, zgon('Halina Kowalska', at(3, 14), { f: true }));
      dolozZgon(2, zgon('Marek Nowak', at(4, 11), { f: false }));
      dolozZgon(3, zgon('Mieszkaniec', at(4, 12), { f: undefined }));
      return lista;
    });
    expect(widziane.map((w) => w.d.name)).toEqual(['Halina Kowalska', 'Marek Nowak']);
    expect(gov.pogrzebN).toBe(4);
    expect(gov.deadN).toBe(4);
    // stan zapisany i wczytany nie powtarza kart
    const wczytany = loadGov(saveGov(gov));
    expect(wczytany.pogrzebN).toBe(4);
    const po = graj(wczytany, atr, at(8, 12), () => lista);
    expect(po).toHaveLength(0);
    // jeszcze jeden zgon: jedna karta więcej
    lista.push(zgon('Ewa Zielińska', minAtrapy(atr), { f: true }));
    const jeszcze = graj(wczytany, atr, minAtrapy(atr) + 1440, () => lista);
    expect(jeszcze.map((w) => w.d.name)).toEqual(['Ewa Zielińska']);
    expect(wczytany.pogrzebN).toBe(5);
  });

  it('dwa zgony naraz: dwie karty jedna po drugiej, nigdy dwie naraz', () => {
    const { gov, atr } = start(2, 9);
    const t = at(3, 10);
    const lista = [zgon('Halina Kowalska', t), zgon('Marek Nowak', t, { f: false })];
    const widziane = graj(gov, atr, t + 2 * 1440, () => (minAtrapy(atr) >= t ? lista : []));
    expect(widziane.map((w) => w.d.name)).toEqual(['Halina Kowalska', 'Marek Nowak']);
    expect(widziane[1].min).toBeGreaterThan(widziane[0].min);
    expect(gov.pogrzebN).toBe(2);
  });

  it('stary zapis bez licznika: zgony sprzed wczytania nie dostają pogrzebu, nowy tak', () => {
    const { gov, atr } = start(4, 9);
    const stare = [zgon('Halina Kowalska', at(2, 12)), zgon('Marek Nowak', at(2, 14), { f: false })];
    gov.deadN = 2;
    expect(gov.pogrzebN).toBeUndefined();
    const lista = [...stare];
    const nic = graj(gov, atr, at(3, 20), () => lista);
    expect(nic).toHaveLength(0);
    expect(gov.pogrzebN).toBeUndefined();
    lista.push(zgon('Ewa Zielińska', minAtrapy(atr)));
    const jedna = graj(gov, atr, minAtrapy(atr) + 1440, () => lista);
    expect(jedna.map((w) => w.d.name)).toEqual(['Ewa Zielińska']);
    expect(gov.pogrzebN).toBe(3);
  });

  it('zgon sprzed ponad dwóch dób nie dostaje karty, tylko wpis w kronice, że pogrzebu nie było (po polsku i angielsku)', () => {
    const { gov, atr } = start(1, 9);
    // zgon sprzed trzech dób, zarząd zobaczył go dopiero teraz
    const lista = [zgon('Halina Kowalska', at(3, 9) - 3 * 1440)];
    const w = graj(gov, atr, at(5, 9), () => lista);
    expect(w).toHaveLength(0);
    expect(gov.pogrzebN).toBe(1);
    const wpisy = gov.log.filter((l) => pl(l.txt).startsWith('Pogrzebu nie było'));
    expect(wpisy).toHaveLength(1);
    expect(pl(wpisy[0].txt)).toBe(
      'Pogrzebu nie było, bo nikt nie miał czasu. W kronice zostało tylko: Halina Kowalska.',
    );
    expect(wpisy[0].txt.en).toBe(
      'There was no funeral, because nobody had the time. All that is left in the log is: Halina Kowalska.',
    );
    expect(polskieSlowa(wpisy[0].txt.en, ['Halina Kowalska'])).toEqual([]);
    // zgon bez imienia sprzed trzech dób tylko przesuwa licznik, bez wpisu
    const g2 = start(1, 9);
    graj(g2.gov, g2.atr, at(5, 9), () => [zgon('Mieszkaniec', at(3, 9) - 3 * 1440, { f: undefined })]);
    expect(g2.gov.pogrzebN).toBe(1);
    expect(g2.gov.log.some((l) => pl(l.txt).startsWith('Pogrzebu nie było'))).toBe(false);
  });

  it('przy tempie 8× trzy zgony naraz: wszystkie trzy pogrzeby w ciągu doby gry, jeden po drugim', () => {
    const ZGINELI = ['Halina Kowalska', 'Marek Nowak', 'Ewa Zielińska'];
    // [dzień, godzina, minuta] zgonu: południe, wieczór, początek dnia, noc
    const pory: [number, number, number][] = [
      [3, 12, 0],
      [3, 21, 30],
      [4, 8, 30],
      [3, 23, 30],
    ];
    for (const [dzien, hour, minute] of pory)
      for (const seed of [1, 2, 3, 4]) {
        const { gov, atr } = start(seed, 9);
        const kiedy = at(dzien, hour, minute);
        const lista: Zgon[] = [];
        const opis = `${dzien}. dzień ${hour}:${String(minute).padStart(2, '0')}, ziarno ${seed}`;
        const w = graj(
          gov,
          atr,
          kiedy + 1440 + 60,
          () => {
            if (minAtrapy(atr) >= kiedy && !lista.length)
              lista.push(...ZGINELI.map((n) => zgon(n, kiedy, { f: n !== 'Marek Nowak' })));
            return lista;
          },
          mulberry(seed),
          8,
        );
        expect(
          w.map((x) => x.d.name),
          opis,
        ).toEqual(ZGINELI);
        for (const x of w) {
          expect(x.min - kiedy, `${opis}: ${x.d.name}`).toBeGreaterThanOrEqual(0);
          expect(x.min - kiedy, `${opis}: ${x.d.name}`).toBeLessThanOrEqual(1440);
          expect(['dzien', 'wieczor'], `${opis} o ${x.hour}`).toContain(poraOf(x.hour));
        }
        expect(gov.pogrzebN, opis).toBe(3);
        expect(
          gov.log.some((l) => pl(l.txt).startsWith('Pogrzebu nie było')),
          opis,
        ).toBe(false);
      }
  });

  it('przy tempie 8× jeden zgon sprzed ponad dwóch dób dostaje wpis w kronice, a dwa świeże karty', () => {
    const { gov, atr } = start(2, 9);
    const t = at(3, 12);
    const lista = [
      zgon('Halina Kowalska', t - 3 * 1440),
      zgon('Marek Nowak', t, { f: false }),
      zgon('Ewa Zielińska', t, { f: true }),
    ];
    const w = graj(gov, atr, t + 1440, () => (minAtrapy(atr) >= t ? lista : []), mulberry(2), 8);
    expect(w.map((x) => x.d.name)).toEqual(['Marek Nowak', 'Ewa Zielińska']);
    for (const x of w) expect(x.min - t).toBeLessThanOrEqual(1440);
    expect(gov.pogrzebN).toBe(3);
    const wpisy = gov.log.filter((l) => pl(l.txt).startsWith('Pogrzebu nie było'));
    expect(wpisy.map((l) => pl(l.txt))).toEqual([
      'Pogrzebu nie było, bo nikt nie miał czasu. W kronice zostało tylko: Halina Kowalska.',
    ]);
  });

  it('pierwszej nocy i przed ciepłą kuchnią karty nie ma; dzień po nocy tak', () => {
    const gov = newGov(3);
    const atr = new Atrapa(3);
    atr.supplies = 40;
    atr.woodSklad = 40;
    // zgon w dniu 1 o 18:00; karta najwcześniej po 8:00 drugiego dnia
    const kiedy = at(1, 18);
    atr.tick = tickAt(1, 17);
    const lista: Zgon[] = [];
    const w = graj(gov, atr, at(3, 10), () => {
      if (minAtrapy(atr) >= kiedy && !lista.length) lista.push(zgon('Halina Kowalska', kiedy));
      return lista;
    });
    expect(w).toHaveLength(1);
    expect(w[0].min).toBeGreaterThanOrEqual(at(2, 8));
    expect(w[0].min - kiedy).toBeLessThanOrEqual(1440);
  });

  it('w trybie zombie karta czeka, póki ciało leży i może wstać, i mówi, co z nim było', () => {
    const { gov, atr } = start(6, 9, 'zombie');
    const kiedy = at(3, 10);
    const lista: Zgon[] = [];
    const widziane = graj(gov, atr, at(3, 14), () => {
      if (minAtrapy(atr) >= kiedy && !lista.length) lista.push(zgon('Halina Kowalska', kiedy, { cialo: 'lezy' }));
      // ktoś dobija ciało po trzech godzinach (w grze zwłoki wstają po godzinie)
      if (lista.length && minAtrapy(atr) >= kiedy + 180) lista[0] = { ...lista[0], cialo: 'dobite' };
      return lista;
    });
    expect(widziane).toHaveLength(1);
    expect(widziane[0].min).toBeGreaterThanOrEqual(kiedy + 180);
    expect(widziane[0].d.cialo).toBe('dobite');
    // wstało: tekst o tym, że nikt nie dobił
    const druga = start(6, 9, 'zombie');
    const l2: Zgon[] = [];
    const w2 = graj(druga.gov, druga.atr, at(3, 14), () => {
      if (minAtrapy(druga.atr) >= kiedy && !l2.length) l2.push(zgon('Marek Nowak', kiedy, { f: false, cialo: 'brak' }));
      return l2;
    });
    expect(w2).toHaveLength(1);
    expect(w2[0].d.cialo).toBe('brak');
    expect(ev.text(makeHost(druga.gov, druga.atr.input(), emptyEffects()), w2[0].d).pl).toMatch(/Nikt go nie dobił/);
  });

  it('tryb zwykły: dane karty bez pola ciała, nawet gdy wejście je ma', () => {
    const { gov, atr } = start(8, 9);
    const w = graj(gov, atr, at(3, 22), () =>
      minAtrapy(atr) >= at(3, 10) ? [zgon('Halina Kowalska', at(3, 10))] : [],
    );
    expect(w).toHaveLength(1);
    expect('cialo' in w[0].d).toBe(false);
  });

  it('kronika: zgon zostaje w kronice z mourn jak dotąd, karta nie dubluje wpisu o śmierci', () => {
    const { gov, atr } = start(9, 9);
    const t = at(3, 10);
    const zmarla = atr.people[0];
    const lista = [zgon(zmarla.name, t, { id: zmarla.id, f: zmarla.f })];
    graj(gov, atr, t + 8 * 60, () => {
      if (minAtrapy(atr) >= t) atr.people = atr.people.filter((p) => p.id !== zmarla.id);
      return minAtrapy(atr) >= t ? lista : [];
    });
    const wpisy = gov.log.map((l) => pl(l.txt));
    expect(wpisy.filter((x) => /nie żyje/i.test(x))).toHaveLength(1);
    // karta: jeden wpis o przyjściu i jeden o decyzji
    expect(wpisy.filter((x) => x === 'Pogrzeb')).toHaveLength(1);
    expect(wpisy.filter((x) => x.startsWith('Pogrzeb: '))).toHaveLength(1);
  });

  it('wejście bez listy zgonów albo bez pola płci: bez kart i bez błędu', () => {
    const { gov, atr } = start(1, 9);
    expect(graj(gov, atr, at(3, 20), () => [])).toHaveLength(0);
    expect(gov.pogrzebN).toBeUndefined();
    const g2 = start(1, 9);
    const stare: Zgon[] = [{ id: 's1', name: 'Halina Kowalska', cause: 'rany', tick: g2.atr.tick }];
    expect(graj(g2.gov, g2.atr, at(3, 20), () => stare)).toHaveLength(0);
    expect(g2.gov.pogrzebN).toBe(1);
    expect(gameMin({ day: 3, hour: 9, minute: 0 })).toBe(at(3, 9));
  });
});

// ---------------------------------------------------------------- wpis o śmierci (mourn)

describe('wpis o śmierci w kronice: z imieniem dla zarządu i mieszkańca z osobą', () => {
  /** jeden krok zarządu z jednym nowym zgonem; zwraca wpisy o śmierci i zmianę zaufania i wkurzenia */
  function zgonWKronice(z: Zgon) {
    const gov = newGov(1);
    const atr = new Atrapa(1);
    atr.tick = tickAt(3, 10);
    const t0 = gov.trust;
    const a0 = gov.anger;
    govUpdate(gov, { ...atr.input(), dead: [z] });
    const wpisy = gov.log.filter((l) => /nie żyje/i.test(pl(l.txt)));
    return { wpisy, dTrust: gov.trust - t0, dAnger: gov.anger - a0 };
  }

  it('mieszkaniec z imieniem: „Imię nie żyje, od ran.” i „has died of wounds”, zaufanie −2 i wkurzenie +3 jak dotąd', () => {
    const r = zgonWKronice(zgon('Halina Kowalska', at(3, 10), { f: true }));
    expect(r.wpisy.map((l) => pl(l.txt))).toEqual(['Halina Kowalska nie żyje, od ran.']);
    expect(r.wpisy[0].txt.en).toBe('Halina Kowalska has died of wounds.');
    expect(polskieSlowa(r.wpisy[0].txt.en, ['Halina Kowalska'])).toEqual([]);
    expect([r.dTrust, r.dAnger]).toEqual([-2, 3]);
    // przyczyny po ugryzieniu i przy amputacji też z imieniem
    const g = zgonWKronice(zgon('Marek Nowak', at(3, 10), { f: false, cause: 'gorączka' }));
    expect(g.wpisy.map((l) => pl(l.txt))).toEqual(['Marek Nowak nie żyje, po ugryzieniu.']);
    expect(g.wpisy[0].txt.en).toBe('Marek Nowak has died of fever after being bitten.');
  });

  it('mieszkaniec bez osoby zostaje „jednym z mieszkańców”, też po angielsku; zaufanie −2 i wkurzenie +3', () => {
    const r = zgonWKronice(zgon('Mieszkaniec', at(3, 10), { f: undefined }));
    expect(r.wpisy.map((l) => pl(l.txt))).toEqual(['Nie żyje jeden z mieszkańców, od ran.']);
    expect(r.wpisy[0].txt.en).toBe('One of the residents has died of wounds.');
    expect([r.dTrust, r.dAnger]).toEqual([-2, 3]);
  });

  it('osoba z zarządu: z imieniem, zaufanie −5 i wkurzenie +8 bez zmian', () => {
    const r = zgonWKronice(zgon('Janina Wrona', at(3, 10), { id: 's9', f: true, cause: 'amputacja' }));
    expect(r.wpisy.map((l) => pl(l.txt))).toEqual(['Janina Wrona nie żyje, przy amputacji.']);
    expect(r.wpisy[0].txt.en).toBe('Janina Wrona has died during an amputation.');
    expect([r.dTrust, r.dAnger]).toEqual([-5, 8]);
  });
});

// ---------------------------------------------------------------- symulacja: GovInput.dead

describe('GovInput.dead z symulacji: płeć, minuta zgonu i los ciała', () => {
  const seed = 2051;
  let w: World;
  let mieszkancy: ReturnType<typeof opcjaMieszkancow>;

  beforeAll(async () => {
    const demo = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'demo/przymorze.json'), 'utf8')) as {
      geo: Parameters<typeof mapaMieszkancow>[0];
      street: string;
    };
    const dane = await wczytajDaneMieszkancow(demo.geo.c[0], demo.geo.c[1], plikowy);
    if (!dane) throw new Error('brak tabel mieszkańców dla przymorza');
    const geo = mapaMieszkancow(demo.geo, dane);
    w = buildWorld(geo, { seed, street: demo.street });
    const l = mieszkancyNowejGry(w, geo, dane, 4);
    if (!l) throw new Error('generator mieszkańców nie dał wyniku dla przymorza');
    mieszkancy = opcjaMieszkancow(l);
  }, 60_000);

  it('zmarły mieszkaniec z osobą i osoba z zarządu mają płeć z osoby; mieszkaniec bez osoby jej nie ma; tryb zwykły bez `cialo`', () => {
    const st = createSim(w, seed, { core: 4, mieszkancy });
    const sim = new Sim(w, st);
    const lok = st.pawns.filter((p) => p.kind === 'resident' && p.person >= 0);
    const zarzad = st.pawns.find((p) => p.kind === 'core')!;
    const ona = lok.find((p) => st.people[p.person].f)!;
    const on = lok.find((p) => !st.people[p.person].f)!;
    st.tick = 1234;
    sim.wound(ona, 1000);
    sim.wound(on, 1000);
    sim.wound(zarzad, 1000);
    const bez = st.pawns.find((p) => p.kind === 'resident' && p.person < 0);
    if (bez) sim.wound(bez, 1000);
    const dead = govInput(st, w, 0).dead!;
    expect(dead.map((d) => d.f)).toEqual([true, false, st.people[zarzad.person].f, ...(bez ? [undefined] : [])]);
    expect(dead[0]).toMatchObject({ id: '', name: st.people[ona.person].name });
    expect(dead[2]).toMatchObject({ id: st.people[zarzad.person].id });
    for (const d of dead) {
      expect(d.min).toBe(Math.floor(minutesAt(1234)));
      expect('cialo' in d).toBe(false);
    }
    if (bez) expect(dead[3]).toMatchObject({ id: '', name: 'Mieszkaniec' });
    // JSON: bez pól undefined
    expect(JSON.parse(JSON.stringify(dead))).toStrictEqual(dead);
  });

  it('w grze z zarządem zmarły mieszkaniec z imieniem dostaje pogrzeb w ciągu doby, raz, a nastroje trafiają do ludzi', () => {
    let ofiara = '';
    let kiedy = -1;
    let maNastroj = false;
    const r = playWithGov(w, 3, 'zawsze-warta', 4, 4, {
      mieszkancy,
      player: (sim) => {
        if (kiedy >= 0) {
          // „Pożegnaliśmy: Imię” u osób zarządu, póki trwa (nastrój na dobę)
          const why = `Pożegnaliśmy: ${ofiara.split(' ')[0]}`;
          maNastroj ||= sim.st.pawns.some((p) => p.kind === 'core' && p.moods.some((m) => m.why === why));
          return;
        }
        // dzień 2, 11:00 gry: pada mieszkaniec z imieniem
        if (minutesAt(sim.st.tick) < at(2, 11)) return;
        const p = sim.st.pawns.find((q) => q.kind === 'resident' && q.person >= 0 && !q.away)!;
        ofiara = sim.st.people[p.person].name;
        kiedy = Math.floor(minutesAt(sim.st.tick));
        sim.wound(p, 1000);
      },
    });
    expect(kiedy).toBeGreaterThan(0);
    const karty = r.decisions.filter((d) => d.kind === 'wydarzenie' && d.text.startsWith('Pogrzeb:'));
    expect(karty).toHaveLength(1);
    expect(karty[0].text).toBe('Pogrzeb: Pochować pod trzepakiem');
    expect(r.gov.pogrzebN).toBe(1);
    expect(r.gov.log.some((l) => pl(l.txt).includes(`${ofiara} leży teraz pod trzepakiem`))).toBe(true);
    // w ciągu doby od zgonu (czas przy ekranie karty: 1× to 20 ticków na sekundę)
    const min = Math.floor(minutesAt(karty[0].s * TPS));
    expect(min - kiedy).toBeLessThanOrEqual(1440);
    expect(['dzien', 'wieczor']).toContain(poraOf(Math.floor(min / 60) % 24));
    expect(maNastroj).toBe(true);
  }, 120_000);

  describe('tryb zombie: los ciała z prawdziwych zwłok', () => {
    const blok = mockBlock();
    const zombie = () => {
      const st = createSim(blok, 3, { core: 3, mode: 'zombie' });
      st.tick = Math.round(((2 - 1) * 24 + 10 - 15) * TICKS_PER_HOUR);
      return { st, sim: new Sim(blok, st) };
    };
    const runTo = (sim: Sim, tick: number) => {
      while (sim.st.tick < tick) sim.step();
    };

    it('leży (może wstać), dobite, wstało; zmarły na wyprawie nie zostawia ciała', () => {
      const { st, sim } = zombie();
      const [p, q, z] = st.pawns.filter((x) => x.kind === 'core');
      // bez broni nikt nie dobija zwłok odruchowo: dobicie tylko z polecenia
      for (const x of [p, q, z]) x.weapon = null;
      infect(st, p, false);
      runTo(sim, st.tick + FEVER_TICKS + 1);
      expect(st.pawns.includes(p)).toBe(false);
      const dead = () => govInput(st, blok, 0).dead!;
      expect(dead()).toHaveLength(1);
      expect(dead()[0]).toMatchObject({ id: st.people[p.person].id, f: st.people[p.person].f, cialo: 'lezy' });
      // ktoś dobija: ciało leży, ale już nie wstanie
      const body = st.things.find((t) => t.kind === 'zwloki')!;
      sim.push({ t: 'finish', ids: [q.id], thing: body.id });
      runTo(sim, st.tick + 700);
      expect(body.fuel).toBe(0);
      expect(dead()[0].cialo).toBe('dobite');

      // drugie ciało: nikt nie dobija, po godzinie wstaje
      infect(st, q, false);
      runTo(sim, st.tick + FEVER_TICKS + 1);
      const drugie = dead().find((d) => d.id === st.people[q.person].id)!;
      expect(drugie.cialo).toBe('lezy');
      runTo(sim, st.tick + RISE_TICKS + 5);
      expect(dead().find((d) => d.id === st.people[q.person].id)!.cialo).toBe('brak');
      // wcześniejsze zostaje dobite
      expect(dead()[0].cialo).toBe('dobite');

      // trzecia osoba na wyprawie: umiera poza mapą, ciała nie ma
      z.away = true;
      sim.wound(z, 1000);
      expect(dead().find((d) => d.id === st.people[z.person].id)).toMatchObject({ cialo: 'brak' });
    });
  });
});
