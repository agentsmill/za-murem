/* Gracz-bot mapy miasta (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Wyprawa”, „Włączenie, boty i stare
   zapisy”): za dnia wysyła dwie osoby z zarządu do miejsca z okolicy (`GovInput.okolica`) przez `wyslijWyprawe`, tak jak
   gracz z okna mapy miasta. Wzorzec wyboru celu to bot 0.3 (tools/bot-v03.ts): kategoria według braku, najbliższy
   niewyczerpany punkt tej kategorii. Tu:
   - kategoria: jedzenie poniżej dwóch porcji na osobę to sklep spożywczy (`spozywczy`), drewno poniżej 4 to stacja
     (`stacja`), bez braków co trzeci dzień szkoła (`szkola`); jedna kategoria naraz, w tej kolejności;
   - miejsce: najbliższe niewyczerpane (`zostaloZMiejsca`) poza mapą lokalną (`naMapieLokalnej`, 192 m) i najdalej
     2000 m od adresu; przy równej odległości mniejszy klucz;
   - osoby: dwie z największym zdrowiem spośród tych, które przejdą `powodOdmowy` (na miejscu, nieugryzione, zdolne
     do drogi `canGo`);
   - kiedy: od dnia 2 (dzień 1 to samouczek i pierwszy wieczór, jak w botach fal 1 i 2 M2), od 7:00 do 16:59 (powrót przed
     zmrokiem, wyprawa ruszająca po 17:00 wracałaby w ciemności), jedna wyprawa naraz, nigdy gdy czeka karta nocy; szkoła
     najwyżej raz w dzień szkoły;
   - bez stanu miasta (`GovState.miasto`) gracz nic nie robi, więc bot bez opcji `miasto` gra jak przed mapą miasta.

   Wpina się w `playWithGov` przez `PlayOpts.miasto` (`krok` co sekundę przy ekranie po oknach zarządu, `po` z skutkami
   każdego kroku zarządu, żeby zliczyć powroty). `krok` nie stosuje skutków sam: wysłanie oddaje je przez `zastosuj`,
   bo osoby muszą wyjść bramą w symulacji.

   Log (`MiastoLog`): liczba wypraw, łup z powrotów (skutki zapasów kroku zarządu, w którym ktoś wrócił: łup z miejsca
   z ewentualnym znaleziskiem), ranni (osoby z utratą zdrowia przy powrocie; w trybie zombie ugryzieni też), ugryzieni
   i największa odległość wysłanej wyprawy w metrach dla każdego dnia (`maxOdl[dzień - 1]`, 0 bez wypraw). `wysylki` to
   każde wyjście z dniem, godziną, kategorią, kluczem, odległością i osobami (do testów i raportu). Bez Math.hypot,
   sin i cos. Używają go testy i tools/bot.ts z flagą --miasto. */

import { powodOdmowy, wyslijWyprawe } from '../../src/gov/dzienne.ts';
import type { GovEffects, GovInput, GovState, StockDelta } from '../../src/gov/typy.ts';
import { STOCK_KEYS, zeroStock } from '../../src/gov/wspolne.ts';
import { type Cel, celZMiejsca, zostaloZMiejsca } from '../../src/gov/wyprawy.ts';
import { nazwaDoOkolicy } from '../../src/mieszkancy/kronika.ts';
import type { Geo } from '../../src/world/geo.ts';
import { type Miejsce, miejscaZPoi, naMapieLokalnej, uzupelnijKlucze } from '../../src/world/miasto.ts';

/** wyprawy od tego dnia (dzień 1 to samouczek) */
const OD_DNIA = 2;
/** wyjście najwcześniej o tej godzinie i najpóźniej przed tą (powrót przed zmrokiem) */
const OD_GODZINY = 7;
const DO_GODZINY = 17;
/** ile osób wychodzi na jedną wyprawę */
const OSOB = 2;
/** miejsca dalej niż tyle metrów od adresu bot pomija (gra dopuszcza 5000 m) */
const MAX_ODL_BOTA_M = 2000;
/** jedzenie poniżej tylu porcji na osobę to brak jedzenia, drewno poniżej tylu sztuk to brak opału, szkoła co tyle dni */
const MIN_JEDZENIA_NA_OSOBE = 2;
const MIN_DREWNA = 4;
const CO_ILE_DNI_SZKOLA = 3;

export interface MiastoLog {
  /** wysłane wyprawy */
  wyprawy: number;
  /** łup z powrotów po rodzajach (zapasy zarządu) */
  lup: StockDelta;
  /** ranni z wypraw (w tym ugryzieni) i ugryzieni */
  ranni: number;
  ugryzieni: number;
  /** największa odległość wysłanej wyprawy w metrach, dla każdego dnia od 1 (`maxOdl[dzień - 1]`), 0 bez wypraw */
  maxOdl: number[];
}

/** jedno wyjście na wyprawę */
export interface Wysylka {
  dzien: number;
  godzina: number;
  kat: string;
  klucz: string;
  odl: number;
  ids: string[];
}

/** Miejsca z okolicy dla `GovInput.okolica` jak w grze (`main.ts`), ale dla demo bez kluczy `k` w `geo.poi`: klucze
    z położenia (`uzupelnijKlucze`) na kopii, nazwy bez tabel mieszkańców (`nazwaDoOkolicy(null)`, same kategorie).
    Wejścia nie zmienia. */
export function okolicaZGeo(geo: Pick<Geo, 'c' | 'poi'>): Miejsce[] {
  const kopia = structuredClone({ c: geo.c, poi: geo.poi });
  uzupelnijKlucze(kopia);
  return miejscaZPoi(kopia.poi, nazwaDoOkolicy(null));
}

/** Czego brakuje najbardziej: `spozywczy` (jedzenie poniżej dwóch porcji na osobę), `stacja` (drewno poniżej 4),
    `szkola` (co trzeci dzień) albo null. Kolejność jak w bocie 0.3. */
export function kategoriaBraku(i: Pick<GovInput, 'stock' | 'people' | 'day'>): string | null {
  if (i.stock.supplies < i.people.length * MIN_JEDZENIA_NA_OSOBE) return 'spozywczy';
  if (i.stock.wood < MIN_DREWNA) return 'stacja';
  return i.day % CO_ILE_DNI_SZKOLA === 0 ? 'szkola' : null;
}

/** Najbliższe niewyczerpane miejsce kategorii `kat` z `i.okolica`: poza mapą lokalną, najdalej `MAX_ODL_BOTA_M`, z czymś
    jeszcze w zapasie. Przy równej odległości mniejszy klucz. Null, gdy takiego nie ma. */
export function najblizszeMiejsce(gov: GovState, i: Pick<GovInput, 'okolica'>, kat: string): Cel | null {
  let najlepsze: Miejsce | null = null;
  for (const m of i.okolica ?? []) {
    if (m.kat !== kat || naMapieLokalnej(m) || m.odl > MAX_ODL_BOTA_M) continue;
    if (najlepsze && (m.odl > najlepsze.odl || (m.odl === najlepsze.odl && m.klucz >= najlepsze.klucz))) continue;
    if (zostaloZMiejsca(gov, celZMiejsca(m)) <= 0) continue;
    najlepsze = m;
  }
  return najlepsze ? celZMiejsca(najlepsze) : null;
}

/** Id dwóch osób z największym zdrowiem (przy remisie wcześniejsze id), które przejdą wszystkie zasady wysyłki; krótsza
    lista, gdy chętnych jest mniej. */
function najzdrowsi(gov: GovState, i: GovInput, cel: Cel): string[] {
  return i.people
    .filter((p) => !powodOdmowy(gov, i, cel, [p.id]))
    .sort((a, b) => b.needs.health - a.needs.health || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, OSOB)
    .map((p) => p.id);
}

export interface GraczMiasta {
  /** raz na sekundę przy ekranie, po oknach zarządu: wysyła wyprawę, gdy trzeba i wolno (skutki przez `zastosuj`) */
  krok: (gov: GovState, i: GovInput, zastosuj: (fx: GovEffects, tekst: string) => void) => void;
  /** skutki kroku zarządu (`govUpdate`): zlicza powroty wypraw */
  po: (fx: GovEffects) => void;
  log: MiastoLog;
  wysylki: Wysylka[];
}

export function miastoPlayer(): GraczMiasta {
  const log: MiastoLog = { wyprawy: 0, lup: zeroStock(), ranni: 0, ugryzieni: 0, maxOdl: [] };
  const wysylki: Wysylka[] = [];
  /** dzień, w którym szła już szkoła (w dzień szkoły najwyżej jedna wyprawa) */
  let szkolaDnia = -1;

  const krok: GraczMiasta['krok'] = (gov, i, zastosuj) => {
    // mapa miasta wyłączona: bot gra jak przed nią
    if (!gov.miasto) return;
    if (i.day < OD_DNIA || i.hour < OD_GODZINY || i.hour >= DO_GODZINY) return;
    // jedna wyprawa naraz, a karta nocy czekająca na decyzję ma pierwszeństwo
    if (gov.wyprawy?.length || (gov.night && !gov.night.confirmed)) return;
    const kat = kategoriaBraku(i);
    if (!kat || (kat === 'szkola' && szkolaDnia === i.day)) return;
    const cel = najblizszeMiejsce(gov, i, kat);
    if (!cel) return;
    const ids = najzdrowsi(gov, i, cel);
    if (ids.length < OSOB) return;
    const wynik = wyslijWyprawe(gov, i, cel, ids);
    if (!wynik.ok) return;
    if (kat === 'szkola') szkolaDnia = i.day;
    log.wyprawy++;
    while (log.maxOdl.length < i.day) log.maxOdl.push(0);
    log.maxOdl[i.day - 1] = Math.max(log.maxOdl[i.day - 1], cel.odl);
    wysylki.push({ dzien: i.day, godzina: i.hour, kat, klucz: cel.klucz, odl: cel.odl, ids });
    zastosuj(wynik.fx, `wyprawa do miejsca: ${cel.nazwa.pl}`);
  };

  const po: GraczMiasta['po'] = (fx) => {
    // powrót wyprawy: osoby w `back`, łup w `stock`, rany jako utrata zdrowia tej osoby, ugryzienia w `bitten`
    if (!fx.back.length) return;
    for (const k of STOCK_KEYS) log.lup[k] += fx.stock[k];
    log.ranni += fx.needs.filter((n) => fx.back.includes(n.id) && (n.d.health ?? 0) < 0).length;
    log.ugryzieni += fx.bitten?.filter((id) => fx.back.includes(id)).length ?? 0;
  };

  return { krok, po, log, wysylki };
}
