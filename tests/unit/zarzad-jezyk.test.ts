/* Zarząd w obu językach (docs/superpowers/specs/2026-10-18-angielski-design.md): wybór języka nie zmienia przebiegu
   zarządu ani symulacji, każde zdanie zarządu w stanie ma angielską wersję bez polskich słów (poza imionami i nazwą
   siedziby), a stary zapis z polskimi napisami wczytuje się i działa. */

import { afterEach, describe, expect, it } from 'vitest';
import { isTx, type Tx, ustawJezyk } from '../../src/core/jezyk.ts';
import type { GovState } from '../../src/gov/typy.ts';
import { LANCUCHY } from '../../src/gov/watki.ts';
import { loadGov, normalizujTeksty, pending, saveGov } from '../../src/gov/zarzad.ts';
import { Atrapa, at, run } from './gov-atrapa.ts';
import { playWithGov } from './gov-play.ts';
import { mockBlock } from './interior-mock.ts';
import { polskieSlowa } from './po-angielsku.ts';
import { nowySwiat, przejdz, SCEN, wejscie } from './watki-tresc-play.ts';

afterEach(() => ustawJezyk('pl'));

/** wszystkie teksty zarządu w stanie: kronika, raporty, linie na rano, karta nocy */
function texts(gov: GovState): Tx[] {
  const out: Tx[] = [...gov.log.map((l) => l.txt), ...gov.later.map((l) => l.line)];
  for (const r of gov.reports) out.push(...r.lines);
  const c = gov.night?.card;
  if (c) {
    out.push(c.chanceWord, c.forecast, c.advice, ...c.posts.map((p) => p.name));
    for (const p of c.people)
      for (const o of p.options) out.push(o.label, ...(o.why ? [o.why] : []), ...(o.note ? [o.note] : []));
  }
  return out;
}

describe('zarząd w obu językach', () => {
  it('zmiana języka w połowie gry nie zmienia przebiegu zarządu', () => {
    // polityka bez własnego losowania, bo dalszy ciąg przebiegu (start) zaczyna losowanie polityki od nowa
    for (const seed of [3, 8]) {
      const a = run(seed, 'zawsze-warta', at(4, 7));
      const half = run(seed, 'zawsze-warta', at(2, 12));
      ustawJezyk('en');
      const b = run(seed, 'zawsze-warta', at(4, 7), half);
      expect(saveGov(b.gov), `ziarno ${seed}`).toBe(saveGov(a.gov));
    }
  });

  it('symulacja z zarządem po angielsku daje ten sam skrót stanu', () => {
    const w = mockBlock();
    const pl = playWithGov(w, 4, 'zawsze-warta', 3);
    ustawJezyk('en');
    const en = playWithGov(w, 4, 'zawsze-warta', 3);
    expect(en.hash).toBe(pl.hash);
    expect(saveGov(en.gov)).toBe(saveGov(pl.gov));
  });

  it('każde zdanie zarządu ma angielską wersję bez polskich słów', () => {
    let n = 0;
    for (const seed of [1, 2, 5, 9]) {
      for (const policy of ['zawsze-warta', 'nigdy-warty', 'losowo'] as const) {
        // karta nocy otwarta (20:30) i noc po raporcie (dzień 4)
        for (const until of [at(2, 20, 30), at(4, 7)]) {
          const { gov, atr } = run(seed, policy, until);
          // imiona i polskie nazwy miejsc zostają po polsku (słowniczek); także osoby z początku gry, które potem
          // odeszły (kłótnia o grafik), bo kronika dalej o nich mówi
          const ludzie = [...atr.people, ...new Atrapa(seed).people];
          const names = [...ludzie.map((p) => p.name), ...ludzie.map((p) => p.first), 'Wilanów', 'Łódź'];
          for (const t of texts(gov)) {
            n++;
            expect(isTx(t), JSON.stringify(t)).toBe(true);
            if (!t.pl) continue;
            expect(t.en, t.pl).toBeTruthy();
            expect(polskieSlowa(t.en, names), `${t.pl} → ${t.en}`).toEqual([]);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it('każdy krok łańcuchów historii ma angielski tekst bez polskich słów w bloku i w domu, w obu trybach', () => {
    let n = 0;
    for (const l of LANCUCHY) {
      for (const sc of SCEN[l.id]) {
        const s = nowySwiat(l.id, sc.o);
        const ludzie = [...wejscie(s).people, ...(wejscie(s).lokatorzy ?? [])];
        const w = przejdz(l, s);
        // ludzie gości z końcowych światów i imiona z generatora zostają po polsku, nazwy miejsc z okolicy atrapy też
        const goscie = w.konce.flatMap((k) => Object.values(k.osobyWizyt).flat());
        const dozwolone = [...[...ludzie, ...goscie].flatMap((p) => [p.name, p.first]), 'Pod Różą', 'Zielony Kącik'];
        for (const t of w.teksty) {
          n++;
          expect(isTx(t.tx), `${t.krok} (${sc.nazwa})`).toBe(true);
          expect(t.tx.en, `${t.krok}: ${t.tx.pl}`).toBeTruthy();
          expect(polskieSlowa(t.tx.en, dozwolone), `${t.krok} (${sc.nazwa}): ${t.tx.pl} → ${t.tx.en}`).toEqual([]);
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it('język nie zmienia przebiegu łańcucha: te same ścieżki i ten sam stan zarządu po polsku i po angielsku', () => {
    for (const id of ['swiatlo', 'ostrzega', 'dobicie']) {
      const l = LANCUCHY.find((x) => x.id === id)!;
      const sc = SCEN[id][0];
      const pl = przejdz(l, nowySwiat(id, sc.o));
      ustawJezyk('en');
      const en = przejdz(l, nowySwiat(id, sc.o));
      ustawJezyk('pl');
      expect(en.sciezki, id).toEqual(pl.sciezki);
      expect(
        en.konce.map((k) => saveGov(k.gov)),
        id,
      ).toEqual(pl.konce.map((k) => saveGov(k.gov)));
    }
  });

  it('stary zapis z polskimi napisami: Tx po obu stronach i okna działają', () => {
    const { gov } = run(2, 'propozycja', at(1, 20, 30));
    expect(gov.night?.card).toBeTruthy();
    // zapis sprzed angielskiej wersji: wszędzie zwykłe polskie napisy
    const old = JSON.parse(saveGov(gov), (_k, v) => (isTx(v) ? v.pl : v)) as GovState;
    expect(typeof old.log[0].txt).toBe('string');
    expect(typeof old.night!.card.forecast).toBe('string');
    const st = loadGov(JSON.stringify(old));
    for (const t of texts(st)) {
      expect(isTx(t)).toBe(true);
      expect(t.en).toBe(t.pl);
    }
    expect(st.night!.card.forecast.pl).toBe(gov.night!.card.forecast.pl);
    // to samo w miejscu (start gry z zapisu w przeglądarce)
    const again = normalizujTeksty(JSON.parse(JSON.stringify(old)) as GovState);
    expect(saveGov(again)).toBe(saveGov(st));
    // nowy zapis przechodzi bez zmian
    expect(saveGov(normalizujTeksty(JSON.parse(saveGov(gov)) as GovState))).toBe(saveGov(gov));
    // karta jeszcze otwarta: okno pokazuje teksty ze starego zapisu
    st.night!.confirmed = false;
    const p = pending(st, run(2, 'propozycja', at(1, 20, 30)).atr.input());
    expect(p?.k).toBe('karta');
    if (p?.k === 'karta') expect(p.card.forecast.en).toBe(p.card.forecast.pl);
  });
});
