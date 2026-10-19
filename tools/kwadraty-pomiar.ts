/* Dane kwadratów obok domu do pomiarów (tools/perf.ts, ?kwadraty=5x5): dema mają dane tylko ośmiu (Lanciego czterech)
   sąsiadów, a pomiar wydajności z 25 widocznymi kwadratami potrzebuje 24. Playwright podstawia pod adres
   demo/<klucz>-kwadraty.json plik z dysku uzupełniony brakującymi kwadratami: każdy brakujący powiela geo najbliższego
   kwadratu, który dane ma, z przesunięciem o różnicę środków kwadratów (w układzie nieobróconym geo, tym samym, w którym
   leżą współrzędne). To TYLKO narzędzie pomiaru: powielone kwadraty wyglądają jak powtórzenie wzoru i mają te same klucze
   budynków co oryginał, ale kosztują tyle samo co prawdziwe (liczba budynków, dróg i drzew jest prawdziwa). Gra niczego
   nie powiela. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { Geo, Pt } from '../src/world/geo.ts';
import { kluczKwadratu, srodekKwadratu, ukladZGeo, zKlucza } from '../src/world/kwadraty.ts';

const DEMO = path.resolve(import.meta.dirname, '../public/demo');

/** geo przesunięte o (dx, dy) metrów (wszystkie współrzędne; tagi i klucze bez zmian) */
export function przesunGeo(g: Geo, dx: number, dy: number): Geo {
  const p = ([x, y]: Pt): Pt => [x + dx, y + dy];
  return {
    ...g,
    b: g.b.map((b) => ({ ...b, p: b.p.map(p), ...(b.pp ? { pp: b.pp.map((r) => r.map(p)) } : {}) })),
    r: g.r.map((r) => ({ ...r, l: r.l.map(p) })),
    a: g.a.map((a) => ({ ...a, p: a.p.map(p) })),
    w: g.w.map((w) => ({ ...w, l: w.l.map(p) })),
    poi: g.poi.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })),
    ...(g.rodzaje ? { rodzaje: g.rodzaje.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) } : {}),
    ...(g.pass ? { pass: g.pass.map((r) => ({ ...r, l: r.l.map(p) })) } : {}),
  };
}

/** Dane kwadratów dema uzupełnione do wszystkich z listy `potrzebne` (zob. nagłówek): brakujące to powielone geo najbliższego
    kwadratu z danymi (odległość szachownicowa, remis: pierwszy z pliku) przesunięte o różnicę środków. */
export function uzupelnijKwadraty(klucz: string, potrzebne: readonly [number, number][]): Record<string, Geo> {
  const plik: Record<string, Geo> = JSON.parse(fs.readFileSync(path.join(DEMO, `${klucz}-kwadraty.json`), 'utf8'));
  const dom: { geo: Geo } = JSON.parse(fs.readFileSync(path.join(DEMO, `${klucz}.json`), 'utf8'));
  const uklad = ukladZGeo(dom.geo);
  const zrodla = Object.keys(plik).map(zKlucza);
  const out = { ...plik };
  for (const [sx, sy] of potrzebne) {
    const k = kluczKwadratu(sx, sy);
    if (out[k]) continue;
    const [zx, zy] = zrodla.reduce((naj, s) =>
      Math.max(Math.abs(s[0] - sx), Math.abs(s[1] - sy)) < Math.max(Math.abs(naj[0] - sx), Math.abs(naj[1] - sy))
        ? s
        : naj,
    );
    const [ax, ay] = srodekKwadratu(uklad, sx, sy);
    const [bx, by] = srodekKwadratu(uklad, zx, zy);
    out[k] = przesunGeo(plik[kluczKwadratu(zx, zy)], ax - bx, ay - by);
  }
  return out;
}

/** podstawia pod demo/<klucz>-kwadraty.json dane uzupełnione do `potrzebne` (przed page.goto) */
export async function podstawKwadraty(
  page: Page,
  klucz: string,
  potrzebne: readonly [number, number][],
): Promise<void> {
  const body = JSON.stringify(uzupelnijKwadraty(klucz, potrzebne));
  await page.route(`**/demo/${klucz}-kwadraty.json`, (r) => r.fulfill({ contentType: 'application/json', body }));
}
