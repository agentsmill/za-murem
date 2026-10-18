/* Odmiana imion i nazwisk dla generatora mieszkańców: ze słownika SGJP (Morfeusz 2, plik `sgjp-20260823.tab.gz` w
   katalogu odmiana/sgjp/ surowych danych ZM_SUROWE, licencja BSD-2) robi
   - `public/data/mieszkancy/odmiana.json`: pełne paradygmaty (siedem przypadków liczby pojedynczej) dla każdego imienia
     z imiona.json i każdego nazwiska (męskiego, żeńskiego i liczby mnogiej) z nazwiska/*.json, które SGJP zna; reszta
     jest odmieniana w grze zgadywaczem;
   - `public/data/mieszkancy/odmiana-koncowki.json`: tablica końcówek zgadywacza, uczona na wszystkich imionach
     i nazwiskach SGJP.
   Reguły zgadywacza i opis metody: src/mieszkancy/odmiana.ts, czytnik i uczenie: tools/dane/odmiana.ts. Na końcu
   wypisuje dokładność reguł, końcówek i ich zgodności na imionach i nazwiskach SGJP (końcówki na co dziesiątym
   przykładzie odłożonym z treningu). Wynik jest bajt w bajt powtarzalny (kolejność wszędzie z jawnym remisem).
   Uruchomienie: npm run dane:odmiana */

import fs from 'node:fs';
import path from 'node:path';
import {
  type Formy,
  PRZYPADKI,
  rozpakujOdmiane,
  zgadnijKoncowkami,
  zgadnijNazwiskoKoncowkami,
  zgadnijNazwiskoReguly,
  zgadnijReguly,
} from '../src/mieszkancy/odmiana.ts';
import { PLIK_WOJEWODZTWA, type TabeleImion, type TabeleNazwisk } from '../src/mieszkancy/tabele.ts';
import {
  type Dokladnosc,
  jakoJson,
  ocenNazwiska,
  ocenPrzyklady,
  podzial,
  procent,
  przykladyUczaceNazwisk,
  trenujKoncowki,
  wagiImion,
  wczytajSgjp,
  zbudujTabele,
  zgodnoscImion,
} from './dane/odmiana.ts';
import { SUROWE, wyjscie } from './dane/sciezki.ts';

const SGJP = path.join(SUROWE, 'odmiana/sgjp/sgjp-20260823.tab.gz');

const kb = (bajty: number): string => `${(bajty / 1024).toFixed(1)} KB`;
const pr = (d: Dokladnosc): string => `${d.poprawne}/${d.n} = ${procent(d).toFixed(1)}%`;
const wPrzypadkach = (d: Dokladnosc): string =>
  PRZYPADKI.slice(1)
    .map((p) => `${p} ${((100 * d.przypadki[p]) / d.n).toFixed(1)}%`)
    .join(', ');

function main(): void {
  for (const plik of [SGJP, wyjscie('imiona.json')]) {
    if (!fs.existsSync(plik)) throw new Error(`Brak pliku ${plik} (katalog surowych danych: ZM_SUROWE=${SUROWE})`);
  }
  const imionaTab = JSON.parse(fs.readFileSync(wyjscie('imiona.json'), 'utf8')) as TabeleImion;
  const nazwiskaTab = Object.values(PLIK_WOJEWODZTWA)
    .sort()
    .map((plik) => JSON.parse(fs.readFileSync(wyjscie('nazwiska', `${plik}.json`), 'utf8')) as TabeleNazwisk);

  console.log(`Czytam ${SGJP} …`);
  const sgjp = wczytajSgjp(SGJP);
  const { odmiana: plik, koncowki, pokrycie, imiona, pary } = zbudujTabele(sgjp, imionaTab, nazwiskaTab);
  console.log(
    `SGJP ${sgjp.idSlownika}: ${sgjp.leksemy.size} leksemów imion i nazwisk; do treningu ${imiona.length} imion ` +
      `(${imiona.filter((p) => p.plec === 'M').length} męskich, ${imiona.filter((p) => p.plec === 'K').length} żeńskich) ` +
      `i ${pary.length} nazwisk męskich (${pary.filter((p) => p.k).length} z żeńską parą).`,
  );
  const wImionach = koncowki.wzorce.filter((w) => !w.sufiks.startsWith('*')).length;
  console.log(
    `Tablica końcówek: ${koncowki.wzorce.length} wzorców sufiksów (${wImionach} dla imion, ${koncowki.wzorce.length - wImionach} dla nazwisk).`,
  );
  console.log(
    `Słownik: imiona męskie ${pokrycie.imionM.w}/${pokrycie.imionM.razem}, żeńskie ${pokrycie.imionK.w}/${pokrycie.imionK.razem}, ` +
      `nazwiska ${pokrycie.nazwiska.w}/${pokrycie.nazwiska.razem}.`,
  );
  const lista = (l: string[], ile = 60): string =>
    `${l.slice(0, ile).join(', ')}${l.length > ile ? `, … (${l.length})` : ''}`;
  const wagi = wagiImion(imionaTab);
  for (const plec of ['M', 'K'] as const) {
    const brak = new Set((plec === 'M' ? pokrycie.imionM : pokrycie.imionK).brak);
    let razem = 0;
    let wSlowniku = 0;
    for (const [imie, waga] of wagi[plec]) {
      razem += waga;
      if (!brak.has(imie)) wSlowniku += waga;
    }
    console.log(
      `  udział słownika w nadaniach (suma liczb z roczników, koszyków i przyjezdnych), ${plec === 'M' ? 'chłopcy i mężczyźni' : 'dziewczynki i kobiety'}: ${((100 * wSlowniku) / razem).toFixed(1)}%`,
    );
  }
  console.log(`  brak w SGJP, męskie: ${lista(pokrycie.imionM.brak)}`);
  console.log(`  brak w SGJP, żeńskie: ${lista(pokrycie.imionK.brak)}`);
  console.log(`  brak w SGJP, nazwiska: ${lista(pokrycie.nazwiska.brak)}`);
  console.log(`  nazwiska bez żeńskiego leksemu w SGJP (żeńskie z reguł): ${lista(pokrycie.nazwiska.zenskieZRegul)}`);
  console.log(`  nazwiska bez liczby mnogiej w SGJP (mnoga z reguł): ${lista(pokrycie.nazwiska.mnogaZRegul)}`);
  console.log(`  nazwiska z różnymi żeńskimi formami w tabelach województw: ${lista(pokrycie.nazwiska.rozneZenskie)}`);

  fs.mkdirSync(wyjscie(), { recursive: true });
  const tekstOdmiany = jakoJson(plik);
  const tekstKoncowek = jakoJson(koncowki);
  fs.writeFileSync(wyjscie('odmiana.json'), tekstOdmiany);
  fs.writeFileSync(wyjscie('odmiana-koncowki.json'), tekstKoncowek);
  const bajtyOdmiany = Buffer.byteLength(tekstOdmiany);
  const bajtyKoncowek = Buffer.byteLength(tekstKoncowek);
  console.log(
    `odmiana.json: ${kb(bajtyOdmiany)} (${plik.wzorce.length} wzorców, ${Object.keys(plik.imiona).length} imion, ${Object.keys(plik.nazwiska).length} nazwisk); ` +
      `odmiana-koncowki.json: ${kb(bajtyKoncowek)}; razem ${kb(bajtyOdmiany + bajtyKoncowek)}.`,
  );

  // dokładność
  console.log('\nDokładność na imionach SGJP (poprawne są formy bez kwalifikatora „pot.” i „niepopr.”):');
  const reguly = ocenPrzyklady(imiona, (p) => zgadnijReguly(p.mian, p.plec));
  console.log(`  reguły, wszystkie imiona: ${pr(reguly)}; per przypadek: ${wPrzypadkach(reguly)}`);
  const podzialImion = podzial(imiona);
  const koncowkiTrening = trenujKoncowki(podzialImion.trening);
  const odlozone = podzialImion.odlozone;
  const koncowkiOdl = ocenPrzyklady(odlozone, (p) => zgadnijKoncowkami(p.mian, p.plec, koncowkiTrening));
  console.log(
    `  końcówki na co dziesiątym imieniu odłożonym z treningu: ${pr(koncowkiOdl)} (tablica z ${podzialImion.trening.length} imion, ${koncowkiTrening.wzorce.length} wzorców); per przypadek: ${wPrzypadkach(koncowkiOdl)}`,
  );
  console.log(
    `  reguły na tych samych odłożonych imionach: ${pr(ocenPrzyklady(odlozone, (p) => zgadnijReguly(p.mian, p.plec)))}`,
  );
  const zg = zgodnoscImion(odlozone, koncowkiTrening);
  console.log(
    `  oba razem na odłożonych (zgadnijImie: formy z reguł, pewne = zgodność): zgodne ${zg.zgodne}/${zg.n} = ${((100 * zg.zgodne) / zg.n).toFixed(1)}%, ` +
      `z nich poprawne ${zg.zgodneIPoprawne}/${zg.zgodne} = ${((100 * zg.zgodneIPoprawne) / zg.zgodne).toFixed(1)}% (dokładność „pewne”); ` +
      `różne: tylko reguły dobrze ${zg.tylkoReguly}, tylko końcówki ${zg.tylkoKoncowki}, obie źle ${zg.obaZle}`,
  );
  const zgWszystkie = zgodnoscImion(imiona, koncowki);
  console.log(
    `  (dla porównania, tablica z gry uczona na wszystkich imionach, więc na nich optymistyczna: zgodne ${zgWszystkie.zgodne}/${zgWszystkie.n}, poprawne ${zgWszystkie.zgodneIPoprawne})`,
  );

  console.log('\nDokładność na nazwiskach SGJP (męskie, żeńskie z pary, liczba mnoga):');
  const podzialNazwisk = podzial(pary);
  const koncowkiNazwisk = trenujKoncowki([...podzialImion.trening, ...przykladyUczaceNazwisk(podzialNazwisk.trening)]);
  const nReguly = ocenNazwiska(pary, (m) => zgadnijNazwiskoReguly(m));
  const nOdl = ocenNazwiska(podzialNazwisk.odlozone, (m) => zgadnijNazwiskoKoncowkami(m, koncowkiNazwisk));
  const nReguOdl = ocenNazwiska(podzialNazwisk.odlozone, (m) => zgadnijNazwiskoReguly(m));
  const mn = (d: { n: number; poprawne: number }): string =>
    `${d.poprawne}/${d.n} = ${((100 * d.poprawne) / d.n).toFixed(1)}%`;
  console.log(
    `  reguły, wszystkie: męskie ${pr(nReguly.m)}, żeńskie ${pr(nReguly.k)}, liczba mnoga ${mn(nReguly.mnoga)}`,
  );
  console.log(
    `  reguły na odłożonych: męskie ${pr(nReguOdl.m)}, żeńskie ${pr(nReguOdl.k)}, liczba mnoga ${mn(nReguOdl.mnoga)}`,
  );
  console.log(`  końcówki na odłożonych: męskie ${pr(nOdl.m)}, żeńskie ${pr(nOdl.k)}`);

  // przykłady
  const t = rozpakujOdmiane(plik);
  const f = (ff: Formy): string => PRZYPADKI.map((p) => ff[p]).join(' / ');
  console.log('\nPrzykłady ze słownika:');
  for (const [imie, plecImienia] of [
    ['Halina', 'K'],
    ['Maja', 'K'],
    ['Marek', 'M'],
    ['Kuba', 'M'],
  ] as const) {
    const formy = t.imiona[imie]?.[plecImienia];
    console.log(`  ${imie}: ${formy ? f(formy) : 'brak'}`);
  }
  for (const n of ['Kowalski', 'Nowak', 'Wróbel']) {
    const w = t.nazwiska[n];
    console.log(`  ${n}: m ${w ? f(w.m) : 'brak'}; k ${w ? f(w.k) : ''}; mnoga ${w?.mnoga}`);
  }
}

main();
