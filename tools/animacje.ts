/* Animacje postaci z PixelLab w assets/raw (npm run animacje [-- id ...]). Dla każdej postaci z manifestu (zarząd
   i mieszkańcy, albo podanych) bierze paczkę ZIP z api.pixellab.ai (bez logowania) i rozpakowuje ją tak, jak przyszła:
   Idle/rotations, Idle/animations/<nazwa>/<kierunek>/frame_NNN.png i metadata.json z listą animacji. Zamówienia
   animacji idą przez MCP PixelLab (docs/PIXELLAB.md), a ten skrypt tylko zbiera wyniki do repo. Wymaga `unzip`. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');

/** metadata.json z paczki PixelLab, tylko pola, których używamy */
export interface Metadane {
  states: { folder: string; frames: { animations: Record<string, Record<string, string[]>> } }[];
}

export interface Animacja {
  nazwa: string;
  /** kierunek (south, north, west, east, …) → ścieżki klatek względem katalogu postaci, po kolei */
  kierunki: Record<string, string[]>;
}

/** numer klatki z nazwy pliku frame_007.png */
const numer = (f: string) => Number(/(\d+)\.png$/.exec(f)?.[1] ?? 0);

/** animacje postaci z metadata.json: po nazwie, klatki po numerze */
export function animacjePostaci(m: Metadane): Animacja[] {
  const out: Animacja[] = [];
  for (const st of m.states)
    for (const [nazwa, kier] of Object.entries(st.frames.animations ?? {}))
      out.push({
        nazwa,
        kierunki: Object.fromEntries(
          Object.entries(kier).map(([k, pliki]) => [k, [...pliki].sort((a, b) => numer(a) - numer(b))]),
        ),
      });
  return out;
}

interface Manifest {
  zarzad: string[];
  mieszkancy: string[];
  assety: { id: string; pixellab?: string }[];
}

/**
 * Pobiera paczkę ZIP z adresu. PixelLab odpowiada 423, dopóki jakaś animacja postaci się generuje, i podaje w
 * `retry-after`, ile czekać, więc ponawiamy (najwyżej `proby` razy); inny błąd przerywa od razu.
 */
export async function pobierzPaczke(
  url: string,
  opts: { pobierz?: typeof fetch; czekaj?: (ms: number) => Promise<void>; proby?: number } = {},
): Promise<Uint8Array> {
  const pobierz = opts.pobierz ?? fetch;
  const czekaj = opts.czekaj ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const proby = opts.proby ?? 30;
  for (let k = 1; ; k++) {
    const r = await pobierz(url);
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
    if (r.status !== 423 || k >= proby) throw new Error(`paczka ${r.status}: ${(await r.text()).slice(0, 120)}`);
    await czekaj(Math.max(1, Number(r.headers.get('retry-after')) || 30) * 1000);
  }
}

/** pobiera paczkę postaci i rozpakowuje do assets/raw/<id>/ (nadpisuje metadata.json, dokłada animacje) */
async function pobierz(id: string, pixellab: string): Promise<void> {
  const dane = await pobierzPaczke(`https://api.pixellab.ai/mcp/characters/${pixellab}/download`).catch((e) => {
    throw new Error(`${id}: ${e.message}`);
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'animacje-'));
  const zip = path.join(tmp, 'postac.zip');
  fs.writeFileSync(zip, dane);
  const lista = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const zla = lista.find((f) => f.startsWith('/') || f.split('/').includes('..'));
  if (zla) throw new Error(`${id}: podejrzana ścieżka w paczce: ${zla}`);
  execFileSync('unzip', ['-q', '-o', zip, '-d', path.join(ROOT, 'assets/raw', id)]);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
  const prosby = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const ids = prosby.length ? prosby : [...m.zarzad, ...m.mieszkancy];
  for (const id of ids) {
    const a = m.assety.find((q) => q.id === id);
    if (!a?.pixellab) throw new Error(`${id}: brak identyfikatora PixelLab w manifeście`);
    await pobierz(id, a.pixellab);
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/raw', id, 'metadata.json'), 'utf8')) as Metadane;
    const an = animacjePostaci(meta).map((x) => `${x.nazwa}×${Object.keys(x.kierunki).length}`);
    console.log(`${id}: ${an.length ? an.join(' ') : 'bez animacji'}`);
  }
}
