/* Pomiar tempa badań dla `npm run bot -- --badania` (docs/superpowers/specs/2026-10-19-badania-design.md, sekcje „Tempo”,
   „Anty-cele” i „Testy i bramka”). Gra z zarządem (playWithGov, polityka karty nocy „zawsze-warta”, 4 osoby) przez
   `dni` dni (domyślnie 21, czyli przez całą pierwszą zimę, dni 11–20) na ziarnach 1–5 albo na jednym podanym, dwa razy
   na tym samym świecie: z polityką badań gracza z tests/unit/m2-play.ts (pracownia na początku kolejki, najtańsza kartka
   do wzięcia, jedna osoba zarządu przy stole za dnia, lokatorzy z wiedzą siadają sami, budowle z technologii z kolejki)
   i bez niej (ten sam gracz bez badań), żeby zimę z badaniami i bez nich porównać na tych samych liczbach.
   Wypisuje: dzień, w którym stanęła pracownia; dzień każdej technologii; liczbę technologii na początku dnia 11 (zimy)
   i 16 oraz dzień, w którym zbadana jest cała era 2 (wszystkie 11 technologii); pierwszą technologię po pracowni (godziny
   od jej postawienia); kto siedział przy stole (godziny zarządu i lokatorów); pierwszą zimę (dni 11–20): zgony, jedzenie
   (zapasy i garnek), drewno, temperatury w naszych mieszkaniach i ciepło zarządu, próbkowane co godzinę gry.
   Świat to demo `--demo=NAZWA` (przymorze, lanciego, zielonki; domyślnie przymorze), z mieszkańcami z adresu przy
   `--mieszkancy` (wzorzec tempa) albo bez. Ziarno świata i gry to ziarno pomiaru, jak w innych botach. Dwie flagi
   zmieniają gospodarkę pomiaru: `--sasiedzi` (od dnia 2 jedna osoba chodzi do sąsiadów po łup) i `--jedzenie` (zapas
   jedzenia nie spada poniżej progu, jakby głodu nie było). Bez nich bot głoduje od dnia 7–10 i zimą badania prawie
   stoją, bo głodna osoba z zarządu nie siedzi przy stole; `--jedzenie` mierzy wtedy samo tempo, bez tego zakłócenia.
   Pomiar niczego nie wymusza: cele tempa są policzone obok liczb (tak/nie), a błąd wykonania daje tylko zły argument.
   Gra bez łańcuchów kart (`playWithGov` bez opcji `lancuchy`, zarząd z `newGov` bez przełącznika): pomiar dotyczy tempa badań,
   a łańcuchy dokładałyby gości i zajmowały ludzi przy stole; gra w przeglądarce ma je domyślnie, boty `bot` i `bot:zombie` też. */

import fs from 'node:fs';
import path from 'node:path';
import { kartka, odkrycia, type StanKartki, TECH_BY, TECHS } from '../src/sim/badania.ts';
import { dayOf, minutesAt, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { houseOf } from '../src/sim/house.ts';
import { COLD } from '../src/sim/needs.ts';
import { createSim, type Sim } from '../src/sim/sim.ts';
import { snapshot } from '../src/sim/snapshot.ts';
import { modeOf } from '../src/sim/tryb.ts';
import { buildWorld, type World } from '../src/world/world.ts';
import { type PlayOpts, playWithGov } from '../tests/unit/gov-play.ts';
import { m2Player } from '../tests/unit/m2-play.ts';
import { sasiedziPlayer } from '../tests/unit/sasiedzi-play.ts';
import { DEMO, JEDZENIE, MIESZKANCY, opisMieszkancow, SASIEDZI, swiatMieszkancow } from './bot-mieszkancy.ts';

/** początek dnia `d` w tickach (dzień 1 zaczyna się o 15:00, więc dzień d od (d − 1) · doba − 15 h) */
const startOf = (d: number) => (d - 1) * TICKS_PER_DAY - 15 * TICKS_PER_HOUR;
/** numer dnia z ułamkiem: 5,5 to południe dnia 5 (12:00 to połowa doby) */
const dzienZUlamkiem = (tick: number) => minutesAt(tick) / 1440 + 1;
const f1 = (v: number) => v.toFixed(1);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const min = (a: number[]) => (a.length ? Math.min(...a) : 0);
const hhmm = (tick: number) => {
  const m = Math.floor(minutesAt(tick)) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** pierwsza zima to dni 11–20 (SEASON_DAYS = 10, dzień 1 to początek jesieni) */
const ZIMA_OD = 11;
const ZIMA_DO = 20;

/** liczby jednego przebiegu */
export interface Przebieg {
  seed: number;
  badania: boolean;
  /** tick postawienia pracowni; −1: nie stanęła */
  pracownia: number;
  /** zbadane technologie z tickiem ukończenia, od najstarszej */
  tech: { id: string; tick: number }[];
  /** godziny przy stole pracowni: zarząd i lokatorzy */
  stol: { zarzad: number; lokatorzy: number };
  zima: {
    /** zgony naszych (zarząd i lokatorzy) w dniach 11–20 i w całej grze */
    zgony: number;
    zgonyRazem: number;
    /** jedzenie (zapasy i garnek): na początku zimy, najmniej w zimie, na końcu zimy */
    jedzenie0: number;
    jedzenieMin: number;
    jedzenie1: number;
    /** drewno w składzie i ogniu (snapshot().stock.wood) */
    drewno0: number;
    drewnoMin: number;
    drewnoSr: number;
    drewno1: number;
    /** średnia temperatura pomieszczeń naszych mieszkań i najniższa średnia z godziny, część godzin poniżej 10°C */
    tempSr: number;
    tempMin: number;
    zimno: number;
    /** zarząd: średnie ciepło (potrzeba 0–100) i część próbek z ciepłem poniżej COLD */
    cieplo: number;
    wychlodzony: number;
    /** zarząd: średnie najedzenie */
    najedzenie: number;
  };
  /** budowle z technologii, które stanęły (rodzaj, tick) */
  budowle: { kind: string; tick: number }[];
  /** technologie z działaniem, których po `dni` dniach nie ma: stan kartki i wiedza osady wobec progu */
  niezbadane: { id: string; stan: StanKartki; ma: number; trzeba: number }[];
  skrot: string;
}

/** opcje jednego przebiegu */
export interface OpcjePrzebiegu {
  /** polityka badań gracza (pracownia, kartka, przy stole osoba zarządu); false: ten sam gracz bez badań */
  badania: boolean;
  /** liczba dni gry od 15:00 pierwszego dnia */
  dni: number;
  /** mieszkańcy z adresu (opcja `mieszkancy` createSim); bez nich gra jak przed krokiem 5 */
  mieszkancy?: PlayOpts['mieszkancy'];
  /** od dnia 2 jedna osoba chodzi do sąsiadów (--sasiedzi) */
  sasiedzi?: boolean;
  /** jedzenie z niczego: zapas nie spada poniżej progu, jakby głodu nie było (--jedzenie) */
  jedzenie?: boolean;
}

/** zapas jedzenia (porcje), poniżej którego opcja `jedzenie` dokłada do kompletu; więcej niż starcza zarządowi na dobę */
const ZAPAS_JEDZENIA = 30;

/** Jeden przebieg: gra z zarządem przez `dni` dni od 15:00 pierwszego dnia. */
export function przebieg(world: World, seed: number, opcje: OpcjePrzebiegu): Przebieg {
  const { badania, dni, mieszkancy, sasiedzi = false, jedzenie: syci = false } = opcje;
  const m2 = m2Player({ search: true, furniture: true, badania });
  const nb = sasiedzi ? sasiedziPlayer() : null;
  const hs = houseOf(world)!;
  const stol = { zarzad: 0, lokatorzy: 0 };
  const probki = {
    jedzenie: [] as number[],
    drewno: [] as number[],
    temp: [] as number[],
    cieplo: [] as number[],
    najedzenie: [] as number[],
  };
  let jedzenie0 = 0;
  let jedzenie1 = 0;
  let drewno0 = 0;
  let drewno1 = 0;
  const player = (sim: Sim, w: World, s: number, order: Parameters<typeof m2.player>[3]) => {
    nb?.player(sim, w, s, order);
    m2.player(sim, w, s, order);
    const st = sim.st;
    if (syci) {
      const zapas = st.things.filter((t) => t.kind === 'jedzenie');
      const ile = zapas.reduce((a, t) => a + t.n, 0);
      if (zapas.length && ile < ZAPAS_JEDZENIA) zapas[0].n += ZAPAS_JEDZENIA - ile;
    }
    for (const p of st.pawns)
      if (p.job?.t === 'research' && p.job.phase === 1)
        if (p.kind === 'core') stol.zarzad += TICKS_PER_SECOND / TICKS_PER_HOUR;
        else stol.lokatorzy += TICKS_PER_SECOND / TICKS_PER_HOUR;
    if (st.tick % TICKS_PER_HOUR) return;
    const naPoczatku = st.tick === startOf(ZIMA_OD);
    const naKoncu = st.tick === startOf(ZIMA_DO + 1);
    const wZimie = st.tick >= startOf(ZIMA_OD) && st.tick < startOf(ZIMA_DO + 1);
    if (!wZimie && !naKoncu) return;
    const sn = snapshot(st, w).stock;
    const jedzenie = sn.supplies + sn.meals;
    if (naPoczatku) {
      jedzenie0 = jedzenie;
      drewno0 = sn.wood;
    }
    if (naKoncu) {
      jedzenie1 = jedzenie;
      drewno1 = sn.wood;
    }
    if (!wZimie) return;
    probki.jedzenie.push(jedzenie);
    probki.drewno.push(sn.wood);
    const nasze = new Set(st.apts.filter((a) => a.ours).map((a) => a.apt));
    const temps = hs.rooms.filter((r) => nasze.has(r.apt)).map((r) => st.temps[r.id]);
    probki.temp.push(mean(temps));
    for (const p of st.pawns)
      if (p.kind === 'core' && !p.away && p.needs) {
        probki.cieplo.push(p.needs.warm);
        probki.najedzenie.push(p.needs.food);
      }
  };
  const r = playWithGov(world, seed, 'zawsze-warta', dni, 4, { player, ...(mieszkancy ? { mieszkancy } : {}) });
  const st = r.st;
  const zgony = (st.dead ?? []).filter((d) => d.kind === 'core' || d.kind === 'resident');
  const od = startOf(ZIMA_OD);
  const doo = startOf(ZIMA_DO + 1);
  const lab = m2.log.built.find((b) => b.kind === 'pracownia');
  return {
    seed,
    badania,
    pracownia: lab?.tick ?? -1,
    tech: odkrycia(st),
    stol,
    zima: {
      zgony: zgony.filter((d) => d.tick >= od && d.tick < doo).length,
      zgonyRazem: zgony.length,
      jedzenie0,
      jedzenieMin: min(probki.jedzenie),
      jedzenie1,
      drewno0,
      drewnoMin: min(probki.drewno),
      drewnoSr: mean(probki.drewno),
      drewno1,
      tempSr: mean(probki.temp),
      tempMin: min(probki.temp),
      zimno: probki.temp.filter((t) => t < 10).length / Math.max(1, probki.temp.length),
      cieplo: mean(probki.cieplo),
      wychlodzony: probki.cieplo.filter((c) => c < COLD).length / Math.max(1, probki.cieplo.length),
      najedzenie: mean(probki.najedzenie),
    },
    budowle: m2.log.built.filter((b) => b.kind in BUDOWLE_TECH),
    niezbadane: TECHS.filter((t) => t.dziala && !st.techDone?.includes(t.id)).map((t) => {
      const k = kartka(st, t.id, modeOf(st));
      return { id: t.id, stan: k.stan, ma: k.ma, trzeba: k.trzeba };
    }),
    skrot: r.hash,
  };
}

/** budowle z technologii (BuildDef.tech), do wypisania, które stanęły */
const BUDOWLE_TECH: Record<string, true> = {
  koza_beczka: true,
  kociol: true,
  pieczarkarnia: true,
  szklarnia: true,
  barykada: true,
  wieza: true,
};

/** liczba technologii zbadanych przed początkiem dnia `d` */
const doDnia = (p: Przebieg, d: number) => p.tech.filter((t) => t.tick < startOf(d)).length;
/** dzień (z ułamkiem), w którym zbadana jest cała era 2, czyli wszystkie 11 technologii z działaniem; null, gdy nie */
const eraDwa = (p: Przebieg): number | null => {
  const wszystkie = TECHS.filter((t) => t.dziala).length;
  return p.tech.length >= wszystkie ? dzienZUlamkiem(p.tech[wszystkie - 1].tick) : null;
};
/** godziny od postawienia pracowni do pierwszej technologii; null, gdy któregoś z nich nie było */
const pierwsza = (p: Przebieg): number | null =>
  p.pracownia >= 0 && p.tech.length ? (p.tech[0].tick - p.pracownia) / TICKS_PER_HOUR : null;

const cel = (ok: boolean) => (ok ? 'tak' : 'NIE');

function wypiszBadania(lista: Przebieg[]): void {
  console.log(
    '  ziarno  pracownia       1. tech. po  tech. dzień 11  dzień 16  era 2 cała  przy stole zarząd/lokatorzy [h]  budowle z technologii',
  );
  for (const p of lista) {
    const lab = p.pracownia >= 0 ? `dzień ${dayOf(p.pracownia)} ${hhmm(p.pracownia)}` : 'nie stanęła';
    const h1 = pierwsza(p);
    const era = eraDwa(p);
    console.log(
      `  ${String(p.seed).padStart(6)}  ${lab.padEnd(16)}${(h1 === null ? '—' : `${f1(h1)} h`).padStart(10)}  ${String(doDnia(p, ZIMA_OD)).padStart(14)}  ${String(doDnia(p, 16)).padStart(8)}  ${(era === null ? 'nie' : `dzień ${f1(era)}`).padStart(10)}  ${`${f1(p.stol.zarzad)} / ${f1(p.stol.lokatorzy)}`.padStart(32)}  ${p.budowle.map((b) => `${b.kind} (dzień ${dayOf(b.tick)})`).join(', ') || '—'}`,
    );
  }
  const n = lista.length;
  const lab = lista.filter((p) => p.pracownia >= 0);
  const h1 = lista.map(pierwsza).filter((v): v is number => v !== null);
  const era = lista.map(eraDwa).filter((v): v is number => v !== null);
  console.log(
    `  średnio: pracownia dzień ${lab.length ? f1(mean(lab.map((p) => dzienZUlamkiem(p.pracownia)))) : '—'}, pierwsza technologia ${h1.length ? f1(mean(h1)) : '—'} h po niej, technologii w dniu 11 ${f1(mean(lista.map((p) => doDnia(p, ZIMA_OD))))} (${Math.min(...lista.map((p) => doDnia(p, ZIMA_OD)))}–${Math.max(...lista.map((p) => doDnia(p, ZIMA_OD)))}), w dniu 16 ${f1(mean(lista.map((p) => doDnia(p, 16))))} (${Math.min(...lista.map((p) => doDnia(p, 16)))}–${Math.max(...lista.map((p) => doDnia(p, 16)))}), era 2 cała w ${era.length}/${n} przebiegów${era.length ? ` (dzień ${f1(mean(era))}, ${f1(Math.min(...era))}–${f1(Math.max(...era))})` : ''}`,
  );
  console.log(
    `  cele: pierwsza technologia w dobie po pracowni ${cel(h1.length === n && Math.max(...h1) <= 24)} (${h1.filter((v) => v <= 24).length}/${n}); 4–6 technologii w dniu 11 ${cel(lista.every((p) => doDnia(p, ZIMA_OD) >= 4 && doDnia(p, ZIMA_OD) <= 6))} (${lista.filter((p) => doDnia(p, ZIMA_OD) >= 4 && doDnia(p, ZIMA_OD) <= 6).length}/${n}); era 2 cała w dniach 15–16 ${cel(era.length === n && era.every((d) => d >= 15 && d < 17))} (${era.filter((d) => d >= 15 && d < 17).length}/${n}), ani jednej przed dniem 11 ${cel(era.every((d) => d >= ZIMA_OD))}`,
  );
  console.log(
    '  dzień każdej technologii (średnio po ziarnach, w nawiasie ile przebiegów ją zbadało i najwcześniej–najpóźniej):',
  );
  for (const t of TECHS.filter((x) => x.dziala)) {
    const dni = lista.flatMap((p) => p.tech.filter((x) => x.id === t.id).map((x) => dzienZUlamkiem(x.tick)));
    console.log(
      `    ${t.id.padEnd(13)} ${TECH_BY[t.id].dom.padEnd(6)} lvl ${t.lvl}  ${dni.length ? `dzień ${f1(mean(dni))} (${dni.length}/${n}, ${f1(Math.min(...dni))}–${f1(Math.max(...dni))})` : `—  (0/${n})`}`,
    );
  }
}

/** co po `dni` dniach stoi na przeszkodzie niezbadanym technologiom: liczba przebiegów według stanu kartki */
function wypiszBraki(lista: Przebieg[]): void {
  const ile = (id: string, stan: StanKartki) =>
    lista.filter((p) => p.niezbadane.some((x) => x.id === id && x.stan === stan)).length;
  const opis = ['brak_wiedzy', 'najpierw', 'do_wziecia', 'w_toku', 'stoi'] as const;
  const wiersze = TECHS.filter((t) => t.dziala)
    .map((t) => ({
      t,
      razem: opis.reduce((a, s) => a + ile(t.id, s), 0),
      tekst: opis
        .filter((s) => ile(t.id, s))
        .map((s) => `${s.replace('_', ' ')} ${ile(t.id, s)}`)
        .join(', '),
    }))
    .filter((w) => w.razem);
  if (!wiersze.length) {
    console.log('  na koniec zbadane wszystkie technologie z działaniem we wszystkich przebiegach');
    return;
  }
  console.log(
    '  niezbadane na koniec (liczba przebiegów według stanu kartki; „brak wiedzy”: nikt w osadzie nie zna dziedziny na poziomie technologii):',
  );
  for (const w of wiersze) {
    const ma = Math.max(...lista.flatMap((p) => p.niezbadane.filter((x) => x.id === w.t.id).map((x) => x.ma)));
    console.log(
      `    ${w.t.id.padEnd(13)} ${TECH_BY[w.t.id].dom.padEnd(6)} lvl ${w.t.lvl} (najlepsza wiedza osady w tych przebiegach ${ma}): ${w.tekst}`,
    );
  }
}

function wypiszZime(nazwa: string, lista: Przebieg[]): void {
  const z = lista.map((p) => p.zima);
  console.log(
    `  ${nazwa.padEnd(11)} zgony w zimie ${z.map((x) => x.zgony).join('/')} (razem ${z.map((x) => x.zgonyRazem).join('/')}); jedzenie: start ${f1(mean(z.map((x) => x.jedzenie0)))}, najmniej ${f1(mean(z.map((x) => x.jedzenieMin)))}, koniec ${f1(mean(z.map((x) => x.jedzenie1)))}; drewno: start ${f1(mean(z.map((x) => x.drewno0)))}, średnio ${f1(mean(z.map((x) => x.drewnoSr)))}, najmniej ${f1(mean(z.map((x) => x.drewnoMin)))}, koniec ${f1(mean(z.map((x) => x.drewno1)))}`,
  );
  console.log(
    `  ${''.padEnd(11)} mieszkania ${f1(mean(z.map((x) => x.tempSr)))}°C średnio, najzimniejsza godzina ${f1(mean(z.map((x) => x.tempMin)))}°C, godzin poniżej 10°C ${Math.round(100 * mean(z.map((x) => x.zimno)))}%; zarząd: ciepło ${f1(mean(z.map((x) => x.cieplo)))}, wychłodzony (ciepło < ${COLD}) ${Math.round(100 * mean(z.map((x) => x.wychlodzony)))}% próbek, najedzenie ${f1(mean(z.map((x) => x.najedzenie)))}`,
  );
}

/** Pomiar na ziarnach `ziarna`, `dni` dni gry; wypisuje tabele i zwraca przebiegi z badaniami i bez nich. */
export async function pomiarBadan(ziarna: number[], dni: number): Promise<{ z: Przebieg[]; bez: Przebieg[] }> {
  const nazwa = DEMO ?? 'przymorze';
  const plik = path.resolve(import.meta.dirname, `../public/demo/${nazwa}.json`);
  if (!fs.existsSync(plik)) {
    console.error(`Nieznane demo: „${nazwa}”. Dema to pliki public/demo/*.json (przymorze, lanciego, zielonki).`);
    process.exit(2);
  }
  const demo = JSON.parse(fs.readFileSync(plik, 'utf8'));
  console.log(
    `Bot badań, ${demo.name}${MIESZKANCY ? ', z mieszkańcami z adresu' : ', bez mieszkańców z adresu'}${SASIEDZI ? ', z wyprawami do sąsiadów' : ''}${JEDZENIE ? ', z jedzeniem z niczego (bez głodu)' : ''}: ziarna ${ziarna.join(', ')}; ${dni} dni z zarządem (zawsze warta); pierwsza zima to dni ${ZIMA_OD}–${ZIMA_DO}`,
  );
  const z: Przebieg[] = [];
  const bez: Przebieg[] = [];
  const t0 = performance.now();
  for (const seed of ziarna) {
    const osiedle = MIESZKANCY ? await swiatMieszkancow(demo, seed, 4) : null;
    const world = osiedle ? osiedle.world : buildWorld(demo.geo, { seed, street: demo.street });
    if (osiedle && seed === ziarna[0])
      console.log(`  ${opisMieszkancow(createSim(world, seed, { core: 4, mieszkancy: osiedle.mieszkancy }))}`);
    z.push(
      przebieg(world, seed, {
        badania: true,
        dni,
        mieszkancy: osiedle?.mieszkancy,
        sasiedzi: SASIEDZI,
        jedzenie: JEDZENIE,
      }),
    );
    bez.push(
      przebieg(world, seed, {
        badania: false,
        dni,
        mieszkancy: osiedle?.mieszkancy,
        sasiedzi: SASIEDZI,
        jedzenie: JEDZENIE,
      }),
    );
  }
  console.log('\nZ badaniami (pracownia, najtańsza kartka, jedna osoba zarządu przy stole za dnia, lokatorzy sami):');
  wypiszBadania(z);
  wypiszBraki(z);
  console.log(`\nPierwsza zima, dni ${ZIMA_OD}–${ZIMA_DO} (zgony na ziarno; reszta średnio po ziarnach):`);
  wypiszZime('z badaniami', z);
  wypiszZime('bez badań', bez);
  console.log(`\nskróty stanu z badaniami: ${z.map((p) => `${p.seed}: ${p.skrot}`).join(', ')}`);
  console.log(`skróty stanu bez badań:   ${bez.map((p) => `${p.seed}: ${p.skrot}`).join(', ')}`);
  console.log(`(${Math.round(performance.now() - t0)} ms)`);
  return { z, bez };
}
