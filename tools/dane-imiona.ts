/* Tabele imion i nazwisk dla generatora mieszkańców: z rejestru PESEL (Ministerstwo Cyfryzacji, dane.gov.pl, CC0;
   surowe pliki poza repozytorium, katalog imiona-nazwiska/ w ZM_SUROWE) robi `public/data/mieszkancy/imiona.json`
   i szesnaście plików `public/data/mieszkancy/nazwiska/<województwo>.json`. Reguły i opis metody: tools/dane/imiona.ts,
   wczytywanie plików: tools/dane/imiona-pliki.ts, lista nazwisk, których gra nie używa: tools/dane/zakazane-nazwiska.txt.
   Wynik jest bajt w bajt powtarzalny (kolejność wszędzie z jawnym remisem, liczby całkowite).
   Uruchomienie: npm run dane:imiona */

import fs from 'node:fs';
import path from 'node:path';
import { KOSZYKI_IMION, PLIK_WOJEWODZTWA } from '../src/mieszkancy/tabele.ts';
import { kohortaImienia, type Plec } from './dane/imiona.ts';
import { zbudujZPlikow } from './dane/imiona-pliki.ts';
import { SUROWE, wyjscie } from './dane/sciezki.ts';

const KATALOG_PESEL = path.join(SUROWE, 'imiona-nazwiska');
const ZAKAZANE = path.resolve(import.meta.dirname, 'dane/zakazane-nazwiska.txt');

const kb = (bajty: number): string => `${(bajty / 1024).toFixed(1)} KB`;

function main(): void {
  if (!fs.existsSync(KATALOG_PESEL))
    throw new Error(`Brak katalogu ${KATALOG_PESEL} (katalog surowych danych: ZM_SUROWE=${SUROWE})`);
  const { imiona, nazwiska, diagnostykaNazwisk, daneImion } = zbudujZPlikow(KATALOG_PESEL, ZAKAZANE);

  // kontrola: liczby z badań (research_notes/…/imiona_nazwiska_pesel.md)
  const procent = (p: Plec, n: string): string => `${Math.round(kohortaImienia(daneImion, p, n).udzialZmarlych)}%`;
  console.log(
    `Udział zmarłych wśród urodzonych przed 2000 r.: Janina ${procent('K', 'JANINA')} (badania: 66%), Agnieszka ${procent('K', 'AGNIESZKA')} (9%), Zofia ${procent('K', 'ZOFIA')} (62%), Julia ${procent('K', 'JULIA')} (43%)`,
  );

  const pokaz = (l: [string, number][], ile = 10): string =>
    l
      .slice(0, ile)
      .map((x) => `${x[0]} ${x[1]}`)
      .join(', ');
  console.log('Koszyki przed 2000 r. (pierwsze 10 imion):');
  for (const k of KOSZYKI_IMION) {
    const m = imiona.koszyki[k].M;
    const z = imiona.koszyki[k].K;
    const udzial = (l: [string, number][]): string =>
      `największy udział ${((100 * l[0][1]) / l.reduce((a, x) => a + x[1], 0)).toFixed(1)}%`;
    console.log(
      `  ${k}: M ${m.length} imion (${udzial(m)}): ${pokaz(m)}\n             K ${z.length} imion (${udzial(z)}): ${pokaz(z)}`,
    );
  }
  console.log(
    `Przyjezdni: M ${imiona.przyjezdni.M.length} imion (${pokaz(imiona.przyjezdni.M, 5)}), K ${imiona.przyjezdni.K.length} (${pokaz(imiona.przyjezdni.K, 5)})`,
  );
  console.log(`Powracające: M ${imiona.powracajace.M.join(', ')}\n             K ${imiona.powracajace.K.join(', ')}`);

  fs.mkdirSync(wyjscie('nazwiska'), { recursive: true });
  const zapisane = new Set<string>();
  let bajty = 0;
  const zapisz = (sciezka: string, obiekt: unknown): number => {
    const tekst = `${JSON.stringify(obiekt)}\n`;
    fs.writeFileSync(sciezka, tekst);
    return Buffer.byteLength(tekst);
  };
  const rozmiarImion = zapisz(wyjscie('imiona.json'), imiona);
  bajty += rozmiarImion;
  console.log(`imiona.json: ${kb(rozmiarImion)}`);
  for (const t of nazwiska) {
    const plik = `${PLIK_WOJEWODZTWA[t.woj]}.json`;
    zapisane.add(plik);
    bajty += zapisz(wyjscie('nazwiska', plik), t);
  }
  for (const stary of fs.readdirSync(wyjscie('nazwiska'))) {
    if (!zapisane.has(stary)) fs.rmSync(wyjscie('nazwiska', stary));
  }

  console.log('Nazwiska według województw (udział lokalnych na 10 000: mężczyźni zapisani w tabeli / kobiety):');
  for (const d of diagnostykaNazwisk) {
    const t = nazwiska.find((x) => x.woj === d.woj)!;
    console.log(
      `  ${d.woj.padEnd(20)} ${String(d.udzialM).padStart(4)} / ${String(d.udzialK).padStart(4)}  lokalnych ${String(d.lokalnychPrzedUcieciem).padStart(4)} (w puli ${t.lokalne.length}), bez pary żeńskiej ${d.bezPary}, zakazanych ${d.zakazanych}`,
    );
  }
  for (const woj of ['pomorskie', 'śląskie']) {
    const t = nazwiska.find((x) => x.woj === woj)!;
    console.log(
      `  lokalne ${woj}: ${t.lokalne
        .slice(0, 12)
        .map((x) => `${x[0]}/${x[1]} ${x[2]}`)
        .join(', ')}`,
    );
  }
  const zakazanych = fs
    .readFileSync(ZAKAZANE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '').length;
  console.log(`Lista zakazanych nazwisk: ${zakazanych} wpisów (męskie formy; usuwana też żeńska).`);
  console.log(`Razem ${zapisane.size + 1} plików, ${kb(bajty)}.`);
}

main();
