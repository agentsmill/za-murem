/* Noga Node porównania silników: osobny proces Node (dowolnej wersji), który liczy zlecenie i wypisuje wynik jako
   jedną linię JSON. Uruchamia go tools/determinizm.ts bieżącym Node'em i, jeśli jest, Node'em 24 (wzorzec CI i obrazu
   serwera). Do ręcznej próby: node tools/determinizm/noga-node.ts --demo=przymorze --godziny=24 --tryb=zwykly
   --seed=12345 --powtorz=2 */

import fs from 'node:fs';
import path from 'node:path';
import { uruchom } from './uruchom.ts';
import { zParametrow } from './zlecenie.ts';

const argumenty = process.argv.slice(2);
const z = zParametrow((k) => argumenty.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3));
const plik = path.resolve(import.meta.dirname, `../../public/demo/${z.demo}.json`);
const demo = JSON.parse(fs.readFileSync(plik, 'utf8'));
const wynik = uruchom(z, { geo: demo.geo, street: demo.street }, () => performance.now());
process.stdout.write(
  `${JSON.stringify({ ...wynik, agent: `Node ${process.versions.node} (V8 ${process.versions.v8})` })}\n`,
);
