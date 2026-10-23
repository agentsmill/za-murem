/* Kamera za osobą z listy ludzi (`KameraZaOsoba` w src/ui/kameraListy.ts): lot do osoby po kliknięciu w chip, śledzenie po
   drugim kliknięciu i wszystko, co je kończy (gracz rusza kamerą, cudzy lot, osoba znika z mapy, brzeg mapy). Klasa dostaje
   kamerę i mapę osób przez interfejs, więc chodzi tu w Node na udawanym świecie, bez widoku i DOM. */

import { describe, expect, it } from 'vitest';
import { KameraZaOsoba, type WejscieKamery } from '../../src/ui/kameraListy.ts';

const T = 32;
/** środek postaci w pikselach świata: stopy osoby (x, y w kafelkach) i kamera trochę wyżej */
const srodek = (x: number, y: number) => ({ x: x * T, y: (y - 0.4) * T });

function swiat(start = { x: 0, y: 0, zoom: 1 }) {
  const kamera = { ...start };
  const osoby = new Map<number, { x: number; y: number }>();
  const stan = { lot: false, przerwano: 0, maxX: Number.POSITIVE_INFINITY };
  const o: WejscieKamery = {
    kamera,
    // przycięcie do mapy: kamera nie wyjedzie za maxX
    przytnij: () => {
      kamera.x = Math.min(kamera.x, stan.maxX);
    },
    kafelek: T,
    pozycja: (id) => osoby.get(id) ?? null,
    lotTrwa: () => stan.lot,
    przerwijLot: () => {
      stan.przerwano++;
      stan.lot = false;
    },
  };
  const k = new KameraZaOsoba(o);
  const klatki = (n: number, dt = 16) => {
    for (let i = 0; i < n; i++) k.krok(dt);
  };
  return { kamera, osoby, stan, k, klatki };
}

describe('lot do osoby po kliknięciu w chip', () => {
  it('kamera jedzie na środek postaci, bez zmiany przybliżenia, i na tym kończy', () => {
    const s = swiat({ x: 3000, y: -500, zoom: 1.3 });
    s.osoby.set(1, { x: 10, y: 20 });
    s.k.jedz(1, false);
    s.klatki(150);
    const cel = srodek(10, 20);
    expect(s.kamera.x).toBeCloseTo(cel.x, 5);
    expect(s.kamera.y).toBeCloseTo(cel.y, 5);
    expect(s.kamera.zoom).toBe(1.3);
    expect(s.k.cel).toBeNull();
    expect(s.k.sledzi).toBe(false);
  });

  it('na starcie przerywa lot kamery, który zaczął ktoś inny', () => {
    const s = swiat();
    s.osoby.set(1, { x: 5, y: 5 });
    s.stan.lot = true;
    s.k.jedz(1, false);
    expect(s.stan.przerwano).toBe(1);
  });

  it('do osoby, której nie ma na mapie (wyprawa), nie jedzie i niczego nie przerywa', () => {
    const s = swiat();
    s.k.jedz(7, true);
    expect(s.k.cel).toBeNull();
    expect(s.k.sledzi).toBe(false);
    expect(s.stan.przerwano).toBe(0);
    s.klatki(10);
    expect(s.kamera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('nie wisi, gdy brzeg mapy nie pozwala dojechać: lot kończy się przy brzegu', () => {
    const s = swiat();
    s.osoby.set(1, { x: 50, y: 4 });
    s.stan.maxX = 100;
    s.k.jedz(1, false);
    s.klatki(200);
    expect(s.kamera.x).toBe(100);
    expect(s.k.cel).toBeNull();
  });
});

describe('śledzenie osoby', () => {
  it('kamera idzie za osobą, która odchodzi, a śledzenie trwa', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    s.klatki(100);
    s.osoby.set(1, { x: 22, y: 5 });
    s.klatki(100);
    const cel = srodek(22, 5);
    expect(s.kamera.x).toBeCloseTo(cel.x, 3);
    expect(s.kamera.y).toBeCloseTo(cel.y, 3);
    expect(s.k.sledzi).toBe(true);
    expect(s.k.cel).toBe(1);
  });

  it('idąca osoba jest dogonioną: za kilkudziesięcioma pikselami drogi kamera nie zostaje daleko w tyle', () => {
    const s = swiat();
    s.osoby.set(1, { x: 0, y: 0 });
    s.k.jedz(1, true);
    s.klatki(60);
    // osoba idzie 1,5 kafelka na sekundę
    for (let i = 0; i < 120; i++) {
      const p = s.osoby.get(1)!;
      s.osoby.set(1, { x: p.x + (1.5 * 16) / 1000, y: p.y });
      s.k.krok(16);
    }
    const cel = srodek(s.osoby.get(1)!.x, 0);
    expect(Math.abs(s.kamera.x - cel.x)).toBeLessThan(12);
  });

  it('przeciągnięcie mapy (kamera gdzie indziej niż ją ustawiliśmy) kończy śledzenie i zostawia kamerę gdzie ją zostawił gracz', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    s.klatki(80);
    expect(s.k.sledzi).toBe(true);
    s.kamera.x += 200;
    const gdzie = s.kamera.x;
    s.k.krok(16);
    expect(s.k.sledzi).toBe(false);
    expect(s.k.cel).toBeNull();
    s.osoby.set(1, { x: 40, y: 10 });
    s.klatki(60);
    expect(s.kamera.x).toBe(gdzie);
  });

  it('przybliżenie kółkiem przesuwa środek kamery razem ze zmianą zoomu: śledzenie trwa, a kamera wraca do osoby', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    s.klatki(100);
    s.kamera.zoom = 1.6;
    s.kamera.x += 90;
    s.kamera.y -= 40;
    s.klatki(100);
    const cel = srodek(10, 10);
    expect(s.k.sledzi).toBe(true);
    expect(s.kamera.x).toBeCloseTo(cel.x, 3);
    expect(s.kamera.y).toBeCloseTo(cel.y, 3);
  });

  it('lot kamery z innego powodu (alarm, „Pokaż”) po naszym starcie kończy śledzenie', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    s.klatki(30);
    expect(s.k.sledzi).toBe(true);
    s.stan.lot = true;
    s.k.krok(16);
    expect(s.k.sledzi).toBe(false);
    expect(s.k.cel).toBeNull();
  });

  it('osoba znika z mapy (wyprawa, śmierć): śledzenie się kończy', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    s.klatki(30);
    expect(s.k.sledzi).toBe(true);
    s.osoby.delete(1);
    s.k.krok(16);
    expect(s.k.sledzi).toBe(false);
    expect(s.k.cel).toBeNull();
  });

  it('zatrzymaj kończy i lot, i śledzenie', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.k.jedz(1, true);
    expect(s.k.sledzi).toBe(true);
    s.k.zatrzymaj();
    expect(s.k.cel).toBeNull();
    expect(s.k.sledzi).toBe(false);
    s.klatki(30);
    expect(s.kamera).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('przejście na inną osobę przy włączonym śledzeniu: kamera jedzie do niej i dalej ją śledzi', () => {
    const s = swiat();
    s.osoby.set(1, { x: 10, y: 10 });
    s.osoby.set(2, { x: 60, y: 30 });
    s.k.jedz(1, true);
    s.klatki(100);
    s.k.jedz(2, s.k.sledzi);
    s.klatki(150);
    const cel = srodek(60, 30);
    expect(s.kamera.x).toBeCloseTo(cel.x, 3);
    expect(s.k.cel).toBe(2);
    expect(s.k.sledzi).toBe(true);
  });
});
