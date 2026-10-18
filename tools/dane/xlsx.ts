/* Czytnik XLSX bez zależności: nazwy arkuszy i wartości komórek. XML czytany wyrażeniami regularnymi,
   bo pliki GUS mają regularną budowę, a sam arkusz obwodów to prawie 300 MB tekstu. Rozpakowuje tylko
   potrzebne pliki. Nie liczy formuł (bierze zapamiętaną wartość), nie rozróżnia dat od liczb i ignoruje formatowanie. */

import path from 'node:path';
import { wpisZip } from './zip.ts';

export type Komorka = string | number | null;

const ENCJE: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** &amp; &lt; &gt; &quot; &apos; oraz znaki numeryczne; jeden przebieg, więc &amp;lt; daje &lt;, nie <. */
function dekoduj(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) =>
    e[0] !== '#' ? ENCJE[e] : String.fromCodePoint(e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );
}

function plik(buf: Buffer, nazwa: string): string {
  const dane = wpisZip(buf, nazwa);
  if (!dane) throw new Error(`XLSX: brak pliku ${nazwa} w skoroszycie`);
  return dane.toString('utf8');
}

function atrybuty(s: string): Map<string, string> {
  const wynik = new Map<string, string>();
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) wynik.set(m[1], dekoduj(m[2]));
  return wynik;
}

/** Tekst z <si> albo <is>: sklejone wszystkie <t>, także z kawałków tekstu sformatowanego (<r>). */
function tekstZ(fragment: string): string {
  let s = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*[^>/])?>([\s\S]*?)<\/t>/g)) s += m[1];
  return dekoduj(s);
}

function wspolneCiagi(buf: Buffer): string[] {
  const dane = wpisZip(buf, 'xl/sharedStrings.xml');
  if (!dane) return []; // skoroszyt z samymi tekstami inline
  const wynik: string[] = [];
  for (const m of dane.toString('utf8').matchAll(/<si(?=[\s/>])[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    wynik.push(m[1] === undefined ? '' : tekstZ(m[1]));
  }
  return wynik;
}

/** Arkusze w kolejności kart: nazwa z workbook.xml, plik z workbook.xml.rels (ścieżka względem xl/ albo od korzenia). */
function spisArkuszy(buf: Buffer): { nazwa: string; plik: string }[] {
  const cele = new Map<string, string>();
  for (const m of plik(buf, 'xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
    const a = atrybuty(m[1]);
    const id = a.get('Id');
    const cel = a.get('Target');
    if (id && cel) cele.set(id, path.posix.normalize(cel.startsWith('/') ? cel.slice(1) : `xl/${cel}`));
  }
  const wynik: { nazwa: string; plik: string }[] = [];
  for (const m of plik(buf, 'xl/workbook.xml').matchAll(/<sheet\s([^>]*?)\/?>/g)) {
    const a = atrybuty(m[1]);
    const nazwa = a.get('name');
    const sciezka = cele.get(a.get('r:id') ?? '');
    if (nazwa === undefined || !sciezka) throw new Error(`XLSX: arkusz ${nazwa ?? '?'} bez pliku w relacjach`);
    wynik.push({ nazwa, plik: sciezka });
  }
  return wynik;
}

/** Nazwy arkuszy w kolejności kart. */
export function arkusze(buf: Buffer): string[] {
  return spisArkuszy(buf).map((a) => a.nazwa);
}

/** „AB” → 27 (numer kolumny od zera). */
function kolumna(litery: string): number {
  let k = 0;
  for (let i = 0; i < litery.length; i++) k = k * 26 + litery.charCodeAt(i) - 64;
  return k - 1;
}

function wartosc(typ: string | undefined, wnetrze: string, ciagi: string[], ref: string): Komorka {
  if (typ === 'inlineStr') return tekstZ(wnetrze);
  const v = /<v(?:\s[^>]*[^>/])?>([\s\S]*?)<\/v>/.exec(wnetrze)?.[1];
  if (v === undefined || v === '') return null; // komórka z samym stylem albo formułą bez zapamiętanej wartości
  switch (typ) {
    case 's': {
      const ciag = ciagi[Number(v)];
      if (ciag === undefined) throw new Error(`XLSX: komórka ${ref} wskazuje nieistniejący ciąg ${v}`);
      return ciag;
    }
    case 'str':
    case 'd':
      return dekoduj(v);
    case 'e':
      return null; // błąd komórki (#N/A, #DIV/0!)
    default: {
      // brak t, n i b (0 albo 1)
      const liczba = Number(v);
      if (Number.isNaN(liczba)) throw new Error(`XLSX: komórka ${ref} ma wartość ${v} zamiast liczby`);
      return liczba;
    }
  }
}

/** Wiersze arkusza w kolejności z pliku, pierwszy to nagłówek. Puste komórki to null (kolumna z atrybutu r,
    więc brakujące w środku wiersza też dają null); liczby to number, teksty (współdzielone i inline) to string.
    Wiersze nieobecne w pliku są pomijane, wiersz bez komórek daje []. */
export function wiersze(buf: Buffer, arkusz: string): Komorka[][] {
  const znaleziony = spisArkuszy(buf).find((a) => a.nazwa === arkusz);
  if (!znaleziony) throw new Error(`XLSX: brak arkusza „${arkusz}”, są: ${arkusze(buf).join(', ')}`);
  const ciagi = wspolneCiagi(buf);
  const xml = plik(buf, znaleziony.plik);
  const wynik: Komorka[][] = [];
  for (const w of xml.matchAll(/<row(?=[\s/>])[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const wiersz: Komorka[] = [];
    for (const c of (w[1] ?? '').matchAll(/<c(?=[\s/>])([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = / r="(([A-Z]+)\d+)"/.exec(c[1]);
      const kol = ref ? kolumna(ref[2]) : wiersz.length; // bez r komórki idą po kolei
      while (wiersz.length < kol) wiersz.push(null);
      const typ = / t="([^"]*)"/.exec(c[1])?.[1];
      wiersz[kol] = c[2] === undefined ? null : wartosc(typ, c[2], ciagi, ref?.[1] ?? `kolumna ${kol + 1}`);
    }
    wynik.push(wiersz);
  }
  return wynik;
}
