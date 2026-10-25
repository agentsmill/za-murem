/* Druga gra w przeglądarce (src/ui/osada.ts), etap 2 osady AI (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 3):
   osada powstaje o 6:00 drugiego dnia (`TICK_STARTU_OSADY`), od razu liczy swoją grę od pierwszej minuty do tej chwili i potem idzie
   krok w krok z naszą. Gospodarz testu (`krokGospodarza`) robi to, co `krokSymulacji` w src/main.ts: krok naszej gry, a zaraz po
   nim `osada.krok(nasz tick)`. Nasza gra to `GraAi` prowadzona silnikiem podstawowym (ten sam przebieg co `playWithGov`, pilnuje
   tego ai-rownowaznosc.test.ts) na Przymorzu z mieszkańcami z generatora, osada to kwadrat wybrany przez `wybierzOsade` (zadanie 2)
   z danych dema i tabel mieszkańców z public/. Sprawdzane: kiedy osada powstaje i że od tej chwili ticki są równe; że przebieg nie
   zależy od chwili, w której przyszły dane (byle przed startem), a bez danych do startu osady nie ma (`brak`, powód `dane`);
   zapis i wczytanie (przed startem, w środku gry, po odwołaniu i po upadku osady) dają ten sam przebieg obu gier co gra bez
   przerwy; bez flagi zapis nie ma pola `osada`, a nasza gra idzie tak samo z osadą i bez niej (etap 2 nie łączy obu gier); tryb
   zombie nie dostaje osady; błąd wyboru kwadratu daje `brak` z powodem `blad`
   (jedno ostrzeżenie, bez drugiej próby); odwołanie zarządu osady daje nowy zarząd (rozstrzygnięcie kontrolera 1, src/ai/odwolanie.ts),
   a pustka i exodus kończą osadę (stoi, nie rzuca); pobieranie kandydatów po kolei w kolejności z ziarna z jednym ostrzeżeniem.
   Szczegóły zapisu (kształt pola, flaga z adresu) są w osada-zapis.test.ts, jego rozmiar po 30 dniach w osada-zapis-rozmiar.test.ts,
   pobranie geo kwadratu z kafelków w osada-dane.test.ts, przygotowanie osady na zapas przed startem (`przygotuj`, `przygotujCiezkie`,
   nadrabianie w kawałkach) w osada-przygotowanie.test.ts (tu jest jego próba z naszą grą: skróty obu gier po 5 dobach), a zaślepka
   osady bez kodu w osada-brak.test.ts.

   Skrót bota `npm run bot` po 3 dobach (701b05aa) wychodzi z jego scenariusza „pierwsze trzy minuty”, który gra na świecie
   zmienionym wcześniejszą, 45-dniową grą tego samego bota (gra zmienia siatkę swojego świata w miejscu), więc w teście nie da się go
   odtworzyć bez powtórzenia całego bota; sprawdza go bramka zadania (`npm run bot`). Tu jest własność, z której ten skrót wynika:
   bez osady gospodarz gra dokładnie tak jak sama pętla gry, a zapis nie ma pola `osada`. */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type GraAi,
  grajDo,
  krokGry,
  nowaGraAi,
  type OpcjeGryAi,
  skrotGry,
  wczytajGre,
  type ZapisGryAi,
  zapiszGre,
} from '../../src/ai/gra.ts';
import { kandydaciOsady, swiatZGeo, wybierzOsade, ziarnoOsady } from '../../src/ai/kwadrat.ts';
import { START_WKURZENIA, START_ZAUFANIA } from '../../src/ai/odwolanie.ts';
import { silnik, silnikPodstawowy } from '../../src/ai/silnik.ts';
import { ustawJezyk } from '../../src/core/jezyk.ts';
import { hashString } from '../../src/core/rng.ts';
import { dayOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../../src/sim/clock.ts';
import { tickAt } from '../../src/sim/handlarz.ts';
import {
  ludnoscSpisu2021,
  mapaMieszkancow,
  mieszkancyNowejGry,
  mieszkancyZapisu,
  opcjaMieszkancow,
} from '../../src/sim/osiedle.ts';
import { daneKartyOsady, kartaOsadyHtml } from '../../src/ui/kartaOsady.ts';
import {
  nowaOsadaGry,
  type OsadaGry,
  osadaZZapisu,
  pobierzKandydatow,
  type StanOsady,
  TICK_STARTU_OSADY,
} from '../../src/ui/osada.ts';
import { poleOsady, worldKey } from '../../src/ui/zapis.ts';
import type { Geo } from '../../src/world/geo.ts';
import { kluczKwadratu, type Uklad, ukladZGeo } from '../../src/world/kwadraty.ts';
import { buildWorld, type World } from '../../src/world/world.ts';
import { daneDema, wczytajDemo } from '../../tools/osada-kwadraty.ts';
import { okolicaZGeo } from './miasto-play.ts';

// ---------------------------------------------------------------------------------------------------------------------
// Dane i gospodarz
// ---------------------------------------------------------------------------------------------------------------------

type Demo = ReturnType<typeof wczytajDemo>;
type Dane = Awaited<ReturnType<typeof daneDema>>;

let demo: Demo;
let dane: Dane;
let uklad: Uklad;
/** ziarno naszej gry jak w przeglądarce dla dema: z adresu */
let SEED = 0;

beforeAll(async () => {
  demo = wczytajDemo('przymorze');
  dane = await daneDema('przymorze');
  uklad = ukladZGeo(demo.geo);
  SEED = Number.parseInt(hashString(demo.addr), 16) || 2051;
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/** opcje naszej gry jak w przeglądarce: zarząd i lokatorzy z generatora, obcy, okolica miasta, ludność 2021, łańcuchy kart */
function opcjeNaszej(l: ReturnType<typeof mieszkancyNowejGry>): OpcjeGryAi {
  const geo = mapaMieszkancow(demo.geo, dane);
  const ludnosc = ludnoscSpisu2021(geo, dane);
  return {
    core: 4,
    obcy: true,
    ...(l ? { mieszkancy: opcjaMieszkancow(l) } : {}),
    okolica: okolicaZGeo(demo.geo),
    ...(ludnosc !== undefined ? { ludnosc2021: ludnosc } : {}),
    tempoPrzegladarki: true,
    lancuchy: true,
  };
}

/** świeży świat naszej gry (gra zmienia swój świat w miejscu, więc każda dostaje własny) z mieszkańcami z generatora */
function swiatNaszej(): { geo: Geo; world: World; l: ReturnType<typeof mieszkancyNowejGry> } {
  const geo = mapaMieszkancow(demo.geo, dane);
  const world = buildWorld(geo, { seed: SEED, street: demo.street });
  return { geo, world, l: mieszkancyNowejGry(world, geo, dane, 4) };
}

function nowaNasza(): GraAi {
  const { world, l } = swiatNaszej();
  return nowaGraAi(world, SEED, opcjeNaszej(l));
}

/** nasza gra z zapisu na świeżym świecie, tak jak `enter()` w main.ts: stany mieszkań z zapisu przed symulacją */
function wczytajNasza(zapis: ZapisGryAi): GraAi {
  const geo = mapaMieszkancow(demo.geo, dane);
  const world = buildWorld(geo, { seed: SEED, street: demo.street });
  mieszkancyZapisu(world, geo, dane, zapis.sim);
  return wczytajGre(world, structuredClone(zapis));
}

/** Obie gry razem: nasza i (albo nie) osada. */
interface Gospodarz {
  nasza: GraAi;
  osada: OsadaGry | null;
}

/** jeden krok gospodarza, jak `krokSymulacji` w main.ts: krok naszej gry, a zaraz po nim krok osady z naszym tickiem */
function krokGospodarza(h: Gospodarz): void {
  krokGry(h.nasza, silnikPodstawowy);
  h.osada?.krok(h.nasza.sim.st.tick);
}

/** gospodarz gra do ticku `doTicku` albo do końca naszej gry */
function graj(h: Gospodarz, doTicku: number): void {
  while (h.nasza.sim.st.tick < doTicku && !h.nasza.gov.over) krokGospodarza(h);
}

function nowyGospodarz(zOsada = true): Gospodarz {
  return { nasza: nowaNasza(), osada: zOsada ? nowaOsadaGry(SEED, dane, uklad) : null };
}

/** Skróty obu gier (osada: null, gdy jej nie ma). */
interface Skroty {
  nasza: string;
  osada: string | null;
}
const skroty = (h: Gospodarz): Skroty => ({
  nasza: skrotGry(h.nasza),
  osada: h.osada?.gra ? skrotGry(h.osada.gra) : null,
});

/** Zapis obu gier tak, jak idzie do localStorage: przez JSON. */
interface ZapisPary {
  nasza: ZapisGryAi;
  osada: StanOsady | undefined;
}
const zapiszPare = (h: Gospodarz): ZapisPary =>
  JSON.parse(JSON.stringify({ nasza: zapiszGre(h.nasza), osada: h.osada?.zapisz() }));

/** Gospodarz z zapisu pary; osada w stanie „czeka” dostaje dane od nowa (gospodarz w main.ts pobiera je po wczytaniu). */
function wczytajPare(z: ZapisPary, doczytajDane = true): Gospodarz {
  const osada = z.osada ? osadaZZapisu(z.osada, SEED, dane, uklad) : null;
  if (osada?.stan === 'czeka' && doczytajDane) osada.dane(demo.kwadraty);
  return { nasza: wczytajNasza(z.nasza), osada };
}

/** błędy decydentów obu gier: `krokGry` je łapie i gra idzie dalej, więc test całej gry sprawdza je sam */
function bezBledow(h: Gospodarz): void {
  expect(h.nasza.bledy).toEqual([]);
  expect(h.osada?.gra?.bledy ?? []).toEqual([]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Wzorzec: osada z danymi w ticku 100, 8 dób; punkty kontrolne do testów zapisu
// ---------------------------------------------------------------------------------------------------------------------

interface Wzorzec {
  hash5: Skroty;
  hash8: Skroty;
  /** zapis o 5:00 drugiego dnia, godzinę przed startem osady */
  czeka5: ZapisPary;
  /** zapis w czwartym dniu, o 12:00 */
  dzien4: ZapisPary;
  /** jak wygląda osada po 8 dobach */
  podglad8: ReturnType<OsadaGry['podglad']>;
}
let wzorzec: Wzorzec;
/** gra naszej bez osady do tej samej chwili (pięć dób): skrót naszej gry nie może zależeć od osady */
let nasza5BezOsady: string;

beforeAll(async () => {
  const h = nowyGospodarz();
  graj(h, 100);
  h.osada!.dane(demo.kwadraty);
  graj(h, tickAt(2, 5));
  const czeka5 = zapiszPare(h);
  graj(h, tickAt(4, 12));
  const dzien4 = zapiszPare(h);
  graj(h, 5 * TICKS_PER_DAY);
  const hash5 = skroty(h);
  graj(h, 8 * TICKS_PER_DAY);
  expect(h.nasza.gov.over, 'nasza gra z silnikiem podstawowym ma dożyć 8. dnia').toBeNull();
  bezBledow(h);
  wzorzec = { hash5, hash8: skroty(h), czeka5, dzien4, podglad8: h.osada!.podglad() };
  // nasza gra sama, bez osady
  const sama = nowaNasza();
  grajDo(sama, silnikPodstawowy, 5 * TICKS_PER_DAY);
  nasza5BezOsady = skrotGry(sama);
}, 900_000);

/** osada ze startem w TICK_STARTU_OSADY i danymi, bez naszej gry (osada wie o nas tylko tick) */
function osadaPoStarcieBezNaszej(): OsadaGry {
  const osada = nowaOsadaGry(SEED, dane, uklad);
  osada.dane(demo.kwadraty);
  osada.krok(TICK_STARTU_OSADY);
  expect(osada.stan).toBe('jest');
  return osada;
}

// ---------------------------------------------------------------------------------------------------------------------
// Start i krok w krok
// ---------------------------------------------------------------------------------------------------------------------

describe('start osady i krok w krok', () => {
  it('TICK_STARTU_OSADY to 6:00 drugiego dnia', () => {
    expect(TICK_STARTU_OSADY).toBe(tickAt(2, 6));
    expect(dayOf(TICK_STARTU_OSADY)).toBe(2);
    expect(TICK_STARTU_OSADY).toBe(12000);
  });

  it('osada powstaje w ticku TICK_STARTU_OSADY i od tej chwili gra.sim.st.tick równa się naszemu tickowi (krok w krok)', () => {
    const h = nowyGospodarz();
    const osada = h.osada!;
    osada.dane(demo.kwadraty);
    // przed startem nic: czeka, bez gry i świata, zapis „czeka”
    graj(h, TICK_STARTU_OSADY - 1);
    expect(h.nasza.sim.st.tick).toBe(TICK_STARTU_OSADY - 1);
    expect(osada.stan).toBe('czeka');
    expect(osada.gra).toBeNull();
    expect(osada.swiat).toBeNull();
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'czeka' });
    // krok do ticku startu: osada jest, nadrobiła całą swoją grę od ticku 0
    krokGospodarza(h);
    expect(h.nasza.sim.st.tick).toBe(TICK_STARTU_OSADY);
    expect(osada.stan).toBe('jest');
    expect(osada.gra!.sim.st.tick).toBe(TICK_STARTU_OSADY);
    expect(osada.swiat).not.toBeNull();
    // od tej chwili w każdym kroku ticki są równe (200 ticków wystarcza na kilka sekund zarządu osady)
    for (let k = 0; k < 200; k++) {
      krokGospodarza(h);
      if (osada.gra!.sim.st.tick !== h.nasza.sim.st.tick)
        throw new Error(`ticki się rozjechały: osada ${osada.gra!.sim.st.tick}, nasza ${h.nasza.sim.st.tick}`);
    }
    expect(osada.gra!.sim.st.tick).toBe(TICK_STARTU_OSADY + 200);
    bezBledow(h);
    // kwadrat to jeden z ośmiu wokół domu, wybrany tak, jak wybiera go zadanie 2 dla tego ziarna i tych danych
    const oczekiwany = wybierzOsade(SEED, demo.kwadraty, dane, uklad)!;
    expect(osada.swiat!.klucz).toBe(oczekiwany.klucz);
    expect(osada.swiat!.nazwa).toEqual(oczekiwany.nazwa);
    expect(osada.gra!.seed).toBe(ziarnoOsady(SEED, oczekiwany.sx, oczekiwany.sy));
  });

  it('osada nie liczy się przed startem: zero kroków do ticku startu, nawet gdy dane już są', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane(demo.kwadraty);
    for (const t of [1, 100, 5000, TICK_STARTU_OSADY - 1]) {
      osada.krok(t);
      expect(osada.stan).toBe('czeka');
      expect(osada.gra).toBeNull();
    }
  });

  it('nadrabianie: osada ma po starcie gry od pierwszej minuty, jakby grała sama od ticku 0 (skrót równy grze zagranej wprost)', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane(demo.kwadraty);
    osada.krok(TICK_STARTU_OSADY);
    const g = osada.gra!;
    const swiat = wybierzOsade(SEED, demo.kwadraty, dane, uklad)!;
    const wprost = nowaGraAi(swiat.world, ziarnoOsady(SEED, swiat.sx, swiat.sy), swiat.opcje);
    grajDo(wprost, silnik, TICK_STARTU_OSADY);
    expect(g.sim.st.tick).toBe(TICK_STARTU_OSADY);
    expect(skrotGry(g)).toBe(skrotGry(wprost));
  });

  it('podgląd po starcie: stan, klucz, tick równy naszemu, skrót gry osady, zero błędów i zawieszonych okien', () => {
    const p = wzorzec.podglad8;
    expect(p).not.toBeNull();
    expect(p.stan).toBe('jest');
    expect(p.klucz).toMatch(/^-?\d+,-?\d+$/);
    expect(p.tick).toBe(8 * TICKS_PER_DAY);
    expect(p.skrot).toBe(wzorzec.hash8.osada);
    expect(p.odkryta).toBe(false);
    expect(p.odwolania).toBe(0);
    expect(p.upadla).toBeUndefined();
    expect(p.bledowRazem).toBe(0);
    expect(p.zawieszonychRazem).toBe(0);
  });

  it('podgląd niesie liczniki błędów decydenta i zawieszonych okien gry osady (ustawione wprost, by je odróżnić)', () => {
    const osada = osadaPoStarcieBezNaszej();
    osada.gra!.bledowRazem = 3;
    osada.gra!.zawieszonychRazem = 5;
    expect(osada.podglad()).toMatchObject({ stan: 'jest', bledowRazem: 3, zawieszonychRazem: 5 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Dane: kiedy przyszły i czy kompletne
// ---------------------------------------------------------------------------------------------------------------------

describe('dane kandydatów', () => {
  it('dane podane w ticku 100 i w ticku TICK_STARTU_OSADY - 1 dają ten sam skrót osady po 5 dniach', {
    timeout: 300_000,
  }, () => {
    const h = nowyGospodarz();
    graj(h, TICK_STARTU_OSADY - 1);
    expect(h.osada!.stan).toBe('czeka');
    h.osada!.dane(demo.kwadraty);
    graj(h, 5 * TICKS_PER_DAY);
    bezBledow(h);
    const s = skroty(h);
    expect(s.osada).not.toBeNull();
    expect(s.osada).toBe(wzorzec.hash5.osada);
    // nasza gra też ta sama (osada niczego w niej nie zmienia)
    expect(s.nasza).toBe(wzorzec.hash5.nasza);
  });

  it('przygotowanie na zapas co sekundę gry (jedno przygotuj() na klatkę): osada czeka do ticku startu, a skróty obu gier po 5 dobach są równe wzorcowi', {
    timeout: 300_000,
  }, () => {
    const h = nowyGospodarz();
    const osada = h.osada!;
    graj(h, 100);
    osada.dane(demo.kwadraty);
    osada.przygotujCiezkie();
    let gotowaOd = -1;
    while (h.nasza.sim.st.tick < TICK_STARTU_OSADY - 1) {
      krokGospodarza(h);
      if (h.nasza.sim.st.tick % TICKS_PER_SECOND === 0) osada.przygotuj();
      if (gotowaOd < 0 && osada.podglad().przygotowanie?.faza === 'gotowa') gotowaOd = h.nasza.sim.st.tick;
      expect(osada.stan).toBe('czeka');
    }
    // 120 kawałków po jednym na sekundę gry: gotowa długo przed startem, a na zewnątrz dalej czeka i zapisuje się jako czeka
    expect(gotowaOd).toBeGreaterThan(0);
    expect(gotowaOd).toBeLessThan(TICK_STARTU_OSADY - 5 * TICKS_PER_HOUR);
    expect(osada.podglad().przygotowanie).toEqual({ faza: 'gotowa', tick: TICK_STARTU_OSADY });
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'czeka' });
    expect(osada.gra).toBeNull();
    krokGospodarza(h);
    expect(osada.stan).toBe('jest');
    expect(osada.gra!.sim.st.tick).toBe(h.nasza.sim.st.tick);
    graj(h, 5 * TICKS_PER_DAY);
    bezBledow(h);
    expect(skroty(h)).toEqual(wzorzec.hash5);
  });

  it('bez danych do ticku startu: zapisz() daje { stan: brak, powod: dane }, dane podane później nic nie zmieniają', () => {
    const h = nowyGospodarz();
    graj(h, TICK_STARTU_OSADY - 1);
    expect(h.osada!.stan).toBe('czeka');
    krokGospodarza(h);
    expect(h.osada!.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
    expect(h.osada!.gra).toBeNull();
    h.osada!.dane(demo.kwadraty);
    graj(h, TICK_STARTU_OSADY + 400);
    expect(h.osada!.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
    expect(h.osada!.gra).toBeNull();
    expect(h.osada!.swiat).toBeNull();
  });

  it('dane bez żadnego kandydata (wszystkie pobrania padły) to brak z powodem dane, nie reguły', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane({});
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
  });

  it('dane niekompletne, ale z kandydatami: wybór z tych, które się pobrały', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    // zostaje tylko ten kwadrat, który wybrałaby pełna lista
    const pelny = wybierzOsade(SEED, demo.kwadraty, dane, uklad)!;
    const czesc: Record<string, Geo> = { [pelny.klucz]: demo.kwadraty[pelny.klucz] };
    osada.dane(czesc);
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.stan).toBe('jest');
    expect(osada.swiat!.klucz).toBe(pelny.klucz);
  });

  it('dane po starcie osady nie mają skutku (ani na świat, ani na stan)', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane(demo.kwadraty);
    osada.krok(TICK_STARTU_OSADY);
    const klucz = osada.swiat!.klucz;
    const przed = osada.zapisz();
    osada.dane({});
    osada.dane({ [kluczKwadratu(5, 5)]: demo.geo });
    expect(osada.zapisz()).toEqual(przed);
    expect(osada.swiat!.klucz).toBe(klucz);
  });

  it('żaden kandydat nie spełnia reguły miejsca (Zielonki): brak z powodem regula', async () => {
    const zielonki = wczytajDemo('zielonki');
    const daneZ = await daneDema('zielonki');
    const osada = nowaOsadaGry(11, daneZ, ukladZGeo(zielonki.geo));
    osada.dane(zielonki.kwadraty);
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    expect(osada.gra).toBeNull();
  });

  it('bez tabel mieszkańców reguła nie jest spełniona (regula)', () => {
    const osada = nowaOsadaGry(SEED, null, uklad);
    osada.dane(demo.kwadraty);
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
  });

  it('bez tabel mieszkańców osada ma regula także bez żadnych danych kandydatów: gospodarz ośmiu sąsiadów wtedy nie pobiera', () => {
    // src/main.ts pomija pobranie sąsiadów, gdy tabel nie ma (wybór kwadratu i tak zwróciłby null od razu), więc `dane()` nie przychodzi
    const osada = nowaOsadaGry(SEED, null, uklad);
    osada.przygotuj();
    osada.przygotujCiezkie();
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'czeka' });
    osada.krok(TICK_STARTU_OSADY - 1);
    expect(osada.stan).toBe('czeka');
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    expect(osada.gra).toBeNull();
    // wczytany zapis „czeka” bez tabel: to samo, a pusty rekord danych niczego nie zmienia (brak danych to nie powód osady)
    const zZapisu = osadaZZapisu({ v: 1, stan: 'czeka' }, SEED, null, uklad);
    zZapisu.dane({});
    zZapisu.krok(TICK_STARTU_OSADY);
    expect(zZapisu.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
  });

  it('z tabelami, ale bez danych kandydatów, osada dalej ma dane (to inny powód niż brak tabel)', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
  });

  it('błąd wyboru kwadratu (uszkodzone geo): brak z powodem blad, jedno ostrzeżenie w konsoli i żadnej drugiej próby', () => {
    const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const zepsute: Record<string, Geo> = {};
    for (const [k, g] of Object.entries(demo.kwadraty)) {
      const kopia = structuredClone(g);
      for (const b of kopia.b) (b as unknown as { p: unknown }).p = undefined;
      zepsute[k] = kopia;
    }
    const osada = nowaOsadaGry(SEED, dane, uklad);
    osada.dane(zepsute);
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
    expect(osada.gra).toBeNull();
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
    // dalsze kroki niczego nie próbują od nowa: stan i liczba ostrzeżeń bez zmian
    for (let t = TICK_STARTU_OSADY + 1; t < TICK_STARTU_OSADY + 50; t++) osada.krok(t);
    osada.dane(demo.kwadraty);
    osada.krok(TICK_STARTU_OSADY + 50);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
  });

  it('podgląd braku niesie powód (dane, regula, blad) i nie ma pól gry', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad);
    expect(osada.podglad()).toEqual({ stan: 'czeka' });
    osada.krok(TICK_STARTU_OSADY);
    expect(osada.podglad()).toEqual({ stan: 'brak', powod: 'dane' });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Zapis i wczytanie
// ---------------------------------------------------------------------------------------------------------------------

describe('zapis i wczytanie', () => {
  it('zapis z stan: czeka, zrobiony o 5:00 drugiego dnia i wczytany: osada startuje o 6:00 tak samo jak bez przeładowania', {
    timeout: 300_000,
  }, () => {
    expect(wzorzec.czeka5.osada).toEqual({ v: 1, stan: 'czeka' });
    const h = wczytajPare(wzorzec.czeka5);
    expect(h.nasza.sim.st.tick).toBe(tickAt(2, 5));
    expect(h.osada!.stan).toBe('czeka');
    // godzina gry do startu: osada czeka, potem powstaje
    graj(h, TICK_STARTU_OSADY - 1);
    expect(h.osada!.stan).toBe('czeka');
    krokGospodarza(h);
    expect(h.osada!.stan).toBe('jest');
    expect(h.osada!.gra!.sim.st.tick).toBe(h.nasza.sim.st.tick);
    graj(h, 5 * TICKS_PER_DAY);
    bezBledow(h);
    expect(skroty(h)).toEqual(wzorzec.hash5);
  });

  it('zapis z czeka wczytany bez danych do startu: brak z powodem dane (dane po wczytaniu to sprawa gospodarza)', () => {
    const h = wczytajPare(wzorzec.czeka5, false);
    graj(h, TICK_STARTU_OSADY + 10);
    expect(h.osada!.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'dane' });
  });

  it('zapis i wczytanie w 4. dniu: skróty obu gier po 8 dniach równe przebiegowi bez przerwy', {
    timeout: 300_000,
  }, () => {
    expect(wzorzec.dzien4.osada).toMatchObject({ v: 1, stan: 'jest', odwolania: 0 });
    const h = wczytajPare(wzorzec.dzien4);
    expect(h.osada!.stan).toBe('jest');
    expect(h.osada!.gra!.sim.st.tick).toBe(h.nasza.sim.st.tick);
    expect(h.nasza.sim.st.tick).toBe(tickAt(4, 12));
    graj(h, 8 * TICKS_PER_DAY);
    bezBledow(h);
    expect(skroty(h)).toEqual(wzorzec.hash8);
    expect(h.osada!.gra!.sim.st.tick).toBe(h.nasza.sim.st.tick);
  });

  it('zapis osady „jest” trzyma geo kwadratu, odcisk świata i grę; wczytana osada ma ten sam świat, nazwę i kwadrat', () => {
    const z = wzorzec.dzien4.osada!;
    if (z.stan !== 'jest') throw new Error('osada powinna być');
    expect(z.klucz).toBe(wzorzec.podglad8.klucz);
    expect(z.geo.b.length).toBeGreaterThan(0);
    expect(typeof z.world).toBe('string');
    expect(z.gra.v).toBe(1);
    expect(z.gra.opts.odpowiedzNaNieznane).toBe(true);
    expect(z.gra.opts.lancuchy).toBe(false);
    const wczytana = osadaZZapisu(z, SEED, dane, uklad);
    const swiat = wybierzOsade(SEED, demo.kwadraty, dane, uklad)!;
    expect(wczytana.swiat!.klucz).toBe(swiat.klucz);
    expect(wczytana.swiat!.nazwa).toEqual(swiat.nazwa);
    expect(wczytana.swiat!.nazwaZ).toEqual(swiat.nazwaZ);
    expect(wczytana.swiat!.kierunek).toEqual(swiat.kierunek);
    expect(wczytana.swiat!.jedzenie).toBe(swiat.jedzenie);
    expect(wczytana.swiat!.sx).toBe(swiat.sx);
    expect(wczytana.swiat!.sy).toBe(swiat.sy);
    expect(worldKey(wczytana.swiat!.world)).toBe(worldKey(swiat.world));
    // zapis wczytanej osady jest tym samym zapisem (nic nie ginie w obie strony)
    expect(wczytana.zapisz()).toEqual(z);
  });

  it('wczytana osada ma w świecie stany mieszkań, meble i śmieci z generatora, jak świat z wyboru, a nie sam `swiatZGeo`', () => {
    const z = wzorzec.dzien4.osada!;
    if (z.stan !== 'jest') throw new Error('osada powinna być');
    const wczytana = osadaZZapisu(z, SEED, dane, uklad);
    const swiat = wybierzOsade(SEED, demo.kwadraty, dane, uklad)!;
    const smieci = (w: World) => JSON.stringify(w.props.filter((p) => p.kind === 'smieci'));
    const w = wczytana.swiat!.world;
    expect(JSON.stringify(w.apts)).toBe(JSON.stringify(swiat.world.apts));
    expect(JSON.stringify(w.interior.furniture)).toBe(JSON.stringify(swiat.world.interior.furniture));
    expect(smieci(w)).toBe(smieci(swiat.world));
    // zgodne ze stanami mieszkań siedziby w zapisanej symulacji
    const mieszkania = w.apts.filter((a) => a.bid === w.hq);
    expect(mieszkania.length).toBeGreaterThan(0);
    for (const a of mieszkania) {
      const gra = z.gra.sim.apts.find((q) => q.apt === a.apt);
      expect(gra?.state, `mieszkanie ${a.apt}`).toBe(a.state);
    }
    // kontrola, że to ma znaczenie: sam świat z zapisanego geo ma inne stany mieszkań i meble niż świat z wyboru
    const sam = swiatZGeo(z.geo, ziarnoOsady(SEED, swiat.sx, swiat.sy), dane).world;
    expect(JSON.stringify(sam.apts)).not.toBe(JSON.stringify(swiat.world.apts));
  });

  it('odcisk świata, który się nie zgadza (zmiana generatora), to brak z powodem blad i jedno ostrzeżenie, bez wyjątku', () => {
    const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const z = structuredClone(wzorzec.dzien4.osada!);
    if (z.stan !== 'jest') throw new Error('osada powinna być');
    z.world = 'inny-odcisk';
    const osada = osadaZZapisu(z, SEED, dane, uklad);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
    expect(osada.gra).toBeNull();
    osada.krok(wzorzec.dzien4.nasza.sim.tick + 1);
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
  });

  it('uszkodzony zapis gry osady to brak z powodem blad, a nie wyjątek przy wczytywaniu strony', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const z = structuredClone(wzorzec.dzien4.osada!);
    if (z.stan !== 'jest') throw new Error('osada powinna być');
    (z.gra.sim as unknown as { pawns: unknown }).pawns = null;
    const osada = osadaZZapisu(z, SEED, dane, uklad);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
  });

  it('zapis stanu brak wraca jako brak z tym samym powodem i nie robi nic', () => {
    for (const powod of ['dane', 'regula', 'blad'] as const) {
      const osada = osadaZZapisu({ v: 1, stan: 'brak', powod }, SEED, dane, uklad);
      osada.dane(demo.kwadraty);
      osada.krok(TICK_STARTU_OSADY + 5);
      expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod });
    }
  });

  it('osada odkryta i jej kontakt przeżywają zapis; odkryj poza stanem „jest” nic nie robi', () => {
    const h = wczytajPare(wzorzec.dzien4);
    const osada = h.osada!;
    expect(osada.odkryta).toBe(false);
    expect(osada.kontakt).toBeUndefined();
    osada.odkryj({ dzien: 5, ludnosc: 14, budowle: 2 });
    expect(osada.odkryta).toBe(true);
    expect(osada.kontakt).toEqual({ dzien: 5, ludnosc: 14, budowle: 2 });
    const z = osada.zapisz();
    expect(z).toMatchObject({ stan: 'jest', odkryta: true, kontakt: { dzien: 5, ludnosc: 14, budowle: 2 } });
    const wczytana = osadaZZapisu(JSON.parse(JSON.stringify(z)), SEED, dane, uklad);
    expect(wczytana.odkryta).toBe(true);
    expect(wczytana.kontakt).toEqual({ dzien: 5, ludnosc: 14, budowle: 2 });
    expect(wczytana.podglad()).toMatchObject({ odkryta: true });
    // kolejny kontakt zastępuje poprzedni (ostatni kontakt)
    wczytana.odkryj({ dzien: 9, ludnosc: 20, budowle: 4 });
    expect(wczytana.kontakt).toEqual({ dzien: 9, ludnosc: 20, budowle: 4 });
    // osada, której nie ma, nie da się odkryć
    const brak = nowaOsadaGry(SEED, dane, uklad);
    brak.odkryj({ dzien: 5, ludnosc: 1, budowle: 1 });
    expect(brak.odkryta).toBe(false);
    expect(brak.zapisz()).toEqual({ v: 1, stan: 'czeka' });
  });

  it('odkrycie osady nie zmienia jej gry: skrót gry osady ten sam z odkryciem i bez', () => {
    // sama osada z zapisu z 4. dnia, krok po kroku do końca 5. doby (nasz tick to dla niej tylko liczba)
    const z = wzorzec.dzien4.osada!;
    const a = osadaZZapisu(JSON.parse(JSON.stringify(z)), SEED, dane, uklad);
    const b = osadaZZapisu(JSON.parse(JSON.stringify(z)), SEED, dane, uklad);
    b.odkryj({ dzien: 5, ludnosc: 14, budowle: 2 });
    for (let t = a.gra!.sim.st.tick + 1; t <= 5 * TICKS_PER_DAY; t++) {
      a.krok(t);
      b.krok(t);
    }
    expect(a.gra!.sim.st.tick).toBe(5 * TICKS_PER_DAY);
    expect(skrotGry(b.gra!)).toBe(skrotGry(a.gra!));
    expect(skrotGry(a.gra!)).toBe(wzorzec.hash5.osada);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Bez flagi
// ---------------------------------------------------------------------------------------------------------------------

describe('gra bez flagi', () => {
  it('save() nie ma pola osada, a gospodarz bez osady gra dokładnie tak jak sama pętla gry (skrót naszej gry po 3 dobach)', {
    timeout: 300_000,
  }, () => {
    const h = nowyGospodarz(false);
    expect(h.osada).toBeNull();
    graj(h, 3 * TICKS_PER_DAY);
    const sama = nowaNasza();
    grajDo(sama, silnikPodstawowy, 3 * TICKS_PER_DAY);
    expect(skrotGry(h.nasza)).toBe(skrotGry(sama));
    expect(h.nasza.sim.hash()).toBe(sama.sim.hash());
    // zapis jak w main.ts: pole osada tylko z osadą
    expect(poleOsady(null)).toEqual({});
    const baza = { v: 1, at: 1, data: { name: 'x' }, seed: SEED, sim: h.nasza.sim.st, gov: h.nasza.gov, screen: 0 };
    const save = { ...baza, world: worldKey(h.nasza.w), ...poleOsady(h.osada) };
    expect('osada' in save).toBe(false);
    expect(JSON.stringify(save)).not.toContain('"osada"');
    expect(JSON.stringify(save)).toBe(JSON.stringify({ ...baza, world: worldKey(h.nasza.w) }));
  });

  it('z osadą pole osada jest, a nasza gra idzie tak samo (etap 2 nie łączy obu gier): skrót naszej gry po 5 dobach równy grze bez osady', () => {
    expect(wzorzec.hash5.nasza).toBe(nasza5BezOsady);
    const osada = nowaOsadaGry(SEED, dane, uklad);
    expect(poleOsady(osada)).toEqual({ osada: { v: 1, stan: 'czeka' } });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Tryb zombie
// ---------------------------------------------------------------------------------------------------------------------

describe('tryb zombie', () => {
  it('tryb zombie z flagą: osady nie ma (brak, powód regula), dane i kroki niczego nie zmieniają', () => {
    const osada = nowaOsadaGry(SEED, dane, uklad, 'zombie');
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    osada.dane(demo.kwadraty);
    for (const t of [1, TICK_STARTU_OSADY - 1, TICK_STARTU_OSADY, TICK_STARTU_OSADY + 40]) osada.krok(t);
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'regula' });
    expect(osada.gra).toBeNull();
    expect(osada.swiat).toBeNull();
    // flaga zostaje w zapisie (pole osada jest), więc wczytana gra dalej wie, że zaczęto ją z flagą
    expect(poleOsady(osada)).toEqual({ osada: { v: 1, stan: 'brak', powod: 'regula' } });
  });

  it('tryb zwykły jest domyślny', () => {
    expect(nowaOsadaGry(SEED, dane, uklad, 'zwykly').zapisz()).toEqual({ v: 1, stan: 'czeka' });
    expect(nowaOsadaGry(SEED, dane, uklad).zapisz()).toEqual({ v: 1, stan: 'czeka' });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Koniec gry osady: odwołanie to nowy zarząd, pustka i exodus to upadek
// ---------------------------------------------------------------------------------------------------------------------

/** tyle ticków naprzód osady (krok po kroku), bez naszej gry: wystarczy jej tick */
function naprzod(osada: OsadaGry, ticki: number): number {
  let t = osada.gra!.sim.st.tick;
  for (let k = 0; k < ticki; k++) osada.krok(++t);
  return t;
}

describe('koniec gry osady', () => {
  it('odwołanie zarządu osady daje nowy zarząd: licznik rośnie, gra idzie dalej krok w krok z naszym tickiem, zapis to pamięta', () => {
    const osada = osadaPoStarcieBezNaszej();
    const t0 = naprzod(osada, 400);
    osada.gra!.gov.anger = 100;
    // do pełnej sekundy zarząd sprawdza koniec gry; gospodarz widzi już nowy zarząd
    const t1 = naprzod(osada, 2 * TICKS_PER_SECOND);
    expect(osada.odwolania).toBe(1);
    expect(osada.upadla).toBeNull();
    expect(osada.gra!.gov.over).toBeNull();
    expect(osada.gra!.gov.trust).toBeGreaterThan(0);
    expect(osada.gra!.gov.anger).toBeLessThan(100);
    expect(osada.gra!.sim.st.tick).toBe(t1);
    expect(t1).toBeGreaterThan(t0);
    // dalej krok w krok przez godzinę gry
    const t2 = naprzod(osada, 800);
    expect(osada.gra!.sim.st.tick).toBe(t2);
    expect(osada.gra!.bledy).toEqual([]);
    expect(osada.odwolania).toBeGreaterThanOrEqual(1);
    const z = osada.zapisz();
    expect(z).toMatchObject({ stan: 'jest', odwolania: osada.odwolania });
    expect('upadla' in z).toBe(false);
    const wczytana = osadaZZapisu(JSON.parse(JSON.stringify(z)), SEED, dane, uklad);
    expect(wczytana.odwolania).toBe(osada.odwolania);
    expect(skrotGry(wczytana.gra!)).toBe(skrotGry(osada.gra!));
    expect(wczytana.podglad()).toMatchObject({ odwolania: osada.odwolania });
  });

  it('odwołanie z nowym startem: zaufanie i wkurzenie od razu po odwołaniu to START_ZAUFANIA i START_WKURZENIA, nowy zarząd idzie dalej', () => {
    const osada = osadaPoStarcieBezNaszej();
    naprzod(osada, 100);
    osada.gra!.gov.anger = 100;
    const g = osada.gra!;
    let t = g.sim.st.tick;
    // krok po kroku do chwili odwołania (pierwsza pełna sekunda); tuż po niej zarząd ma nowy start
    // (najwyżej tyle kroków, ile ma sekunda gry, i jeszcze jedna: bez odwołania test pada, zamiast wisieć)
    for (let k = 0; k <= TICKS_PER_SECOND && osada.odwolania === 0; k++) osada.krok(++t);
    expect(osada.odwolania).toBe(1);
    expect(g.gov.trust).toBe(START_ZAUFANIA);
    expect(g.gov.anger).toBe(START_WKURZENIA);
    expect(g.gov.over).toBeNull();
  });

  it('pustka i exodus nie są odwołaniem: osada upadła, gra osady stoi, krok nie rzuca, a zapis i wczytanie to pamiętają', () => {
    for (const powod of ['exodus', 'pustka'] as const) {
      const osada = osadaPoStarcieBezNaszej();
      const t0 = naprzod(osada, 300);
      if (powod === 'exodus') osada.gra!.gov.trust = 0;
      else osada.gra!.gov.over = 'pustka';
      const t1 = naprzod(osada, 2 * TICKS_PER_SECOND);
      expect(osada.upadla, powod).not.toBeNull();
      expect(osada.upadla!.powod).toBe(powod);
      expect(osada.upadla!.dzien).toBe(dayOf(osada.gra!.sim.st.tick));
      expect(osada.stan).toBe('jest');
      expect(osada.odwolania).toBe(0);
      // gra osady stoi: kolejne kroki naszej gry jej nie ruszają
      const stoi = osada.gra!.sim.st.tick;
      expect(stoi).toBeLessThanOrEqual(t1);
      expect(stoi).toBeGreaterThanOrEqual(t0);
      const skrot = skrotGry(osada.gra!);
      expect(() => {
        for (let k = 1; k <= 200; k++) osada.krok(t1 + k);
      }).not.toThrow();
      expect(osada.gra!.sim.st.tick).toBe(stoi);
      expect(skrotGry(osada.gra!)).toBe(skrot);
      // zapis i wczytanie
      const z = osada.zapisz();
      expect(z).toMatchObject({ stan: 'jest', upadla: { powod } });
      const wczytana = osadaZZapisu(JSON.parse(JSON.stringify(z)), SEED, dane, uklad);
      expect(wczytana.upadla).toEqual(osada.upadla);
      expect(() => wczytana.krok(t1 + 500)).not.toThrow();
      expect(wczytana.gra!.sim.st.tick).toBe(stoi);
      expect(wczytana.podglad()).toMatchObject({ stan: 'jest', upadla: { powod }, tick: stoi });
    }
  });

  it('karta osady po odwołaniu zarządu i po upadku żywej osady jest ta sama co po kontakcie (gracz wie tyle, ile mu powiedziano)', () => {
    const osada = osadaPoStarcieBezNaszej();
    osada.odkryj({ dzien: 4, ludnosc: 6, budowle: 2 });
    const przed = daneKartyOsady(osada)!;
    expect(przed).not.toBeNull();
    const html = (d: NonNullable<typeof przed>) => {
      ustawJezyk('pl');
      const pl = kartaOsadyHtml(d);
      ustawJezyk('en');
      const en = kartaOsadyHtml(d);
      ustawJezyk('pl');
      return { pl, en };
    };
    const kartaPrzed = html(przed);
    // odwołanie zarządu osady: licznik rośnie, karta bez zmian
    naprzod(osada, 100);
    osada.gra!.gov.anger = 100;
    naprzod(osada, 2 * TICKS_PER_SECOND);
    expect(osada.odwolania).toBe(1);
    expect(osada.upadla).toBeNull();
    expect(daneKartyOsady(osada)).toEqual(przed);
    expect(html(daneKartyOsady(osada)!)).toEqual(kartaPrzed);
    // upadek osady: dzień i powód w jej stanie, karta bez zmian
    osada.gra!.gov.over = 'pustka';
    naprzod(osada, 2 * TICKS_PER_SECOND);
    expect(osada.upadla).not.toBeNull();
    expect(daneKartyOsady(osada)).toEqual(przed);
    expect(html(daneKartyOsady(osada)!)).toEqual(kartaPrzed);
    // po zapisie i wczytaniu tak samo
    const wczytana = osadaZZapisu(JSON.parse(JSON.stringify(osada.zapisz())), SEED, dane, uklad);
    expect(wczytana.upadla).not.toBeNull();
    expect(daneKartyOsady(wczytana)).toEqual(przed);
  });

  it('wyjątek w grze osady w trakcie gry wyłącza osadę (brak, blad, jedno ostrzeżenie), a krok nie rzuca', () => {
    const ostrzezenia = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const osada = osadaPoStarcieBezNaszej();
    const t = naprzod(osada, 50);
    // uszkodzony stan gry osady: następny krok symulacji rzuci
    (osada.gra!.sim.st as unknown as { pawns: unknown }).pawns = null;
    expect(() => {
      for (let k = 1; k <= 100; k++) osada.krok(t + k);
    }).not.toThrow();
    expect(osada.zapisz()).toEqual({ v: 1, stan: 'brak', powod: 'blad' });
    expect(osada.gra).toBeNull();
    expect(osada.swiat).toBeNull();
    expect(osada.podglad()).toMatchObject({ stan: 'brak', powod: 'blad' });
    expect(osada.podglad().blad).toMatch(/TypeError/);
    expect(ostrzezenia).toHaveBeenCalledTimes(1);
    expect(String(ostrzezenia.mock.calls[0][0])).toMatch(/Osada AI/);
  });

  it('upadek osady niczego nie zmienia w naszej grze: skrót naszej gry ten sam co bez osady', {
    timeout: 300_000,
  }, () => {
    const h = nowyGospodarz();
    h.osada!.dane(demo.kwadraty);
    graj(h, TICK_STARTU_OSADY + 20);
    h.osada!.gra!.gov.trust = 0;
    graj(h, 3 * TICKS_PER_DAY);
    expect(h.osada!.upadla).not.toBeNull();
    bezBledow(h);
    const sama = nowaNasza();
    grajDo(sama, silnikPodstawowy, 3 * TICKS_PER_DAY);
    expect(skrotGry(h.nasza)).toBe(skrotGry(sama));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Pobieranie kandydatów
// ---------------------------------------------------------------------------------------------------------------------

describe('pobierzKandydatow', () => {
  const geoAtrapa = (n: number): Geo => ({ c: [54, 18], b: [], r: [], a: [], w: [], poi: [], src: `atrapa${n}` });
  const klucze = (k: [number, number][]): string[] => k.map(([x, y]) => kluczKwadratu(x, y));

  it('pobiera osiem kwadratów po kolei w kolejności z ziarna gry, jeden po drugim (nigdy dwa naraz)', async () => {
    const poprosili: string[] = [];
    let naraz = 0;
    let maks = 0;
    const wynik = await pobierzKandydatow(
      SEED,
      async (sx, sy) => {
        naraz++;
        maks = Math.max(maks, naraz);
        poprosili.push(kluczKwadratu(sx, sy));
        await new Promise((r) => setTimeout(r, 1));
        naraz--;
        return geoAtrapa(poprosili.length);
      },
      () => {},
    );
    expect(poprosili).toEqual(klucze(kandydaciOsady(SEED)));
    expect(maks).toBe(1);
    expect(Object.keys(wynik).sort()).toEqual([...poprosili].sort());
    expect(wynik[poprosili[0]].src).toBe('atrapa1');
  });

  it('błąd jednego pobrania nie przerywa reszty, nie jest ponawiany, a ostrzeżenie jest jedno na całe pobieranie', async () => {
    const wolane: string[] = [];
    const ostrzezenia: { blad: unknown; nieudane: string[] }[] = [];
    const kolejnosc = klucze(kandydaciOsady(SEED));
    const wynik = await pobierzKandydatow(
      SEED,
      async (sx, sy) => {
        const k = kluczKwadratu(sx, sy);
        wolane.push(k);
        if (k === kolejnosc[1] || k === kolejnosc[4]) throw new Error(`pobranie ${k} padło`);
        return geoAtrapa(wolane.length);
      },
      (blad, nieudane) => ostrzezenia.push({ blad, nieudane }),
    );
    expect(wolane).toEqual(kolejnosc);
    expect(Object.keys(wynik).sort()).toEqual(kolejnosc.filter((k) => k !== kolejnosc[1] && k !== kolejnosc[4]).sort());
    expect(ostrzezenia).toHaveLength(1);
    expect(ostrzezenia[0].nieudane).toEqual([kolejnosc[1], kolejnosc[4]]);
    expect((ostrzezenia[0].blad as Error).message).toContain(kolejnosc[1]);
  });

  it('wszystkie pobrania padły: pusty rekord i jedno ostrzeżenie; bez błędów brak ostrzeżenia', async () => {
    const ostrzezenia: string[][] = [];
    const wynik = await pobierzKandydatow(
      SEED,
      async () => {
        throw new TypeError('Failed to fetch');
      },
      (_b, nieudane) => ostrzezenia.push(nieudane),
    );
    expect(wynik).toEqual({});
    expect(ostrzezenia).toHaveLength(1);
    expect(ostrzezenia[0]).toHaveLength(8);
    let ostrzezen = 0;
    await pobierzKandydatow(
      SEED,
      async () => geoAtrapa(0),
      () => ostrzezen++,
    );
    expect(ostrzezen).toBe(0);
  });

  it('domyślne ostrzeżenie idzie do konsoli raz i opisuje, ile kwadratów się nie pobrało', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await pobierzKandydatow(SEED, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Osada/);
    expect(String(warn.mock.calls[0][0])).toMatch(/8/);
  });
});
