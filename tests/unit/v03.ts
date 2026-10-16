/* Ładuje oryginalny kod wersji 0.3 (public/v03) do piaskownicy node:vm.
   Math.random w piaskownicy jest podmieniony na generator z ziarnem, który test może
   przestawiać, więc oryginał i port losują z tego samego ciągu. */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { mulberry, type Rng } from '../../src/core/rng.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const V03 = path.join(ROOT, 'public/v03');

// biome-ignore lint/suspicious/noExplicitAny: obiekt G z 0.3 nie ma typów
export type G03 = any;

export interface V03 {
  G: G03;
  /** ten sam generator co Math.random w piaskownicy */
  random: Rng;
  seed(s: number): void;
}

export function loadV03(files = ['js/data.js', 'data/sample.js', 'js/osm.js', 'js/mvt.js', 'js/sim.js']): V03 {
  let cur = mulberry(1);
  const random: Rng = () => cur();
  const ctx = vm.createContext({ window: {}, console, TextDecoder, __random: random });
  vm.runInContext('Math.random = __random;', ctx);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(V03, f), 'utf8'), ctx, { filename: f });
  return {
    G: (ctx as { window: { G: G03 } }).window.G,
    random,
    seed: (s: number) => {
      cur = mulberry(s);
    },
  };
}

/** Kopia przez JSON do obiektów z głównej piaskownicy (porównania między realmami). */
export const plain = <T>(x: T): T =>
  JSON.parse(JSON.stringify(x, (_k, v) => (Object.prototype.toString.call(v) === '[object Set]' ? [...v] : v)));
