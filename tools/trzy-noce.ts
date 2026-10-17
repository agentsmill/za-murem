/* Trzy pierwsze noce zarządu na atrapie symulacji, z trzema politykami gracza: zawsze warta, nigdy
   warty, losowo. Wypisuje decyzje (sekundy przy ekranie i godzina gry), raporty poranne, zaufanie
   i wkurzenie, tempo decyzji w pierwszych 10 minutach przy 1× i zestawienie na wielu ziarnach.
   Uruchomienie: node tools/trzy-noce.ts [ziarno] [--n liczba ziaren do zestawienia] */

import { at, type PolicyName, run } from '../tests/unit/gov-atrapa.ts';

const args = process.argv.slice(2);
const seed = Number(args.find((a) => /^-?\d+$/.test(a)) ?? 1);
const nIdx = args.indexOf('--n');
const N = nIdx >= 0 ? Number(args[nIdx + 1]) : 200;
const POLICIES: PolicyName[] = ['zawsze-warta', 'nigdy-warty', 'losowo'];
const END = at(4, 6, 30); // po trzecim raporcie

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const KIND: Record<string, string> = {
  raport: 'raport',
  uchwala: 'uchwała',
  karta: 'karta nocy',
  wydarzenie: 'wydarzenie',
};

for (const policy of POLICIES) {
  const { gov, atr, steps } = run(seed, policy, END);
  console.log(`\n=== ${policy}, ziarno ${seed} ===`);
  for (const s of steps) console.log(`${mmss(s.s)}  dzień ${s.day} ${s.clock}  ${KIND[s.kind].padEnd(10)}  ${s.text}`);
  console.log('\nRano po każdej nocy:');
  for (const r of gov.reports)
    console.log(
      `  noc ${r.day}: ${r.raid}, zaufanie ${r.trust.toFixed(1)} (${r.dTrust >= 0 ? '+' : ''}${r.dTrust}), wkurzenie ${r.anger.toFixed(1)} (${r.dAnger >= 0 ? '+' : ''}${r.dAnger})`,
    );
  // tempo: decyzje zarządu w pierwszych 10 minutach przy 1× (bez poleceń w symulacji i raportów)
  const dec = gov.decisions.map((d) => d.s).filter((s) => s <= 600);
  const perMin = Array.from({ length: 10 }, (_, m) => dec.filter((s) => s >= m * 60 && s < (m + 1) * 60).length);
  let gap = 0;
  for (let k = 1; k < dec.length; k++) gap = Math.max(gap, dec[k] - dec[k - 1]);
  console.log(`Decyzje zarządu w minutach 1–10: ${perMin.join(' ')} (najdłuższa przerwa ${Math.round(gap)} s)`);
  console.log(
    `Na koniec: zaufanie ${gov.trust.toFixed(1)}, wkurzenie ${gov.anger.toFixed(1)}, uchwały: ${Object.keys(gov.laws.signed).join(', ') || 'brak'}, drewno ${atr.woodSklad + atr.woodLoose}, jedzenie ${atr.supplies}, dziury ${atr.fence.holes.length}`,
  );
}

// zestawienie na wielu ziarnach: ile kosztuje noc bez warty
console.log(`\n=== zestawienie, ${N} ziaren, trzy noce ===`);
console.log('polityka        weszli  odparci  brak  skradzione drewno+jedzenie na noc  zaufanie  wkurzenie  ranni');
for (const policy of POLICIES) {
  let entered = 0;
  let repelled = 0;
  let none = 0;
  let stolen = 0;
  let trust = 0;
  let anger = 0;
  let hurt = 0;
  let nights = 0;
  for (let s = 1; s <= N; s++) {
    const { gov } = run(s, policy, END);
    for (const r of gov.reports) {
      nights++;
      if (r.raid === 'wtargnięcie') entered++;
      else if (r.raid === 'odparty') repelled++;
      else none++;
      stolen += r.stolen.wood + r.stolen.supplies;
      hurt += r.hurt.length;
    }
    trust += gov.trust;
    anger += gov.anger;
  }
  console.log(
    `${policy.padEnd(15)} ${String(entered).padStart(6)}  ${String(repelled).padStart(7)}  ${String(none).padStart(4)}  ${(stolen / nights).toFixed(2).padStart(33)}  ${(trust / N).toFixed(1).padStart(8)}  ${(anger / N).toFixed(1).padStart(9)}  ${(hurt / nights).toFixed(2).padStart(5)}`,
  );
}
