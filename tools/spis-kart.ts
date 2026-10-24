/* Spis kart na grę (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, „Jak sprawdzamy”: 30–40 kart na grę) i gości pod
   bramą: gra z zarządem na prawdziwej symulacji (Przymorze z mieszkańcami z generatora i obcymi), polityka zawsze-warta, gracz
   odpowiada od razu (`playWithGov`). Dla każdego ziarna: ile kart wydarzeń zarząd pokazał (decyzje rodzaju „wydarzenie”) i lejek
   gości od wylosowanej wizyty do karty: zaplanowane (wylosowane z puli: karta `gosc`, `powrot`, karty z 0.3 z gościem i, z
   `--lancuchy`, kroki łańcuchów z gościem; każde wypadnięcie planuje wizytę od razu, nic nie czeka), doszły do bramy (grupa
   widziana w fazie `brama`, `w_srodku`, `zlapany` albo `odchodzi` po bramie), karta pod bramą (okno wizyty naprawdę się otworzyło),
   zginęli w drodze, weszli albo zostali w osiedlu; z narratora (src/gov/narrator.ts) średnie napięcie i jaką część czasu
   przekraczało 60. Na końcu średnie na grę i udział wizyt z kartą.

   Kontrole z bramki końcowej (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, „Jak sprawdzamy”): każda karta, która
   się otworzyła (para id i sekunda wydarzenia, widziana raz), liczy się do tabeli kart po id; naruszenia drukuje skrypt
   w linii `kontrole` (zero to dobrze): karta `handlarz` w zwykłym trybie, karta wykluczona w danym trybie (`fitsMode` z listą
   wydarzeń ulicy i `tryby` karty), karta gościa (`gosc`, `zlapany`, karty z 0.3 z grupą i kroki łańcuchów z gościem) otwarta
   bez grupy w fazie `brama` z żywym pionkiem (`zlapany` w fazie `zlapany`) albo karta z `GEventDef.gosc` otwarta bez grupy
   (`gid`), karta o nieznanym id. Przy łańcuchach do tego wątki sezonu wybrane w każdym ziarnie (`watki.wybrane`) i ile kroków
   każdy zrobił; na końcu ile różnych zestawów wątków dały ziarna.

   Użycie: node tools/spis-kart.ts [lancuchy] [tryb: zwykly|zombie] [dni] [pierwsze ziarno] [ostatnie ziarno] [demo]
   Domyślnie zwykly, 5 dób, ziarna 11–25, demo przymorze (public/demo/przymorze.json), bez łańcuchów (jak domyślna gra);
   słowo `lancuchy` włącza łańcuchy kart i wątki sezonu jak adres `?lancuchy=1`. Jedna gra to 1–3 s. */

import fs from 'node:fs';
import path from 'node:path';
import { jestKrok, krokPoId } from '../src/gov/watki.ts';
import { wizytaKarty } from '../src/gov/wizyta.ts';
import { fitsMode, M1_EVENTS } from '../src/gov/wydarzenia.ts';
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
// kontrole bramki: naruszenia (opis z ziarnem) i tabela kart po id
const naruszenia: string[] = [];
const poId = new Map<string, number>();
const defKarty = new Map(M1_EVENTS.map((e) => [e.id, e]));
const defOf = (id: string) => defKarty.get(id) ?? krokPoId(id);
const kartyGier: number[] = [];
const bezGrupy = new Map<string, number>();
const zestawy = new Map<string, number[]>();
for (let seed = od; seed <= doo; seed++) {
  const { world, mieszkancy } = await swiatMieszkancow(demo, seed, 4);
  const ids = new Set<string>();
  const brama = new Set<string>();
  const karta = new Set<string>();
  const koniec = new Map<string, string>();
  const otwarte = new Set<string>();
  let kartOtw = 0;
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
      // karta, która właśnie się otworzyła w tym kroku zarządu (gracz-bot odpowiada dopiero po tym wywołaniu)
      const ev = gov.ev.active;
      if (ev && !otwarte.has(`${ev.id}@${gov.ev.when}`)) {
        otwarte.add(`${ev.id}@${gov.ev.when}`);
        kartOtw++;
        poId.set(ev.id, (poId.get(ev.id) ?? 0) + 1);
        const gdzie = `${tryb} ziarno ${seed}, ${ev.id} w ${Math.round(gov.ev.when)} s`;
        const def = defOf(ev.id);
        if (!def) naruszenia.push(`nieznane id karty: ${gdzie}`);
        else if (!fitsMode(gov, def)) naruszenia.push(`karta wykluczona w trybie ${tryb}: ${gdzie}`);
        if (tryb === 'zwykly' && /handlarz/i.test(ev.id)) naruszenia.push(`karta handlarza w zwykłym trybie: ${gdzie}`);
        const gid = wizytaKarty(ev);
        if (gid !== null) {
          const g = i.goscie?.find((x) => x.id === gid);
          const wymagana = ev.id === 'zlapany' ? 'zlapany' : 'brama';
          if (!g) naruszenia.push(`karta gościa bez wpisu grupy ${gid}: ${gdzie}`);
          else if (g.faza !== wymagana) naruszenia.push(`karta gościa w fazie ${g.faza} zamiast ${wymagana}: ${gdzie}`);
          else if (g.pawns.length === 0) naruszenia.push(`karta gościa bez żywego pionka: ${gdzie}`);
        } else if (
          ev.id === 'gosc' ||
          ev.id === 'zlapany' ||
          ev.id === 'powrot' ||
          (def && jestKrok(def) && def.gosc)
        ) {
          naruszenia.push(`karta gościa bez grupy (gid): ${gdzie}`);
        } else if (def?.gosc) {
          // karta z 0.3 z opcjonalnym gościem otwarta bez grupy: dopuszczalna tylko jako mieszkaniec już w środku (`lok`, klatka)
          const wBloku = ev.d?.lok !== undefined;
          bezGrupy.set(
            `${ev.id}${wBloku ? ' (mieszkaniec z klatki)' : ''}`,
            (bezGrupy.get(`${ev.id}${wBloku ? ' (mieszkaniec z klatki)' : ''}`) ?? 0) + 1,
          );
          if (!wBloku)
            naruszenia.push(
              `karta z gościem otwarta bez grupy i bez mieszkańca z klatki: ${gdzie} d=${JSON.stringify(ev.d).slice(0, 200)}`,
            );
        }
      }
      const v = gov.napiecie?.v ?? 0;
      suma += v;
      probek++;
      if (v > 60) wysokie++;
    },
  });
  const k = r.decisions.filter((d) => d.kind === 'wydarzenie').length;
  kart += k;
  kartyGier.push(k);
  if (kartOtw !== k) naruszenia.push(`${tryb} ziarno ${seed}: kart otwartych ${kartOtw}, decyzji wydarzenie ${k}`);
  if (lancuchy) {
    const w = r.gov.watki;
    const kroki = Object.entries(w?.krok ?? {})
      .map(([id, n]) => `${id}:${n}`)
      .join(' ');
    const lista = [...(w?.wybrane ?? [])].sort();
    const klucz = lista.join(' + ');
    zestawy.set(klucz, [...(zestawy.get(klucz) ?? []), seed]);
    console.log(`  wątki ziarna ${seed}: ${lista.join(', ') || '(brak)'}; kroki ${kroki || '(brak)'}`);
  }
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
const kartyId = [...poId.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
console.log(`karty po id (razem ${kart}, na grę min ${Math.min(...kartyGier)}, max ${Math.max(...kartyGier)}):`);
console.log(`  ${kartyId.map(([id, n]) => `${id} ${n}`).join(', ')}`);
if (bezGrupy.size)
  console.log(
    `karty z 0.3 z opcjonalnym gościem otwarte bez grupy: ${[...bezGrupy].map(([k, n]) => `${k} ${n}`).join(', ')}`,
  );
if (lancuchy) {
  console.log(`zestawy wątków: ${zestawy.size} różnych w ${gier} grach`);
  for (const [klucz, ziarna] of zestawy) console.log(`  ${klucz || '(brak)'}: ziarna ${ziarna.join(', ')}`);
}
console.log(
  naruszenia.length
    ? `kontrole: ${naruszenia.length} naruszeń\n  ${naruszenia.join('\n  ')}`
    : 'kontrole: zero naruszeń (handlarz, wykluczone, karty gości przy bramie, nieznane id)',
);
const proc = (a: number, b: number) => `${a} z ${b} (${((100 * a) / Math.max(1, b)).toFixed(0)}%)`;
console.log(
  `razem ${gier} gier po ${dni} dób${lancuchy ? ' z łańcuchami' : ' bez łańcuchów'}: kart na grę ${(kart / gier).toFixed(1)}; lejek gości: wylosowanych ${wizyt} (${(wizyt / gier).toFixed(1)} na grę), u bramy ${proc(uBramy, wizyt)}, z kartą ${proc(zKarta, wizyt)} (${(zKarta / gier).toFixed(1)} kart gościa na grę), zginęło po drodze ${zgin}, zostało lub weszło ${zostalo}`,
);
