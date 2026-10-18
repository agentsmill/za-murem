/* Miara siatki w trybie zombie: puszcza bota trybu zombie (tools/bot-zombie.ts) na trzech osiedlach (Przymorze,
   Lanciego, Zielonki), z mieszkańcami z generatora i bez nich, na kilku ziarnach, i liczy, w której nocy siatka
   puszcza po raz pierwszy: z wartą z dzidami i bez warty. Wynik to tabela przebiegów i podsumowanie dla obu polityk:
   ile gier doszło do sześciu nocy bez przerwania, ile skończyło się przed szóstą nocą (zarząd wyginął albo go
   odwołano) i w której nocy zdarza się pierwsze przerwanie. Cel płotu odpornego na napór (docs/POSTEP.md): bez warty
   żadnego przerwania w nocach 1–2, z wartą sześć nocy bez przerwania w większości gier.
   Flaga --opal idzie do botów (opał do kozy z niczego: mierzy samą siatkę z działającą wartą, bez zimna, które po
   dwóch nocach zdejmuje wartę z posterunku). Boty chodzą równolegle jako osobne procesy Node.
   Uruchomienie: npm run bot:zombie:siatka [-- ziarno_od-ziarno_do [noce]] [--opal] [--procesy=6] */

import { spawn } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const flagi = argv.filter((a) => a.startsWith('--'));
const pozycyjne = argv.filter((a) => !a.startsWith('--'));
const OPAL = flagi.includes('--opal');
const PROCESY = Number(flagi.find((a) => a.startsWith('--procesy='))?.slice('--procesy='.length)) || 6;
const nieznane = flagi.filter((a) => a !== '--opal' && !a.startsWith('--procesy='));
if (nieznane.length) {
  console.error(`Nieznany argument: ${nieznane.join(', ')}. Znam --opal i --procesy=N.`);
  process.exit(2);
}
const [od, doZiarna] = (pozycyjne[0] ?? '1-4').split('-').map(Number);
const ZIARNA = Array.from({ length: Math.max(1, (doZiarna || od) - od + 1) }, (_, k) => od + k);
const NOCE = Number(pozycyjne[1]) || 6;
/** ile nocy bez przerwania liczy się jako sukces (sześć, a przy krótszym przebiegu tyle, ile go jest) */
const CEL = Math.min(6, NOCE);
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
const BOT = path.resolve(import.meta.dirname, 'bot-zombie.ts');

type Polityka = 'warta-dzidy' | 'bez-warty';

interface Wynik {
  /** przerwania siatki w kolejnych nocach (nocy zagranych może być mniej niż NOCE + 1, gdy gra skończyła się wcześniej) */
  przerwania: number[];
  koniec: string | null;
}

interface Przebieg {
  demo: string;
  mieszkancy: boolean;
  ziarno: number;
  wyniki: Partial<Record<Polityka, Wynik>>;
}

/** wynik jednego bota: dwie polityki z tabel w jego wyjściu */
function czytaj(wyjscie: string): Partial<Record<Polityka, Wynik>> {
  const out: Partial<Record<Polityka, Wynik>> = {};
  let pol: Polityka | null = null;
  for (const linia of wyjscie.split('\n')) {
    const g = /^\s+(warta-dzidy|bez-warty) \(/.exec(linia);
    if (g) {
      pol = g[1] as Polityka;
      out[pol] = { przerwania: [], koniec: /koniec gry: (\w+)/.exec(linia)?.[1] ?? null };
      continue;
    }
    const t = linia.trim().split(/\s+/);
    if (pol && t.length === 12 && /^\d+$/.test(t[0])) out[pol]!.przerwania.push(Number(t[4]));
  }
  return out;
}

function uruchom(demo: string, mieszkancy: boolean, ziarno: number): Promise<Przebieg> {
  const args = [BOT, String(ziarno), String(NOCE), `--demo=${demo}`];
  if (mieszkancy) args.push('--mieszkancy');
  if (OPAL) args.push('--opal');
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let wyjscie = '';
    p.stdout.on('data', (d) => {
      wyjscie += d;
    });
    p.on('error', reject);
    p.on('close', (kod) =>
      kod === 0
        ? resolve({ demo, mieszkancy, ziarno, wyniki: czytaj(wyjscie) })
        : reject(new Error(`bot ${args.slice(1).join(' ')} zakończył się kodem ${kod}`)),
    );
  });
}

/** numer pierwszej nocy z przerwaniem (od 1) albo null */
const pierwsza = (w: Wynik): number | null => {
  const k = w.przerwania.findIndex((n) => n > 0);
  return k < 0 ? null : k + 1;
};
/** CEL nocy zagranych (gra nie skończyła się wcześniej) i żadnego przerwania w nich */
const celNocy = (w: Wynik): boolean => w.przerwania.length >= CEL && w.przerwania.slice(0, CEL).every((n) => n === 0);

const zadania: { demo: string; mieszkancy: boolean; ziarno: number }[] = [];
for (const demo of DEMA)
  for (const mieszkancy of [false, true]) for (const ziarno of ZIARNA) zadania.push({ demo, mieszkancy, ziarno });

const wyniki: Przebieg[] = [];
let nastepny = 0;
async function robotnik(): Promise<void> {
  while (nastepny < zadania.length) {
    const z = zadania[nastepny++];
    wyniki.push(await uruchom(z.demo, z.mieszkancy, z.ziarno));
  }
}
await Promise.all(Array.from({ length: PROCESY }, robotnik));
wyniki.sort(
  (a, b) =>
    DEMA.indexOf(a.demo as (typeof DEMA)[number]) - DEMA.indexOf(b.demo as (typeof DEMA)[number]) ||
    Number(a.mieszkancy) - Number(b.mieszkancy) ||
    a.ziarno - b.ziarno,
);

const kolumna = (w: Wynik | undefined): string => {
  if (!w) return '-';
  const pierwszaNoc = pierwsza(w);
  return `${w.przerwania
    .map((n) => Math.min(9, n))
    .join('')
    .padEnd(NOCE + 1)}  pierwsze: ${pierwszaNoc ?? '-'}${w.koniec ? `  koniec gry (${w.koniec})` : ''}`;
};

console.log(
  `Siatka w trybie zombie: ${DEMA.length} osiedla, z mieszkańcami z generatora i bez, ziarna ${ZIARNA[0]}–${ZIARNA[ZIARNA.length - 1]}, ${NOCE} nocy${OPAL ? ', z opałem do kozy z niczego' : ''}`,
);
console.log('Przerwania siatki w kolejnych nocach (cyfra to liczba przerwań, 9: dziewięć lub więcej)\n');
console.log('osiedle    mieszk.  ziarno  z wartą                                        bez warty');
for (const r of wyniki)
  console.log(
    `${r.demo.padEnd(10)} ${(r.mieszkancy ? 'tak' : 'nie').padEnd(8)} ${String(r.ziarno).padEnd(7)} ${kolumna(r.wyniki['warta-dzidy']).padEnd(46)} ${kolumna(r.wyniki['bez-warty'])}`,
  );

console.log('');
for (const pol of ['warta-dzidy', 'bez-warty'] as const) {
  const lista = wyniki.map((r) => r.wyniki[pol]).filter((w): w is Wynik => !!w);
  const pierwsze = lista.map(pierwsza);
  const noce = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${n}: ${pierwsze.filter((x) => x === n).length}`).join('  ');
  console.log(
    `${pol === 'warta-dzidy' ? 'z wartą  ' : 'bez warty'}: gier ${lista.length}, ${CEL} nocy bez przerwania ${lista.filter(celNocy).length}, koniec gry przed nocą ${CEL} ${lista.filter((w) => w.przerwania.length < CEL).length}, przerwanie w nocy 1–2 ${pierwsze.filter((x) => x !== null && x <= 2).length}; pierwsze przerwanie w nocy ${noce}  brak: ${pierwsze.filter((x) => x === null).length}`,
  );
}
