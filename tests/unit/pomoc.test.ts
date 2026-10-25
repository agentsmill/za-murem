/* „Jak grać” zgadza się z grą (docs/superpowers/specs/2026-10-19-sciezka-celow-design.md, usterki U11, U12, U16 i U17).
   U11: liczba osób zarządu słownie i z odmianą według gry (od jednej do pięciu, nie zawsze cztery), siatka w trybie
   zombie bez „dziurawej” (jest cała i wzmocniona), broń na starcie z `START_KIT` (w zwykłym trybie jedna siekiera
   w rękach, nóż i łom w magazynie), porównana z prawdziwym `createSim`, a nie ze spisanymi nazwami. U12: „Na razie”
   nie przeczy badaniom, są sekcje „Poza siatką” (mapa miasta M, sąsiedzi, handlarz, wędrowcy) i „Badania” (T) oraz
   zdanie o drogach do zwycięstwa, a etykiety i klawisze w nich są z gry (przyciski z index.html i src/ui/jezyk.ts,
   menu drzwi, wędrowców i handlarza, menu budowy). W domu pomoc bez słów z bloku, po angielsku bez polskich liter.
   U16 i U17: przycisk okna planu wyprawy brzmi jak na karcie miejsca („Send a supply run”), a karta osoby ugryzionej
   w kończynę mówi „w rękę albo nogę” (symulacja nie odróżnia ręki od nogi). */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { MENU } from '../../src/content/napisy-sasiedzi.ts';
import { type Lang, tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../../src/gov/miejsce.ts';
import { celZMiejsca, wlaczMiasto } from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { START_KIT, WEAPONS, WEAPONS_EN, type WeaponId } from '../../src/sim/bron.ts';
import { TICKS_PER_HOUR } from '../../src/sim/clock.ts';
import { NAPISY as HANDEL } from '../../src/sim/handlarz.ts';
import { createSim, Sim } from '../../src/sim/sim.ts';
import { snapshot } from '../../src/sim/snapshot.ts';
import { NAPISY as WEDROWCY } from '../../src/sim/wedrowcy.ts';
import { buildMenu } from '../../src/ui/budowa.ts';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { personCard } from '../../src/ui/karta.ts';
import { kartaHtml, kartaMiejsca } from '../../src/ui/miasto.ts';
import { bronNaStarcie, helpSheet, menuSheet } from '../../src/ui/okna.ts';
import { planWyprawySheet } from '../../src/ui/wyprawa.ts';
import type { Miejsce } from '../../src/world/miasto.ts';
import { Atrapa } from './gov-atrapa.ts';
import { demoWorld, FORBIDDEN_DOM } from './miejsce-pomoc.ts';
import { polskieSlowa } from './po-angielsku.ts';

afterEach(() => ustawJezyk('pl'));

/** słowa z bloku, których w domu nie ma w polskich tekstach interfejsu (jak BLOKOWE w teksty-miejsca.test.ts) */
const BLOKOWE_PL = /spółdziel|zarząd|walne|osiedl|trzepak|klatk|bram|blok|pawilon|świetlic|czynsz|mieszka[nń]/i;
/** to samo po angielsku (jak BLOKOWE w teksty-miejsca-en.test.ts; „Research board” to tablica badań, nie zarząd) */
const BLOKOWE_EN =
  /co-op|(?<!research )\bboard\b|general meeting|\bestate\b|carpet rack|stairwell|\bblocks?\b|\bflats?\b|pavilion|common room|service charge|\bresidents?\b|(?<!garden )\bgate\b/i;

interface Wariant {
  touch?: boolean;
  zombie?: boolean;
  /** Zielonki (dom jednorodzinny) zamiast Przymorza (bloku) */
  dom?: boolean;
  osob?: number;
}

/** treść „Jak grać” w danym języku dla wariantu gry; języka po sobie nie zostawia (afterEach) */
function pomoc(lang: Lang, o: Wariant = {}): string {
  const { w } = demoWorld(o.dom ? 'zielonki' : 'przymorze');
  ustawJezyk(lang);
  return helpSheet(
    o.touch ?? false,
    o.zombie ?? false,
    wordsOfWorld(w),
    wordsEnOfWorld(w),
    o.osob === undefined ? undefined : { osob: o.osob },
  ).body;
}

/** tekst, który widać: bez znaczników */
const widac = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const naglowki = (html: string): string[] => [...html.matchAll(/<h3 class="help-h">([^<]*)<\/h3>/g)].map((m) => m[1]);
/** widoczny tekst jednej sekcji (od jej nagłówka do następnego); pusty, gdy sekcji nie ma */
function sekcja(html: string, naglowek: string): string {
  const start = html.indexOf(`<h3 class="help-h">${naglowek}</h3>`);
  if (start < 0) return '';
  const next = html.indexOf('<h3 class="help-h">', start + 1);
  return widac(html.slice(start, next < 0 ? undefined : next)).trim();
}

const WARIANTY: Wariant[] = [false, true].flatMap((touch) =>
  [false, true].flatMap((zombie) => [false, true].map((dom) => ({ touch, zombie, dom }))),
);

describe('Jak grać: liczba osób zarządu z gry (U11)', () => {
  const SLOWNIE: [number, string, string][] = [
    [1, 'Jedna osoba', 'One person'],
    [2, 'Dwie osoby', 'Two people'],
    [3, 'Trzy osoby', 'Three people'],
    [4, 'Cztery osoby', 'Four people'],
    [5, 'Pięć osób', 'Five people'],
    // więcej niż pięć da się tylko z ?zarzad=N (pomiary): do dwunastu słownie, dalej cyfrą z odmianą
    [12, 'Dwanaście osób', 'Twelve people'],
    [22, '22 osoby', '22 people'],
  ];

  it.each(SLOWNIE)('%i: zdanie o zarządzie ma tę liczbę słownie, z odmianą', (osob, pl, en) => {
    expect(widac(pomoc('pl', { osob }))).toContain(
      `Prowadzicie zarząd spółdzielni w 2051 roku. ${pl}, koza w kuchni i dziurawa siatka wokół podwórka.`,
    );
    expect(widac(pomoc('en', { osob }))).toContain(
      `You are the board of a housing co-op in 2051. ${en}, a potbelly stove in the kitchen and a fence full of holes around the yard.`,
    );
  });

  it('w domu komitet ulicy, na telefonie i w trybie zwykłym to samo zdanie z tą samą liczbą', () => {
    expect(widac(pomoc('pl', { dom: true, touch: true, osob: 2 }))).toContain(
      'Prowadzicie komitet ulicy w 2051 roku. Dwie osoby, koza w kuchni i dziurawa siatka wokół podwórka.',
    );
    expect(widac(pomoc('en', { dom: true, touch: true, osob: 3 }))).toContain(
      'You are the street committee in 2051. Three people, a potbelly stove in the kitchen and a fence full of holes around the yard.',
    );
  });

  it('bez opcji (stare wywołania) cztery osoby, jak dotąd, i żadnych „czterech ludzi”', () => {
    const { w } = demoWorld('przymorze');
    const words = wordsOfWorld(w);
    const e = wordsEnOfWorld(w);
    for (const body of [helpSheet(false).body, helpSheet(true, false, words, e).body, helpSheet(false, true).body]) {
      expect(widac(body)).toContain('Cztery osoby, koza w kuchni i');
      expect(body).not.toContain('Czterech ludzi');
    }
    ustawJezyk('en');
    expect(widac(helpSheet(false).body)).toContain('Four people, a potbelly stove in the kitchen and');
  });

  it('liczba, która nie jest dodatnią liczbą całkowitą, zostawia domyślne cztery', () => {
    for (const osob of [0, -3, 2.5, Number.NaN]) {
      expect(widac(pomoc('pl', { osob })), String(osob)).toContain('Cztery osoby, koza w kuchni i');
      expect(widac(pomoc('en', { osob })), String(osob)).toContain('Four people, a potbelly stove in the kitchen and');
    }
  });
});

describe('Jak grać: siatka w trybie zombie (U11)', () => {
  it('w zwykłym trybie siatka jest dziurawa, w zombie wzmocniona i cała', () => {
    expect(widac(pomoc('pl'))).toContain('koza w kuchni i dziurawa siatka wokół podwórka.');
    const zombiePl = widac(pomoc('pl', { zombie: true }));
    expect(zombiePl).not.toContain('dziurawa');
    expect(zombiePl).toContain('koza w kuchni i wzmocniona siatka wokół podwórka.');
    expect(widac(pomoc('en'))).toContain('a fence full of holes around the yard.');
    const zombieEn = widac(pomoc('en', { zombie: true }));
    expect(zombieEn).not.toContain('full of holes');
    expect(zombieEn).toContain('a potbelly stove in the kitchen and a reinforced fence around the yard.');
  });

  it('zgodnie z symulacją: zwykła gra zaczyna z dziurami w siatce, zombie z siatką wzmocnioną i załataną', () => {
    const { w, seed } = demoWorld('przymorze');
    const zwykly = createSim(w, seed, { core: 4 }).fence!;
    const zombie = createSim(w, seed, { core: 4, mode: 'zombie' }).fence!;
    expect(zwykly.holes.length).toBeGreaterThan(0);
    expect(zwykly.holes.every((h) => h.patch === 0)).toBe(true);
    expect(zwykly.reinforced).toBeFalsy();
    expect(zombie.reinforced).toBe(true);
    expect(zombie.holes.every((h) => h.patch > 0)).toBe(true);
  });
});

describe('Jak grać: broń na starcie z START_KIT (U11)', () => {
  const { w, seed } = demoWorld('przymorze');
  const TRYBY = [
    { zombie: false, mode: 'zwykly' as const },
    { zombie: true, mode: 'zombie' as const },
  ];

  it('bronNaStarcie zgadza się z prawdziwym createSim: kto co trzyma i co leży w magazynie, dla 1–5 osób w obu trybach', () => {
    for (const { zombie, mode } of TRYBY)
      for (let osob = 1; osob <= 5; osob++) {
        const st = createSim(w, seed, { core: osob, mode });
        const rdzen = st.pawns.filter((p) => p.kind === 'core');
        const b = bronNaStarcie(zombie, osob);
        expect(b.wRekach, `${mode} ${osob}`).toEqual(rdzen.map((p) => p.weapon).filter((a): a is WeaponId => !!a));
        expect(b.wMagazynie, `${mode} ${osob}`).toEqual(st.store.arms);
        expect(b.bezBroni, `${mode} ${osob}`).toBe(rdzen.filter((p) => !p.weapon).length);
      }
  });

  /** nazwy broni z START_KIT (kolejnych osób zarządu i magazynu), a nie spisane na sztywno */
  const spis = (ids: readonly (WeaponId | null)[], lang: Lang, ostatni: string): string => {
    const nazwy = ids
      .filter((a): a is WeaponId => a !== null)
      .map((a) => (lang === 'en' ? WEAPONS_EN[a].name : WEAPONS[a].name));
    return nazwy.length < 2 ? nazwy.join('') : `${nazwy.slice(0, -1).join(', ')} ${ostatni} ${nazwy.at(-1)}`;
  };

  it('zwykły tryb: zdanie wymienia broń w rękach i w magazynie według START_KIT.zwykly', () => {
    const kit = START_KIT.zwykly;
    const pl = widac(pomoc('pl', { osob: 4 }));
    const rece = kit.core.slice(0, 4);
    expect(pl).toContain(
      `Na start ${spis(rece, 'pl', 'i')} ${rece.length === 1 ? 'jest' : 'są'} w rękach (reszta ma gołe ręce), a ${spis(kit.store, 'pl', 'i')} ${kit.store.length === 1 ? 'leży' : 'leżą'} w magazynie (karta osoby: „Zmień”).`,
    );
    const en = widac(pomoc('en', { osob: 4 }));
    expect(en).toContain(
      `At the start the ${spis(rece, 'en', 'and')} ${rece.length === 1 ? 'is' : 'are'} in hand (the rest have bare hands), and the ${spis(kit.store, 'en', 'and')} ${kit.store.length === 1 ? 'is' : 'are'} in the storeroom (person card: “Swap”).`,
    );
    // jedna osoba: nikt nie ma gołych rąk, więc bez dopisku
    expect(widac(pomoc('pl', { osob: 1 }))).not.toContain('reszta ma gołe ręce');
    expect(widac(pomoc('en', { osob: 1 }))).not.toContain('the rest have bare hands');
    // dawne zdanie, które w zwykłym trybie nie było prawdą
    expect(pl).not.toContain('Każdy z zarządu ma jedną broń');
    expect(en).not.toContain('carries one weapon');
  });

  it('tryb zombie: lista z START_KIT.zombie, a przy mniejszym zarządzie nadwyżka broni leży w magazynie', () => {
    const kit = START_KIT.zombie;
    for (const osob of [2, 4, 5]) {
      const rece = kit.core.slice(0, osob);
      const mag = [...kit.store, ...kit.core.slice(osob)];
      const bez = osob > kit.core.filter(Boolean).length ? ' (reszta ma gołe ręce)' : '';
      const pl = widac(pomoc('pl', { zombie: true, osob }));
      expect(pl, String(osob)).toContain(
        `Na start ${spis(rece, 'pl', 'i')} ${rece.length === 1 ? 'jest' : 'są'} w rękach${bez}, a ${spis(mag, 'pl', 'i')} ${mag.length === 1 ? 'leży' : 'leżą'} w magazynie (karta osoby: „Zmień”).`,
      );
    }
  });

  it('prawy przycisk na wrogu i warta zostają w zdaniu o broni', () => {
    expect(widac(pomoc('pl'))).toContain(
      'Prawy przycisk na wrogu: „Atakuj”. Warta bije sama, jeśli wróg jest w zasięgu jej broni.',
    );
    expect(widac(pomoc('en'))).toContain(
      'Right-click an enemy: “Attack”. The watch fights on its own when an enemy comes within reach of its weapons.',
    );
  });
});

describe('Jak grać: „Na razie” nie przeczy temu, co jest w grze (U12)', () => {
  it('w bloku i w domu, po polsku i po angielsku', () => {
    for (const dom of [false, true]) {
      const { w } = demoWorld(dom ? 'zielonki' : 'przymorze');
      const words = wordsOfWorld(w);
      const e = wordsEnOfWorld(w);
      const pl = sekcja(pomoc('pl', { dom }), 'Na razie');
      expect(pl).toBe(
        `Na razie W wersji 1.0 są noce za siatką, budowa, ${words.szukanie.wersja}, sąsiedzi, mapa miasta, praca ludzi, badania w pracowni, wydarzenia z łańcuchami historii, cele prowadzące po grze, drogi do zwycięstwa, wiki i tryb zombie. Prąd w erach 3–6 i reszta gospodarki przyjdą później.`,
      );
      const en = sekcja(pomoc('en', { dom }), 'For now');
      expect(en).toBe(
        `For now Version 1.0 has nights behind the fence, building, ${e.szukanie.wersja}, neighbours, the city map, work, research, events with story chains, goals that walk you through the game, roads to victory, the wiki and Zombie mode. Power in eras 3–6 and the rest of the economy will come later.`,
      );
      for (const t of [pl, en]) {
        expect(t).not.toMatch(/Badania, zima|przyjdą w kolejnych wersjach|Research, winter|in later versions/);
      }
    }
  });
});

describe('Jak grać: sekcje „Poza siatką” i „Badania” (U12)', () => {
  const statyczny = (sel: string) => STATYCZNE.find((s) => s.sel === sel)!;
  const etykieta = (sel: string, pole: 'tekst' | 'aria', lang: Lang): string => {
    ustawJezyk(lang);
    return tr(statyczny(sel)[pole]);
  };

  it('sekcje stoją po Pracy i przed częścią o zarządzie, w obu językach i w obu trybach', () => {
    expect(naglowki(pomoc('pl'))).toEqual([
      'Sterowanie',
      'Budowa i puste mieszkania',
      'Praca',
      'Poza siatką',
      'Badania',
      'Zarząd',
      'Na razie',
    ]);
    expect(naglowki(pomoc('pl', { zombie: true }))).toEqual([
      'Sterowanie',
      'Budowa i puste mieszkania',
      'Praca',
      'Poza siatką',
      'Badania',
      'Zarząd',
      'Tryb zombie',
      'Na razie',
    ]);
    expect(naglowki(pomoc('en'))).toEqual([
      'Controls',
      'Building and empty flats',
      'Work',
      'Beyond the fence',
      'Research',
      'The board',
      'For now',
    ]);
    expect(naglowki(pomoc('pl', { dom: true }))).toEqual([
      'Sterowanie',
      'Budowa i przeszukiwanie domu',
      'Praca',
      'Poza siatką',
      'Badania',
      'Komitet ulicy',
      'Na razie',
    ]);
  });

  it('klawisze M i T są na przyciskach w index.html, a etykiety przycisków z gry', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/id="btnMiasto"[^>]*aria-keyshortcuts="M"/);
    expect(html).toMatch(/id="btnResearch"[^>]*aria-keyshortcuts="T"/);
    expect(etykieta('#btnMiasto', 'aria', 'pl')).toBe('Mapa miasta');
    expect(etykieta('#btnResearch', 'tekst', 'pl')).toBe('Badania');
    expect(etykieta('#btnMiasto', 'aria', 'en')).toBe('City map');
    expect(etykieta('#btnResearch', 'tekst', 'en')).toBe('Research');
  });

  it('mapa miasta: przycisk i klawisz M na komputerze, na telefonie sam przycisk Mapa; karta i „Wyślij wyprawę”', () => {
    const komputer = sekcja(pomoc('pl'), 'Poza siatką');
    expect(komputer).toContain(
      'Przycisk Mapa miasta u góry albo klawisz M otwiera mapę okolicy: klik w miejsce pokazuje odległość, ryzyko i łup, a „Wyślij wyprawę” pyta, kto idzie.',
    );
    const telefon = sekcja(pomoc('pl', { touch: true }), 'Poza siatką');
    expect(telefon).toContain(
      'Przycisk Mapa u góry otwiera mapę okolicy: stuknięcie w miejsce pokazuje odległość, ryzyko i łup, a „Wyślij wyprawę” pyta, kto idzie.',
    );
    expect(telefon).not.toContain('klawisz M');
    expect(sekcja(pomoc('en'), 'Beyond the fence')).toContain(
      'The City map button at the top, or the M key, opens the map of the area: click a place to see the distance, the risk and the loot, and “Send a supply run” asks who goes.',
    );
    const phone = sekcja(pomoc('en', { touch: true }), 'Beyond the fence');
    expect(phone).toContain(
      'The Map button at the top opens the map of the area: tap a place to see the distance, the risk and the loot, and “Send a supply run” asks who goes.',
    );
    expect(phone).not.toContain('M key');
  });

  it('sąsiedzi: „Zapukać”, „Otworzyć drzwi” i „Wyważyć drzwi” z menu drzwi, a lokatorzy wychodzą na pukanie', () => {
    const pl = sekcja(pomoc('pl'), 'Poza siatką');
    expect(pl).toContain(
      `Sąsiednie budynki mają drzwi: prawy przycisk na nich daje „${MENU.zapukaj.pl}”, „${MENU.otworz.pl}” albo „${MENU.wywaz.pl}”, a w środku można przeszukiwać pomieszczenia.`,
    );
    expect(pl).toContain(
      'Kto mieszka w środku, może wyjść na pukanie: gra staje, a karta spotkania mówi, kim są i co można z nimi zrobić.',
    );
    expect(sekcja(pomoc('pl', { touch: true }), 'Poza siatką')).toContain(
      `Sąsiednie budynki mają drzwi: przytrzymanie palca na nich daje „${MENU.zapukaj.pl}”, „${MENU.otworz.pl}” albo „${MENU.wywaz.pl}”`,
    );
    const en = sekcja(pomoc('en'), 'Beyond the fence');
    expect(en).toContain(
      `The neighbouring buildings have doors: right-click one for “${MENU.zapukaj.en}”, “${MENU.otworz.en}” or “${MENU.wywaz.en}”, and inside you can search the rooms.`,
    );
    expect(en).toContain(
      'Anyone living inside may come out when you knock: the game pauses, and a card tells you who they are and what you can do.',
    );
    expect(sekcja(pomoc('en', { touch: true }), 'Beyond the fence')).toContain(
      `press and hold on one for “${MENU.zapukaj.en}”, “${MENU.otworz.en}” or “${MENU.wywaz.en}”`,
    );
  });

  it('handlarz pod bramą (w domu pod furtką) z ofertami „Dać … za …” i wędrowiec z „Zagadać”', () => {
    const oferta = HANDEL.oferta({ give: { deski: 4 }, take: { zlom: 3 }, left: 2 });
    expect(oferta.pl.startsWith('Dać ') && oferta.pl.includes(' za ')).toBe(true);
    expect(oferta.en.startsWith('Give ') && oferta.en.includes(' for ')).toBe(true);
    const blok = sekcja(pomoc('pl'), 'Poza siatką');
    expect(blok).toContain(
      'Czasem za dnia pod bramą staje handlarz z wózkiem: prawy przycisk na nim pokazuje oferty „Dać … za …”.',
    );
    const dom = sekcja(pomoc('pl', { dom: true }), 'Poza siatką');
    expect(dom).toContain(
      'Czasem za dnia pod furtką staje handlarz z wózkiem: prawy przycisk na nim pokazuje oferty „Dać … za …”.',
    );
    expect(blok).toContain(
      `Wędrowcy przystają czasem przy siatce: prawy przycisk na wędrowcu daje „${WEDROWCY.zagadac.pl}”, a po rozmowie można go zaprosić do nas.`,
    );
    expect(sekcja(pomoc('pl', { touch: true }), 'Poza siatką')).toContain(
      'przytrzymanie palca na nim pokazuje oferty „Dać … za …”.',
    );
    const en = sekcja(pomoc('en'), 'Beyond the fence');
    expect(en).toContain(
      'Now and then a trader with a cart waits at the gate by day: right-click the trader to see the offers, “Give … for …”.',
    );
    expect(sekcja(pomoc('en', { dom: true }), 'Beyond the fence')).toContain('waits at the garden gate by day');
    expect(en).toContain(
      `Wanderers sometimes stop at the fence: right-click one for “${WEDROWCY.zagadac.en}”, and after the talk you can invite them to join us.`,
    );
    expect(sekcja(pomoc('en', { touch: true }), 'Beyond the fence')).toContain(
      `press and hold on one for “${WEDROWCY.zagadac.en}”`,
    );
  });

  it('badania: pracownia w zakładce menu budowy, przycisk Badania i klawisz T, „Badać”, znaczek NOWE', () => {
    const zakladka = (lang: Lang): string => {
      ustawJezyk(lang);
      return buildMenu({}, () => true).find((c) => c.items.some((b) => b.kind === 'pracownia'))!.title;
    };
    expect(zakladka('pl')).toBe('Dom');
    expect(zakladka('en')).toBe('Home');
    const pl = sekcja(pomoc('pl'), 'Badania');
    expect(pl).toContain(
      'Pracownię stawia się w panelu budowy, w zakładce Dom. Kiedy stoi, przycisk Badania u góry albo klawisz T otwiera tablicę badań.',
    );
    expect(pl).toContain(
      'Na tablicy wybieracie badanie („Badać”), a badają zaznaczeni ludzie: prawy przycisk na pracowni daje „Badać: …”. Im lepiej ktoś zna dziedzinę, tym szybciej idzie.',
    );
    expect(pl).toContain(
      'Ukończone badanie daje nową budowlę (w panelu budowy świeci znaczek NOWE) albo premię, a książki z przeszukań podnoszą wiedzę.',
    );
    const telefon = sekcja(pomoc('pl', { touch: true }), 'Badania');
    expect(telefon).toContain('przycisk Badania u góry otwiera tablicę badań.');
    expect(telefon).not.toContain('klawisz T');
    expect(telefon).toContain('przytrzymanie palca na pracowni daje „Badać: …”');
    const en = sekcja(pomoc('en'), 'Research');
    expect(en).toContain(
      'The research room is built in the build panel, on the Home tab. Once it stands, the Research button at the top, or the T key, opens the Research board.',
    );
    expect(en).toContain(
      'On the Research board you choose what to research (“Research”) and the people you have selected do the work: right-click the research room for “Research: …”. The better someone knows the field, the faster it goes.',
    );
    expect(en).toContain(
      'A finished research unlocks a new building (it gets a NEW tag in the build panel) or gives a bonus, and books found while searching raise your knowledge.',
    );
    const phone = sekcja(pomoc('en', { touch: true }), 'Research');
    expect(phone).toContain('the Research button at the top opens the Research board.');
    expect(phone).not.toContain('T key');
    expect(phone).toContain('press and hold on the research room for “Research: …”');
  });

  it('drogi do zwycięstwa: zdanie w części o zarządzie nazywa ekran tak jak przycisk w Menu', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const etykietaMenu = /data-act="menu-zwyciestwo"[^>]*>([^<]*)</.exec(menuSheet('x').body)![1];
      expect(etykietaMenu).toBe(lang === 'pl' ? 'Drogi do zwycięstwa' : 'Roads to victory');
      const zarzad = sekcja(pomoc(lang), lang === 'pl' ? 'Zarząd' : 'The board');
      expect(zarzad).toContain(
        lang === 'pl'
          ? 'W Menu jest ekran „Drogi do zwycięstwa”: kamienie milowe każdej drogi, postęp i to, co zrobić dalej.'
          : 'The Menu has a “Roads to victory” screen: the milestones of each road, your progress and what to do next.',
      );
    }
  });

  it('w trybie zwykłym nowe sekcje nie wspominają szwendaczy ani tłumu', () => {
    for (const touch of [false, true]) {
      expect(pomoc('pl', { touch })).not.toMatch(/szwendacz|tłum/i);
      expect(pomoc('en', { touch })).not.toMatch(/shambler|crowd/i);
    }
  });
});

describe('Jak grać: języki i miejsca', () => {
  it('po angielsku żadnej polskiej litery ani polskiego słówka, w każdym wariancie', () => {
    for (const o of WARIANTY)
      for (const osob of [undefined, 1, 3, 5]) {
        const t = widac(pomoc('en', { ...o, osob }));
        expect(polskieSlowa(t), JSON.stringify({ ...o, osob })).toEqual([]);
        expect(t).not.toMatch(/\bboards\b|expedition|firewood/i);
      }
  });

  it('po polsku w domu bez słów z bloku (FORBIDDEN_DOM i słowa zarządu, bramy i mieszkania)', () => {
    for (const o of WARIANTY.filter((x) => x.dom))
      for (const osob of [undefined, 1, 5]) {
        const t = widac(pomoc('pl', { ...o, osob }));
        expect(t, JSON.stringify({ ...o, osob })).not.toMatch(FORBIDDEN_DOM);
        expect(t, JSON.stringify({ ...o, osob })).not.toMatch(BLOKOWE_PL);
      }
  });

  it('po angielsku w domu bez słów z bloku', () => {
    for (const o of WARIANTY.filter((x) => x.dom))
      for (const osob of [undefined, 1, 5]) {
        const t = widac(pomoc('en', { ...o, osob }));
        expect(t, JSON.stringify({ ...o, osob })).not.toMatch(BLOKOWE_EN);
      }
  });

  it('w bloku nowe zdania mówią jak dotąd o bramie i zarządzie', () => {
    const t = widac(pomoc('pl'));
    expect(t).toContain('Prowadzicie zarząd spółdzielni');
    expect(t).toContain('pod bramą');
    expect(widac(pomoc('en'))).toContain('waits at the gate by day');
  });
});

describe('Przycisk wysyłki wyprawy jest ten sam na karcie miejsca i w oknie planu (U16)', () => {
  const miejsce: Miejsce = { klucz: 'poi:1:7', kat: 'apteka', x: 250, y: 0, odl: 250, nazwa: '' };
  /** tekst przycisku `data-act="wyslij"` z HTML-a karty albo ze stopki okna */
  const przycisk = (html: string): string => /data-act="wyslij"[^>]*>([^<]*)</.exec(html)?.[1] ?? '';

  it.each([
    ['pl', 'Wyślij wyprawę'],
    ['en', 'Send a supply run'],
  ] as const)('%s: „%s” w obu miejscach', (lang, oczekiwany) => {
    ustawJezyk(lang);
    const gov = newGov(7);
    wlaczMiasto(gov);
    const i = new Atrapa(7).input();
    const karta = przycisk(kartaHtml(miejsce, kartaMiejsca(miejsce, gov, i), true));
    const plan = przycisk(planWyprawySheet(celZMiejsca(miejsce), i, gov, new Set()).foot);
    expect(karta).toBe(oczekiwany);
    expect(plan).toBe(karta);
  });
});

describe('Karta ugryzionej osoby mówi o kończynie, nie o samej ręce (U17)', () => {
  const { w, seed } = demoWorld('przymorze');
  const sim = new Sim(w, createSim(w, seed, { core: 4, mode: 'zombie' }));
  const osoba = snapshot(sim.st, w).people[0];
  const bite = (limb: boolean) => ({ at: 0, limb, left: TICKS_PER_HOUR, amputate: true });
  const karta = (lang: Lang, limb: boolean): string => {
    ustawJezyk(lang);
    return widac(personCard({ ...osoba, bite: bite(limb) }, 0));
  };

  it('ugryzienie w kończynę: „w rękę albo nogę” / “on an arm or a leg”', () => {
    expect(karta('pl', true)).toMatch(/Ugryzion[ay] w rękę albo nogę 0:00 temu\. Gorączka zabije za 1 h\./);
    expect(karta('en', true)).toMatch(/Bitten on an arm or a leg 0 min ago\. The fever will kill (her|him) in 1 h\./);
  });

  it('inne ugryzienie bez dopisku o kończynie', () => {
    expect(karta('pl', false)).toMatch(/Ugryzion[ay] 0:00 temu\./);
    expect(karta('pl', false)).not.toContain('w rękę');
    expect(karta('en', false)).toMatch(/Bitten 0 min ago\./);
    expect(karta('en', false)).not.toMatch(/\barm\b/);
  });

  it('nie ma starych „w rękę.” i „on the arm”', () => {
    expect(karta('pl', true)).not.toMatch(/w rękę (?!albo nogę)/);
    expect(karta('en', true)).not.toContain('on the arm');
  });
});
