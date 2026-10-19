/* Strona testowa porównania silników JS (tools/determinizm.ts ładuje ją w Chromium, Firefoksie i WebKicie przez serwer
   Vite w procesie): pobiera demo/<demo>.json, liczy przebieg gry (uruchom.ts) i wystawia wynik w `window.wynik`, po
   czym Playwright go odczytuje. Parametry w adresie to zlecenie (zlecenie.ts): ?demo=przymorze&godziny=24&tryb=zwykly
   &seed=12345&powtorz=2. Błąd też trafia do `window.wynik` (pole `blad`), żeby narzędzie nie czekało do końca limitu.
   Z ?akcja=kontrola strona nic nie liczy sama, tylko wystawia `window.kontroluj(nagranie)`: nagrane gdzie indziej
   wywołania Math liczone od nowa w tym silniku, jako spis różnic (nagrywanie.ts, sprawdzNagranie).
   Strona niczego nie rysuje i nie dotyka stanu gry poza przebiegiem, więc skróty zależą tylko od silnika JS. */

import { odkodujWywolania, type SpisRoznic, sprawdzNagranie, type WywolanieJson } from './nagrywanie.ts';
import { uruchom, type WynikNogi } from './uruchom.ts';
import { zParametrow } from './zlecenie.ts';

export type WynikOk = WynikNogi & { agent: string };
export type WynikStrony = WynikOk | { blad: string };

declare global {
  interface Window {
    wynik?: WynikStrony;
    kontroluj?: (nagranie: WywolanieJson[]) => SpisRoznic;
  }
}

async function start(): Promise<WynikOk> {
  const parametry = new URLSearchParams(location.search);
  const z = zParametrow((k) => parametry.get(k));
  const odpowiedz = await fetch(`/demo/${z.demo}.json`);
  if (!odpowiedz.ok) throw new Error(`demo/${z.demo}.json: ${odpowiedz.status}`);
  const demo = await odpowiedz.json();
  const wynik = uruchom(z, { geo: demo.geo, street: demo.street }, () => performance.now());
  return { ...wynik, agent: navigator.userAgent };
}

if (new URLSearchParams(location.search).get('akcja') === 'kontrola') {
  window.kontroluj = (nagranie) => sprawdzNagranie(odkodujWywolania(nagranie));
  document.getElementById('stan')!.textContent = 'gotowa do kontroli nagrania';
} else
  start().then(
    (w) => {
      window.wynik = w;
      document.getElementById('stan')!.textContent = `gotowe: ${w.biegi.length} przebiegi`;
    },
    (e) => {
      window.wynik = { blad: String(e?.stack ?? e) };
      document.getElementById('stan')!.textContent = `błąd: ${e}`;
    },
  );
