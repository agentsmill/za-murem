/* Pierwszy kontakt z osadą AI: karta „Poseł z osady …” (docs/superpowers/plans/2026-10-24-osada-ai-etap-2.md, zadanie 4; projekt
   docs/superpowers/specs/2026-10-20-osada-ai-design.md, „Jak to wygląda dla gracza”: pierwszy kontakt w dniach 4–6, z ziarna,
   odsłania kwadrat osady). To zwykła karta zarządu (`GEventDef`, id `posel`, w `M1_EVENTS`), ale nie z losowania: waga zero,
   a wyzwala ją sytuacja jak pogrzeb i dym (`poselCzeka` w `eventTick`, wydarzenia.ts).

   Kiedy. Wejście zarządu ma osadę (`GovInput.osada`, tylko w grze z ?osada=1, gdy osada już powstała, w trybie zwykłym) i
   gracz jej jeszcze nie zna (`odkryta` fałsz). Poseł przychodzi w dniu `dzienKontaktu` z wejścia (4, 5 albo 6, z ziarna osady:
   `dzienKontaktu(ziarno)`, liczy go gospodarz) od 9:00, w dzień albo wieczorem, gdy nic innego nie czeka na decyzję i od
   ostatniej decyzji gracza minęło `QUIET` sekund przy ekranie. Nigdy przed 4. dniem, choćby wejście podało wcześniejszy dzień;
   dzień spoza liczb skończonych (NaN, nieskończoność) to brak dnia, więc karty nie ma. Gdy w tym dniu coś go wstrzyma, przychodzi
   przy najbliższej okazji, od 9:00 któregoś z następnych dni. Raz: karta zapisuje się w `ev.done`, więc nie wraca, choćby
   gospodarz nie zdążył odsłonić osady. Nie losuje niczego i niczego nie zużywa, a po wystawieniu kończy krok zarządu (`return` w
   `eventTick`), więc nawet gdy odstęp do losowej karty jest już należny, losowa karta nie nadpisze posła. Gra bez osady w wejściu
   (bez flagi, tryb zombie, przed 6:00 drugiego dnia, osada, której zabrakło) ma te same losowania i skróty co przed kartą;
   pierwsze losowanie z ziarna zarządu dopiero po odpowiedzi gracza (zwykły odstęp do następnej karty).

   Co mówi. Dane karty (`DanePosla`) powstają przy jej wystawieniu i zostają w stanie zarządu: nazwa osady i kierunek od domu
   (zdania w obu językach, z kierunku, bez nazw ulic), dzień kontaktu, ludność i budowle w tej chwili, licznik odwołań ich
   zarządu i ewentualny upadek. Tekst i wybory czytają tylko te dane i słownik miejsca (w bloku brama i zarząd, w domu furtka
   i komitet ulicy), więc karta czeka tak samo po zapisie i wczytaniu, także gdy osada w wejściu już się nie pojawi. Poseł
   podaje ludność i budowle (zgoda czasownika z liczbą po polsku, „nic jeszcze nie postawili” przy zerze). Jedno zdanie więcej
   tylko z liczb, bez zmyślania: gdy zarząd osady odwołano już raz albo kilka razy (`odwolania`), albo gdy osada upadła przed
   kontaktem (dzień i powód, bez liczb ludności i budowli).

   Wybory (wszystkie dostępne) ruszają tylko nas: zaufanie, wkurzenie i kronikę. Silnik osady o nas nie wie (decyzja 6 ze
   specyfikacji), więc nic z karty nie wchodzi do jej gry. Każdy wybór odsłania osadę: `GovEffects.odkryjOsade` z dniem, ludnością
   i budowlami, które poseł podał (z danych karty, nie z chwili odpowiedzi), a gospodarz woła `OsadaGry.odkryj` (src/main.ts).
   Trzy wybory mają trzy różne powody i żaden nie jest gorszy od innego na obu miarach naraz (pilnuje tego test): (+1 zaufania, 0)
   bez ryzyka, (+2, +1 wkurzenia) więcej zaufania za cenę wkurzenia, (0, −1) ulga, gdy wkurzenie jest wysokie.

   Moduł zostaje czysty jak reszta zarządu: nic z DOM, zegara, losowania spoza ziarna, sieci ani modułów Node, a o osadzie wie tylko
   z pola wejścia, więc nie importuje src/sim, src/ai ani src/ui (pilnuje tego tests/unit/ai-czystosc.test.ts). */

import { liczba, mnogaPl, type Tx, tx, wielka } from '../core/jezyk.ts';
import type { Words, WordsEn } from './miejsce.ts';
import type { GChoice, GEventDef, GovHost, Pora } from './tresc.ts';
import type { GovInput, GovState, OdkrycieOsady } from './typy.ts';
import { atHour, gameMin, QUIET } from './wspolne.ts';

/** poseł nie przychodzi przed tym dniem gry */
export const PIERWSZY_DZIEN_KONTAKTU = 4;
/** dzień kontaktu to jeden z tylu kolejnych dni od `PIERWSZY_DZIEN_KONTAKTU` (4, 5 albo 6) */
export const DNI_KONTAKTU = 3;
/** Poseł przychodzi od tej godziny, w dniu kontaktu i w każdym następnym, jeśli coś go wstrzymało; przed nią nigdy. */
export const GODZINA_POSLA = 9;

/** Dzień kontaktu z ziarna osady (`ziarnoOsady`, src/ai/kwadrat.ts): 4, 5 albo 6. Czyste liczby, bez losowania. */
export const dzienKontaktu = (ziarno: number): number => PIERWSZY_DZIEN_KONTAKTU + (ziarno % DNI_KONTAKTU);

/** Dane karty posła, zamrożone w chwili jej wystawienia (w stanie zarządu, zwykły JSON): to, co poseł powiedział, niezależnie od
    tego, co osada robi potem. `dzien` to dzień naszej gry, w którym poseł przyszedł, a nie dzień z ziarna, na który kontakt był
    zaplanowany: karta bywa spóźniona (wstrzymała ją uchwała, karta nocy albo inna karta, zapis wczytano po dniu kontaktu), a liczby
    ludności i budowli są z chwili, w której stoi pod bramą, więc ten dzień idzie do `kontakt.dzien` osady („z ostatniego kontaktu”);
    `odwolania` i `upadla` jak w `WejscieOsady`. */
export interface DanePosla {
  nazwa: Tx;
  nazwaZ: Tx;
  kierunek: Tx;
  dzien: number;
  ludnosc: number;
  budowle: number;
  odwolania: number;
  upadla?: { dzien: number; powod: 'pustka' | 'exodus' };
}

/** Czy poseł ma teraz przyjść (wołane z `eventTick`, gdy nic nie czeka na decyzję i jest pora z kartami): patrz nagłówek modułu.
    Niczego nie zmienia i niczego nie losuje. */
export function poselCzeka(st: GovState, i: GovInput, pora: Pora): boolean {
  const o = i.osada;
  if (!o || o.odkryta || st.ev.done[POSEL_EVENT.id]) return false;
  if (POSEL_EVENT.tryby?.includes(st.mode ?? 'zwykly') === false || !POSEL_EVENT.when.includes(pora)) return false;
  // dzień kontaktu spoza liczb skończonych (NaN, nieskończoność) to brak dnia, więc karty nie ma; nigdy przed 4. dniem, także gdy
  // wejście podaje wcześniejszy dzień (0, ujemny, ułamek)
  if (!Number.isFinite(o.dzienKontaktu)) return false;
  const dzien = Math.max(PIERWSZY_DZIEN_KONTAKTU, o.dzienKontaktu);
  if (gameMin(i) < atHour(dzien, GODZINA_POSLA) || i.hour < GODZINA_POSLA) return false;
  const ostatnia = st.decisions.at(-1)?.s ?? Number.NEGATIVE_INFINITY;
  return i.screen >= ostatnia + QUIET;
}

// ---------------------------------------------------------------------------------------------------------------------
// Teksty
// ---------------------------------------------------------------------------------------------------------------------

/** forma słowa przy liczbie, bez samej liczby: „osoba” dla 1, „osoby” dla 2–4 poza 12–14, „osób” dla reszty (reguła `mnogaPl`) */
const formaPl = (n: number, jedna: string, kilka: string, wiele: string): string =>
  mnogaPl(n, jedna, kilka, wiele).replace(/^\S+ /, '');

const nrPl = (n: number): string => liczba(n, 0, 'pl');
const nrEn = (n: number): string => liczba(n, 0, 'en');
const razyPl = (n: number): string => (n === 1 ? 'raz' : n === 2 ? 'dwa razy' : `${nrPl(n)} razy`);
const razyEn = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${nrEn(n)} times`);

/** Scena: kto stoi pod bramą (słowa miejsca: brama i zarząd albo furtka i komitet ulicy). */
function scena(s: Words, e: WordsEn): Tx {
  return tx(
    `${wielka(s.brama.pod)} stoi obcy z białą szmatą na kiju. Na piersi ma plakietkę „Poseł”, wydrukowaną chyba na ostatnim tuszu w okolicy. Przyszedł się przedstawić, bo sąsiadów wypada znać, i prosi o rozmowę z ${s.zarzad.n}.`,
    `A stranger is standing at ${e.brama} with a white rag on a stick. His badge says “Envoy”, printed with what must be the last ink in the area. He has come to introduce himself, because it pays to know your neighbours, and he asks to speak to ${e.zarzad}.`,
  );
}

/** Co poseł mówi o osadzie: gdzie leży, ile tam ludzi i budowli; jedno zdanie więcej o odwołaniach ich zarządu, a gdy osada
    upadła, zamiast liczb ludności i budowli zdanie o upadku (dzień i powód). Same liczby z danych karty. */
function oOsadzie(d: DanePosla, s: Words, e: WordsEn): Tx {
  const k = d.kierunek;
  if (d.upadla) {
    const powod =
      d.upadla.powod === 'pustka'
        ? tx('nikt tam nie przeżył', 'nobody there survived')
        : tx('ludzie przestali wierzyć i rozeszli się', 'the people lost faith and scattered');
    return tx(
      `Mówi, że jego osada leżała ${k.pl} od was, ale już jej nie ma. Upadła w dniu ${nrPl(d.upadla.dzien)}: ${powod.pl}.`,
      `He says their settlement lay ${k.en} of you, but it is gone now. It fell on day ${nrEn(d.upadla.dzien)}: ${powod.en}.`,
    );
  }
  const mieszka = `${formaPl(d.ludnosc, 'Mieszka', 'Mieszkają', 'Mieszka')} tam ${mnogaPl(d.ludnosc, 'osoba', 'osoby', 'osób')}`;
  const stoi = `${formaPl(d.budowle, 'stoi', 'stoją', 'stoi')} ${mnogaPl(d.budowle, 'budowla', 'budowle', 'budowli')}`;
  const ludzieEn = `${nrEn(d.ludnosc)} ${d.ludnosc === 1 ? 'person' : 'people'}`;
  const budowleEn = `${nrEn(d.budowle)} ${d.budowle === 1 ? 'building' : 'buildings'}`;
  const odwolano =
    d.odwolania > 0
      ? tx(
          ` Dodaje, że ich ${s.zarzad.krotko} odwołano już ${razyPl(d.odwolania)}.`,
          ` He adds that ${e.krotko} there has already been recalled ${razyEn(d.odwolania)}.`,
        )
      : tx('', '');
  return tx(
    `Mówi, że jego osada leży ${k.pl} od was. ${mieszka}${d.budowle > 0 ? ` i ${stoi}.` : ', ale nic jeszcze nie postawili.'}${odwolano.pl}`,
    `He says their settlement lies ${k.en} of you, with ${ludzieEn} living there and ${d.budowle > 0 ? `${budowleEn} standing` : 'nothing built yet'}.${odwolano.en}`,
  );
}

/** Skutek wyboru dla gospodarza: osada odsłonięta z tym, co poseł podał. */
const odkrycie = (d: DanePosla): OdkrycieOsady => ({ dzien: d.dzien, ludnosc: d.ludnosc, budowle: d.budowle });

/** Skutek wyboru na dwóch miarach zarządu: o ile zmienia się zaufanie i wkurzenie (`GovHost.mood`). */
interface SkutekNastroju {
  zaufanie: number;
  wkurzenie: number;
}

/** Wybór karty: zaufanie i wkurzenie, wpis do kroniki (z nazwą osady) i odsłonięcie osady. */
function wybor(h: GovHost, d: DanePosla, label: Tx, skutek: SkutekNastroju, wpis: Tx): GChoice {
  return {
    label,
    ok: true,
    run: () => {
      h.mood(skutek.zaufanie, skutek.wkurzenie);
      h.log(tx(`${d.nazwa.pl}: ${wpis.pl}`, `${d.nazwa.en}: ${wpis.en}`));
      h.odkryjOsade(odkrycie(d));
    },
  };
}

/** Wydarzenie `posel`: pierwszy kontakt z osadą AI. Poza losowaniem (waga zero), wyzwalane przez `poselCzeka`; w trybie zwykłym, w
    dzień i wieczór; raz. `make` daje null bez osady w wejściu. */
export const POSEL_EVENT: GEventDef<DanePosla> = {
  id: 'posel',
  once: true,
  tryby: ['zwykly'],
  when: ['dzien', 'wieczor'],
  w: () => 0,
  make: (h) => {
    const o = h.osada();
    if (!o) return null;
    return {
      nazwa: tx(o.nazwa.pl, o.nazwa.en),
      nazwaZ: tx(o.nazwaZ.pl, o.nazwaZ.en),
      kierunek: tx(o.kierunek.pl, o.kierunek.en),
      dzien: h.day(),
      ludnosc: o.ludnosc,
      budowle: o.budowle,
      odwolania: o.odwolania,
      ...(o.upadla ? { upadla: { ...o.upadla } } : {}),
    };
  },
  title: (_h, d) => tx(`Poseł ${d.nazwaZ.pl}`, `An envoy ${d.nazwaZ.en}`),
  text: (h, d) => {
    const s = h.words();
    const e = h.wordsEn();
    const a = scena(s, e);
    const b = oOsadzie(d, s, e);
    return tx(`${a.pl}\n${b.pl}`, `${a.en}\n${b.en}`);
  },
  choices: (h, d) => {
    const s = h.words();
    const e = h.wordsEn();
    const k = d.kierunek;
    return [
      // bez ryzyka: obcy zostaje za bramą, ludzie nic nie mają przeciw, zaufanie rośnie o 1
      wybor(
        h,
        d,
        tx(`Wysłuchać go ${s.brama.przy}`, `Hear him out at ${e.brama}`),
        { zaufanie: 1, wkurzenie: 0 },
        tx(
          `poseł wypił łyk wody i opowiedział wszystko, co wiedział. Teraz wiecie, co leży ${k.pl} od was.`,
          `the envoy had a sip of water and told you everything he knew. Now you know what lies ${k.en} of you.`,
        ),
      ),
      // gościnność ma cenę: zaufanie rośnie o 2, ale część ludzi nie chce obcego pod dachem, więc wkurzenie rośnie o 1
      wybor(
        h,
        d,
        tx('Zaprosić do środka na herbatę z pokrzyw', 'Invite him in for nettle tea'),
        { zaufanie: 2, wkurzenie: 1 },
        tx(
          'poseł przesiedział godzinę przy kozie z kubkiem herbaty z pokrzyw. Część ludzi patrzyła na obcego spode łba, ale rozmowa wyszła dobra.',
          'the envoy spent an hour by the stove with a mug of nettle tea. Some of your people eyed the stranger with suspicion, but the talk went well.',
        ),
      ),
      // ulga: ludzie odetchnęli, że obcy poszedł, więc wkurzenie spada o 1, a zaufanie stoi; jedyny wybór, który obniża wkurzenie,
      // czyli powód, żeby go wziąć, gdy wkurzenie jest wysokie (z wyborem pierwszym nie da się go porównać: inna miara)
      wybor(
        h,
        d,
        tx('Podziękować i odprawić', 'Thank him and send him away'),
        { zaufanie: 0, wkurzenie: -1 },
        tx(
          `poseł odszedł bez herbaty. Część ludzi odetchnęła z ulgą, a wy wiecie już, co leży ${k.pl} od was.`,
          `the envoy left without his tea. Some of your people breathed a sigh of relief, and you now know what lies ${k.en} of you.`,
        ),
      ),
    ];
  },
};
