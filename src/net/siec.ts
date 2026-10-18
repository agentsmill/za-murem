/* Gra sieciowa w grze, etap 2 (docs/superpowers/specs/2026-10-18-multiplayer-design.md, sekcja „Etap 2”): czyste
   funkcje bez DOM. Start zalogowanej drużyny na adresie, start bez domu, dojście do nowej siedziby, znaczniki
   zajętych klatek i klatka pod kursorem. Sieć dostają przez wstrzyknięte API (ApiSieci, w grze utworzApi), więc
   testy w Node puszczają cały przepływ na udawanym serwerze.

   Wersja minimalna (noc z 17 na 18.10.2026): symulacja się nie zmienia. Zajęte klatki wchodzą do gry tylko jako
   jawne wejście startu:
   - świat dostaje listę budynków z cudzymi klatkami (opcja bezSiedziby w buildWorld), więc przy zajętej klatce pod
     adresem siedzibą zostaje najbliższy wolny budynek mieszkalny, deterministycznie; lista trafia do zapisu (StanSieci),
     żeby wczytanie zbudowało ten sam świat,
   - drużyna bez domu zaczyna na ulicy przed drzwiami utraconej klatki (postawNaUlicy zmienia pozycje pionków
     zarządu w stanie przed new Sim; losowania i reszta stanu bez zmian),
   - klatkę nowej siedziby gra zajmuje na serwerze, kiedy ktoś z zarządu dojdzie do jej drzwi (naProgu). Gdy w tym
     czasie zajęła ją inna drużyna, gra zaczyna od nowa z kolejnym budynkiem na liście (sessionStorage i przeładowanie).
   Cudze klatki to tylko znaczniki na mapie; „Zajmij klatkę” na innym budynku zajmuje ją na serwerze bez skutków
   w symulacji (dom drużyny jako lista drzwi zostaje na później).

   Napisy dla gracza (komunikat startu, cele drużyny bez domu) są w bieżącym języku z chwili wywołania
   (src/core/jezyk.ts), a komunikaty serwera przechodzą przez komunikatBledu z src/net/api.ts (po polsku dokładnie
   takie, jakie przyszły). */

import { L } from '../core/jezyk.ts';
import { nearestFree } from '../sim/path.ts';
import type { SimState } from '../sim/sim.ts';
import {
  type Klatka,
  klatkiBudynku,
  kluczBudynku,
  kluczWejscia,
  type LatLon,
  nrKlatki,
  pikselWejscia,
  pozycjaNaMapie,
  prostokatMapy,
} from '../world/klucze.ts';
import type { World } from '../world/world.ts';
import { komunikatBledu, type Wynik } from './api.ts';
import type { ListaKlatek, Prostokat, ZajetaKlatka, ZajetaOdpowiedz, ZajmijKlatke } from './protokol.ts';

/** stan gry sieciowej w zapisie gry (Save.siec) */
export interface StanSieci {
  /** klucze budynków, które nie mogą być siedzibą (z cudzymi klatkami przy starcie); opcja bezSiedziby świata */
  zajete: string[];
  /** klatka siedziby jest nasza na serwerze; false: drużyna bez domu idzie do nowej siedziby */
  dom: boolean;
  /** budynek pod adresem, w którym ktoś zajął naszą klatkę (przed jego drzwiami drużyna zaczyna) */
  utracony?: string;
  /** nick konta, które zaczęło grę (na innym koncie gra toczy się bez sieci) */
  konto?: string;
  /** wersja zapisu w chmurze, którą ta gra ostatnio wysłała (następny zapis idzie od niej) */
  wersja?: number;
}

/** to, czego przepływ startu potrzebuje od serwera (w grze utworzApi z src/net/api.ts) */
export interface ApiSieci {
  zajete(p: Prostokat): Promise<Wynik<ListaKlatek>>;
  zajmij(k: ZajmijKlatke): Promise<Wynik<ZajetaOdpowiedz>>;
  zwolnijWszystkie(): Promise<Wynik<undefined>>;
}

/** klatka do zajęcia w postaci dla serwera */
export const doZajecia = (k: Klatka): ZajmijKlatke => ({ klucz: k.klucz, budynek: k.budynek, lat: k.lat, lon: k.lon });

/** Klatka siedziby: ta, do której prowadzą pierwsze drzwi siedziby (zarząd mieszka przy nich); siedziba bez drzwi
    bierze pierwszą klatkę. Null, gdy świat nie ma kluczy (demo, zapis sprzed kluczy). */
export function klatkaSiedziby(w: World, srodek: LatLon): Klatka | null {
  const b = w.buildings[w.hq];
  if (!b) return null;
  const klatki = klatkiBudynku(b);
  const e = b.entrances[0];
  const k = e ? kluczWejscia(w, b, e, srodek) : null;
  return klatki.find((x) => x.klucz === k) ?? klatki[0] ?? null;
}

/** Klatka pod kafelkiem: drzwi budynku (kafelek drzwi albo przed nimi) albo dowolny kafelek budynku (klatka z rzutu
    na oś). Null poza budynkami i w świecie bez kluczy. */
export function klatkaPod(w: World, srodek: LatLon, tile: number): Klatka | null {
  for (const b of w.buildings)
    for (const e of b.entrances)
      if (e.tile === tile || e.out === tile) {
        const k = kluczWejscia(w, b, e, srodek);
        return klatkiBudynku(b).find((x) => x.klucz === k) ?? null;
      }
  const id = w.bid[tile];
  const b = id >= 0 ? w.buildings[id] : undefined;
  if (!b) return null;
  const nr = nrKlatki(b, pikselWejscia(w, { tile, out: tile, dir: 'S' }, srodek));
  return klatkiBudynku(b).find((x) => x.nr === nr) ?? null;
}

/** klucze budynków z cudzymi klatkami, posortowane (do opcji bezSiedziby) */
export const budynkiObcych = (lista: readonly ZajetaKlatka[]): string[] =>
  [...new Set(lista.filter((k) => !k.moja).map((k) => k.budynek))].sort();

/** wynik startu; komunikat w bieżącym języku */
export type WynikStartu =
  | { ok: true; stan: StanSieci; swiat: World; klatki: ZajetaKlatka[]; komunikat: string }
  | { ok: false; komunikat: string };

/**
 * Start zalogowanej drużyny na adresie. zbuduj(bez) buduje świat z listą budynków, które nie mogą być siedzibą
 * (bez: [] to świat bez wykluczeń). Nowa gra zwalnia najpierw stare klatki konta. Klatka pod adresem wolna: zajmujemy ją
 * i drużyna zaczyna w siedzibie jak dziś. Zajęta (na liście z serwera albo 409 przy zajmowaniu): świat bez budynków
 * z cudzymi klatkami, siedzibą zostaje najbliższy wolny mieszkalny, a drużyna zaczyna bez domu. Błąd sieci albo
 * inny błąd serwera: ok false (gra rusza bez sieci). Świat bez kluczy: zwykły start bez zajmowania.
 */
export async function startSieci(
  api: ApiSieci,
  zbuduj: (bez: string[]) => World,
  srodek: LatLon,
): Promise<WynikStartu> {
  let swiat = zbuduj([]);
  const k0 = klatkaSiedziby(swiat, srodek);
  if (!k0)
    return {
      ok: false,
      komunikat: L(
        'To osiedle nie ma kluczy klatek, więc gramy bez sieci.',
        'This estate’s map has no stairwell IDs, so the game runs offline.',
      ),
    };
  const zwolnione = await api.zwolnijWszystkie();
  if (!zwolnione.ok) return { ok: false, komunikat: komunikatBledu(zwolnione) };
  const lista = await api.zajete(prostokatMapy(swiat, srodek));
  if (!lista.ok) return { ok: false, komunikat: komunikatBledu(lista) };
  let klatki = lista.dane.klatki;
  if (!klatki.some((k) => k.klucz === k0.klucz)) {
    const r = await api.zajmij(doZajecia(k0));
    if (r.ok) {
      klatki = [...klatki.filter((k) => k.klucz !== k0.klucz), r.dane.klatka];
      return {
        ok: true,
        stan: { zajete: [], dom: true },
        swiat,
        klatki,
        komunikat: L('Wasza klatka była wolna. Jest wasza.', 'Your stairwell was free. It’s yours now.'),
      };
    }
    if (r.blad !== 'zajeta') return { ok: false, komunikat: komunikatBledu(r) };
    klatki = [...klatki, { ...doZajecia(k0), moja: false }];
  }
  // ktoś już zajął naszą klatkę: siedzibą zostaje najbliższy budynek mieszkalny bez cudzych klatek
  const zajete = [...new Set([...budynkiObcych(klatki), k0.budynek])].sort();
  swiat = zbuduj(zajete);
  return {
    ok: true,
    stan: { zajete, dom: false, utracony: k0.budynek },
    swiat,
    klatki,
    komunikat: L(
      'Ktoś już zajął waszą klatkę. Zaczynacie na ulicy: dojdźcie do drzwi wolnej klatki, zanim zapadnie noc.',
      'Someone has already taken your stairwell. You start out on the street: get to the door of a free stairwell before nightfall.',
    ),
  };
}

/** kafelek startu drużyny bez domu: przed drzwiami utraconej klatki, a bez nich wolny kafelek przy środku mapy */
export function kafelekUlicy(w: World, utracony?: string): number {
  const b = utracony ? w.buildings.find((x) => kluczBudynku(x) === utracony) : undefined;
  const srodek = Math.floor(w.size / 2) * w.size + Math.floor(w.size / 2);
  return nearestFree(w.blocked, w.size, b?.entrances[0]?.out ?? srodek);
}

/** Zarząd na ulicy: pionki zarządu na kolejnych wolnych kafelkach wokół kafelka startu (szukanie wszerz, jak
    nearestFree), z czystą drogą i bez pracy. Zmienia stan przed new Sim; nic nie losuje. */
export function postawNaUlicy(st: SimState, w: World, start: number): void {
  const size = w.size;
  const wolne: number[] = [];
  const seen = new Uint8Array(size * size);
  const q = [start];
  seen[start] = 1;
  const potrzeba = st.pawns.filter((p) => p.kind === 'core').length;
  for (let qi = 0; qi < q.length && wolne.length < potrzeba; qi++) {
    const c = q[qi];
    if (!w.blocked[c]) wolne.push(c);
    const x = c % size;
    const y = (c - x) / size;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      // przez ściany nie szukamy: tylko wolne kafelki przy starcie
      if (seen[n] || w.blocked[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  let k = 0;
  for (const p of st.pawns) {
    if (p.kind !== 'core') continue;
    const t = wolne[k++] ?? start;
    p.x = (t % size) + 0.5;
    p.y = Math.floor(t / size) + 0.5;
    p.path = [];
    p.pi = 0;
    p.want = -1;
    p.job = null;
  }
}

/** czy ktoś z zarządu doszedł do siedziby: stoi w niej, na kafelku jej drzwi albo tuż przed nimi */
export function naProgu(st: SimState, w: World): boolean {
  const e = w.buildings[w.hq]?.entrances[0];
  const ex = e ? (e.out % w.size) + 0.5 : -99;
  const ey = e ? Math.floor(e.out / w.size) + 0.5 : -99;
  return st.pawns.some((p) => {
    if (p.kind !== 'core' || p.away) return false;
    const i = Math.floor(p.y) * w.size + Math.floor(p.x);
    return w.bid[i] === w.hq || (!!e && (i === e.tile || i === e.out || Math.hypot(p.x - ex, p.y - ey) < 1.6));
  });
}

export type RodzajZnacznika = 'obca' | 'nasza' | 'cel';
export interface Znacznik {
  klucz: string;
  /** miejsce na mapie w kafelkach (środek klatki na osi budynku) */
  x: number;
  y: number;
  rodzaj: RodzajZnacznika;
}

/** drzwi świata według klucza klatki: środek kafelka przed pierwszymi drzwiami tej klatki (znaczniki stoją przy
    drzwiach, a klatka bez drzwi w tym świecie dostaje znacznik na środku swojego odcinka osi) */
export function drzwiKlatek(w: World, srodek: LatLon): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const b of w.buildings)
    for (const e of b.entrances) {
      const k = kluczWejscia(w, b, e, srodek);
      if (k && !out.has(k)) out.set(k, [(e.out % w.size) + 0.5, Math.floor(e.out / w.size) + 0.5]);
    }
  return out;
}

/** drzwi (kafelki wejść) klatek zajętych przez inne drużyny, rosnąco: dla symulacji (polecenie zajete, M2 fala 2),
    która trzyma je zamknięte na stałe razem z tym, co za nimi */
export function drzwiObcych(w: World, srodek: LatLon, klatki: readonly ZajetaKlatka[]): number[] {
  const obce = new Set(klatki.filter((k) => !k.moja).map((k) => k.klucz));
  const out: number[] = [];
  if (!obce.size) return out;
  for (const b of w.buildings)
    for (const e of b.entrances) {
      const k = kluczWejscia(w, b, e, srodek);
      if (k && obce.has(k)) out.push(e.tile);
    }
  return out.sort((a, b) => a - b);
}

/** Znaczniki klatek na mapie: cudze (obca), nasze (nasza) i cel drużyny bez domu (klatka nowej siedziby); przy
    drzwiach klatki, kiedy świat je ma (drzwi), inaczej na środku klatki; tylko na mapie i tuż przy niej (20 m). */
export function znaczniki(
  w: Pick<World, 'size' | 'angle'>,
  srodek: LatLon,
  klatki: readonly ZajetaKlatka[],
  cel: Klatka | null,
  drzwi: ReadonlyMap<string, [number, number]> = new Map(),
): Znacznik[] {
  const out: Znacznik[] = [];
  const dodaj = (klucz: string, lat: number, lon: number, rodzaj: RodzajZnacznika) => {
    const [x, y] = drzwi.get(klucz) ?? pozycjaNaMapie(w, srodek, lat, lon);
    if (x < -20 || y < -20 || x > w.size + 20 || y > w.size + 20) return;
    out.push({ klucz, x, y, rodzaj });
  };
  for (const k of klatki) dodaj(k.klucz, k.lat, k.lon, k.moja ? 'nasza' : 'obca');
  if (cel && !klatki.some((k) => k.klucz === cel.klucz)) dodaj(cel.klucz, cel.lat, cel.lon, 'cel');
  return out;
}

/** cele dnia drużyny bez domu (w kształcie celów z src/ui/cele.ts), w bieżącym języku */
export function celeBezDomu(zaznaczeni: boolean, touch: boolean): { text: string; how: string; done: boolean }[] {
  return [
    {
      text: L('Zaznaczcie kogoś z zarządu.', 'Select someone from the board.'),
      how: touch
        ? L('Stuknijcie kogoś z waszych ludzi na ulicy.', 'Tap one of your people on the street.')
        : L('Kliknijcie kogoś z waszych ludzi na ulicy.', 'Click one of your people on the street.'),
      done: zaznaczeni,
    },
    {
      text: L(
        'Dojdźcie do drzwi wolnej klatki, zanim zapadnie noc.',
        'Get to the door of a free stairwell before nightfall.',
      ),
      how: touch
        ? L(
            'Stuknijcie drzwi przy znaczniku „wolna klatka”. Kiedy ktoś tam stanie, klatka jest wasza.',
            'Tap the door by the “free stairwell” marker. Once someone stands there, the stairwell is yours.',
          )
        : L(
            'Prawy przycisk przy drzwiach ze znacznikiem „wolna klatka”. Kiedy ktoś tam stanie, klatka jest wasza.',
            'Right-click the door with the “free stairwell” marker. Once someone stands there, the stairwell is yours.',
          ),
      done: false,
    },
  ];
}
