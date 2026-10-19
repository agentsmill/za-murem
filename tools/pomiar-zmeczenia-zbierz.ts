/* Zbiera i porównuje wyniki tools/pomiar-zmeczenia.ts: każdy wariant to katalog z plikami s<ziarno>.json (po jednym
   na ziarno, po jednym biegu na politykę bota). Drukuje tabele w Markdownie: zgony na ziarno, przyczyny, pora
   i miejsce zakażeń i zgonów, ekspozycję zarządu (godziny na dworze, w środku i na wyprawach) oraz zaufanie, wkurzenie
   i koniec gry.
   Uruchomienie: node tools/pomiar-zmeczenia-zbierz.ts etykieta=katalog [etykieta=katalog …] [--zgony]
   (--zgony dopisuje listę każdego zgonu). Nic nie liczy w symulacji, tylko czyta pliki. */

import fs from 'node:fs';
import path from 'node:path';
import type { Bieg, Zgon } from './pomiar-zmeczenia.ts';

const ARGS = process.argv.slice(2);
const LISTA = ARGS.includes('--zgony');
const WARIANTY = ARGS.filter((a) => a.includes('=')).map((a) => {
  const [etykieta, katalog] = a.split('=');
  return { etykieta, katalog: path.resolve(katalog) };
});
if (!WARIANTY.length) {
  console.error('Użycie: node tools/pomiar-zmeczenia-zbierz.ts etykieta=katalog [etykieta=katalog …] [--zgony]');
  process.exit(2);
}
const POLITYKI = ['warta-dzidy', 'bez-warty'];

/** wszystkie biegi wariantu: ziarno → polityka → bieg */
function wczytaj(katalog: string): Map<number, Map<string, Bieg>> {
  const out = new Map<number, Map<string, Bieg>>();
  for (const f of fs.readdirSync(katalog)) {
    const m = /^s(\d+)\.json$/.exec(f);
    if (!m) continue;
    const biegi: Bieg[] = JSON.parse(fs.readFileSync(path.join(katalog, f), 'utf8'));
    out.set(Number(m[1]), new Map(biegi.map((b) => [b.polityka, b])));
  }
  return new Map([...out].sort((a, b) => a[0] - b[0]));
}

const dane = WARIANTY.map((w) => ({ ...w, biegi: wczytaj(w.katalog) }));
const ziarna = [...new Set(dane.flatMap((d) => [...d.biegi.keys()]))].sort((a, b) => a - b);

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const srednia = (xs: number[]) => (xs.length ? suma(xs) / xs.length : 0);
const f1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');

function tabela(naglowek: string[], wiersze: (string | number)[][]): void {
  const szer = naglowek.map((h, i) => Math.max(h.length, ...wiersze.map((w) => String(w[i] ?? '').length)));
  const linia = (w: (string | number)[]) =>
    `| ${w.map((c, i) => (i === 0 ? String(c).padEnd(szer[i]) : String(c).padStart(szer[i]))).join(' | ')} |`;
  console.log(linia(naglowek));
  console.log(`| ${szer.map((s, i) => (i === 0 ? ':' : '').padEnd(s, '-')).join(' | ')} |`);
  for (const w of wiersze) console.log(linia(w));
  console.log('');
}

function biegiWariantu(d: (typeof dane)[number], polityka: string): Bieg[] {
  return ziarna.flatMap((z) => d.biegi.get(z)?.get(polityka) ?? []);
}

/** zgony ludzi z zarządu i mieszkańców (bez szabrowników, których w trybie zombie nie ma) */
const zgonyLudzi = (b: Bieg) => b.zgony.filter((z) => z.rodzaj !== 'szabrownik');
const tabelaBota = (b: Bieg) => suma(b.noce.map((n) => n[7]));

// 1. zgony na ziarno
console.log('## Zgony na ziarno\n');
console.log(
  'Pierwsza liczba: zgony z dziennika pomiaru (wszyscy ludzie, także po ostatnim wierszu tabeli bota), w nawiasie',
);
console.log('tylko zarząd. Kolumna „koniec” to dzień końca gry, gdy gra się skończyła (pustka, bunt), inaczej „.”.\n');
for (const polityka of POLITYKI) {
  console.log(`### ${polityka}\n`);
  const nagl = ['ziarno', ...dane.flatMap((d) => [`${d.etykieta} zgony`, `${d.etykieta} koniec`])];
  const wiersze = ziarna.map((z) => [
    z,
    ...dane.flatMap((d) => {
      const b = d.biegi.get(z)?.get(polityka);
      if (!b) return ['-', '-'];
      const core = zgonyLudzi(b).filter((x) => x.rodzaj === 'core').length;
      const kon = /dzień (\d+)/.exec(b.koniec)?.[1];
      return [`${zgonyLudzi(b).length} (${core})`, b.koniec.startsWith('gra trwa') ? '.' : (kon ?? '?')];
    }),
  ]);
  wiersze.push([
    'razem',
    ...dane.flatMap((d) => {
      const bb = biegiWariantu(d, polityka);
      return [
        `${suma(bb.map((b) => zgonyLudzi(b).length))} (${suma(bb.map((b) => zgonyLudzi(b).filter((x) => x.rodzaj === 'core').length))})`,
        String(bb.filter((b) => !b.koniec.startsWith('gra trwa')).length),
      ];
    }),
  ]);
  tabela(nagl, wiersze);
}

// 2. podsumowanie liczb: tabela bota, ugryzienia, zakażenia, zaufanie, wkurzenie
console.log('## Podsumowanie wariantów\n');
console.log(
  '„Zgony wg tabeli bota” to suma kolumny zgonów z wierszy nocy, które bot zdążył wydrukować (gra, która kończy się',
);
console.log('w trakcie nocy, traci ostatni wiersz), „zgony” to wszystkie z dziennika pomiaru.\n');
{
  const nagl = [
    'wariant',
    'polityka',
    'zgony wg tabeli bota',
    'zgony',
    'ugryzienia (tabela)',
    'trafienia',
    'zakażenia',
    'koniec gry',
    'zaufanie',
    'wkurzenie',
  ];
  const wiersze: (string | number)[][] = [];
  for (const d of dane)
    for (const polityka of POLITYKI) {
      const bb = biegiWariantu(d, polityka);
      wiersze.push([
        d.etykieta,
        polityka,
        suma(bb.map(tabelaBota)),
        suma(bb.map((b) => zgonyLudzi(b).length)),
        suma(bb.map((b) => suma(b.noce.map((n) => n[5] + n[6])))),
        suma(bb.map((b) => b.trafienia)),
        suma(bb.map((b) => b.zakazenia.length)),
        bb.filter((b) => !b.koniec.startsWith('gra trwa')).length,
        f1(srednia(bb.map((b) => b.zaufanie ?? 0))),
        f1(srednia(bb.map((b) => b.wkurzenie ?? 0))),
      ]);
    }
  tabela(nagl, wiersze);
}

// 3. przyczyny
const slabyZimnem = (z: Zgon) => z.cieplo < 15 || z.jedzenie < 10 || z.sily < 10;
console.log('## Przyczyny zgonów\n');
console.log(
  'Gorączka to zgon 18 godzin po zakażeniu (skąd: siatka = ugryzienie w Sim.bite, wyprawa = karta nocy, inne);',
);
console.log(
  'rany to ostatni cios (ugryzienie szwendacza); „osłabiony” to ciepło poniżej 15, najedzenie poniżej 10 albo siły',
);
console.log(
  'poniżej 10 w chwili śmierci (zdrowie samo z siebie nie spada do zera: umiera się od ciosu albo gorączki).\n',
);
{
  const nagl = [
    'wariant',
    'polityka',
    'razem',
    'gorączka: siatka',
    'gorączka: wyprawa',
    'gorączka: inne',
    'rany: szwendacz',
    'rany: inne',
    'amputacja',
    'osłabionych',
  ];
  const wiersze: (string | number)[][] = [];
  for (const d of dane)
    for (const polityka of POLITYKI) {
      const zz = biegiWariantu(d, polityka).flatMap(zgonyLudzi);
      const skad = (s: string) =>
        zz.filter((z) => z.przyczyna === 'gorączka' && (z.zakazenie?.skad ?? 'inne') === s).length;
      wiersze.push([
        d.etykieta,
        polityka,
        zz.length,
        skad('siatka'),
        skad('wyprawa'),
        skad('inne'),
        zz.filter((z) => z.przyczyna === 'rany' && z.zadal === 'zombie').length,
        zz.filter((z) => z.przyczyna === 'rany' && z.zadal !== 'zombie').length,
        zz.filter((z) => z.przyczyna === 'amputacja').length,
        zz.filter(slabyZimnem).length,
      ]);
    }
  tabela(nagl, wiersze);
}

// 4. pora i miejsce
const godzinaPrzedzial = (h: number) =>
  h >= 7 && h < 13 ? '7–13' : h >= 13 && h < 20 ? '13–20' : h >= 20 || h < 1 ? '20–1' : '1–7';
const PRZEDZIALY = ['7–13', '13–20', '20–1', '1–7'];
console.log('## Pora: zakażenia (godzina ugryzienia) i zgony (godzina śmierci)\n');
{
  const nagl = ['wariant', 'polityka', 'co', ...PRZEDZIALY, 'razem'];
  const wiersze: (string | number)[][] = [];
  for (const d of dane)
    for (const polityka of POLITYKI) {
      const bb = biegiWariantu(d, polityka);
      const zak = bb.flatMap((b) => b.zakazenia);
      const zg = bb.flatMap(zgonyLudzi);
      for (const [co, lista] of [
        ['zakażenia', zak],
        ['zgony', zg],
      ] as [string, { godzina: number }[]][])
        wiersze.push([
          d.etykieta,
          polityka,
          co,
          ...PRZEDZIALY.map((p) => lista.filter((x) => godzinaPrzedzial(x.godzina) === p).length),
          lista.length,
        ]);
    }
  tabela(nagl, wiersze);
}

console.log('## Miejsce i praca w chwili zakażenia\n');
{
  const klucze = new Map<string, number>();
  const liczby = dane.flatMap((d) =>
    POLITYKI.map((polityka) => {
      const m = new Map<string, number>();
      for (const z of biegiWariantu(d, polityka).flatMap((b) => b.zakazenia)) {
        const k = `${z.skad === 'siatka' ? z.miejsce : z.skad} / ${z.skad === 'siatka' ? z.praca : '-'}`;
        m.set(k, (m.get(k) ?? 0) + 1);
        klucze.set(k, (klucze.get(k) ?? 0) + 1);
      }
      return m;
    }),
  );
  const nagl = [
    'miejsce / praca',
    ...dane.flatMap((d) => POLITYKI.map((p) => `${d.etykieta} ${p === 'warta-dzidy' ? 'warta' : 'bez'}`)),
  ];
  const wiersze = [...klucze].sort((a, b) => b[1] - a[1]).map(([k]) => [k, ...liczby.map((m) => m.get(k) ?? 0)]);
  tabela(nagl, wiersze);
}

// 5. ekspozycja
console.log('## Ekspozycja zarządu: godziny gry na bieg (średnia z ziaren) według pory i miejsca\n');
console.log('Pora: noc to 20:00–7:00. „Dwór” to za siatką, „podwórko” w obrębie siatki, „środek” w pomieszczeniach');
console.log(
  'siedziby, „wyprawa” poza mapą. Bieg trwa do końca 7 doby albo końca gry, więc liczby biegów z końcem gry są niższe.\n',
);
{
  const grupa = (miejsce: string) =>
    miejsce.startsWith('za siatką') ? 'dwór' : miejsce.startsWith('podwórko') ? 'podwórko' : miejsce;
  const MIEJSCA = ['dwór', 'podwórko', 'środek', 'wyprawa', 'sąsiad'];
  const nagl = ['wariant', 'polityka', 'pora', ...MIEJSCA, 'razem'];
  const wiersze: (string | number)[][] = [];
  for (const d of dane)
    for (const polityka of POLITYKI) {
      const bb = biegiWariantu(d, polityka);
      for (const pora of ['dzień', 'noc']) {
        const godz = MIEJSCA.map((m) =>
          srednia(
            bb.map((b) =>
              suma(
                Object.entries(b.ekspozycja)
                  .filter(([k]) => {
                    const [p, , gdzie] = k.split('|');
                    return p === pora && grupa(gdzie) === m;
                  })
                  .map(([, v]) => v),
              ),
            ),
          ),
        );
        wiersze.push([d.etykieta, polityka, pora, ...godz.map(f1), f1(suma(godz))]);
      }
    }
  tabela(nagl, wiersze);

  console.log('Godziny na dworze (za siatką) według pracy, średnia z ziaren:\n');
  const prace = new Map<string, number>();
  for (const d of dane)
    for (const polityka of POLITYKI)
      for (const b of biegiWariantu(d, polityka))
        for (const [k, v] of Object.entries(b.ekspozycja)) {
          const [, praca, gdzie] = k.split('|');
          if (grupa(gdzie) === 'dwór') prace.set(praca, (prace.get(praca) ?? 0) + v);
        }
  const naglP = [
    'praca',
    ...dane.flatMap((d) => POLITYKI.map((p) => `${d.etykieta} ${p === 'warta-dzidy' ? 'warta' : 'bez'}`)),
  ];
  const wierszeP = [...prace]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([praca]) => [
      praca,
      ...dane.flatMap((d) =>
        POLITYKI.map((polityka) => {
          const bb = biegiWariantu(d, polityka);
          return f1(
            srednia(
              bb.map((b) =>
                suma(
                  Object.entries(b.ekspozycja)
                    .filter(([k]) => {
                      const [, p, gdzie] = k.split('|');
                      return p === praca && grupa(gdzie) === 'dwór';
                    })
                    .map(([, v]) => v),
                ),
              ),
            ),
          );
        }),
      ),
    ]);
  tabela(naglP, wierszeP);
}

// 6. lista zgonów
if (LISTA) {
  console.log('## Zgony po kolei\n');
  for (const d of dane)
    for (const polityka of POLITYKI) {
      console.log(`### ${d.etykieta}, ${polityka}\n`);
      for (const z of ziarna) {
        const b = d.biegi.get(z)?.get(polityka);
        if (!b) continue;
        for (const x of zgonyLudzi(b)) {
          const od = x.zakazenie
            ? ` zakażony d${x.zakazenie.dzien} ${x.zakazenie.zegar} (${x.zakazenie.miejsce}, ${x.zakazenie.praca}, siły ${x.zakazenie.sily})`
            : '';
          console.log(
            `- ziarno ${z}: d${x.dzien} ${x.zegar} ${x.imie} (${x.rodzaj}) ${x.przyczyna}${x.zadal ? ` od ${x.zadal}` : ''}, ${x.miejsce}, ${x.praca}, siły ${x.sily}, zdrowie ${x.zdrowie}${od}`,
          );
        }
      }
      console.log('');
    }
}
