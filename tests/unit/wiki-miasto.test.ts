/* Wiki, kategoria „Mapa miasta i wyprawy” (src/ui/wiki-miasto.ts): pokrycie (każda kategoria miejsca z tabeli gry ma artykuł
   `miejsce:<kategoria>`, są artykuły o mapie, wyprawach, drodze, ryzyku i łupie), fakty równe tabelom gry (łup i ryzyko
   z `celZMiejsca` i `POICAT`, czas z `czasWyprawyMin`, stałe wypraw, cele z `TARGETS`), zdania z gry (odmowy wysłania,
   karta miejsca, etykiety), zachowania, na których stoją artykuły (mapa osiedla poza celami, wybór celów karty nocy,
   ryzyko osób, łup grupy, kłopoty), uwaga o trybie zombie, język, wariant domu i odnośniki. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { POICAT } from '../../src/content/data.ts';
import { KAT_EN } from '../../src/content/miejsca.en.ts';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import { powodOdmowy } from '../../src/gov/dzienne.ts';
import { CARD_HOUR, expRisk, MORNING, rozliczWyprawe } from '../../src/gov/noc.ts';
import { TARGETS } from '../../src/gov/tresc.ts';
import type { GovInput, GovPerson } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import {
  BLISKO_DO_M,
  celZMiejsca,
  czasWyprawyMin,
  KRZYWIZNA_ULIC,
  LUP_03,
  MAX_DROGA_M,
  MAX_OKOLICA_M,
  METROW_NA_MIN,
  PRZESZUKANIE_KROK_MIN,
  PRZESZUKANIE_MIN,
  PRZESZUKANIE_NAJKROCEJ_MIN,
  PUSTE_MIEJSCA,
  powrotMin,
  RYZYKO_ODL_M,
  ryzykoSlowem,
  SKALA_LUPU,
  UDZWIG_NA_OSOBE,
  WSKAZOWKA_LUP,
  WSKAZOWKA_RYZYKO,
  wlaczMiasto,
  wybierzCeleNocy,
  ZAPAS_MAX,
  ZAPAS_MNOZNIK_OD,
  ZAPAS_MNOZNIK_ROZSTEP,
} from '../../src/gov/wyprawy.ts';
import { newGov } from '../../src/gov/zarzad.ts';
import { STATYCZNE } from '../../src/ui/jezyk.ts';
import { kartaMiejsca, mapaMiastaSheet } from '../../src/ui/miasto.ts';
import { artykul, maArtykul, rejestr, szukaj, tytulArtykulu } from '../../src/ui/wiki.ts';
import { BEZ_PUNKTOW, celKategorii, KATEGORIE_MIEJSC, powodyOdmowy, progiRyzyka } from '../../src/ui/wiki-miasto.ts';
import { type Miejsce, PROMIEN_MAPY_LOKALNEJ } from '../../src/world/miasto.ts';
import { poiCat } from '../../src/world/osm.ts';
import { Atrapa } from './gov-atrapa.ts';
import { kontrolaOdnosnikow, kontrolaTresci } from './wiki-kontrola.ts';
import { kontekst, PRZYPADKI, tekstArtykulu } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const moje = rejestr().filter((d) => d.kat === 'miasto');
const NB = ' ';
const round2 = (v: number) => Math.round(v * 100) / 100;
const zrodlo = (plik: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '../..', plik), 'utf8');
const pc = (v: number) => `${Math.round(v * 100)}%`;
/** liczba po polsku z przecinkiem albo po angielsku z kropką, najwyżej do dwóch miejsc */
const liczba = (v: number, lang: 'pl' | 'en') => String(round2(v)).replace('.', lang === 'pl' ? ',' : '.');

/** wartość faktu artykułu (blok, mysz, zwykła gra) w bieżącym języku */
const fakt = (id: string, f: string, zombie = false): string | undefined =>
  artykul(id, kontekst('blok', false, zombie))!.fakty.find((x) => x.id === f)?.v;

const miejsce = (kat: string, odl: number): Miejsce => ({
  klucz: `poi:t:${kat}:${odl}`,
  kat,
  x: odl,
  y: 0,
  odl,
  nazwa: '',
});

describe('pokrycie', () => {
  it('artykuły ogólne i po jednym na każdą kategorię miejsca z tabeli gry', () => {
    expect(
      moje
        .filter((d) => d.id.startsWith('miasto:'))
        .map((d) => d.id)
        .sort(),
    ).toEqual(
      [
        'miasto:mapa',
        'miasto:wyprawa',
        'miasto:dzienna',
        'miasto:nocna',
        'miasto:droga',
        'miasto:ryzyko',
        'miasto:lup',
      ].sort(),
    );
    expect(KATEGORIE_MIEJSC).toEqual(Object.keys(KAT_EN));
    expect(KATEGORIE_MIEJSC).toEqual(Object.keys(POICAT).filter((k) => k !== 'mieszkania'));
    for (const k of KATEGORIE_MIEJSC) expect(maArtykul(`miejsce:${k}`), k).toBe(true);
    expect(moje.filter((d) => d.id.startsWith('miejsce:'))).toHaveLength(KATEGORIE_MIEJSC.length);
    expect(maArtykul('miejsce:mieszkania')).toBe(false);
  });

  it('wymagane identyfikatory istnieją', () => {
    for (const id of ['miasto:wyprawa', 'miejsce:apteka', 'miejsce:przychodnia']) expect(maArtykul(id), id).toBe(true);
  });

  it('garaże i hale są w tabeli, ale żaden punkt z OpenStreetMap ich nie dostaje; reszta kategorii tak', () => {
    // po jednym znaczniku OSM na kategorię (poiCat to jedyne źródło `geo.poi.c`)
    const ZNACZNIKI: Record<string, Record<string, string>> = {
      spozywczy: { shop: 'supermarket' },
      apteka: { amenity: 'pharmacy' },
      przychodnia: { amenity: 'clinic' },
      budowlany: { shop: 'doityourself' },
      elektronika: { shop: 'electronics' },
      szkola: { amenity: 'school' },
      biblioteka: { amenity: 'library' },
      bank: { amenity: 'bank' },
      stacja: { amenity: 'fuel' },
      ubrania: { shop: 'clothes' },
      urzad: { amenity: 'post_office' },
      kosciol: { amenity: 'place_of_worship' },
      sklep: { shop: 'toys' },
      ogrodnik: { shop: 'florist' },
    };
    for (const [kat, t] of Object.entries(ZNACZNIKI)) expect(poiCat(t), kat).toBe(kat);
    expect(Object.keys(ZNACZNIKI).sort()).toEqual(KATEGORIE_MIEJSC.filter((k) => !BEZ_PUNKTOW.has(k)).sort());
    // żadne tagi budynków ani sklepów nie dają garaży i hal
    const proby = [
      { building: 'garage' },
      { building: 'garages' },
      { building: 'warehouse' },
      { building: 'industrial' },
      { shop: 'car_repair' },
      { shop: 'trade' },
      { amenity: 'parking' },
      { landuse: 'garages' },
    ];
    for (const t of proby) expect(['garaz', 'hala'], JSON.stringify(t)).not.toContain(poiCat(t));
    expect([...BEZ_PUNKTOW].sort()).toEqual(['garaz', 'hala']);
    for (const k of BEZ_PUNKTOW) {
      expect(tekstArtykulu(artykul(`miejsce:${k}`, kontekst('blok'))!)).toContain('żaden punkt z OpenStreetMap');
    }
    for (const k of KATEGORIE_MIEJSC.filter((x) => !BEZ_PUNKTOW.has(x)))
      expect(tekstArtykulu(artykul(`miejsce:${k}`, kontekst('blok'))!), k).not.toContain('żaden punkt z OpenStreetMap');
  });
});

describe('fakty o kategoriach zgodne z tabelą gry', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`łup, ryzyko i powrót każdej kategorii: ${lang}`, () => {
      ustawJezyk(lang);
      for (const kat of KATEGORIE_MIEJSC) {
        const id = `miejsce:${kat}`;
        const a = artykul(id, kontekst('blok'))!;
        expect(a.tytul, kat).toBe(lang === 'pl' ? POICAT[kat].name : KAT_EN[kat]);
        expect(fakt(id, 'ryzyko-bazowe'), kat).toBe(liczba(POICAT[kat].risk, lang));
        // łup: przedziały z POICAT razy SKALA_LUPU na zapasy zarządu, bez opału zapisanego jako „opal”
        const oczekiwany = Object.entries(POICAT[kat].loot)
          .map(([res, [x, y]]) => ({
            klucz: LUP_03[res as keyof typeof LUP_03]!,
            od: Math.round(x * SKALA_LUPU),
            do: Math.round(y * SKALA_LUPU),
          }))
          .filter((x) => x.do > 0);
        expect(
          a.fakty.filter((f) => f.id.startsWith('lup-')).map((f) => f.id),
          kat,
        ).toEqual(oczekiwany.map((x) => `lup-${x.klucz}`));
        for (const x of oczekiwany)
          expect(fakt(id, `lup-${x.klucz}`), `${kat} ${x.klucz}`).toBe(x.od === x.do ? `${x.od}` : `${x.od}–${x.do}`);
        for (const odl of [PROMIEN_MAPY_LOKALNEJ, BLISKO_DO_M, MAX_OKOLICA_M, MAX_DROGA_M]) {
          const r = round2(POICAT[kat].risk * (1 + odl / RYZYKO_ODL_M));
          expect(fakt(id, `ryzyko-${odl}`), `${kat} ${odl}`).toBe(`${liczba(r, lang)} (${tr(ryzykoSlowem(r))})`);
        }
        expect(fakt(id, 'powrot'), kat).toContain(`${celKategorii(kat, BLISKO_DO_M).powrot}:00`);
      }
    });

  it('przykłady cyfr: apteka daje leki 1–3, sklep spożywczy jedzenie 3–7, bank części 1–2, kościół drewno 1–2', () => {
    expect(fakt('miejsce:apteka', 'lup-meds')).toBe('1–3');
    expect(fakt('miejsce:spozywczy', 'lup-supplies')).toBe('3–7');
    expect(fakt('miejsce:bank', 'lup-parts')).toBe('1–2');
    expect(fakt('miejsce:kosciol', 'lup-wood')).toBe('1–2');
  });

  it('bank ma najwyższe ryzyko bazowe, kościół najniższe, i artykuły to mówią', () => {
    const ryzyka = KATEGORIE_MIEJSC.map((k) => POICAT[k].risk);
    expect(POICAT.bank.risk).toBe(Math.max(...ryzyka));
    expect(POICAT.kosciol.risk).toBe(Math.min(...ryzyka));
    expect(tekstArtykulu(artykul('miejsce:bank', kontekst('blok'))!)).toContain('najwyższe ryzyko bazowe');
    expect(tekstArtykulu(artykul('miejsce:kosciol', kontekst('blok'))!)).toContain('najniższe ryzyko bazowe');
    expect(tekstArtykulu(artykul('miejsce:apteka', kontekst('blok'))!)).not.toContain('najwyższe ryzyko');
  });
});

describe('fakty ogólne zgodne ze stałymi gry', () => {
  for (const lang of ['pl', 'en'] as const)
    it(`mapa, wyprawa, droga, ryzyko, łup, karta nocy: ${lang}`, () => {
      ustawJezyk(lang);
      const m = (v: number) =>
        v < 1000 ? `${v}${NB}m` : `${String(v / 1000).replace('.', lang === 'pl' ? ',' : '.')}${NB}km`;
      expect(fakt('miasto:mapa', 'osiedle')).toBe(m(PROMIEN_MAPY_LOKALNEJ));
      expect(fakt('miasto:mapa', 'najdalej')).toBe(m(MAX_DROGA_M));
      expect(fakt('miasto:mapa', 'okolica')).toBe(m(MAX_OKOLICA_M));
      expect(fakt('miasto:mapa', 'kategorie')).toBe(`${KATEGORIE_MIEJSC.length}`);

      expect(fakt('miasto:wyprawa', 'udzwig')).toContain(`${UDZWIG_NA_OSOBE}`);
      expect(fakt('miasto:wyprawa', 'dzienna')).toBe(`${MORNING}:00–${CARD_HOUR}:00`);
      expect(fakt('miasto:wyprawa', 'powrot-blisko')).toBe(`${celZMiejsca(miejsce('sklep', BLISKO_DO_M)).powrot}:00`);
      expect(fakt('miasto:wyprawa', 'powrot-daleko')).toBe(
        `${celZMiejsca(miejsce('sklep', BLISKO_DO_M + 1)).powrot}:00`,
      );

      expect(fakt('miasto:dzienna', 'najdalej')).toBe(m(MAX_DROGA_M));
      expect(fakt('miasto:dzienna', 'osiedle')).toBe(m(PROMIEN_MAPY_LOKALNEJ));

      expect(fakt('miasto:nocna', 'blisko')).toBe(m(BLISKO_DO_M));
      expect(fakt('miasto:nocna', 'okolica')).toBe(m(MAX_OKOLICA_M));
      for (const t of TARGETS) {
        const wiersz = artykul('miasto:nocna', kontekst('blok'))!.fakty.find((f) => f.id === `cel-${t.id}`)!;
        expect(wiersz.v, t.id).toContain(`${t.back}:00`);
        expect(wiersz.v, t.id).toContain(liczba(t.risk, lang));
      }

      expect(fakt('miasto:droga', 'krzywizna')).toBe(liczba(KRZYWIZNA_ULIC, lang));
      expect(fakt('miasto:droga', 'tempo')).toContain(`${(METROW_NA_MIN * 60) / 1000}`);
      const czas = (min: number) => {
        const h = Math.floor(min / 60);
        const r = Math.round(min % 60);
        return h ? (r ? `${h}${NB}h${NB}${r}${NB}min` : `${h}${NB}h`) : `${r}${NB}min`;
      };
      expect(fakt('miasto:droga', 'szukanie-1')).toBe(czas(czasWyprawyMin(0, 1)));
      expect(fakt('miasto:droga', 'szukanie-3')).toBe(czas(czasWyprawyMin(0, 3)));
      for (const odl of [PROMIEN_MAPY_LOKALNEJ, BLISKO_DO_M, MAX_OKOLICA_M, 1500, MAX_DROGA_M])
        expect(fakt('miasto:droga', `wyprawa-${odl}`), `${odl}`).toContain(czas(czasWyprawyMin(odl, 3)));

      const [niepewnie, grozno] = progiRyzyka();
      expect(fakt('miasto:ryzyko', 'prog-niepewnie')).toBe(liczba(niepewnie, lang));
      expect(fakt('miasto:ryzyko', 'prog-grozno')).toBe(liczba(grozno, lang));
      expect(fakt('miasto:ryzyko', 'wskazowka-ryzyko')).toBe(liczba(WSKAZOWKA_RYZYKO, lang));
      expect(fakt('miasto:ryzyko', 'wskazowka-lup')).toBe(liczba(WSKAZOWKA_LUP, lang));
      for (const kat of KATEGORIE_MIEJSC.filter((k) => !BEZ_PUNKTOW.has(k)))
        expect(fakt('miasto:ryzyko', `bazowe-${kat}`), kat).toBe(liczba(POICAT[kat].risk, lang));

      expect(fakt('miasto:lup', 'skala')).toBe(liczba(SKALA_LUPU, lang));
      expect(fakt('miasto:lup', 'puste')).toBe(pc(PUSTE_MIEJSCA));
      expect(fakt('miasto:lup', 'zapas')).toBe(`${ZAPAS_MNOZNIK_OD}–${ZAPAS_MNOZNIK_OD + ZAPAS_MNOZNIK_ROZSTEP}`);
      expect(fakt('miasto:lup', 'zapas-max')).toBe(`${ZAPAS_MAX}`);
    });

  it('progi ryzyka słowem to 0,15 i 0,3', () => {
    expect(progiRyzyka()).toEqual([0.15, 0.3]);
    expect(tr(ryzykoSlowem(0.14))).toBe('spokojnie');
    expect(tr(ryzykoSlowem(0.15))).toBe('niepewnie');
    expect(tr(ryzykoSlowem(0.3))).toBe('groźnie');
  });

  it('czas wyprawy: droga razy 1,4 przy 3 km/h plus przeszukanie od 3 godzin do godziny', () => {
    expect(czasWyprawyMin(0, 1)).toBe(PRZESZUKANIE_MIN);
    expect(czasWyprawyMin(0, 2)).toBe(PRZESZUKANIE_MIN - PRZESZUKANIE_KROK_MIN);
    expect(czasWyprawyMin(0, 3)).toBe(PRZESZUKANIE_NAJKROCEJ_MIN);
    expect(czasWyprawyMin(0, 9)).toBe(PRZESZUKANIE_NAJKROCEJ_MIN);
    expect(czasWyprawyMin(1000, 3) - czasWyprawyMin(0, 3)).toBe(
      Math.round((2 * 1000 * KRZYWIZNA_ULIC) / METROW_NA_MIN),
    );
    expect(METROW_NA_MIN * 60).toBe(3000);
  });

  it('wyprawa, która wróciłaby po 20:00, wraca o 6:00 następnego dnia', () => {
    const wyjscie = 12 * 60;
    expect(powrotMin(wyjscie, 100, 3)).toBe(wyjscie + czasWyprawyMin(100, 3));
    expect(powrotMin(16 * 60, 4000, 1)).toBe(24 * 60 + MORNING * 60);
  });
});

describe('zdania z gry', () => {
  it('odmowy wysłania wyprawy dziennej to zdania z powodOdmowy', () => {
    const st = newGov(1);
    wlaczMiasto(st);
    const cel = (odl: number) => ({ ...celZMiejsca(miejsce('sklep', odl)), zapas: 10 });
    const odczyt = (hour: number) => ({ hour }) as unknown as GovInput;
    const zr = powodyOdmowy();
    expect(zr.noc).toBe(tr(powodOdmowy(st, odczyt(CARD_HOUR), cel(500))!));
    expect(zr.noc).toBe(tr(powodOdmowy(st, odczyt(MORNING - 1), cel(500))!));
    expect(powodOdmowy(st, odczyt(MORNING), cel(500))).toBeNull();
    expect(powodOdmowy(st, odczyt(CARD_HOUR - 1), cel(500))).toBeNull();
    expect(zr.daleko).toBe(tr(powodOdmowy(st, odczyt(12), cel(MAX_DROGA_M + 1))!));
    expect(powodOdmowy(st, odczyt(12), cel(MAX_DROGA_M))).toBeNull();
    expect(zr.cna).toBe(tr(powodOdmowy(st, odczyt(12), { ...cel(500), zapas: 0 })!));
    expect(zr.osiedle).toBe(tr(powodOdmowy(st, odczyt(12), cel(PROMIEN_MAPY_LOKALNEJ))!));
    expect(powodOdmowy(st, odczyt(12), cel(PROMIEN_MAPY_LOKALNEJ + 1))).toBeNull();
    const a = tekstArtykulu(artykul('miasto:dzienna', kontekst('blok'))!);
    for (const z of [zr.noc, zr.daleko, zr.cna, zr.osiedle]) expect(a).toContain(`„${z}”`);
    ustawJezyk('en');
    const en = powodyOdmowy();
    const aEn = tekstArtykulu(artykul('miasto:dzienna', kontekst('blok'))!);
    for (const z of [en.noc, en.daleko, en.cna, en.osiedle]) expect(aEn).toContain(`“${z}”`);
  });

  it('karta miejsca ma linię „Zwykle jest tu: …”, taką jak cytuje artykuł o kategorii', () => {
    const st = newGov(1);
    wlaczMiasto(st);
    const i = { ...new Atrapa(1).input() };
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      for (const kat of KATEGORIE_MIEJSC) {
        const karta = kartaMiejsca(miejsce(kat, 400), st, i);
        const linia = karta.linie
          .map((t) => tr(t))
          .find((t) => t.startsWith(lang === 'pl' ? 'Zwykle jest tu' : 'Usually here'))!;
        const [otwarcie, zamkniecie] = lang === 'pl' ? ['„', '”'] : ['“', '”'];
        expect(tekstArtykulu(artykul(`miejsce:${kat}`, kontekst('blok'))!), kat).toContain(
          `${otwarcie}${linia}${zamkniecie}`,
        );
      }
    }
  });

  it('etykiety okna i przycisków: Mapa miasta, Wyślij wyprawę, klawisz M, karta nocy', () => {
    expect(mapaMiastaSheet(false).title).toBe('Mapa miasta');
    const btn = STATYCZNE.find((x) => x.sel === '#btnMiasto');
    expect(btn?.aria?.pl).toBe('Mapa miasta');
    expect(btn?.aria?.en).toBe('City map');
    const html = zrodlo('index.html');
    expect(html).toMatch(/id="btnMiasto"[^>]*aria-keyshortcuts="M"/);
    expect(zrodlo('src/ui/miasto.ts')).toContain("L('Wyślij wyprawę', 'Send a supply run')");
    const noc = zrodlo('src/gov/noc.ts');
    expect(noc).toMatch(/`Wyprawa \$\{t\.range\}: /);
    expect(noc).toContain("'Long run' : 'Short run'");
    const a = tekstArtykulu(artykul('miasto:nocna', kontekst('blok'))!);
    expect(a).toContain('„Wyprawa blisko”');
    expect(a).toContain('„Wyprawa daleko”');
  });
});

describe('zachowania, na których stoją artykuły', () => {
  const atr = (okolica: Miejsce[], over: Partial<GovInput> = {}) => {
    const a = new Atrapa(1);
    a.okolica = okolica;
    return { ...a.input(), ...over };
  };

  it('karta nocy: blisko to najbliższe miejsce spoza mapy osiedla do 300 m, daleko inne z największym brakiem', () => {
    const st = newGov(1);
    wlaczMiasto(st);
    const w = wybierzCeleNocy(
      st,
      atr([
        miejsce('sklep', 100), // na mapie osiedla: nigdy nie jest propozycją
        miejsce('sklep', 250),
        miejsce('bank', 400),
        miejsce('apteka', 600),
        miejsce('sklep', MAX_OKOLICA_M + 50), // poza zasięgiem propozycji
      ]),
    );
    expect(w[0].odl).toBe(250);
    expect(w[0].range).toBe('blisko');
    expect(w[1].range).toBe('daleko');
    expect(w[1].odl).toBeLessThanOrEqual(MAX_OKOLICA_M);
    expect(w[1].odl).toBeGreaterThan(w[0].odl);
    expect([400, 600]).toContain(w[1].odl);
  });

  it('bez miejsc do zaproponowania (albo bez mapy miasta) karta nocy proponuje zmyślone cele z TARGETS', () => {
    const st = newGov(1);
    wlaczMiasto(st);
    const z = wybierzCeleNocy(st, atr([miejsce('sklep', 100)]));
    expect(z[0].kat).toBeNull();
    expect(z[1].kat).toBeNull();
    expect(TARGETS.some((t) => t.id === z[0].klucz)).toBe(true);
    const bez = newGov(1);
    expect(wybierzCeleNocy(bez, atr([miejsce('sklep', 250)]))[0].kat).toBeNull();
    // zmyślone cele nie mają końca zapasu
    expect(z[0].zapas).toBeNull();
  });

  it('powrót z karty nocy: do 300 m o 1:00, dalej o 5:00', () => {
    expect(celZMiejsca(miejsce('sklep', BLISKO_DO_M)).powrot).toBe(1);
    expect(celZMiejsca(miejsce('sklep', BLISKO_DO_M + 1)).powrot).toBe(5);
    expect(celZMiejsca(miejsce('sklep', BLISKO_DO_M)).range).toBe('blisko');
    expect(celZMiejsca(miejsce('sklep', BLISKO_DO_M + 1)).range).toBe('daleko');
  });

  it('ryzyko miejsca rośnie z odległością, a stan zapasu jest ten sam u każdego gracza', () => {
    for (const kat of KATEGORIE_MIEJSC) {
      expect(celKategorii(kat, 1000).ryzyko, kat).toBeGreaterThan(celKategorii(kat, 100).ryzyko);
      expect(celKategorii(kat, 100).zapas, kat).toBe(celKategorii(kat, 100).zapas);
    }
    const zapasy = new Set(
      Array.from({ length: 80 }, (_, k) => celZMiejsca({ ...miejsce('sklep', 200), klucz: `poi:${k}:7` }).zapas),
    );
    expect(zapasy.has(0)).toBe(true);
    expect(Math.max(...[...zapasy].map((z) => z ?? 0))).toBeLessThanOrEqual(ZAPAS_MAX);
  });

  type Zmiany = Omit<Partial<GovPerson>, 'needs'> & { needs?: Partial<GovPerson['needs']> };
  const osoba = (over: Zmiany = {}): GovPerson => {
    const baza = new Atrapa(2).input().people[0];
    return { ...baza, ...over, needs: { ...baza.needs, rest: 80, health: 100, ...over.needs } };
  };
  const cel = { ...celKategorii('sklep', 400), klucz: 'poi:test:ryzyko' };

  it('ryzyko osoby: zmęczony, ranny i tchórz bardziej, odważny, z obroną, z bronią i w grupie mniej, w zombie więcej', () => {
    const st = newGov(1);
    const zwykla = expRisk(st, osoba(), cel);
    expect(expRisk(st, osoba({ needs: { rest: 20 } }), cel)).toBeGreaterThan(zwykla);
    expect(expRisk(st, osoba({ needs: { health: 40 } }), cel)).toBeGreaterThan(zwykla);
    expect(expRisk(st, osoba({ traits: ['tchorz'] }), cel)).toBeGreaterThan(zwykla);
    expect(expRisk(st, osoba({ traits: ['odwazny'] }), cel)).toBeLessThan(zwykla);
    expect(expRisk(st, osoba({ skills: { obrona: 3 } }), cel)).toBeLessThan(zwykla);
    expect(expRisk(st, osoba({ arm: 'palna' }), cel)).toBeLessThan(zwykla);
    expect(expRisk(st, osoba({ arm: 'wrecz' }), cel)).toBeLessThan(zwykla);
    expect(expRisk(st, osoba(), cel, 3)).toBeLessThan(zwykla);
    expect(expRisk(newGov(1, 'zombie'), osoba(), cel)).toBeGreaterThan(zwykla);
    // ryzyko osoby nie wychodzi poza 2–90%
    expect(expRisk(st, osoba(), { ...cel, ryzyko: 50 })).toBe(0.9);
    expect(expRisk(st, osoba({ traits: ['odwazny'], skills: { obrona: 4 } }), { ...cel, ryzyko: 0 })).toBe(0.02);
  });

  it('wskazówka zmniejsza ryzyko i zwiększa łup tylko na jedną wyprawę', () => {
    const st = newGov(1);
    const bez = expRisk(st, osoba(), cel);
    st.wskazowki = { [cel.klucz]: {} } as never;
    expect(expRisk(st, osoba(), cel)).toBeCloseTo(round2(bez * WSKAZOWKA_RYZYKO), 1);
    expect(WSKAZOWKA_LUP).toBeGreaterThan(1);
  });

  /** rozlicza wyprawę na `n` osób na kolejnych ziarnach, aż trafi się wynik bez kłopotów albo z kłopotami */
  function lup(n: number, klopoty: boolean, ryzyko: number): number {
    const celStaly = {
      ...celKategorii('sklep', 200),
      klucz: 'poi:test:lup',
      zapas: 1000,
      ryzyko,
      lup: { supplies: [5, 5] as [number, number] },
    };
    for (let seed = 1; seed < 400; seed++) {
      const st = newGov(seed);
      const ludzie = Array.from({ length: n }, (_, k) => osoba({ id: `t${k}` }));
      const i = { ...new Atrapa(seed).input(), people: ludzie };
      const fx = emptyEffects();
      const r = rozliczWyprawe(st, i, fx, celStaly, ludzie);
      if (!!r.hurt === klopoty) return r.loot.supplies;
    }
    throw new Error('brak ziarna');
  }

  it('łup: grupa przynosi więcej niż jedna osoba (60%), kłopoty obcinają łup o połowę', () => {
    expect(lup(1, false, 0.02)).toBe(5);
    expect(lup(2, false, 0.02)).toBe(8);
    expect(lup(1, true, 0.9)).toBe(2);
    expect(lup(2, true, 0.9)).toBe(4);
  });

  it('udźwig: wyprawa nie przyniesie więcej niż UDZWIG_NA_OSOBE sztuk na osobę', () => {
    const celBogaty = {
      ...celKategorii('sklep', 200),
      klucz: 'poi:test:udzwig',
      zapas: 1000,
      ryzyko: 0.02,
      lup: { supplies: [50, 50] as [number, number] },
    };
    let przyniesione = -1;
    for (let seed = 1; seed < 400 && przyniesione < 0; seed++) {
      const st = newGov(seed);
      const ludzie = [osoba({ id: 'u0' }), osoba({ id: 'u1' })];
      const i = { ...new Atrapa(seed).input(), people: ludzie };
      const r = rozliczWyprawe(st, i, emptyEffects(), celBogaty, ludzie);
      if (!r.hurt) przyniesione = r.loot.supplies;
    }
    expect(przyniesione).toBe(2 * UDZWIG_NA_OSOBE);
  });

  it('wyprawa wyczerpuje miejsce: zabrane ubywa z zapasu', () => {
    const st = newGov(3);
    wlaczMiasto(st);
    const ludzie = [osoba({ id: 'z0' }), osoba({ id: 'z1' }), osoba({ id: 'z2' })];
    const i = { ...new Atrapa(3).input(), people: ludzie };
    const c = { ...celKategorii('spozywczy', 400), klucz: 'poi:test:zapas', zapas: 5 };
    const r = rozliczWyprawe(st, i, emptyEffects(), c, ludzie);
    expect(r.loot.supplies).toBeLessThanOrEqual(5);
    expect(st.miasto!.zabrano[c.klucz]).toBe(r.loot.supplies);
    expect(st.miasto!.wizyty[c.klucz]).toBe(1);
  });
});

describe('język i słownik miejsca', () => {
  for (const p of PRZYPADKI)
    it(`artykuły o mapie i wyprawach: ${p.opis}`, () => kontrolaTresci(p, 'miasto', ['Za Murem']));

  it('uwaga o trybie zombie jest przy artykułach o wyprawach, nocnych i o ryzyku', () => {
    for (const id of ['miasto:wyprawa', 'miasto:nocna', 'miasto:ryzyko']) {
      const zw = artykul(id, kontekst('blok', false, false))!;
      const zo = artykul(id, kontekst('blok', false, true))!;
      expect(zw.uwaga, id).toMatch(/^W trybie zombie /);
      expect(zo.uwaga, id).toMatch(/^Grasz w trybie zombie: /);
    }
    for (const id of ['miasto:mapa', 'miasto:dzienna', 'miasto:droga', 'miasto:lup', 'miejsce:apteka'])
      expect(artykul(id, kontekst('blok'))!.uwaga, id).toBeUndefined();
    ustawJezyk('en');
    expect(artykul('miasto:wyprawa', kontekst('blok'))!.uwaga).toMatch(/^In Zombie mode /);
  });

  it('cele zmyślone mają nazwy według miejsca: dom bez bloku i trzepaka', () => {
    const blok = artykul('miasto:nocna', kontekst('blok'))!.fakty.find((f) => f.id === 'cel-mieszkania')!;
    const dom = artykul('miasto:nocna', kontekst('dom'))!.fakty.find((f) => f.id === 'cel-mieszkania')!;
    expect(blok.k).toBe('Opuszczone mieszkania w bloku obok');
    expect(dom.k).toBe('Opuszczony dom obok');
    const garaze = artykul('miasto:nocna', kontekst('blok'))!.fakty.find((f) => f.id === 'cel-garaze')!;
    expect(garaze.k).toContain('trzepak');
  });

  it('tytuły po polsku i angielsku', () => {
    const c = kontekst('blok');
    expect(tytulArtykulu('miasto:wyprawa', c)).toBe('Wyprawy po łup');
    expect(tytulArtykulu('miejsce:apteka', c)).toBe('Apteka');
    expect(tytulArtykulu('miejsce:przychodnia', c)).toBe('Przychodnia');
    ustawJezyk('en');
    expect(tytulArtykulu('miasto:wyprawa', c)).toBe('Supply runs');
    expect(tytulArtykulu('miejsce:apteka', c)).toBe('Pharmacy');
    expect(tytulArtykulu('miejsce:ogrodnik', c)).toBe('Garden centre');
  });
});

describe('odnośniki i wyszukiwarka', () => {
  it('„Zobacz też” prowadzi do istniejących artykułów albo do kategorii 4–8 po stałych identyfikatorach', () => {
    expect(kontrolaOdnosnikow('miasto')).toBeGreaterThan(80);
  });

  it('wyszukiwarka znajduje wyprawy, mapę i kategorie po nazwie, po treści i bez ogonków', () => {
    const c = kontekst('blok');
    expect(szukaj('wyprawy', c)[0].id).toBe('miasto:wyprawa');
    expect(szukaj('apteka', c)[0].id).toBe('miejsce:apteka');
    expect(szukaj('mapa miasta', c)[0].id).toBe('miasto:mapa');
    expect(szukaj('ryzyko', c)[0].id).toBe('miasto:ryzyko');
    expect(szukaj('lek', c).map((x) => x.id)).toEqual(
      expect.arrayContaining(['miejsce:apteka', 'miejsce:przychodnia']),
    );
    ustawJezyk('en');
    expect(szukaj('supply runs', c)[0].id).toBe('miasto:wyprawa');
    expect(szukaj('pharmacy', c)[0].id).toBe('miejsce:apteka');
  });
});
