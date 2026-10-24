/* Spis kart na grę (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, „Jak sprawdzamy”: 30–40 kart na grę) i gości pod
   bramą: gra z zarządem na prawdziwej symulacji (Przymorze z mieszkańcami z generatora i obcymi), polityka zawsze-warta, gracz
   odpowiada od razu (`playWithGov`). Dla każdego ziarna: ile kart wydarzeń zarząd pokazał (decyzje rodzaju „wydarzenie”) i lejek
   gości od wylosowanej wizyty do karty: zaplanowane (wylosowane z puli: karta `gosc`, `powrot`, karty z 0.3 z gościem i, z
   `--lancuchy`, kroki łańcuchów z gościem; każde wypadnięcie planuje wizytę od razu, nic nie czeka), doszły do bramy (grupa
   widziana w fazie `brama`, `w_srodku`, `zlapany` albo `odchodzi` po bramie), karta pod bramą (okno wizyty naprawdę się otworzyło),
   zginęli w drodze, weszli albo zostali w osiedlu; z narratora (src/gov/narrator.ts) średnie napięcie i jaką część czasu
   przekraczało 60. Na końcu średnie na grę i udział wizyt z kartą.

   Użycie: node tools/spis-kart.ts [lancuchy] [tryb: zwykly|zombie] [dni] [pierwsze ziarno] [ostatnie ziarno] [demo]
   Domyślnie zwykly, 5 dób, ziarna 11–25, demo przymorze (public/demo/przymorze.json), bez łańcuchów (jak domyślna gra);
   słowo `lancuchy` włącza łańcuchy kart i wątki sezonu jak adres `?lancuchy=1`. Jedna gra to 1–3 s. */

import fs from 'node:fs';
import path from 'node:path';
import { playWithGov } from '../tests/unit/gov-play.ts';
import { swiatMieszkancow } from './bot-mieszkancy.ts';

// słowo `lancuchy` zamiast flagi `--lancuchy`: bot-mieszkancy.ts kończy z błędem na każdej nieznanej fladze
const lancuchy = process.argv.includes('lancuchy');
const [tryb = 'zwykly', dniArg = '5', odArg = '11', doArg = '25', demoArg = 'przymorze'] = process.argv
  .slice(2)
  .filter((a) => a !== 'lancuchy');
if (tryb !== 'zwykly' && tryb !== 'zombie') {
  console.error(`Nieznany tryb „${tryb}”: zwykly albo zombie.`);
  process.exit(2);
}
const dni = Number(dniArg);
const od = Number(odArg);
const doo = Number(doArg);
if (![dni, od, doo].every(Number.isFinite) || doo < od) {
  console.error(
    'Użycie: node tools/spis-kart.ts [lancuchy] [zwykly|zombie] [dni] [pierwsze ziarno] [ostatnie ziarno] [demo]',
  );
  process.exit(2);
}
const demo = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../public/demo/${demoArg}.json`), 'utf8'));

const BRAMA = new Set(['brama', 'w_srodku', 'zlapany']);
let kart = 0;
let gier = 0;
let wizyt = 0;
let uBramy = 0;
let zKarta = 0;
let zgin = 0;
let zostalo = 0;
for (let seed = od; seed <= doo; seed++) {
  const { world, mieszkancy } = await swiatMieszkancow(demo, seed, 4);
  const ids = new Set<string>();
  const brama = new Set<string>();
  const karta = new Set<string>();
  const koniec = new Map<string, string>();
  let suma = 0;
  let probek = 0;
  let wysokie = 0;
  const r = playWithGov(world, seed, 'zawsze-warta', dni, 4, {
    mieszkancy,
    obcy: true,
    mode: tryb,
    lancuchy,
    obserwuj: (gov, i) => {
      for (const g of i.goscie ?? []) {
        ids.add(g.id);
        if (BRAMA.has(g.faza) || g.przyjety) brama.add(g.id);
        koniec.set(g.id, g.przyjety ? 'przyjety' : g.faza);
      }
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
  uBramy += brama.size;
  zKarta += karta.size;
  zgin += [...koniec.values()].filter((f) => f === 'zginal').length;
  zostalo += [...koniec.values()].filter((f) => f === 'przyjety' || f === 'w_srodku').length;
  const konGry = r.gov.over ? `, koniec gry: ${r.gov.over}` : '';
  console.log(
    `${tryb} ziarno ${seed}: kart ${k}, wizyt ${ids.size}, z kartą ${karta.size}, napięcie średnio ${(suma / Math.max(1, probek)).toFixed(1)}, powyżej 60 przez ${((100 * wysokie) / Math.max(1, probek)).toFixed(0)}% czasu${konGry}`,
  );
}
const proc = (a: number, b: number) => `${a} z ${b} (${((100 * a) / Math.max(1, b)).toFixed(0)}%)`;
console.log(
  `razem ${gier} gier po ${dni} dób${lancuchy ? ' z łańcuchami' : ' bez łańcuchów'}: kart na grę ${(kart / gier).toFixed(1)}; lejek gości: wylosowanych ${wizyt} (${(wizyt / gier).toFixed(1)} na grę), u bramy ${proc(uBramy, wizyt)}, z kartą ${proc(zKarta, wizyt)} (${(zKarta / gier).toFixed(1)} kart gościa na grę), zginęło po drodze ${zgin}, zostało lub weszło ${zostalo}`,
);
