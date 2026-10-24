/* Spis kart na grę (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, „Jak sprawdzamy”: 30–40 kart na grę) i gości pod
   bramą: gra z zarządem na prawdziwej symulacji (Przymorze z mieszkańcami z generatora i obcymi), polityka zawsze-warta, gracz
   odpowiada od razu (`playWithGov`). Dla każdego ziarna: ile kart wydarzeń zarząd pokazał (decyzje rodzaju „wydarzenie”), ile
   wizyt gości zaplanował, ile z nich doszło do karty pod bramą, a z narratora (src/gov/narrator.ts) średnie napięcie i jaką część
   czasu przekraczało 60. Na końcu średnie i udział wizyt z kartą.

   Użycie: node tools/spis-kart.ts [tryb: zwykly|zombie] [dni] [pierwsze ziarno] [ostatnie ziarno] [demo]
   Domyślnie zwykly, 5 dób, ziarna 11–25, demo przymorze (public/demo/przymorze.json). Jedna gra to 1–3 s. */

import fs from 'node:fs';
import path from 'node:path';
import { playWithGov } from '../tests/unit/gov-play.ts';
import { swiatMieszkancow } from './bot-mieszkancy.ts';

const [tryb = 'zwykly', dniArg = '5', odArg = '11', doArg = '25', demoArg = 'przymorze'] = process.argv.slice(2);
if (tryb !== 'zwykly' && tryb !== 'zombie') {
  console.error(`Nieznany tryb „${tryb}”: zwykly albo zombie.`);
  process.exit(2);
}
const dni = Number(dniArg);
const od = Number(odArg);
const doo = Number(doArg);
if (![dni, od, doo].every(Number.isFinite) || doo < od) {
  console.error('Użycie: node tools/spis-kart.ts [zwykly|zombie] [dni] [pierwsze ziarno] [ostatnie ziarno] [demo]');
  process.exit(2);
}
const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../public/demo/${demoArg}.json`), 'utf8'));

let kart = 0;
let gier = 0;
let wizyt = 0;
let zKarta = 0;
for (let seed = od; seed <= doo; seed++) {
  const { world, mieszkancy } = await swiatMieszkancow(demo, seed, 4);
  const ids = new Set<string>();
  const karta = new Set<string>();
  let suma = 0;
  let probek = 0;
  let wysokie = 0;
  const r = playWithGov(world, seed, 'zawsze-warta', dni, 4, {
    mieszkancy,
    obcy: true,
    mode: tryb,
    obserwuj: (gov, i) => {
      for (const g of i.goscie ?? []) ids.add(g.id);
      const a = gov.goscie?.aktywny;
      if (a?.karta) karta.add(a.gosc.id);
      const v = gov.napiecie?.v ?? 0;
      suma += v;
      probek++;
      if (v > 60) wysokie++;
    },
  });
  const k = r.decisions.filter((d) => d.kind === 'wydarzenie').length;
  kart += k;
  gier++;
  wizyt += ids.size;
  zKarta += karta.size;
  const koniec = r.gov.over ? `, koniec gry: ${r.gov.over}` : '';
  console.log(
    `${tryb} ziarno ${seed}: kart ${k}, wizyt ${ids.size}, z kartą ${karta.size}, napięcie średnio ${(suma / Math.max(1, probek)).toFixed(1)}, powyżej 60 przez ${((100 * wysokie) / Math.max(1, probek)).toFixed(0)}% czasu${koniec}`,
  );
}
console.log(
  `razem ${gier} gier po ${dni} dób: kart na grę ${(kart / gier).toFixed(1)}, wizyt na grę ${(wizyt / gier).toFixed(1)}, z kartą pod bramą ${zKarta} z ${wizyt} (${((100 * zKarta) / Math.max(1, wizyt)).toFixed(0)}%)`,
);
