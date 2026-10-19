/* Za Murem 0.4: język gry (src/ui/jezyk.ts: angielski domyślnie, przełącznik EN/PL na karcie startowej i w Menu;
   po zmianie wszystko, co widać, rysuje się od nowa), start (z panelem „Wasz zarząd”: liczba osób i własna drużyna),
   wczytanie osiedla i tabel mieszkańców
   (zarząd i mieszkańcy siedziby z generatora, src/sim/osiedle.ts; bez tabel postaci jak dawniej), gra z sąsiadami
   z ?siec=1 (src/net/gra.ts; mieszkańcy z generatora także w niej, dla siedziby, którą wybrał start sieciowy, ale bez
   zmiany imion, bo zapis idzie na serwer: `imionaWGrze`), pętla gry z zarządem (uchwały, karta nocy, wydarzenia,
   raport), okno mapy miasta (src/ui/miasto.ts: przycisk „Mapa miasta”, klawisz M i minimapa w rogu ekranu
   (src/ui/minimapa.ts), gra stoi przy otwartym oknie) z wysyłaniem wypraw dziennych (src/ui/wyprawa.ts: wybór osób,
   podsumowanie, potwierdzenie), zapis i sterowanie. */

import './style.css';
import { LORE_EN, LORE_ZOMBIE_EN } from './content/data.en.ts';
import { LORE, LORE_ZOMBIE } from './content/data.ts';
import { HALAS_ZOMBIE, PO_PLOCIE, PO_POLECENIU } from './content/napisy-sasiedzi.ts';
import { ALARM_OFF_EN, ALARM_OFF_SAY_EN, ALARM_OFF_TITLE_EN } from './content/napisy-zombie.en.ts';
import { ALARM_OFF, ALARM_OFF_SAY, ALARM_OFF_TITLE } from './content/napisy-zombie.ts';
import type { Person } from './content/people.ts';
import { jezyk, L, poZmianieJezyka, type Tx, tr, tx } from './core/jezyk.ts';
import { hashString } from './core/rng.ts';
import { wyslijWyprawe } from './gov/dzienne.ts';
import { BLOK, type Words, type WordsEn, wordsEn, wordsEnOfWorld, wordsOf, wordsOfWorld } from './gov/miejsce.ts';
import { nightAdvice } from './gov/noc.ts';
import type { GovInput, GovState, Prompt } from './gov/typy.ts';
import { celZMiejsca, wlaczMiasto } from './gov/wyprawy.ts';
import {
  ackReport,
  chooseEvent,
  confirmNight,
  govUpdate,
  lawEffects,
  newGov,
  normalizujTeksty,
  pending,
  setNight,
  signLaw,
} from './gov/zarzad.ts';
import { type Droga, grajDalej, ocenDrogi, type PostepDrogi, wlaczZwyciestwo, wygrajDroge } from './gov/zwyciestwo.ts';
import { type LokatorEn, lokatorzyEn } from './mieszkancy/angielski.ts';
import type { Odmiana } from './mieszkancy/historie.ts';
import { nazwaDoOkolicyZDanych } from './mieszkancy/kronika.ts';
import { PRZYPADKI } from './mieszkancy/odmiana.ts';
import { type DaneMieszkancow, wczytajDaneMieszkancow, wczytajKoncowki, wczytajOdmiane } from './mieszkancy/wczytaj.ts';
import { GraSieciowa } from './net/gra.ts';
import { buildScene, TILE } from './render/art/scene.ts';
import { gameLights, strangerVisibility } from './render/game.ts';
import { wczytajGrafike } from './render/grafika.ts';
import { type Light, lightAt } from './render/light.ts';
import { sectionPietra } from './render/pietro.ts';
import { type SectionScene, sectionOf, type ThingLike } from './render/section.ts';
import { GameView } from './render/view.ts';
import { WEAPONS, WEAPONS_EN, type WeaponId } from './sim/bron.ts';
import { BUILDS, type BuildKind, canPlace, footprint } from './sim/budowle.ts';
import { clockOf, dayOf, SPEEDS, START_MINUTES, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from './sim/clock.ts';
import { applyGov, govInput, lawsFrom } from './sim/gov.ts';
import { NAPISY as HANDEL } from './sim/handlarz.ts';
import { type LokatorzyGry, zrodloLokatorow } from './sim/lokatorzy.ts';
import type { AptGame } from './sim/mieszkania.ts';
import { commandsAt, type MenuItem } from './sim/orders.ts';
import {
  ludnoscSpisu2021,
  mapaMieszkancow,
  mieszkancyNowejGry,
  mieszkancyZapisu,
  opcjaMieszkancow,
  stanyM2,
} from './sim/osiedle.ts';
import { RODZAJE } from './sim/praca.ts';
import { type WyborSpotkania, wybory } from './sim/sasiedzi.ts';
import { addResidents, alarmOn, createSim, Sim, type SimState } from './sim/sim.ts';
import { type SimPerson, type SimSnapshot, type SimStock, snapshot } from './sim/snapshot.ts';
import { NAPISY } from './sim/surowce.ts';
import { type GameMode, modeOf, parseMode } from './sim/tryb.ts';
import { TUT_STEPS } from './sim/tutorial.ts';
import { NAPISY as OBCY, wiescEn } from './sim/wedrowcy.ts';
import {
  allowedAnchors,
  availableOf,
  BUILD_MENU,
  type BuildCategory,
  buildItems,
  buildMenu,
  buildName,
  okTilesOf,
  placeKey,
  type Rot,
  stockKey,
  TECH_NAMES,
} from './ui/budowa.ts';
import { kartaBudynku, widokBudynku } from './ui/budynek.ts';
import { currentGoal, DAY2_WOOD, goalsDay2, goalsOf, isDay2, markTree, NIGHT_WOOD } from './ui/cele.ts';
import { Druzyna } from './ui/druzyna.ts';
import {
  dotyczy,
  edytorImienia,
  imieZGeneratora,
  imionaWGrze,
  podpowiedz,
  poprawneImie,
  wczytajZmiany,
  wyprowadzkaTx,
  type ZmianaImienia,
  zapiszZmiane,
  zastosujZmiany,
  zmianaZPol,
  zTejOsobyGeneratora,
} from './ui/imiona.ts';
import { podepnijPrzelacznik, przelacznikHtml, STATYCZNE, startJezyka } from './ui/jezyk.ts';
import { groupCard, personCard } from './ui/karta.ts';
import { ContextMenu } from './ui/menu.ts';
import { MapaMiasta, mapaMiastaSheet } from './ui/miasto.ts';
import { aptAt, aptCard, aptState, aptView } from './ui/mieszkania.ts';
import { clearThumbs, thumbUrl } from './ui/miniatura.ts';
import { Minimapa } from './ui/minimapa.ts';
import {
  burnSheet,
  confirmSheet,
  endSheet,
  eventSheet,
  helpSheet,
  lawSheet,
  menuSheet,
  nightOdds,
  nightSheet,
  oddsHtml,
  optionDetail,
  reportSheet,
} from './ui/okna.ts';
import { Modal } from './ui/okno.ts';
import { BuildPanel } from './ui/panelbudowy.ts';
import { PracaPanel } from './ui/panelpracy.ts';
import { renderStats, statsOf } from './ui/pasek.ts';
import {
  blokujKlik,
  nastepnePietro,
  PODPOWIEDZ_ZARZAD,
  podpowiedz as podpowiedzPietra,
  przyjmijPietro,
  SelektorPieter,
} from './ui/pietra.ts';
import { nalozPolecenia, nalozPraceOsoby, widokPracy } from './ui/praca.ts';
import { arriving, comingText } from './ui/przybycie.ts';
import { govFence } from './ui/siatka.ts';
import { spotkanieSheet, zdanieNapisu } from './ui/spotkanie.ts';
import { pointerButton, wheelKind, zoomFactor } from './ui/sterowanie.ts';
import { esc } from './ui/tekst.ts';
import { domyslniWybrani, kogoWyslac, odswiezPlan, planWyprawySheet } from './ui/wyprawa.ts';
import { clearSave, pietraWlaczone, readSave, type Save, saveLabel, worldKey, writeSave } from './ui/zapis.ts';
import { crownOf, type MarkSpot, markSpot } from './ui/znacznik.ts';
import { drogiSheet, epilogSheet, statyEpilogu } from './ui/zwyciestwo.ts';
import { demoList, type Loaded, loadAddress, loadDemo } from './world/load.ts';
import { type Miejsce, miejscaZPoi, uzupelnijKlucze } from './world/miasto.ts';
import { KafelkiMiasta } from './world/miastoKafelki.ts';
import { pobierzKafelek } from './world/mvt.ts';
import { listaPieter } from './world/pietra.ts';
import { buildWorld, T, type World } from './world/world.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
// ?budowa=klodki (do zrzutów): widok menu z kłódkami; magazyn i ogródek czekają na badanie testowe
if (params.get('budowa') === 'klodki') {
  BUILD_MENU.showLocked = true;
  BUILDS.magazyn.tech = 't_test';
  BUILDS.ogrodek.tech = 't_test';
  TECH_NAMES.t_test = tx('Badanie testowe', 'Test research');
}
// język przed czymkolwiek, co rysuje: ?lang=, pamięć przeglądarki, a bez nich angielski
startJezyka({ params });
const touchUI = matchMedia('(pointer: coarse)').matches;
// grafika z PixelLab (atlasy z public/assets) pobiera się w tle od razu; ?grafika=kod: wszystko rysowane kodem
const grafika = params.get('grafika') === 'kod' ? Promise.resolve(null) : wczytajGrafike();
// mapa miasta (wyprawy do miejsc z okolicy, src/gov/wyprawy.ts): domyślnie włączona; ?miasto=0 gra jak przed nią
const opcjaMiasto = params.get('miasto') !== '0';

declare global {
  interface Window {
    /** do testów i pomiarów (Playwright) */
    zm?: {
      ready: boolean;
      sim: Sim | null;
      gov: GovState | null;
      view: GameView;
      fps: () => number;
      setCam: (x: number, y: number, zoom: number) => void;
      chunksPending: () => number;
      idle: () => boolean;
      /** krok zarządu teraz (jakby minęła sekunda przy ekranie); zwraca rodzaj decyzji, która czeka */
      govTick: () => string | null;
      /** przewija grę o tyle minut gry (czas przy ekranie jak w tempie mult, domyślnie 1×); staje na decyzji
          zarządu i zwraca jej rodzaj */
      ff: (minutes: number, mult?: number) => string | null;
      /** punkt na ekranie dla miejsca w metrach (kafelkach) */
      screenOf: (x: number, y: number) => [number, number];
      save: () => boolean;
      /** sekundy przy ekranie bez pauzy i bieżące tempo (do pomiarów rytmu gry) */
      screen: () => number;
      speed: () => number;
      /** płynny przejazd kamery do miejsca w metrach (do nagrań) */
      fly: (x: number, y: number, zoom: number, ms: number) => void;
      /** panel budowy (do testów): czy otwarty, zakładka i wybrana budowla */
      buildPanel: () => { open: boolean; tab: string | null; kind: string | null };
      /** panel Pracy (do testów i zrzutów): czy otwarty i wybrana kolumna */
      pracaPanel: () => { open: boolean; kol: string | null };
      /** tryb stawiania (do testów): plan pod kursorem, czy wolno, ile dozwolonych miejsc i pierwsze z nich */
      placing: () => {
        kind: BuildKind;
        x: number;
        y: number;
        rot: number;
        ok: boolean;
        why?: string;
        allowed: number;
        first: number;
      } | null;
      /** miejsca z okolicy, które dostaje zarząd (`GovInput.okolica`); puste z ?miasto=0 (do zrzutów i testów) */
      okolica: readonly Miejsce[];
      /** mapa miasta tej gry (okno, widok, kafelki); null z ?miasto=0 i na osiedlu zapasowym */
      mapa: () => MapaMiasta | null;
      /** minimapa miasta w rogu ekranu (jej stan do zrzutów i testów); schowana i wyłączona bez mapy miasta */
      minimapa: () => Minimapa;
      /** stan mieszkań siedziby w grze (st.apts) */
      apts: () => AptGame[];
      /** przyjęcie n osób zza bramy jak po decyzji zarządu (do zrzutów); zwraca, ilu przybyło */
      admit: (n: number) => number;
      /** gra z sąsiadami (src/net/gra.ts): zalogowanie, stan sieci, znaczniki */
      siec: () => ReturnType<GraSieciowa['podglad']>;
      /** które części grafiki są z PixelLab (reszta z kodu); null: wszystko z kodu */
      grafika: () => Record<'teren' | 'blok' | 'dach' | 'strop' | 'trzepak' | 'budynki' | 'ludzie', boolean> | null;
      /** drogi do zwycięstwa tak, jak je widzi ekran dróg z Menu (`ocenDrogi`); pusto bez gry */
      zwyciestwo: () => PostepDrogi[];
      /** tylko do zrzutów: zwycięstwo drogi teraz (wygrana i wszystkie kamienie w stanie, epilog czeka); gdy żadne okno
          nie jest otwarte, epilog od razu się pokazuje. Zwraca rodzaj okna, które się otworzyło, albo null */
      wygraj: (droga: Droga) => string | null;
      /** wybór piętra jak kliknięcie na liście kafelka „Piętro” (do zrzutów); nic nie robi bez ?pietra=1 i dla piętra
          spoza listy */
      pietro: (L: number) => void;
      /** widok pięter: czy włączony w tej grze, wybrane piętro i lista pięter do wyboru (do zrzutów i testów) */
      pietra: () => { wlaczone: boolean; pietro: number; lista: number[] };
    };
  }
}

const view = new GameView();
let sim: Sim | null = null;
let gov: GovState | null = null;
let loaded: Loaded | null = null;
let seed = 0;
/** widok pięter obecnej gry (?pietra=1 albo pole zapisu): ustawia go `enter`, czyta `save` */
let pietraGry = false;
/** piętra do wyboru w tej grze (`listaPieter` świata z flagą; bez niej tylko parter) */
let pietraLista: number[] = [0];
/** scena typowego piętra całej mapy: liczona leniwie przy pierwszym wyborze piętra od pierwszego, potem trzymana */
let scenaPietra: SectionScene | null = null;
/** czy któryś pionek zarządu stoi w budynku zakrytym stropem albo dachem (liczone co 200 ms w `hud`) */
let zarzadUkryty = false;
let hqName = '';
/** miejsca z punktów OSM wokół adresu dla zarządu (liczone raz po zbudowaniu świata); puste bez opcji miasta */
let okolica: Miejsce[] = [];
/** ilu ludzi mieszkało w kwadracie domu w 2021 roku według spisu (liczone raz po zbudowaniu mapy, z tabel mieszkańców):
    z tego zarząd liczy cel drogi ludnościowej (`GovInput.ludnosc2021`); bez tabel pusto i cel to 250 */
let ludnosc2021: number | undefined;
/** kafelki miasta na całą sesję: pobierane dopiero przy oglądaniu mapy miasta, nigdy przy starcie gry */
const kafelkiMiasta = new KafelkiMiasta(pobierzKafelek);
/** mapa miasta tej gry (widok i doczytane kafelki zostają między otwarciami okna); null bez opcji miasta i na osiedlu
    zapasowym, które nie ma prawdziwego położenia */
let mapaMiasta: MapaMiasta | null = null;
/** minimapa miasta w prawym dolnym rogu (src/ui/minimapa.ts): kropki miejsc z okolicy i wyprawy w drodze, stuknięcie
    otwiera okno mapy (nie w trybie stawiania: klik w jej rogu to próba postawienia budowli, a `openMiasto` by ją
    anulował); rysowana z `drawState` najwyżej co 500 ms, schowana tam, gdzie nie ma miasta (`enter`) */
const minimapa = new Minimapa($('minimapa'), () => {
  if (!placing) openMiasto();
});

/* ---------- widok pięter (?pietra=1, src/ui/pietra.ts): kafelek „Piętro” w pasku, lista, klawisze, blokada klików ---------- */
/** kafelek z listą pięter i podpowiedzią; widoczny tylko w grze z flagą (`enter`) */
const selektorPieter = new SelektorPieter(
  { btn: $<HTMLButtonElement>('btnFloor'), list: $('floorList'), note: $('floorNote') },
  (L) => wybierzPietro(L),
  // lista pięter nie zasłania panelu budowy (spec), więc odsuwa się od jego lewej krawędzi
  () =>
    buildPanel.open
      ? $('buildPanel').getBoundingClientRect()
      : pracaPanel.open
        ? $('pracaPanel').getBoundingClientRect()
        : null,
);

/** wybór piętra (lista kafelka, PageUp i PageDown, zm.pietro, powrót na parter): przełącza widok tylko przy zmianie
    piętra, bo `ustawPietro` unieważnia wszystkie kawałki z przekrojem. Scena typowego piętra liczy się raz, przy
    pierwszym wyborze piętra od pierwszego, i idzie do widoku przy każdym takim wyborze; parter dostaje null. Piętro
    spoza listy (bez ?pietra=1 jest tylko parter) nic nie zmienia, podobnie wybór w trakcie stawiania budowli
    (przyjmijPietro). */
function wybierzPietro(L: number): void {
  if (
    !sim ||
    !pietraGry ||
    !przyjmijPietro({ lista: pietraLista, obecne: view.pietro, docelowe: L, stawianie: !!placing })
  )
    return;
  if (L >= 1) {
    scenaPietra ??= sectionPietra(sim.w);
    if (!scenaPietra) return;
  }
  view.ustawPietro(L, L >= 1 ? scenaPietra : null);
  odswiezPietra();
}

/** czy któryś pionek zarządu stoi w obrysie budynku. Przy przekroju piętra od pierwszego każdy budynek ma strop albo
    dach (siedziba z `levels` nie większym niż piętro też), więc taki pionek jest schowany. */
function zarzadPodStropem(st: SimState, w: World): boolean {
  if (!view.pietroAktywne()) return false;
  return st.pawns.some((p) => p.kind === 'core' && !p.away && w.bid[Math.floor(p.y) * w.size + Math.floor(p.x)] >= 0);
}

/** kafelek: wybrane piętro, lista i podpowiedź (z `hud` co 200 ms i po zmianie piętra albo języka; bez zmian nie rusza DOM) */
function odswiezPietra(): void {
  if (!pietraGry) return;
  if (sim) zarzadUkryty = zarzadPodStropem(sim.st, sim.w);
  const pietro = view.pietro;
  selektorPieter.odswiez(
    pietraLista,
    pietro,
    podpowiedzPietra({ pietro, cutOn: view.section, zarzadUkryty, panelBudowy: buildPanel.open || pracaPanel.open }),
  );
}

/** czy punkt ekranu leży w obrysie budynku, którego parter jest schowany pod stropem albo dachem (piętro od pierwszego
    z przekrojem): tam nic nie ma do kliknięcia */
function podStropem(sx: number, sy: number): boolean {
  return !!sim && view.pietroAktywne() && sim.w.bid[view.tileAt(sx, sy)] >= 0;
}

/** blokada kliknięcia pod stropem: pokazuje podpowiedź zamiast reakcji; true, gdy klik należy do blokady. Bez
    argumentów blokuje każdy klik w obrys; `widocznyPionek` i `prawy` tylko w obsłudze kliknięcia mapy (blokujKlik) */
function zablokowanyKlik(sx: number, sy: number, widocznyPionek = false, prawy = false): boolean {
  if (!blokujKlik({ podStropem: podStropem(sx, sy), prawy, widocznyPionek })) return false;
  say(tr(PODPOWIEDZ_ZARZAD), 2500);
  return true;
}
/** słowa miejsca siedziby: w domu komitet ulicy, sąsiedzi i furtka, w bloku zarząd, mieszkańcy i brama; po
    angielsku wordsE */
let words: Words = wordsOf(BLOK);
let wordsE: WordsEn = wordsEn(BLOK);
/** id handlarza z ostatniej klatki (−1: nie ma), żeby napis o jego przyjściu pokazał się raz */
let traderSeen = -1;
/** tick ostatniej pokazanej wieści (st.obcy.wiesc) */
let wiescSeen = -1;
let fenceIn: GovInput['fence'];
/** sekundy przy ekranie bez pauzy (dla zarządu: tempo wydarzeń) i chwila ostatniego kroku zarządu */
let screen = 0;
let govAt = 0;
let speed = 1;
/** tempo sprzed okna, które zatrzymało grę */
let hold: number | null = null;
/** noc po karcie biegnie w tym tempie (indeks SPEEDS: 6×), rano wraca tempo dnia */
const NIGHT_PACE = 3;
let dayPace: number | null = null;
/** napad, o którym warta już dała znać (tick z planu), i tempo nocy sprzed zwolnienia na czas napadu */
let raidSeen = -1;
let raidHeard = -1;
let raidHold: number | null = null;
let acc = 0;
let savedHour = -1;
const selected = new Set<number>();
let hint = '';
let hintUntil = 0;
/** powroty wypraw dziennych (GovEffects.powroty), których nie dało się pokazać, bo w tym kroku czekało okno zarządu */
let powrotyCzekaja: Tx[] = [];
const modal = new Modal($('modal'), $('sheet'));
const ctx = new ContextMenu($('ctx'));

/** okno, które jest otwarte, do narysowania od nowa po zmianie języka (ustawiają je funkcje otwierające okna) */
let sheetAgain: (() => void) | null = null;

/* ---------- ekran startowy ---------- */
/* tryb gry: przełącznik na ekranie startowym albo ?tryb=zombie; wstęp zmienia się razem z nim */
let mode: GameMode = parseMode(params.get('tryb'));
const setMode = (m: GameMode) => {
  mode = m;
  $('lore').textContent = m === 'zombie' ? L(LORE_ZOMBIE, LORE_ZOMBIE_EN) : L(LORE, LORE_EN);
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name=tryb]')) r.checked = r.value === m;
};
setMode(mode);
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=tryb]'))
  r.addEventListener('change', () => r.checked && setMode(parseMode(r.value)));
/* „Wasz zarząd”: liczba osób i własna drużyna (src/ui/druzyna.ts), zwinięte do jednej linijki, dopóki gracz nie otworzy;
   bez bloku #druzyna w index.html gra startuje z zarządem z adresu jak dawniej */
const druzynaEl = document.getElementById('druzyna');
const druzyna = druzynaEl ? new Druzyna(druzynaEl) : null;
const status = (t: string) => {
  $('startStatus').textContent = t;
};
/* gra z sąsiadami (src/net/gra.ts): blok #siec, start przez serwer, znaczniki klatek, zapis w chmurze; tylko z ?siec=1
   i przy działającym serwerze, inaczej wszystko jak bez sieci */
const siec = new GraSieciowa({
  el: document.getElementById('siec'),
  warstwa: document.getElementById('klatki'),
  wlaczona: params.get('siec') === '1',
  touch: touchUI,
  say: (t, ms) => say(t, ms),
  screenOf: (x, y) => screenOf(x, y),
  onChmura: (s) => start(async () => s.data, s),
  status,
  tryb: () => mode,
});
const siecGotowa = siec.init().catch((e) => console.warn('gra z sąsiadami', e));
/** ekran startowy od nowa (z ?siec=1, jeśli gra z sąsiadami była włączona, z ?pietra=1 i z ?lang=, dopóki są w adresie) */
const startUrl = () => {
  const q = new URLSearchParams();
  if (params.get('siec') === '1') q.set('siec', '1');
  if (params.get('pietra') === '1') q.set('pietra', '1');
  const lang = new URLSearchParams(location.search).get('lang');
  if (lang) q.set('lang', lang);
  const s = q.toString();
  return location.pathname + (s ? `?${s}` : '');
};
/** opisy przykładów po angielsku (public/demo/index.json z tools/make-demos.ts ma polskie) */
const DEMO_LABEL_EN: Record<string, string> = {
  przymorze: 'Obrońców Wybrzeża, Gdańsk (a wave block, large concrete panels)',
  lanciego: 'Lanciego 10G, Warszawa Ursynów (blocks and terraced houses)',
  zielonki: 'Spacerowa 10, Batowice, Zielonki commune (detached houses)',
};
/** przyciski przykładowych osiedli (napisy od nowa po zmianie języka) */
const demoButtons: { b: HTMLButtonElement; d: { key: string; name: string; label: string } }[] = [];
const demoLabels = () => {
  for (const { b, d } of demoButtons) {
    b.textContent = L(`Przykład: ${d.name}`, `Example: ${d.name}`);
    b.title = L(d.label, DEMO_LABEL_EN[d.key] ?? d.label);
  }
};
demoList().then((list) => {
  const box = $('demos');
  for (const d of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.onclick = () => start(() => loadDemo(d.key));
    demoButtons.push({ b, d });
    box.appendChild(b);
  }
  demoLabels();
});
$('startForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>('addr').value.trim();
  if (q) start(() => loadAddress(q, status));
});
const resume = readSave();
// usunięcie zapisu w dwóch krokach, bez natywnego confirm: drugi klik w ciągu ARM_MS usuwa
const ARM_MS = 4000;
let armedAt = Number.NEGATIVE_INFINITY;
const forgetArmed = () => performance.now() - armedAt < ARM_MS;
/** napis przycisku według stanu (po zmianie języka napisy statyczne wracają do „Delete save”) */
const forgetLabel = () => {
  if (resume && !$('resume').hidden)
    $('btnForget').textContent = forgetArmed() ? L('Na pewno? Usuń', 'Really delete?') : L('Usuń zapis', 'Delete save');
};
const resumeLabel = () => {
  if (resume) $('btnResume').textContent = L(`Kontynuuj: ${saveLabel(resume)}`, `Continue: ${saveLabel(resume)}`);
};
if (resume) {
  $('resume').hidden = false;
  resumeLabel();
  $('btnResume').onclick = () => start(async () => resume.data, resume);
  $('btnForget').onclick = () => {
    if (!forgetArmed()) {
      armedAt = performance.now();
      forgetLabel();
      setTimeout(forgetLabel, ARM_MS + 50);
      return;
    }
    clearSave();
    $('resume').hidden = true;
  };
}
/* przełącznik języka na karcie startowej (w Menu rysuje go showMenu) */
const langStart = document.getElementById('langStart');
const renderLang = () => {
  if (langStart) langStart.innerHTML = przelacznikHtml(jezyk());
};
renderLang();
if (langStart) podepnijPrzelacznik(langStart);
/* zmiana języka (przełącznik EN/PL): wszystko, co widać, od nowa w nowym języku; stan gry się nie zmienia */
/** opis przycisku „pokaż siedzibę” ze słowem miejsca (napis statyczny z ui/jezyk.ts ma wersję z bloku) */
function hqAria() {
  $('zHome').setAttribute('aria-label', L(`Pokaż siedzibę ${words.zarzad.d}`, `Show ${wordsE.krotko}’s HQ`));
}

poZmianieJezyka(() => {
  renderLang();
  setMode(mode);
  demoLabels();
  resumeLabel();
  forgetLabel();
  druzyna?.odswiez();
  siec.przerysuj();
  if (!sim) return;
  buildPanel.refresh(true);
  pracaPanel.refresh(true);
  hqAria();
  ctx.close();
  selektorPieter.zamknij();
  odswiezPietra();
  // chwilowy napis był w starym języku: znika (pokazuje się na kilka sekund, więc nie ma czego tłumaczyć)
  hintUntil = 0;
  imieAgain();
  hud(performance.now());
  wpiszImie();
  renderSpeed();
  // powód z canPlace był w starym języku
  if (placing) {
    const c = canPlace(sim.st, sim.w, placing.kind, placing.x, placing.y, placing.rot);
    placing.ok = c.ok;
    placing.why = c.why;
  }
  placeInfo();
  alarmButton(sim.st);
  if (modal.open) sheetAgain?.();
});

let busy = false;
async function start(get: () => Promise<Loaded>, saved?: Save) {
  if (busy) return;
  busy = true;
  try {
    // gra z sąsiadami: start zależy od zalogowania, więc najpierw odpowiedź serwera (bez ?siec=1 od razu)
    await siecGotowa;
    const data = await get();
    // tabele mieszkańców dla punktu osiedla (pliki gry z public/data/mieszkancy/, bez wysyłania adresu); bez nich
    // (null) gra idzie starą ścieżką
    status(L('Liczę mieszkańców…', 'Counting the residents…'));
    const t0 = performance.now();
    const c = data.geo?.c;
    const dane = Array.isArray(c) ? await wczytajDaneMieszkancow(c[0], c[1]) : null;
    console.info(
      `tabele mieszkańców ${Math.round(performance.now() - t0)} ms${dane ? `, gmina ${dane.gmina?.teryt ?? 'brak (szablon krajowy)'}` : ', brak: postaci jak dawniej'}`,
    );
    status(L('Rysuję osiedle…', 'Drawing the estate…'));
    await new Promise((r) => setTimeout(r, 0));
    await enter(data, saved, dane);
    status('');
  } catch (err) {
    const m = (err as Error)?.message || '';
    const net = err instanceof TypeError || (err as Error)?.name === 'AbortError';
    status(
      net
        ? L(
            'Nie mogę połączyć się z serwerami map: brak sieci albo serwery są przeciążone. Możecie zagrać na przykładowym osiedlu.',
            'Can’t reach the map servers: no connection, or the servers are overloaded. You can play on an example estate.',
          )
        : `${m || L('Coś poszło nie tak.', 'Something went wrong.')} ${L('Możecie zagrać na przykładowym osiedlu.', 'You can play on an example estate.')}`,
    );
    console.error(err);
  }
  busy = false;
}

let preview: { things: ThingLike[]; lights: Light[] } | null = null;

async function enter(data: Loaded, saved?: Save, dane: DaneMieszkancow | null = null) {
  // dane mieszkańców z generatora należą do jednej gry (ustawia je niżej start z mieszkańcami)
  mieszkancy = null;
  imieEdit = null;
  imionaGen.clear();
  // ziarno z adresu: to samo osiedle zawsze ma tych samych ludzi, inne osiedle innych
  seed = saved?.seed ?? (Number(params.get('seed')) || Number.parseInt(hashString(data.addr), 16) || 2051);
  // widok pięter: wczytany zapis zachowuje to, z czym go zaczęto (nie czyta adresu), nowa gra czyta ?pietra=1
  const pietra = pietraWlaczone(saved ?? null, params);
  pietraGry = pietra;
  const t0 = performance.now();
  // klucze „poi:X:Y” punktów (zapis i demo sprzed kluczy ich nie mają); przed mapaMieszkancow, żeby trafiły do mapy
  // i zapisu. Osiedle zapasowe (proc) nie ma prawdziwego położenia, więc bez kluczy
  if (opcjaMiasto && !data.geo.proc) uzupelnijKlucze(data.geo);
  // mapa z tagami budynków generatora mieszkańców (bez tabel ta sama mapa); świat poza tagami jest ten sam
  const geo = mapaMieszkancow(data.geo, dane);
  ludnosc2021 = ludnoscSpisu2021(geo, dane);
  // gra z sąsiadami: świat bez budynków zajętych przez inne drużyny przy wyborze siedziby i bez nazwy ulicy z adresu
  // w nazwach budynków (zapis idzie do chmury); bez sieci (bez === null) zwykły świat. Świat zawsze z mapy z tagami
  // generatora, więc mieszkańcy siedziby (także innej niż pod adresem, gdy klatkę zajęła inna drużyna) idą niżej
  // tą samą drogą co bez sieci
  const world = await siec.przygotuj(
    data,
    (bez) =>
      buildWorld(geo, {
        seed,
        ...(pietra ? { pietra: true } : {}),
        ...(bez === null ? { street: data.street } : bez.length ? { bezSiedziby: bez } : {}),
      }),
    saved,
  );
  console.info(`świat ${Math.round(performance.now() - t0)} ms, budynków ${world.buildings.length}`);
  // okolica dla zarządu: punkty z `geo` (metry od adresu bez obrotu świata, w przeciwieństwie do `world.pois`). Nazwa
  // z osobą albo adresem odpada (pusta), bo filtr zamieniłby ją na polski opis kategorii, który wszedłby do angielskich
  // tekstów celu; bez tabel imion (dane === null) albo poza gminami z tabelami (szablon krajowy, np. adres poza Polską)
  // wszystkie nazwy puste, bo filtr nie rozpozna wtedy właściciela
  const nazwaOkolicy = nazwaDoOkolicyZDanych(dane);
  okolica = opcjaMiasto ? miejscaZPoi(geo.poi, nazwaOkolicy) : [];
  // mapa miasta: ten sam filtr nazw dla miejsc z doczytanych kafelków (RODO); bez położenia (proc) nie ma miasta
  mapaMiasta =
    opcjaMiasto && !data.geo.proc
      ? new MapaMiasta({ c: data.geo.c, okolica, kafelki: kafelkiMiasta, nazwa: nazwaOkolicy })
      : null;
  $('btnMiasto').hidden = !mapaMiasta;
  minimapa.ustaw(mapaMiasta ? { okolica, st: () => gov } : null);
  // zapis z innej wersji świata (po zmianie generatora) nie pasuje do stanu: to samo osiedle od nowa. Przestarzały zapis
  // zachowuje swoją flagę pięter (pietraGry, świat już z nią zbudowany), tak jak zachowuje swoje ziarno, a nie czyta
  // ?pietra=1 z adresu
  const stale = !!saved && saved.world !== worldKey(world);
  if (stale) saved = undefined;
  // zarząd z panelu „Wasz zarząd”: bez ruszania go 4 osoby z siedziby (z generatora, bez tabel z ziarna adresu)
  const opcje = druzyna?.opcje() ?? { core: 4 };
  // mieszkańcy siedziby z generatora, zanim powstaną symulacja i scena (obie czytają stany mieszkań ze świata): nowa gra
  // dostaje stany mieszkań i osoby z generatora, wznowiony zapis z osobami z generatora stany mieszkań z zapisu
  // i budynek siedziby do imion i historii (bez nowego createSim), zapis sprzed kroku 5 nic
  const t1 = performance.now();
  // własna drużyna to cały zarząd: generator nie wybiera zarządu, więc żadne gospodarstwo nie wypada z mieszkańców
  let l = saved
    ? mieszkancyZapisu(world, geo, dane, saved.sim)
    : mieszkancyNowejGry(world, geo, dane, opcje.team ? 0 : opcje.core);
  if (dane)
    console.info(
      `mieszkańcy ${Math.round(performance.now() - t1)} ms${l ? `, w siedzibie ${l.siedziba.osoby.length} osób` : ', bez generatora'}`,
    );
  // tłum obcych tylko do pomiarów (?perf=150); w grze są mieszkańcy siedziby, których dokłada symulacja
  const crowd = params.has('perf') ? Number(params.get('perf')) : 0;
  // handlarz pod bramą za dnia (src/sim/handlarz.ts); ?handlarz=0 gra bez niego (porównania, stare zrzuty)
  const obcy = params.get('handlarz') !== '0';
  // wszystko, co może się nie udać, przed przełączeniem ekranu: błąd zostaje na ekranie startowym
  let st: SimState;
  if (saved) st = saved.sim;
  else
    try {
      st = createSim(world, seed, {
        ...opcje,
        crowd,
        mode,
        obcy,
        ...(l ? { mieszkancy: opcjaMieszkancow(l) } : {}),
      });
    } catch (e) {
      if (!l) throw e;
      // osoby z generatora wywróciły symulację: gra bez nich, ze stanami mieszkań M2, jak przed krokiem 5
      console.warn('Mieszkańcy z adresu: symulacja z osobami z generatora się nie udała, gra bez nich', e);
      l = null;
      stanyM2(world);
      st = createSim(world, seed, { ...opcje, crowd, mode, obcy });
    }
  // drużyna bez domu w grze z sąsiadami zaczyna na ulicy
  if (!saved) siec.poStarcie(st, world);
  // scena po stanach mieszkań na świecie: przekrój rysuje puste mieszkania, uszkodzenia i śmieci ze świata;
  // teren i bloki z grafiki z PixelLab, jeśli się wczytała
  const art = await grafika;
  clearThumbs();
  view.setGrafika(art);
  const scene = buildScene(world, art);
  // przekrój siedziby z wnętrzem ze świata; ?przekroj=0 zostawia dach (do porównań)
  if (params.get('przekroj') !== '0') scene.section = sectionOf(world);
  const zombie = modeOf(st) === 'zombie';
  $('start').hidden = true;
  $('app').hidden = false;
  // płótno mierzy element; był ukryty, więc trzeba przeliczyć rozmiar po odsłonięciu
  view.app.resize();
  view.setScene(scene);
  // widok pięter od parteru (scena jest nowa, jej piętro to 0): lista ze świata, scena piętra liczona od nowa, kafelek
  // tylko z flagą
  pietraLista = pietra ? listaPieter(world) : [0];
  scenaPietra = null;
  zarzadUkryty = false;
  selektorPieter.zamknij();
  $('floorSel').hidden = !pietra;
  selektorPieter.odswiez(pietraLista, 0, null);
  // ?godzina=22 (albo ?hour=22, także z ułamkiem: 18.5 to 18:30): pora dnia na start
  const hour = params.get('godzina') ?? params.get('hour');
  if (hour !== null && !saved)
    st.tick = Math.round(
      (((((Number(hour) * 60 - START_MINUTES) / 60) * TICKS_PER_HOUR) % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY,
    );
  sim = new Sim(world, st);
  napisSeen = st.sasiedzi?.n ?? 0;
  meetChosen = null;
  // zapis sprzed handlarza: włączony od następnego kroku (w trybie zombie symulacja to pomija)
  if (saved && obcy && !st.obcy) sim.push({ t: 'obcy', ids: [] });
  traderSeen = st.obcy?.trader ?? -1;
  wiescSeen = st.obcy?.wiesc?.tick ?? -1;
  if (l && dane) mieszkancy = { l, dane, adres: data.addr };
  // lokatorzy sąsiednich budynków z generatora mieszkańców (fala 2); bez tabel zapasowi z ziarna budynku
  if (dane) sim.lokatorzy = zrodloLokatorow(world, geo, dane);
  placing = null;
  buildPanel.hide();
  buildPanel.reset();
  pracaPanel.hide();
  pracaPanel.reset();
  lastSnap = null;
  menuCache = null;
  roomMemo = null;
  aptFocus = -1;
  budFocus = -1;
  residentFocus = -1;
  // uchwały są w stanie symulacji (zapis je ma); do symulacji idą tylko po podpisaniu
  // zapis sprzed angielskiej wersji: polskie napisy zarządu zamienione na teksty w obu językach (stare zostają po polsku)
  gov = saved ? normalizujTeksty(saved.gov) : newGov(seed, modeOf(st));
  powrotyCzekaja = [];
  // mapa miasta w nowej grze i w starym zapisie (bez losowania; wyprawa nocna w drodze kończy się po staremu)
  if (opcjaMiasto) wlaczMiasto(gov);
  // drogi do zwycięstwa w nowej grze i w starym zapisie: kamienie, które stan już spełnia, zapisują się raz, bez epilogu
  wlaczZwyciestwo(gov);
  // ?stado=N: od razu N szwendaczy pod siatką przy siedzibie (podgląd i zrzuty)
  const herd = Number(params.get('stado'));
  if (!saved && zombie && herd > 0) sim.spawnAtFence(herd, world.buildings[world.hq]?.entrances[0]?.out ?? 0);
  // pasek: w trybie zombie siatka i stado zamiast temperatury na dworze
  $('sOut').hidden = zombie;
  $('sFence').hidden = !zombie;
  $('sHorde').hidden = !zombie;
  document.body.classList.toggle('zombie', zombie);
  screen = saved?.screen ?? 0;
  govAt = screen;
  loaded = data;
  hqName = world.buildings[world.hq]?.name ?? '';
  words = wordsOfWorld(world);
  wordsE = wordsEnOfWorld(world);
  hqAria();
  fenceIn = govFence(world, words, wordsE);
  savedHour = Math.floor(st.tick / TICKS_PER_HOUR);
  $('osName').textContent = data.name;
  document.title = `Za Murem · ${data.name}`;
  const hq = world.buildings[world.hq];
  // kamera na drzwi siedziby, przy których stoi zarząd (środek rdzenia)
  const core = st.pawns.filter((p) => p.kind === 'core');
  const hx = core.length ? (core.reduce((a, p) => a + p.x, 0) / core.length) * TILE : ((hq.x0 + hq.x1 + 1) / 2) * TILE;
  const hy = core.length ? (core.reduce((a, p) => a + p.y, 0) / core.length) * TILE : ((hq.y0 + hq.y1 + 1) / 2) * TILE;
  const cam = params.get('cam');
  if (saved?.cam) Object.assign(view.cam, saved.cam);
  else if (cam) {
    // cam=x,y,zoom w kafelkach albo cam=hq,zoom (siedziba) albo cam=all (całe osiedle)
    const parts = cam.split(',');
    if (parts[0] === 'all')
      Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    else if (parts[0] === 'hq') Object.assign(view.cam, { x: hx, y: hy, zoom: Number(parts[1]) || 1 });
    else {
      const [x, y, z] = parts.map(Number);
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom: z || 1 });
    }
  } else {
    // najpierw całe osiedle, potem zjazd do siedziby
    Object.assign(view.cam, { x: (world.size * TILE) / 2, y: (world.size * TILE) / 2, zoom: view.minZoom });
    flyTo(hx, hy, 1, 2400);
  }
  // ?swiatla=test zapala kozę i stawia przy zarządzie ognisko i lampę warty, ze światłami
  preview = params.get('swiatla') === 'test' ? previewNight(world, hx / TILE, hy / TILE) : null;
  drawState();
  if (params.has('speed')) speed = Number(params.get('speed'));
  // z samouczkiem pierwszy krok to zaznaczenie kogoś, bez niego zaznaczony jest pierwszy z zarządu
  const first = st.pawns[0];
  if (first && st.tut.step < 0 && !saved) selected.add(first.id);
  const siecMsg = siec.komunikatStartu();
  if (stale)
    say(
      L(
        'Zapis był z innej wersji osiedla, więc gra zaczyna się od nowa.',
        'The save was from a different version of the estate, so the game starts over.',
      ),
      9000,
    );
  else if (siecMsg) say(siecMsg, 12000);
  else if (!saved && zombie)
    say(
      L(
        'Za siatką snują się szwendacze, a nocą przyjdzie stado. Dzida sięga przez siatkę, strzał ściąga następnych.',
        'Shamblers drift about beyond the fence, and a herd will come at night. A spear reaches through the fence, a gunshot draws more of them.',
      ),
      9000,
    );
  else if (!saved)
    say(
      touchUI
        ? L(
            `To wasz ${words.zarzad.m}. Jednym palcem przesuwacie mapę, dwoma przybliżacie. Cele są pod paskiem u góry.`,
            `This is ${wordsE.wasz}. One finger moves the map, two fingers zoom. Your goals are under the bar at the top.`,
          )
        : L(
            `To wasz ${words.zarzad.m}. Przeciąganie przesuwa mapę, kółko przybliża. Cele pierwszego dnia są po lewej.`,
            `This is ${wordsE.wasz}. Drag to move the map, scroll to zoom. Today’s goals are on the left.`,
          ),
      9000,
    );
  renderSpeed();
  if (window.zm) {
    window.zm.sim = sim;
    window.zm.gov = gov;
    window.zm.okolica = okolica;
  }
  // imiona zmienione przez gracza (pamięć przeglądarki) na osobach z generatora, w nowej grze i we wznowionej
  zastosujImiona();
  // z zapisu: raport albo karta, które czekały
  if (saved) nextPrompt();
}

/**
 * Podgląd nocy przy zarządzie stojącym w (x, y) metrów: ognisko i lampa warty na najbliższych
 * wolnych kafelkach trawy, paląca się koza w mieszkaniu zarządu, do tego ich światła (promienie
 * jak na arkuszu grafiki: ognisko 5,5 m, lampa 3 m, koza w pokoju 4 m).
 */
function previewNight(w: World, x: number, y: number): { things: ThingLike[]; lights: Light[] } {
  const size = w.size;
  const taken = new Set<number>();
  const spot = (offs: [number, number][]) => {
    for (const [dx, dy] of offs) {
      const tx = Math.floor(x + dx);
      const ty = Math.floor(y + dy);
      const i = ty * size + tx;
      if (tx < 0 || ty < 0 || tx >= size || ty >= size || taken.has(i)) continue;
      if (w.blocked[i] || w.bid[i] >= 0 || (w.terr[i] !== T.GRASS && w.terr[i] !== T.PARK)) continue;
      taken.add(i);
      return [tx, ty] as const;
    }
    return null;
  };
  const ring = (r: number): [number, number][] =>
    Array.from({ length: 16 }, (_, k) => [
      Math.round(Math.cos((k / 16) * 6.283) * r),
      Math.round(Math.sin((k / 16) * 6.283) * r - 1),
    ]);
  const things: ThingLike[] = [];
  const lights: Light[] = [];
  const fire = spot([...ring(4), ...ring(5), ...ring(6)]);
  if (fire) {
    things.push({ kind: 'ognisko', x: fire[0], y: fire[1], w: 1, h: 1, rot: 0, fuel: 1 });
    lights.push({ x: fire[0] + 0.5, y: fire[1] + 0.6, r: 5.5, color: 0xff8a30, strength: 1.1, flicker: 0.35 });
  }
  // lampa warty po drugiej stronie zarządu niż ognisko, żeby światła się nie zlewały
  const lamp = spot([...ring(3), ...ring(4)].reverse());
  if (lamp) {
    things.push({ kind: 'lampa', x: lamp[0], y: lamp[1], w: 1, h: 1, rot: 0, spec: { kind: 'lampa', lit: true } });
    lights.push({ x: lamp[0] + 0.5, y: lamp[1] + 0.6, r: 3, color: 0xffb060, strength: 0.75, flicker: 0.08 });
  }
  const koza = w.interior.furniture.find((f) => f.kind === 'koza');
  if (koza)
    lights.push({ x: koza.x + 0.5, y: koza.y + 0.5, r: 4, color: 0xff8a30, strength: 1, flicker: 0.3, inside: true });
  return { things, lights };
}

/** stan gry na ekranie: rzeczy, ścięte drzewa, światła i siatka ze stanu symulacji (syncGame z src/render) */
function drawState() {
  if (!sim) return;
  view.syncGame(sim);
  // handlarz właśnie przyszedł: napis na dole ekranu
  const trader = sim.st.obcy?.trader ?? -1;
  if (trader >= 0 && trader !== traderSeen) say(tr(HANDEL.przyszedl(words.brama.pod, wordsE.brama)), 5000);
  traderSeen = trader;
  // wieść od wędrowca albo o ekipie przy wraku: raz, na dłużej (w stanie po polsku, po angielsku z wiescEn)
  const wiesc = sim.st.obcy?.wiesc;
  if (wiesc && wiesc.tick !== wiescSeen) say(L(wiesc.text, wiescEn(wiesc.text)), 7000);
  wiescSeen = wiesc?.tick ?? -1;
  // ?swiatla=test: światła podglądu nocy zamiast świateł z gry
  if (preview) view.lights = preview.lights;
  // minimapa sama pilnuje, żeby sprawdzać stan najwyżej co 500 ms i rysować tylko przy zmianie
  minimapa.odswiez();
}

/* ---------- zarząd ---------- */
function input(): GovInput {
  const s = sim!;
  const i = govInput(s.st, s.w, Math.floor(screen), hqName);
  // stan dziur (łaty, wielkość) jest w symulacji, a nazwy z kierunku od środka podwórka daje interfejs
  const names = new Map(s.w.fence?.hole.map((t, k) => [t, fenceIn?.holes[k]?.name]) ?? []);
  for (const h of i.fence?.holes ?? []) {
    const tiles = s.st.fence?.holes.find((x) => x.id === h.id)?.tiles ?? [];
    h.name ??= tiles.map((t) => names.get(t)).find(Boolean);
  }
  // miejsca z okolicy dla karty nocy i wypraw dziennych; bez opcji zarząd gra na TARGETS
  if (opcjaMiasto) i.okolica = okolica;
  // ludność kwadratu domu z 2021 roku do celu drogi ludnościowej; bez tabel pole zostaje puste
  if (ludnosc2021 !== undefined) i.ludnosc2021 = ludnosc2021;
  // warta i dyżur przy kozie, które stoją (także z menu), zarząd bierze z posterunków osób (people[].post)
  return i;
}

/** skutki zarządu do symulacji; ostatni wpis kroniki jako podpowiedź (bez niej, gdy zaraz otworzy się okno) */
function applyFx(fx: ReturnType<typeof govUpdate>, hint = true): string {
  if (!sim) return '';
  applyGov(sim.st, sim.w, fx);
  const last = tr(fx.log[fx.log.length - 1]);
  if (last && hint) say(last, 7000);
  return last;
}

/** krok zarządu: skutki do symulacji, potem decyzja do pokazania (show: od razu okno) */
function govStep(show: boolean): Prompt | null {
  if (!sim || !gov || gov.over) return null;
  const i = input();
  // bez ludzi zarząd kończy grę (pustka), więc dopiero po powstaniu pionków albo gdy ostatni zginął
  if (!i.people.length && !(sim.st.dead ?? []).some((d) => d.kind === 'core')) return null;
  const fx = govUpdate(gov, i);
  const p = gov.over ? null : pending(gov, i);
  applyFx(fx, !p);
  // wynik wyprawy dziennej nie ginie pod uchwałą czy kartą: czeka na krok bez okna (raport rano ma własne linie)
  powrotyCzekaja.push(...(fx.powroty ?? []));
  if (!p && powrotyCzekaja.length) {
    say(powrotyCzekaja.map(tr).join(' '), 7000);
    powrotyCzekaja = [];
  }
  if (gov.over) {
    if (show) showEnd();
    return null;
  }
  if (p && show && !modal.open) showPrompt(p);
  return p;
}

function pauseGame() {
  if (hold === null) hold = speed;
  speed = 0;
  renderSpeed();
}
function resumeGame() {
  if (hold === null) return;
  speed = hold;
  hold = null;
  renderSpeed();
}

/** po zamknięciu okna: następna decyzja zarządu albo powrót do gry w tym samym tempie */
function nextPrompt() {
  if (!sim || !gov) return resumeGame();
  if (gov.over) return showEnd();
  const p = pending(gov, input());
  if (p) showPrompt(p);
  else resumeGame();
}

function decided() {
  modal.close();
  save();
  nextPrompt();
}

function showPrompt(p: Prompt) {
  if (!gov) return;
  const g = gov;
  // po zmianie języka to samo okno od nowa, ze stanem zarządu z tej chwili (przydział na karcie nocy zostaje)
  sheetAgain = () => {
    const q = gov && pending(gov, input());
    if (q) showPrompt(q);
  };
  pauseGame();
  ctx.close();
  if (p.k === 'raport')
    modal.show(reportSheet(p.report), (act) => {
      if (act !== 'report-ok') return;
      ackReport(g, input());
      if (dayPace !== null) {
        hold = dayPace;
        dayPace = null;
      }
      decided();
    });
  else if (p.k === 'uchwala')
    modal.show(lawSheet(p, words, wordsE), (act, arg) => {
      if (act === 'law') applyFx(signLaw(g, input(), arg));
      else if (act === 'law-skip') applyFx(signLaw(g, input(), null));
      else return;
      sim?.setLaws(lawsFrom(lawEffects(g)));
      decided();
    });
  else if (p.k === 'karta') showNight(p);
  else if (p.k === 'zwyciestwo') showEpilog(p.droga);
  else
    modal.show(eventSheet(p, words, wordsE), (act, arg) => {
      if (act !== 'event') return;
      applyFx(chooseEvent(g, input(), Number(arg)));
      decided();
    });
}

function showNight(p: Extract<Prompt, { k: 'karta' }>) {
  const g = gov!;
  const card = p.card;
  const names = Object.fromEntries(card.people.map((c) => [c.id, c.name]));
  const i = input();
  const assign = () => g.night?.assign ?? p.assign;
  modal.show(nightSheet(card, assign(), nightOdds(g, i, card, assign()), words, wordsE), (act, arg, el) => {
    if (act === 'select') {
      const id = el.dataset.id ?? '';
      if (!setNight(g, id, arg)) {
        (el as HTMLSelectElement).value = assign()[id] ?? 'sen';
        return;
      }
      const odds = modal.find('[data-odds]');
      if (odds) odds.innerHTML = oddsHtml(card, assign(), nightOdds(g, i, card, assign()), names);
      const advice = modal.find('[data-advice]');
      if (advice) advice.textContent = tr(nightAdvice(i, card, assign()));
      const o = card.people.find((c) => c.id === id)?.options.find((q) => q.key === arg);
      const line = modal.find(`.opt[data-for="${CSS.escape(id)}"]`);
      if (line && o) line.textContent = optionDetail(o);
    } else if (act === 'night-reset') {
      for (const c of card.people) setNight(g, c.id, c.proposal);
      showNight(p);
    } else if (act === 'night-go') {
      const line = applyFx(confirmNight(g, input()));
      // zarząd idzie spać: do rana czas płynie szybciej, potem wraca tempo dnia (chyba że gracz sam je zmieni)
      if (hold !== null && hold > 0 && hold < NIGHT_PACE) {
        dayPace = hold;
        hold = NIGHT_PACE;
        say(
          `${line ? `${line} ` : ''}${L('Do rana czas płynie szybciej (6×).', 'Time runs faster until morning (6×).')}`,
          9000,
        );
      }
      decided();
    }
  });
}

/** epilog zwycięstwa drogą `droga` (okno z `pending`): „Graj dalej” zdejmuje epilog, zapisuje i wraca do gry w tempie sprzed
    okna (albo do następnej decyzji); „Nowa gra” pyta o potwierdzenie i dopiero po „Tak” zdejmuje epilog (tak samo jak
    „Graj dalej”), zapisuje i wychodzi na ekran startowy. Oba wybory zostawiają zapis: zwycięstwo nie kończy gry,
    w odróżnieniu od porażki (`showEnd`) */
function showEpilog(droga: Droga) {
  const g = gov;
  if (!g || !sim) return;
  modal.show(epilogSheet(droga, g.laws.path, g.mode ?? 'zwykly', statyEpilogu(g, input())), (act) => {
    if (act === 'zw-dalej') {
      grajDalej(g);
      decided();
    } else if (act === 'zw-nowa') askNowaGra(droga);
  });
}

/** potwierdzenie „Nowa gra” z epilogu. „Tak” zdejmuje epilog (`grajDalej`), zapisuje i idzie na ekran startowy, bez
    `decided()`: jego `nextPrompt()` mógłby przed wyjściem otworzyć poranny raport. Zapis zostaje (jak po „Zapisz i wróć”
    z Menu), ale bez epilogu, więc „Kontynuuj” go nie odtwarza, a raport, który czekał, wraca; nadpisze go dopiero zapis
    nowej gry. „Nie” i Esc wracają do epilogu, który dalej czeka w `pending`, bo decyzja jeszcze nie zapadła */
function askNowaGra(droga: Droga) {
  const g = gov;
  if (!g) return;
  sheetAgain = () => askNowaGra(droga);
  modal.show(
    confirmSheet(
      L('Nowa gra', 'New game'),
      L(
        'Wrócicie na ekran startowy. Ta gra zostaje w zapisie, dopóki nowa jej nie nadpisze.',
        'You go back to the start screen. This game stays saved until a new one overwrites it.',
      ),
    ),
    (act) => {
      if (act === 'confirm-yes') {
        grajDalej(g);
        save();
        location.href = startUrl();
      } else if (act === 'confirm-no') {
        modal.close();
        nextPrompt();
      }
    },
    nextPrompt,
  );
}

/** ekran „Drogi do zwycięstwa” (z Menu): gra stoi, „Wróć” wraca do Menu, zamknięcie wraca do gry albo do decyzji, która czeka */
function showDrogi() {
  if (!sim || !gov) return;
  sheetAgain = showDrogi;
  modal.show(
    drogiSheet(ocenDrogi(gov, input())),
    (act) => {
      if (act === 'zw-wroc') showMenu();
    },
    nextPrompt,
  );
}

function showEnd() {
  if (!gov?.over) return;
  sheetAgain = showEnd;
  pauseGame();
  clearSave();
  // gra z sąsiadami: zapis w chmurze i klatki drużyny też znikają
  siec.koniec();
  modal.show(endSheet(gov.over, words, wordsE), (act) => {
    if (act === 'end-start') location.href = startUrl();
  });
}

function save(): boolean {
  if (!sim || !gov || !loaded || gov.over) return false;
  const s: Save = {
    v: 1,
    at: Date.now(),
    data: loaded,
    seed,
    sim: sim.st,
    gov,
    screen,
    cam: { ...view.cam },
    world: worldKey(sim.w),
    ...(siec.stan ? { siec: siec.stan } : {}),
    ...(pietraGry ? { pietra: true } : {}),
  };
  const ok = writeSave(s);
  // gra z sąsiadami: także do chmury (najwyżej raz na minutę)
  siec.zapisz(s);
  return ok;
}
window.addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

/**
 * Napad w nocy: kiedy szabrownicy czają się za siatką, a ktoś z zarządu stoi na warcie, warta to słyszy i gra mówi
 * gdzie. Jeśli są w świetle (lampa warty, ognisko), kamera jedzie na miejsce, a gdy tempo nocy ustawiła gra (6× po
 * karcie), noc zwalnia do 1× do końca napadu. Bez warty nikt nic nie słyszy: o napadzie mówi kronika i raport.
 */
/** od tej widoczności (jak w rysowaniu obcych: 0 ciemność, 1 pełne światło) warta „widzi” szabrowników */
const SEEN = 0.25;
/* ---------- sąsiedzi (M2 fala 2): karta spotkania i zdania przy cudzych drzwiach ---------- */
/** numer ostatniego pokazanego napisu sąsiadów (po wczytaniu zapisu stary się nie powtarza) */
let napisSeen = 0;
/** spotkanie, w którym gracz już wybrał (numer i runda): karta czeka, aż symulacja rozstrzygnie wybór */
let meetChosen: { nr: number; runda: number } | null = null;

/** nowy napis sąsiadów jako podpowiedź, a trwające spotkanie jako okno z pauzą (gdy nie ma innego okna) */
function watchSasiedzi() {
  if (!sim) return;
  const s = sim.st.sasiedzi;
  if (!s) return;
  if (s.napis && s.n > napisSeen) {
    napisSeen = s.n;
    const n = s.napis;
    const q = n.kto !== undefined ? sim.st.pawns.find((p) => p.id === n.kto) : undefined;
    const person = q && q.person >= 0 ? sim.st.people[q.person] : undefined;
    const bid = s.budynki[n.b]?.bid ?? -1;
    const t = zdanieNapisu(
      n,
      person ? { first: person.first, f: person.f } : null,
      bid >= 0 ? sim.w.buildings[bid].name : undefined,
    );
    if (t) say(t, 6000);
  }
  const sp = s.spotkanie;
  if (!sp) {
    meetChosen = null;
    return;
  }
  if ((meetChosen && meetChosen.nr === sp.nr && meetChosen.runda === (sp.runda ?? 0)) || modal.open) return;
  showMeet();
}

/** okno spotkania: wybór idzie do symulacji poleceniem meet, gra rusza dalej, a wynik przychodzi napisem */
function showMeet() {
  const s = sim?.st.sasiedzi;
  const sp = s?.spotkanie;
  const k = sim?.kontekstKarty();
  if (!sim || !s || !sp || !k) return;
  const b = s.budynki[sp.b];
  const g = b.domy[sp.dom];
  const nr = sp.nr;
  const runda = sp.runda ?? 0;
  sheetAgain = showMeet;
  pauseGame();
  ctx.close();
  modal.show(
    spotkanieSheet({
      sp,
      g,
      wybory: wybory(sp, g, k),
      jedzenie: k.jedzenie,
      budynek: sim.w.buildings[b.bid].name,
      dom: sim.w.buildings[b.bid].cls === 'dom',
    }),
    (act, arg) => {
      if (act !== 'meet' || !sim) return;
      meetChosen = { nr, runda };
      sim.push({ t: 'meet', ids: [], nr, choice: arg as WyborSpotkania });
      decided();
    },
  );
}

function watchRaid() {
  if (!sim) return;
  const r = sim.st.raid;
  if (raidHold !== null && (!r || r.phase >= 3)) {
    // po napadzie noc znowu biegnie szybciej
    if (!modal.open) {
      speed = raidHold;
      renderSpeed();
    } else hold = raidHold;
    raidHold = null;
    say(
      L('Szabrownicy odeszli. Do rana znowu szybciej (6×).', 'The looters are gone. Faster again until morning (6×).'),
      5000,
    );
  }
  if (r?.phase !== 1 || raidSeen === r.at || modal.open) return;
  const st = sim.st;
  const lamps = st.pawns.filter((p) => p.kind === 'core' && !p.away && p.job?.t === 'guard' && p.job.phase === 1);
  const them = st.pawns.filter((p) => p.kind === 'szabrownik');
  if (!lamps.length || !them.length) return;
  // widać ich tak, jak rysuje widok: światło latarni warty i ogniska w ich miejscu (sam zasięg z symulacji,
  // LAMP_REACH 5 m, jest większy niż rysowana latarnia, 3 m, więc kamera przyjeżdżała do ciemności)
  const lights = gameLights({ st, light: [] }, []).filter((l) => !l.inside);
  const time = performance.now() / 1000;
  const lit = them.some((q) => strangerVisibility(view.darkness, lightAt(q.x, q.y - 0.5, lights, time)) >= SEEN);
  const where = () => {
    const hole = input().fence?.holes.find((h) => `d${h.id}` === r.post);
    const name = hole?.name;
    return r.post === 'brama'
      ? L(words.brama.przy, `at ${wordsE.brama}`)
      : L(`przy dziurze ${name?.pl ?? 'w siatce'}`, `at the hole ${name?.en ?? 'in the fence'}`);
  };
  // w ciemności warta tylko słyszy (raz); patrzymy dalej, bo zaraz mogą wejść w światło lampy
  if (!lit) {
    if (raidHeard !== r.at) {
      raidHeard = r.at;
      say(
        L(
          `Warta słyszy coś ${where()}, ale tam ciemno. Światło przy siatce pokazałoby, kto to.`,
          `The watch hears something ${where()}, but it is dark there. A light by the fence would show who it is.`,
        ),
        8000,
      );
    }
    return;
  }
  raidSeen = r.at;
  const slow = dayPace !== null && speed > 1;
  if (slow) {
    raidHold = speed;
    speed = 1;
    renderSpeed();
  }
  say(
    L(
      `Warta widzi szabrowników ${where()}.${slow ? ' Czas zwalnia do 1×.' : ''}`,
      `The watch can see looters ${where()}.${slow ? ' Time slows down to 1×.' : ''}`,
    ),
    9000,
  );
  const x = them.reduce((a, p) => a + p.x, 0) / them.length;
  const y = them.reduce((a, p) => a + p.y, 0) / them.length;
  // bez zmiany przybliżenia: kamera tylko przesuwa się na miejsce
  flyTo(x * TILE, y * TILE, view.cam.zoom, 1200);
}

/* ---------- kamera ---------- */
let fly: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t0: number; ms: number } | null =
  null;
/** przejazd kamery do (x, y) w pikselach świata; wait: ile ms odczekać przed ruszeniem (przy alarmie chwila,
    żeby gracz przeczytał napis, a po przycisku od razu) */
function flyTo(x: number, y: number, zoom: number, ms: number, wait = 500) {
  fly = { x0: view.cam.x, y0: view.cam.y, z0: view.cam.zoom, x1: x, y1: y, z1: zoom, t0: performance.now() + wait, ms };
}
function stepFly(now: number) {
  if (!fly) return;
  const t = Math.min(1, Math.max(0, (now - fly.t0) / fly.ms));
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  view.cam.x = fly.x0 + (fly.x1 - fly.x0) * e;
  view.cam.y = fly.y0 + (fly.y1 - fly.y0) * e;
  view.cam.zoom = fly.z0 * (fly.z1 / fly.z0) ** e;
  if (t >= 1) fly = null;
}
const screenOf = (x: number, y: number): [number, number] => [
  (x * TILE - view.cam.x) * view.cam.zoom + view.width / 2,
  (y * TILE - view.cam.y) * view.cam.zoom + view.height / 2,
];

/* ---------- pętla ---------- */
let fpsFrames = 0;
let fpsT = performance.now();
let fps = 0;
let hudT = 0;
const keys = new Set<string>();

function frame(now: number, dtMs: number) {
  if (!sim) return;
  stepFly(now);
  // klawiatura: przesuwanie mapy
  const pan = (900 * dtMs) / 1000 / view.cam.zoom;
  if (keys.has('KeyW') || keys.has('ArrowUp')) view.cam.y -= pan;
  if (keys.has('KeyS') || keys.has('ArrowDown')) view.cam.y += pan;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) view.cam.x -= pan;
  if (keys.has('KeyD') || keys.has('ArrowRight')) view.cam.x += pan;
  view.clampCam();
  // stały krok symulacji
  const mult = SPEEDS[speed];
  const dt = Math.min(dtMs, 100) / 1000;
  acc += dt * TICKS_PER_SECOND * mult;
  let n = 0;
  while (acc >= 1 && n < 40) {
    view.beforeStep(sim.st);
    sim.step();
    acc -= 1;
    n++;
  }
  if (n === 40) acc = 0;
  // czas przy ekranie płynie tylko w grze bez pauzy, niezależnie od tempa
  if (mult && !modal.open) screen += dt;
  if (screen - govAt >= 1) {
    govAt = screen;
    govStep(true);
  }
  watchRaid();
  watchSasiedzi();
  drawState();
  view.render(sim.st, mult ? acc : 1, selected);
  placeMarker();
  siec.klatka(sim, now, modal.open);
  placeGhost();
  // zapis co godzinę gry
  const h = Math.floor(sim.st.tick / TICKS_PER_HOUR);
  if (h !== savedHour) {
    savedHour = h;
    save();
  }
  fpsFrames++;
  if (now - fpsT >= 1000) {
    fps = (fpsFrames * 1000) / (now - fpsT);
    fpsFrames = 0;
    fpsT = now;
  }
  if (now - hudT > 200) {
    hudT = now;
    hud(now);
  }
}

let cardHtml = '';
/** historia rozwinięta na karcie tej osoby (pionek); inna osoba na karcie to historia znowu w jednej linijce */
let storyOf = -1;
/** karta przerysowana tylko po zmianie treści, inaczej dymki z opisem cech nigdy się nie pokażą */
function setCard(html: string) {
  if (html === cardHtml) return;
  // rozwinięta lista stałego zajęcia nie może znikać co 200 ms: karta przerysuje się, gdy lista straci fokus
  const f = document.activeElement;
  if (f instanceof HTMLSelectElement && $('card').contains(f)) return;
  cardHtml = html;
  $('card').innerHTML = html;
}

/** ostatni odczyt symulacji z `hud` (panel Pracy bierze z niego widok, a po kliknięciu, gdy symulacja zdążyła zrobić
    krok, liczy nowy) */
let lastSnap: SimSnapshot | null = null;
/** odczyt na tę chwilę: ten z `hud`, a gdy symulacja poszła dalej, świeży */
function snapNow(): SimSnapshot | null {
  if (!sim) return null;
  if (!lastSnap || lastSnap.tick !== sim.st.tick) lastSnap = snapshot(sim.st, sim.w);
  return lastSnap;
}
/** osoba z ustawieniami pracy z poleceniami, które jeszcze czekają w kolejności symulacji (gra na pauzie nie wykonuje
    kroków, a karta ma się zmienić od razu) */
function withPendingWork(p: SimPerson, cmds: SimState['cmds']): SimPerson {
  return { ...p, praca: { ...p.praca, ...nalozPraceOsoby(p.praca, p.osoba, cmds) } };
}

/** co osoba robi tej nocy według karty nocy (propozycja albo zatwierdzony przydział), a bez karty posterunek
    z symulacji (warta albo dyżur przy kozie z menu trwa do rana) */
function tonight(p: SimPerson): string | undefined {
  const n = gov?.night;
  const key = n?.assign[p.id];
  if (n && key && key !== 'sen') {
    const opt = n.card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key);
    const label = opt ? tr(opt.label) : key;
    return L(
      `Tej nocy: ${label.toLowerCase()}${n.confirmed ? '' : ' (propozycja)'}.`,
      `Tonight: ${label[0].toLowerCase()}${label.slice(1)}${n.confirmed ? '' : ' (suggested)'}.`,
    );
  }
  if (p.post === 'koza') return L('Do rana: czuwa przy kozie.', 'Until morning: watching the stove.');
  if (p.post)
    return L(
      `Do rana: warta ${p.post === 'brama' ? words.brama.przy : p.post === 'siatka' ? 'przy siatce' : 'przy dziurze w siatce'}.`,
      `Until morning: on watch ${p.post === 'brama' ? `at ${wordsE.brama}` : p.post === 'siatka' ? 'at the fence' : 'at a hole in the fence'}.`,
    );
  return undefined;
}

function hud(now: number) {
  if (!sim) return;
  const st = sim.st;
  $('hDay').textContent = L(`Dzień ${dayOf(st.tick)}`, `Day ${dayOf(st.tick)}`);
  $('hTime').textContent = clockOf(st.tick);
  $('fps').textContent = L(`${Math.round(fps)} kl/s`, `${Math.round(fps)} fps`);
  const snap = snapshot(st, sim.w);
  lastStock = snap.stock;
  lastSnap = snap;
  buildPanel.refresh();
  pracaPanel.refresh();
  // koza wygasła po samouczku, a drewna nie ma: decyzja gracza (drzewo albo mebel), więc ostrzeżenie wisi,
  // dopóki problem trwa (w dzień, kiedy zarząd nie śpi), i ma pierwszeństwo przed zwykłymi podpowiedziami
  const wood = snap.stock.woodSklad + snap.stock.woodLoose + snap.stock.woodCarried;
  const afterKoza = st.tut.step < 0 || st.tut.step > TUT_STEPS.indexOf('koza');
  const cold = afterKoza && !snap.kozaLit && !wood && snap.hour >= 6 && snap.hour < 22;
  // gorączka po ugryzieniu: niecałe 2 godziny do śmierci, a zmarły wstaje, więc ktoś z bronią powinien być przy nim
  const dying = snap.people.find((p) => p.bite && p.bite.left < 2 * TICKS_PER_HOUR);
  const fever = dying
    ? L(
        `${dying.name} umiera w gorączce. Po śmierci wstanie: niech ktoś z bronią będzie obok, żeby dobić.`,
        `${dying.name} is dying of fever and will get back up after death. Have someone armed standing by to finish the job.`,
      )
    : '';
  const warn = fever
    ? fever
    : cold
      ? touchUI
        ? L(
            'Koza wygasła, a drewna nie ma. Zetnijcie drzewo albo spalcie mebel (przytrzymajcie na nim palec).',
            'The stove has gone out and there is no wood. Chop down a tree or burn some furniture (press and hold on it).',
          )
        : L(
            'Koza wygasła, a drewna nie ma. Zetnijcie drzewo albo spalcie mebel (prawy przycisk na meblu).',
            'The stove has gone out and there is no wood. Chop down a tree or burn some furniture (right-click it).',
          )
      : '';
  $('hint').textContent = warn || (now < hintUntil ? hint : '');
  $('hint').classList.toggle('warn', !!warn);
  renderStats(statsOf(snap, gov, words, wordsE));
  odswiezPietra();
  alarmButton(st);
  renderGoals(snap);
  // przyjęci idą zza bramy: komunikat z przyciskiem „Pokaż”, dopóki ktoś jeszcze idzie
  const coming = arriving(st).length;
  $('arrive').hidden = !coming;
  const comingLine = coming ? comingText(coming, words, wordsE) : '';
  if (coming && $('arriveText').textContent !== comingLine) $('arriveText').textContent = comingLine;
  const card = $('card');
  // karta mieszkańca z osobą (kliknięty): do odczytu, zasłania kartę zaznaczonego z zarządu, dopóki jest wybrana
  const lok = residentFocus >= 0 ? snap.lokatorzy.find((p) => p.pawn === residentFocus) : undefined;
  if (residentFocus >= 0 && !lok) residentFocus = -1;
  // edytor imienia zasłania kartę osoby, dopóki ta osoba jest na karcie (zaznaczona albo kliknięty mieszkaniec);
  // HTML edytora się nie zmienia, więc odświeżanie karty nie kasuje wpisanych liter
  if (imieEdit) {
    const naKarcie = imieEdit.lokator
      ? residentFocus === imieEdit.pawn
      : residentFocus < 0 && selected.size === 1 && selected.has(imieEdit.pawn);
    if (naKarcie && st.people[imieEdit.person]?.ref) {
      card.hidden = false;
      setCard(imieEdit.html);
      return;
    }
    imieEdit = null;
  }
  if (lok) {
    card.hidden = false;
    setCard(
      personCard(lok, st.tick, undefined, storyOf === lok.pawn, {
        lokator: true,
        imie: imionaWGrze(siec.stan),
        words,
        wordsEn: wordsE,
        en: lok.ref ? angielscy?.get(lok.ref) : undefined,
      }),
    );
    return;
  }
  const sel = snap.people.filter((p) => selected.has(p.pawn));
  if (!sel.length) {
    // karta mieszkania po kliknięciu w mieszkanie siedziby, karta budynku po kliknięciu w sąsiedni budynek
    const apt = aptFocus >= 0 ? aptView(st, sim.w, aptFocus, snap.apts) : null;
    const bud = !apt && budFocus >= 0 ? sim.budynekDoKarty(budFocus) : null;
    card.hidden = !apt && !bud;
    if (apt) setCard(aptCard(apt, touchUI, words, wordsE));
    else if (bud) setCard(kartaBudynku(widokBudynku(sim.w, bud.b, bud.wGrze, sim.st.plot, pietraGry), touchUI));
    return;
  }
  card.hidden = false;
  if (sel.length > 1)
    setCard(
      groupCard(
        sel.map((p) => p.name),
        touchUI,
      ),
    );
  else
    setCard(
      personCard(withPendingWork(sel[0], st.cmds), st.tick, tonight(sel[0]), storyOf === sel[0].pawn, {
        imie: imionaWGrze(siec.stan),
        words,
        wordsEn: wordsE,
        en: sel[0].ref ? angielscy?.get(sel[0].ref) : undefined,
        widoczne: snap.praca.widoczne,
        zombie: snap.mode === 'zombie',
      }),
    );
}

let goalsHtml = '';
/** zapas drewna na noc był choć raz (cel się nie cofa, kiedy koza zje drewno); drugi dzień osobno */
let woodReady = false;
let woodReady2 = false;
function renderGoals(snap: SimSnapshot) {
  const el = $('goals');
  if (!sim) return;
  // gra z sąsiadami, drużyna bez domu: najpierw dojść do wolnej klatki
  if (siec.bezDomu()) {
    const own = siec.cele(snap.people.some((p) => selected.has(p.pawn)));
    const now = own.find((g) => !g.done);
    el.hidden = false;
    const html = `<button type="button" class="goals-head" aria-expanded="${el.classList.contains('open')}"><span>${L('Bez domu', 'Homeless')}</span><b class="goals-n">${own.filter((g) => g.done).length}/${own.length}</b></button><ol class="goal-list">${own
      .map(
        (g, k) =>
          `<li class="goal${g.done ? ' done' : g === now ? ' now' : ''}" data-n="${k + 1}">${esc(g.text)}${g === now ? `<small class="goal-how">${esc(g.how)}</small>` : ''}</li>`,
      )
      .join('')}</ol>`;
    if (html !== goalsHtml) {
      goalsHtml = html;
      el.innerHTML = html;
    }
    return;
  }
  const wood = snap.stock.woodSklad + snap.stock.woodLoose + snap.stock.woodCarried;
  if (wood >= NIGHT_WOOD && sim.st.tut.step >= TUT_STEPS.length) woodReady = true;
  let list = goalsOf(sim.st, gov, {
    touch: touchUI,
    kitchen: snap.kitchen,
    hour: snap.hour,
    selected: snap.people.some((p) => selected.has(p.pawn)),
    wood,
    woodReady,
    words,
    wordsEn: wordsE,
  });
  let cur = currentGoal(list);
  let title = L('Pierwszy dzień', 'Day one');
  // po pierwszej nocy cele drugiego dnia: przeszukać, warsztat, obwód, drewno na noc
  if (!cur && isDay2(gov)) {
    if (wood >= DAY2_WOOD) woodReady2 = true;
    list = goalsDay2(sim.st, gov, {
      touch: touchUI,
      wood,
      woodReady: woodReady2,
      holes: snap.fence.holes.length,
      words,
      wordsEn: wordsE,
    });
    cur = currentGoal(list);
    title = L('Drugi dzień', 'Day two');
  }
  // po drugiej nocy lista znika
  if (!cur) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const done = list.filter((g) => g.done).length;
  const html = `<button type="button" class="goals-head" aria-expanded="${el.classList.contains('open')}"><span>${title}</span><b class="goals-n">${done}/${list.length}</b></button><ol class="goal-list">${list
    .map(
      (g, k) =>
        `<li class="goal${g.missed ? ' missed' : g.done ? ' done' : g === cur ? ' now' : ''}" data-n="${k + 1}">${esc(g.text)}${
          g === cur ? `<small class="goal-how">${esc(g.how)}</small>` : ''
        }</li>`,
    )
    .join('')}</ol>`;
  if (html === goalsHtml) return;
  goalsHtml = html;
  el.innerHTML = html;
}
// na telefonie lista celów zwija się do bieżącego celu
$('goals').addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.goals-head')) return;
  $('goals').classList.toggle('open');
  goalsHtml = '';
  if (sim) renderGoals(snapshot(sim.st, sim.w));
});

/** miejsce etykiety suchego drzewa, liczone raz dla świata i układu ekranu (etykieta jedzie z mapą i nie
    skacze; na wąskim ekranie tylko nad koroną albo pod pniem) */
let markWorld: World | null = null;
let markNarrow = false;
let markAt: MarkSpot | null = null;
/** szerokość napisu w pikselach (mierzona po zmianie tekstu, nie co klatkę) */
let markW = 120;
/** węższy ekran (telefon): napis z boku korony się nie mieści */
const NARROW = 640;

/** znacznik z boku korony suchego drzewa (tam, gdzie nie zasłania bramy, siatki ani rzeczy), a gdy drzewo
    jest poza ekranem, przy krawędzi ze strzałką w jego stronę */
function placeMarker() {
  const el = $('treeMark');
  const w = sim?.w;
  if (!sim || !w || w.dryTree < 0 || !markTree(sim.st) || modal.open) {
    el.hidden = true;
    return;
  }
  const narrow = view.width < NARROW;
  if (markWorld !== w || markNarrow !== narrow) {
    markWorld = w;
    markNarrow = narrow;
    markAt = markSpot(w, narrow ? ['n', 's'] : undefined);
  }
  const crown = crownOf(w);
  if (!markAt || !crown) {
    el.hidden = true;
    return;
  }
  const side = markAt.side;
  const [sx, sy] = screenOf(markAt.x, markAt.y);
  // lewy brzeg napisu: z boku obok punktu, nad koroną i pod pniem na środku
  const x0 = side === 'w' ? sx - 10 - markW : side === 'e' ? sx + 10 : sx - markW / 2;
  // pod paskiem, a nad listą celów pod nią (lewy brzeg napisu na jej szerokości)
  const bar = $('top').getBoundingClientRect().bottom;
  const goals = $('goals');
  const g = goals.hidden ? null : goals.getBoundingClientRect();
  // komunikat o przybyszach stoi pod paskiem (na telefonie pod listą celów): napis, który na niego wchodzi, idzie pod spód
  const notice = $('arrive');
  const n = notice.hidden ? null : notice.getBoundingClientRect();
  const under = (left: number) => {
    const t = g && left < g.right ? Math.max(bar, g.bottom) : bar;
    return n && left < n.right && left + markW > n.left ? Math.max(t, n.bottom) : t;
  };
  let top = under(x0);
  // poza ekranem (punkt, w który celuje ogonek): przy krawędzi ze strzałką, napis wyśrodkowany w cx
  const edge = sx < 70 || sx > view.width - 70 || sy < top + 30 || sy > view.height - 70;
  const cx = edge ? Math.max(70, Math.min(view.width - 70, sx)) : sx;
  if (edge) top = under(cx - markW / 2);
  const cy = edge ? Math.max(top + 30, Math.min(view.height - 70, sy)) : sy;
  // napis wystający za ekran przesuwa się płynnie do środka (bez skoku na inną stronę)
  const shift = edge ? 0 : Math.max(4 - x0, Math.min(0, view.width - 4 - (x0 + markW)));
  el.hidden = false;
  el.classList.toggle('edge', edge);
  el.dataset.side = edge ? '' : side;
  el.style.setProperty('--shift', `${Math.round(shift)}px`);
  // kreska od ogonka do korony, gdy napis stoi dalej od drzewa
  el.style.setProperty('--lead', `${Math.round(markAt.lead * TILE * view.cam.zoom)}px`);
  el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
  // poza ekranem: strzałka w stronę korony (osiem kierunków)
  const [tx, ty] = screenOf(crown.x, crown.y);
  const arrow = edge ? `${ARROWS[(Math.round(Math.atan2(ty - cy, tx - cx) / (Math.PI / 4)) + 8) % 8]} ` : '';
  const label = el.firstElementChild as HTMLElement;
  const dead = `${arrow}${L('Suche drzewo', 'Dead tree')}`;
  if (label.textContent !== dead) {
    label.textContent = dead;
    markW = label.offsetWidth || markW;
  }
}
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

function say(t: string, ms = 4000) {
  hint = t;
  hintUntil = performance.now() + ms;
}

function renderSpeed() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speed button'))
    b.setAttribute('aria-pressed', String(Number(b.dataset.s) === speed));
}
$('speed').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  speed = Number(b.dataset.s);
  hold = null;
  dayPace = null;
  raidHold = null;
  renderSpeed();
});
$('zIn').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1.5);
$('zOut').onclick = () => view.zoomAt(view.width / 2, view.height / 2, 1 / 1.5);
$('zHome').onclick = () => {
  if (!sim) return;
  // siedziba stoi na parterze
  wybierzPietro(0);
  const hq = sim.w.buildings[sim.w.hq];
  flyTo(((hq.x0 + hq.x1 + 1) / 2) * TILE, ((hq.y0 + hq.y1 + 1) / 2) * TILE + 120, Math.max(1, view.cam.zoom), 700);
};

/* ---------- menu gry (zamiast natywnego confirm) ---------- */
function showMenu() {
  sheetAgain = showMenu;
  const auto = L(
    'Gra zapisuje się sama co godzinę gry i przy zamknięciu karty.',
    'The game saves itself every game hour and when you close the tab.',
  );
  const last = readSave();
  const note = last ? `${auto} ${L('Ostatni zapis', 'Last save')}: ${saveLabel(last)}.` : auto;
  // przełącznik języka nad przyciskami Menu
  const sheet = menuSheet(note);
  sheet.body = `<div class="menu-lang" data-lang-menu>${przelacznikHtml(jezyk())}</div>${sheet.body}`;
  modal.show(
    sheet,
    (act) => {
      if (act === 'menu-back') {
        modal.close();
        nextPrompt();
      } else if (act === 'menu-help') showHelp();
      else if (act === 'menu-zwyciestwo') showDrogi();
      else if (act === 'menu-start') {
        save();
        location.href = startUrl();
      }
    },
    nextPrompt,
  );
}
/** jak grać (z Menu) */
function showHelp() {
  sheetAgain = showHelp;
  modal.show(
    helpSheet(touchUI, !!sim && modeOf(sim.st) === 'zombie', words, wordsE),
    (a) => {
      if (a === 'help-back') showMenu();
    },
    nextPrompt,
  );
}
// przełącznik języka w Menu: kliknięcie zmienia język, a okno rysuje się od nowa przez słuchacza niżej
podepnijPrzelacznik($('modal'));
$('btnMenu').onclick = () => {
  if (!sim || modal.open) return;
  pauseGame();
  ctx.close();
  showMenu();
};

/* ---------- broń i alarm ---------- */
// ten sam przycisk włącza i odwołuje alarm; napis i podpowiedź bez alarmu jak w index.html (napisy statyczne)
const ALARM_IDLE = STATYCZNE.find((x) => x.sel === '#btnAlarm')!;
$('btnAlarm').onclick = () => {
  if (!sim || modal.open) return;
  const core = sim.st.pawns.filter((p) => p.kind === 'core' && !p.away).map((p) => p.id);
  if (alarmOn(sim.st)) {
    sim.push({ t: 'alarm', ids: core, off: true });
    say(L(ALARM_OFF_SAY, ALARM_OFF_SAY_EN), 2500);
    alarmButton(sim.st);
    return;
  }
  sim.push({ t: 'alarm', ids: core });
  say(
    modeOf(sim.st) === 'zombie'
      ? L(
          'Do broni! Wszyscy zdolni na wartę przy siatce.',
          'To arms! Everyone who can stand goes on watch at the fence.',
        )
      : L(
          `Do broni! Wszyscy zdolni na wartę ${words.brama.przy}.`,
          `To arms! Everyone who can stand goes on watch at ${wordsE.brama}.`,
        ),
    4000,
  );
  alarmButton(sim.st);
};

/** przycisk alarmu według stanu symulacji: „Do broni!” albo „Odwołaj”; DOM zmienia się tylko przy zmianie */
function alarmButton(st: SimState) {
  const b = $('btnAlarm');
  const on = alarmOn(st);
  const text = on ? L(ALARM_OFF, ALARM_OFF_EN) : tr(ALARM_IDLE.tekst);
  if (b.textContent === text) return;
  b.textContent = text;
  b.title = on ? L(ALARM_OFF_TITLE, ALARM_OFF_TITLE_EN) : tr(ALARM_IDLE.title);
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}

/** kolejność broni przy „Zmień”: najpierw to, co sięga przez siatkę */
const ARM_ORDER: readonly WeaponId[] = ['dzida', 'rewolwer', 'strzelba', 'kusza', 'siekiera', 'lom', 'kij', 'noz'];
$('card').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-card]');
  if (!b || !sim) return;
  const st = sim.st;
  // edytor imienia: Zapisz to wysłanie formularza (niżej), Anuluj i Przywróć tutaj
  if (b.dataset.card === 'imie-zapisz') return;
  if (b.dataset.card === 'imie-anuluj') return zamknijImie();
  if (b.dataset.card === 'imie-przywroc') return przywrocImie();
  // zmiana imienia osoby z generatora: na karcie mieszkańca i na karcie jednej osoby z zarządu (nie w grze z sąsiadami)
  if (b.dataset.card === 'imie') {
    if (!imionaWGrze(siec.stan)) return;
    const kto =
      residentFocus >= 0
        ? st.pawns.find((p) => p.id === residentFocus)
        : st.pawns.filter((p) => p.kind === 'core' && selected.has(p.id)).at(0);
    if (kto && kto.person >= 0 && (residentFocus >= 0 || selected.size === 1))
      void otworzImie(kto.person, kto.id, residentFocus >= 0);
    return;
  }
  // karta mieszkańca jest tylko do odczytu: z jej przycisków działa historia (i zmiana imienia wyżej)
  if (residentFocus >= 0) {
    if (b.dataset.card === 'story') {
      storyOf = storyOf === residentFocus ? -1 : residentFocus;
      hud(performance.now());
    }
    return;
  }
  const sel = st.pawns.filter((p) => p.kind === 'core' && selected.has(p.id));
  if (sel.length !== 1) return;
  const p = sel[0];
  if (b.dataset.card === 'zasiatke') {
    // przełącznik „może wychodzić za siatkę”: od stanu z czekającymi poleceniami, żeby na pauzie przełączał tam i z powrotem
    const snap = snapNow();
    const kto = snap?.people.find((q) => q.pawn === p.id);
    if (!snap || !kto) return;
    const on = !withPendingWork(kto, st.cmds).praca.zaSiatke;
    sim.push({ t: 'zasiatke', ids: [], osoba: p.person, on });
    if (on && snap.mode === 'zombie') say(ZA_SIATKA_ZOMBIE(), 5000);
    hud(performance.now());
    pracaPanel.refresh();
  } else if (b.dataset.card === 'story') {
    // historia z drużyny: jedna linijka albo cała, od razu na karcie
    storyOf = storyOf === p.id ? -1 : p.id;
    hud(performance.now());
  } else if (b.dataset.card === 'arm') {
    // następna broń z magazynu w ustalonej kolejności, a gdy nie ma żadnej: odłożyć to, co w rękach
    const have = new Set(st.store.arms ?? []);
    const list = ARM_ORDER.filter((w) => have.has(w) && w !== p.weapon);
    const at = p.weapon ? ARM_ORDER.indexOf(p.weapon) : -1;
    const next = list.find((w) => ARM_ORDER.indexOf(w) > at) ?? list[0] ?? null;
    if (next === null && !p.weapon)
      return say(L('W magazynie nie ma broni.', 'There are no weapons in the storeroom.'), 2500);
    sim.push({ t: 'arm', ids: [p.id], weapon: next });
    say(
      next
        ? L(`Bierze ${WEAPONS[next].acc}.`, `Takes ${WEAPONS_EN[next].the}.`)
        : L('Odkłada broń do magazynu.', 'Puts the weapon back in the storeroom.'),
      2500,
    );
  } else if (b.dataset.card === 'amputate') {
    // amputuje ten z zarządu, kto najlepiej zna się na medycynie
    const doc = st.pawns
      .filter((q) => q.kind === 'core' && q !== p && !q.away && (q.needs?.health ?? 0) > 20)
      .sort((a, c) => (st.people[c.person].skills.med ?? 0) - (st.people[a.person].skills.med ?? 0) || a.id - c.id)[0];
    if (!doc) return say(L('Nie ma komu amputować.', 'There is nobody to do the amputation.'), 3000);
    sim.push({ t: 'amputate', ids: [doc.id], patient: p.id });
    const who = st.people[doc.person].first;
    say(
      L(
        `${who} amputuje. Pół godziny, nie zawsze się udaje.`,
        `${who} is amputating. Half an hour, and it doesn’t always work.`,
      ),
      4000,
    );
  }
});

/** wybór stałego zajęcia na karcie osoby (lista rozwijana): pusty wybór zdejmuje je */
$('card').addEventListener('change', (e) => {
  const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-card="stale"]');
  if (!s || !sim) return;
  const sel = sim.st.pawns.filter((p) => p.kind === 'core' && selected.has(p.id));
  if (sel.length !== 1) return;
  const rodzaj = RODZAJE.find((r) => r === s.value) ?? null;
  sim.push({ t: 'stale', ids: [], osoba: sel[0].person, rodzaj });
  // lista traci fokus, żeby karta znowu się odświeżała, i od razu pokazuje wybór z czekającego polecenia
  s.blur();
  hud(performance.now());
  pracaPanel.refresh();
});

/* ---------- imiona gracza (src/ui/imiona.ts) ---------- */
/** Dane mieszkańców z generatora tej gry: wynik `lokatorzyGry` dla siedziby, tabele i adres (`Loaded.addr`, ten sam
    napis co w zapisie gry; klucz pamięci imion). Ustawia je `enter` w nowej grze z tabelami i we wznowionym zapisie
    z osobami z generatora, a na końcu woła `zastosujImiona()`. Bez nich (null: bez tabel, zapis sprzed kroku 5)
    zmiana imienia zmienia tylko imię osoby, bez historii i rodziny krewnych, pod adresem z `loaded`. */
let mieszkancy: { l: LokatorzyGry; dane: DaneMieszkancow; adres: string } | null = null;
/** edytor imienia w karcie: osoba (indeks w st.people), jej pionek, karta mieszkańca albo zarządu, stały HTML edytora
    i odmiana do podpowiedzi form */
let imieEdit: { person: number; pawn: number; lokator: boolean; html: string; odm: Odmiana } | null = null;
/** bez danych mieszkańców: imiona osób z generatora sprzed pierwszej zmiany w tej grze (do „Przywróć”) */
const imionaGen = new Map<string, { first: string; name: string }>();
let odmianaPlikow: Promise<Odmiana | null> | null = null;

const adresImion = (): string | null => mieszkancy?.adres ?? loaded?.addr ?? null;

/** odmiana do podpowiedzi: z danych mieszkańców, a bez nich wczytana raz z public/data/mieszkancy/ (pliki gry, bez
    wysyłania czegokolwiek) */
function odmianaEdytora(): Promise<Odmiana | null> {
  if (mieszkancy) return Promise.resolve(mieszkancy.dane.odmiana);
  odmianaPlikow ??= Promise.all([wczytajOdmiane(), wczytajKoncowki()])
    .then(([tabela, koncowki]) => (tabela && koncowki ? { tabela, koncowki } : null))
    .catch(() => null)
    .then((o) => {
      // nieudane wczytanie da się ponowić przy następnym otwarciu edytora
      if (!o) odmianaPlikow = null;
      return o;
    });
  return odmianaPlikow;
}

/** wpis do kroniki zarządu z godziną gry (w obu językach) i podpowiedź na ekranie */
function doKroniki(teksty: readonly Tx[]) {
  if (!sim || !gov || !teksty.length) return;
  for (const txt of teksty) gov.log.push({ day: dayOf(sim.st.tick), clock: clockOf(sim.st.tick), txt, big: false });
  say(teksty.map((t) => tr(t)).join(' '), 7000);
}

/** Zmiany imion (z pamięci przeglądarki albo podane) na stanie gry. Wpisy bez osoby po aktualizacji tabel: po jednym
    komunikacie w kronice („Halina wyprowadziła się.”) i usunięcie z pamięci. `enter` woła to na końcu startu gry
    (nowej i wznowionej), gdy `sim`, `gov` i `loaded` już są. */
function zastosujImiona(zmiany?: Record<string, ZmianaImienia>): void {
  zastosujImionaStanu(zmiany);
  liczAngielskich();
}

/** angielskie teksty osób z generatora po `Person.ref` (tylko tych, których polskie teksty są z generatora), liczone
    przy starcie gry i po każdej zmianie imienia; bez danych mieszkańców null i karta pokazuje teksty ze stanu */
let angielscy: Map<string, LokatorEn> | null = null;
function liczAngielskich(): void {
  angielscy = null;
  if (!sim || !mieszkancy) return;
  const imiona = new Map(sim.st.people.flatMap((p) => (p.ref ? [[p.ref, p.first] as const] : [])));
  try {
    const wszyscy = lokatorzyEn(mieszkancy.l, mieszkancy.dane, imiona);
    const osoby = new Map(mieszkancy.l.siedziba.osoby.map((o) => [o.id, o]));
    angielscy = new Map(
      sim.st.people.flatMap((p) => {
        const en = p.ref ? wszyscy.get(p.ref) : undefined;
        return p.ref && en && zTejOsobyGeneratora(osoby.get(p.ref), p) ? [[p.ref, en] as const] : [];
      }),
    );
  } catch (e) {
    console.warn('mieszkańcy z adresu po angielsku', e);
  }
}

function zastosujImionaStanu(zmiany?: Record<string, ZmianaImienia>): void {
  const adres = adresImion();
  // gra z sąsiadami: zapisane imiona nie trafiają do stanu, bo zapis gry idzie na serwer (K5-R20)
  if (!sim || !adres || !imionaWGrze(siec.stan)) return;
  const z = zmiany ?? wczytajZmiany(adres);
  if (!mieszkancy)
    for (const p of sim.st.people) {
      if (!p.ref) continue;
      const gen = imionaGen.get(p.ref);
      if (!gen) imionaGen.set(p.ref, { first: p.first, name: p.name });
      else if (!Object.hasOwn(z, p.ref)) Object.assign(p, gen);
    }
  const { sieroty } = zastosujZmiany(sim.st, mieszkancy?.l ?? null, mieszkancy?.dane ?? null, z);
  doKroniki(sieroty.map((ref) => wyprowadzkaTx(z[ref])));
  for (const ref of sieroty) zapiszZmiane(adres, ref, null);
}

/** zapisana zmiana imienia tej osoby (wpis pod jej `ref`, który jej dotyczy) */
function zapisanaZmiana(p: Person): ZmianaImienia | undefined {
  const adres = adresImion();
  if (!adres || !p.ref) return undefined;
  const z = wczytajZmiany(adres);
  return Object.hasOwn(z, p.ref) && dotyczy(z[p.ref], p) ? z[p.ref] : undefined;
}

async function otworzImie(person: number, pawn: number, lokator: boolean) {
  const p = sim?.st.people[person];
  if (!p?.ref || !imionaWGrze(siec.stan)) return;
  const odm = await odmianaEdytora();
  if (!odm)
    return say(
      L('Nie udało się wczytać odmiany imion. Spróbujcie jeszcze raz.', 'Couldn’t load the name forms. Try again.'),
      4000,
    );
  // w czasie wczytywania gra mogła się zmienić
  if (sim?.st.people[person] !== p || !p.ref) return;
  const zapisana = zapisanaZmiana(p);
  imieEdit = { person, pawn, lokator, odm, html: edytorImienia({ ref: p.ref, first: p.first, f: p.f }, odm, zapisana) };
  hud(performance.now());
  const pole = $('card').querySelector<HTMLInputElement>('.imie-ed input[name="mian"]');
  pole?.focus();
  pole?.select();
}

function zamknijImie() {
  imieEdit = null;
  hud(performance.now());
}

/** wpisane w edytorze imienia (z poprawionymi ręcznie formami), przeniesione przez zmianę języka: edytor rysuje
    się od nowa w nowym języku */
let wpisaneImie: Map<string, { v: string; wlasne?: string; niepewne: boolean }> | null = null;
function imieAgain() {
  const p = imieEdit && sim?.st.people[imieEdit.person];
  if (!imieEdit || !p?.ref) return;
  wpisaneImie = new Map(
    [...$('card').querySelectorAll<HTMLInputElement>('.imie-ed input[name]')].map((x) => [
      x.name,
      { v: x.value, wlasne: x.dataset.wlasne, niepewne: x.classList.contains('niepewne') },
    ]),
  );
  imieEdit.html = edytorImienia({ ref: p.ref, first: p.first, f: p.f }, imieEdit.odm, zapisanaZmiana(p));
}
function wpiszImie() {
  if (!wpisaneImie) return;
  for (const x of $('card').querySelectorAll<HTMLInputElement>('.imie-ed input[name]')) {
    const was = wpisaneImie.get(x.name);
    if (!was) continue;
    x.value = was.v;
    if (was.wlasne) x.dataset.wlasne = was.wlasne;
    x.classList.toggle('niepewne', was.niepewne);
  }
  wpisaneImie = null;
}

function przywrocImie() {
  const p = imieEdit && sim?.st.people[imieEdit.person];
  const adres = adresImion();
  if (!p?.ref || !adres || !imionaWGrze(siec.stan)) return;
  const zmiany = wczytajZmiany(adres);
  delete zmiany[p.ref];
  zapiszZmiane(adres, p.ref, null);
  zastosujImiona(zmiany);
  zamknijImie();
}

const formImienia = (e: Event): HTMLFormElement | null => {
  const f = (e.target as HTMLElement).closest?.('form.imie-ed');
  return f instanceof HTMLFormElement ? f : null;
};

$('card').addEventListener('submit', (e) => {
  const form = formImienia(e);
  if (!form) return;
  e.preventDefault();
  const p = imieEdit && sim?.st.people[imieEdit.person];
  const adres = adresImion();
  if (!p?.ref || !adres || !imionaWGrze(siec.stan)) return;
  const pola = Object.fromEntries(
    PRZYPADKI.map((c) => [c, form.querySelector<HTMLInputElement>(`input[name="${c}"]`)?.value ?? '']),
  );
  // imię z generatora idzie do wpisu, żeby po aktualizacji tabel nie trafił na inną osobę pod tym samym ref
  const gen = imieZGeneratora(p, mieszkancy?.l ?? null, zapisanaZmiana(p), imionaGen.get(p.ref)?.first);
  const w = zmianaZPol(pola, p.f, gen);
  if ('blad' in w) {
    const blad = form.querySelector<HTMLElement>('.imie-blad');
    if (blad) {
      blad.textContent = w.blad;
      blad.hidden = false;
    }
    for (const i of form.querySelectorAll('input')) {
      if (i.name === w.pole) i.setAttribute('aria-invalid', 'true');
      else i.removeAttribute('aria-invalid');
    }
    form.querySelector<HTMLInputElement>(`input[name="${w.pole}"]`)?.focus();
    return;
  }
  zapiszZmiane(adres, p.ref, w.zmiana);
  // bez dostępu do pamięci (tryb prywatny) imię i tak zmienia się w tej grze
  zastosujImiona({ ...wczytajZmiany(adres), [p.ref]: w.zmiana });
  zamknijImie();
});

// pisanie imienia podpowiada sześć form (poza tymi, które gracz już poprawił); poprawiona forma traci zaznaczenie
$('card').addEventListener('input', (e) => {
  const form = formImienia(e);
  const t = e.target as HTMLInputElement;
  const p = imieEdit && sim?.st.people[imieEdit.person];
  if (!form || !p || !imieEdit || t.tagName !== 'INPUT') return;
  t.removeAttribute('aria-invalid');
  const blad = form.querySelector<HTMLElement>('.imie-blad');
  if (blad) blad.hidden = true;
  if (t.name !== 'mian') {
    t.dataset.wlasne = '1';
    t.classList.remove('niepewne');
  } else {
    // imię, które nie przejdzie sprawdzenia (puste, cyfry, znaki HTML), nie dostaje podpowiedzi form
    const dobre = poprawneImie(t.value);
    const { formy, pewne } = podpowiedz(t.value, p.f, imieEdit.odm);
    for (const c of PRZYPADKI) {
      const i = form.querySelector<HTMLInputElement>(`input[name="${c}"]`);
      if (c === 'mian' || !i || i.dataset.wlasne) continue;
      i.value = dobre ? formy[c] : '';
      i.classList.toggle('niepewne', dobre && !pewne);
    }
  }
  const uwaga = form.querySelector<HTMLElement>('.imie-uwaga');
  if (uwaga) uwaga.hidden = !form.querySelector('input.niepewne');
});

// Escape w polu edytora zamyka go bez zapisu (klawisze gry nie działają na polach, więc osobno)
$('card').addEventListener('keydown', (e) => {
  if (!imieEdit || e.key !== 'Escape' || !formImienia(e)) return;
  e.preventDefault();
  e.stopPropagation();
  zamknijImie();
});

/* ---------- polecenia ---------- */
const feedback = (w: Words): Record<MenuItem['cmd']['t'], [string, string]> => ({
  move: ['Idzie.', 'Idą.'],
  select: ['', ''],
  chop: ['Idzie ściąć drzewo.', 'Idą ściąć drzewo.'],
  haul: ['Zaniesie drewno do składu.', 'Zaniosą drewno do składu.'],
  refuel: ['Dołoży do kozy.', 'Dołożą do kozy.'],
  burn: ['Rozbierze mebel na opał.', 'Rozbiorą mebel na opał.'],
  cook: ['Ugotuje coś z zapasów.', 'Ugotują coś z zapasów.'],
  gate: [`Idzie do ${w.brama.d}.`, `Idą do ${w.brama.d}.`],
  guard: ['Stanie na warcie.', 'Staną na warcie.'],
  patch: ['Załata dziurę w siatce.', 'Załatają dziurę w siatce.'],
  campfire: ['Rozpali ognisko.', 'Rozpalą ognisko.'],
  // polecenia zarządu i symulacji, nie z menu
  away: ['', ''],
  back: ['', ''],
  laws: ['', ''],
  raid: ['', ''],
  mend: ['', ''],
  arm: ['', ''],
  attack: ['Atakuje.', 'Atakują.'],
  finish: ['Dobije zwłoki.', 'Dobiją zwłoki.'],
  amputate: ['Amputuje.', 'Amputują.'],
  craft: ['Zrobi dzidę.', 'Zrobią dzidę.'],
  brace: ['Wzmocni siatkę.', 'Wzmocnią siatkę.'],
  alarm: ['Do broni!', 'Do broni!'],
  build: ['Weźmie się do budowy.', 'Jedna osoba weźmie się do budowy.'],
  unbuild: ['', ''],
  search: ['Przeszuka pomieszczenie.', 'Jedna osoba przeszuka pomieszczenie.'],
  dismantle: ['Rozbierze to na materiał.', 'Jedna osoba rozbierze to na materiał.'],
  repair: ['Przyniesie materiał i naprawi.', 'Jedna osoba przyniesie materiał i naprawi.'],
  claim: [`Zajmie mieszkanie dla ${w.zarzad.d}.`, `Jedna osoba zajmie mieszkanie dla ${w.zarzad.d}.`],
  wreck: [NAPISY.poWrak.pl, NAPISY.poWrakWielu.pl],
  carry: [NAPISY.poZaniesc.pl, NAPISY.poZaniescWielu.pl],
  saw: [NAPISY.poWarsztat.pl, NAPISY.poWarsztatWielu.pl],
  // M2 fala 2: sąsiednie budynki
  open: [PO_POLECENIU.open[0].pl, PO_POLECENIU.open[1].pl],
  knock: [PO_POLECENIU.knock[0].pl, PO_POLECENIU.knock[1].pl],
  force: [PO_POLECENIU.force[0].pl, PO_POLECENIU.force[1].pl],
  board: [PO_POLECENIU.board[0].pl, PO_POLECENIU.board[1].pl],
  unboard: [PO_POLECENIU.unboard[0].pl, PO_POLECENIU.unboard[1].pl],
  loot: [PO_POLECENIU.loot[0].pl, PO_POLECENIU.loot[1].pl],
  upstairs: [PO_POLECENIU.upstairs[0].pl, PO_POLECENIU.upstairs[1].pl],
  meet: ['', ''],
  zajete: ['', ''],
  enclose: [PO_POLECENIU.enclose[0].pl, PO_POLECENIU.enclose[1].pl],
  otocz: ['', ''],
  trade: [HANDEL.poHandel.pl, HANDEL.poHandelWielu.pl],
  talk: [OBCY.poZagadac.pl, OBCY.poZagadacWielu.pl],
  zapros: [OBCY.poZaprosic.pl, OBCY.poZaprosicWielu.pl],
  reka: [OBCY.poRege.pl, OBCY.poRegeWielu.pl],
  mug: [OBCY.poNapasc.pl, OBCY.poNapascWielu.pl],
  shoo: [OBCY.poPrzegonic.pl, OBCY.poPrzegonicWielu.pl],
  rob: [HANDEL.poNapasc.pl, HANDEL.poNapascWielu.pl],
  obcy: ['', ''],
  prio: ['', ''],
  stale: ['', ''],
  zasiatke: ['', ''],
  prog: ['', ''],
});
/** to samo po angielsku (jedna osoba, kilka osób) */
const feedbackEn = (e: WordsEn): Record<MenuItem['cmd']['t'], [string, string]> => ({
  move: ['On the way.', 'On their way.'],
  select: ['', ''],
  chop: ['Off to chop down the tree.', 'Off to chop down the tree.'],
  haul: ['Off to carry the wood to the woodpile.', 'Off to carry the wood to the woodpile.'],
  refuel: ['Off to feed the stove.', 'Off to feed the stove.'],
  burn: ['Off to break up the furniture for firewood.', 'Off to break up the furniture for firewood.'],
  cook: ['Off to cook something from the supplies.', 'Off to cook something from the supplies.'],
  gate: [`Off to ${e.brama}.`, `Off to ${e.brama}.`],
  guard: ['Going on watch.', 'Going on watch.'],
  patch: ['Off to patch the hole in the fence.', 'Off to patch the hole in the fence.'],
  campfire: ['Off to light a campfire.', 'Off to light a campfire.'],
  away: ['', ''],
  back: ['', ''],
  laws: ['', ''],
  raid: ['', ''],
  mend: ['', ''],
  arm: ['', ''],
  attack: ['Attacking.', 'Attacking.'],
  finish: ['Going to finish off the body.', 'Going to finish off the body.'],
  amputate: ['Amputating.', 'Amputating.'],
  craft: ['Off to make a spear.', 'Off to make a spear.'],
  brace: ['Off to shore up the fence.', 'Off to shore up the fence.'],
  alarm: ['To arms!', 'To arms!'],
  build: ['Getting down to building.', 'One person gets down to building.'],
  unbuild: ['', ''],
  search: ['Off to search the room.', 'One person goes to search the room.'],
  dismantle: ['Off to take it apart for materials.', 'One person goes to take it apart for materials.'],
  repair: ['Off to fetch materials and fix it.', 'One person goes to fetch materials and fix it.'],
  claim: [`Off to claim the flat for ${e.krotko}.`, `One person goes to claim the flat for ${e.krotko}.`],
  wreck: [NAPISY.poWrak.en, NAPISY.poWrakWielu.en],
  carry: [NAPISY.poZaniesc.en, NAPISY.poZaniescWielu.en],
  saw: [NAPISY.poWarsztat.en, NAPISY.poWarsztatWielu.en],
  // M2 fala 2: sąsiednie budynki
  open: [PO_POLECENIU.open[0].en, PO_POLECENIU.open[1].en],
  knock: [PO_POLECENIU.knock[0].en, PO_POLECENIU.knock[1].en],
  force: [PO_POLECENIU.force[0].en, PO_POLECENIU.force[1].en],
  board: [PO_POLECENIU.board[0].en, PO_POLECENIU.board[1].en],
  unboard: [PO_POLECENIU.unboard[0].en, PO_POLECENIU.unboard[1].en],
  loot: [PO_POLECENIU.loot[0].en, PO_POLECENIU.loot[1].en],
  upstairs: [PO_POLECENIU.upstairs[0].en, PO_POLECENIU.upstairs[1].en],
  meet: ['', ''],
  zajete: ['', ''],
  enclose: [PO_POLECENIU.enclose[0].en, PO_POLECENIU.enclose[1].en],
  otocz: ['', ''],
  trade: [HANDEL.poHandel.en, HANDEL.poHandelWielu.en],
  talk: [OBCY.poZagadac.en, OBCY.poZagadacWielu.en],
  zapros: [OBCY.poZaprosic.en, OBCY.poZaprosicWielu.en],
  reka: [OBCY.poRege.en, OBCY.poRegeWielu.en],
  mug: [OBCY.poNapasc.en, OBCY.poNapascWielu.en],
  shoo: [OBCY.poPrzegonic.en, OBCY.poPrzegonicWielu.en],
  rob: [HANDEL.poNapasc.en, HANDEL.poNapascWielu.en],
  obcy: ['', ''],
  prio: ['', ''],
  stale: ['', ''],
  zasiatke: ['', ''],
  prog: ['', ''],
});

function run(m: MenuItem) {
  if (!sim) return;
  // „Zajmij klatkę” z gry z sąsiadami idzie do serwera, nie do symulacji
  if (siec.obsluz(m)) return;
  sim.push(m.cmd);
  const k = m.cmd.ids.length > 1 ? 1 : 0;
  // wspólny płot z jednego materiału mówi, po co idzie (deska i złom jak w feedback)
  const jeden = m.cmd.t === 'enclose' && (m.cmd.wariant === 'deski' || m.cmd.wariant === 'zlom') ? m.cmd.wariant : null;
  const f = jeden ? tr(PO_PLOCIE[jeden][k]) : L(feedback(words)[m.cmd.t][k], feedbackEn(wordsE)[m.cmd.t][k]);
  // w trybie zombie wyważanie ściąga szwendaczy z okolicy
  const loud = m.cmd.t === 'force' && modeOf(sim.st) === 'zombie' ? tr(HALAS_ZOMBIE) : '';
  if (f) say(`${f}${loud}`, loud ? 4000 : 1800);
}

/** polecenie z potwierdzeniem: palenie mebli ma własne okno, reszta (rozbiórka, zajęcie) ogólne */
function askConfirm(m: MenuItem) {
  if (m.cmd.t === 'burn') {
    askBurn(m);
    return;
  }
  sheetAgain = () => askConfirm(m);
  pauseGame();
  modal.show(
    confirmSheet(m.label),
    (act) => {
      if (act !== 'confirm-yes' && act !== 'confirm-no') return;
      if (act === 'confirm-yes') run(m);
      modal.close();
      nextPrompt();
    },
    nextPrompt,
  );
}

function askBurn(m: MenuItem) {
  const c = m.cmd;
  if (!sim || c.t !== 'burn') return;
  const thing = sim.st.things.find((t) => t.id === c.thing);
  if (!thing) return;
  const owner = sim.st.pawns.find((p) => p.id === thing.owner);
  // imię tylko dla mebla kogoś z zarządu (tekst mówi o „reszcie zarządu”); mieszkaniec z osobą nie jest z zarządu
  const name = owner?.kind === 'core' ? (sim.st.people[owner.person]?.name ?? null) : null;
  const softer = !!gov && lawEffects(gov).burnMood < 1;
  sheetAgain = () => askBurn(m);
  pauseGame();
  modal.show(
    burnSheet(thing.kind, name, softer, words, wordsE),
    (act) => {
      if (act !== 'burn-yes' && act !== 'burn-no') return;
      if (act === 'burn-yes') run(m);
      modal.close();
      nextPrompt();
    },
    nextPrompt,
  );
}

/** polecenie w miejscu (sx, sy): menu (prawy przycisk, przytrzymanie) albo od razu domyślne (stuknięcie) */
function orderAt(sx: number, sy: number, menu: boolean) {
  // w trybie stawiania stuknięcie i przytrzymanie należą do planu budowy
  if (!sim || placing) return;
  // piętro od pierwszego: pod stropem albo dachem parter jest schowany, więc polecenia tam nie idą
  if (zablokowanyKlik(sx, sy)) return;
  const ids = [...selected];
  const tile = view.tileAt(sx, sy);
  const items = commandsAt(sim.st, sim.w, ids, tile);
  // gra z sąsiadami: „Zajmij klatkę” tylko w menu (z potwierdzeniem), nigdy od stuknięcia
  const zSieci = menu ? siec.menu(sim, tile) : [];
  if (!items.length && !zSieci.length) {
    say(
      L(
        `Najpierw ${touchUI ? 'stuknijcie' : 'zaznaczcie'} kogoś z ${words.zarzad.dk}.`,
        `${touchUI ? 'Tap' : 'Select'} someone from ${wordsE.krotko} first.`,
      ),
      2500,
    );
    return;
  }
  // plan budowy albo gotowa budowla pod kursorem: jej polecenia przed „Idź tu”, polecenia symulacji pierwsze
  const snap = snapshot(sim.st, sim.w);
  const extra = buildItems(sim.st, sim.w, ids, tile, snap.stock);
  const go = items.findIndex((x) => x.cmd.t === 'move');
  items.splice(go < 0 ? items.length : go, 0, ...extra);
  items.push(...zSieci);
  if (!menu) {
    const q = items.find((x) => x.quick);
    if (q) run(q);
    return;
  }
  // samo „Idź tu”: bez menu
  if (items.length === 1 && !zSieci.length) {
    run(items[0]);
    return;
  }
  const who = sim.st.pawns
    .filter((p) => selected.has(p.id) && p.kind === 'core')
    .map((p) => sim!.st.people[p.person]?.first ?? '');
  const head =
    who.length > 2
      ? L(`${words.Zarzad} (${who.length})`, `${wordsE.Zarzad} (${who.length})`)
      : who.join(L(' i ', ' and ')) || L('Klatka', 'Stairwell');
  // w mieszkaniu siedziby nagłówek mówi, które to mieszkanie i w jakim stanie (w domu sam stan: dom komitetu)
  const apt = aptAt(sim.w, tile);
  const v = apt >= 0 ? aptView(sim.st, sim.w, apt, snap.apts) : null;
  const state = v ? aptState(v, words, wordsE).toLowerCase() : '';
  const where = v ? ` · ${L(words.lokal.menu(apt + 1, state), wordsE.lokal.menu(apt + 1, state))}` : '';
  ctx.show(items, sx, sy, `${head}${where}`, (x) => (x.confirm ? askConfirm(x) : run(x)));
}

/** zaznaczenie ludzi z zarządu prowadzi pierwszy krok samouczka */
function selectedChanged() {
  // zaznaczenie kogoś zamyka kartę mieszkania i kartę mieszkańca
  aptFocus = -1;
  budFocus = -1;
  residentFocus = -1;
  if (sim?.st.tut.step !== 0 || !selected.size) return;
  sim.push({ t: 'select', ids: [...selected] });
}

/* ---------- budowa: menu i tryb stawiania ---------- */
/** plan pod kursorem: rodzaj, lewy górny kafelek, obrót, czy wolno postawić i dozwolone miejsca */
let placing: {
  kind: BuildKind;
  rot: Rot;
  x: number;
  y: number;
  ok: boolean;
  why?: string;
  allowed: number[];
  /** kafelki, na których ta budowla może stanąć (suma podstaw z dozwolonych zakotwiczeń) */
  okTiles: number[];
} | null = null;
/** mieszkanie na karcie (klik w mieszkanie siedziby, gdy nikt nie jest zaznaczony) albo −1 */
let aptFocus = -1;
/** cudzy budynek na karcie budynku (M2 fala 2: klik w sąsiedni budynek, gdy nikt nie jest zaznaczony) albo −1 */
let budFocus = -1;

/** karta pod kliknięciem bez zaznaczenia: mieszkanie siedziby albo sąsiedni budynek */
function focusTile(sx: number, sy: number) {
  if (!sim || zablokowanyKlik(sx, sy)) return;
  const tile = view.tileAt(sx, sy);
  aptFocus = aptAt(sim.w, tile);
  const bid = tile >= 0 ? sim.w.bid[tile] : -1;
  budFocus = aptFocus < 0 && bid >= 0 && bid !== sim.w.hq ? bid : -1;
}
/** mieszkaniec z osobą na karcie do odczytu (id pionka po kliknięciu w niego; na dotyku tylko bez zaznaczonych, bo
    z zaznaczonymi stuknięcie to polecenie) albo −1 */
let residentFocus = -1;

/** podgląd stawiania w rysowaniu (view.setPlacement, robi sesja rysowania); bez niego duch z DOM */
/** kształt podglądu od rysowania: kafelki jako indeksy y * size + x; bad zostaje puste, bo duch i tak jest czerwony */
type PlacementView = {
  kind: BuildKind;
  x: number;
  y: number;
  rot: Rot;
  ok: boolean;
  tiles?: { ok?: number[]; bad?: number[] };
} | null;
let placementKey = '';
function setPlacementView(p: PlacementView): boolean {
  const fn = (view as unknown as { setPlacement?: (p: PlacementView) => void }).setPlacement;
  if (typeof fn !== 'function') return false;
  const key = p ? `${p.kind},${p.x},${p.y},${p.rot},${p.ok},${p.tiles?.ok?.length ?? 0}` : '';
  if (key !== placementKey) {
    placementKey = key;
    fn.call(view, p);
  }
  return true;
}

/** zapas z ostatniego odczytu symulacji (hud co klatkę), do menu i skrótu stanu panelu */
let lastStock: SimStock | null = null;
let menuCache: { key: string; menu: BuildCategory[] } | null = null;
/** czy jest miejsce na budowlę (allowedAnchors), zapamiętane pod skrótem miejsc: zmiana samego zapasu go nie unieważnia */
let roomMemo: { key: string; room: Map<BuildKind, boolean> } | null = null;

/** skrót tego, od czego zależy treść panelu budowy: język, zapas materiałów z kosztów (bez zarezerwowanego przez
    plany) i miejsca (plany, rzeczy, mieszkania, badania). Gdy się nie zmienił, panel nie rusza DOM. */
function buildStateKey(): string {
  if (!sim || !lastStock) return '';
  return [L('pl', 'en'), stockKey(availableOf(sim.st, lastStock)), placeKey(sim.st), BUILD_MENU.showLocked].join('#');
}

/** menu budowy z aktualnego stanu; miejsca liczone tylko przy zmianie skrótu miejsc, nie przy każdym materiale */
function buildMenuNow(): BuildCategory[] {
  const s = sim;
  if (!s || !lastStock) return [];
  const key = buildStateKey();
  if (menuCache?.key === key) return menuCache.menu;
  const pk = placeKey(s.st);
  if (roomMemo?.key !== pk) roomMemo = { key: pk, room: new Map() };
  const memo = roomMemo.room;
  const room = (k: BuildKind) => {
    let r = memo.get(k);
    if (r === undefined) {
      r = allowedAnchors(s.st, s.w, k, 0).length > 0 || allowedAnchors(s.st, s.w, k, 1).length > 0;
      memo.set(k, r);
    }
    return r;
  };
  const menu = buildMenu(availableOf(s.st, lastStock), room, words, wordsE, { st: s.st });
  menuCache = { key, menu };
  return menu;
}

/** panel budowy po prawej (przycisk „Budowa” i klawisz B): nie-modalny, mapa pod nim klikalna */
const buildPanel = new BuildPanel($('buildPanel'), $('app'), {
  menu: buildMenuNow,
  stateKey: buildStateKey,
  thumb: (kind) => thumbUrl(kind, view.grafika),
  words: () => words,
  en: () => wordsE,
  touch: touchUI,
  onPlace: (kind) => {
    startPlacing(kind);
    nextPrompt();
    // na dotyku plan jedzie za palcem, więc szuflada schodzi z drogi; na komputerze panel zostaje na kolejne plany
    if (touchUI) buildPanel.hide();
  },
  onClose: () => nextPrompt(),
});

function openBuild() {
  if (!sim || modal.open) return;
  if (!buildPanel.open) {
    ctx.close();
    pracaPanel.hide();
  }
  buildPanel.toggle();
}

/** panel Pracy po prawej (przycisk „Praca” i klawisz P): nie-modalny jak panel budowy, razem z nim się nie otwiera.
    Widok to odczyt symulacji z poleceniami, które jeszcze czekają w kolejności (pauza nie robi kroków), a zmiany
    wychodzą poleceniami `prio`, `prog` i `zasiatke` do symulacji. */
const pracaPanel = new PracaPanel($('pracaPanel'), $('app'), {
  widok: (kol) => {
    const snap = snapNow();
    if (!snap || !sim) return null;
    return nalozPolecenia(widokPracy(snap, { kol, zlecen: kol ? sim.ileZlecen(kol) : 0, touch: touchUI }), sim.st.cmds);
  },
  en: () => jezyk() === 'en',
  touch: touchUI,
  onPrio: (osoba, rodzaj, prio) => sim?.push({ t: 'prio', ids: [], osoba, rodzaj, prio }),
  onProg: (co, n) => sim?.push({ t: 'prog', ids: [], co, n }),
  onZaSiatke: (osoba, on) => {
    sim?.push({ t: 'zasiatke', ids: [], osoba, on });
    if (on && snapNow()?.mode === 'zombie') say(ZA_SIATKA_ZOMBIE(), 5000);
  },
  onClose: () => nextPrompt(),
});

function openPraca() {
  if (!sim || modal.open) return;
  if (!pracaPanel.open) {
    ctx.close();
    buildPanel.hide();
  }
  pracaPanel.toggle();
}

/** ostrzeżenie przy włączeniu „za siatkę” w trybie zombie (karta osoby ma krótszą wersję tego samego) */
const ZA_SIATKA_ZOMBIE = (): string =>
  L(
    'Za siatką są szwendacze: kto tam wyjdzie sam, ryzykuje ugryzienie.',
    'There are shamblers outside the fence: anyone who goes out on their own risks a bite.',
  );

/** okno mapy miasta: przycisk „Mapa miasta” i klawisz M. Gra stoi, póki okno jest otwarte; zamknięcie (przycisk, Esc,
    klik obok) wraca do gry albo do decyzji zarządu, która czeka */
function openMiasto() {
  const mapa = mapaMiasta;
  if (!sim || !mapa || modal.open) return;
  sheetAgain = () => {
    mapa.odepnij();
    modal.close();
    openMiasto();
  };
  cancelPlacing(false);
  ctx.close();
  pauseGame();
  modal.show(
    mapaMiastaSheet(touchUI),
    (act, arg) => {
      if (act === 'miasto-zamknij') {
        mapa.odepnij();
        modal.close();
        nextPrompt();
      } else mapa.obsluz(act, arg);
    },
    () => {
      mapa.odepnij();
      nextPrompt();
    },
  );
  const el = modal.find('[data-miasto]');
  if (el)
    mapa.podepnij(el, {
      touch: touchUI,
      st: () => gov,
      wejscie: () => (gov && sim ? input() : null),
      onWyslij: (m) => openWyprawa(m),
    });
}

/** plan wyprawy z karty miejsca na mapie miasta (src/ui/wyprawa.ts): wybór osób z zarządu (zaznaczeni w grze są wybrani
    od razu), podsumowanie i potwierdzenie. „Wyślij” woła `wyslijWyprawe`: udane idzie przez `applyFx` (osoby wychodzą
    bramą, ostatni wpis kroniki jest podpowiedzią), zapis i powrót do gry albo do decyzji, która czeka; odmowa zostaje
    w oknie. „Wróć do mapy” otwiera mapę od nowa z tym samym widokiem i kartą; Esc zamyka jak każde okno.
    Wysłanie z własnej woli nie jest odpowiedzią na okno zarządu, więc bez `decision()`. `wybrani`: wybór do zachowania
    po zmianie języka. */
function openWyprawa(m: Miejsce, wybrani?: Set<string>) {
  const mapa = mapaMiasta;
  const g = gov;
  if (!sim || !g || g.over || !mapa) return;
  const cel = celZMiejsca(m);
  const wyb = wybrani ?? domyslniWybrani(cel, input(), g, selected);
  sheetAgain = () => openWyprawa(m, wyb);
  // okno mapy ustępuje planowi: widok i karta zostają w mapie na powrót
  mapa.odepnij();
  modal.show(
    planWyprawySheet(cel, input(), g, wyb),
    (act, arg) => {
      if (act === 'wp-osoba') {
        if (!wyb.delete(arg)) wyb.add(arg);
        odswiezPlan(modal, cel, input(), g, wyb);
      } else if (act === 'wp-wroc') {
        modal.close();
        openMiasto();
      } else if (act === 'wyslij') {
        const i = input();
        const w = wyslijWyprawe(g, i, cel, kogoWyslac(cel, i, g, wyb));
        if (!w.ok) return odswiezPlan(modal, cel, i, g, wyb, w.why);
        applyFx(w.fx);
        decided();
      }
    },
    () => nextPrompt(),
  );
}

function startPlacing(kind: BuildKind) {
  if (!sim) return;
  // budowle są dziś tylko na parterze i podwórku
  wybierzPietro(0);
  const allowed = allowedAnchors(sim.st, sim.w, kind, 0);
  placing = { kind, rot: 0, x: 0, y: 0, ok: false, allowed, okTiles: okTilesOf(allowed, kind, 0, sim.w.size) };
  // plan na środku ekranu, dopóki kursor albo palec nie pokaże miejsca
  aimAt(view.width / 2, view.height / 2);
  $('placeBar').hidden = false;
}

/** plan tak, żeby punkt ekranu (sx, sy) wypadł w środku budowli */
function aimAt(sx: number, sy: number) {
  if (!sim || !placing) return;
  const t = view.tileAt(sx, sy);
  const { w: fw, h: fh } = footprint(placing.kind, placing.rot);
  placing.x = (t % sim.w.size) - Math.floor((fw - 1) / 2);
  placing.y = Math.floor(t / sim.w.size) - Math.floor((fh - 1) / 2);
  const c = canPlace(sim.st, sim.w, placing.kind, placing.x, placing.y, placing.rot);
  placing.ok = c.ok;
  placing.why = c.why;
  placeInfo();
}

function rotatePlacing() {
  if (!sim || !placing) return;
  const { w: fw, h: fh } = footprint(placing.kind, placing.rot);
  // obrót wokół środka planu
  const cx = placing.x + Math.floor((fw - 1) / 2);
  const cy = placing.y + Math.floor((fh - 1) / 2);
  placing.rot = ((placing.rot + 1) % 4) as Rot;
  placing.allowed = allowedAnchors(sim.st, sim.w, placing.kind, placing.rot);
  placing.okTiles = okTilesOf(placing.allowed, placing.kind, placing.rot, sim.w.size);
  const [sx, sy] = screenOf(cx + 0.5, cy + 0.5);
  aimAt(sx, sy);
}

function cancelPlacing(tell = true) {
  if (!placing) return;
  placing = null;
  $('placeBar').hidden = true;
  $('ghost').hidden = true;
  setPlacementView(null);
  if (tell) say(L('Budowa anulowana.', 'Building cancelled.'), 1500);
}

/** klik albo stuknięcie w trybie stawiania: lewy klik i stuknięcie stawiają, prawy klik anuluje;
    z Shiftem plan zostaje do następnej budowli. Zwraca true, gdy klik należał do planu. */
function placeClick(sx: number, sy: number, button: number, type: string, shift: boolean): boolean {
  if (!sim || !placing) return false;
  if (type === 'mouse' && button === 2) {
    cancelPlacing();
    return true;
  }
  if (type === 'mouse' && button !== 0) return false;
  aimAt(sx, sy);
  if (!placing.ok) {
    say(placing.why ?? L('Tu nie da się postawić.', 'You can’t build here.'), 2500);
    return true;
  }
  const { kind, x, y, rot } = placing;
  // kto buduje: zaznaczeni z zarządu, a bez zaznaczenia zarząd wybiera sam
  const ids = sim.st.pawns.filter((p) => selected.has(p.id) && p.kind === 'core').map((p) => p.id);
  sim.push({ t: 'build', ids, kind, x, y, rot });
  say(
    L(
      `Plan: ${buildName(kind)}. ${words.Zarzad} przyniesie materiały i zbuduje.`,
      `Plan: ${buildName(kind)}. ${wordsE.Zarzad} will bring the materials and build it.`,
    ),
    3000,
  );
  if (shift && type === 'mouse') {
    placing.allowed = allowedAnchors(sim.st, sim.w, kind, rot);
    placing.okTiles = okTilesOf(placing.allowed, kind, rot, sim.w.size);
    aimAt(sx, sy);
  } else cancelPlacing(false);
  return true;
}

/** napis na pasku trybu stawiania: co, czy wolno i jak sterować */
function placeInfo() {
  if (!placing) return;
  const name = buildName(placing.kind);
  const state = placing.ok
    ? L('tu można postawić', 'you can build here')
    : (placing.why ?? L('tu nie da się postawić', 'you can’t build here')).replace(/\.$/, '');
  const how = touchUI
    ? L('Stuknięcie stawia plan.', 'Tap to place the plan.')
    : L(
        'Lewy klik stawia, R obraca, prawy klik albo Esc anuluje.',
        'Left-click places, R rotates, right-click or Esc cancels.',
      );
  const text = `${name}: ${state.charAt(0).toLowerCase()}${state.slice(1)}. ${how}`;
  const el = $('placeText');
  if (el.textContent !== text) el.textContent = text;
  $('placeBar').classList.toggle('bad', !placing.ok);
}

/** duch planu co klatkę (kamera się rusza); rysowanie z setPlacement robi to samo w mapie */
function placeGhost() {
  const g = $('ghost');
  if (!placing || modal.open) {
    g.hidden = true;
    if (!placing) setPlacementView(null);
    return;
  }
  // na dotyku nie ma kursora: plan stoi na środku ekranu jak celownik, a mapa przesuwa się pod nim
  if (touchUI) aimAt(view.width / 2, view.height / 2);
  const p = placing;
  if (setPlacementView({ kind: p.kind, x: p.x, y: p.y, rot: p.rot, ok: p.ok, tiles: { ok: p.okTiles } })) {
    g.hidden = true;
    return;
  }
  const { w: fw, h: fh } = footprint(p.kind, p.rot);
  const [x0, y0] = screenOf(p.x, p.y);
  const [x1, y1] = screenOf(p.x + fw, p.y + fh);
  g.hidden = false;
  g.classList.toggle('bad', !p.ok);
  g.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
  g.style.width = `${Math.round(x1 - x0)}px`;
  g.style.height = `${Math.round(y1 - y0)}px`;
  const t = $('ghostText');
  const name = BUILDS[p.kind].name;
  if (t.textContent !== name) t.textContent = name;
}

$('btnBuild').addEventListener('click', () => openBuild());
$('btnPraca').addEventListener('click', () => openPraca());
$('btnMiasto').addEventListener('click', () => openMiasto());
// „Pokaż” przy przybyszach: kamera od razu jedzie na środek grupy, bez zmiany przybliżenia
$('arriveShow').addEventListener('click', () => {
  const coming = sim ? arriving(sim.st) : [];
  if (!coming.length) return;
  const x = coming.reduce((a, p) => a + p.x, 0) / coming.length;
  const y = coming.reduce((a, p) => a + p.y, 0) / coming.length;
  flyTo(x * TILE, y * TILE, view.cam.zoom, 900, 0);
});
$('placeBar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-place]');
  if (!b) return;
  if (b.dataset.place === 'rot') rotatePlacing();
  else cancelPlacing();
});

/* ---------- mysz i dotyk ---------- */
const stage = $('stage');
const pointers = new Map<number, { x: number; y: number }>();
/** palce i rysik na mapie: przy nich szczypanie robi pointermove, a gesty Safari tylko blokują przybliżanie strony */
const fingers = new Set<number>();
let drag: {
  id: number;
  x: number;
  y: number;
  cx: number;
  cy: number;
  button: number;
  type: string;
  /** Shift przy wciśnięciu: przeciąganie lewym przyciskiem rysuje ramkę zamiast przesuwać mapę */
  shift: boolean;
  moved: boolean;
} | null = null;
let pinch: { d: number; z: number; mx: number; my: number } | null = null;
/** przytrzymany palec: po pół sekundy menu poleceń zamiast stuknięcia */
let press: { id: number; timer: number; fired: boolean } | null = null;
/** wskaźnik, który tylko zamknął menu (bez polecenia i bez odznaczania) */
let swallow = -1;
const box = $('box');

const endPress = () => {
  if (press) clearTimeout(press.timer);
};
stage.addEventListener('contextmenu', (e) => e.preventDefault());
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (e.pointerType !== 'mouse') fingers.add(e.pointerId);
  fly = null;
  // Ctrl+klik to prawy przycisk (Mac: gładzik i mysz z jednym przyciskiem; macOS daje wtedy button 0 z ctrlKey)
  const button = pointerButton(e);
  if (ctx.open) {
    ctx.close();
    // lewy klik albo stuknięcie obok tylko zamyka menu; prawy od razu otwiera nowe w nowym miejscu
    if (button !== 2) {
      swallow = e.pointerId;
      return;
    }
  }
  endPress();
  press = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.cam.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    drag = null;
    return;
  }
  drag = {
    id: e.pointerId,
    x: e.offsetX,
    y: e.offsetY,
    cx: view.cam.x,
    cy: view.cam.y,
    button,
    type: e.pointerType,
    shift: e.shiftKey,
    moved: false,
  };
  if (e.pointerType !== 'mouse') {
    const x = e.offsetX;
    const y = e.offsetY;
    const p = { id: e.pointerId, fired: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (press !== p || !drag || drag.moved || pointers.size !== 1) return;
      p.fired = true;
      orderAt(x, y, true);
    }, 520);
    press = p;
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const target = (pinch.z * d) / pinch.d;
    view.zoomAt(mx, my, target / view.cam.zoom);
    // dwa palce przesuwają też mapę
    view.cam.x -= (mx - pinch.mx) / view.cam.zoom;
    view.cam.y -= (my - pinch.my) / view.cam.zoom;
    view.clampCam();
    pinch.mx = mx;
    pinch.my = my;
    return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.offsetX - drag.x;
  const dy = e.offsetY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true;
    endPress();
  }
  if (!drag.moved) return;
  // przeciąganie przesuwa mapę (jak podpowiedź), ramka tylko z Shiftem
  const boxSelect = drag.type === 'mouse' && drag.button === 0 && drag.shift;
  if (boxSelect) {
    box.hidden = false;
    Object.assign(box.style, {
      left: `${Math.min(drag.x, e.offsetX)}px`,
      top: `${Math.min(drag.y, e.offsetY)}px`,
      width: `${Math.abs(dx)}px`,
      height: `${Math.abs(dy)}px`,
    });
  } else {
    view.cam.x = drag.cx - dx / view.cam.zoom;
    view.cam.y = drag.cy - dy / view.cam.zoom;
    view.clampCam();
  }
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  fingers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  const held = press?.id === e.pointerId && press.fired;
  if (press?.id === e.pointerId) {
    endPress();
    press = null;
  }
  if (swallow === e.pointerId || held || !drag || drag.id !== e.pointerId || !sim) {
    if (swallow === e.pointerId) swallow = -1;
    drag = null;
    return;
  }
  const d = drag;
  drag = null;
  box.hidden = true;
  if (e.type === 'pointercancel') return;
  if (d.moved) {
    if (d.type === 'mouse' && d.button === 0 && d.shift) {
      // ramka z Shiftem: zaznacza ludzi z rdzenia
      const [x0, y0] = view.toWorld(Math.min(d.x, e.offsetX), Math.min(d.y, e.offsetY));
      const [x1, y1] = view.toWorld(Math.max(d.x, e.offsetX), Math.max(d.y, e.offsetY));
      if (!e.shiftKey) selected.clear();
      // piętro od pierwszego: pionki w obrysach budynków są schowane pod stropem albo dachem, więc ramka ich nie bierze
      const w = sim.w;
      let schowani = false;
      for (const p of sim.st.pawns)
        if (p.kind === 'core' && p.x * TILE >= x0 && p.x * TILE <= x1 && p.y * TILE >= y0 && p.y * TILE <= y1) {
          if (view.pietroAktywne() && w.bid[Math.floor(p.y) * w.size + Math.floor(p.x)] >= 0) schowani = true;
          else selected.add(p.id);
        }
      if (schowani) say(tr(PODPOWIEDZ_ZARZAD), 2500);
      selectedChanged();
    }
    return;
  }
  const hit = view.pick(sim.st, e.offsetX, e.offsetY);
  // mieszkaniec z osobą (zarząd miał pierwszeństwo niżej): karta do odczytu, bez zmiany zaznaczenia i bez poleceń
  const lok = view.pickResident(sim.st, e.offsetX, e.offsetY);
  if (placing && placeClick(e.offsetX, e.offsetY, d.button, d.type, e.shiftKey)) return;
  // piętro od pierwszego: klik w obrys budynku nie rozkazuje i nie otwiera kart (parter jest schowany). Widocznego
  // pionka (`pick` i `pickResident` oddają tam tylko widocznych) da się kliknąć także przy fasadzie, lewym przyciskiem
  if (zablokowanyKlik(e.offsetX, e.offsetY, !!(hit || lok), d.button === 2)) return;
  if (d.button === 2) {
    orderAt(e.offsetX, e.offsetY, true);
    return;
  }
  if (hit) {
    if (!e.shiftKey) selected.clear();
    selected.add(hit.id);
    selectedChanged();
    return;
  }
  if (d.type !== 'mouse') {
    // dotyk: stuknięcie w pusty teren przy otwartej karcie mieszkańca tylko ją zamyka, bez polecenia
    if (residentFocus >= 0 && !lok) {
      residentFocus = -1;
      return;
    }
    // z zaznaczonymi z zarządu stuknięcie to zawsze polecenie, także przy mieszkańcu (jak przed mieszkańcami z adresu)
    if (selected.size) {
      residentFocus = -1;
      orderAt(e.offsetX, e.offsetY, false);
      return;
    }
    // bez zaznaczenia: karta mieszkańca albo karta mieszkania
    if (lok) {
      residentFocus = lok.id;
      aptFocus = -1;
      budFocus = -1;
    } else focusTile(e.offsetX, e.offsetY);
    return;
  }
  if (lok) {
    residentFocus = lok.id;
    aptFocus = -1;
    budFocus = -1;
    return;
  }
  residentFocus = -1;
  if (d.button === 0) {
    selected.clear();
    focusTile(e.offsetX, e.offsetY);
  }
};
stage.addEventListener('pointerup', endPointer);
// tryb stawiania: plan idzie za kursorem myszy (dotyk stawia stuknięciem)
stage.addEventListener('pointermove', (e) => {
  if (placing && e.pointerType === 'mouse') aimAt(e.offsetX, e.offsetY);
});
stage.addEventListener('pointercancel', endPointer);
/** chwila ostatniego zdarzenia wheel z gładzika (rozpoznanie w src/ui/sterowanie.ts) */
let lastPan = -1e9;
stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    fly = null;
    ctx.close();
    const now = performance.now();
    const kind = wheelKind(e, now, lastPan);
    if (kind === 'pan') {
      // dwa palce na gładziku przesuwają mapę jak w mapach
      lastPan = now;
      const k = e.deltaMode === 1 ? 40 : 1;
      view.cam.x += (e.deltaX * k) / view.cam.zoom;
      view.cam.y += (e.deltaY * k) / view.cam.zoom;
      view.clampCam();
      return;
    }
    // szczypanie (wheel z ctrlKey w Chrome i Firefoksie) albo kółko myszy przybliżają
    view.zoomAt(e.offsetX, e.offsetY, zoomFactor(kind, e));
  },
  { passive: false },
);
// Safari na macOS: szczypanie to gesturestart, gesturechange i gestureend z polem scale (bez preventDefault
// przybliżałaby się cała strona). iPhone i iPad wysyłają te gesty razem z dotykiem, a dwa palce przybliżają już
// w pointermove, więc przy palcach na mapie gest tylko blokuje stronę.
let gesture: { z: number } | null = null;
const gestureAt = (e: Event): [number, number] => {
  const g = e as Event & { clientX?: number; clientY?: number };
  const r = stage.getBoundingClientRect();
  return g.clientX === undefined || g.clientY === undefined
    ? [view.width / 2, view.height / 2]
    : [g.clientX - r.left, g.clientY - r.top];
};
stage.addEventListener('gesturestart', (e) => {
  e.preventDefault();
  fly = null;
  ctx.close();
  gesture = { z: view.cam.zoom };
});
stage.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  if (fingers.size) return;
  const scale = (e as Event & { scale?: number }).scale;
  if (!scale) return;
  gesture ??= { z: view.cam.zoom };
  const [x, y] = gestureAt(e);
  view.zoomAt(x, y, (gesture.z * scale) / view.cam.zoom);
});
stage.addEventListener('gestureend', (e) => {
  e.preventDefault();
  gesture = null;
});
// poza mapą (pasek, okna) szczypanie w Safari też nie przybliża całej strony gry
for (const t of ['gesturestart', 'gesturechange'])
  document.addEventListener(t, (e) => {
    if (!$('app').hidden) e.preventDefault();
  });
window.addEventListener('keydown', (e) => {
  // klawisze gry tylko w grze, bez otwartego okna i nie na polach ani przyciskach (spacja ma działać na przyciskach)
  const tag = (e.target as HTMLElement).tagName;
  if (!sim || $('app').hidden || modal.open || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (ctx.open) return;
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    hold = null;
    dayPace = null;
    raidHold = null;
    renderSpeed();
  }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
    speed = Number(e.code.slice(-1));
    hold = null;
    dayPace = null;
    raidHold = null;
    renderSpeed();
  }
  if (e.code === 'KeyB') openBuild();
  if (e.code === 'KeyP') openPraca();
  if (e.code === 'KeyM') openMiasto();
  // widok pięter: PageUp o piętro wyżej, PageDown niżej
  if (pietraGry && (e.code === 'PageUp' || e.code === 'PageDown')) {
    e.preventDefault();
    wybierzPietro(nastepnePietro(pietraLista, view.pietro, e.code === 'PageUp' ? 1 : -1));
  }
  if (e.code === 'KeyR' && placing) rotatePlacing();
  if (e.code === 'Escape') {
    if (placing) cancelPlacing();
    else if (buildPanel.open) buildPanel.hide();
    else if (pracaPanel.open) pracaPanel.hide();
    else if (imieEdit) zamknijImie();
    else {
      selected.clear();
      aptFocus = -1;
      budFocus = -1;
      residentFocus = -1;
    }
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') view.zoomAt(view.width / 2, view.height / 2, 1.25);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.zoomAt(view.width / 2, view.height / 2, 0.8);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
// wysokość górnego paska, listy celów, karty i atrybucji dla przycisków mapy i podpowiedzi (zawijają się na telefonie)
const attrib = document.querySelector<HTMLElement>('#app .attrib');
const bars = new ResizeObserver(() => {
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${Math.round($('top').getBoundingClientRect().height)}px`);
  root.setProperty('--goals-h', `${$('goals').hidden ? 0 : Math.round($('goals').getBoundingClientRect().height)}px`);
  root.setProperty('--card-h', `${$('card').hidden ? 0 : Math.round($('card').getBoundingClientRect().height)}px`);
  // atrybucja map i danych mieszkańców na dole: na telefonie dwa wiersze, a karta i podpowiedź stoją nad nią
  if (attrib) root.setProperty('--attrib-h', `${Math.round(attrib.getBoundingClientRect().height)}px`);
  // pasek trybu stawiania: na telefonie podpowiedź (np. czemu tu nie wolno) idzie nad niego, a nie pod spód
  const place = $('placeBar');
  root.setProperty('--place-lift', `${place.hidden ? 0 : Math.round(place.getBoundingClientRect().height) + 20}px`);
});
bars.observe($('top'));
bars.observe($('goals'));
bars.observe($('card'));
bars.observe($('placeBar'));
if (attrib) bars.observe(attrib);

/* ---------- start ---------- */
(async () => {
  window.zm = {
    ready: false,
    sim: null,
    gov: null,
    view,
    fps: () => fps,
    setCam: (x, y, zoom) => {
      fly = null;
      Object.assign(view.cam, { x: x * TILE, y: y * TILE, zoom });
    },
    chunksPending: () => view.pendingFar,
    idle: () => view.complete && view.pendingFar === 0,
    govTick: () => {
      screen = Math.max(screen, govAt + 1);
      govAt = screen;
      return govStep(true)?.k ?? null;
    },
    ff: (minutes, mult = 1) => {
      if (!sim || !gov || modal.open) return modal.tone;
      const ticks = Math.round((minutes / 60) * TICKS_PER_HOUR);
      const perSecond = Math.max(1, Math.round(TICKS_PER_SECOND * mult));
      let p: Prompt | null = null;
      for (let k = 1; k <= ticks && !p && !gov.over; k++) {
        view.beforeStep(sim.st);
        sim.step();
        if (k % perSecond === 0) {
          screen += 1;
          govAt = screen;
          p = govStep(false);
        }
      }
      drawState();
      hudT = performance.now();
      hud(hudT);
      if (gov.over) showEnd();
      else if (p) showPrompt(p);
      return p?.k ?? null;
    },
    screenOf,
    save,
    screen: () => screen,
    speed: () => speed,
    fly: (x, y, zoom, ms) => flyTo(x * TILE, y * TILE, zoom, ms),
    buildPanel: () => ({ open: buildPanel.open, ...buildPanel.current }),
    pracaPanel: () => ({ open: pracaPanel.open, kol: pracaPanel.column }),
    placing: () =>
      placing
        ? {
            kind: placing.kind,
            x: placing.x,
            y: placing.y,
            rot: placing.rot,
            ok: placing.ok,
            why: placing.why,
            allowed: placing.allowed.length,
            first: placing.allowed[0] ?? -1,
          }
        : null,
    okolica: [],
    mapa: () => mapaMiasta,
    minimapa: () => minimapa,
    apts: () => sim?.st.apts ?? [],
    admit: (n) => (sim ? addResidents(sim.st, sim.w, n, true) : 0),
    siec: () => siec.podglad(),
    zwyciestwo: () => (sim && gov ? ocenDrogi(gov, input()) : []),
    wygraj: (droga) => {
      if (!sim || !gov || gov.over) return null;
      const i = input();
      if (!wygrajDroge(gov, droga, i.day, i.hour) || modal.open) return null;
      const p = pending(gov, i);
      if (p) showPrompt(p);
      return p?.k ?? null;
    },
    grafika: () => {
      const g = view.grafika;
      return (
        g && {
          teren: !!g.teren,
          blok: !!g.blok,
          dach: !!g.dach,
          strop: !!g.strop?.img,
          trzepak: !!g.trzepak,
          budynki: !!g.budynki,
          ludzie: !!g.ludzie,
        }
      );
    },
    pietro: wybierzPietro,
    pietra: () => ({ wlaczone: pietraGry, pietro: view.pietro, lista: [...pietraLista] }),
  };
  // ?worker=0: kawałki mapy rysuje główny wątek (zapas dla przeglądarek bez OffscreenCanvas w workerze)
  await view.init($('stage'), { workers: params.get('worker') !== '0' });
  view.app.ticker.add((t) => frame(performance.now(), t.deltaMS));
  const demo = params.get('demo');
  // gra z sąsiadami: ponowny start po przegranym wyścigu o klatkę (przeładowanie z danymi osiedla w pamięci sesji)
  const again = siec.ponownyStart();
  if (again) {
    if (again.tryb) setMode(parseMode(again.tryb));
    await start(async () => again.data);
  } else if (demo) await start(() => loadDemo(demo));
  window.zm.ready = true;
})();
