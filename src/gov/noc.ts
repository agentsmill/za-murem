/* Karta nocy jak w 0.1 i 0.2: o 20:00 zarząd proponuje, kto śpi, kto trzyma wartę (przy bramie albo
   przy dziurze w siatce) i kto idzie na wyprawę (blisko albo daleko); szansę napadu, spodziewane straty
   i łup widać przed decyzją. Dyżur przy kozie (warta:koza) wybiera gracz: zarząd tylko radzi, ile drewna
   starczy (z kozami z beczek i kotłem na każde palenisko, `GovInput.paleniska`), a rano raport mówi, czy w kuchni
   było ciepło. Gdy stoi wieża (`GovInput.wieza`, liczba jej miejsc), karta ma jeszcze „Wartę na wieży” (warta:wieza): to
   przydział, nie miejsce napadu (postsOf jej nie zna), a wartownik z wieży widzi całe podwórko i dokłada do obrony
   każdego posterunku połowę swojej wartości warty. Na wieży stoi najwyżej tyle osób, ile ma miejsc (propose i setAssign
   pilnują tego, wiezaPelna mówi, kiedy jest pełna, a resetAssign przywraca propozycję w dwóch przejściach). Przy zatwierdzeniu losuje się, czy szabrownicy
   przyjdą, gdzie i o której (23:00–4:00). O tej godzinie obronę liczy się z tego, co jest: kto nie zasnął,
   światło, pies, brama. Wyprawy wracają o 1:00 (blisko) albo o świcie (daleko), o 6:00 raport. Losowość
   z ziarna gry. Teksty karty i raportu to Tx (polski i angielski z tych samych danych, bez dodatkowych losowań).

   Cele wypraw na karcie wybiera `wybierzCeleNocy` (src/gov/wyprawy.ts): miejsca z okolicy (`GovInput.okolica`), gdy
   zarząd ma stan miasta, inaczej dzisiejsze TARGETS. Opcja karty (`NightOption`) niesie cały opis celu (`cel`),
   zatwierdzenie kopiuje go do grupy `n.exp`, a powrót, męczenie rano i godzina powrotu czytają go stamtąd. Grupa bez
   `cel` (stan zapisany przed mapą miasta) szuka celu w TARGETS po `target`. Osoba poza mapą (`GovPerson.away`) albo
   w wyprawie dziennej w drodze (`wDrodze`, bo pionek ma `away` dopiero przy bramie) ma na karcie tylko sen, a propozycja
   zarządu nie daje jej warty ani wyprawy.

   Propozycja zarządu przy braku jedzenia albo drewna (`propose`) posyła kogoś na wyprawę z miejsca tylko wtedy, gdy łup
   tego miejsca zawiera to, czego brakuje; cel z TARGETS dostaje ją jak dotąd. Rada o braku jedzenia (`nightAdvice`)
   przy miejscach nie porównuje „blisko” z „daleko”, tylko odsyła do ryzyka i łupu przy miejscu.

   Rozliczenie powrotu wyprawy (`rozliczWyprawe`) jest wspólne dla nocy i dla wyprawy dziennej z mapy miasta: bierze
   `Cel` (src/gov/wyprawy.ts) i osoby, losuje łup, kłopoty i znaleziska z ziarna zarządu i zwraca wpisy raportu, ranę
   i łup; zapasy, potrzeby, nastroje i powrót ludzi dopisuje do skutków (`fx`). Cel z TARGETS (`zapas === null`) liczy
   się jak przed wspólną funkcją, z tymi samymi losowaniami w tej samej kolejności i z mnożnikiem za wizyty
   (`GovState.visits`). Cel z miejsca ma zapas: łup po kłopotach przycina się do tego, co zostało w miejscu, i do
   udźwigu, a zabrane, wizyty i dzień ostatniej wizyty idą do `GovState.miasto`. Zależność idzie tylko stąd do
   wyprawy.ts, nigdy odwrotnie.

   Goście (src/gov/wizyta.ts) dotykają nocy w dwóch miejscach. Wskazówka na miejsce (wiadomość od gościa,
   `GovState.wskazowki`): `expRisk` mnoży ryzyko tego miejsca przez `WSKAZOWKA_RYZYKO`, a `rozliczWyprawe` łup przez
   `WSKAZOWKA_LUP` i zużywa wskazówkę. Pościg za gościem wpuszczonym na noc (`poscigNocy`, zwykły tryb): `raidChance`
   ×1,5 i napad przy bramie tej nocy (`GovState.tonight.poscig`); po zatwierdzeniu karty nocy daje jeszcze jedno losowanie,
   gdy napad nie przyszedł. Poranny raport dolicza chorych od gościa (`GovState.later[].sick`). */

import { NOTE_HOLD_FIRE_EN } from '../content/napisy-zombie.en.ts';
import { NOTE_HOLD_FIRE } from '../content/napisy-zombie.ts';
import { g } from '../content/people.ts';
import { type Tx, tx, txJoin, txOf } from '../core/jezyk.ts';
import { clamp } from '../core/rng.ts';
import { placeIn, wordsEn, wordsOf } from './miejsce.ts';
import { peopleNamesTx, TARGETS } from './tresc.ts';
import type {
  Arm,
  GovEffects,
  GovInput,
  GovPerson,
  GovState,
  LootKey,
  NightCard,
  NightOption,
  NightReport,
  StockDelta,
} from './typy.ts';
import { dailyDrift, law } from './uchwaly.ts';
import {
  addNeeds,
  addStock,
  atHour,
  decision,
  fenceOf,
  gameMin,
  logGov,
  mood,
  nightDay,
  rint,
  rnd,
  round1,
  round2,
  STOCK_KEYS,
  stockTx,
  zeroStock,
} from './wspolne.ts';
import {
  type Cel,
  celZTarget,
  maWskazowke,
  ograniczLup,
  UDZWIG_NA_OSOBE,
  WSKAZOWKA_LUP,
  WSKAZOWKA_RYZYKO,
  wDrodze,
  wlaczMiasto,
  wskazowka,
  wybierzCeleNocy,
  zostaloZMiejsca,
} from './wyprawy.ts';

export const CARD_HOUR = 20;
/** do tej godziny karta czeka na decyzję, potem zostaje propozycja zarządu */
export const CARD_DEADLINE = 22;
export const MORNING = 6;
/** dyżur przy kozie: posterunek jak w symulacji ('koza'); czuwający dokłada do rana, koza zjada około 2 sztuk
    drewna na godzinę (noc 22–6 to 16, od karty o 20:00 to 20) */
export const KOZA = 'koza';
export const KOZA_KEY = `warta:${KOZA}`;
export const WOOD_PER_HOUR = 2;
/** warta na wieży (badania, t_wieza): posterunek jak w symulacji ('wieza'); wartownik widzi całe podwórko, więc dokłada do
    obrony każdego innego posterunku połowę swojej wartości warty (defenseAt). Szabrownicy jej nie wybierają */
export const WIEZA = 'wieza';
export const WIEZA_KEY = `warta:${WIEZA}`;
/** warta przy siatce (brama, dziury), bez dyżuru przy kozie */
export const isFenceGuard = (k: string): boolean => k.startsWith('warta:') && k !== KOZA_KEY;

/** drewno na noc przy dyżurze od teraz do 6:00: zapas (z tym, co w kozie), ile trzeba i do której starczy. Dyżur dokłada
    do wszystkich palenisk w siedzibie, więc godzina kosztuje WOOD_PER_HOUR razy liczba palenisk (`i.paleniska`: kocioł
    liczy się jako kilka koz, bez pola jedno). */
export function nightWood(i: GovInput): { have: number; need: number; until: string } {
  const now = i.hour + i.minute / 60;
  const left = (MORNING - now + 24) % 24;
  const perHour = WOOD_PER_HOUR * (i.paleniska ?? 1);
  const need = Math.ceil(left * perHour);
  const have = Math.max(0, Math.floor(i.stock.wood));
  const end = have >= need ? MORNING : Math.floor(now + have / perHour) % 24;
  return { have, need, until: `${end}:00` };
}

/** godzina z zapasu drewna do tekstu: „0:00” to północ */
export const untilWord = (until: string): string => (until === '0:00' ? 'północy' : until);
export const untilWordEn = (until: string): string => (until === '0:00' ? 'midnight' : until);

/** do której starczy drewna przy dyżurze, w słowach („drewna starczy do około 2:00.”) */
export function woodNote(wd: { have: number; need: number; until: string }): Tx {
  if (wd.have >= wd.need) return tx('drewna starczy do rana.', 'the wood will last till morning.');
  if (wd.have >= WOOD_PER_HOUR)
    return tx(
      `drewna starczy do około ${untilWord(wd.until)}.`,
      `the wood will only last until about ${untilWordEn(wd.until)}.`,
    );
  return tx('drewna prawie nie ma.', 'there’s hardly any wood left.');
}

/** zdania po kolei w obu językach, bez pustych */
const zdania = (...parts: Tx[]): Tx =>
  txJoin(
    parts.filter((t) => t.pl || t.en),
    ' ',
  );
const NIC: Tx = tx('', '');
/** angielski zaimek po płci osoby albo „They” dla kilku */
const oni = (list: { f: boolean }[], he: string, she: string, they: string) =>
  list.length === 1 ? (list[0].f ? she : he) : they;
const RAID_FROM = 23;
const RAID_SPAN = 5 * 60;

const verbPl = (list: { f: boolean }[], m: string, f: string, mp: string, fp: string) =>
  list.length === 1 ? g(list[0], m, f) : list.every((p) => p.f) ? fp : mp;

interface Post {
  key: string;
  /** „przy bramie”, „at the gate” */
  name: Tx;
  weak: number;
}

/** tryb zombie (stan zarządu) */
export const zombieMode = (st: Pick<GovState, 'mode'>): boolean => st.mode === 'zombie';

/** miejsca do pilnowania od najsłabszego: dziury (większa łatwiejsza) i brama (słabsza przy kiepskiej siatce);
    w trybie zombie najpierw „przy siatce” (warta idzie tam, gdzie napiera stado) */
export function postsOf(i: GovInput, zombie = false): Post[] {
  const f = fenceOf(i);
  const posts: Post[] = f.holes.map((h) => {
    const name = txOf(h.name ?? '');
    return {
      key: `d${h.id}`,
      name: tx(`przy dziurze ${name.pl}`, `at the hole ${name.en}`),
      weak: round2(h.size + 0.2),
    };
  });
  const place = placeIn(i);
  posts.push({
    key: 'brama',
    name: tx(wordsOf(place).brama.przy, `at ${wordsEn(place).brama}`),
    weak: round2(0.15 + 0.35 * (1 - f.durability)),
  });
  if (zombie) posts.push({ key: 'siatka', name: tx('przy siatce', 'at the fence'), weak: 2 });
  return posts.sort((a, b) => b.weak - a.weak || (a.key < b.key ? -1 : 1));
}

/** warta stoi za siatką: przy siatce i przy zamkniętej bramie; przy otwartej dziurze i otwartej bramie broń wręcz
    sięga szwendaczy */
const behindWire = (i: GovInput, post: string): boolean =>
  post === 'siatka' || (post === 'brama' && !i.fence?.gateOpen);

/** szansa, że szabrownicy spróbują tej nocy */
export function raidChance(st: GovState, i: GovInput): number {
  const f = fenceOf(i);
  const nd = nightDay(i);
  let c = 0.35 + 0.05 * Math.min(nd, 6);
  c += 0.06 * Math.min(4, f.holes.length);
  c += (0.5 - f.durability) * 0.2;
  if (i.light?.gateLamp) c -= 0.05;
  if (i.light?.campfire) c -= 0.05;
  if (st.flags.dog) c -= 0.03;
  if (law(st, 'u_warty')) c -= 0.05;
  if (law(st, 'u_brama')) c -= 0.08;
  if (st.tonight.boost === nd) c *= 1.5;
  // ktoś szedł za gościem wpuszczonym na noc (zwykły tryb): szabrownicy są blisko
  if (st.tonight.poscig === nd) c *= 1.5;
  return clamp(round2(c), 0.05, 0.85);
}

/** warta spoza karty nocy (polecenie z menu): z wejścia, a bez pola osoby z pracą 'guard' (miejsce nieznane: '') */
export function standingGuards(i: GovInput): { id: string; post: string }[] {
  if (i.guards) return i.guards.filter((g) => i.people.some((p) => p.id === g.id));
  // posterunki z odczytu symulacji (SimPerson.post: 'brama', 'd<id>', 'koza')
  if (i.people.some((p) => p.post !== undefined))
    return i.people.filter((p) => p.post).map((p) => ({ id: p.id, post: p.post as string }));
  return i.people.filter((p) => p.job === 'guard').map((p) => ({ id: p.id, post: '' }));
}

/** ilu ludzi pilnuje siatki: warta z karty plus ta, która już stoi (bez dubli, bez wychodzących na wyprawę
    i bez dyżuru przy kozie, bo ten jest w kuchni, nie przy siatce) */
export function watchersOf(i: GovInput, assign: Record<string, string>): number {
  const ids = new Set(
    Object.entries(assign)
      .filter(([, k]) => isFenceGuard(k))
      .map(([id]) => id),
  );
  for (const g of standingGuards(i)) {
    const k = assign[g.id] ?? '';
    if (g.post !== KOZA && !k.startsWith('wyprawa:') && k !== KOZA_KEY) ids.add(g.id);
  }
  return ids.size;
}

/** ilu szabrowników przychodzi przy danej sile napadu */
export const raidersOf = (attack: number): number => (attack < 3 ? 1 : attack < 4.2 ? 2 : 3);

/** ile z szansy zostaje, kiedy przy siatce widać wartę: mniej z dwiema osobami i przy świetle */
export function deterrence(st: GovState, i: GovInput, watchers: number): number {
  if (!watchers) return 1;
  const lit = !!(i.light?.campfire || i.light?.gateLamp || st.flags.flashlight);
  return Math.max(0.4, 1 - 0.2 * Math.min(2, watchers) - (lit ? 0.15 : 0));
}

export const chanceWord = (c: number): Tx =>
  c < 0.25 ? tx('niska', 'low') : c < 0.5 ? tx('średnia', 'medium') : tx('wysoka', 'high');

/** broń w warcie: gołe ręce × 1, wręcz × 1,25, dzida × 1,4, broń palna albo kusza z amunicją × 1,5 */
const ARM_FACTOR: Record<Arm, number> = { brak: 1, wrecz: 1.25, dzida: 1.4, palna: 1.5 };
export const weaponFactor = (p: Pick<GovPerson, 'arm'>): number => ARM_FACTOR[p.arm ?? 'brak'];

/** ile obrony daje osoba na warcie (guardValue z 0.2): wypoczęta więcej, ze światłem półtora raza, z bronią więcej */
export function guardValue(st: GovState, i: GovInput, p: GovPerson, post: string): number {
  const n = p.needs;
  let v = n.health < 20 ? 0.5 : n.rest > 30 ? 2.5 : 1.5;
  v *= 1 + 0.25 * (p.skills.obrona ?? 0);
  v *= weaponFactor(p);
  if (p.traits.includes('odwazny')) v *= 1.2;
  if (p.traits.includes('tchorz')) v *= 0.7;
  if (law(st, 'u_warty')) v *= 1.25;
  if ((post === 'brama' && i.light?.gateLamp) || st.flags.flashlight) v *= 1.5;
  return round1(v);
}

/** obrona posterunku post z wart na nocy: sama brama i pies, warta na tym posterunku w pełni, warta z innego 0,5,
    a z wieży połowa jej wartości (widzi całe podwórko); dyżur przy kozie nie broni siatki */
export function defenseAt(st: GovState, i: GovInput, post: string, guards: { p: GovPerson; post: string }[]): number {
  const f = fenceOf(i);
  const nd = st.night?.day ?? nightDay(i);
  let d = 0;
  if (post === 'brama') d += 2 + 2 * f.durability + (law(st, 'u_warty') ? 1.5 : 0);
  if (st.flags.dog) d += post === 'brama' ? 1 : 0.5;
  for (const gd of guards) {
    if (gd.post === KOZA) continue;
    if (gd.post === post) d += guardValue(st, i, gd.p, gd.post);
    else d += gd.post === WIEZA ? 0.5 * guardValue(st, i, gd.p, gd.post) : 0.5;
  }
  if (st.tonight.alert === nd) d += 3;
  if (st.tonight.bonusDay === nd) d += st.tonight.bonus;
  return round1(d);
}

/** spodziewane straty, jeśli wejdą (w 0.2 po 35% wszystkiego): drewno z podwórka i ze składu przy kozie,
    zapasy z piwnicy */
export function lossIfEntered(i: GovInput): { wood: number; supplies: number } {
  const s = i.stock;
  const split = s.woodLoose !== undefined || s.woodSklad !== undefined;
  const wood = split ? Math.round(0.7 * (s.woodLoose ?? 0) + 0.4 * (s.woodSklad ?? 0)) : Math.round(0.45 * s.wood);
  return { wood: Math.min(s.wood, wood), supplies: Math.round(0.35 * s.supplies) };
}

// ---------------------------------------------------------------- wyprawy

/** Cel grupy wyprawy: opis zapisany w grupie albo, w stanie sprzed mapy miasta, cel z TARGETS po `target`. */
function celGrupy(i: GovInput, gr: { target: string; cel?: Cel }): Cel {
  return gr.cel ?? celZTarget(TARGETS.find((x) => x.id === gr.target)!, placeIn(i));
}

/** ryzyko kłopotów jednej osoby na wyprawie do celu (0,02–0,9); `Cel.ryzyko` bywa większe niż 1, tu jest ucinane;
    z wskazówką na to miejsce (`maWskazowke`) razy `WSKAZOWKA_RYZYKO`, bez zużywania jej */
export function expRisk(
  st: GovState,
  p: GovPerson,
  cel: Pick<Cel, 'ryzyko'> & Partial<Pick<Cel, 'klucz'>>,
  together = 1,
): number {
  let r = cel.ryzyko;
  // wiadomość od gościa o tym miejscu (wskazówka): karta i podgląd pokazują już mniejsze ryzyko
  if (maWskazowke(st, cel.klucz)) r *= WSKAZOWKA_RYZYKO;
  if (p.needs.rest < 35) r *= 1.4;
  if (p.needs.health < 50) r *= 1.3;
  if (p.traits.includes('odwazny')) r *= 0.7;
  if (p.traits.includes('tchorz')) r *= 1.3;
  r *= 1 - 0.1 * (p.skills.obrona ?? 0);
  if (st.flags.torch) r *= 0.85;
  if (together > 1) r *= 0.75;
  // uzbrojonym łatwiej, a w trybie zombie każde wyjście za siatkę jest groźniejsze
  if (p.arm === 'palna') r *= 0.75;
  else if (p.arm === 'wrecz' || p.arm === 'dzida') r *= 0.85;
  if (zombieMode(st)) r *= 1.6;
  return clamp(round2(r), 0.02, 0.9);
}

/** mnożnik łupu za dotychczasowe wizyty (nie mniej niż 0,3): tylko cel z TARGETS, który nie ma końca zapasu; miejsce
    z zapasem wyczerpuje się samo, więc jego łup nie dostaje mnożnika */
const lootMult = (st: GovState, cel: Pick<Cel, 'klucz' | 'zapas'>) =>
  cel.zapas === null ? Math.max(0.3, 1 - 0.15 * (st.visits[cel.klucz] ?? 0)) : 1;

/** Spodziewany łup jednej osoby na karcie. Cel z TARGETS: przedziały razy mnożnik za wizyty. Cel z miejsca: przedziały
    przycięte do tego, co zostało w miejscu, i do udźwigu jednej osoby (oba końce przez `ograniczLup`, więc suma
    nie przekracza `min(zostało, udźwig)`), żeby karta nie obiecywała więcej, niż da się wynieść. */
function expGain(st: GovState, cel: Cel): Partial<Record<LootKey, [number, number]>> {
  const m = lootMult(st, cel);
  const out: Partial<Record<LootKey, [number, number]>> = {};
  const pary = Object.entries(cel.lup) as [LootKey, [number, number]][];
  if (cel.zapas !== null) {
    const pojemnosc = Math.min(zostaloZMiejsca(st, cel), UDZWIG_NA_OSOBE);
    const od = zeroStock();
    const doMax = zeroStock();
    for (const [k, [a, b]] of pary) {
      od[k] = a;
      doMax[k] = b;
    }
    const odCiete = ograniczLup(od, pojemnosc);
    const doCiete = ograniczLup(doMax, pojemnosc);
    for (const [k] of pary) out[k] = [Math.min(odCiete[k], doCiete[k]), doCiete[k]];
    return out;
  }
  for (const [k, [a, b]] of pary) out[k] = [Math.round(a * m), Math.round(b * m)];
  return out;
}

/** Osoba poza domem na wyprawie: flaga `away` z wejścia albo wpis w wyprawach dziennych w drodze (`wDrodze`; pionek
    wysłany tuż przed 20:00 ma `away` dopiero przy bramie). Karta nocy daje jej tylko sen. */
const pozaDomem = (st: GovState, p: GovPerson): boolean => !!p.away || wDrodze(st, p.id);

/** kto może iść: nie ugryziony, dość sił i zdrowia, na daleką drogę więcej */
export const canGo = (p: GovPerson, cel: Pick<Cel, 'range'>) =>
  !p.bitten &&
  (cel.range === 'daleko' ? p.needs.rest >= 40 && p.needs.health >= 45 : p.needs.rest >= 25 && p.needs.health >= 30);

// ---------------------------------------------------------------- karta

export function makeCard(st: GovState, i: GovInput): { card: NightCard; assign: Record<string, string> } {
  const zombie = zombieMode(st);
  const posts = postsOf(i, zombie);
  // w trybie zombie stado przychodzi zawsze: zarząd proponuje dwie warty przy siatce
  const chance = zombie ? 0.9 : raidChance(st, i);
  const targets = wybierzCeleNocy(st, i);
  // dyżur przy kozie tylko przy kozie zarządu (kuchnia z kozą w siedzibie)
  const wood = i.kitchen !== null ? nightWood(i) : undefined;
  const people = i.people.map((p) => {
    // kto jest poza mapą na wyprawie (albo w drodze do bramy na wyprawę dzienną), ten nie ma z czego wybierać: nie
    // trzyma warty i nie idzie drugi raz
    if (pozaDomem(st, p))
      return {
        id: p.id,
        name: p.name,
        needs: { ...p.needs },
        proposal: 'sen',
        options: [
          {
            key: 'sen',
            label: tx('Śpi', 'Sleeps'),
            ok: true,
            note: tx('Na wyprawie.', 'Out on a supply run.'),
          },
        ],
      };
    const opts: NightOption[] = [
      {
        key: 'sen',
        label: tx('Śpi', 'Sleeps'),
        ok: true,
        note: p.needs.rest < 30 ? tx('Bardzo potrzebuje snu.', 'Badly needs sleep.') : undefined,
      },
    ];
    if (wood) {
      const ok = p.needs.health >= 30;
      const wn = woodNote(wood);
      opts.push({
        key: KOZA_KEY,
        label: tx('Czuwa przy kozie', 'Watches the stove'),
        ok,
        why: ok
          ? undefined
          : tx(g(p, 'Za słaby na czuwanie.', 'Za słaba na czuwanie.'), 'Too weak to sit up all night.'),
        // noc bez snu zjada około 50 sił (symulacja: 5 na godzinę od karty do 6:00)
        note: tx(
          `Nie śpi i pilnuje ognia w kozie, ${wn.pl}${p.needs.rest < 50 ? ' Rano będzie bez sił.' : ''}`,
          `Stays up and keeps the stove going, and ${wn.en}${p.needs.rest < 50 ? ' Will be exhausted in the morning.' : ''}`,
        ),
      });
    }
    for (const post of posts) {
      const ok = p.needs.health >= 20;
      opts.push({
        key: `warta:${post.key}`,
        label: tx(`Warta ${post.name.pl}`, `Watch ${post.name.en}`),
        ok,
        why: ok ? undefined : tx(g(p, 'Za słaby na wartę.', 'Za słaba na wartę.'), 'Too weak for the watch.'),
        guard: guardValue(st, i, p, post.key),
        note:
          zombie && behindWire(i, post.key) && (p.arm === 'brak' || p.arm === 'wrecz' || !p.arm)
            ? tx(
                'Z tą bronią nie sięgnie szwendaczy przez siatkę.',
                'Can’t reach the shamblers through the fence with that.',
              )
            : p.needs.rest < 30
              ? tx(`${g(p, 'Zmęczony', 'Zmęczona')}: może zasnąć na warcie.`, 'Tired: may fall asleep on watch.')
              : tx('Nie wyśpi się.', 'Won’t get much sleep.'),
      });
      // broń palna sama nie strzela przez siatkę (strzał ściąga stado), kusza strzela cicho
      if (zombie && behindWire(i, post.key) && p.arm === 'palna' && p.weapon !== 'kusza')
        opts[opts.length - 1].note = tx(NOTE_HOLD_FIRE, NOTE_HOLD_FIRE_EN);
    }
    if (i.wieza) opts.push(wiezaOption(st, i, p, zombie));
    // dwa miejsca na karcie: pierwsze to „blisko”, drugie „daleko” (klucz opcji według miejsca na karcie, nie zasięgu celu;
    // przedrostek etykiety i notatka według zasięgu celu)
    for (const [k, t] of targets.entries()) {
      const ok = canGo(p, t);
      const slot = k === 0 ? 'blisko' : 'daleko';
      // cel z miejsca ma odległość przy nazwie („Sklep budowlany, 450 m”), cel z TARGETS tylko nazwę
      const where =
        t.zapas === null
          ? t.nazwa
          : tx(`${t.nazwa.pl}, ${Math.round(t.odl)} m`, `${t.nazwa.en}, ${Math.round(t.odl)} m`);
      opts.push({
        key: `wyprawa:${slot}`,
        // przedrostek mówi to, co notatka i godzina powrotu, czyli zasięg celu; klucz opcji zostaje przy miejscu na karcie
        label: tx(`Wyprawa ${t.range}: ${where.pl}`, `${t.range === 'daleko' ? 'Long run' : 'Short run'}: ${where.en}`),
        ok,
        why: ok
          ? undefined
          : p.bitten
            ? tx(
                g(p, 'Ugryziony, w gorączce: nie wróci z wyprawy.', 'Ugryziona, w gorączce: nie wróci z wyprawy.'),
                'Bitten and feverish: wouldn’t make it back from a run.',
              )
            : t.range === 'daleko'
              ? tx('Za mało sił na daleką wyprawę.', 'Not enough energy for a long run.')
              : tx('Za mało sił na wyprawę.', 'Not enough energy for a run.'),
        risk: expRisk(st, p, t),
        gain: expGain(st, t),
        target: t.klucz,
        cel: t,
        note:
          t.range === 'daleko'
            ? tx('Wraca o świcie, razem bezpieczniej.', 'Back at dawn. Safer in company.')
            : tx(`Wraca o ${t.powrot}:00, potem śpi.`, `Back at ${t.powrot}:00, then sleeps.`),
      });
    }
    return { id: p.id, name: p.name, needs: { ...p.needs }, proposal: 'sen', options: opts };
  });
  const loss = zombie ? { wood: 0, supplies: 0 } : lossIfEntered(i);
  const nd = nightDay(i);
  const pct = Math.round(chance * 20) * 5;
  const first =
    nd === 1
      ? tx(
          'Pierwsza noc za siatką. Dym z kozy widać z daleka. ',
          'The first night behind the fence. The smoke from the stove can be seen from far away. ',
        )
      : NIC;
  const fence = fenceOf(i).durability;
  const size = i.horde?.tonight ?? 0;
  const word = size < 15 ? tx('małe', 'small') : size < 35 ? tx('duże', 'big') : tx('ogromne', 'huge');
  const near = i.horde?.near ?? 0;
  const fpct = Math.round(fence * 100);
  const one = Math.round(chance * deterrence(st, i, 1) * 20) * 5;
  const cw = chanceWord(chance);
  const forecast = zombie
    ? tx(
        `${first.pl}Nocą przyjdzie stado: około ${size} szwendaczy (${word.pl}). Siatka trzyma w ${fpct}%.${near ? ` Już teraz przy siatce: ${near}.` : ''} Strzał ściągnie ich więcej.`,
        `${first.en}A herd is coming tonight: about ${size} shamblers (${word.en}). The fence is holding at ${fpct}%.${near ? ` Already at the fence: ${near}.` : ''} A gunshot will draw more of them.`,
      )
    : tx(
        `${first.pl}Szansa, że szabrownicy spróbują wejść: około ${pct}% (${cw.pl}), z jedną osobą na warcie około ${one}%. Najsłabsze miejsce: ${posts[0].name.pl}.`,
        `${first.en}Chance of looters trying to get in: about ${pct}% (${cw.en}), or about ${one}% with one person on watch. They’ll most likely try ${posts[0].name.en}.`,
      );
  const card: NightCard = {
    day: nd,
    chance,
    chanceWord: zombie ? tx('pewne', 'certain') : cw,
    forecast,
    posts: posts.map((p) => ({ key: p.key, name: p.name, weak: p.weak })),
    loss,
    people,
    advice: NIC,
    wood,
  };
  if (zombie) card.horde = { size, word, fence };
  if (i.wieza) card.wieza = i.wieza;
  const assign = propose(st, i, card, st.lastGuards);
  for (const cp of card.people) cp.proposal = assign[cp.id];
  card.advice = nightAdvice(i, card, assign);
  return { card, assign };
}

/** opcja „Warta na wieży” osoby: obrona to to, co dokłada do każdego innego posterunku (połowa jej wartości warty).
    W trybie zombie wieża jest dla broni dystansowej: z dzidą ani gołymi rękami nie sięga siatki, a broń palna (nie
    kusza) przez siatkę sama nie strzela, jak przy każdej warcie za siatką. */
function wiezaOption(st: GovState, i: GovInput, p: GovPerson, zombie: boolean): NightOption {
  const ok = p.needs.health >= 20;
  const tired =
    p.needs.rest < 30
      ? tx(`${g(p, 'Zmęczony', 'Zmęczona')}: może zasnąć na warcie.`, 'Tired: may fall asleep on watch.')
      : tx('Nie wyśpi się.', 'Won’t get much sleep.');
  let note: Tx;
  if (zombie && p.arm !== 'palna') note = tx('Na wieży trzeba broni dystansowej.', 'The tower needs a ranged weapon.');
  else if (zombie && p.weapon !== 'kusza') note = tx(NOTE_HOLD_FIRE, NOTE_HOLD_FIRE_EN);
  else
    note = tx(
      `Z wieży widać całe podwórko: dokłada połowę swojej warty do obrony każdego posterunku. ${tired.pl}`,
      `The whole yard is in view from the tower: adds half of their defence to every post. ${tired.en}`,
    );
  return {
    key: WIEZA_KEY,
    label: tx('Warta na wieży', 'Watch on the tower'),
    ok,
    why: ok ? undefined : tx(g(p, 'Za słaby na wartę.', 'Za słaba na wartę.'), 'Too weak for the watch.'),
    guard: round1(0.5 * guardValue(st, i, p, WIEZA)),
    note,
  };
}

/** propozycja zarządu: warta przy najsłabszym miejscu, przy dużym ryzyku druga, wyprawa przy brakach */
function propose(st: GovState, i: GovInput, card: NightCard, lastGuards: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (const p of i.people) a[p.id] = 'sen';
  // kto już stoi na warcie z menu, ten zostaje na swoim miejscu (jeśli karta ma takie)
  const standing = new Set<string>();
  for (const s of standingGuards(i)) {
    const key = `warta:${s.post}`;
    if (card.people.find((c) => c.id === s.id)?.options.some((o) => o.key === key && o.ok)) {
      // wieża ma tyle miejsc, ile kafelków: nadmiarowi zostają bez przydziału (stoją przy siatce, nie na wieży)
      if (key === WIEZA_KEY && wiezaPelna(card, a, s.id)) continue;
      a[s.id] = key;
      standing.add(s.id);
    }
  }
  // na wartę najpierw ci, co ostatniej nocy spali, potem umiejący się bić, potem wypoczęci
  const was = (p: GovPerson) => (lastGuards.includes(p.id) ? 1 : 0);
  const free = [...i.people]
    .filter((p) => p.needs.health >= 20 && !pozaDomem(st, p) && !standing.has(p.id))
    .sort(
      (x, y) =>
        was(x) - was(y) ||
        (y.skills.obrona ?? 0) - (x.skills.obrona ?? 0) ||
        y.needs.rest - x.needs.rest ||
        (x.id < y.id ? -1 : 1),
    );
  // najsłabsze miejsca, których nikt jeszcze nie pilnuje (stojący przy kozie nie pilnuje siatki)
  const fence = [...standing].filter((id) => a[id] !== KOZA_KEY).length;
  const open = card.posts.filter((p) => !Object.values(a).includes(`warta:${p.key}`));
  if (card.chance >= 0.25 && free.length && open.length && !fence) a[free.shift()!.id] = `warta:${open[0].key}`;
  if (card.chance >= 0.55 && free.length >= 3 && open.length > 1 && fence < 2)
    a[free.shift()!.id] = card.horde ? 'warta:siatka' : `warta:${open[fence ? 0 : 1].key}`;
  const lackFood = i.stock.supplies < i.people.length * 2;
  const lackWood = i.stock.wood < 4;
  const key = nightDay(i) === 1 ? 'wyprawa:blisko' : 'wyprawa:daleko';
  if ((lackFood || lackWood) && free.length >= 2) {
    const goer = free
      .filter((p) => card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key)?.ok)
      .sort((x, y) => y.needs.rest - x.needs.rest)[0];
    // cel z miejsca (mapa miasta) zarząd proponuje tylko wtedy, gdy niesie to, czego brakuje (jedzenie albo drewno);
    // cel z TARGETS zostaje po staremu, bo jego łup to mieszanka z mnożnikiem za wizyty
    const cel = goer && card.people.find((c) => c.id === goer.id)?.options.find((o) => o.key === key)?.cel;
    const naprawia = !cel || cel.zapas === null || (lackFood && !!cel.lup.supplies) || (lackWood && !!cel.lup.wood);
    if (goer && naprawia) a[goer.id] = key;
  }
  // dyżur przy kozie zostaje decyzją gracza (kosztuje komuś noc snu): zarząd tylko o nim radzi
  return a;
}

/** rada zarządu do przydziału na karcie (interfejs liczy ją na nowo po każdej zmianie) */
export function nightAdvice(i: GovInput, card: NightCard, assign: Record<string, string>): Tx {
  if (card.horde) return hordeAdvice(i, card, assign);
  const guards = Object.values(assign).filter(isFenceGuard);
  const kept = new Set(guards.map((k) => k.slice(6)));
  const loss = stockTx(card.loss);
  const weak = card.posts[0];
  const at = txOf(weak.name);
  let fence = NIC;
  if (card.chance >= 0.25 && !guards.length)
    fence = tx(
      `Bez warty ${at.pl} szabrownicy wejdą bez trudu${loss.pl ? ` i mogą zabrać: ${loss.pl}` : ''}.`,
      `With nobody on watch ${at.en}, looters will walk right in${loss.en ? ` and could take ${loss.en}` : ''}.`,
    );
  else if (guards.length && !kept.has(weak.key))
    fence = tx(
      `Najsłabsze miejsce, ${at.pl}, zostaje bez warty. Tam najpewniej spróbują wejść.`,
      `Nobody is on watch ${at.en}, the weakest spot. That is where they will most likely try.`,
    );
  else if (guards.length && card.posts.some((p) => !kept.has(p.key)))
    fence = tx(
      `Warta stoi ${at.pl}, ale dziur jest więcej. Za dnia warto łatać siatkę.`,
      `There is a watch ${at.en}, but there are more holes. Patch the fence during the day.`,
    );
  const koza = kozaAdvice(i, card, assign);
  if (fence.pl || koza.pl) return zdania(fence, koza);
  if (i.stock.supplies < i.people.length * 2)
    // miejsca z mapy miasta nie układają się w „blisko bezpieczniejsza, daleko więcej” (kategorie mają różne ryzyko
    // i łup), więc rada odsyła do ryzyka i łupu przy miejscu na karcie; cele z TARGETS zostają ze starym zdaniem
    return card.people.some((p) => p.options.some((o) => o.key.startsWith('wyprawa:') && o.cel && o.cel.zapas !== null))
      ? tx(
          'Jedzenia jest na krótko. Wyprawa może to załatać: ryzyko i łup widać przy każdym miejscu.',
          'Food is running short. A supply run could fix that: the risk and the haul are shown beside each place.',
        )
      : tx(
          'Jedzenia jest na krótko. Wyprawa blisko jest bezpieczniejsza, daleka przynosi więcej.',
          'Food is running short. A short run is safer, a long one brings back more.',
        );
  return tx('Wyśpijcie się. Jutro dzień pracy przy siatce.', 'Get some sleep. The fence needs work tomorrow.');
}

/** rada w trybie zombie: warta przy siatce i broń, która przez nią sięga; potem koza */
function hordeAdvice(i: GovInput, card: NightCard, assign: Record<string, string>): Tx {
  // wartownik na wieży liczy się, tylko gdy ma z czego strzelać (bez broni dystansowej nie sięga siatki)
  const guards = i.people.filter(
    (p) => isFenceGuard(assign[p.id] ?? '') && (assign[p.id] !== WIEZA_KEY || p.arm === 'palna'),
  );
  const pct = Math.round((card.horde?.fence ?? 1) * 100);
  let fence: Tx;
  if (!guards.length)
    fence = tx(
      `Bez warty stado będzie napierać na siatkę do rana. Siatka trzyma w ${pct}%.`,
      `With nobody on watch, the herd will push at the fence until morning. The fence is holding at ${pct}%.`,
    );
  else if (!guards.some((p) => p.arm === 'dzida' || p.arm === 'palna'))
    fence = tx(
      'Warta bez dzidy ani broni palnej nie sięgnie szwendaczy przez siatkę. Dajcie komuś dzidę.',
      'A watch without a spear or a gun can’t reach the shamblers through the fence. Give someone a spear.',
    );
  else
    fence = tx(
      'Dzida sięga przez siatkę. Strzelajcie tylko w ostateczności: strzał ściąga stado.',
      'A spear reaches through the fence. Shoot only as a last resort: a gunshot draws the herd.',
    );
  return zdania(fence, kozaAdvice(i, card, assign));
}

/** rada o kozie, kiedy w kuchni zrobi się zimno, a jest drewno: bez dyżuru koza gaśnie w nocy (nikt nie
    dokłada, wszyscy śpią); z dyżurem ognia jest tyle, ile drewna */
function kozaAdvice(i: GovInput, card: NightCard, assign: Record<string, string>): Tx {
  const wd = card.wood;
  if (!wd || i.kitchen === null) return NIC;
  const who = i.people.filter((p) => assign[p.id] === KOZA_KEY);
  const wn = woodNote(wd);
  if (who.length) {
    if (wd.have >= wd.need) return NIC;
    const names = peopleNamesTx(who);
    return tx(
      `Przy kozie ${who.length > 1 ? 'czuwają' : 'czuwa'} ${names.pl}, ale ${wn.pl}`,
      `${names.en} ${who.length > 1 ? 'are' : 'is'} watching the stove, but ${wn.en}`,
    );
  }
  if (wd.have < WOOD_PER_HOUR) return NIC;
  const deg = Math.round(i.kitchen);
  const now = !i.kozaLit
    ? tx(`Koza jest zimna, w kuchni ${deg}°C.`, `The stove is cold, and the kitchen is at ${deg}°C.`)
    : deg < 16
      ? tx(`W kuchni już tylko ${deg}°C.`, `The kitchen is down to ${deg}°C.`)
      : tx(
          'Bez dyżuru koza zgaśnie w nocy i rano w kuchni będzie zimno.',
          'Without a stove watch the fire will go out in the night, and the kitchen will be cold by morning.',
        );
  return tx(`${now.pl} Niech ktoś czuwa przy kozie: ${wn.pl}`, `${now.en} Have someone keep the stove going: ${wn.en}`);
}

/** czy na wieży nie ma już miejsca dla osoby `id`: stoi na niej (w przydziale) tyle innych osób, ile ma miejsc
    (`card.wieza`, kafelki jej obrysu). Kto już tam jest, może swój wybór podtrzymać; bez wieży nigdy. */
export function wiezaPelna(card: NightCard, assign: Record<string, string>, id: string): boolean {
  if (!card.wieza) return false;
  let inni = 0;
  for (const [kto, key] of Object.entries(assign)) if (kto !== id && key === WIEZA_KEY) inni++;
  return inni >= card.wieza;
}

/** zmiana przydziału na karcie; false, gdy takiej opcji nie ma albo nie wolno (też: wieża pełna) */
export function setAssign(st: GovState, id: string, key: string): boolean {
  const n = st.night;
  if (!n || n.confirmed) return false;
  const opt = n.card.people.find((p) => p.id === id)?.options.find((o) => o.key === key);
  if (!opt?.ok) return false;
  if (key === WIEZA_KEY && wiezaPelna(n.card, n.assign, id)) return false;
  n.assign[id] = key;
  return true;
}

/** „Jak radzi zarząd”: przydział z powrotem na propozycję każdej osoby; false, gdy nie ma karty albo już zatwierdzona.
    Dwa przejścia, bo wieża ma ograniczoną liczbę miejsc: najpierw osoby, których propozycja nie jest wieżą (zwalniają
    ją), potem te z wieżą przez limit `setAssign`. Propozycja mieści się w limicie (propose), więc wraca w całości,
    niezależnie od kolejności osób na karcie. */
export function resetAssign(st: GovState): boolean {
  const n = st.night;
  if (!n || n.confirmed) return false;
  for (const naWiezy of [false, true])
    for (const p of n.card.people) if ((p.proposal === WIEZA_KEY) === naWiezy) setAssign(st, p.id, p.proposal);
  return true;
}

// ---------------------------------------------------------------- noc

export function confirm(st: GovState, i: GovInput, fx: GovEffects, auto: boolean): void {
  const n = st.night;
  if (!n || n.confirmed) return;
  n.confirmed = true;
  n.t0 = st.trust;
  n.a0 = st.anger;
  // wyprawy w grupach według celu; grupa dostaje opis celu z opcji karty (stare karty go nie mają)
  const groups = new Map<string, { ids: string[]; cel?: Cel }>();
  for (const p of i.people) {
    const key = n.assign[p.id] ?? 'sen';
    if (key.startsWith('wyprawa:')) {
      const opt = n.card.people.find((c) => c.id === p.id)?.options.find((o) => o.key === key);
      if (!opt?.target) continue;
      const gr = groups.get(opt.target) ?? { ids: [], cel: opt.cel };
      gr.ids.push(p.id);
      groups.set(opt.target, gr);
    } else if (key.startsWith('warta:')) fx.guards.push({ id: p.id, post: key.slice(6) });
  }
  n.exp = [...groups].map(([target, { ids, cel }]) => ({ key: target, ids, target, ...(cel ? { cel } : {}) }));
  for (const gr of n.exp) {
    const cel = celGrupy(i, gr);
    for (const id of gr.ids) fx.away.push({ id, day: n.day + 1, hour: cel.powrot });
  }
  // tryb zombie: bez szabrowników; liczniki przy siatce na początek nocy (do raportu rano)
  if (zombieMode(st)) {
    n.raid = null;
    n.z0 = { killed: i.horde?.killed ?? 0, breaches: i.horde?.breaches ?? 0, bites: i.horde?.bites ?? 0 };
    n.bit0 = i.people.filter((p) => p.bitten).map((p) => p.id);
    n.zpeak = i.horde?.near ?? 0;
  }
  // napad: czy, gdzie i o której (zawsze te same trzy losowania); warta ze światłem odstrasza, także ta z menu
  const watchers = watchersOf(i, n.assign);
  const come = rnd(st) < raidChance(st, i) * deterrence(st, i, watchers);
  const posts = postsOf(i);
  let r = rnd(st) * posts.reduce((s, p) => s + p.weak, 0);
  let post = posts[posts.length - 1];
  for (const p of posts) {
    r -= p.weak;
    if (r <= 0) {
      post = p;
      break;
    }
  }
  // pościg za gościem wpuszczonym na noc: napad przy bramie (losowanie posterunku wyżej zostaje, żeby ciąg liczb był ten sam)
  if (st.tonight.poscig === n.day) post = posts.find((p) => p.key === 'brama') ?? post;
  const at = atHour(n.day, RAID_FROM) + Math.floor(rnd(st) * RAID_SPAN);
  // siła losowana od razu: symulacja pokaże tylu szabrowników, ilu przyszło, a rozstrzygnięcie użyje tej samej
  const attack = come ? round1(2 + rnd(st) * (2 + 0.55 * n.day)) : 0;
  if (!zombieMode(st)) {
    n.raid = { come, at, post: post.key, resolved: false, outcome: 'brak', attack, defense: 0, stolen: zeroStock() };
    if (come) fx.raid = { day: n.day, at, post: post.key, where: post.name, attack, people: raidersOf(attack) };
  }
  // kronika
  n.fire = { on: 0, all: 0, at: gameMin(i) };
  n.koza = [];
  const on = (pred: (k: string) => boolean) => i.people.filter((p) => pred(n.assign[p.id] ?? 'sen'));
  const watch = on(isFenceGuard);
  const koza = on((k) => k === KOZA_KEY);
  const out = on((k) => k.startsWith('wyprawa:'));
  const parts: Tx[] = [];
  const named = (list: GovPerson[], pl: string, en: string) => {
    const n = peopleNamesTx(list);
    return tx(`${pl} ${n.pl}`, `${n.en} ${en}`);
  };
  if (watch.length) parts.push(named(watch, 'na warcie', 'on watch'));
  if (koza.length) parts.push(named(koza, 'przy kozie', 'by the stove'));
  if (out.length) parts.push(named(out, 'na wyprawie', 'on a run'));
  parts.push(
    watch.length || koza.length || out.length
      ? tx('reszta śpi', 'the rest asleep')
      : tx('wszyscy śpią', 'everyone asleep'),
  );
  const night = txJoin(parts, ', ');
  const place = placeIn(i);
  logGov(
    st,
    i,
    tx(
      `${auto ? `${wordsOf(place).Zarzad} nie zdążył się naradzić, zostaje propozycja. ` : ''}Noc: ${night.pl}.`,
      `${auto ? `${wordsEn(place).Zarzad} ran out of time, so its suggestion stands. ` : ''}Night: ${night.en}.`,
    ),
    false,
    fx,
  );
  if (!auto) decision(st, i, 'karta');
}

/** Pościg za gościem wpuszczonym na noc (zwykły tryb): zaznacza tę noc (`GovState.tonight.poscig`: szansa napadu ×1,5 i
    napad przy bramie, co liczą `raidChance` i `confirm`). Gdy karta nocy jest już zatwierdzona, a napad jeszcze nie
    przyszedł ani się nie rozstrzygnął, daje mu drugą szansę (losowanie z połową szansy sprzed pościgu, razem około ×1,5,
    z karty i warty jak przy zatwierdzeniu) i wysyła nowy plan przy bramie najwcześniej za 20 minut gry. Ta sama noc
    drugi raz niczego nie zmienia. */
export function poscigNocy(st: GovState, i: GovInput, fx: GovEffects): void {
  const nd = nightDay(i);
  if (st.tonight.poscig === nd) return;
  const baza = raidChance(st, i);
  st.tonight.poscig = nd;
  const n = st.night;
  if (!n?.confirmed || n.day !== nd || !n.raid || n.raid.resolved || n.raid.come) return;
  const extra = clamp(round2(0.5 * baza * deterrence(st, i, watchersOf(i, n.assign))), 0, 0.5);
  if (rnd(st) >= extra) return;
  const brama = postsOf(i).find((p) => p.key === 'brama')!;
  const attack = round1(2 + rnd(st) * (2 + 0.55 * n.day));
  n.raid.come = true;
  n.raid.post = brama.key;
  n.raid.attack = attack;
  n.raid.at = Math.max(n.raid.at, gameMin(i) + 20);
  fx.raid = { day: n.day, at: n.raid.at, post: brama.key, where: brama.name, attack, people: raidersOf(attack) };
}

/** Wynik rozliczenia wyprawy: wpisy raportu (kłopoty albo powrót, potem ewentualne znaleziska), kto oberwał
    i ile łupu przyniesiono w tym rozliczeniu (to samo, co poszło do `fx.stock`). */
export interface Rozliczenie {
  lines: Tx[];
  hurt: { id: string; d: number } | null;
  loot: StockDelta;
}

/** Rozliczenie powrotu wyprawy `ppl` z celu `cel`, wspólne dla nocy i dnia. Losuje z ziarna zarządu w stałej kolejności:
    łup z przedziałów celu (po jednym losie na rodzaj, w kolejności `cel.lup`), czy były kłopoty, a przy kłopotach kto
    oberwał, ile i (w trybie zombie) czy ugryziony; potem znaleziska. Przy kłopotach łup spada o połowę. Skutki dopisuje
    do `fx` (zapasy, potrzeby, nastroje, ugryzienie, broń i amunicja ze znalezisk, powrót ludzi), a zaufanie do `st`.
    Cel z TARGETS (`zapas === null`) liczy wizyty w `st.visits` i dostaje mnożnik `lootMult`. Cel z miejsca dostaje łup
    z przedziałów bez mnożnika, przycięty (`ograniczLup`) do tego, co zostało w miejscu, i do udźwigu `ppl.length` osób;
    zabrane, wizyty i dzień ostatniej wizyty (`i.day`) idą do `st.miasto`, którego rozliczenie samo zakłada, gdy go nie
    ma. Z wskazówką na to miejsce (wiadomość od gościa, `GovState.wskazowki`) łup rośnie o połowę, a ryzyko maleje
    o połowę (`expRisk`); wskazówka jest zużywana. Pusta `ppl` nic nie losuje i nic nie zmienia. */
export function rozliczWyprawe(st: GovState, i: GovInput, fx: GovEffects, cel: Cel, ppl: GovPerson[]): Rozliczenie {
  const lines: Tx[] = [];
  const got = zeroStock();
  if (!ppl.length) return { lines, hurt: null, loot: got };
  let hurt: Rozliczenie['hurt'] = null;
  const m = lootMult(st, cel);
  if (cel.zapas === null) st.visits[cel.klucz] = (st.visits[cel.klucz] ?? 0) + 1;
  // wskazówka od gościa na to miejsce: łup ×1,5 (ryzyko ×0,5 liczy już `expRisk`), zużyta po rozliczeniu
  const wsk = maWskazowke(st, cel.klucz) ? WSKAZOWKA_LUP : 1;
  for (const [k, [a, b]] of Object.entries(cel.lup) as [LootKey, [number, number]][])
    got[k] = Math.round(rint(st, a, b) * m * wsk * (ppl.length > 1 ? 1.6 : 1));
  const risk = Math.max(...ppl.map((p) => expRisk(st, p, cel, ppl.length)));
  wskazowka(st, cel.klucz);
  const trouble = rnd(st) < risk;
  if (trouble) for (const k of Object.keys(got) as LootKey[]) got[k] = Math.floor(got[k] / 2);
  if (cel.zapas !== null) {
    Object.assign(got, ograniczLup(got, Math.min(zostaloZMiejsca(st, cel), UDZWIG_NA_OSOBE * ppl.length)));
    wlaczMiasto(st);
    const miasto = st.miasto!;
    const wyniesiono = Object.values(got).reduce((a, b) => a + b, 0);
    miasto.zabrano[cel.klucz] = (miasto.zabrano[cel.klucz] ?? 0) + wyniesiono;
    miasto.wizyty[cel.klucz] = (miasto.wizyty[cel.klucz] ?? 0) + 1;
    miasto.ostatnia[cel.klucz] = i.day;
  }
  const who = peopleNamesTx(ppl);
  const where = cel.nazwa;
  if (trouble) {
    const ranny = ppl[rint(st, 0, ppl.length - 1)];
    const d = -rint(st, 20, 35);
    addNeeds(fx, ranny.id, { health: d });
    hurt = { id: ranny.id, d };
    const has = stockTx(got);
    const zombie = zombieMode(st);
    // w trybie zombie kłopoty to szwendacze, a co trzeci kłopot kończy się ugryzieniem
    const bitten = zombie && rnd(st) < 0.35;
    if (bitten) (fx.bitten ??= []).push(ranny.id);
    const harm = bitten ? g(ranny, 'jest ugryziony', 'jest ugryziona') : g(ranny, 'jest ranny', 'jest ranna');
    lines.push(
      tx(
        `${who.pl} ${verbPl(ppl, 'trafił', 'trafiła', 'trafili', 'trafiły')} na ${zombie ? 'szwendaczy' : 'szabrowników'} (${where.pl}). ${ranny.name} ${harm}.${has.pl ? ` Udało się przynieść: ${has.pl}.` : ' Wszystko zostało po drodze.'}`,
        `${who.en} ran into ${zombie ? 'shamblers' : 'looters'} at ${where.en}. ${ranny.name} ${bitten ? 'was bitten' : 'got hurt'}.${has.en ? ` ${oni(ppl, 'He', 'She', 'They')} still brought back ${has.en}.` : ` ${oni(ppl, 'He', 'She', 'They')} had to drop the lot on the way back.`}`,
      ),
    );
    for (const p of ppl) fx.moods.push({ id: p.id, why: g(p, 'Ledwo uciekłem', 'Ledwo uciekłam'), d: -6, hours: 12 });
  } else {
    const has = stockTx(got);
    lines.push(
      has.pl
        ? tx(
            `${who.pl} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${where.pl}. ${verbPl(ppl, 'Przyniósł', 'Przyniosła', 'Przynieśli', 'Przyniosły')}: ${has.pl}.`,
            `${who.en} came back from ${where.en}, carrying ${has.en}.`,
          )
        : tx(
            `${who.pl} ${verbPl(ppl, 'wrócił', 'wróciła', 'wrócili', 'wróciły')} z miejsca: ${where.pl} z pustymi rękami.`,
            `${who.en} came back from ${where.en} empty-handed.`,
          ),
    );
    if (has.pl) {
      mood(st, 1, 0);
      for (const p of ppl)
        fx.moods.push({ id: p.id, why: g(p, 'Wróciłem z łupem', 'Wróciłam z łupem'), d: 4, hours: 12 });
    }
  }
  for (const k of Object.keys(got) as LootKey[]) fx.stock[k] += got[k];
  const found = finds(st, fx);
  if (found.length) {
    const all = txJoin(found, ', ');
    lines.push(
      tx(
        `${verbPl(ppl, 'Znalazł', 'Znalazła', 'Znaleźli', 'Znalazły')} też: ${all.pl}.`,
        `${oni(ppl, 'He', 'She', 'They')} also found: ${all.en}.`,
      ),
    );
  }
  for (const p of ppl) addNeeds(fx, p.id, { rest: cel.range === 'daleko' ? -30 : -15 });
  fx.back.push(...ppl.map((p) => p.id));
  return { lines, hurt, loot: got };
}

/** powrót nocnej wyprawy z karty (cel z miejsca albo z TARGETS): rozliczenie wspólną funkcją i wpisy do raportu nocy */
function returnExp(st: GovState, i: GovInput, fx: GovEffects, gr: { ids: string[]; target: string; cel?: Cel }): void {
  const n = st.night!;
  const cel = celGrupy(i, gr);
  n.returned.push(gr.target);
  const ppl = gr.ids.map((id) => i.people.find((p) => p.id === id)).filter((p): p is GovPerson => !!p);
  if (!ppl.length) return;
  const r = rozliczWyprawe(st, i, fx, cel, ppl);
  n.lines.push(...r.lines);
  if (r.hurt) n.hurt.push(r.hurt);
  for (const k of STOCK_KEYS) n.loot[k] += r.loot[k];
}

/** nazwy broni w bierniku do raportu (te same id co w src/sim/bron.ts) */
const ARM_ACC: Record<string, string> = {
  noz: 'nóż',
  lom: 'łom',
  kij: 'kij z gwoździami',
  strzelba: 'strzelbę',
  kusza: 'kuszę',
  rewolwer: 'rewolwer',
};
const ARM_ACC_EN: Record<string, string> = {
  noz: 'a knife',
  lom: 'a crowbar',
  kij: 'a nail bat',
  strzelba: 'a shotgun',
  kusza: 'a crossbow',
  rewolwer: 'a revolver',
};

/** Znaleziska z wyprawy: amunicja (w trybie zombie w 30% wypraw, w zwykłym w 10%) i broń (12% i 8%). */
function finds(st: GovState, fx: GovEffects): Tx[] {
  const zombie = zombieMode(st);
  const out: Tx[] = [];
  const ammo = (k: 'naboje' | 'loftki' | 'belty', n: number) => {
    fx.ammo ??= {};
    fx.ammo[k] = (fx.ammo[k] ?? 0) + n;
  };
  if (rnd(st) < (zombie ? 0.3 : 0.1)) {
    const n = rint(st, 2, 8);
    ammo('naboje', n);
    out.push(tx(`${n} naboi`, `${n} rounds`));
  }
  if (rnd(st) < (zombie ? 0.12 : 0.08)) {
    const pool = zombie ? ['noz', 'lom', 'kij', 'strzelba', 'kusza'] : ['noz', 'lom', 'kij'];
    const w = pool[rint(st, 0, pool.length - 1)];
    (fx.arms ??= []).push(w);
    out.push(tx(ARM_ACC[w], ARM_ACC_EN[w]));
    if (w === 'strzelba') ammo('loftki', rint(st, 4, 8));
    if (w === 'kusza') ammo('belty', rint(st, 6, 10));
  }
  return out;
}

function resolveRaid(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night!;
  const r = n.raid!;
  r.resolved = true;
  if (!r.come) {
    const watched = Object.values(n.assign).some(isFenceGuard);
    n.lines.push(
      watched
        ? tx(
            'Nikt nie próbował wejść. Pewnie widzieli wartę przy siatce.',
            'Nobody tried to get in. They probably saw the watch at the fence.',
          )
        : tx('Nikt nie próbował wejść.', 'Nobody tried to get in.'),
    );
    for (const p of i.people) addNeeds(fx, p.id, { safe: 4 });
    return;
  }
  const posts = postsOf(i);
  // załatana dziura: idą do bramy
  const post = posts.find((p) => p.key === r.post) ?? posts.find((p) => p.key === 'brama')!;
  // warta z karty, potem ta, która stoi z menu (bez dubli i bez tych na wyprawie)
  const guards: { p: GovPerson; post: string }[] = i.people
    .filter((p) => isFenceGuard(n.assign[p.id] ?? ''))
    .map((p) => ({ p, post: n.assign[p.id].slice(6) }));
  for (const s of standingGuards(i)) {
    const p = i.people.find((q) => q.id === s.id);
    const key = n.assign[s.id] ?? '';
    if (p && s.post !== KOZA && !key.startsWith('warta:') && !key.startsWith('wyprawa:'))
      guards.push({ p, post: s.post });
  }
  const awake: { p: GovPerson; post: string }[] = [];
  for (const gd of guards) {
    const p = gd.p;
    const pr = p.needs.rest < 15 ? 0.5 : p.needs.rest < 30 ? 0.15 : 0;
    if (rnd(st) < pr) {
      n.lines.push(tx(`${p.name} ${g(p, 'zasnął', 'zasnęła')} na warcie.`, `${p.name} fell asleep on watch.`));
      n.slept.push(p.id);
    } else awake.push(gd);
  }
  const defense = defenseAt(st, i, post.key, awake);
  // siła z planu (losowana przy zatwierdzeniu karty); stary zapis bez niej losuje teraz
  const attack = r.attack || round1(2 + rnd(st) * (2 + 0.55 * n.day));
  r.attack = attack;
  r.defense = defense;
  const here = awake.filter((gd) => gd.post === post.key).map((gd) => gd.p);
  const result = (outcome: 'odparty' | 'wtargnięcie', stolen = zeroStock()) => {
    fx.raidResult = {
      day: n.day,
      outcome,
      post: post.key,
      where: post.name,
      attack,
      defense,
      stolen: { ...stolen },
      slept: [...n.slept],
    };
  };
  if (defense >= attack) {
    r.outcome = 'odparty';
    const why = awake.length
      ? tx('warta usłyszała i przybiegła', 'the watch heard and came running')
      : st.flags.dog
        ? tx('pies narobił hałasu', 'the dog made a racket')
        : tx('siatka wytrzymała', 'the fence held');
    const at = txOf(post.name);
    if (here.length) {
      const names = peopleNamesTx(here);
      n.lines.push(
        tx(
          `W nocy szabrownicy podeszli ${at.pl}. ${names.pl} ${verbPl(here, 'przegonił', 'przegoniła', 'przegonili', 'przegoniły')} ich.`,
          `In the night, looters tried their luck ${at.en}. ${names.en} chased them off.`,
        ),
      );
    } else
      n.lines.push(
        tx(
          `Ktoś kręcił się w nocy ${at.pl}, ale ${why.pl}.`,
          `Someone was prowling ${at.en} in the night, but ${why.en}.`,
        ),
      );
    mood(st, 2, -1);
    for (const p of here) fx.moods.push({ id: p.id, why: 'Przegoniliśmy szabrowników', d: 6, hours: 12 });
    for (const p of i.people) addNeeds(fx, p.id, { safe: 8 });
    logGov(st, i, n.lines[n.lines.length - 1], true, fx);
    result('odparty');
    return;
  }
  r.outcome = 'wtargnięcie';
  const loss = lossIfEntered(i);
  const stolen = zeroStock();
  stolen.wood = -addStock(i, fx, 'wood', -loss.wood);
  stolen.supplies = -addStock(i, fx, 'supplies', -loss.supplies);
  stolen.scrap = -addStock(i, fx, 'scrap', -Math.floor(0.3 * (i.stock.scrap ?? 0)));
  r.stolen = stolen;
  result('wtargnięcie', stolen);
  const took = stockTx(stolen);
  const at = txOf(post.name);
  n.lines.push(
    tx(
      `Szabrownicy weszli ${at.pl} i zabrali: ${took.pl || 'niewiele, bo nic nie leżało na wierzchu'}.`,
      `Looters got in ${at.en} and took ${took.en || 'very little, since nothing was lying around'}.`,
    ),
  );
  logGov(st, i, n.lines[n.lines.length - 1], true, fx);
  mood(st, -2, 4);
  for (const p of i.people) {
    addNeeds(fx, p.id, { safe: -25 });
    fx.moods.push({ id: p.id, why: 'Szabrownicy weszli na podwórko', d: -8, hours: 12 });
  }
  if (here.length) {
    const v = here[rint(st, 0, here.length - 1)];
    addNeeds(fx, v.id, { health: -25 });
    n.hurt.push({ id: v.id, d: -25 });
    n.lines.push(tx(`${v.name} ${g(v, 'oberwał', 'oberwała')} ${at.pl}.`, `${v.name} got hurt ${at.en}.`));
  }
}

function morning(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night!;
  for (const l of st.later.filter((x) => x.day === n.day)) {
    for (const [k, v] of Object.entries(l.stock) as [LootKey, number][]) addStock(i, fx, k, v);
    // chorzy od gościa: rano ktoś z zarządu zaczyna chorować
    if (l.sick) fx.sick += l.sick;
    n.lines.push(l.line);
  }
  st.later = st.later.filter((x) => x.day !== n.day);
  const watch = i.people.filter((p) => isFenceGuard(n.assign[p.id] ?? ''));
  // przy kozie: kto stał tam w nocy według symulacji (karta albo menu kozy), bez posterunków: z karty
  const simPosts = i.people.some((p) => p.post !== undefined);
  const koza = i.people.filter((p) => (simPosts ? (n.koza ?? []).includes(p.id) : n.assign[p.id] === KOZA_KEY));
  st.lastGuards = [...watch, ...koza].map((p) => p.id);
  const guards = watch.filter((p) => !n.slept.includes(p.id));
  // noc bez snu: symulacja z posterunkami liczy ją sama, atrapa bez nich dostaje ją tutaj
  if (!simPosts) for (const p of [...watch, ...koza]) addNeeds(fx, p.id, { rest: n.slept.includes(p.id) ? -15 : -30 });
  for (const p of guards) fx.moods.push({ id: p.id, why: 'Całą noc na warcie', d: -2, hours: 8 });
  for (const p of koza) fx.moods.push({ id: p.id, why: 'Całą noc przy kozie', d: -1, hours: 8 });
  if (guards.length) {
    const names = peopleNamesTx(guards);
    n.lines.push(
      tx(
        `${names.pl} nie ${verbPl(guards, 'spał', 'spała', 'spali', 'spały')} całą noc.`,
        `${names.en} stayed up all night.`,
      ),
    );
  }
  // kuchnia rano: ile nocy paliła się koza i kto przy niej czuwał
  const fire = n.fire?.all ? round2(n.fire.on / n.fire.all) : undefined;
  if (i.kitchen !== null && fire !== undefined) n.lines.push(kitchenLine(i.kitchen, fire, koza, i.stock.wood));
  if (zombieMode(st)) n.lines.push(...hordeLines(i, n));
  if (!n.lines.length) n.lines.push(tx('Spokojna noc.', 'A quiet night.'));
  dailyDrift(st, i);
  const far = n.exp.filter((e) => celGrupy(i, e).range === 'daleko').flatMap((e) => e.ids);
  const report: NightReport = {
    day: n.day,
    lines: [...n.lines],
    raid: n.raid?.outcome ?? 'brak',
    stolen: n.raid?.stolen ?? zeroStock(),
    loot: { ...n.loot },
    hurt: n.hurt.map((h) => ({ id: h.id, name: i.people.find((p) => p.id === h.id)?.name ?? h.id, d: h.d })),
    tired: [...guards.map((p) => p.id), ...koza.map((p) => p.id), ...far],
    trust: st.trust,
    anger: st.anger,
    dTrust: round2(st.trust - n.t0),
    dAnger: round2(st.anger - n.a0),
    kitchen: i.kitchen === null ? null : round1(i.kitchen),
    fire,
    koza: koza.map((p) => p.name),
  };
  st.report = report;
  st.reports.push(report);
  if (st.reports.length > 10) st.reports.shift();
  st.night = null;
  const t = Math.round(st.trust);
  const a = Math.round(st.anger);
  logGov(
    st,
    i,
    tx(
      `Rano po nocy ${n.day}: zaufanie ${t}, wkurzenie ${a}.`,
      `Morning after night ${n.day}: trust ${t}, anger ${a}.`,
    ),
    false,
    fx,
  );
}

/** raport z nocy w trybie zombie: ilu było przy siatce, ilu zabitych, ile razy siatka puściła, kto ugryziony */
function hordeLines(i: GovInput, n: NonNullable<GovState['night']>): Tx[] {
  const h = i.horde;
  if (!h) return [];
  const z0 = n.z0 ?? { killed: 0, breaches: 0, bites: 0 };
  const out: Tx[] = [];
  const peak = Math.max(n.zpeak ?? 0, h.near);
  out.push(
    peak
      ? tx(
          `W nocy przy siatce było do ${peak} ${peak === 1 ? 'szwendacza' : 'szwendaczy'}.`,
          `In the night there were up to ${peak} ${peak === 1 ? 'shambler' : 'shamblers'} at the fence.`,
        )
      : tx('W nocy przy siatce było spokojnie.', 'The fence was quiet all night.'),
  );
  const killed = h.killed - z0.killed;
  if (killed > 0) out.push(tx(`Zabitych szwendaczy: ${killed}.`, `Shamblers killed: ${killed}.`));
  const broke = h.breaches - z0.breaches;
  if (broke > 0)
    out.push(
      tx(
        `Siatka puściła w ${broke} ${broke === 1 ? 'miejscu' : 'miejscach'}. Trzeba łatać.`,
        `The fence gave way in ${broke} ${broke === 1 ? 'place' : 'places'}. It needs patching.`,
      ),
    );
  const bit = i.people.filter((p) => p.bitten && !(n.bit0 ?? []).includes(p.id));
  if (bit.length) {
    const names = peopleNamesTx(bit);
    out.push(
      tx(
        `Ugryzieni: ${names.pl}. Gorączka zabija w niecałą dobę.`,
        `Bitten: ${names.en}. The fever kills in less than a day.`,
      ),
    );
  }
  return out;
}

/** przebieg nocy po zatwierdzeniu: powroty z wypraw, napad o swojej godzinie, raport o 6:00 */
export function nightTick(st: GovState, i: GovInput, fx: GovEffects): void {
  const n = st.night;
  if (!n?.confirmed) return;
  const t = gameMin(i);
  for (const gr of n.exp) {
    if (!n.returned.includes(gr.target) && t >= atHour(n.day + 1, celGrupy(i, gr).powrot)) returnExp(st, i, fx, gr);
  }
  if (n.raid && !n.raid.resolved && t >= n.raid.at) resolveRaid(st, i, fx);
  if (i.horde) n.zpeak = Math.max(n.zpeak ?? 0, i.horde.near);
  // ogień w kozie od 22:00 do rana w minutach gry (do raportu: czy w kuchni było ciepło) i kto przy niej stał
  if (n.fire && i.kitchen !== null) {
    const from = Math.max(n.fire.at, atHour(n.day, 22));
    const to = Math.min(t, atHour(n.day + 1, MORNING));
    if (to > from) {
      n.fire.all += to - from;
      if (i.kozaLit) n.fire.on += to - from;
    }
    n.fire.at = Math.max(n.fire.at, t);
    if (t >= atHour(n.day, 22) && t < atHour(n.day + 1, MORNING))
      for (const s of standingGuards(i)) if (s.post === KOZA && !n.koza?.includes(s.id)) (n.koza ??= []).push(s.id);
  }
  if (t >= atHour(n.day + 1, MORNING)) morning(st, i, fx);
}

/** linia raportu o kuchni rano: jak długo paliła się koza, kto przy niej czuwał i ile stopni o 6:00 */
function kitchenLine(t: number, fire: number, koza: GovPerson[], wood: number): Tx {
  const deg = `${Math.round(t)}°C`;
  const warm = t >= 18 ? 'ciepło' : t >= 15 ? 'chłodno' : 'zimno';
  const warmEn = t >= 18 ? 'warm' : t >= 15 ? 'chilly' : 'cold';
  const rano = `Rano w kuchni ${warm}, ${deg}.`;
  const morningEn = `The kitchen is ${warmEn} this morning, ${deg}.`;
  if (koza.length) {
    const names = peopleNamesTx(koza);
    const who = `${names.pl} ${verbPl(koza, 'czuwał', 'czuwała', 'czuwali', 'czuwały')} przy kozie`;
    const whoEn = `${names.en} watched the stove`;
    if (fire >= 0.9)
      return tx(`${who} i ogień palił się całą noc. ${rano}`, `${whoEn}, and the fire burned all night. ${morningEn}`);
    const short = wood < WOOD_PER_HOUR;
    return tx(
      `${who}, ale ${short ? 'drewna nie starczyło do rana' : 'koza część nocy była zimna'}. ${rano}`,
      `${whoEn}, but ${short ? 'the wood ran out before morning' : 'the stove was cold for part of the night'}. ${morningEn}`,
    );
  }
  if (fire >= 0.9) return tx(`Koza paliła się całą noc. ${rano}`, `The stove burned all night. ${morningEn}`);
  return tx(
    `Nikt nie dokładał do kozy i ${fire > 0 ? 'zgasła w nocy' : 'wystygła wieczorem'}. ${rano}`,
    `Nobody fed the stove, and it ${fire > 0 ? 'went out in the night' : 'went cold in the evening'}. ${morningEn}`,
  );
}
