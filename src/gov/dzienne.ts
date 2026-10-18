/* Wyprawa dzienna z mapy miasta (docs/superpowers/specs/2026-10-18-mapa-miasta-design.md, „Wyprawa”): wysłanie osób
   z zarządu do miejsca z okolicy za dnia i ich powrót w kroku zarządu. Wyprawa z karty nocy zostaje w noc.ts; oba
   rozliczają powrót tą samą funkcją (`rozliczWyprawe`).

   Kontrakt.
   - `wyslijWyprawe(st, i, cel, ids)`: sprawdza, czy wolno, i zapisuje wyprawę w `st.wyprawy` (opis celu w całości,
     czas wyjścia i powrotu w MINUTACH GRY, nie godziny jak `Cel.powrot`), dopisuje do kroniki i oddaje skutki do
     zastosowania (`fx.away` z osobami). Odmowa (`ok: false`) ma powód w obu językach i niczego nie zmienia w stanie,
     także w ziarnie losowań. Wołający stosuje `fx` w symulacji (osoby wychodzą bramą).
   - `podgladWyprawy(st, i, cel, ids)`: to samo, co pokaże podsumowanie przed potwierdzeniem (czas, powrót, ryzyko, ile
     uniosą, ile zostało w miejscu); nic nie zmienia i niczego nie losuje.
   - `wyprawyTick(st, i, fx)`: wołany na początku `govUpdate`. O minucie powrotu (albo później) rozlicza wyprawę przez
     `rozliczWyprawe` (łup do `fx.stock` i `st.miasto`, ludzie do `fx.back`), linie rozliczenia idą do kroniki,
     a wpis znika z `st.wyprawy`, więc powrót jest dokładnie raz, także po zapisie i wczytaniu w połowie drogi.
     Nie dotyka `st.night`. Bez `st.wyprawy` nie robi nic: nie zmienia stanu ani ziarna, więc boty i testy bez mapy miasta
     mają te same skróty co przed nią.

   Zasady wysyłki. Mapa miasta musi być włączona (`st.miasto`), godzina od 6:00 do 19:59 (od 20:00 gra karta nocy),
   cel najwyżej `MAX_DROGA_M` od adresu i jeszcze z czymś w zapasie, lista osób niepusta, a każda z nich na miejscu
   (nie `away`, nie w innej wyprawie), zdolna do tej drogi (`canGo`) i znana zarządowi. Do klucza, do którego ktoś już
   idzie, nie wychodzi druga wyprawa. Ta sama osoba podana dwa razy liczy się raz.

   Powrót po 20:00 przesuwa się na 6:00 następnego dnia, ale nie przed koniec drogi (`powrotMin`); osoba na wyprawie ma
   na karcie nocy tylko sen (src/gov/noc.ts), więc wyprawa wysłana o 19:00 nie psuje karty o 20:00. Numer wyprawy jest
   unikalny wśród tych, które są w drodze. Bez hypot, sin i cos; napisy od razu po polsku i angielsku. */

import { g } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { CARD_HOUR, canGo, expRisk, MORNING, rozliczWyprawe } from './noc.ts';
import { peopleNamesTx } from './tresc.ts';
import type { GovEffects, GovInput, GovPerson, GovState, Wyprawa } from './typy.ts';
import { clockOf, emptyEffects, gameMin, logGov } from './wspolne.ts';
import {
  type Cel,
  czasWyprawyMin,
  MAX_DROGA_M,
  powrotMin,
  UDZWIG_NA_OSOBE,
  wDrodze,
  zostaloZMiejsca,
} from './wyprawy.ts';

/** Wynik wysłania: wyprawa wyszła (skutki do zastosowania i minuta powrotu) albo odmowa z powodem. */
export type WynikWysylki = { ok: true; fx: GovEffects; powrot: number } | { ok: false; why: Tx };

const odmowa = (pl: string, en: string): WynikWysylki => ({ ok: false, why: tx(pl, en) });

/** Osoby z listy `ids` w zarządzie (bez powtórzeń, w podanej kolejności) albo id osoby, której nie ma. */
function osoby(i: GovInput, ids: readonly string[]): { ppl: GovPerson[] } | { brak: string } {
  const ppl: GovPerson[] = [];
  for (const id of new Set(ids)) {
    const p = i.people.find((x) => x.id === id);
    if (!p) return { brak: id };
    ppl.push(p);
  }
  return { ppl };
}

/** Dlaczego ta osoba nie pójdzie na tę wyprawę albo null, gdy może. */
function dlaczegoNie(st: GovState, p: GovPerson, cel: Cel): WynikWysylki | null {
  if (p.away || wDrodze(st, p.id))
    return odmowa(`${p.name} jest już na wyprawie.`, `${p.name} is already out on a supply run.`);
  if (p.bitten)
    return odmowa(
      `${p.name} ${g(p, 'jest ugryziony', 'jest ugryziona')} i nie wyjdzie za bramę.`,
      `${p.name} has been bitten and is not going past the gate.`,
    );
  if (!canGo(p, cel)) return odmowa(`${p.name} nie ma sił na taką drogę.`, `${p.name} is in no shape for that walk.`);
  return null;
}

/** Podsumowanie wyprawy przed potwierdzeniem: czas w minutach (droga w obie strony i przeszukanie), minuta gry powrotu,
    ryzyko (najgorsze z osób, jak przy rozliczeniu), ile uniosą (udźwig razy liczba osób) i ile zostało w miejscu (null:
    cel bez końca zapasu). Liczy się dla znanych osób z listy; bez nich udźwig i ryzyko to 0. Nic nie zmienia. */
export function podgladWyprawy(
  st: GovState,
  i: GovInput,
  cel: Cel,
  ids: string[],
): { czasMin: number; powrot: number; ryzyko: number; unosza: number; zostalo: number | null } {
  const ppl = [...new Set(ids)].map((id) => i.people.find((p) => p.id === id)).filter((p): p is GovPerson => !!p);
  return {
    czasMin: czasWyprawyMin(cel.odl, ppl.length),
    powrot: powrotMin(gameMin(i), cel.odl, ppl.length),
    ryzyko: ppl.length ? Math.max(...ppl.map((p) => expRisk(st, p, cel, ppl.length))) : 0,
    unosza: UDZWIG_NA_OSOBE * ppl.length,
    zostalo: cel.zapas === null ? null : zostaloZMiejsca(st, cel),
  };
}

/** Wysyła osoby `ids` do `cel` za dnia. Odmawia (bez żadnej zmiany stanu), gdy: nie ma `st.miasto`, jest noc (godzina
    poniżej 6 albo od 20), cel leży dalej niż `MAX_DROGA_M`, w miejscu nic nie zostało, lista jest pusta, ktoś z listy
    jest nieznany, poza mapą (`away`), w innej wyprawie, ugryziony albo niezdolny (`canGo`), albo ktoś już idzie do tego
    klucza. Inaczej zapisuje wyprawę (kopia celu, wyjście `gameMin(i)`, powrót `powrotMin`), wpis w kronice i oddaje
    skutki z `away` na godzinę powrotu. Nie losuje. */
export function wyslijWyprawe(st: GovState, i: GovInput, cel: Cel, ids: string[]): WynikWysylki {
  if (!st.miasto) return odmowa('Mapa miasta nie jest włączona.', 'The city map is not switched on.');
  if (i.hour >= CARD_HOUR || i.hour < MORNING)
    return odmowa(
      `Po zmroku nikt nie wychodzi. Wyprawy ruszają między ${MORNING}:00 a ${CARD_HOUR}:00.`,
      `Nobody sets out after dark. Supply runs leave between ${MORNING}:00 and ${CARD_HOUR}:00.`,
    );
  if (cel.odl > MAX_DROGA_M) return odmowa('Za daleko na jeden dzień.', 'Too far for one day.');
  if (zostaloZMiejsca(st, cel) <= 0)
    return odmowa('To miejsce jest wybrane do cna.', 'This place has been picked clean.');
  const znalezione = osoby(i, ids);
  if ('brak' in znalezione) return odmowa('Nie ma takiej osoby w zarządzie.', 'There is no such person on the board.');
  const { ppl } = znalezione;
  if (!ppl.length) return odmowa('Wybierz kogoś z zarządu.', 'Select someone from the board.');
  for (const p of ppl) {
    const nie = dlaczegoNie(st, p, cel);
    if (nie) return nie;
  }
  if (st.wyprawy?.some((w) => w.cel.klucz === cel.klucz))
    return odmowa('Ktoś już tam idzie.', 'Somebody is already on the way there.');

  const wyjscie = gameMin(i);
  const powrot = powrotMin(wyjscie, cel.odl, ppl.length);
  const dzien = Math.floor(powrot / 1440) + 1;
  const godzina = Math.floor((powrot % 1440) / 60);
  const wyprawy = (st.wyprawy ??= []);
  wyprawy.push({
    id: wyprawy.reduce((m, w) => Math.max(m, w.id), 0) + 1,
    cel: structuredClone(cel),
    ids: ppl.map((p) => p.id),
    wyjscie,
    powrot,
  });
  const fx = emptyEffects();
  for (const p of ppl) fx.away.push({ id: p.id, day: dzien, hour: godzina });
  const kto = peopleNamesTx(ppl);
  const kiedy = clockOf({ hour: godzina, minute: powrot % 60 });
  const jutro = dzien > i.day;
  logGov(
    st,
    i,
    tx(
      `Wyprawa do miejsca: ${cel.nazwa.pl} (${kto.pl}), powrót ${jutro ? 'jutro o' : 'około'} ${kiedy}.`,
      `Supply run to ${cel.nazwa.en}: ${kto.en}, back ${jutro ? 'tomorrow at' : 'around'} ${kiedy}.`,
    ),
    false,
    fx,
  );
  return { ok: true, fx, powrot };
}

/** Powroty wypraw dziennych: każda, której minuta powrotu minęła (w kolejności wysłania), rozlicza się raz przez
    `rozliczWyprawe` z osobami, które jeszcze są w zarządzie; linie rozliczenia idą do kroniki (i do `fx.log`), a wpis
    znika z `st.wyprawy`. Wyprawa bez nikogo z żywych znika bez losowania i bez wpisu. Bez `st.wyprawy` nic nie robi. */
export function wyprawyTick(st: GovState, i: GovInput, fx: GovEffects): void {
  if (!st.wyprawy?.length) return;
  const t = gameMin(i);
  const wTrakcie: Wyprawa[] = [];
  for (const w of st.wyprawy) {
    if (t < w.powrot) {
      wTrakcie.push(w);
      continue;
    }
    const ppl = w.ids.map((id) => i.people.find((p) => p.id === id)).filter((p): p is GovPerson => !!p);
    const r = rozliczWyprawe(st, i, fx, w.cel, ppl);
    for (const line of r.lines) logGov(st, i, line, !!r.hurt, fx);
  }
  st.wyprawy = wTrakcie;
}
