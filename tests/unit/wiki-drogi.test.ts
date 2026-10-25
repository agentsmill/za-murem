/* Wiki, kategoria „Drogi do zwycięstwa” (src/ui/wiki-drogi.ts): pokrycie (każda droga z `DROGI` ma artykuł, jest ekran dróg
   i epilog), fakty zgodne z tabelami i stałymi gry (kamienie, progi, cel ludności, poranki, głód, zaufanie), zdania i
   napisy okien zgodne z grą (ekran dróg, epilog), kilka zachowań, na których stoją twierdzenia z artykułów, język
   angielski bez polskich słów, wariant domu bez słów z bloku i odnośniki „Zobacz też”. */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tr, ustawJezyk } from '../../src/core/jezyk.ts';
import type { GovInput } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { newGov, pending } from '../../src/gov/zarzad.ts';
import {
  CEL_BEZ_DANYCH,
  CEL_MAX,
  CEL_MIN,
  DNI_CELU,
  DROGI,
  type Droga,
  GLOD_PONIZEJ,
  krokZwyciestwa,
  nazwaDrogi,
  ocenDrogi,
  PORANEK,
  PROGI_LUDNOSCI,
  wlaczZwyciestwo,
  ZAUFANIE_OD,
} from '../../src/gov/zwyciestwo.ts';
import type { SimState } from '../../src/sim/sim.ts';
import { populacja } from '../../src/sim/snapshot.ts';
import { menuSheet } from '../../src/ui/okna.ts';
import { artykul, maArtykul, rejestr, szukaj, tytulArtykulu } from '../../src/ui/wiki.ts';
import { DROGI_KOLEJNOSC, doZdobycia, wiersz } from '../../src/ui/wiki-drogi.ts';
import { drogiSheet, epilogSheet } from '../../src/ui/zwyciestwo.ts';
import { Atrapa, TPH } from './gov-atrapa.ts';
import { kontrolaOdnosnikow, kontrolaTresci } from './wiki-kontrola.ts';
import { kontekst, PRZYPADKI, tekstArtykulu } from './wiki-pomoc.ts';

afterEach(() => ustawJezyk('pl'));

const DROGI_IDS = Object.keys(DROGI) as Droga[];
const moje = rejestr().filter((d) => d.kat === 'drogi');
const START = 15 * 60;

/** wejście zarządu z atrapy o danym dniu i godzinie gry (start gry to dzień 1, 15:00), z ludnością i odczytem badań */
function wejscie(day: number, hour: number, over: Partial<GovInput> = {}, atr = new Atrapa(1)): GovInput {
  atr.tick = Math.round((((day - 1) * 1440 + hour * 60 - START) * TPH) / 60);
  return { ...atr.input(), ...over };
}

/** napisy, które wolno zostawić po polsku w angielskim tekście: nazwy własne */
const WLASNE = ['Za Murem', 'Menu', 'Wiki'];

describe('pokrycie', () => {
  it('każda droga z DROGI ma artykuł, jest też ekran dróg i epilog', () => {
    for (const d of DROGI_IDS) expect(maArtykul(`drogi:${d}`), d).toBe(true);
    expect(maArtykul('drogi:ekran')).toBe(true);
    expect(maArtykul('drogi:epilog')).toBe(true);
    expect(moje.map((d) => d.id).sort()).toEqual(
      [...DROGI_IDS.map((d) => `drogi:${d}`), 'drogi:ekran', 'drogi:epilog'].sort(),
    );
  });

  it('wymagane identyfikatory istnieją', () => {
    for (const id of ['drogi:ekran', 'drogi:technologia']) expect(maArtykul(id), id).toBe(true);
  });

  it('kolejność dróg w wiki to kolejność ekranu gry', () => {
    const st = newGov(1);
    wlaczZwyciestwo(st);
    expect(DROGI_KOLEJNOSC).toEqual(ocenDrogi(st, wejscie(1, 15)).map((p) => p.droga));
    expect([...DROGI_KOLEJNOSC].sort()).toEqual([...DROGI_IDS].sort());
  });
});

describe('fakty zgodne z tabelami gry', () => {
  for (const lang of ['pl', 'en'] as const)
    for (const zombie of [false, true])
      it(`kamienie i tytuły: ${lang}, ${zombie ? 'zombie' : 'zwykła gra'}`, () => {
        ustawJezyk(lang);
        const c = kontekst('blok', false, zombie);
        for (const d of DROGI_IDS) {
          const a = artykul(`drogi:${d}`, c)!;
          expect(a.tytul, d).toBe(tr(nazwaDrogi(d, zombie ? 'zombie' : 'zwykly')));
          DROGI[d].kamienie.forEach((k, i) => {
            const f = a.fakty.find((x) => x.id === `kamien-${i + 1}`);
            expect(f?.v, `${d} ${i + 1}`).toBe(tr(k));
          });
          expect(a.fakty.filter((x) => x.id.startsWith('kamien-')).length).toBe(DROGI[d].kamienie.length);
        }
      });

  it('do zdobycia teraz: tyle kamieni, przy ilu gra podaje „co dalej”', () => {
    const c = kontekst('blok');
    for (const d of DROGI_IDS) {
      const st = newGov(1);
      wlaczZwyciestwo(st);
      let ile = 0;
      for (let k = 0; k < DROGI[d].kamienie.length; k++) {
        st.zwyciestwo!.kamienie[d] = k;
        const w = ocenDrogi(st, {
          ...wejscie(1, 15),
          badania: { pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false },
        }).find((p) => p.droga === d)!;
        if (!w.dalej) break;
        ile++;
      }
      expect(doZdobycia(c, d), d).toBe(ile);
      const f = artykul(`drogi:${d}`, c)!.fakty.find((x) => x.id === 'teraz')!;
      expect(f.v).toBe(`${ile} z ${DROGI[d].kamienie.length}`);
    }
  });

  it('co gra uważa dziś za osiągalne: ludność całkiem, technologia dwa pierwsze, teren jeden, lek i cuda nic', () => {
    // pilnuje, żeby zmiana w grze (odblokowanie kamieni) trafiła też do opisu w artykułach
    const c = kontekst('blok');
    expect(doZdobycia(c, 'ludnosc')).toBe(DROGI.ludnosc.kamienie.length);
    expect(doZdobycia(c, 'technologia')).toBe(2);
    expect(doZdobycia(c, 'teren')).toBe(1);
    expect(doZdobycia(c, 'lek')).toBe(0);
    expect(doZdobycia(c, 'cuda')).toBe(0);
  });

  it('droga ludności: progi, cel, poranki, głód i zaufanie są stałymi gry', () => {
    const f = (zombie: boolean, id: string) =>
      artykul('drogi:ludnosc', kontekst('blok', false, zombie))!.fakty.find((x) => x.id === id)?.v;
    expect(f(false, 'progi')).toBe(PROGI_LUDNOSCI.map((p) => `${p} osób`).join(', '));
    expect(f(false, 'cel-zwykly')).toBe(`${CEL_MIN}–${CEL_MAX} osób`);
    expect(f(false, 'cel-zombie')).toBe(`${Math.round(CEL_MIN / 2)}–${Math.round(CEL_MAX / 2)} osób`);
    expect(f(false, 'cel-bez-danych')).toBe(`${CEL_BEZ_DANYCH} (zombie ${Math.round(CEL_BEZ_DANYCH / 2)})`);
    expect(f(false, 'seria')).toBe(`${DNI_CELU}`);
    expect(f(false, 'poranek')).toBe(`${PORANEK}:00`);
    expect(f(false, 'glod')).toBe(`${GLOD_PONIZEJ}`);
    expect(f(false, 'zaufanie')).toBe(`${ZAUFANIE_OD}`);
    ustawJezyk('en');
    expect(f(false, 'progi')).toBe(PROGI_LUDNOSCI.map((p) => `${p} people`).join(', '));
  });

  it('ekran dróg: tyle dróg, ile ich jest, z liczbą kamieni każdej', () => {
    const c = kontekst('blok');
    const a = artykul('drogi:ekran', c)!;
    expect(a.fakty.find((x) => x.id === 'liczba')?.v).toBe(`${DROGI_IDS.length}`);
    for (const d of DROGI_IDS) {
      const f = a.fakty.find((x) => x.id === `droga-${d}`)!;
      expect(f.k).toBe(tr(nazwaDrogi(d, 'zwykly')));
      expect(f.v).toContain(`${DROGI[d].kamienie.length} `);
    }
  });
});

describe('zdania zgodne z grą', () => {
  it('ekran dróg wymienia drogi w kolejności ekranu, nazwami z gry', () => {
    const a = artykul('drogi:ekran', kontekst('blok'))!;
    const st = newGov(1);
    wlaczZwyciestwo(st);
    const nazwy = ocenDrogi(st, wejscie(1, 15)).map((p) => tr(p.nazwa));
    let od = 0;
    for (const n of nazwy) {
      const gdzie = a.zdania[0].indexOf(`„${n}”`, od);
      expect(gdzie, n).toBeGreaterThanOrEqual(od);
      od = gdzie;
    }
  });

  it('„Wkrótce” i „co dalej” w artykułach to zdania z ocenDrogi', () => {
    for (const lang of ['pl', 'en'] as const) {
      ustawJezyk(lang);
      const st = newGov(1);
      wlaczZwyciestwo(st);
      const i = {
        ...wejscie(1, 15),
        badania: { pracownia: false, zbadane: 0, era: 0, koncowa: false, siecWlaczona: false },
      };
      const zero = ocenDrogi(st, i);
      const c = kontekst('blok');
      for (const d of ['lek', 'cuda'] as const)
        expect(tekstArtykulu(artykul(`drogi:${d}`, c)!), d).toContain(tr(zero.find((p) => p.droga === d)!.wkrotce));
      const tech = tekstArtykulu(artykul('drogi:technologia', c)!);
      expect(tech).toContain(tr(zero.find((p) => p.droga === 'technologia')!.dalej));
      st.zwyciestwo!.kamienie.technologia = 1;
      expect(tech).toContain(tr(ocenDrogi(st, i).find((p) => p.droga === 'technologia')!.dalej));
      st.zwyciestwo!.kamienie.technologia = 2;
      expect(tech).toContain(tr(ocenDrogi(st, i).find((p) => p.droga === 'technologia')!.wkrotce));
      expect(tekstArtykulu(artykul('drogi:teren', c)!)).toContain(tr(zero.find((p) => p.droga === 'teren')!.dalej));
    }
  });

  it('teren mówi też o płocie przez jezdnię, gdy płot nie dosięga żadnego sąsiada', () => {
    const c = kontekst('blok');
    const st = newGov(1);
    wlaczZwyciestwo(st);
    const bezSasiada = ocenDrogi(st, { ...wejscie(1, 15), teren: { przylaczone: 0, mozliwe: 0 } }).find(
      (p) => p.droga === 'teren',
    )!;
    expect(tekstArtykulu(artykul('drogi:teren', c)!)).toContain(tr(bezSasiada.wkrotce));
    expect(wiersz(c, 'teren', 0).dalej).not.toBeNull();
  });

  it('pierwsze zdanie „co dalej” technologii mówi słowami miejsca: dom to „waszego domu”', () => {
    const blok = tekstArtykulu(artykul('drogi:technologia', kontekst('blok'))!);
    const dom = tekstArtykulu(artykul('drogi:technologia', kontekst('dom'))!);
    expect(blok).toContain('waszego mieszkania');
    expect(dom).toContain('waszego domu');
    expect(dom).not.toContain('mieszkania');
  });

  it('napisy okien z gry: Menu, ekran dróg, przyciski i liczby epilogu', () => {
    const menu = menuSheet('').body;
    expect(menu).toContain('Drogi do zwycięstwa');
    const ekran = drogiSheet([]);
    expect(ekran.title).toBe('Drogi do zwycięstwa');
    expect(ekran.foot).toContain('Wróć');
    const html = fs.readFileSync(path.resolve(import.meta.dirname, '../../index.html'), 'utf8');
    expect(html).toMatch(/id="btnMenu"[^>]*>Menu</);

    const staty = { dzien: 12, ludzi: 40, zmarli: 3, uchwaly: 2 };
    const epilog = epilogSheet('ludnosc', null, 'zwykly', staty);
    for (const s of ['Graj dalej', 'Nowa gra']) expect(epilog.foot).toContain(s);
    for (const s of ['Dzień', 'Ludzi', 'Zmarli', 'Uchwały']) expect(epilog.body).toContain(s);
    const a = tekstArtykulu(artykul('drogi:epilog', kontekst('blok'))!);
    for (const s of ['Graj dalej', 'Nowa gra']) expect(a).toContain(`„${s}”`);

    ustawJezyk('en');
    const en = epilogSheet('ludnosc', null, 'zwykly', staty);
    const aen = tekstArtykulu(artykul('drogi:epilog', kontekst('blok'))!);
    for (const s of ['Keep playing', 'New game']) {
      expect(en.foot).toContain(s);
      expect(aen).toContain(`“${s}”`);
    }
  });

  it('epilog: zdanie o ścieżce ma trzy odmiany i neutralną, fabryka zależy od trybu', () => {
    const staty = { dzien: 12, ludzi: 40, zmarli: 3, uchwaly: 2 };
    const zdania = (p: 'porzadek' | 'wspolnota' | 'tech' | null) =>
      /<p class="zw-sciezka">(.*?)<\/p>/.exec(epilogSheet('ludnosc', p, 'zwykly', staty).body)![1];
    expect(new Set([zdania('porzadek'), zdania('wspolnota'), zdania('tech'), zdania(null)]).size).toBe(4);
    expect(epilogSheet('technologia', null, 'zwykly', staty).body).toContain('Bioroboty');
    expect(epilogSheet('technologia', null, 'zombie', staty).body).toContain('Humanoidalni żołnierze');
    const zw = tekstArtykulu(artykul('drogi:technologia', kontekst('blok', false, false))!);
    const zo = tekstArtykulu(artykul('drogi:technologia', kontekst('blok', false, true))!);
    expect(zw).toContain('bioroboty');
    expect(zo).toContain('humanoidalnych żołnierzy');
    expect(epilogSheet('lek', null, 'zombie', staty).title).toBe('Lek');
    expect(tekstArtykulu(artykul('drogi:epilog', kontekst('blok', false, true))!)).toContain('„Lek”');
  });
});

describe('zachowania, na których stoją artykuły', () => {
  it('progi kamieni ludności to PROGI_LUDNOSCI, a „połowa celu” następuje po nich', () => {
    const kamienie = (n: number) => {
      const st = newGov(1);
      wlaczZwyciestwo(st);
      krokZwyciestwa(st, wejscie(1, 15, { ludnosc: n, ludnosc2021: 800 }), emptyEffects());
      return st.zwyciestwo!.kamienie.ludnosc ?? 0;
    };
    PROGI_LUDNOSCI.forEach((p, k) => {
      expect(kamienie(p - 1), `przed ${p}`).toBe(k);
      expect(kamienie(p), `od ${p}`).toBe(k + 1);
    });
    // cel 400 (połowa z 800): czwarty kamień od 200
    expect(kamienie(199)).toBe(PROGI_LUDNOSCI.length);
    expect(kamienie(200)).toBe(PROGI_LUDNOSCI.length + 1);
  });

  it('poranek liczy się od PORANEK, przy zaufaniu co najmniej ZAUFANIE_OD i jedzeniu od GLOD_PONIZEJ', () => {
    const seria = (opcje: { hour?: number; trust?: number; food?: number }) => {
      const st = newGov(1);
      wlaczZwyciestwo(st);
      st.trust = opcje.trust ?? ZAUFANIE_OD;
      const atr = new Atrapa(1);
      for (const p of atr.people) p.needs.food = opcje.food ?? GLOD_PONIZEJ;
      krokZwyciestwa(st, wejscie(2, opcje.hour ?? PORANEK, { ludnosc: 500, ludnosc2021: 800 }, atr), emptyEffects());
      return st.zwyciestwo!.dniCelu;
    };
    expect(seria({})).toBe(1);
    expect(seria({ hour: PORANEK - 1 })).toBe(0);
    expect(seria({ trust: ZAUFANIE_OD - 1 })).toBe(0);
    expect(seria({ food: GLOD_PONIZEJ - 1 })).toBe(0);
  });

  it('cel utrzymany DNI_CELU poranków wygrywa drogę i nie rusza zaufania, wkurzenia ani zapasów', () => {
    const st = newGov(1);
    wlaczZwyciestwo(st);
    st.trust = 70;
    const trust = st.trust;
    const anger = st.anger;
    const atr = new Atrapa(1);
    for (const p of atr.people) p.needs.food = 80;
    let dni = 0;
    for (let d = 2; d < 2 + DNI_CELU; d++) {
      const fx = emptyEffects();
      krokZwyciestwa(st, wejscie(d, PORANEK, { ludnosc: 500, ludnosc2021: 800 }, atr), fx);
      dni = st.zwyciestwo!.dniCelu;
      expect(
        Object.values(fx.stock).every((v) => v === 0),
        `dzień ${d}`,
      ).toBe(true);
    }
    expect(dni).toBe(DNI_CELU);
    expect(st.zwyciestwo!.wygrane.map((w) => w.droga)).toContain('ludnosc');
    expect(pending(st, wejscie(2 + DNI_CELU, 7))).toEqual({ k: 'zwyciestwo', droga: 'ludnosc' });
    expect(st.trust).toBe(trust);
    expect(st.anger).toBe(anger);
  });

  it('kamień raz zaliczony zostaje, gdy ludzi ubywa', () => {
    const st = newGov(1);
    wlaczZwyciestwo(st);
    krokZwyciestwa(st, wejscie(1, 15, { ludnosc: 30, ludnosc2021: 800 }), emptyEffects());
    expect(st.zwyciestwo!.kamienie.ludnosc).toBe(2);
    krokZwyciestwa(st, wejscie(1, 16, { ludnosc: 0, ludnosc2021: 800 }), emptyEffects());
    expect(st.zwyciestwo!.kamienie.ludnosc).toBe(2);
  });

  it('ludność to zarząd i mieszkańcy siedziby, bez sąsiadów, wędrowców i handlarza', () => {
    const pawn = (kind: string, extra: object = {}) => ({ kind, ...extra });
    const st = {
      pawns: [
        pawn('core'),
        pawn('core', { away: true }),
        pawn('resident'),
        pawn('sasiad'),
        pawn('wedrowiec'),
        pawn('handlarz'),
        pawn('szabrownik'),
        pawn('zombie'),
      ],
    } as unknown as SimState;
    expect(populacja(st)).toEqual({ zarzad: 2, mieszkancy: 1, razem: 3 });
  });
});

describe('język i słownik miejsca', () => {
  for (const p of PRZYPADKI) it(`artykuły dróg: ${p.opis}`, () => kontrolaTresci(p, 'drogi', WLASNE));

  it('tryb zombie zmienia nazwę drogi leku w tytule i w epilogu', () => {
    const c = kontekst('blok', false, true);
    expect(tytulArtykulu('drogi:lek', c)).toBe('Lek');
    expect(tytulArtykulu('drogi:lek', kontekst('blok'))).toBe('Wyłącznik z pakietu premium');
    ustawJezyk('en');
    expect(tytulArtykulu('drogi:lek', c)).toBe('The cure');
    expect(tytulArtykulu('drogi:lek', kontekst('blok'))).toBe('The premium-tier kill switch');
  });

  it('uwaga o trybie jest w obu trybach, o drugim trybie mówi tylko, gdy nie grasz w zombie', () => {
    for (const id of ['drogi:ludnosc', 'drogi:technologia']) {
      const zw = artykul(id, kontekst('blok', false, false))!;
      const zo = artykul(id, kontekst('blok', false, true))!;
      expect(zw.uwaga, id).toBeTruthy();
      expect(zo.uwaga, id).toBeTruthy();
      expect(zo.uwaga).toContain('Grasz w trybie zombie');
      expect(zw.uwaga).not.toContain('Grasz w trybie zombie');
    }
  });
});

describe('odnośniki i wyszukiwarka', () => {
  it('„Zobacz też” prowadzi do istniejących artykułów albo do kategorii 4–8 po stałych identyfikatorach', () => {
    expect(kontrolaOdnosnikow('drogi')).toBeGreaterThan(20);
  });

  it('wyszukiwarka znajduje drogi po nazwie, po treści i bez ogonków', () => {
    const c = kontekst('blok');
    expect(szukaj('Prąd bez miedzi', c)[0].id).toBe('drogi:technologia');
    expect(szukaj('kamienie milowe', c).map((x) => x.id)).toContain('drogi:ekran');
    expect(szukaj('graj dalej', c).map((x) => x.id)).toContain('drogi:epilog');
    expect(szukaj('nowe osiedle', c)[0].id).toBe('drogi:ludnosc');
    ustawJezyk('en');
    expect(szukaj('roads to victory', c).map((x) => x.id)).toContain('drogi:ekran');
  });
});
