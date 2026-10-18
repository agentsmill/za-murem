/* Angielskie słowniki do napisów ze stanu gry: zawody, cechy, dziedziny, zapasy, przyczyny zgonów i powody nastrojów.
   Powody nastrojów zbieramy literałami ze źródeł (wywołania addMood, moodAll i moods.push), więc nowy powód bez
   angielskiego wpisu wychodzi tutaj. */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLS_EN,
  DOM_EN,
  LORE_EN,
  LORE_ZOMBIE_EN,
  PROFS_EN,
  przyczynaEn,
  RL_EN,
  SEASONS_EN,
  TRAITS_EN,
  zawodEn,
} from '../../src/content/data.en.ts';
import { DOM, PROFS, RL, TRAITS } from '../../src/content/data.ts';
import { NASTROJE_EN, nastrojEn } from '../../src/content/nastroje.en.ts';
import { POLSKIE } from './po-angielsku.ts';

const SRC = path.resolve(import.meta.dirname, '../../src');
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

/** tekst wywołania od nawiasu otwierającego do domykającego */
function callText(src: string, open: number): string {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '(') depth++;
    else if (src[k] === ')' && --depth === 0) return src.slice(open, k + 1);
  }
  return src.slice(open);
}

/** powody nastrojów zapisane w kodzie literałem (zaczynają się wielką literą) */
function moodLiterals(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files(SRC)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:addMood|moodAll|moods\.push)\(/g)) {
      const call = callText(src, m.index + m[0].length - 1);
      for (const lit of call.matchAll(/'([^'\\]+)'/g))
        if (/^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(lit[1])) out.set(lit[1], path.relative(SRC, f));
    }
    const fever = /const FEVER_MOOD = '([^']+)'/.exec(src);
    if (fever) out.set(fever[1], path.relative(SRC, f));
  }
  return out;
}

describe('słowniki napisów ze stanu', () => {
  it('cechy, dziedziny, zapasy i pory roku mają angielskie nazwy', () => {
    for (const k of Object.keys(TRAITS)) {
      expect(TRAITS_EN[k]?.name, k).toBeTruthy();
      expect(TRAITS_EN[k].desc, k).not.toMatch(POLSKIE);
    }
    for (const k of Object.keys(DOM)) expect(DOM_EN[k as keyof typeof DOM_EN], k).toBeTruthy();
    for (const k of Object.keys(RL)) expect(RL_EN[k as keyof typeof RL_EN], k).toBeTruthy();
    expect(SEASONS_EN).toHaveLength(4);
    for (const v of [...Object.values(DOM_EN), ...Object.values(RL_EN), ...Object.values(CLS_EN)])
      expect(v).not.toMatch(POLSKIE);
  });

  it('każdy zawód z 0.3 w obu formach i małą literą', () => {
    for (const [m, f] of PROFS) {
      expect(PROFS_EN[m], m).toBeTruthy();
      expect(zawodEn(m), m).toBe(PROFS_EN[m]);
      expect(zawodEn(f), f).toBe(PROFS_EN[m]);
      const low = zawodEn(f.toLowerCase());
      expect(low.toLowerCase(), f).toBe(PROFS_EN[m].toLowerCase());
      expect(low, f).toBe(/^[A-Z]{2,}\b/.test(PROFS_EN[m]) ? PROFS_EN[m] : PROFS_EN[m][0].toLowerCase() + PROFS_EN[m].slice(1));
      expect(zawodEn(m)).not.toMatch(POLSKIE);
    }
    expect(zawodEn('dziecko')).toBe('child');
    expect(zawodEn('lekarz rodzinny')).toBe('GP');
    expect(zawodEn('doradczyni ds. esg')).toBe('ESG consultant');
    expect(zawodEn('Nieznany fach')).toBe('Nieznany fach');
  });

  it('przyczyny zgonów i wstępy', () => {
    expect(przyczynaEn('rany')).toBe('of their wounds');
    expect(przyczynaEn('gorączka')).toBe('after a bite');
    expect(przyczynaEn('amputacja')).toBe('during an amputation');
    for (const t of [LORE_EN, LORE_ZOMBIE_EN]) {
      expect(t).toMatch(/2051/);
      expect(t).toMatch(/You are the board now\.$/);
      expect(t).not.toMatch(POLSKIE);
    }
    expect(LORE_EN).toMatch(/2026/);
  });

  it('każdy powód nastroju z kodu ma angielski wpis', () => {
    const found = moodLiterals();
    expect(found.size).toBeGreaterThan(20);
    for (const [why, file] of found) expect(NASTROJE_EN[why], `${why} (${file})`).toBeTruthy();
    for (const v of Object.values(NASTROJE_EN)) expect(v).not.toMatch(POLSKIE);
  });

  it('powody z imieniem i meblem przez wzorce', () => {
    expect(nastrojEn('Śmierć: Ania')).toBe('Ania died');
    expect(nastrojEn('Spalili moją wersalkę')).toBe('They burned my sofa bed');
    expect(nastrojEn('Spalili moją rzecz')).toBe('They burned my things');
    // meble z MINE w sim.ts: każdy ma wpis
    const sim = fs.readFileSync(path.join(SRC, 'sim/sim.ts'), 'utf8');
    const mine = /const MINE: Record<string, string> = \{([^}]+)\}/.exec(sim)![1];
    for (const v of mine.matchAll(/: '([^']+)'/g)) expect(nastrojEn(`Spalili ${v[1]}`), v[1]).not.toMatch(POLSKIE);
    expect(nastrojEn('Coś nowego')).toBe('Coś nowego');
  });
});
