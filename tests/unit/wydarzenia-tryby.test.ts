/* Pule wydarzeń według trybu gry (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, punkt 1): karty, które
   opisują ludzi, których na mapie nie ma (handlarz, wędrowiec, uchodźcy, aktywiści, influencer, czynsz, krypto,
   obserwacja), nie przychodzą w trybie zombie, handlarz i wędrowiec w żadnym trybie, a „Ślady przy siatce” mają
   w trybie zombie własny wariant bez podbijania napadu szabrowników. */

import { describe, expect, it } from 'vitest';
import type { GovInput } from '../../src/gov/typy.ts';
import { emptyEffects } from '../../src/gov/wspolne.ts';
import { fitsMode, M1_EVENTS, makeHost } from '../../src/gov/wydarzenia.ts';
import { chooseEvent, newGov } from '../../src/gov/zarzad.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';
import { polskieSlowa } from './po-angielsku.ts';

const def = (id: string) => M1_EVENTS.find((e) => e.id === id)!;

/** karty zwykłego trybu: w zombie nie przychodzą (ludzie, których nie ma, i szabrownicy) */
const TYLKO_ZWYKLE = ['handlarz', 'czynsz', 'krypto', 'aktywisci', 'influencer', 'obserwacja', 'uchodzcy', 'slady'];

/** zarząd w danym trybie, wejście (podane dzień i godzina, dużo zapasów, atrapa z dziurami w siatce) i host */
function setup(mode: 'zwykly' | 'zombie', over: Partial<GovInput> = {}, seed = 1) {
  const gov = newGov(seed, mode);
  const atr = new Atrapa(seed);
  atr.supplies = 30;
  atr.woodSklad = 6;
  atr.scrap = 5;
  const i: GovInput = { ...atr.input(), day: 3, hour: 16, minute: 0, screen: 1000, kozaLit: true, ...over };
  const fx = emptyEffects();
  return { gov, i, fx, h: makeHost(gov, i, fx) };
}

describe('pule według trybu', () => {
  it('w trybie zombie pula nie ma kart zwykłego trybu', () => {
    for (const id of TYLKO_ZWYKLE) {
      expect(def(id), id).toBeTruthy();
      expect(fitsMode({ mode: 'zombie' }, def(id)), id).toBe(false);
    }
  });

  it('w zwykłym trybie karty zwykłego trybu zostają (poza handlarzem, który ma wagę 0)', () => {
    for (const id of TYLKO_ZWYKLE) expect(fitsMode({ mode: 'zwykly' }, def(id)), id).toBe(true);
    // stary zapis bez trybu to zwykły
    expect(fitsMode({}, def('czynsz'))).toBe(true);
    expect(fitsMode({}, def('slady_z'))).toBe(false);
  });

  it('reszta kart pasuje do obu trybów, ulica tylko do zwykłego', () => {
    for (const id of ['dym', 'halas', 'pies', 'dron', 'wedrowiec', 'lodowka']) {
      expect(fitsMode({ mode: 'zombie' }, def(id)), id).toBe(true);
      expect(fitsMode({ mode: 'zwykly' }, def(id)), id).toBe(true);
    }
    for (const id of ['jablka', 'kury', 'kosiarka', 'szopa', 'plot', 'panele', 'przychodnia']) {
      expect(fitsMode({ mode: 'zombie' }, def(id)), id).toBe(false);
      expect(fitsMode({ mode: 'zwykly' }, def(id)), id).toBe(true);
    }
  });

  it('handlarz i wedrowiec mają wagę 0 w obu trybach', () => {
    let n = 0;
    for (const mode of ['zwykly', 'zombie'] as const)
      for (const day of [2, 3, 4, 5])
        for (const hour of [8, 12, 16, 19, 22, 2])
          for (const id of ['handlarz', 'wedrowiec']) {
            const { h } = setup(mode, { day, hour });
            n++;
            expect(def(id).w(h), `${id} ${mode} dzień ${day} godz. ${hour}`).toBe(0);
          }
    expect(n).toBe(2 * 4 * 6 * 2);
  });

  it('spis z gov-atrapa: w zombie bez wykluczonych kart, slady_z tylko w zombie, handlarza i wędrowca nigdzie', () => {
    const widziane = { zombie: new Set<string>(), zwykly: new Set<string>() };
    for (const mode of ['zombie', 'zwykly'] as const)
      for (const seed of [1, 2, 3, 4, 5])
        for (const policy of ['propozycja', 'losowo'] as const) {
          const start = { gov: newGov(seed, mode), atr: new Atrapa(seed) };
          const { gov } = run(seed, policy, at(6, 0), start);
          for (const id of Object.keys(gov.ev.done)) widziane[mode].add(id);
        }
    // przebieg nie jest pusty: coś przychodziło w obu trybach
    expect(widziane.zombie.size).toBeGreaterThan(5);
    expect(widziane.zwykly.size).toBeGreaterThan(5);
    for (const id of TYLKO_ZWYKLE) expect(widziane.zombie.has(id), `zombie: ${id}`).toBe(false);
    for (const id of ['handlarz', 'wedrowiec']) {
      expect(widziane.zombie.has(id), `zombie: ${id}`).toBe(false);
      expect(widziane.zwykly.has(id), `zwykły: ${id}`).toBe(false);
    }
    // wariant zombie śladów przychodzi tylko w zombie (i tam da się go dostać)
    expect(widziane.zombie.has('slady_z')).toBe(true);
    expect(widziane.zwykly.has('slady_z')).toBe(false);
  });
});

describe('slady_z: ślady szwendaczy przy siatce', () => {
  it('jest w trybie zombie, w zwykłym go nie ma, a „Ślady przy siatce” odwrotnie', () => {
    expect(fitsMode({ mode: 'zombie' }, def('slady_z'))).toBe(true);
    expect(fitsMode({ mode: 'zwykly' }, def('slady_z'))).toBe(false);
    expect(fitsMode({ mode: 'zwykly' }, def('slady'))).toBe(true);
    expect(fitsMode({ mode: 'zombie' }, def('slady'))).toBe(false);
  });

  it('przychodzi pod tym samym warunkiem co slady: dziura w siatce i godzina od 15:00', () => {
    for (const hour of [9, 14, 15, 18]) {
      const { h } = setup('zombie', { hour });
      const { h: hz } = setup('zwykly', { hour });
      expect(def('slady_z').w(h), `godz. ${hour}`).toBe(def('slady').w(hz));
    }
    const bezDziur = setup('zombie', { hour: 17, fence: { holes: [], durability: 0.9 } });
    expect(def('slady_z').w(bezDziur.h)).toBe(0);
    expect(def('slady_z').when).toEqual(['dzien', 'wieczor']);
    expect(def('slady_z').first).toBe(def('slady').first);
    expect(def('slady_z').gap).toBe(def('slady').gap);
  });

  it('teksty po polsku i po angielsku, bez polskich słów w angielskim', () => {
    const { h } = setup('zombie');
    const e = def('slady_z');
    const d = e.make(h);
    expect(d).not.toBeNull();
    const teksty = [e.title(h, d), e.text(h, d), ...e.choices(h, d).map((c) => c.label)];
    expect(teksty).toHaveLength(2 + 2);
    for (const t of teksty) {
      expect(t.pl, t.en).toBeTruthy();
      expect(t.en, t.pl).toBeTruthy();
      expect(t.en, t.pl).not.toBe(t.pl);
      expect(polskieSlowa(t.en), `${t.pl} → ${t.en}`).toEqual([]);
    }
    expect(e.text(h, d).pl).toMatch(/szwendacze wydeptali ścieżkę w błocie/);
    expect(e.text(h, d).en).toMatch(/^Shamblers have worn a path/);
    expect(e.choices(h, d).map((c) => c.label.pl)).toEqual([
      'Załatać przed nocą (Złom 3)',
      'Postawić tam kogoś z dzidą na noc',
    ]);
  });

  it('żaden wybór nie podbija napadu; pierwszy łata dziurę za złom, drugi dodaje do obrony na noc', () => {
    // kontrola: w zwykłym trybie trzeci wybór „slady” (udawać) podbija napad, test wie, czego szuka
    const kontrola = setup('zwykly');
    kontrola.gov.ev.active = { id: 'slady', d: def('slady').make(kontrola.h) };
    const przed0 = kontrola.gov.tonight.boost;
    chooseEvent(kontrola.gov, kontrola.i, 2);
    expect(kontrola.gov.tonight.boost).not.toBe(przed0);

    const n = def('slady_z').choices(setup('zombie').h, { where: { pl: 'w siatce', en: 'in the fence' } }).length;
    expect(n).toBe(2);
    for (let k = 0; k < n; k++) {
      const { gov, i } = setup('zombie');
      gov.ev.active = { id: 'slady_z', d: def('slady_z').make(makeHost(gov, i, emptyEffects())) };
      const boost = gov.tonight.boost;
      const alert = gov.tonight.alert;
      const bonus = gov.tonight.bonus;
      const fx = chooseEvent(gov, i, k);
      expect(gov.tonight.boost, `wybór ${k}`).toBe(boost);
      expect(gov.tonight.alert, `wybór ${k}`).toBe(alert);
      if (k === 0) {
        expect(fx.stock.scrap).toBe(-3);
        expect(fx.patch).toBe(1);
        expect(gov.tonight.bonus).toBe(bonus);
      } else {
        expect(fx.stock.scrap).toBe(0);
        expect(fx.patch).toBe(0);
        expect(gov.tonight.bonus).toBe(bonus + 1);
      }
    }
  });
});
