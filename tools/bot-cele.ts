/* Bot ścieżki celów (docs/superpowers/plans/2026-10-19-sciezka-celow.md, zadanie 11; projekt: docs/superpowers/specs/
   2026-10-19-sciezka-celow-design.md, „Jak sprawdzamy budowę”): sześć przebiegów, trzy dema (Przymorze, Lanciego,
   Zielonki) w obu trybach, po 10 dni gry od 15:00 pierwszego dnia. Gracz czyta bieżący cel ścieżki (najpierw okazji, potem
   rozdziału) i robi to, co mówi jego podpowiedź: to samo polecenie z menu (`commandsAt`), ten sam przycisk (broń,
   amputacja, „Do broni!”), to samo zdarzenie interfejsu (lista ludzi, karta mieszkańca, ekran dróg) albo ta sama odpowiedź
   w oknie zarządu (karta nocy z dyżurem przy kozie i dwiema dzidami, uchwała, karta wydarzenia). Poza celami dba o drewno
   (bez niego koza gaśnie) i zbiera materiały, a w trybie zombie drewno bierze tylko z mebli, z drzew w obrębie siatki
   i z wypraw, nie zza siatki.

   Świat i gra jak w przeglądarce (`enter` w src/main.ts): ziarno z adresu dema, świat z mieszkańcami z generatora (tabele
   z public/data/mieszkancy/), obcy (handlarz, wędrowcy, ekipy), lokatorzy sąsiednich budynków z generatora, zarząd z łańcuchami
   kart i wątkami sezonu (jak adres bez `?lancuchy=0`), mapą miasta (miejsca z okolicy dema) i drogami do zwycięstwa, ludność
   kwadratu domu z 2021 roku, odczyt ścieżki
   (`krokSciezki`, `widokSciezki`) co 200 ms gry, jak okienko celów przy tempie 1×. Wszystko deterministyczne: bez losowania
   poza ziarnem gry, więc dwa uruchomienia dają to samo wyjście.

   Wyjście: dla każdego przebiegu dzień i godzina otwarcia i końca każdego rozdziału, cele, które przepadły, okazje
   z godziną każdego zaliczonego celu i (od R8) kamienie drogi ludnościowej; na końcu tabela rozdziałów dla wszystkich
   przebiegów. Kod wyjścia zależy tylko od trybu zwykłego: 1, gdy w którymś przebiegu zwykłym rozdział nie skończył się
   w limicie dni (gra przegrana też jest niepowodzeniem), przepadł jakiś cel (gracz z podpowiedziami zdąży ze wszystkimi
   nocnymi celami) albo napis z menu nie zgadzał się z podpowiedzią (gracz szuka w menu napisu z cudzysłowu; liczone w
   każdym przebiegu, nie tylko z `gadaj`); przyczyny stoją w wyjściu. Przebiegi zombie zostają w tabeli i w wyjściu jako
   informacja i kodu wyjścia nie zmieniają. Powód: ścieżka w zombie staje na R5 albo R6 (deski na ogródek, pracownia i
   badania) także wtedy, gdy nikt nie umiera (`bezsmierci`), więc czerwony kod z zombie zasłaniałby w bocie każdą
   prawdziwą regresję w trybie zwykłym. To pytanie o projekt ścieżki w zombie (przegląd spójności), nie o bota; gdy
   zapadnie decyzja, zombie wraca do kodu wyjścia.
   Rozdział, którego nie da się skończyć na jakiejś mapie, poprawia się w celu albo w jego zapasowym warunku (projekt i
   kod ścieżki), nie w bocie.

   Uruchomienie: npm run bot:cele [-- dni] [zwykly|zombie] [--demo=NAZWA] [ziarno:N] [cele] [gadaj] [rownolegle] [karty] [lancuchy=0]
   - dni (domyślnie 10), `zwykly` albo `zombie` i `--demo=NAZWA` (przymorze, lanciego, zielonki) zawężają przebiegi;
   - `ziarno:N` przesuwa ziarno gry względem adresu dema: inna gra na tym samym osiedlu, do sprawdzenia, czy wynik nie
     jest przypadkiem;
   - `cele` dopisuje pod każdym rozdziałem godzinę każdego zaliczonego celu, `gadaj` drukuje grę sekunda po sekundzie
     (polecenia gracza, wybory w oknach zarządu, co godzinę stan zarządu);
   - `lancuchy=0` gra bez łańcuchów kart i wątków sezonu (jak adres `?lancuchy=0`; zarząd z samą pulą kart, tak grał bot do
     scalenia etapów 4–5 wydarzeń);
   - `rownolegle`: gracz robi od razu wszystkie niezrobione cele rozdziału, a nie tylko bieżący (domyślnie bieżący, bo
     tylko jego podpowiedź jest na ekranie);
   - `karty` dopisuje analizę R4 „Przyjmijcie kogoś nowego” (okno od otwarcia R4 do zaliczenia celu albo końca gry): karty
     zdarzeń, w tym karty gości i kroki łańcuchów, ile z nich oferowało przyjęcie i ile przyjęto (wraz ze zmianą ludności po
     dwóch godzinach gry), rozmowy, pytania o rękę i zaproszenia wędrowców przy siatce, zmiany ludności i godzinę celu `nowi`.
     Każdy przebieg kończy ta analiza jedną linią `R4LINIA klucz=wartość …` do zbiorczego parsowania skryptem;
   - `bezsmierci` i `przybysz` są wyłącznie do analizy, nie do tabeli: pierwszy nie pozwala zarządowi marnieć (zdrowie,
     jedzenie, siły i ciepło nie spadają poniżej połowy, ugryzienie znika), żeby było widać, jak daleko szłaby ścieżka w
     trybie zombie, gdyby kolonia przetrwała; drugi przyjmuje do zarządu jedną osobę w dobę po otwarciu R4, jakby ją
     przyprowadziła karta („Wciągnąć do roboty”), żeby cel „Przyjmijcie kogoś nowego” nie wstrzymywał reszty. */

import fs from 'node:fs';
import path from 'node:path';
import { makePerson } from '../src/content/people.ts';
import { hashString, mulberry } from '../src/core/rng.ts';
import { wordsEnOfWorld, wordsOfWorld } from '../src/gov/miejsce.ts';
import type { Prompt } from '../src/gov/typy.ts';
import { LANCUCHY_TRESC } from '../src/gov/watki-tresc.ts';
import { emptyEffects } from '../src/gov/wspolne.ts';
import { wlaczMiasto } from '../src/gov/wyprawy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  pending,
  signLaw,
} from '../src/gov/zarzad.ts';
import { grajDalej, wlaczZwyciestwo } from '../src/gov/zwyciestwo.ts';
import { clockOf, dayOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '../src/sim/clock.ts';
import { applyGov, lawsFrom } from '../src/sim/gov.ts';
import { zrodloLokatorow } from '../src/sim/lokatorzy.ts';
import { createSim, Sim, type SimState } from '../src/sim/sim.ts';
import { populacja, snapshot } from '../src/sim/snapshot.ts';
import type { GameMode } from '../src/sim/tryb.ts';
import { krokSciezki, nowyStanSciezki, type StanSciezki, type WidokSciezki, widokSciezki } from '../src/ui/sciezka.ts';
import { ROZDZIALY } from '../src/ui/sciezka-rozdzialy.ts';
import { okolicaZGeo } from '../tests/unit/miasto-play.ts';
import { type Gra, type Gracz, nowyGracz, odczyt, wejscie } from './bot-cele-gracz.ts';
import {
  ARGUMENTY,
  BADANIA,
  DEMO,
  JEDZENIE,
  ludnoscDema,
  MIASTO,
  MIESZKANCY,
  OPAL,
  SASIEDZI,
  swiatMieszkancow,
  ZWYCIESTWO,
} from './bot-mieszkancy.ts';

/* ---------------------------------------------------------------- argumenty */

const FLAGI_OBCE = { MIESZKANCY, SASIEDZI, MIASTO, ZWYCIESTWO, OPAL, BADANIA, JEDZENIE };
const obce = Object.entries(FLAGI_OBCE)
  .filter(([, v]) => v)
  .map(([k]) => k);
if (obce.length) {
  console.error(
    `bot:cele zawsze gra z mieszkańcami z adresu, sąsiadami, mapą miasta i drogami, więc nie zna flag: ${obce.join(', ')}. Zna tylko --demo=NAZWA, dni, zwykly|zombie, gadaj, cele, rownolegle, karty, lancuchy=0, bezsmierci, przybysz i ziarno:N.`,
  );
  process.exit(2);
}

/** dema, na których gra bot (pliki public/demo/*.json) */
const DEMA = ['przymorze', 'lanciego', 'zielonki'] as const;
const TRYBY: readonly GameMode[] = ['zwykly', 'zombie'];

const DNI = Number(ARGUMENTY.find((a) => /^\d+$/.test(a))) || 10;
const TRYB = ARGUMENTY.find((a) => a === 'zwykly' || a === 'zombie') as GameMode | undefined;
const GADAJ = ARGUMENTY.includes('gadaj');
const CELE = ARGUMENTY.includes('cele');
const ROWNOLEGLE = ARGUMENTY.includes('rownolegle');
const KARTY = ARGUMENTY.includes('karty');
/** łańcuchy kart i wątki sezonu zarządu jak w grze w przeglądarce (`newGov(…, true)` w src/main.ts); `lancuchy=0` je wyłącza,
    jak adres `?lancuchy=0` */
const LANCUCHY = !ARGUMENTY.includes('lancuchy=0');
const BEZ_SMIERCI = ARGUMENTY.includes('bezsmierci');
const PRZYBYSZ = ARGUMENTY.includes('przybysz');
/** przesunięcie ziarna względem adresu dema (`ziarno:N`): inna gra na tym samym osiedlu, do sprawdzenia, czy wynik nie jest przypadkiem */
const PRZESUNIECIE = Number(ARGUMENTY.find((a) => /^ziarno:\d+$/.test(a))?.slice(7)) || 0;
const nieznaneArgumenty = ARGUMENTY.filter(
  (a) =>
    !/^\d+$/.test(a) &&
    !['zwykly', 'zombie', 'gadaj', 'cele', 'rownolegle', 'karty', 'lancuchy=0', 'bezsmierci', 'przybysz'].includes(a) &&
    !/^ziarno:\d+$/.test(a),
);
if (nieznaneArgumenty.length || (DEMO !== null && !(DEMA as readonly string[]).includes(DEMO))) {
  console.error(
    `Nieznany argument: ${[...nieznaneArgumenty, ...(DEMO !== null && !(DEMA as readonly string[]).includes(DEMO) ? [`--demo=${DEMO}`] : [])].join(', ')}. Dema: ${DEMA.join(', ')}; tryby: zwykly, zombie.`,
  );
  process.exit(2);
}

/* ---------------------------------------------------------------- gra */

/** Nowa gra na demie w danym trybie, tą drogą co `enter` w src/main.ts. */
async function nowaGra(demo: string, tryb: GameMode): Promise<Gra> {
  const plik = path.resolve(import.meta.dirname, `../public/demo/${demo}.json`);
  const d = JSON.parse(fs.readFileSync(plik, 'utf8'));
  const seed = ((Number.parseInt(hashString(d.addr), 16) || 2051) + PRZESUNIECIE) >>> 0;
  const osiedle = await swiatMieszkancow(d, seed, 4);
  const w = osiedle.world;
  const st = createSim(w, seed, { core: 4, mode: tryb, obcy: true, mieszkancy: osiedle.mieszkancy });
  const sim = new Sim(w, st);
  sim.lokatorzy = zrodloLokatorow(w, osiedle.geo, osiedle.dane);
  const gov = newGov(seed, tryb, LANCUCHY);
  wlaczMiasto(gov);
  wlaczZwyciestwo(gov);
  return {
    demo,
    nazwa: d.name,
    tryb,
    seed,
    w,
    sim,
    gov,
    sciezka: nowyStanSciezki(),
    okolica: okolicaZGeo(d.geo),
    ludnosc2021: (await ludnoscDema(d)).ludnosc2021,
    hqName: w.buildings[w.hq]?.name ?? '',
    words: wordsOfWorld(w),
    wordsEn: wordsEnOfWorld(w),
    zaznaczony: false,
  };
}

/* ---------------------------------------------------------------- przebieg */

/** zdarzenie z przebiegu: tick, rodzaj i klucz (rozdział, cel albo okazja) */
interface Zdarzenie {
  tick: number;
  co: 'otwarcie' | 'koniec' | 'cel' | 'przepadl' | 'okazja' | 'okazja-koniec';
  klucz: string;
}

/** id kroków łańcuchów kart (karty łańcucha liczy analiza R4 osobno od kart gości) */
const KROKI_LANCUCHOW = new Set(LANCUCHY_TRESC.flatMap((l) => l.kroki.map((k) => k.id)));

/** wybór karty, który przyjmuje ludzi („Przyjąć do spółdzielni”, „Przyjąć całą rodzinę”, „Wciągnąć do roboty”), bez zwierząt
    („Przygarnąć”) i darów („Przyjąć worek”) */
const LUDZIE = /^(Przyjąć (do |całą |na stałe|wszystkich)|Wciągnąć)/;

/** karta zdarzenia pokazana graczowi (analiza R4, argument `karty`) */
interface KartaR4 {
  tick: number;
  id: string;
  /** krok łańcucha kart (id z `LANCUCHY_TRESC`) */
  lancuch: boolean;
  tytul: string;
  /** któryś dostępny wybór przyjmuje ludzi na stałe („Przyjąć do spółdzielni”, „Przyjąć całą rodzinę”, „Wciągnąć do roboty”) */
  proszacy: boolean;
  /** któryś dostępny wybór wpuszcza ludzi choćby na noc („Wpuścić na noc”) albo na stałe */
  wpuscic: boolean;
  /** karta ma wybór przyjęcia albo wpuszczenia, ale wyszarzony (grupa już nie stoi pod bramą) */
  wyszarzona: boolean;
  wybor: string;
  /** wybrany wybór przyjmuje ludzi na stałe (`LUDZIE`) */
  wpuszczono: boolean;
  /** ludność pod zarządem w chwili wyboru i dwie godziny gry później (grupa potrzebuje czasu, żeby dojść od krawędzi mapy);
      tylko dla kart z przyjęciem, a `po` dopiero po tych dwóch godzinach */
  ludnosc?: { przed: number; po?: number };
}

/** Okno celu `nowi` (analiza R4, argument `karty`): od otwarcia R4 do zaliczenia celu albo do końca przebiegu. */
interface AnalizaR4 {
  otwarcie: number | null;
  /** tick zaliczenia celu `nowi`; null, gdy go nie zaliczono */
  nowi: number | null;
  /** koniec okna: zaliczenie `nowi` albo koniec przebiegu (przegrana, limit dni) */
  koniec: number;
  karty: KartaR4[];
  /** zmiany ludności pod zarządem w oknie (przyrost dodatni, ubytek ujemny) */
  zmiany: { tick: number; d: number }[];
  /** okazje wędrowca przy siatce (O1) otwarte w oknie */
  wedrowcy: number;
  /** rozmowy, pytania o rękę i zaproszenia, które gracz zlecił w oknie (różnica liczników gracza) */
  werbunek: { rozmowy: number; rece: number; zaproszenia: number };
}

interface Wynik {
  demo: string;
  nazwa: string;
  tryb: GameMode;
  seed: number;
  zdarzenia: Zdarzenie[];
  /** jak się skończył przebieg: koniec limitu dni albo przegrana gra (z przyczyną) */
  koniec: { tick: number; przegrana: string | null };
  ms: number;
  /** rozdziały, które istnieją w tej grze, po kolei, z tytułem */
  rozdzialy: { k: string; tytul: string }[];
  /** droga ludnościowa w R8: kamienie, liczba osób i miejsca w siedzibie przy otwarciu rozdziału oraz przy zaliczeniu celu `ludnosc` */
  r8?: { kamien0: number; ludnosc0: number; miejsc: number; kamien1?: number; ludnosc1?: number };
  /** napisy menu, które nie zgadzały się z podpowiedzią (gracz szuka w menu napisu z cudzysłowu): każda niezgodność raz */
  uwagi: string[];
  /** analiza celu `nowi` w R4 (tylko z argumentem `karty`) */
  r4?: AnalizaR4;
  /** okienko celów na koniec przebiegu: rozdział i jego cele (przy rozdziale niedokończonym widać, co go trzyma) */
  stan: {
    rozdzial: string | null;
    cele: { key: string; tekst: string; jak: string; done: boolean; missed: boolean; czeka?: string }[];
  };
}

/** różnica dwóch kolejnych stanów ścieżki jako zdarzenia (otwarcia i końce rozdziałów, zaliczone i przepadłe cele, okazje) */
function roznica(przed: StanSciezki, po: StanSciezki, tick: number): Zdarzenie[] {
  const z: Zdarzenie[] = [];
  if (przed.rozdzial !== po.rozdzial) {
    z.push({ tick, co: 'koniec', klucz: przed.rozdzial });
    if (po.rozdzial !== 'koniec') z.push({ tick: po.od, co: 'otwarcie', klucz: po.rozdzial });
  }
  for (const k of Object.keys(po.zrobione))
    if (!Object.hasOwn(przed.zrobione, k)) z.push({ tick: po.zrobione[k], co: 'cel', klucz: k });
  for (const k of po.przepadle) if (!przed.przepadle.includes(k)) z.push({ tick, co: 'przepadl', klucz: k });
  if (przed.okazja?.k !== po.okazja?.k || przed.okazja?.od !== po.okazja?.od) {
    if (przed.okazja) z.push({ tick, co: 'okazja-koniec', klucz: przed.okazja.k });
    if (po.okazja) z.push({ tick: po.okazja.od, co: 'okazja', klucz: po.okazja.k });
  }
  return z;
}

/** Jedna gra przez `dni` dni: sekunda po sekundzie jak w grze przy tempie 1× (20 kroków symulacji, krok zarządu z oknami),
    krok ścieżki co 200 ms i po każdym oknie, a gracz decyduje raz na sekundę. */
async function przebieg(demo: string, tryb: GameMode, dni: number): Promise<Wynik> {
  const t0 = performance.now();
  const g = await nowaGra(demo, tryb);
  const { sim } = g;
  const { st } = sim;
  const zdarzenia: Zdarzenie[] = [];
  let r8: Wynik['r8'];
  // analiza R4 (argument `karty`): karty zdarzeń, zmiany ludności i liczniki werbunku z chwili otwarcia R4 i zaliczenia `nowi`
  const karty: KartaR4[] = [];
  const zmiany: AnalizaR4['zmiany'] = [];
  let werbunek0: AnalizaR4['werbunek'] | undefined;
  let werbunek1: AnalizaR4['werbunek'] | undefined;
  const odczytStart = odczyt(g);
  const rozdzialy = ROZDZIALY.filter((r) => r.jest?.(odczytStart) !== false).map((r) => ({
    k: r.k as string,
    tytul: r.tytul(odczytStart),
  }));
  zdarzenia.push({ tick: 0, co: 'otwarcie', klucz: 'r0' });
  let widok: WidokSciezki = widokSciezki(g.sciezka, odczytStart);

  /** krok ścieżki na odczycie z tej chwili: zapisuje różnicę stanu jako zdarzenia */
  const krokS = (): WidokSciezki => {
    const o = odczyt(g);
    const przed = g.sciezka;
    g.sciezka = krokSciezki(przed, o);
    const nowe = roznica(przed, g.sciezka, st.tick);
    zdarzenia.push(...nowe);
    for (const z of nowe) {
      if (KARTY && z.co === 'otwarcie' && z.klucz === 'r4') werbunek0 = gracz.werbunek();
      if (KARTY && z.co === 'cel' && z.klucz === 'r4.nowi') werbunek1 = gracz.werbunek();
      if (z.co === 'otwarcie' && z.klucz === 'r8')
        r8 = {
          kamien0: g.sciezka.start.kamienLudnosci,
          ludnosc0: g.sciezka.start.ludnosc,
          miejsc: wejscie(g).cap ?? 0,
        };
      if (z.co === 'cel' && z.klucz === 'r8.ludnosc' && r8) {
        r8.kamien1 = g.gov.zwyciestwo?.kamienie.ludnosc ?? 0;
        r8.ludnosc1 = populacja(st).razem;
      }
    }
    widok = widokSciezki(g.sciezka, o);
    return widok;
  };

  const gracz = nowyGracz(
    g,
    (tekst) => {
      if (GADAJ) console.log(`  ${hhmm(st.tick)} ${tekst}`);
    },
    ROWNOLEGLE,
  );
  gracz.start();
  const koniecTick = dni * TICKS_PER_DAY;
  let przegrana: string | null = null;
  let przybyl = false;
  let ludnoscPoprz = populacja(st).razem;
  const naKarte = (p: Extract<Prompt, { k: 'wydarzenie' }>, k: number): void => {
    if (!KARTY) return;
    const k0 = p.choices[k]?.label.pl ?? '';
    karty.push({
      ludnosc: LUDZIE.test(k0) ? { przed: populacja(st).razem } : undefined,
      tick: st.tick,
      id: p.id,
      lancuch: KROKI_LANCUCHOW.has(p.id),
      tytul: p.title.pl,
      proszacy: p.choices.some((c) => c.ok && LUDZIE.test(c.label.pl)),
      wpuscic: p.choices.some((c) => c.ok && (LUDZIE.test(c.label.pl) || /^Wpuścić/.test(c.label.pl))),
      wyszarzona: p.choices.some((c) => !c.ok && (LUDZIE.test(c.label.pl) || /^Wpuścić/.test(c.label.pl))),
      wybor: p.choices[k]?.label.pl ?? '',
      wpuszczono: LUDZIE.test(p.choices[k]?.label.pl ?? ''),
    });
  };
  while (st.tick < koniecTick) {
    for (let t = 0; t < TICKS_PER_SECOND; t++) {
      sim.step();
      if (t % 4 === 3) krokS();
    }
    if (KARTY) {
      const razem = populacja(st).razem;
      if (razem !== ludnoscPoprz) zmiany.push({ tick: st.tick, d: razem - ludnoscPoprz });
      ludnoscPoprz = razem;
      for (const k of karty)
        if (k.ludnosc && k.ludnosc.po === undefined && st.tick >= k.tick + 2 * TICKS_PER_HOUR) k.ludnosc.po = razem;
    }
    if (BEZ_SMIERCI) podtrzymaj(g);
    if (PRZYBYSZ && !przybyl && g.sciezka.rozdzial === 'r4' && st.tick - g.sciezka.od >= TICKS_PER_DAY) {
      przybyl = true;
      dajPrzybysza(g);
    }
    applyGov(st, g.w, govUpdate(g.gov, wejscie(g)));
    for (let k = 0; k < 6; k++) {
      const p = pending(g.gov, wejscie(g));
      if (!p) break;
      odpowiedz(g, gracz, p, krokS(), naKarte);
    }
    gracz.krok(krokS());
    if (GADAJ && st.tick % 800 === 0 && st.tick % TICKS_PER_DAY < 800 * 6) diagnoza(g);
    if (g.gov.over) {
      przegrana = `${g.gov.over}, zaufanie ${Math.round(g.gov.trust)}, wkurzenie ${Math.round(g.gov.anger)}`;
      break;
    }
  }
  return {
    demo,
    nazwa: g.nazwa,
    tryb,
    seed: g.seed,
    zdarzenia,
    koniec: { tick: st.tick, przegrana },
    ms: performance.now() - t0,
    r8,
    rozdzialy,
    uwagi: gracz.niezgodnosci(),
    r4: KARTY ? analizaR4(zdarzenia, karty, zmiany, werbunek0, werbunek1, gracz.werbunek(), st.tick) : undefined,
    stan: {
      rozdzial: widok.rozdzial?.k ?? null,
      cele: (widok.rozdzial?.cele ?? []).map((c) => ({
        key: c.key,
        tekst: c.text,
        jak: c.how,
        done: c.done && !c.missed,
        missed: !!c.missed,
        ...(c.czeka ? { czeka: c.czeka } : {}),
      })),
    },
  };
}

/** Tylko do analizy ścieżki (argument `bezsmierci`): zarząd nie marnieje. Zdrowie, jedzenie, siły i ciepło nie spadają poniżej
    połowy, a ugryzienie znika, więc nikt nie umiera z gorączki ani z ran. Pokazuje, jak daleko szłaby ścieżka w trybie
    zombie, gdyby kolonia przetrwała (w zwykłej tabeli kolonia ginie przed końcem ścieżki). Nie jest grą, którą ktoś gra. */
function podtrzymaj(g: Gra): void {
  for (const p of g.sim.st.pawns) {
    if (p.kind !== 'core' || !p.needs) continue;
    for (const k of ['health', 'food', 'rest', 'warm'] as const) p.needs[k] = Math.max(p.needs[k], 50);
    delete p.bite;
    delete p.limb;
  }
}

/** Tylko do analizy ścieżki (argument `przybysz`): doba po otwarciu R4 zarząd przyjmuje jedną osobę, jakby karta wydarzenia
    przyprowadziła kogoś („Wciągnąć do roboty”, `fx.join`). Pokazuje, jak daleko szłaby ścieżka w trybie zombie, gdyby cel
    „Przyjmijcie kogoś nowego” nie czekał na los (na blokach w zombie przychodzi tylko gość, który prosi o dołączenie). */
function dajPrzybysza(g: Gra): void {
  const { st } = g.sim;
  const fx = emptyEffects();
  fx.join.push(makePerson(mulberry(g.seed ^ 0x5eed), new Set(st.people.map((p) => p.first)), () => g.gov.nextId++));
  applyGov(st, g.w, fx);
}

/** Co godzinę sześciu pierwszych godzin doby (tylko `gadaj`): kto żyje, zdrowie i najedzenie, drewno, jedzenie, siatka, stado. */
function diagnoza(g: Gra): void {
  const { st } = g.sim;
  const sn = snapshot(st, g.w);
  const ludzie = sn.people.filter((p) => !p.away);
  const sr = (k: 'health' | 'food' | 'rest' | 'warm') =>
    ludzie.length ? Math.round(ludzie.reduce((a, p) => a + p.needs[k], 0) / ludzie.length) : 0;
  console.log(
    `  ${hhmm(st.tick)} DZIEŃ: ludność ${populacja(st).razem} (start ${g.sciezka.start?.ludnosc ?? '?'}), zarząd ${sn.people.length} (na miejscu ${ludzie.length}), mieszkańcy ${sn.residents}, zdrowie ${sr('health')}, jedzenie ${sr('food')}, siły ${sr('rest')}, ciepło ${sr('warm')}; drewno ${sn.stock.wood}, porcje ${sn.stock.supplies + sn.stock.meals}, deski ${sn.stock.boards}, złom ${sn.stock.scrap}, części ${sn.stock.parts}; siatka ${sn.fence.durability.toFixed(2)}, dziury ${sn.fence.holes.length}; szwendacze ${sn.zombies.all}, zabici ${st.tally?.killed ?? 0}, ugryzienia ${st.tally?.bites ?? 0}, zgony ${(st.dead ?? []).length}${plotTekst(st)}${planyTekst(st)}`,
  );
}

/** plany budowli w toku: materiał doniesiony z potrzebnego, praca w minutach gry i wykonawca (do diagnozy) */
function planyTekst(st: SimState): string {
  if (!st.builds.length) return '';
  const suma = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
  return `; plany ${st.builds
    .map(
      (b) =>
        `${b.kind} ${suma(b.have)}/${suma(b.need)}, praca ${Math.round(b.work / (TICKS_PER_SECOND * 0.667))}, wykonawca ${b.by}`,
    )
    .join('; ')}`;
}

/** wspólny płot w budowie: ile materiału już dowieziono z ilu potrzeba (do diagnozy) */
function plotTekst(st: SimState): string {
  const plan = st.plot?.plan;
  if (!plan) return '';
  const suma = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
  return `; płot ${suma(plan.have)} z ${suma(plan.need)} sztuk materiału`;
}

/* ---------------------------------------------------------------- okna zarządu */

/** Odpowiedź gracza na okno zarządu (skutki idą do symulacji jak w main.ts). Widok ścieżki jest ten sam, który widzi
    gracz nad oknem: linia „Cel: …” karty nocy, uchwały i spotkania mówi, o co w oknie chodzi. */
function odpowiedz(
  g: Gra,
  gracz: Gracz,
  p: Prompt,
  v: WidokSciezki,
  naKarte?: (p: Extract<Prompt, { k: 'wydarzenie' }>, k: number) => void,
): void {
  const { st } = g.sim;
  const i = wejscie(g);
  if (p.k === 'raport') ackReport(g.gov, i);
  else if (p.k === 'uchwala') {
    applyGov(st, g.w, signLaw(g.gov, i, gracz.uchwala(p)));
    g.sim.setLaws(lawsFrom(lawEffects(g.gov)));
  } else if (p.k === 'karta') {
    gracz.karta(p.card, v);
    applyGov(st, g.w, confirmNight(g.gov, i));
  } else if (p.k === 'zwyciestwo') grajDalej(g.gov);
  else {
    const k = gracz.wydarzenie(p, v);
    naKarte?.(p, k);
    if (GADAJ)
      console.log(
        `  ${hhmm(st.tick)} wydarzenie ${p.id} „${p.title.pl}”: ${p.choices
          .map((c, j) => `${j === k ? '[' : ''}${c.label.pl}${c.ok ? '' : ' (nie można)'}${j === k ? ']' : ''}`)
          .join(' / ')}`,
      );
    applyGov(st, g.w, chooseEvent(g.gov, i, k));
  }
}

/* ---------------------------------------------------------------- raport */

const hhmm = (tick: number): string => `d${dayOf(tick)} ${clockOf(tick)}`;
const tryb = (t: GameMode): string => (t === 'zombie' ? 'zombie' : 'zwykły');

/** otwarcia i końce rozdziałów z zapisanych zdarzeń: klucz rozdziału → tick */
function terminy(r: Wynik): { otwarcia: Map<string, number>; konce: Map<string, number> } {
  const otwarcia = new Map<string, number>();
  const konce = new Map<string, number>();
  for (const z of r.zdarzenia) {
    if (z.co === 'otwarcie' && !otwarcia.has(z.klucz)) otwarcia.set(z.klucz, z.tick);
    if (z.co === 'koniec' && !konce.has(z.klucz)) konce.set(z.klucz, z.tick);
  }
  return { otwarcia, konce };
}

/** rozdziały tej gry, które nie skończyły się w limicie dni (w tym te, które się nie otworzyły) */
const nieskonczone = (r: Wynik): string[] => {
  const { konce } = terminy(r);
  return r.rozdzialy.filter((x) => !konce.has(x.k)).map((x) => x.k);
};

/** okazje z oknem od otwarcia do zamknięcia i godzinami zaliczonych celów */
function okazje(r: Wynik): string[] {
  const okna: { k: string; od: number; do: number | null; cele: { key: string; tick: number }[] }[] = [];
  for (const z of r.zdarzenia) {
    if (z.co === 'okazja') okna.push({ k: z.klucz, od: z.tick, do: null, cele: [] });
    if (z.co === 'okazja-koniec') {
      const o = okna.findLast((x) => x.k === z.klucz && x.do === null);
      if (o) o.do = z.tick;
    }
  }
  for (const z of r.zdarzenia)
    if (z.co === 'cel' && /^o\d\./.test(z.klucz)) {
      const k = z.klucz.split('.')[0];
      const o = okna.findLast((x) => x.k === k && x.od <= z.tick);
      if (o) o.cele.push({ key: z.klucz.split('.')[1], tick: z.tick });
    }
  return okna.map(
    (o) =>
      `${o.k.toUpperCase()} ${hhmm(o.od)}–${o.do === null ? 'trwa' : clockOf(o.do)}${
        o.cele.length ? `: ${o.cele.map((c) => `${c.key} ${clockOf(c.tick)}`).join(', ')}` : ''
      }`,
  );
}

/** cele przepadłe (termin minął) z godziną; to zwykle cele jednej nocy (drewno na pierwszy wieczór i na noc) */
const przepadle = (r: Wynik): string[] =>
  r.zdarzenia.filter((z) => z.co === 'przepadl').map((z) => `${z.klucz} (${hhmm(z.tick)})`);

/** Powody niepowodzenia przebiegu: przegrana gra, rozdział nieskończony w limicie, cel, który przepadł (gracz z
    podpowiedziami zdąży ze wszystkimi nocnymi celami; w zombie przepadają wtedy, gdy drewna na wieczór nie ma skąd wziąć,
    czyli z tej samej przyczyny co przegrana gra) i napis menu niezgodny z podpowiedzią. Kod wyjścia 1 biorą z nich tylko
    przebiegi zwykłe; powody przebiegów zombie idą do wyjścia jako informacja (zob. nagłówek). */
function powody(r: Wynik): string[] {
  const p: string[] = [];
  if (r.koniec.przegrana) p.push(`przegrana (${r.koniec.przegrana})`);
  const brak = nieskonczone(r);
  if (brak.length) p.push(`nieskończone ${brak.join(', ')}`);
  if (przepadle(r).length) p.push(`przepadłe cele ${przepadle(r).join(', ')}`);
  if (r.uwagi.length) p.push(`menu niezgodne z podpowiedzią: ${r.uwagi.join('; ')}`);
  return p;
}

function wypisz(r: Wynik): void {
  console.log(
    `\n${r.nazwa}, ${tryb(r.tryb)}${BEZ_SMIERCI ? ' (BEZ ŚMIERCI, tylko do analizy)' : ''}${LANCUCHY ? '' : ' (bez łańcuchów kart)'}, ziarno ${r.seed.toString(16)} (${(r.ms / 1000).toFixed(1)} s)`,
  );
  const { otwarcia, konce } = terminy(r);
  for (const x of r.rozdzialy) {
    const o = otwarcia.get(x.k);
    const e = konce.get(x.k);
    console.log(
      `  ${x.k.toUpperCase()} ${x.tytul.padEnd(22)} otwarty ${o === undefined ? '—' : hhmm(o)}   koniec ${e === undefined ? 'NIE' : hhmm(e)}`,
    );
    if (GADAJ || CELE)
      for (const z of r.zdarzenia.filter((q) => q.co === 'cel' && q.klucz.startsWith(`${x.k}.`)))
        console.log(`      ${z.klucz.slice(x.k.length + 1)} ${hhmm(z.tick)}`);
  }
  if (r.r8)
    console.log(
      `  R8 droga ludnościowa: kamienie ${r.r8.kamien0} → ${r.r8.kamien1 ?? 'bez zmiany'}, osób ${r.r8.ludnosc0} → ${r.r8.ludnosc1 ?? 'bez zmiany'} (miejsc w siedzibie ${r.r8.miejsc})`,
    );
  console.log(`  cele przepadłe: ${przepadle(r).join(', ') || 'żadne'}`);
  for (const u of r.uwagi) console.log(`  UWAGA menu: ${u}`);
  if (r.r4) wypiszR4(r, r.r4);
  const ok = okazje(r);
  console.log(`  okazje: ${ok.length ? '' : 'żadnej'}`);
  for (const o of ok) console.log(`    ${o}`);
  const brak = nieskonczone(r);
  if (r.koniec.przegrana) console.log(`  PRZEGRANA ${hhmm(r.koniec.tick)}: ${r.koniec.przegrana}`);
  else console.log(`  koniec limitu: ${hhmm(r.koniec.tick)}`);
  if (brak.length) {
    console.log(`  NIESKOŃCZONE: ${brak.map((k) => k.toUpperCase()).join(', ')}`);
    if (r.stan.rozdzial)
      console.log(
        `    ${r.stan.rozdzial.toUpperCase()} trzymają: ${
          r.stan.cele
            .filter((c) => !c.done && !c.missed)
            .map((c) => (c.czeka ? `${c.key} (${c.czeka})` : c.key))
            .join(', ') || 'nic (rozdział czeka na krok)'
        }`,
      );
    for (const c of r.stan.cele.filter((q) => !q.done && !q.missed))
      console.log(`      ${c.key}: ${c.tekst} | ${c.jak}`);
  }
}

/** tabela rozdziałów dla wszystkich przebiegów: otwarcie → koniec */
function tabela(lista: Wynik[]): void {
  const kolumny = lista.map((r) => `${r.nazwa.split(' ')[0]} ${tryb(r.tryb)}`);
  const szer = 21;
  const klucze = [...new Set(lista.flatMap((r) => r.rozdzialy.map((x) => x.k)))];
  console.log(`\nTabela rozdziałów (otwarcie → koniec), ${DNI} dni od 15:00 pierwszego dnia`);
  console.log(`  ${''.padEnd(4)}${kolumny.map((k) => k.padEnd(szer)).join('')}`);
  for (const k of klucze) {
    const komorki = lista.map((r) => {
      if (!r.rozdzialy.some((x) => x.k === k)) return 'brak rozdziału';
      const { otwarcia, konce } = terminy(r);
      const o = otwarcia.get(k);
      const e = konce.get(k);
      if (o === undefined) return '— (nie otwarty)';
      return `${hhmm(o).replace(' ', '·')} → ${e === undefined ? 'NIE' : hhmm(e).replace(' ', '·')}`;
    });
    console.log(`  ${k.toUpperCase().padEnd(4)}${komorki.map((c) => c.padEnd(szer)).join('')}`);
  }
}

/** Analiza celu `nowi` z zapisanych kart, zmian ludności i liczników werbunku (argument `karty`). Okno: od otwarcia R4 do
    zaliczenia `nowi` albo do końca przebiegu. */
function analizaR4(
  zdarzenia: Zdarzenie[],
  karty: KartaR4[],
  zmiany: AnalizaR4['zmiany'],
  werbunek0: AnalizaR4['werbunek'] | undefined,
  werbunek1: AnalizaR4['werbunek'] | undefined,
  werbunekKoniec: AnalizaR4['werbunek'],
  koniecTick: number,
): AnalizaR4 {
  const otwarcie = zdarzenia.find((z) => z.co === 'otwarcie' && z.klucz === 'r4')?.tick ?? null;
  const nowi = zdarzenia.find((z) => z.co === 'cel' && z.klucz === 'r4.nowi')?.tick ?? null;
  const koniec = nowi ?? koniecTick;
  const wOknie = (tick: number): boolean => otwarcie !== null && tick >= otwarcie && tick <= koniec;
  const w0 = werbunek0 ?? { rozmowy: 0, rece: 0, zaproszenia: 0 };
  const w1 = werbunek1 ?? werbunekKoniec;
  return {
    otwarcie,
    nowi,
    koniec,
    karty: karty.filter((k) => wOknie(k.tick)),
    // zmiana ludności po wyborze karty wpada w następnej sekundzie, czyli tuż po zaliczeniu celu
    zmiany: zmiany.filter((z) => wOknie(z.tick - TICKS_PER_SECOND)),
    wedrowcy: zdarzenia.filter((z) => z.co === 'okazja' && z.klucz === 'o1' && wOknie(z.tick)).length,
    werbunek:
      otwarcie === null
        ? { rozmowy: 0, rece: 0, zaproszenia: 0 }
        : { rozmowy: w1.rozmowy - w0.rozmowy, rece: w1.rece - w0.rece, zaproszenia: w1.zaproszenia - w0.zaproszenia },
  };
}

/** liczby z analizy R4 do jednej linii i do tabeli zbiorczej */
function liczbyR4(a: AnalizaR4): {
  kart: number;
  gosci: number;
  lancuchowych: number;
  prosacych: number;
  przyjeto: number;
  przybylo: number;
  ubylo: number;
  wpuscic: number;
  wyszarzonych: number;
  pierwszaKarta: number | null;
  pierwszaProsba: number | null;
  pierwszeWpuszczenie: number | null;
} {
  const goscie = a.karty.filter((k) => k.id === 'gosc');
  const lancuchowe = a.karty.filter((k) => k.lancuch);
  // karty, które mogą kogoś przyprowadzić: goście z puli, kroki łańcuchów i każda inna karta z wyborem przyjęcia (np. „Fachowiec”)
  const przyprowadzaja = a.karty.filter((k) => k.id === 'gosc' || k.lancuch || k.proszacy || k.wyszarzona);
  return {
    kart: a.karty.length,
    gosci: goscie.length,
    lancuchowych: lancuchowe.length,
    prosacych: przyprowadzaja.filter((k) => k.proszacy).length,
    przyjeto: przyprowadzaja.filter((k) => k.wpuszczono).length,
    wpuscic: przyprowadzaja.filter((k) => k.wpuscic).length,
    wyszarzonych: przyprowadzaja.filter((k) => k.wyszarzona && !k.wpuscic).length,
    pierwszaKarta: przyprowadzaja[0]?.tick ?? null,
    pierwszaProsba: przyprowadzaja.find((k) => k.proszacy)?.tick ?? null,
    pierwszeWpuszczenie: przyprowadzaja.find((k) => k.wpuscic)?.tick ?? null,
    przybylo: a.zmiany.filter((z) => z.d > 0).reduce((n, z) => n + z.d, 0),
    ubylo: -a.zmiany.filter((z) => z.d < 0).reduce((n, z) => n + z.d, 0),
  };
}

function wypiszR4(r: Wynik, a: AnalizaR4): void {
  const n = liczbyR4(a);
  const koniec =
    a.nowi !== null
      ? `nowi zaliczone ${hhmm(a.nowi)}`
      : r.koniec.przegrana
        ? `nowi nie zaliczone, przegrana ${hhmm(a.koniec)}`
        : `nowi nie zaliczone do ${hhmm(a.koniec)}`;
  console.log(
    `  R4 okno celu „nowi”: ${a.otwarcie === null ? 'R4 się nie otworzył' : `od ${hhmm(a.otwarcie)}, ${koniec}`}`,
  );
  if (a.otwarcie === null) {
    console.log(
      `R4LINIA demo=${r.demo} tryb=${r.tryb} ziarno=${PRZESUNIECIE} bezsmierci=${BEZ_SMIERCI ? 1 : 0} otwarcie=NIE nowi=NIE koniec=${hhmm(a.koniec).replace(' ', '·')} przegrana=${r.koniec.przegrana?.split(',')[0] ?? '-'} kart=0 gosci=0 lancuchowych=0 prosacych=0 przyjeto=0 wpuscic=0 wyszarzonych=0 pierwszakarta=NIE pierwszaprosba=NIE pierwszewpuszczenie=NIE przybylo=0 ubylo=0 wedrowcy=0 rozmowy=0 rece=0 zaproszenia=0`,
    );
    return;
  }
  const inne = new Map<string, number>();
  for (const k of a.karty) if (k.id !== 'gosc' && !k.lancuch) inne.set(k.id, (inne.get(k.id) ?? 0) + 1);
  console.log(
    `    kart zdarzeń ${n.kart}, w tym gości ${n.gosci} i kroków łańcuchów ${n.lancuchowych}; kart z wyborem przyjęcia (goście, łańcuchy, „Fachowiec”) ${n.prosacych}, przyjęto ${n.przyjeto}; inne: ${[...inne].map(([k, c]) => `${k} ${c}`).join(', ') || 'brak'}`,
  );
  console.log(
    `    ludność w oknie: przybyło ${n.przybylo}, ubyło ${n.ubylo}${a.zmiany.length ? ` (${a.zmiany.map((z) => `${hhmm(z.tick)} ${z.d > 0 ? '+' : ''}${z.d}`).join(', ')})` : ''}`,
  );
  console.log(
    `    wędrowców przy siatce (okazje O1) ${a.wedrowcy}; rozmów ${a.werbunek.rozmowy}, pytań o rękę ${a.werbunek.rece}, zaproszeń ${a.werbunek.zaproszenia}`,
  );
  for (const k of a.karty.filter((q) => q.id === 'gosc' || q.lancuch || q.proszacy || q.wpuszczono))
    console.log(
      `    ${hhmm(k.tick)} ${k.lancuch ? 'łańcuch ' : ''}${k.id} „${k.tytul}”: ${k.wybor}${k.proszacy ? ' (prosi o przyjęcie)' : ''}${
        k.ludnosc ? ` → ludność ${k.ludnosc.przed} → ${k.ludnosc.po ?? '?'} po dwóch godzinach` : ''
      }`,
    );
  // jedna linia do zbiorczego parsowania (python), klucze=wartości
  console.log(
    `R4LINIA demo=${r.demo} tryb=${r.tryb} ziarno=${PRZESUNIECIE} bezsmierci=${BEZ_SMIERCI ? 1 : 0} otwarcie=${hhmm(a.otwarcie).replace(' ', '·')} nowi=${a.nowi !== null ? hhmm(a.nowi).replace(' ', '·') : 'NIE'} koniec=${hhmm(a.koniec).replace(' ', '·')} przegrana=${r.koniec.przegrana?.split(',')[0] ?? '-'} kart=${n.kart} gosci=${n.gosci} lancuchowych=${n.lancuchowych} prosacych=${n.prosacych} przyjeto=${n.przyjeto} wpuscic=${n.wpuscic} wyszarzonych=${n.wyszarzonych} pierwszakarta=${n.pierwszaKarta === null ? 'NIE' : hhmm(n.pierwszaKarta).replace(' ', '·')} pierwszaprosba=${n.pierwszaProsba === null ? 'NIE' : hhmm(n.pierwszaProsba).replace(' ', '·')} pierwszewpuszczenie=${n.pierwszeWpuszczenie === null ? 'NIE' : hhmm(n.pierwszeWpuszczenie).replace(' ', '·')} przybylo=${n.przybylo} ubylo=${n.ubylo} wedrowcy=${a.wedrowcy} rozmowy=${a.werbunek.rozmowy} rece=${a.werbunek.rece} zaproszenia=${a.werbunek.zaproszenia}`,
  );
}

const wyniki: Wynik[] = [];
for (const demo of DEMO ? [DEMO] : DEMA)
  for (const t of TRYB ? [TRYB] : TRYBY) {
    const r = await przebieg(demo, t, DNI);
    wyniki.push(r);
    wypisz(r);
  }
tabela(wyniki);
const nazwaPrzebiegu = (r: Wynik): string => `${r.nazwa.split(' ')[0]} ${tryb(r.tryb)}`;
const opisPowodow = (lista: Wynik[]): string =>
  lista.map((r) => `${nazwaPrzebiegu(r)}: ${powody(r).join(' i ')}`).join('; ');
// kod wyjścia decyduje tylko tryb zwykły; zombie jest informacją (powód w nagłówku)
const zwykle = wyniki.filter((r) => r.tryb === 'zwykly');
const zombie = wyniki.filter((r) => r.tryb === 'zombie');
const nieudane = zwykle.filter((r) => powody(r).length);
const zombieZPowodami = zombie.filter((r) => powody(r).length);
if (zombie.length)
  console.log(
    zombieZPowodami.length
      ? `\nZombie, tylko informacja (kod wyjścia nie zależy od zombie): ${zombieZPowodami.length} z ${zombie.length} przebiegów z powodami (${opisPowodow(zombieZPowodami)})`
      : `\nZombie, tylko informacja (kod wyjścia nie zależy od zombie): żaden z ${zombie.length} przebiegów nie ma powodów`,
  );
if (!zwykle.length) console.log('\nBez przebiegów zwykłych: kod wyjścia 0, o nim decyduje tylko tryb zwykły');
else
  console.log(
    nieudane.length
      ? `\nNIEUDANE przebiegi zwykłe: ${nieudane.length} z ${zwykle.length} (${opisPowodow(nieudane)})`
      : `\nTryb zwykły: wszystkie rozdziały skończone w ${DNI} dniach we wszystkich ${zwykle.length} przebiegach`,
  );
process.exit(nieudane.length ? 1 : 0);
