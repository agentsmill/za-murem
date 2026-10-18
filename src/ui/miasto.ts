/* Okno mapy miasta i karta miejsca (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Mapa miasta i minimapa
   na ekranie”): płótno 2D w oknie `Modal` (bez PixiJS) z tłem z kafelków OpenFreeMap, ikonami miejsc, osiedlem gracza
   (koło mapy lokalnej 192 m) i siedzibą, przesuwaniem i przybliżaniem myszą, kółkiem i palcami, oraz kartą miejsca
   po stuknięciu w ikonę. Wysłanie wyprawy robi zadanie 9: karta ma przycisk `data-act="wyslij"`, który woła
   `onWyslij` podane przy otwarciu, a bez niego jest wyszarzony z dopiskiem „wkrótce”.

   Kontrakt.
   - Czyste funkcje (testy w Node): `rzut` i `odwrotnie` (metry od adresu ↔ piksele płótna; x na wschód, y na południe,
     bez obrotu świata, jak `Miejsce`), `przybliz` (czynnik powyżej 1 przybliża, zakres 0,5–40 m/px, punkt pod kursorem
     stoi), `trafiony` (najbliższe miejsce w promieniu w pikselach), `kafelkiWidoku` (które kafelki zamówić),
     `dolaczMiejsca` (okolica ma pierwszeństwo), `przytnijPamiec` i `PamiecKafelkow` (pamięć kafelków), `kartaMiejsca`
     i `kartaHtml` (napisy w obu językach), `mapaMiastaSheet`, ikony kategorii `IKONY` (wzory 7×7 w palecie gry).
   - Kafelki: powyżej 8 m/px tło z=12 (`zKafelka` ściśle), z bliska z=14, ale tylko gdy widok potrzebuje najwyżej
     MAX_KAFELKOW_14 kafelków (duży ekran przy 6–8 m/px dostaje tło z=12), i tylko w kwadracie ZASIEG_MIASTA_M wokół
     adresu (dalej nie ma po co chodzić). Zdekodowany kafelek okno od razu przerabia na ścieżki Path2D i miejsca, po
     czym woła `KafelkiMiasta.zapomnij`, więc w pamięci zostają tylko ścieżki: najwyżej MAX_KAFELKOW_14 kafelków z=14
     i MAX_RYSUNKOW_12 z=12, reszta wypada od najdawniej widzianych, ale nigdy kafelki bieżącego widoku (na dalekiej
     północy widok z daleka potrzebuje ponad 16 kafelków z=12; pamięć trzyma wtedy cały widok, zamiast pobierać go
     w kółko). Najwyżej MAX_W_TRAKCIE pobrań w toku, od środka widoku, więc szybkie przesuwanie nie kolejkuje pobrań
     dla miejsc, których już nie widać. Decyzje o pobieraniu i zapominaniu są w `PamiecKafelkow` (testy w Node).
   - Render postępowy: okno otwiera się od razu z okolicą (bez sieci) i tym, co już jest w pamięci, a kafelki dochodzą
     w tle i odświeżają widok. Nieudany kafelek nie jest ponawiany do następnego otwarcia okna; wtedy na mapie stoi
     napis „Reszta miasta się nie wczytała”. Nic nie rzuca i nic nie pisze na konsoli.
   - Miejsca spoza okolicy (warstwa poi kafelków z=14) idą przez ten sam filtr nazw co okolica (`nazwa`, w grze
     `nazwaDoOkolicy`: bez tabel mieszkańców same kategorie, RODO) i są scalane po kluczu; ten sam punkt pod innym
     kluczem (stary zapis i demo mają klucz z metrów, o piksel obok) też jest jednym miejscem.
   - Znaki miejsc: znak, który zachodziłby na inny, staje się kropką (z daleka znika), miejsca z mapy osiedla i wybrane
     do cna są przygaszone, a z daleka (koło osiedla mniejsze niż OSIEDLE_PX) miejsc z mapy osiedla nie ma wcale.
     Trafić można tylko w to, co narysowane.
   - Okno nie zmienia stanu gry ani zarządu: karta i przygaszanie tylko czytają `GovState` i `GovInput` (pauzę i powrót
     do gry robi main.ts). Czy można wysłać wyprawę i dlaczego nie, rozstrzyga `powodOdmowy` z src/gov/dzienne.ts, ta
     sama co w `wyslijWyprawe`; karta dokłada tylko „miejsce na mapie osiedla”. Atrybucja map jest w stopce okna zawsze.
   Liczby w napisach po polsku z przecinkiem, po angielsku z kropką (`liczba`), z twardą spacją przed jednostką. Bez
   hypot, sin i cos (odległość palców przez Math.sqrt); nic stąd nie trafia do stanu. */

import './miasto.css';
import { L, type Lang, liczba, type Tx, tr, tx } from '../core/jezyk.ts';
import { kiedyWraca, powodOdmowy } from '../gov/dzienne.ts';
import type { GovInput, GovState, LootKey } from '../gov/typy.ts';
import { celZMiejsca, czasWyprawyMin, MAX_DROGA_M, ryzykoSlowem, zostaloZMiejsca } from '../gov/wyprawy.ts';
import { C, css, mix, shade, WALLS } from '../render/art/palette.ts';
import type { GeoPoi, Pt } from '../world/geo.ts';
import type { LatLon } from '../world/klucze.ts';
import { type Miejsce, miejscaZPoi, naMapieLokalnej, PROMIEN_MAPY_LOKALNEJ } from '../world/miasto.ts';
import {
  type KafelkiMiasta,
  type KlasaLinii,
  type KlasaPola,
  kafelkiProstokata,
  poiZKafelkow,
  rzutKafelkaZ,
  tloKafelka,
  zKafelka,
} from '../world/miastoKafelki.ts';
import type { DecodedTile } from '../world/mvt.ts';
import { LOOT, type Sheet } from './okna.ts';
import { wheelKind, zoomFactor } from './sterowanie.ts';
import { esc } from './tekst.ts';

// ---------------------------------------------------------------- widok

/** Widok mapy: środek w metrach od adresu (x na wschód, y na południe) i skala w metrach na piksel płótna. */
export interface Widok {
  cx: number;
  cy: number;
  mNaPiksel: number;
}

/** najbliżej i najdalej (metry na piksel) */
export const M_NA_PIKSEL_MIN = 0.5;
export const M_NA_PIKSEL_MAX = 40;
/** kafelki tylko w kwadracie o połowie boku tylu metrów wokół adresu: dalej niż dzienna wyprawa nie ma po co patrzeć */
export const ZASIEG_MIASTA_M = MAX_DROGA_M + 1000;
/** najwyżej tyle kafelków z=14 widok zamawia i trzyma w pamięci naraz (zdekodowany kafelek waży kilka MB) */
export const MAX_KAFELKOW_14 = 24;
/** najwyżej tyle kafelków tła z=12 w pamięci (całe miasto to kilka sztuk; na dalekiej północy kafelek jest węższy i widok
    potrzebuje ich więcej, wtedy pamięć trzyma cały widok, bo kafelków z bieżącego widoku nic nie wypiera) */
export const MAX_RYSUNKOW_12 = 16;
/** najwyżej tyle pobrań kafelków w toku z jednego okna */
const MAX_W_TRAKCIE = 8;
/** zapas wokół widoku w pikselach przy zamawianiu kafelków */
const ZAPAS_PX = 32;

/** Punkt (x, y) w metrach od adresu na płótnie szer × wys przy widoku w (piksele od lewego górnego rogu). */
export function rzut(w: Widok, szer: number, wys: number, x: number, y: number): [number, number] {
  return [szer / 2 + (x - w.cx) / w.mNaPiksel, wys / 2 + (y - w.cy) / w.mNaPiksel];
}

/** Odwrotność `rzut`: piksel płótna na metry od adresu. */
export function odwrotnie(w: Widok, szer: number, wys: number, px: number, py: number): [number, number] {
  return [w.cx + (px - szer / 2) * w.mNaPiksel, w.cy + (py - wys / 2) * w.mNaPiksel];
}

const ogranicz = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Przybliżenie o `czynnik` (powyżej 1 bliżej, poniżej 1 dalej) wokół piksela (px, py): punkt pod nim zostaje w miejscu,
    a skala nie wychodzi poza M_NA_PIKSEL_MIN–M_NA_PIKSEL_MAX. Wejścia nie zmienia. */
export function przybliz(w: Widok, czynnik: number, px: number, py: number, szer: number, wys: number): Widok {
  const m = ogranicz(w.mNaPiksel / czynnik, M_NA_PIKSEL_MIN, M_NA_PIKSEL_MAX);
  if (m === w.mNaPiksel) return { ...w };
  const [x, y] = odwrotnie(w, szer, wys, px, py);
  return { cx: x - (px - szer / 2) * m, cy: y - (py - wys / 2) * m, mNaPiksel: m };
}

/** Miejsce najbliższe pikselowi (px, py), najwyżej `promienPx` od niego (brzeg wliczony); przy równej odległości pierwsze
    z listy; null, gdy w promieniu nie ma żadnego. */
export function trafiony(
  miejsca: readonly Miejsce[],
  w: Widok,
  szer: number,
  wys: number,
  px: number,
  py: number,
  promienPx: number,
): Miejsce | null {
  let best: Miejsce | null = null;
  let bestD = promienPx * promienPx;
  for (const m of miejsca) {
    const [x, y] = rzut(w, szer, wys, m.x, m.y);
    const d = (x - px) * (x - px) + (y - py) * (y - py);
    if (d < bestD || (d === bestD && !best)) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** Które kafelki zamówić dla widoku: poziom (`zKafelka`, a z=14 tylko do MAX_KAFELKOW_14 sztuk) i kafelki pokrywające
    widok z zapasem ZAPAS_PX, przycięty do kwadratu ZASIEG_MIASTA_M wokół adresu c (szerokość, długość). */
export function kafelkiWidoku(
  c: LatLon,
  w: Widok,
  szer: number,
  wys: number,
): { z: number; kafelki: [number, number][] } {
  const R = ZASIEG_MIASTA_M;
  const [ax, ay] = odwrotnie(w, szer, wys, -ZAPAS_PX, -ZAPAS_PX);
  const [bx, by] = odwrotnie(w, szer, wys, szer + ZAPAS_PX, wys + ZAPAS_PX);
  const x0 = Math.max(ax, -R);
  const y0 = Math.max(ay, -R);
  const x1 = Math.min(bx, R);
  const y1 = Math.min(by, R);
  if (zKafelka(w.mNaPiksel) === 14) {
    const k14 = kafelkiProstokata(c, x0, y0, x1, y1, 14);
    if (k14.length <= MAX_KAFELKOW_14) return { z: 14, kafelki: k14 };
  }
  return { z: 12, kafelki: kafelkiProstokata(c, x0, y0, x1, y1, 12) };
}

/** Wyrzuca z pamięci rysunków kafelków (klucz → rysunek z poziomem `z`; kolejność wstawienia to kolejność ostatniego
    użycia, najdawniej użyte pierwsze) te najdawniej użyte, które przekraczają limit swojego poziomu, ale nigdy kluczy
    z `chronione` (kafelki bieżącego widoku): gdy sam widok potrzebuje więcej, pamięć chwilowo przekracza limit, zamiast
    wypierać to, co zaraz trzeba by pobrać od nowa. Zwraca wyrzucone klucze. */
export function przytnijPamiec<T extends { z: number }>(
  mapa: Map<string, T>,
  limit: (z: number) => number,
  chronione: ReadonlySet<string> = new Set(),
): string[] {
  const ile = new Map<number, number>();
  for (const r of mapa.values()) ile.set(r.z, (ile.get(r.z) ?? 0) + 1);
  const out: string[] = [];
  for (const [k, r] of mapa) {
    const n = ile.get(r.z) ?? 0;
    if (n <= limit(r.z) || chronione.has(k)) continue;
    mapa.delete(k);
    ile.set(r.z, n - 1);
    out.push(k);
  }
  return out;
}

/** Pamięć rysunków kafelków okna mapy i decyzje, co pobrać (bez DOM i sieci, więc z testami w Node; rysunek to dowolny
    obiekt z poziomem `z`): rysunki po kluczu „z/x/y” w kolejności ostatniego użycia, pobrania w toku (najwyżej
    MAX_W_TRAKCIE) i kafelki nieudane, których nie ponawia aż do `odNowa` (nowe otwarcie okna). Kafelki bieżącego widoku
    (ostatnie `zamow`) nigdy nie wypadają, więc nic nie jest pobierane w kółko, nawet gdy widok potrzebuje więcej
    kafelków niż limit poziomu. */
export class PamiecKafelkow<R extends { z: number }> {
  readonly rysunki = new Map<string, R>();
  readonly wTrakcie = new Set<string>();
  readonly nieudane = new Set<string>();
  private widok: ReadonlySet<string> = new Set();

  /** nowe otwarcie okna: kafelki, które się nie wczytały, można próbować od nowa */
  odNowa(): void {
    this.nieudane.clear();
  }

  /** Kafelki widoku na poziomie z (z `kafelkiWidoku`): zapamiętuje widok (chroniony przed wypadaniem), widoczne rysunki
      przenosi na koniec kolejki do wypadania i zwraca brakujące do pobrania [x, y, klucz], od środka widoku, najwyżej
      tyle, ile zostało miejsc w MAX_W_TRAKCIE; zwrócone są już w toku. */
  zamow(z: number, kafelki: readonly [number, number][]): [number, number, string][] {
    this.widok = new Set(kafelki.map(([x, y]) => `${z}/${x}/${y}`));
    if (!kafelki.length) return [];
    let sx = 0;
    let sy = 0;
    for (const [x, y] of kafelki) {
      sx += x;
      sy += y;
    }
    sx /= kafelki.length;
    sy /= kafelki.length;
    const brakujace: [number, number, string][] = [];
    for (const [x, y] of kafelki) {
      const k = `${z}/${x}/${y}`;
      const r = this.rysunki.get(k);
      if (r) {
        // widziane teraz: na koniec kolejki do wypadania
        this.rysunki.delete(k);
        this.rysunki.set(k, r);
      } else if (!this.wTrakcie.has(k) && !this.nieudane.has(k)) brakujace.push([x, y, k]);
    }
    brakujace.sort((p, q) => (p[0] - sx) ** 2 + (p[1] - sy) ** 2 - ((q[0] - sx) ** 2 + (q[1] - sy) ** 2));
    const out = brakujace.slice(0, Math.max(0, MAX_W_TRAKCIE - this.wTrakcie.size));
    for (const t of out) this.wTrakcie.add(t[2]);
    return out;
  }

  /** Wynik pobrania kafelka `k`: rysunek albo null (porażka, bez ponawiania do `odNowa`); potem pamięć przycięta do
      limitów poziomów bez ruszania bieżącego widoku. */
  przyszedl(k: string, r: R | null): void {
    this.wTrakcie.delete(k);
    if (!r) {
      this.nieudane.add(k);
      return;
    }
    this.rysunki.set(k, r);
    przytnijPamiec(this.rysunki, (z) => (z === 12 ? MAX_RYSUNKOW_12 : MAX_KAFELKOW_14), this.widok);
  }
}

/** ten sam punkt pod innym kluczem: ta sama kategoria i klucz najwyżej tyle pikseli z=14 obok na każdej osi (klucz
    z metrów ze starego zapisu i dema, `kluczZMetrow`, różni się od klucza z kafelków najwyżej o dwa piksele) */
const TEN_SAM_PUNKT_PX = 2;

/** piksele z=14 z klucza „poi:X:Y” albo null */
function pikselKlucza(k: string): [number, number] | null {
  const m = /^poi:(-?\d+):(-?\d+)$/.exec(k);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Dokłada do mapy miejsc (klucz → miejsce) nowe, których jeszcze nie ma: ani pod tym kluczem, ani tej samej kategorii
    pod kluczem najwyżej TEN_SAM_PUNKT_PX pikseli obok (stary zapis i demo mają klucz z metrów). Pierwsze wygrywa, więc
    okolica dołożona przed kafelkami ma pierwszeństwo. Zwraca, ile dołożyło. */
export function dolaczMiejsca(mapa: Map<string, Miejsce>, nowe: readonly Miejsce[]): number {
  // siatka po 8 pikseli do szukania kluczy obok
  const KRATKA = 8;
  const siatka = new Map<string, { m: Miejsce; x: number; y: number }[]>();
  const wstaw = (m: Miejsce) => {
    const p = pikselKlucza(m.klucz);
    if (!p) return;
    const k = `${Math.floor(p[0] / KRATKA)},${Math.floor(p[1] / KRATKA)}`;
    const wpis = { m, x: p[0], y: p[1] };
    const lista = siatka.get(k);
    if (lista) lista.push(wpis);
    else siatka.set(k, [wpis]);
  };
  for (const m of mapa.values()) wstaw(m);
  const obok = (m: Miejsce): boolean => {
    const p = pikselKlucza(m.klucz);
    if (!p) return false;
    const gx = Math.floor(p[0] / KRATKA);
    const gy = Math.floor(p[1] / KRATKA);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const o of siatka.get(`${gx + dx},${gy + dy}`) ?? [])
          if (o.m.kat === m.kat && Math.abs(o.x - p[0]) <= TEN_SAM_PUNKT_PX && Math.abs(o.y - p[1]) <= TEN_SAM_PUNKT_PX)
            return true;
    return false;
  };
  let n = 0;
  for (const m of nowe) {
    if (mapa.has(m.klucz) || obok(m)) continue;
    mapa.set(m.klucz, m);
    wstaw(m);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- karta miejsca

/** Karta miejsca: tytuł (kategoria i nazwa po filtrze), linie opisu, czy można tam wysłać wyprawę i dlaczego nie. */
export interface KartaMiejsca {
  tytul: Tx;
  linie: Tx[];
  mozna: boolean;
  powod?: Tx;
}

/** twarda spacja między liczbą a jednostką: karta nie łamie „3 h” na dwa wiersze */
const NBSP = '\u00a0';

/** odległość: do kilometra w metrach (co 10 m), dalej w kilometrach z jednym miejscem po przecinku */
const odleglosc = (odl: number, lang: Lang): string =>
  odl < 1000 ? `${Math.round(odl / 10) * 10}${NBSP}m` : `${liczba(odl / 1000, 1, lang)}${NBSP}km`;

/** czas w minutach: „45 min”, „2 h”, „2 h 8 min” (tak samo w obu językach, z twardymi spacjami) */
const czas = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}${NBSP}h${NBSP}${m}${NBSP}min` : `${h}${NBSP}h`) : `${m}${NBSP}min`;
};

/** Karta miejsca dla stanu zarządu `st` i wejścia `i`: kategoria i nazwa, odległość i czas drogi, ryzyko słowem, co tam
    zwykle jest, ile zostało („nietknięte”, „ktoś tu był”, „wybrane do cna”), kiedy byliście ostatnio, wyprawa w drodze.
    Czy można i dlaczego nie, mówi `powodOdmowy` z src/gov/dzienne.ts (to samo co przy wysłaniu, bez sprawdzania osób);
    karta dokłada tylko jedno: miejsce na mapie osiedla nie jest celem wyprawy. Nic nie zmienia. */
export function kartaMiejsca(m: Miejsce, st: GovState, i: GovInput): KartaMiejsca {
  const cel = celZMiejsca(m);
  const linie: Tx[] = [];
  const wJednaStrone = Math.round((czasWyprawyMin(m.odl, 1) - czasWyprawyMin(0, 1)) / 2);
  linie.push(
    tx(
      `${odleglosc(m.odl, 'pl')} stąd, w jedną stronę około ${czas(wJednaStrone)} drogi.`,
      `${odleglosc(m.odl, 'en')} away, about ${czas(wJednaStrone)} each way.`,
    ),
  );
  const krotko = czas(czasWyprawyMin(m.odl, 3));
  const dlugo = czas(czasWyprawyMin(m.odl, 1));
  linie.push(
    tx(
      `Cała wyprawa z przeszukaniem: od ${krotko} do ${dlugo} (im więcej osób, tym krócej).`,
      `Whole supply run, search included: ${krotko} to ${dlugo} (quicker with more people).`,
    ),
  );
  const r = ryzykoSlowem(cel.ryzyko);
  linie.push(tx(`Tam jest ${r.pl}.`, `It’s ${r.en} out there.`));
  const lup = (Object.entries(cel.lup) as [LootKey, [number, number]][])
    .filter(([, [, b]]) => b > 0)
    .map(([k, [a, b]]) => ({ n: LOOT[k], ile: a === b ? `${a}` : `${a}–${b}` }));
  linie.push(
    lup.length
      ? tx(
          `Zwykle jest tu: ${lup.map((x) => `${x.n.pl} ${x.ile}`).join(', ')}.`,
          `Usually here: ${lup.map((x) => `${x.n.en} ${x.ile}`).join(', ')}.`,
        )
      : tx('Nic, co dałoby się unieść.', 'Nothing worth carrying.'),
  );
  const zostalo = zostaloZMiejsca(st, cel);
  const zabrano = st.miasto?.zabrano[m.klucz] ?? 0;
  linie.push(
    zostalo <= 0
      ? tx('Wybrane do cna.', 'Picked clean.')
      : zabrano > 0
        ? tx('Ktoś tu był: część już wyniesiono.', 'Somebody has been here: some of it is gone.')
        : tx('Nietknięte.', 'Untouched.'),
  );
  const wizyty = st.miasto?.wizyty[m.klucz] ?? 0;
  const ostatnia = st.miasto?.ostatnia[m.klucz];
  if (wizyty > 0 && ostatnia !== undefined) {
    const kiedy =
      ostatnia === i.day
        ? tx('dziś', 'today')
        : ostatnia === i.day - 1
          ? tx('wczoraj', 'yesterday')
          : tx(`w dniu ${ostatnia}`, `on day ${ostatnia}`);
    linie.push(
      tx(
        `Byliście tu ostatnio ${kiedy.pl}${wizyty > 1 ? ` (razem ${wizyty} razy)` : ''}.`,
        `You were last here ${kiedy.en}${wizyty > 1 ? ` (${wizyty} times in all)` : ''}.`,
      ),
    );
  } else linie.push(tx('Jeszcze tu nie byliście.', 'You have not been here yet.'));
  const wDrodze = st.wyprawy?.find((w) => w.cel.klucz === m.klucz);
  if (wDrodze) {
    const kiedy = kiedyWraca(wDrodze.powrot, i.day);
    linie.push(tx(`Wyprawa jest w drodze, powrót ${kiedy.pl}.`, `A supply run is on its way, back ${kiedy.en}.`));
  }
  // zasady wysyłki są tylko w zarządzie (te same, co sprawdzi wysłanie); karta dokłada jedno swoje: mapa osiedla
  const powod =
    powodOdmowy(st, i, cel) ??
    (naMapieLokalnej(m)
      ? tx(
          'To miejsce jest na mapie osiedla: tam chodzi się pieszo, bez wyprawy.',
          'This place is on your estate map: you can walk there, no supply run needed.',
        )
      : null);
  return { tytul: cel.nazwa, linie, mozna: !powod, ...(powod ? { powod } : {}) };
}

/** HTML karty miejsca w bieżącym języku: tytuł, linie, powód i przycisk „Wyślij wyprawę” (`data-act="wyslij"`, w
    `data-arg` klucz miejsca). Bez wysyłki (`wyslij` false, do zadania 9) przycisk jest wyszarzony z dopiskiem „wkrótce”;
    wyszarzony także wtedy, gdy nie można. */
export function kartaHtml(m: Miejsce, k: KartaMiejsca, wyslij: boolean): string {
  const ik = ikonaKategorii(m.kat);
  const etykieta = wyslij
    ? L('Wyślij wyprawę', 'Send a supply run')
    : L('Wyślij wyprawę (wkrótce)', 'Send a supply run (soon)');
  return `<header class="mk-head"><span class="mk-znak" style="background:${ik.tlo}" aria-hidden="true"></span><h3 class="mk-t">${esc(
    tr(k.tytul),
  )}</h3><button type="button" class="mk-x" data-act="miasto-karta-zamknij" aria-label="${L('Zamknij kartę', 'Close the card')}">×</button></header><ul class="mk-l">${k.linie
    .map((t) => `<li>${esc(tr(t))}</li>`)
    .join(
      '',
    )}</ul>${k.powod ? `<p class="mk-why">${esc(tr(k.powod))}</p>` : ''}<div class="mk-act"><button type="button" class="btn go" data-act="wyslij" data-arg="${esc(
    m.klucz,
  )}"${k.mozna && wyslij ? '' : ' disabled'}>${etykieta}</button></div>`;
}

// ---------------------------------------------------------------- okno

const a = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** Okno mapy miasta: płótno, napis o wczytywaniu, przyciski przybliżania, podpowiedź sterowania (dotyk albo mysz),
    miejsce na kartę i stopka z atrybucją map i powrotem do gry. Zamykane bez decyzji (Esc, klik obok). */
export function mapaMiastaSheet(touch: boolean): Sheet {
  const pomoc = touch
    ? L(
        'Jeden palec przesuwa mapę, dwa przybliżają. Stuknijcie w znak, żeby zobaczyć miejsce.',
        'One finger moves the map, two fingers zoom. Tap a sign to see the place.',
      )
    : L(
        'Przeciąganie przesuwa mapę, kółko przybliża. Kliknijcie znak, żeby zobaczyć miejsce.',
        'Drag to move the map, scroll to zoom. Click a sign to see the place.',
      );
  const osm = a(
    'https://www.openstreetmap.org/copyright',
    L('współtwórcy OpenStreetMap', 'OpenStreetMap contributors'),
  );
  return {
    tone: 'miasto',
    kicker: L('Za bramą', 'Beyond the gate'),
    title: L('Mapa miasta', 'City map'),
    body: `<div class="miasto" data-miasto><canvas class="miasto-plotno" role="img" aria-label="${L(
      'Mapa miasta wokół osiedla',
      'City map around the estate',
    )}"></canvas><p class="miasto-stan" data-miasto-stan aria-live="polite" hidden></p><div class="miasto-ctl"><button type="button" data-act="miasto-blizej" aria-label="${L(
      'Przybliż',
      'Zoom in',
    )}">+</button><button type="button" data-act="miasto-dalej" aria-label="${L('Oddal', 'Zoom out')}">−</button><button type="button" data-act="miasto-dom" aria-label="${L(
      'Pokaż osiedle',
      'Show the estate',
    )}">⌂</button></div><section class="miasto-karta" data-miasto-karta aria-live="polite" hidden></section><p class="miasto-pomoc">${pomoc}</p></div>`,
    foot: `<p class="miasto-attrib">© ${osm}, ${a('https://openfreemap.org', 'OpenFreeMap')}, ${a(
      'https://www.openmaptiles.org/',
      'OpenMapTiles',
    )}</p><button type="button" class="btn go" data-act="miasto-zamknij">${L('Wróć do gry', 'Back to the game')}</button>`,
    closable: true,
  };
}

// ---------------------------------------------------------------- ikony

/** Ikona kategorii: wzór 7×7 („#” to znak) w kolorze `znak` na tle `tlo`, rysowana kodem w palecie gry. */
export interface Ikona {
  wzor: readonly string[];
  tlo: string;
  znak: string;
}

const BIALY = css(C.line);
const CIEMNY = css(C.shadow);
const KRZYZ = ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'];

export const IKONY: Readonly<Record<string, Ikona>> = {
  spozywczy: {
    wzor: ['....#..', '...#...', '.##.##.', '#######', '#######', '.#####.', '..#.#..'],
    tlo: css(C.crop),
    znak: BIALY,
  },
  ogrodnik: {
    wzor: ['##...##', '###.###', '.##.##.', '...#...', '...#...', '..###..', '.#####.'],
    tlo: css(C.turf1),
    znak: BIALY,
  },
  apteka: { wzor: KRZYZ, tlo: BIALY, znak: css(C.turf1) },
  przychodnia: { wzor: KRZYZ, tlo: BIALY, znak: css(C.tile2) },
  budowlany: {
    wzor: ['.#####.', '######.', '...##..', '...##..', '...##..', '...##..', '...##..'],
    tlo: css(C.leaf1),
    znak: CIEMNY,
  },
  elektronika: {
    wzor: ['....##.', '...##..', '..##...', '.######', '...##..', '..##...', '.##....'],
    tlo: css(C.water2),
    znak: css(C.windowLit),
  },
  szkola: {
    wzor: ['.......', '##...##', '#.#.#.#', '#..#..#', '#..#..#', '#..#..#', '#######'],
    tlo: css(C.sand0),
    znak: CIEMNY,
  },
  biblioteka: {
    wzor: ['#######', '#.....#', '#######', '.#####.', '.#...#.', '.#####.', '#######'],
    tlo: css(C.dirt1),
    znak: BIALY,
  },
  bank: {
    wzor: ['...#...', '..###..', '#######', '.#.#.#.', '.#.#.#.', '.#.#.#.', '#######'],
    tlo: css(C.windowLit),
    znak: CIEMNY,
  },
  stacja: {
    wzor: ['...#...', '..###..', '.#####.', '.#####.', '#######', '#######', '.#####.'],
    tlo: css(C.brick0),
    znak: BIALY,
  },
  ubrania: {
    wzor: ['##...##', '###.###', '#######', '.#####.', '.#####.', '.#####.', '.#####.'],
    tlo: css(shade(WALLS[6], 0.6)),
    znak: BIALY,
  },
  urzad: {
    wzor: ['.####..', '.#####.', '.####..', '.#.....', '.#.....', '.#.....', '###....'],
    tlo: css(WALLS[5]),
    znak: CIEMNY,
  },
  kosciol: {
    wzor: ['...#...', '..###..', '...#...', '...#...', '...#...', '...#...', '..###..'],
    tlo: css(C.wallGrey),
    znak: css(C.door),
  },
  sklep: {
    wzor: ['..###..', '.#...#.', '#######', '#######', '#######', '#######', '#######'],
    tlo: css(C.shopGlass),
    znak: BIALY,
  },
  garaz: {
    wzor: ['...#...', '.#####.', '#######', '#.....#', '#######', '#.....#', '#######'],
    tlo: css(C.metal0),
    znak: BIALY,
  },
  hala: {
    wzor: ['.......', '#######', '#.....#', '#.###.#', '#.#.#.#', '#.#.#.#', '#######'],
    tlo: css(C.metal1),
    znak: BIALY,
  },
};

/** siedziba zarządu: domek na emalii jak na tabliczce gry */
const SIEDZIBA: Ikona = {
  wzor: ['...#...', '..###..', '.#####.', '#######', '.#...#.', '.#.#.#.', '.#.#.#.'],
  tlo: css(0x2457a8),
  znak: css(0xf4f3ee),
};

/** Ikona kategorii miejsca; nieznana kategoria (i `mieszkania` z 0.3) to sklep, jak w `celZMiejsca`. */
export function ikonaKategorii(kat: string): Ikona {
  return Object.hasOwn(IKONY, kat) ? IKONY[kat] : IKONY.sklep;
}

// ---------------------------------------------------------------- rysowanie (tylko przeglądarka)

/** tło mapy: ląd poza zabudową */
const LAD = shade(C.grass0, 0.62);
const KOLOR_POLA: Record<KlasaPola, string> = {
  zabudowa: css(mix(LAD, C.slab1, 0.22)),
  zielen: css(shade(C.park1, 0.9)),
  las: css(C.wood0),
  woda: css(C.water1),
  budynek: css(C.tar2),
};
const KOLEJNOSC_POL: readonly KlasaPola[] = ['zabudowa', 'zielen', 'las', 'woda', 'budynek'];
/** linie po kolei od spodu: kolor, szerokość w metrach, najmniej pikseli i najdalej (m/px), przy którym ją widać */
const LINIE: readonly { k: KlasaLinii; kolor: string; m: number; px: number; doM: number }[] = [
  { k: 'rzeka', kolor: css(C.water1), m: 14, px: 1.5, doM: M_NA_PIKSEL_MAX },
  { k: 'strumien', kolor: css(C.water1), m: 3, px: 1, doM: 6 },
  { k: 'tory', kolor: css(C.rail), m: 3, px: 1, doM: 12 },
  { k: 'sciezka', kolor: css(C.dirt1), m: 2, px: 1, doM: 3 },
  { k: 'ulica', kolor: css(C.slab1), m: 7, px: 1, doM: 12 },
  { k: 'srednia', kolor: css(C.curb), m: 11, px: 1.6, doM: M_NA_PIKSEL_MAX },
  { k: 'glowna', kolor: css(C.line), m: 16, px: 2.2, doM: M_NA_PIKSEL_MAX },
];
/** budynki i kropki miejsc widać do tylu metrów na piksel (dalej to szum) */
const BUDYNKI_DO_M = 8;
/** miejsca z mapy osiedla widać, gdy jej koło ma co najmniej tyle pikseli promienia (z daleka zasłaniałyby siedzibę) */
const OSIEDLE_PX = 40;
/** znak miejsca: 9 kratek (ramka i wzór 7×7) po tyle pikseli */
const KRATKA_PX = 2;
const ZNAK_PX = 9 * KRATKA_PX;
/** promień trafienia w znak: palec potrzebuje więcej niż kursor */
const TRAFIENIE_PX = { dotyk: 18, mysz: 12 };
/** stuknięcie: najwyżej tyle pikseli ruchu i milisekund */
const STUK_PX = 6;
const STUK_MS = 600;
const LAMPA = '#e6a540';

/** Rysunek kafelka: ścieżki w metrach od adresu po rodzajach i prostokąt kafelka (bez bufora). */
interface Rysunek {
  z: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pola: Partial<Record<KlasaPola, Path2D>>;
  linie: Partial<Record<KlasaLinii, Path2D>>;
}

function rysunekKafelka(T: DecodedTile, r: ReturnType<typeof rzutKafelkaZ>): Rysunek {
  const pola: Rysunek['pola'] = {};
  const linie: Rysunek['linie'] = {};
  const dopisz = (p: Path2D, pts: Pt[], zamknij: boolean) => {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) p.lineTo(pts[k][0], pts[k][1]);
    if (zamknij) p.closePath();
  };
  tloKafelka(T, r, {
    pole: (k, ring) => dopisz((pola[k] ??= new Path2D()), ring, true),
    linia: (k, line) => dopisz((linie[k] ??= new Path2D()), line, false),
  });
  const [x0, y0] = r(T, 4096, [0, 0]);
  const [x1, y1] = r(T, 4096, [4096, 4096]);
  return { z: T.z ?? 14, x0, y0, x1, y1, pola, linie };
}

/** Skąd okno bierze dane: środek mapy, okolica (po filtrze nazw), kafelki i filtr nazw dla miejsc z kafelków. */
export interface ZrodloMapy {
  /** adres: szerokość i długość geograficzna (`geo.c`) */
  c: LatLon;
  okolica: readonly Miejsce[];
  /** kafelki miasta; null: bez sieci, sama okolica */
  kafelki: KafelkiMiasta | null;
  /** filtr nazw dla punktów z kafelków (w grze `nazwaDoOkolicy`, ten sam co dla okolicy) */
  nazwa: (p: GeoPoi) => string;
}

/** Co okno dostaje przy otwarciu: dotyk, odczyt zarządu (stan co klatkę do przygaszania wybranych miejsc, wejście
    tylko do karty) i (od zadania 9) wysłanie wyprawy. */
export interface OtwarcieMapy {
  touch: boolean;
  st: () => GovState | null;
  wejscie: () => GovInput | null;
  onWyslij?: (m: Miejsce) => void;
}

/** Stan okna do testów w przeglądarce i zrzutów (`window.zm.mapa`). */
export interface StanMapy {
  otwarta: boolean;
  widok: Widok | null;
  z: number;
  rysunki: { z12: number; z14: number };
  wTrakcie: number;
  brak: number;
  miejsca: number;
  znaki: number;
  kropki: number;
  wybrane: string | null;
  napis: string;
}

/** Mapa miasta jednej gry: widok, pamięć rysunków kafelków i miejsca z kafelków zostają między otwarciami okna. */
export class MapaMiasta {
  widok: Widok | null = null;
  wybrane: string | null = null;
  private readonly zr: ZrodloMapy;
  private readonly rzutK: ReturnType<typeof rzutKafelkaZ>;
  /** rysunki kafelków, pobrania w toku i nieudane (bez ponawiania do następnego otwarcia okna) */
  private readonly pamiec = new PamiecKafelkow<Rysunek>();
  private readonly miejsca = new Map<string, Miejsce>();
  private lista: Miejsce[] = [];
  private z = 14;
  /** miejsca w widoku z ostatniej klatki (do trafiania) i ile narysowano znaków i kropek */
  private widoczne: Miejsce[] = [];
  private znaki = 0;
  private kropki = 0;
  // okno (tylko gdy otwarte)
  private el: HTMLElement | null = null;
  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stanEl: HTMLElement | null = null;
  private kartaEl: HTMLElement | null = null;
  private o: OtwarcieMapy | null = null;
  private obserwator: ResizeObserver | null = null;
  private klatka = 0;
  private szer = 0;
  private wys = 0;
  private dpr = 1;
  private palce = new Map<number, { x: number; y: number }>();
  private gest: { w: Widok; x: number; y: number; d: number; t: number; ruch: boolean; wiele: boolean } | null = null;
  private ostatniGladzik = -1e9;
  private znakiPamiec = new Map<string, HTMLCanvasElement>();
  /** zapas startowy miejsca po kluczu (z samego klucza i kategorii, więc raz na sesję) */
  private zapasy = new Map<string, number>();

  constructor(zr: ZrodloMapy) {
    this.zr = zr;
    this.rzutK = rzutKafelkaZ(zr.c[0], zr.c[1]);
    dolaczMiejsca(this.miejsca, zr.okolica);
    this.lista = [...this.miejsca.values()];
  }

  /** Podpina mapę do otwartego okna (element z `data-miasto` z `mapaMiastaSheet`) i rysuje to, co już ma. Nieudane
      wcześniej kafelki próbuje od nowa. */
  podepnij(el: HTMLElement, o: OtwarcieMapy): void {
    this.odepnij();
    const cv = el.querySelector<HTMLCanvasElement>('canvas');
    const ctx = cv?.getContext('2d') ?? null;
    if (!cv || !ctx) return;
    this.el = el;
    this.cv = cv;
    this.ctx = ctx;
    this.o = o;
    this.stanEl = el.querySelector<HTMLElement>('[data-miasto-stan]');
    this.kartaEl = el.querySelector<HTMLElement>('[data-miasto-karta]');
    this.pamiec.odNowa();
    cv.addEventListener('pointerdown', this.naDol);
    cv.addEventListener('pointermove', this.naRuch);
    cv.addEventListener('pointerup', this.naGore);
    cv.addEventListener('pointercancel', this.naGore);
    cv.addEventListener('wheel', this.naKolko, { passive: false });
    this.obserwator = new ResizeObserver(() => this.zmierz());
    this.obserwator.observe(el);
    this.zmierz();
    this.pokazKarte();
  }

  /** Odpina od okna (zamknięcie): słuchacze, obserwator i klatka znikają; pamięć kafelków i widok zostają. */
  odepnij(): void {
    const cv = this.cv;
    if (cv) {
      cv.removeEventListener('pointerdown', this.naDol);
      cv.removeEventListener('pointermove', this.naRuch);
      cv.removeEventListener('pointerup', this.naGore);
      cv.removeEventListener('pointercancel', this.naGore);
      cv.removeEventListener('wheel', this.naKolko);
    }
    this.obserwator?.disconnect();
    this.obserwator = null;
    if (this.klatka) cancelAnimationFrame(this.klatka);
    this.klatka = 0;
    this.el = this.cv = this.ctx = this.stanEl = this.kartaEl = null;
    this.o = null;
    this.palce.clear();
    this.gest = null;
  }

  /** Przyciski okna (`data-act`): przybliż, oddal, osiedle, zamknij kartę, wyślij wyprawę. True, gdy to akcja mapy. */
  obsluz(act: string, arg: string): boolean {
    const w = this.widok;
    if (act === 'miasto-blizej' && w) this.ustaw(przybliz(w, 1.6, this.szer / 2, this.wys / 2, this.szer, this.wys));
    else if (act === 'miasto-dalej' && w)
      this.ustaw(przybliz(w, 1 / 1.6, this.szer / 2, this.wys / 2, this.szer, this.wys));
    else if (act === 'miasto-dom') this.ustaw(this.domyslny());
    else if (act === 'miasto-karta-zamknij') this.wybierz(null);
    else if (act === 'wyslij') {
      const m = this.miejsca.get(arg);
      if (m && this.o?.onWyslij) this.o.onWyslij(m);
    } else return false;
    return true;
  }

  /** Ustawia widok (skala ucięta do zakresu) i rysuje od nowa. */
  ustaw(w: Widok): void {
    this.widok = { cx: w.cx, cy: w.cy, mNaPiksel: ogranicz(w.mNaPiksel, M_NA_PIKSEL_MIN, M_NA_PIKSEL_MAX) };
    this.brudny();
  }

  /** Wybiera miejsce (karta) albo zamyka kartę (null). */
  wybierz(klucz: string | null): void {
    this.wybrane = klucz && this.miejsca.has(klucz) ? klucz : null;
    this.pokazKarte();
    this.brudny();
  }

  /** Punkt na ekranie (clientX, clientY) dla miejsca o kluczu, gdy okno jest otwarte (do zrzutów). */
  naEkranie(klucz: string): [number, number] | null {
    const m = this.miejsca.get(klucz);
    if (!m || !this.cv || !this.widok) return null;
    const r = this.cv.getBoundingClientRect();
    const [px, py] = rzut(this.widok, this.szer, this.wys, m.x, m.y);
    return [r.left + px, r.top + py];
  }

  /** wszystkie znane miejsca (okolica i z kafelków), od najbliższego */
  miejscaMapy(): readonly Miejsce[] {
    return this.lista;
  }

  stan(): StanMapy {
    const p = this.pamiec;
    let z12 = 0;
    for (const r of p.rysunki.values()) if (r.z === 12) z12++;
    return {
      otwarta: !!this.el,
      widok: this.widok ? { ...this.widok } : null,
      z: this.z,
      rysunki: { z12, z14: p.rysunki.size - z12 },
      wTrakcie: p.wTrakcie.size,
      brak: p.nieudane.size,
      miejsca: this.miejsca.size,
      znaki: this.znaki,
      kropki: this.kropki,
      wybrane: this.wybrane,
      napis: this.stanEl?.hidden ? '' : (this.stanEl?.textContent ?? ''),
    };
  }

  // ------------------------------------------------ wewnętrzne

  /** widok na start: osiedle w środku, około 2 km w krótszym boku */
  private domyslny(): Widok {
    const bok = Math.max(1, Math.min(this.szer, this.wys));
    return { cx: 0, cy: 0, mNaPiksel: ogranicz(2000 / bok, 1, BUDYNKI_DO_M) };
  }

  private zmierz(): void {
    const el = this.el;
    const cv = this.cv;
    if (!el || !cv) return;
    const r = el.getBoundingClientRect();
    this.szer = Math.round(r.width);
    this.wys = Math.round(r.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(this.szer * this.dpr));
    cv.height = Math.max(1, Math.round(this.wys * this.dpr));
    if (!this.widok && this.szer && this.wys) this.widok = this.domyslny();
    this.brudny();
  }

  private brudny(): void {
    if (!this.el || this.klatka) return;
    this.klatka = requestAnimationFrame(() => {
      this.klatka = 0;
      this.rysuj();
    });
  }

  private pokazKarte(): void {
    const el = this.kartaEl;
    if (!el) return;
    const m = this.wybrane ? this.miejsca.get(this.wybrane) : undefined;
    const st = m ? this.o?.st() : null;
    const i = st ? this.o?.wejscie() : null;
    if (!m || !st || !i) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.innerHTML = kartaHtml(m, kartaMiejsca(m, st, i), !!this.o?.onWyslij);
    el.hidden = false;
  }

  private odswiezStan(): void {
    const el = this.stanEl;
    if (!el) return;
    let t = '';
    if (!this.zr.kafelki || this.pamiec.nieudane.size)
      t = L('Reszta miasta się nie wczytała.', 'The rest of the city didn’t load.');
    else if (this.pamiec.wTrakcie.size) t = L('Wczytuję mapę…', 'Loading the map…');
    else if (this.z === 12)
      t = L('Przybliżcie, żeby zobaczyć budynki i więcej miejsc.', 'Zoom in to see buildings and more places.');
    if (el.textContent !== t) el.textContent = t;
    el.hidden = !t;
  }

  /** zamawia brakujące kafelki widoku (decyzje w `PamiecKafelkow`) i zaczyna ich pobieranie */
  private zamow(): void {
    const w = this.widok;
    if (!w) return;
    const { z, kafelki } = kafelkiWidoku(this.zr.c, w, this.szer, this.wys);
    this.z = z;
    const k = this.zr.kafelki;
    if (!k) return;
    for (const [x, y, klucz] of this.pamiec.zamow(z, kafelki)) this.wczytaj(k, z, x, y, klucz);
  }

  private wczytaj(kafelki: KafelkiMiasta, z: number, x: number, y: number, k: string): void {
    void kafelki.daj(z, x, y).then((T) => {
      let r: Rysunek | null = null;
      try {
        if (T) {
          r = rysunekKafelka(T, this.rzutK);
          if (z === 14 && dolaczMiejsca(this.miejsca, miejscaZPoi(poiZKafelkow([T], this.zr.c), this.zr.nazwa)))
            this.lista = [...this.miejsca.values()].sort((p, q) => p.odl - q.odl);
        }
      } catch {
        r = null;
      }
      this.pamiec.przyszedl(k, r);
      // zdekodowany kafelek nie jest już potrzebny: zostaje rysunek i miejsca
      kafelki.zapomnij(z, x, y);
      this.odswiezStan();
      this.brudny();
    });
  }

  private rysuj(): void {
    const ctx = this.ctx;
    const w = this.widok;
    const { szer, wys, dpr } = this;
    if (!ctx || !w || !szer || !wys) return;
    this.zamow();
    this.odswiezStan();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css(LAD);
    ctx.fillRect(0, 0, szer, wys);
    const [vx0, vy0] = odwrotnie(w, szer, wys, 0, 0);
    const [vx1, vy1] = odwrotnie(w, szer, wys, szer, wys);
    const widac = (r: Rysunek) => {
      // bufor kafelka (cechy wychodzą za jego brzeg) to kilka procent boku
      const b = (r.x1 - r.x0) * 0.1;
      return r.x1 + b >= vx0 && r.x0 - b <= vx1 && r.y1 + b >= vy0 && r.y0 - b <= vy1;
    };
    const tlo: Rysunek[] = [];
    const blisko: Rysunek[] = [];
    for (const r of this.pamiec.rysunki.values()) if (widac(r)) (r.z === 14 ? blisko : tlo).push(r);
    const s = dpr / w.mNaPiksel;
    ctx.setTransform(s, 0, 0, s, (dpr * szer) / 2 - w.cx * s, (dpr * wys) / 2 - w.cy * s);
    // tło z=12 tylko tam, gdzie nie ma kafelka z=14: uogólnione drogi i woda nie dublują się z dokładnymi
    if (tlo.length) {
      ctx.save();
      if (blisko.length) {
        const maska = new Path2D();
        maska.rect(vx0 - 10, vy0 - 10, vx1 - vx0 + 20, vy1 - vy0 + 20);
        for (const r of blisko) maska.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        ctx.clip(maska, 'evenodd');
      }
      this.warstwy(ctx, tlo, w.mNaPiksel);
      ctx.restore();
    }
    this.warstwy(ctx, blisko, w.mNaPiksel);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zasieg(ctx, w);
    this.znakiMiejsc(ctx, w);
  }

  /** pola i linie rysunków po rodzajach (wszystkie kafelki jednego rodzaju, potem następny), w metrach */
  private warstwy(ctx: CanvasRenderingContext2D, rys: readonly Rysunek[], m: number): void {
    for (const k of KOLEJNOSC_POL) {
      if (k === 'budynek' && m > BUDYNKI_DO_M) continue;
      ctx.fillStyle = KOLOR_POLA[k];
      for (const r of rys) {
        const p = r.pola[k];
        if (p) ctx.fill(p);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const l of LINIE) {
      if (m > l.doM) continue;
      ctx.strokeStyle = l.kolor;
      ctx.lineWidth = Math.max(l.m, l.px * m);
      for (const r of rys) {
        const p = r.linie[l.k];
        if (p) ctx.stroke(p);
      }
    }
  }

  /** zasięg dziennej wyprawy: przerywane koło MAX_DROGA_M wokół adresu z podpisem */
  private zasieg(ctx: CanvasRenderingContext2D, w: Widok): void {
    const [ox, oy] = rzut(w, this.szer, this.wys, 0, 0);
    const rd = MAX_DROGA_M / w.mNaPiksel;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgb(231 228 220 / 0.55)';
    ctx.beginPath();
    ctx.arc(ox, oy, rd, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    this.napis(ctx, `${MAX_DROGA_M / 1000} km`, ox, oy - rd + 4);
  }

  /** osiedle gracza: koło mapy lokalnej, przyciemnione wnętrze i obwódka w kolorze lampy */
  private osiedle(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: Widok): void {
    ctx.beginPath();
    ctx.arc(ox, oy, PROMIEN_MAPY_LOKALNEJ / w.mNaPiksel, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(230 165 64 / 0.16)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = LAMPA;
    ctx.stroke();
  }

  /** czy z miejsca wyniesiono już wszystko (albo było puste od lat): taki znak jest przygaszony */
  private wybraneDoCna(m: Miejsce, st: GovState | null): boolean {
    let z = this.zapasy.get(m.klucz);
    if (z === undefined) {
      z = celZMiejsca(m).zapas ?? 0;
      this.zapasy.set(m.klucz, z);
    }
    return (st?.miasto?.zabrano[m.klucz] ?? 0) >= z;
  }

  private napis(ctx: CanvasRenderingContext2D, t: string, x: number, y: number): void {
    if (x < -50 || y < -20 || x > this.szer + 50 || y > this.wys + 20) return;
    ctx.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgb(16 22 34 / 0.9)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = css(C.line);
    ctx.fillText(t, x, y);
  }

  /** znak ikony jako mały obraz (raz na ikonę i gęstość pikseli) */
  private obrazZnaku(ik: Ikona): HTMLCanvasElement {
    const k = `${ik.tlo}${ik.znak}${ik.wzor.join('')}${this.dpr}`;
    let c = this.znakiPamiec.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    const s = Math.round(KRATKA_PX * this.dpr);
    c.width = c.height = 9 * s;
    const g = c.getContext('2d')!;
    g.fillStyle = CIEMNY;
    g.fillRect(0, 0, 9 * s, 9 * s);
    g.fillStyle = ik.tlo;
    g.fillRect(s, s, 7 * s, 7 * s);
    g.fillStyle = ik.znak;
    ik.wzor.forEach((wiersz, r) => {
      for (let q = 0; q < 7; q++) if (wiersz[q] === '#') g.fillRect(s + q * s, s + r * s, s, s);
    });
    this.znakiPamiec.set(k, c);
    return c;
  }

  /** Znaki miejsc w widoku: najpierw wybrane, potem cele wypraw od najbliższego, na końcu miejsca z mapy osiedla. Znak,
      który zachodziłby na już narysowany, staje się kropką w kolorze kategorii (z daleka, powyżej BUDYNKI_DO_M, znika),
      a miejsca z mapy osiedla znikają, gdy jej koło jest mniejsze niż OSIEDLE_PX. Miejsca z mapy osiedla i wybrane
      do cna są przygaszone. Kolejno: kropki, koło osiedla, znaki, siedziba na wierzchu. Trafiać można tylko
      w narysowane. */
  private znakiMiejsc(ctx: CanvasRenderingContext2D, w: Widok): void {
    const { szer, wys } = this;
    const pol = ZNAK_PX / 2;
    const st = this.o?.st() ?? null;
    const lokalneWidac = PROMIEN_MAPY_LOKALNEJ / w.mNaPiksel >= OSIEDLE_PX;
    const kropkiWidac = w.mNaPiksel <= BUDYNKI_DO_M;
    const widoczne: { m: Miejsce; px: number; py: number; lok: boolean }[] = [];
    for (const m of this.lista) {
      const [px, py] = rzut(w, szer, wys, m.x, m.y);
      if (px < -pol || py < -pol || px > szer + pol || py > wys + pol) continue;
      const lok = naMapieLokalnej(m);
      if (lok && !lokalneWidac) continue;
      widoczne.push({ m, px, py, lok });
    }
    widoczne.sort(
      (p, q) =>
        Number(q.m.klucz === this.wybrane) - Number(p.m.klucz === this.wybrane) ||
        Number(p.lok) - Number(q.lok) ||
        p.m.odl - q.m.odl,
    );
    const KOM = ZNAK_PX + 2;
    const siatka = new Map<string, [number, number][]>();
    const zajmij = (px: number, py: number) => {
      const k = `${Math.floor(px / KOM)},${Math.floor(py / KOM)}`;
      const l = siatka.get(k);
      if (l) l.push([px, py]);
      else siatka.set(k, [[px, py]]);
    };
    const wolne = (px: number, py: number) => {
      const gx = Math.floor(px / KOM);
      const gy = Math.floor(py / KOM);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          for (const [x, y] of siatka.get(`${gx + dx},${gy + dy}`) ?? [])
            if (Math.abs(x - px) < KOM && Math.abs(y - py) < KOM) return false;
      return true;
    };
    // siedziba zajmuje swoje miejsce jako pierwsza
    const [ox, oy] = rzut(w, szer, wys, 0, 0);
    zajmij(ox, oy);
    const znaki: (typeof widoczne)[number][] = [];
    const kropki: (typeof widoczne)[number][] = [];
    for (const v of widoczne) {
      if (wolne(v.px, v.py)) {
        znaki.push(v);
        zajmij(v.px, v.py);
      } else if (kropkiWidac) kropki.push(v);
    }
    const przygas = (v: (typeof widoczne)[number]) => v.lok || this.wybraneDoCna(v.m, st);
    for (const v of kropki) {
      ctx.globalAlpha = przygas(v) ? 0.45 : 0.95;
      ctx.fillStyle = CIEMNY;
      ctx.fillRect(Math.round(v.px) - 3, Math.round(v.py) - 3, 6, 6);
      ctx.fillStyle = ikonaKategorii(v.m.kat).tlo;
      ctx.fillRect(Math.round(v.px) - 2, Math.round(v.py) - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    this.osiedle(ctx, ox, oy, w);
    // od końca: najważniejsze na wierzchu (i tak na siebie nie zachodzą)
    for (let k = znaki.length - 1; k >= 0; k--) {
      const v = znaki[k];
      ctx.globalAlpha = przygas(v) ? 0.5 : 1;
      ctx.drawImage(
        this.obrazZnaku(ikonaKategorii(v.m.kat)),
        Math.round(v.px - pol),
        Math.round(v.py - pol),
        ZNAK_PX,
        ZNAK_PX,
      );
      if (v.m.klucz === this.wybrane) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = LAMPA;
        ctx.strokeRect(Math.round(v.px - pol) - 2, Math.round(v.py - pol) - 2, ZNAK_PX + 4, ZNAK_PX + 4);
      }
    }
    ctx.globalAlpha = 1;
    this.widoczne = [...znaki, ...kropki].map((v) => v.m);
    this.znaki = znaki.length;
    this.kropki = kropki.length;
    const d = ZNAK_PX + 4;
    ctx.drawImage(this.obrazZnaku(SIEDZIBA), Math.round(ox - d / 2), Math.round(oy - d / 2), d, d);
    this.napis(ctx, L('Siedziba', 'HQ'), ox, oy + d / 2 + 2);
  }

  // ------------------------------------------------ mysz i palce

  private pozycja(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.cv!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** gest od nowa z palcami, które są teraz na płótnie (ruch i wiele palców przechodzą dalej) */
  private zacznijGest(t: number): void {
    const pts = [...this.palce.values()];
    if (!pts.length || !this.widok) {
      this.gest = null;
      return;
    }
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const d = pts.length > 1 ? Math.sqrt((pts[0].x - pts[1].x) ** 2 + (pts[0].y - pts[1].y) ** 2) : 0;
    this.gest = {
      w: { ...this.widok },
      x: mx,
      y: my,
      d,
      t,
      ruch: this.gest?.ruch ?? false,
      wiele: (this.gest?.wiele ?? false) || pts.length > 1,
    };
  }

  private naDol = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.cv?.setPointerCapture?.(e.pointerId);
    this.palce.set(e.pointerId, this.pozycja(e));
    this.zacznijGest(e.timeStamp);
  };

  private naRuch = (e: PointerEvent): void => {
    if (!this.palce.has(e.pointerId)) return;
    this.palce.set(e.pointerId, this.pozycja(e));
    const g = this.gest;
    if (!g) return;
    const pts = [...this.palce.values()];
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let w = g.w;
    if (pts.length > 1 && g.d > 0) {
      const d = Math.sqrt((pts[0].x - pts[1].x) ** 2 + (pts[0].y - pts[1].y) ** 2);
      w = przybliz(w, d / g.d, g.x, g.y, this.szer, this.wys);
    }
    if (!g.ruch && (Math.abs(mx - g.x) > STUK_PX || Math.abs(my - g.y) > STUK_PX || pts.length > 1)) g.ruch = true;
    if (!g.ruch) return;
    this.widok = { ...w, cx: w.cx - (mx - g.x) * w.mNaPiksel, cy: w.cy - (my - g.y) * w.mNaPiksel };
    this.brudny();
  };

  private naGore = (e: PointerEvent): void => {
    if (!this.palce.has(e.pointerId)) return;
    const p = this.pozycja(e);
    this.palce.delete(e.pointerId);
    const g = this.gest;
    if (this.palce.size) {
      this.zacznijGest(e.timeStamp);
      return;
    }
    this.gest = null;
    if (!g || g.ruch || g.wiele || e.type === 'pointercancel' || e.timeStamp - g.t > STUK_MS) return;
    this.stuk(p.x, p.y);
  };

  private naKolko = (e: WheelEvent): void => {
    e.preventDefault();
    const w = this.widok;
    if (!w) return;
    const now = performance.now();
    const rodzaj = wheelKind(e, now, this.ostatniGladzik);
    if (rodzaj === 'pan') {
      this.ostatniGladzik = now;
      this.widok = { ...w, cx: w.cx + e.deltaX * w.mNaPiksel, cy: w.cy + e.deltaY * w.mNaPiksel };
    } else {
      const p = this.pozycja(e);
      this.widok = przybliz(w, zoomFactor(rodzaj, e), p.x, p.y, this.szer, this.wys);
    }
    this.brudny();
  };

  private stuk(px: number, py: number): void {
    const w = this.widok;
    if (!w) return;
    const r = this.o?.touch ? TRAFIENIE_PX.dotyk : TRAFIENIE_PX.mysz;
    const m = trafiony(this.widoczne, w, this.szer, this.wys, px, py, r);
    this.wybierz(m?.klucz ?? null);
  }
}
