/* Dwanaście łańcuchów historii (docs/superpowers/specs/2026-10-19-wydarzenia-design.md, sekcja 5; silnik w watki.ts).
   Łańcuch to 2–4 kroki, krok to karta; wybory zostawiają haki (`GovHost.hak`), które zwalniają następny krok po kilku godzinach
   gry. Trzy łańcuchy są tylko dla zwykłego trybu (`ostrzega`, `dlug`, `aktywistka`), trzy tylko dla trybu zombie (`dach`,
   `dobicie`, `glos`), sześć dla obu (`swiatlo`, `szczekanie`, `puszki`, `woda`, `list`, `pluca`). Wszystko po polsku i po
   angielsku (`tx`), ze słowami miejsca z hosta (brama albo furtka, zarząd albo komitet; bez pięter i numerów mieszkań), a lore
   z docs/GDD.md: rok 2051, bakteria od miedzi z 2026, satyra na dzisiejszą technikę oglądaną z przyszłości, bez prawdziwych
   nazwisk. Ludzie są zmyśleni (generator zarządu, `GovHost.makePerson`, grupy z goscie.ts).

   Zasada Mateusza: łańcuch kończy się czymś prawdziwym w grze, nigdy samym tekstem. Każdy koniec jest jednym z tych:
   - człowiek pod bramą to prawdziwa wizyta (`Krok.gosc`, jak karty z 0.3 z gościem): grupa stoi na mapie, a ten sam człowiek
     wraca w dalszym kroku z tym samym imieniem, wiekiem i twarzą (osoby i ich wygląd `GrupaKarty.looks` leżą w danych haka,
     `GoscKarty.look`);
   - wskazówka na miejsce to `GovHost.wskazowkaMiejsca` (apteka z okolicy albo cel `apteka` z TARGETS, miejsce z bronią);
   - znajomy to zapis rozkazu dla gościa (`goscRozkaz(id, 'odejdz', 'wyrzucony')` itd.), który zostawia wpis z nastawieniem;
   - awans to `GovHost.awansuj` prawdziwego mieszkańca z `GovHost.lokatorzy()`, tego, o którym karta mówiła;
   - pies to flaga `dog` i tylko wtedy, gdy gra nie ma psa (`GovHost.pies()`); ten sam pies, co z karty „Pies przy siatce”;
   - ugryziony i dobicie to rozkazy `ugryziony` i `dobij` dla pionków gościa;
   - handlarz to `GovInput.handlarz` (stoi pod bramą z wózkiem) i skutek w jego ofercie (`GovHost.handlarzEfekt`);
   - napad to plan z noc.ts: ostrzeżenie podnosi szansę napadu tej nocy (`GovHost.poscig`) i podwaja wartę
     (`setAlertNight`), a krok po nocy czyta wynik z raportu (`GovHost.napadNocy`), więc tekst mówi to, co raport.
   Kto nie ma realnego zakończenia, nie dostaje go w tekście: nikt nie umiera, nie odchodzi i nie awansuje na karcie, jeśli gra
   tego nie robi. Dlatego łańcuch „Płuca” nie kończy się zgonem (zarząd nie ma skutku, który zabija mieszkańca): zły koniec to
   załamane zdrowie mieszkanki, zaufanie i nastrój osiedla; zgon i pogrzeb zostają symulacji i karcie `pogrzeb`.

   Kroki bez warunku wstępnego mają `w(h) = 0` (nie wypadają): bez mieszkańców z generatora nie ma `puszki`, `pluca` i drugiej
   połowy `aktywistka`, pies pojawia się tylko bez psa, handlarz tylko pod bramą. Haki mają przestrzeń `idLancucha.`, id kroków
   to `idLancucha_nr`. "Zimno" w `aktywistka` to co najwyżej 5°C na dworze albo szósta doba gry (gra zaczyna się jesienią, więc
   kalendarzowej zimy nie ma). Pierwszej nocy (do 8:00 drugiego dnia) wolno tylko trzem krokom (flaga `first`): „Światło w oknie”,
   „Ktoś woła z dachu” i „Pies ujada nocami”, które zajmują miejsce kart z puli pierwszej nocy (`sygnal`, `pies`); satyra i lore
   (list z 2026 i reszta) dopiero od drugiego dnia (decyzja Mateusza, 17.10.2026; pilnuje tego tests/unit/pierwszy-dzien.test.ts).
   Nic tu nie losuje poza tym, co daje host (nowi ludzie z ziarna zarządu w `make`), a angielskie
   teksty nie losują wcale. */

import { zawodEn } from '../content/data.en.ts';
import { PROFS, type Prof, SURN } from '../content/data.ts';
import { type Person, g as plec } from '../content/people.ts';
import { type Tx, tx } from '../core/jezyk.ts';
import { ri } from '../core/rng.ts';
import { zPrzedimkiem } from '../mieszkancy/szablony.en.ts';
import { type KtoId, osobyGrupy } from './goscie.ts';
import type { GChoice, GovHost } from './tresc.ts';
import type { GameMode, GovLokator, Punkt } from './typy.ts';
import { najstarszaMieszkanka, type OsobaKarty, osob, osobaKarty, osobyNaPodlodze } from './warianty.ts';
import type { Krok, Lancuch } from './watki.ts';
import { widoczny, wyboryGoscia } from './wizyta.ts';

// biome-ignore lint/suspicious/noExplicitAny: dane kroków mają różne kształty
type D = any;

const OBA: readonly GameMode[] = ['zwykly', 'zombie'];
const TYLKO_ZWYKLY: readonly GameMode[] = ['zwykly'];
const TYLKO_ZOMBIE: readonly GameMode[] = ['zombie'];

// ---------------------------------------------------------------- pomocnicy

/** krok łańcucha: id `<lancuch>_<nr>`, odstęp 0 godzin, jeśli krok nie poda własnego */
const krok = (lancuch: string, nr: number, o: Omit<Krok, 'id' | 'lancuch' | 'nr' | 'po'> & { po?: number }): Krok => ({
  id: `${lancuch}_${nr}`,
  lancuch,
  nr,
  po: 0,
  ...o,
});

const wielka = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const dom = (h: GovHost): boolean => h.place().kind === 'dom';
/** angielski zaimek po płci osoby */
const on = (p: { f: boolean }, he: string, she: string): string => (p.f ? she : he);
const pan = (p: { f: boolean; name: string }): string => `${plec(p, 'Pan', 'Pani')} ${p.name}`;

/** brama albo furtka we wszystkich formach, których potrzebują teksty (słownik miejsca z hosta; narzędnik dopisany tu) */
function brama(h: GovHost): { d: string; n: string } {
  const b = h.words().brama;
  return { d: b.d, n: b.m === 'furtka' ? 'furtką' : 'bramą' };
}
/** piwnica w bloku, szopa w domu (jak w kartach z puli): „w piwnicy”, „piwnicę”, „z piwnicy”, angielski rzeczownik */
const piwnica = (h: GovHost): { w: string; b: string; z: string; en: string } =>
  dom(h)
    ? { w: 'szopie', b: 'szopę', z: 'z szopy', en: 'shed' }
    : { w: 'piwnicy', b: 'piwnicę', z: 'z piwnicy', en: 'basement' };
/** „przy ognisku”, gdy ognisko pali się na podwórku, w innym razie „przy kozie” */
const przyOgniu = (h: GovHost): Tx =>
  h.campfire() ? tx('przy ognisku', 'by the campfire') : tx('przy kozie', 'by the stove');
/** zdanie, gdy grupa z karty już odeszła spod bramy (albo furtki) */
const brakGosci = (h: GovHost): Tx =>
  tx(`${wielka(h.words().brama.pod)} nikt już nie stoi.`, `There is nobody at ${h.wordsEn().brama} now.`);

/** budynek po drugiej stronie: blok obok, dom obok albo, gdy nikogo w okolicy nie ma, budynek za drogą (formy: dopełniacz
    „z okna …”, miejscownik „w …”, „naprzeciwko” w dopełniaczu i angielski rzeczownik z rodzajnikiem) */
function sasiad(h: GovHost): { d: string; w: string; n: string; np: string; en: string; enNp: string } {
  const n = h.neighbours();
  if (n === 'bloki')
    return {
      d: 'bloku obok',
      w: 'bloku obok',
      n: 'blokiem obok',
      np: 'bloku naprzeciwko',
      en: 'the block next door',
      enNp: 'the block opposite',
    };
  if (n === 'domy')
    return {
      d: 'domu obok',
      w: 'domu obok',
      n: 'domem obok',
      np: 'domu naprzeciwko',
      en: 'the house next door',
      enNp: 'the house opposite',
    };
  return {
    d: 'budynku po drugiej stronie drogi',
    w: 'budynku po drugiej stronie drogi',
    n: 'budynkiem po drugiej stronie drogi',
    np: 'budynku po drugiej stronie drogi',
    en: 'the building across the road',
    enNp: 'the building across the road',
  };
}

/** skąd jest mieszkaniec: z klatki (blok) albo z domu */
const zKlatki = (h: GovHost): Tx =>
  dom(h) ? tx('z waszego domu', 'from your house') : tx('z waszej klatki', 'from your stairwell');

/** zawód mieszkańca w obu językach, małymi literami (z przedimkiem po angielsku) */
const zawod = (p: { prof: string }): { pl: string; en: string; enA: string } => {
  const en = zawodEn(p.prof.toLowerCase());
  return { pl: p.prof.toLowerCase(), en, enA: zPrzedimkiem(en) };
};

/** imiona zajęte w osiedlu (zarząd i mieszkańcy z osobą) */
const imionaZajete = (h: GovHost): Set<string> => new Set([...h.alive(), ...h.lokatorzy()].map((p) => p.first));

/** nazwisko w formie dla płci: Kowalski ↔ Kowalska, Nowak ↔ Nowak */
function nazwiskoDla(nazwisko: string, f: boolean): string {
  const para = SURN.find((s) => s[0] === nazwisko || s[1] === nazwisko);
  return para ? para[f ? 1 : 0] : nazwisko;
}
const nazwiskoOsoby = (p: Pick<Person, 'name' | 'first'>): string => p.name.slice(p.first.length + 1);

/** Nowy człowiek do kroku z gościem: z generatora zarządu (`GovHost.makePerson`), z płcią i wiekiem kroku, imieniem innym niż
    ktokolwiek w osiedlu (i niż `unikaj`), nazwiskiem rodziny, gdy podane. `prof`: fach z PROFS po męskiej nazwie (jego wiek
    zawęża się do `wiek`); bez niego dziecko (poniżej 16 lat) albo zwykły mieszkaniec bez umiejętności. */
function czlowiek(
  h: GovHost,
  o: { f: boolean; wiek: readonly [number, number]; prof?: string; nazwisko?: string; unikaj?: readonly string[] },
): Person {
  const zajete = imionaZajete(h);
  for (const x of o.unikaj ?? []) zajete.add(x);
  const baza = o.prof ? PROFS.find((x) => x[0] === o.prof) : undefined;
  const lo = baza ? Math.max(baza[3][0], o.wiek[0]) : o.wiek[0];
  const hi = baza ? Math.min(baza[3][1], o.wiek[1]) : o.wiek[1];
  const prof: Prof = baza
    ? [baza[0], baza[1], baza[2], [lo, Math.max(lo, hi)]]
    : o.wiek[1] < 16
      ? ['dziecko', 'dziecko', {}, [lo, hi]]
      : ['mieszkaniec', 'mieszkanka', {}, [lo, hi]];
  let p = h.makePerson({ f: o.f, prof });
  for (let t = 0; t < 12 && zajete.has(p.first); t++) p = h.makePerson({ f: o.f, prof });
  // dzieci bez cech: „Mistrz Excela” w wieku siedmiu lat to za wiele
  if (p.age < 16) p.traits = [];
  if (o.nazwisko) p.name = `${p.first} ${nazwiskoDla(o.nazwisko, p.f)}`;
  return p;
}

// ---- karty z gościem

/** grupa tej karty wciąż stoi pod bramą (wybory są dostępne tylko wtedy) */
const pod = (h: GovHost, d: D): boolean => !!d.gid && !!h.grupa(d.gid)?.pod;
/** ludzie karty: żywi z wizyty, a bez niej (próba, zapis) osoby z danych kroku */
const ludzie = (h: GovHost, d: D): Person[] => (d.gid ? h.grupa(d.gid)?.osoby : undefined) ?? d.osoby;
/** Pierwsza żywa osoba grupy, jej wygląd i id jej wpisu w pamięci o znajomych (`zid`: id osoby z pierwszej wizyty; kolejne wizyty
    tego człowieka dostają je w `GoscKarty.wraca`, więc zarząd pamięta go jako jednego znajomego, nie kilku). Do haka: ten sam
    człowiek wraca z tą samą twarzą i tym samym wpisem. */
function pierwsza(h: GovHost, d: D): { p: Person; look: number | undefined; zid: string } {
  const gr = d.gid ? h.grupa(d.gid) : null;
  const p: Person = (gr?.osoby ?? d.osoby)[0];
  return { p, look: gr?.looks[0] ?? d.looks?.[0], zid: d.zid ?? p.id };
}
/** miejsce grupy na mapie („Pokaż”) */
const gdzieGrupy = (h: GovHost, d: D): Punkt | null => (d.gid ? (h.gosc(d.gid)?.wpis?.gdzie ?? null) : null);
/** ilu spałoby na podłodze po przyjęciu `n` osób */
const naPodlodze = (h: GovHost, n: number): number => Math.max(0, n - h.free());
const LICZBY_EN = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
/** „five people”, „one person”; od trzynastu cyfrą (na początku zdania przez `wielka`) */
const ludzieEn = (n: number): string =>
  `${n >= 0 && n < LICZBY_EN.length ? LICZBY_EN[n] : n} ${n === 1 ? 'person' : 'people'}`;
const LICZBY_PL = [
  'zero',
  'jedna',
  'dwie',
  'trzy',
  'cztery',
  'pięć',
  'sześć',
  'siedem',
  'osiem',
  'dziewięć',
  'dziesięć',
  'jedenaście',
  'dwanaście',
];
/** „stoi jedna osoba”, „stoją trzy osoby”, „stoi pięć osób”: liczebnik słowem do dwunastu, czasownik w zgodzie z liczebnikiem
    (jak w kartach z puli, `osob` z warianty.ts) */
const stoi = (n: number): string =>
  `${osob(n) === 'osoby' ? 'stoją' : 'stoi'} ${n >= 1 && n < LICZBY_PL.length ? LICZBY_PL[n] : n} ${osob(n)}`;
/** „stands” dla jednej osoby, „stand” dla reszty */
const standEn = (n: number): string => (n === 1 ? 'stands' : 'stand');

/** angielski zaimek dopełnienia dla grupy karty: him, her albo them */
const them = (h: GovHost, d: D): string => {
  const os = ludzie(h, d) ?? [];
  return os.length === 1 ? (os[0].f ? 'her' : 'him') : 'them';
};

/** wybór „Wpuścić na noc”: niedostępny, gdy brama stoi na kłódkę */
const wpuscNaNoc = (h: GovHost, d: D, po: () => void): GChoice => ({
  label: tx('Wpuścić na noc', `Let ${them(h, d)} in for the night`),
  ok: pod(h, d) && !h.gateClosed(),
  run: () => {
    h.nocGosci();
    h.mood(1, 0);
    po();
  },
});

/** wybór „Odprawić” */
const odprawic = (h: GovHost, d: D, po: () => void, jak?: 'wyrzucony'): GChoice => ({
  label: tx('Odprawić', `Send ${them(h, d)} away`),
  ok: pod(h, d),
  run: () => {
    if (jak) h.goscRozkaz(d.gid, 'odejdz', jak);
    else h.odprawGosci();
    po();
  },
});

// ---- mieszkańcy

/** mieszkaniec z osobą, którego jeszcze jest w osiedlu (po id z danych kroku); null: wyszedł, zginął, awansował */
const mieszkaniec = (h: GovHost, id: string | undefined): GovLokator | null => (id ? h.lokator(id) : null);

// ---------------------------------------------------------------- 1. światło w oknie (oba tryby)

/** 1. Światło w oknie naprzeciwko → chłopak z babcią pod bramą (gość) → babcia chora, prośba o leki → wskazówka na aptekę albo
    znajomy −2. Dwie osoby pod bramą w kroku 2 (chłopak i babcia), w kroku 3 sam chłopak z tą samą twarzą. */
const SWIATLO: Lancuch = {
  id: 'swiatlo',
  tryby: OBA,
  kroki: [
    krok('swiatlo', 1, {
      // zajmuje miejsce karty „Światło w oknie naprzeciwko” (sygnal w tresc.ts), więc też pierwszej nocy
      first: true,
      when: ['wieczor', 'noc'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('Światło w oknie naprzeciwko', 'A light in the window opposite'),
      text: (h) => {
        const s = sasiad(h);
        const zombie = h.tryb() === 'zombie';
        return tx(
          `Od trzech wieczorów w oknie ${s.np} pali się światło. Nie elektryczne, tylko żółte i drżące, jak z lampki na oliwę. Co jakiś czas ktoś zasłania je ręką i odsłania, jakby mrugał.${zombie ? ' Podobno po ulicy pod tym oknem chodzi stado, więc ktokolwiek tam siedzi, nie schodzi.' : ''}`,
          `For three evenings now a light has been burning in a window of ${s.enNp}. Not an electric one: yellow and unsteady, like an oil lamp. Every so often a hand covers it and uncovers it, as if it were blinking.${zombie ? ' Word is that a herd shuffles along the street under that window, so whoever sits there is not coming down.' : ''}`,
        );
      },
      choices: (h) => [
        {
          label: tx('Odpowiedzieć latarką z okna', 'Signal back with a torch from the window'),
          ok: true,
          run: () => {
            h.hak('swiatlo.znak', { odp: 'latarka' });
            h.log(
              tx(
                `Ktoś z ${h.words().zarzad.dk} mrugnął latarką trzy razy. Światło w oknie naprzeciwko mrugnęło tyle samo, a potem zgasło.`,
                `Someone from ${h.wordsEn().krotko} flashed a torch three times. The light in the window opposite flashed back as many times, then went out.`,
              ),
            );
          },
        },
        {
          label: tx('Zamachać lampą przy siatce', 'Swing a lamp by the fence'),
          ok: !!h.doSprawdzenia() && h.kafelekPrzySiatce('blok') !== null,
          run: () => {
            const p = h.doSprawdzenia();
            const tile = h.kafelekPrzySiatce('blok');
            if (!p || tile === null) return;
            h.sprawdz(p.id, tile);
            h.needsOf(p.id, { rest: -6 });
            h.hak('swiatlo.znak', { odp: 'siatka' });
            h.log(
              tx(
                `${p.name} stoi przy siatce z lampą i macha nią powoli. W oknie naprzeciwko ktoś odmachał.`,
                `${p.name} stands by the fence with a lamp, swinging it slowly. Someone in the window opposite swung one back.`,
              ),
            );
          },
        },
        {
          label: tx('Zasłonić okno i nie reagować', 'Close the curtains and do nothing'),
          ok: true,
          run: () => {
            h.hak('swiatlo.znak', { odp: 'nic' });
            h.needsAll({ safe: -1 });
          },
        },
      ],
    }),
    krok('swiatlo', 2, {
      po: 8,
      hak: 'swiatlo.znak',
      when: ['dzien'],
      w: () => 1,
      make: (h) => {
        const znak = h.hakDane('swiatlo.znak')?.d as { odp: string } | undefined;
        const chlopak = czlowiek(h, { f: false, wiek: [12, 15] });
        const babcia = czlowiek(h, {
          f: true,
          wiek: [68, 82],
          nazwisko: nazwiskoOsoby(chlopak),
          unikaj: [chlopak.first],
        });
        return { osoby: [chlopak, babcia], odp: znak?.odp ?? 'nic' };
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'dziecko' }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Chłopak z babcią', 'A boy and his grandmother'),
      text: (h, d) => {
        const [chlopak, babcia] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        const skad: Record<string, Tx> = {
          latarka: tx(
            'Mówi, że widzieli, jak odpowiedzieliście z okna, więc przyszli.',
            'He says they saw you answer from the window, so they came.',
          ),
          siatka: tx(
            'Mówi, że widzieli wasze światło przy siatce i uznali, że ktoś na nich czeka.',
            'He says they saw your light by the fence and took it to mean somebody was waiting for them.',
          ),
          nic: tx(
            'Mówi, że znaku się nie doczekali, ale dłużej w tamtym budynku nie dało się siedzieć.',
            'He says they got no sign from you, but they could not sit in that building any longer.',
          ),
        };
        const znak = skad[d.odp] ?? skad.nic;
        const zombie = h.tryb() === 'zombie';
        if (!chlopak) return brakGosci(h);
        if (!babcia)
          return tx(
            `${wielka(s.brama.pod)} stoi chłopak, ${chlopak.first}, z pustym wózkiem po zakupach. ${znak.pl}`,
            `A boy called ${chlopak.first} is standing at ${e.brama} with an empty shopping trolley. ${znak.en}`,
          );
        return tx(
          `${wielka(s.brama.pod)} stoi chłopak, ${chlopak.age} lat, i pcha wózek po zakupach, a w wózku siedzi babcia owinięta w koc. To ${chlopak.name} i jego babcia, ${babcia.name}, z ${sas.d}. ${znak.pl} Babcia trzyma na kolanach pudełko po butach z dokumentami, których już nikt nie sprawdzi. W ich budynku nie ma czym palić, a noc będzie zimna.${zombie ? ' Chłopak mówi szeptem i nie spuszcza oka z ulicy, bo szwendacze reagują na każdy dźwięk.' : ''} Proszą o miejsce przy kozie.`,
          `At ${e.brama} stands a boy of ${chlopak.age}, pushing a shopping trolley with his grandmother in it, wrapped in a blanket. They are ${chlopak.name} and his grandmother, ${babcia.name}, from ${sas.en}. ${znak.en} She holds a shoebox of documents on her lap that nobody will ever check. There is nothing left to burn in their building, and the night will be cold.${zombie ? ' The boy speaks in a whisper and keeps his eyes on the street, because the shamblers react to every sound.' : ''} They ask for a place by the stove.`,
        );
      },
      choices: (h, d) => {
        const zapisz = (jak: string) => () => h.hak('swiatlo.wrocil', { ...pierwsza(h, d), jak });
        return [
          wpuscNaNoc(h, d, () => {
            h.log(
              tx(
                `Babcia siedzi przy kozie w kocu, chłopak pilnuje wózka, jakby ktoś miał go ukraść. Rano wychodzą ${brama(h).n}.`,
                `The grandmother sits by the stove in her blanket, and the boy guards the trolley as if somebody might steal it. In the morning they leave by ${h.wordsEn().brama}.`,
              ),
            );
            zapisz('noc')();
          }),
          {
            label: tx('Podać jedzenie przez siatkę (Jedzenie 2)', 'Pass some food through the fence (Food 2)'),
            ok: pod(h, d) && h.res.jedzenie >= 2,
            run: () => {
              h.nakarmGosci(2);
              h.mood(1, 0);
              zapisz('jedzenie')();
            },
          },
          odprawic(h, d, () => {
            h.mood(-1, 0);
            zapisz('odprawa')();
          }),
        ];
      },
    }),
    krok('swiatlo', 3, {
      po: 30,
      hak: 'swiatlo.wrocil',
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: (h) => {
        const x = h.hakDane('swiatlo.wrocil')?.d as { p: Person; look?: number; zid: string; jak: string } | undefined;
        return x ? { osoby: [x.p], looks: x.look !== undefined ? [x.look] : undefined, zid: x.zid, jak: x.jak } : null;
      },
      gosc: (_h, d) => ({
        osoby: d.osoby,
        kto: 'dziecko',
        chce: 'leki',
        wraca: d.zid,
        ...(d.looks ? { look: d.looks } : {}),
      }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Chłopak prosi o leki', 'The boy asks for meds'),
      text: (h, d) => {
        const [chlopak] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const wstep: Record<string, Tx> = {
          noc: tx(
            'Chłopak, który nocował u was z babcią, wrócił sam.',
            'The boy who spent the night with you and his grandmother is back, alone.',
          ),
          jedzenie: tx(
            'Chłopak, któremu podaliście jedzenie przez siatkę, wrócił sam.',
            'The boy you passed food to through the fence is back, alone.',
          ),
          odprawa: tx(
            `Chłopak, którego odprawiliście spod ${s.brama.d}, wrócił sam.`,
            `The boy you sent away from ${e.brama} is back, alone.`,
          ),
        };
        const w = wstep[d.jak] ?? wstep.noc;
        if (!chlopak) return brakGosci(h);
        return tx(
          `${w.pl} ${wielka(s.brama.pod)} stoi ${chlopak.first} i nie podchodzi bliżej. Babcia od dwóch dni kaszle i prawie nie podnosi głowy znad poduszki. W ich budynku apteka jest pusta, a lekarz odpowiada tylko na hasło, którego nikt nie pamięta. Prosi o jedną paczkę leków i niczego nie obiecuje, bo nie ma czym zapłacić.`,
          `${w.en} ${chlopak.first} is standing at ${e.brama} and does not come any closer. His grandmother has been coughing for two days and has barely lifted her head from the pillow. The pharmacy in their building is empty, and the doctor only answers to a password nobody remembers. He asks for one pack of meds and promises nothing, because he has nothing to pay with.`,
        );
      },
      choices: (h, d) => {
        const [chlopak] = ludzie(h, d);
        return [
          {
            label: tx('Dać leki (Leki 1)', 'Give him meds (Meds 1)'),
            ok: pod(h, d) && h.res.leki >= 1,
            run: () => {
              h.addRes('leki', -1);
              h.goscRozkaz(d.gid, 'odejdz', 'nakarmiony');
              h.mood(2, 0);
              // przed odejściem chłopak mówi, co widział: nieruszone miejsce z lekami (apteka z okolicy albo ta z wypraw)
              const m = h.wskazowkaMiejsca(['apteka'], 'apteka');
              h.hak('swiatlo.dali');
              h.log(
                tx(
                  `${chlopak?.first ?? 'Chłopak'} wziął leki obiema rękami. Odchodząc, powiedział o miejscu, którego podobno nikt nie ruszał: ${m.pl}. Następna wyprawa tam będzie bezpieczniejsza i da więcej.`,
                  `${chlopak?.first ?? 'The boy'} took the meds in both hands. Walking away, he mentioned a place that, he said, nobody has touched: ${m.en}. The next run there will be safer and bring back more.`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Dać jedzenie zamiast leków (Jedzenie 2)', 'Give him food instead of meds (Food 2)'),
            ok: pod(h, d) && h.res.jedzenie >= 2,
            run: () => {
              h.nakarmGosci(2);
              h.hak('swiatlo.jedzenie');
            },
          },
          odprawic(
            h,
            d,
            () => {
              h.mood(-2, 2);
              h.hak('swiatlo.nie');
              h.log(
                tx(
                  `${chlopak?.first ?? 'Chłopak'} odszedł bez słowa. Wózek trzeszczał jeszcze długo, a potem przestał.`,
                  `${chlopak?.first ?? 'The boy'} left without a word. The trolley creaked for a long time, and then it stopped.`,
                ),
                true,
              );
            },
            'wyrzucony',
          ),
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 2. pies sąsiadów (oba tryby)

/** 2. Pies sąsiadów ujada nocami → ślady przy siatce → pies przychodzi sam (flaga `dog`) albo zostaje u sąsiadów. Każdy krok
    nie wypada, gdy gra ma już psa (flaga albo wpis w odczycie), więc pies z łańcucha i z karty „Pies przy siatce” nie
    dubluje się; to ta sama flaga, ten sam pionek i to samo imię (Abonament, bo tak go nazywa śmierć psa w zwierzeta.ts). */
const SZCZEKANIE: Lancuch = {
  id: 'szczekanie',
  tryby: OBA,
  kroki: [
    krok('szczekanie', 1, {
      // jak karta „Pies przy siatce”, której miejsce zajmuje, gdy ten łańcuch jest wątkiem sezonu: też pierwszej nocy
      first: true,
      when: ['wieczor', 'noc'],
      w: (h) => (h.pies() ? 0 : 1),
      make: () => ({}),
      title: () => tx('Pies ujada nocami', 'A dog barking at night'),
      text: (h) => {
        const s = sasiad(h);
        const sas = h.neighbours() !== null;
        return tx(
          `${sas ? `Pies z ${s.d}` : 'Jakiś pies zza siatki'} ujada od trzech nocy, w równych odstępach, jakby ktoś płacił mu od szczeknięcia. Nikt go nie uciszył. Nikt też po niego nie ${sas ? 'wyszedł' : 'przyszedł'}.`,
          `${sas ? `A dog from ${s.en}` : 'A dog from beyond the fence'} has been barking for three nights, at perfectly even intervals, as if paid per bark. Nobody has shut it up. Nobody has come for it either.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Zostawić miskę za siatką (Jedzenie 1)', 'Leave a bowl outside the fence (Food 1)'),
          ok: h.res.jedzenie >= 1,
          run: () => {
            h.addRes('jedzenie', -1);
            h.needsAll({ safe: 2 });
            h.hak('szczekanie.start', { jak: 'miska' });
            h.log(
              tx(
                'Miska stoi za siatką. Do rana była pusta i wylizana do połysku.',
                'A bowl stands outside the fence. By morning it was empty and licked to a shine.',
              ),
            );
          },
        },
        {
          label: tx('Przegonić', 'Chase it off'),
          ok: true,
          run: () => {
            h.needsAll({ rest: -3 });
            h.hak('szczekanie.start', { jak: 'przegonili' });
            h.log(
              tx(
                'Pies zniknął za rogiem i po chwili wrócił, jakby nic się nie stało.',
                'The dog vanished round the corner and was soon back as if nothing had happened.',
              ),
            );
          },
        },
        {
          label: tx('Zatkać uszy i spać', 'Plug your ears and sleep'),
          ok: true,
          run: () => {
            h.needsAll({ rest: -4 });
            h.hak('szczekanie.start', { jak: 'nic' });
          },
        },
      ],
    }),
    krok('szczekanie', 2, {
      po: 10,
      hak: 'szczekanie.start',
      when: ['dzien', 'wieczor'],
      w: (h) => (h.pies() ? 0 : 1),
      make: (h) => ({ jak: (h.hakDane('szczekanie.start')?.d as { jak: string } | undefined)?.jak ?? 'nic' }),
      title: () => tx('Ślady przy siatce', 'Paw prints by the fence'),
      text: (h, d) => {
        const s = h.words();
        const e = h.wordsEn();
        const dziura = h.holes() > 0 ? h.weakName() : null;
        const gdzie = dziura
          ? tx(`${dziura.pl}, tam gdzie jest dziura`, `${dziura.en}, where the hole is`)
          : tx(s.brama.przy, `at ${e.brama}`);
        const slady = tx(
          'odciski łap w błocie, duże jak dłoń dorosłego, a na drucie kłaki szarej sierści',
          'paw prints in the mud as big as an adult’s palm, and tufts of grey fur on the wire',
        );
        const wstep: Record<string, Tx> = {
          miska: tx(
            `Miska stoi tam, gdzie ją zostawiliście, wylizana do czysta. A obok ${slady.pl}.`,
            `The bowl stands where you left it, licked clean. And beside it are ${slady.en}.`,
          ),
          przegonili: tx(
            `Pies nie szczeka od zeszłej nocy. Za to przy siatce widać ${slady.pl}.`,
            `The dog has not barked since last night. Instead, by the fence, there are ${slady.en}.`,
          ),
          nic: tx(`Rano przy siatce widać ${slady.pl}.`, `This morning, by the fence, there are ${slady.en}.`),
        };
        const w = wstep[d.jak] ?? wstep.nic;
        const zombie = h.tryb() === 'zombie';
        return tx(
          `${w.pl} Ślady urywają się ${gdzie.pl}.${zombie ? ' Szwendacze nie mają łap, więc to coś żywego.' : ''}`,
          `${w.en} The trail stops ${gdzie.en}.${zombie ? ' Shamblers do not have paws, so this is something alive.' : ''}`,
        );
      },
      choices: (h) => [
        {
          label: tx('Podłożyć resztki pod siatką (Jedzenie 1)', 'Leave scraps under the fence (Food 1)'),
          ok: h.res.jedzenie >= 1,
          run: () => {
            h.addRes('jedzenie', -1);
            h.hak('szczekanie.slady', { jak: 'resztki' });
            h.log(tx('Resztki zniknęły przed świtem.', 'The scraps were gone before dawn.'));
          },
        },
        {
          label: tx('Załatać dziurę (Złom 2)', 'Patch the hole (Scrap 2)'),
          ok: h.holes() > 0 && h.res.zlom >= 2,
          run: () => {
            h.pay({ zlom: 2 });
            h.patchHole();
            h.hak('szczekanie.slady', { jak: 'lata' });
            h.log(
              tx(
                'Dziura załatana deskami i drutem. Cokolwiek tu chodzi, musi wejść inną drogą.',
                'The hole is patched with planks and wire. Whatever has been coming through will need another way in.',
              ),
            );
          },
        },
        {
          label: tx('Nie ruszać', 'Leave it'),
          ok: true,
          run: () => h.hak('szczekanie.slady', { jak: 'nic' }),
        },
      ],
    }),
    krok('szczekanie', 3, {
      po: 12,
      hak: 'szczekanie.slady',
      when: ['dzien', 'wieczor'],
      w: (h) => (h.pies() ? 0 : 1),
      make: (h) => ({ jak: (h.hakDane('szczekanie.slady')?.d as { jak: string } | undefined)?.jak ?? 'nic' }),
      title: () => tx('Pies przychodzi sam', 'The dog comes on his own'),
      text: (h, d) => {
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        const znany = h.neighbours() !== null;
        const wstep: Record<string, Tx> = {
          lata: tx(
            `Dziury już nie ma, więc pies siedzi ${s.brama.przy} od świtu, jakby wiedział, że drugiej drogi nie ma.`,
            `The hole is gone, so the dog has been sitting at ${e.brama} since dawn, as if he knew there was no other way.`,
          ),
          resztki: tx(
            `Pies siedzi ${s.brama.przy} od świtu i patrzy na wasze okna jak na menu.`,
            `The dog has been sitting at ${e.brama} since dawn, looking at your windows as if they were a menu.`,
          ),
          nic: tx(
            `Pies siedzi ${s.brama.przy} od świtu. Szczekać nie musi, ślady w błocie mówią za niego.`,
            `The dog has been sitting at ${e.brama} since dawn. He does not need to bark: the prints in the mud say it for him.`,
          ),
        };
        const w = wstep[d.jak] ?? wstep.nic;
        return tx(
          `${w.pl} Duży, bury, z przegryzionym sznurkiem na szyi. ${znany ? `Z ${sas.d} nikt po niego nie wyszedł.` : 'Nikt po niego nie przyszedł.'}`,
          `${w.en} Big, grey, with a chewed-through string round his neck. ${znany ? `Nobody from ${sas.en} has come out for him.` : 'Nobody has come for him.'}`,
        );
      },
      choices: (h) => [
        {
          label: tx('Przygarnąć (Jedzenie 1)', 'Take him in (Food 1)'),
          ok: h.res.jedzenie >= 1 && !h.pies(),
          run: () => {
            h.addRes('jedzenie', -1);
            h.setFlag('dog');
            h.moodAll('Mamy psa', 4, 24);
            h.hak('szczekanie.pies');
            h.log(
              tx(
                `Pies dostał imię Abonament, bo przychodzi, je i nikt nie wie, kiedy przestanie. Śpi ${h.words().brama.przy} i warczy na obcych.`,
                `The dog has been named Subscription, because he turns up, eats, and nobody knows when it will stop. He sleeps at ${h.wordsEn().brama} and growls at strangers.`,
              ),
              true,
            );
          },
        },
        {
          label: tx('Niech wraca do swoich', 'Let him go home'),
          ok: true,
          run: () => {
            h.hak('szczekanie.zostal');
            h.log(
              h.neighbours() !== null
                ? tx(
                    `Pies posiedział jeszcze chwilę, a potem poszedł truchtem w stronę ${sasiad(h).d}, z ogonem w górze.`,
                    `The dog sat a while longer, then trotted off towards ${sasiad(h).en} with his tail up.`,
                  )
                : tx(
                    'Pies posiedział jeszcze chwilę, a potem poszedł truchtem dalej ulicą, z ogonem w górze.',
                    'The dog sat a while longer, then trotted on down the street with his tail up.',
                  ),
            );
          },
        },
      ],
    }),
  ],
};

// ---------------------------------------------------------------- 3. puszki (oba tryby)

/** Mieszkaniec z największą smykałką do elektryki (elektryka ×3, informatyka i budowlanka po razy 1), pełnoletni; remis:
    pierwszy w kolejności pionków. Bohater łańcucha „Puszki”. */
function majsterkowicz(h: GovHost): GovLokator | null {
  let best: GovLokator | null = null;
  let bv = -1;
  for (const l of h.lokatorzy()) {
    if (l.age < 18) continue;
    const v = 3 * (l.skills.elek ?? 0) + (l.skills.it ?? 0) + (l.skills.bud ?? 0);
    if (v > bv) {
      best = l;
      bv = v;
    }
  }
  return best;
}

/** 3. Ktoś z mieszkańców zbiera puszki → buduje radio (bez prądu, cewka z lakierowanego drutu, bo lakier przetrwał) → wieść
    ze świata (wskazówka na miejsce i nastrój) albo awans do zarządu albo części. Bohater to prawdziwy mieszkaniec z
    `GovHost.lokatorzy()`; bez nich łańcuch nie wypada. */
const PUSZKI: Lancuch = {
  id: 'puszki',
  tryby: OBA,
  lokatorzy: true,
  kroki: [
    krok('puszki', 1, {
      when: ['dzien', 'wieczor'],
      w: (h) => (majsterkowicz(h) ? 1 : 0),
      make: (h) => {
        const l = majsterkowicz(h);
        return l ? { lok: l.id, p: osobaKarty(l) } : null;
      },
      title: (h) => tx(`Puszki w ${piwnica(h).w}`, `Tin cans in the ${piwnica(h).en}`),
      text: (h, d) => {
        const p: OsobaKarty = d.p;
        const z = zawod(p);
        const skad = zKlatki(h);
        const pw = piwnica(h);
        return tx(
          `${pan(p)} ${skad.pl}, z zawodu ${z.pl}, od tygodnia zbiera puszki. Po fasoli, po groszku, po karmie dla psa. Układa je w ${pw.w} rzędami, według średnicy, i nikomu nie mówi po co. Zapytan${plec(p, 'y', 'a')}, odpowiada, że to hobby, jak bieganie.`,
          `${p.name} ${skad.en}, ${z.enA} by trade, has been collecting tin cans for a week. Beans, peas, dog food. ${on(p, 'He', 'She')} lines them up in the ${pw.en} by diameter and will not say what for. Asked, ${on(p, 'he', 'she')} says it is a hobby, like running.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        return [
          {
            label: tx('Nie pytać i dać spokój', 'Do not ask and leave it be'),
            ok: true,
            run: () => {
              h.moodOf(d.lok, 'Mam swój projekt', 5, 48);
              h.hak('puszki.start', { lok: d.lok, p, pomoc: 'spokoj' });
            },
          },
          {
            label: tx('Dorzucić złom na blachy (Złom 2)', 'Chip in some scrap for sheet metal (Scrap 2)'),
            ok: h.res.zlom >= 2,
            run: () => {
              h.pay({ zlom: 2 });
              h.moodOf(d.lok, 'Ktoś mi pomógł', 8, 48);
              h.hak('puszki.start', { lok: d.lok, p, pomoc: 'zlom' });
            },
          },
          {
            label: tx(`Kazać posprzątać ${piwnica(h).b}`, `Tell ${on(p, 'him', 'her')} to clear the ${piwnica(h).en}`),
            ok: true,
            run: () => {
              h.moodOf(d.lok, 'Nikt mnie nie rozumie', -6, 24);
              h.hak('puszki.start', { lok: d.lok, p, pomoc: 'zakaz' });
              h.log(
                tx(
                  `${p.first} ${plec(p, 'przeniósł', 'przeniosła')} puszki do swojego kąta, ale nie ${plec(p, 'wyrzucił', 'wyrzuciła')} ani jednej.`,
                  `${p.first} moved the cans into a corner of ${on(p, 'his', 'her')} own and did not throw out a single one.`,
                ),
              );
            },
          },
        ];
      },
    }),
    krok('puszki', 2, {
      po: 16,
      hak: 'puszki.start',
      when: ['dzien', 'wieczor'],
      w: (h) => (mieszkaniec(h, (h.hakDane('puszki.start')?.d as { lok?: string } | undefined)?.lok) ? 1 : 0),
      make: (h) => h.hakDane('puszki.start')?.d ?? null,
      title: () => tx('Skrzynka z blachy', 'A box made of tin'),
      text: (h, d) => {
        const p: OsobaKarty = d.p;
        const jak: Record<string, Tx> = {
          spokoj: tx('Zrobione po cichu, w wolnych chwilach.', 'It was done quietly, in spare moments.'),
          zlom: tx(
            'Zrobione z blach, na które poszedł wasz złom, i widać, że to powód do dumy.',
            'It was built from the sheet metal your scrap paid for, and the pride shows.',
          ),
          zakaz: tx(
            'Zrobione wbrew zakazowi, po nocach, w komórce.',
            'It was built against orders, at night, in a storeroom.',
          ),
        };
        const w = jak[d.pomoc] ?? jak.spokoj;
        return tx(
          `${p.first} ${plec(p, 'wyniósł', 'wyniosła')} ${dom(h) ? 'do ogrodu' : 'na podwórko'} skrzynkę z puszek, żyletki i kawałka grafitu z ołówka. To odbiornik bez prądu: bierze go z fal. Cewkę ${plec(p, 'nawinął', 'nawinęła')} z lakierowanego drutu z silnika, bo lakier bakteria omija, a gołej miedzi w skrzynce nie ma ani grama. ${w.pl} W słuchawce szumi, trochę jak wiatr, a trochę jak przedstawiciel handlowy.`,
          `${p.first} has carried a box out into the ${dom(h) ? 'garden' : 'yard'}, built from tin cans, a razor blade and a bit of pencil lead. It is a receiver with no power: it takes it from the waves. ${on(p, 'He', 'She')} wound the coil from lacquered motor wire, because the bacterium skips lacquer and there is not a gram of bare copper in the box. ${w.en} The earpiece hisses, a bit like wind and a bit like a sales rep.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        return [
          {
            label: tx('Dać części na antenę (Części 1)', 'Give some parts for an aerial (Parts 1)'),
            ok: h.res.czesci >= 1,
            run: () => {
              h.pay({ czesci: 1 });
              h.moodOf(d.lok, 'Ktoś mi pomógł', 6, 48);
              h.hak('puszki.radio', { lok: d.lok, p, antena: true });
            },
          },
          {
            label: tx('Niech gra, byle po cichu', 'Let it play, as long as it is quiet'),
            ok: true,
            run: () => h.hak('puszki.radio', { lok: d.lok, p, antena: false }),
          },
        ];
      },
    }),
    krok('puszki', 3, {
      po: 12,
      hak: 'puszki.radio',
      when: ['wieczor', 'noc'],
      w: (h) => (mieszkaniec(h, (h.hakDane('puszki.radio')?.d as { lok?: string } | undefined)?.lok) ? 1 : 0),
      make: (h) => h.hakDane('puszki.radio')?.d ?? null,
      title: () => tx('Radio gra', 'The radio plays'),
      text: (_h, d) => {
        const p: OsobaKarty = d.p;
        const z = zawod(p);
        const antena = d.antena
          ? tx('antena z drutu i puszek łapała daleko', 'the aerial of wire and cans reached far')
          : tx('drut od okna łapał, co się da', 'a wire from the window caught what it could');
        return tx(
          `Wieczorem ${p.first} ${plec(p, 'przyniósł', 'przyniosła')} skrzynkę do kozy i ${plec(p, 'postawił', 'postawiła')} na parapecie, żeby ${antena.pl}. W szumie odezwał się głos, daleki i uprzejmy jak infolinia, której od lat nikt nie utrzymuje. Czyta listę: wsie, w których są jeszcze studnie, drogi, które nie zarosły, i miejsce, gdzie ktoś zostawił zapasy „dla każdego, kto zapyta”. ${p.first}, z zawodu ${z.pl}, siedzi nad skrzynką i nie ma ochoty rozmawiać o puszkach.`,
          `In the evening ${p.first} brought the box to the stove and put it on the windowsill so that ${antena.en}. Through the hiss came a voice, distant and polite, like a helpline nobody has maintained in years. It reads a list: villages that still have wells, roads that have not grown over, and a place where someone has left supplies “for anyone who asks”. ${p.first}, ${z.enA} by trade, sits over the box and has no wish to talk about tin cans.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        return [
          {
            label: tx('Wysłuchać wiadomości do końca', 'Hear the bulletin to the end'),
            ok: true,
            run: () => {
              const m = h.wskazowkaMiejsca(['spozywczy', 'sklep', 'ogrodnik'], 'pawilon');
              h.moodAll('Wieści ze świata', 3, 24);
              h.hak('puszki.wiesc');
              h.log(
                tx(
                  `Zapasy „dla każdego, kto zapyta” to według radia miejsce: ${m.pl}. Następna wyprawa tam będzie bezpieczniejsza i da więcej.`,
                  `The supplies “for anyone who asks” are, according to the radio, at ${m.en}. The next run there will be safer and bring back more.`,
                ),
                true,
              );
            },
          },
          {
            label: tx(
              `Wciągnąć ${plec(p, 'go', 'ją')} do ${h.words().zarzad.dk}`,
              `Bring ${on(p, 'him', 'her')} onto ${h.wordsEn().krotko}`,
            ),
            ok: !!mieszkaniec(h, d.lok),
            run: () => {
              h.awansuj(d.lok);
              h.mood(1, 0);
              h.hak('puszki.zarzad');
              h.log(
                tx(
                  `${p.name} wchodzi do ${h.words().zarzad.dk}, razem z radiem. Przy kozie przybywa jeden głos, i to z szumem.`,
                  `${p.name} joins ${h.wordsEn().krotko}, radio and all. There is one more voice at the stove, and this one comes with static.`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Rozebrać na części (Części 2)', 'Strip it for parts (Parts 2)'),
            ok: true,
            run: () => {
              h.addRes('czesci', 2);
              h.moodOf(d.lok, 'Zabrali mi radio', -8, 48);
              h.hak('puszki.czesci');
              h.log(
                tx(
                  `${p.first} patrzy, jak radio idzie na części. Nic nie mówi, ale od tej pory puszki zbiera tylko w nocy.`,
                  `${p.first} watches the radio being taken apart. ${on(p, 'He', 'She')} says nothing, but from now on collects cans only at night.`,
                ),
              );
            },
          },
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 4. dziecko po wodę (oba tryby)

/** wygląd, którego nie ma jeszcze w grupie (4–15; bez powtórek, żeby dwoje ludzi pod bramą nie miało jednej twarzy) */
function nowyWyglad(h: GovHost, zajete: number[]): number {
  let l = ri(4, 15, h.rng);
  for (let t = 0; t < 24 && zajete.includes(l); t++) l = ri(4, 15, h.rng);
  zajete.push(l);
  return l;
}

/** 4. Dziecko z budynku obok przychodzi po wodę → wraca z rodzeństwem → rodzice proszą o przyjęcie. Ten sam dzieciak, to samo
    rodzeństwo i ci sami rodzice stoją pod bramą w kolejnych krokach, z tymi samymi imionami, nazwiskiem i twarzami; rodzina
    przyjęta zostaje mieszkańcami (`przyjmijGosci`). */
const WODA: Lancuch = {
  id: 'woda',
  tryby: OBA,
  kroki: [
    krok('woda', 1, {
      when: ['dzien'],
      w: () => 1,
      make: (h) => ({ osoby: [czlowiek(h, { f: true, wiek: [8, 12] })] }),
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'dziecko' }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Dziewczynka z baniakiem', 'A girl with a jerry can'),
      text: (h, d) => {
        const [dz] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        if (!dz) return brakGosci(h);
        const zombie = h.tryb() === 'zombie';
        return tx(
          `${wielka(s.brama.pod)} stoi dziewczynka, ${dz.age} lat, z baniakiem po płynie do prania. Przedstawia się: ${dz.first}. Mówi, że w ${sas.w} kran „ma wygasłą subskrypcję”, a studnia na ich podwórku stoi bez pompy. Prosi o baniak wody.${zombie ? ' Co chwilę ogląda się przez ramię na ulicę.' : ''}`,
          `A girl of ${dz.age}, with a jerry can that used to hold laundry liquid, is standing at ${e.brama}. She gives her name as ${dz.first}. She says the tap in ${sas.en} “has an expired subscription”, and the well in their yard stands without a pump. She asks for a can of water.${zombie ? ' Every so often she glances over her shoulder at the street.' : ''}`,
        );
      },
      choices: (h, d) => {
        const zapisz = (jak: string) => () => h.hak('woda.pierwsza', { ...pierwsza(h, d), jak });
        const dz = pierwsza(h, d).p;
        return [
          {
            label: tx('Nalać baniak do pełna', 'Fill the can to the brim'),
            ok: pod(h, d),
            run: () => {
              zapisz('woda')();
              h.nakarmGosci(0);
              h.mood(1, 0);
              h.log(
                tx(
                  `${dz.first} odchodzi z pełnym baniakiem, trzymając go obiema rękami.`,
                  `${dz.first} walks off with a full can, holding it in both hands.`,
                ),
              );
            },
          },
          {
            label: tx('Nalać i dołożyć kromkę (Jedzenie 1)', 'Fill the can and add a slice of bread (Food 1)'),
            ok: pod(h, d) && h.res.jedzenie >= 1,
            run: () => {
              zapisz('kromka')();
              h.nakarmGosci(1);
              h.mood(2, 0);
            },
          },
          odprawic(h, d, () => {
            zapisz('odprawa')();
            h.mood(-1, 0);
          }),
        ];
      },
    }),
    krok('woda', 2, {
      po: 10,
      hak: 'woda.pierwsza',
      when: ['dzien'],
      w: () => 1,
      make: (h) => {
        const x = h.hakDane('woda.pierwsza')?.d as { p: Person; look?: number; zid: string; jak: string } | undefined;
        if (!x) return null;
        const nazwisko = nazwiskoOsoby(x.p);
        const b1 = czlowiek(h, { f: false, wiek: [6, 10], nazwisko, unikaj: [x.p.first] });
        const b2 = czlowiek(h, { f: false, wiek: [4, 8], nazwisko, unikaj: [x.p.first, b1.first] });
        const zajete: number[] = x.look !== undefined ? [x.look] : [];
        const looks = [x.look ?? nowyWyglad(h, zajete), nowyWyglad(h, zajete), nowyWyglad(h, zajete)];
        return { osoby: [x.p, b1, b2], looks, zid: x.zid, jak: x.jak };
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'dziecko', wraca: d.zid, look: d.looks }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Wraca z braćmi', 'She is back with her brothers'),
      text: (h, d) => {
        const [dz, ...bracia] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        if (!dz) return brakGosci(h);
        const imiona = bracia.map((b) => b.first);
        const wstep: Record<string, Tx> = {
          odprawa: tx(
            `Wróciła ${dz.first}, dziewczynka, której odmówiliście wody.`,
            `${dz.first} is back, the girl you turned away without water.`,
          ),
          kromka: tx(
            `Wróciła ${dz.first}, ta od baniaka i kromki chleba.`,
            `${dz.first} is back, the one with the jerry can and the slice of bread.`,
          ),
          woda: tx(`Wróciła ${dz.first}, ta od baniaka.`, `${dz.first} is back, the one with the jerry can.`),
        };
        const w = wstep[d.jak] ?? wstep.woda;
        if (!bracia.length)
          return tx(
            `${w.pl} ${wielka(s.brama.pod)} stoi z nowym baniakiem i prosi o więcej wody.`,
            `${w.en} She is standing at ${e.brama} with another can and asking for more water.`,
          );
        const lista =
          imiona.length === 1 ? imiona[0] : `${imiona.slice(0, -1).join(', ')} i ${imiona[imiona.length - 1]}`;
        const listaEn =
          imiona.length === 1 ? imiona[0] : `${imiona.slice(0, -1).join(', ')} and ${imiona[imiona.length - 1]}`;
        return tx(
          `${w.pl} ${wielka(s.brama.pod)} stoi z trzema baniakami i młodszymi braćmi (${lista}). Mówi, że w ${sas.w} wszyscy już wiedzą, gdzie dostanie się wodę.`,
          `${w.en} She is standing at ${e.brama} with three cans and her younger brothers (${listaEn}). She says everybody in ${sas.en} now knows where water can be had.`,
        );
      },
      choices: (h, d) => {
        const zapisz = () => {
          const gr = h.grupa(d.gid);
          h.hak('woda.druga', { osoby: gr?.osoby ?? d.osoby, looks: gr?.looks ?? d.looks });
        };
        return [
          {
            label: tx('Nalać wszystkie baniaki', 'Fill all the cans'),
            ok: pod(h, d),
            run: () => {
              zapisz();
              h.nakarmGosci(0);
              h.mood(1, 0);
            },
          },
          {
            label: tx('Dołożyć chleba dla całej trójki (Jedzenie 2)', 'Add bread for all three (Food 2)'),
            ok: pod(h, d) && h.res.jedzenie >= 2,
            run: () => {
              zapisz();
              h.nakarmGosci(2);
              h.mood(2, 0);
            },
          },
          odprawic(h, d, () => {
            zapisz();
            h.mood(-1, 0);
          }),
        ];
      },
    }),
    krok('woda', 3, {
      po: 14,
      hak: 'woda.druga',
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: (h) => {
        const x = h.hakDane('woda.druga')?.d as { osoby: Person[]; looks?: number[] } | undefined;
        if (!x?.osoby.length) return null;
        const nazwisko = nazwiskoOsoby(x.osoby[0]);
        const unikaj = x.osoby.map((o) => o.first);
        const ojciec = czlowiek(h, { f: false, wiek: [32, 46], prof: 'Hydraulik', nazwisko, unikaj });
        const matka = czlowiek(h, { f: true, wiek: [30, 44], nazwisko, unikaj: [...unikaj, ojciec.first] });
        const zajete = [...(x.looks ?? [])];
        const looks = [
          nowyWyglad(h, zajete),
          nowyWyglad(h, zajete),
          ...(x.looks ?? x.osoby.map(() => nowyWyglad(h, zajete))),
        ];
        return { osoby: [ojciec, matka, ...x.osoby], looks };
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'rodzina', chce: 'dolaczyc', look: d.looks }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Rodzice dzieciaków od wody', 'The parents of the water kids'),
      text: (h, d) => {
        const os = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        const [ojciec, matka] = os;
        if (!ojciec) return brakGosci(h);
        const n = os.length;
        const dzieci = os.slice(2).map((o) => o.first);
        const imiona =
          dzieci.length > 1 ? `${dzieci.slice(0, -1).join(', ')} i ${dzieci[dzieci.length - 1]}` : (dzieci[0] ?? '');
        const imionaEn =
          dzieci.length > 1 ? `${dzieci.slice(0, -1).join(', ')} and ${dzieci[dzieci.length - 1]}` : (dzieci[0] ?? '');
        return tx(
          `${wielka(s.brama.pod)} ${stoi(n)}: ${ojciec.name}${matka ? ` i ${matka.name}` : ''}${dzieci.length ? `, a przy nich ${imiona}, ci od baniaków` : ''}. Ojciec trzyma zwinięty materac, matka torbę z całym dobytkiem. Mówią, że w ${sas.w} zostali sami, bo reszta wyniosła się, kiedy wyłączyli ostatnią pompę. Proszą o miejsce dla całej rodziny.`,
          `${wielka(ludzieEn(n))} ${standEn(n)} at ${e.brama}: ${ojciec.name}${matka ? ` and ${matka.name}` : ''}${dzieci.length ? `, and with them ${imionaEn}, the ones with the water cans` : ''}. The father holds a rolled-up mattress, the mother a bag with everything they own. They say that in ${sas.en} they were left on their own, because everyone else moved out when the last pump was switched off. They ask for a place for the whole family.`,
        );
      },
      choices: (h, d) => {
        const os = ludzie(h, d);
        const n = os.length;
        const podloga = naPodlodze(h, n);
        return [
          {
            label: tx(
              `Przyjąć całą rodzinę${podloga > 0 ? ` (${osobyNaPodlodze(podloga)} spać na podłodze)` : ''}`,
              `Take the whole family in${podloga > 0 ? ` (${ludzieEn(podloga)} on the floor)` : ''}`,
            ),
            ok: pod(h, d),
            run: () => {
              h.przyjmijGosci();
              h.mood(2, podloga > 0 ? 2 : 0);
              h.hak('woda.rodzina');
              h.log(
                tx(
                  `Przyjęliście rodzinę dzieciaków od wody: ${n} ${osob(n)}.${podloga > 0 ? ` ${osobyNaPodlodze(podloga)} spać na podłodze.` : ''}`,
                  `You took in the family of the water kids: ${ludzieEn(n)}.${podloga > 0 ? ` ${wielka(ludzieEn(podloga))} will sleep on the floor.` : ''}`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Dać jedzenie na drogę (Jedzenie 3)', 'Give them food for the road (Food 3)'),
            ok: pod(h, d) && h.res.jedzenie >= 3,
            run: () => {
              h.nakarmGosci(3);
              h.mood(1, 0);
              h.hak('woda.jedzenie');
            },
          },
          odprawic(h, d, () => {
            h.mood(-2, 1);
            h.hak('woda.nie');
          }),
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 5. list z 2026 (oba tryby)

/** miejsca, w których według listu leży skrytka: coś, co dawno temu miało zamek i zapasy */
const SKRYTKA = ['garaz', 'hala', 'budowlany', 'elektronika', 'sklep', 'spozywczy'] as const;

/** 5. Stary list z 2026 w skrzynce → dopisek z adresem → wskazówka na miejsce z okolicy (wyprawa tam ma ryzyko ×0,5 i łup
    ×1,5). Adres to prawdziwe miejsce z okolicy (`miejsceWskazowki`), a bez mapy miasta cel z TARGETS. */
const LIST: Lancuch = {
  id: 'list',
  tryby: OBA,
  kroki: [
    krok('list', 1, {
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('List z 2026 roku', 'A letter from 2026'),
      text: (h) =>
        tx(
          `Za zardzewiałą klapką skrzynki ${dom(h) ? 'na listy przy furtce' : 'pocztowej w klatce'} przeleżała dwadzieścia pięć lat koperta. Stempel: październik 2026. Adresat: „Do wszystkich mieszkańców, bo nie wiem, kogo”. W środku jedna kartka, pisana ręcznie, bo drukarka, jak pisze nadawca, „zażądała aktualizacji”. Nadawca pracuje w firmie od recyklingu elektrośmieci i pisze, że w laboratorium dzieje się coś dziwnego: kable zrobiły się zielone w tydzień. Kierownik mówi, że to normalne, a asystent w systemie zgłoszeń odpowiada, że „rozumie obawy”. Nadawca prosi, żeby ktoś to jednak sprawdził, zanim się rozejdzie.`,
          `Behind a rusty flap of the letterbox ${dom(h) ? 'by the garden gate' : 'in the stairwell'}, an envelope had lain for twenty-five years. Postmark: October 2026. Addressed to “All residents, because I don’t know whom”. Inside is a single handwritten page, because the printer, the writer says, “demanded an update”. The writer works for an e-waste recycling company and says something odd is going on in the lab: the cables turned green within a week. The manager says it is normal, and the assistant in the ticket system replies that it “understands the concern”. The writer asks that someone look into it before it spreads.`,
        ),
      choices: (h) => [
        {
          label: tx('Przeczytać na głos przy kozie', 'Read it out loud by the stove'),
          ok: true,
          run: () => {
            h.moodAll('Wiemy, jak się zaczęło', 3, 24);
            h.mood(1, 0);
            h.hak('list.przeczytany', { jak: 'glos' });
            h.log(
              tx(
                'Przy kozie nikt się nie odzywał, kiedy skończyli czytać. Ktoś w końcu powiedział, że przynajmniej wiadomo, od czego się zaczęło.',
                'Nobody spoke by the stove when the reading was done. Someone finally said that at least now you know what it started with.',
              ),
            );
          },
        },
        {
          label: tx('Schować do kroniki', 'File it in the log'),
          ok: true,
          run: () => {
            h.mood(1, 0);
            h.hak('list.przeczytany', { jak: 'kronika' });
            h.log(
              tx(
                'List z 2026 roku leży w kronice, między grafikiem warty a rachunkiem za wodę, którego nikt nie zapłaci.',
                'The letter from 2026 now lies in the log, between the watch rota and a water bill nobody will pay.',
              ),
              true,
            );
          },
        },
        {
          label: tx('Przeczytać po cichu, tylko między sobą', 'Read it quietly, just among yourselves'),
          ok: true,
          run: () => {
            h.needsAll({ safe: -2 });
            h.hak('list.przeczytany', { jak: 'cicho' });
          },
        },
      ],
    }),
    krok('list', 2, {
      po: 6,
      hak: 'list.przeczytany',
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('Dopisek na odwrocie', 'A note on the back'),
      text: (h) => {
        const m = h.miejsceWskazowki(SKRYTKA, 'pawilon');
        return tx(
          `Na odwrocie kartki, drobnym pismem, dopisek: „P.S. Zapas zostawiłem w skrytce. Kod do zamka to data urodzin mojego kota. Kot wabił się Regulamin”. Dopisek wskazuje miejsce z okolicy: ${m.pl}. Po dwudziestu pięciu latach może być w skrytce wszystko, ale gołe kable na pewno zjadła bakteria.`,
          `On the back of the page, in tiny handwriting, is a postscript: “P.S. I left a stash in a lockbox. The lock code is my cat’s birthday. The cat was called Terms.” The note points to a place nearby: ${m.en}. After twenty-five years anything could be inside the lockbox, but bare cables will certainly have been eaten by the bacterium.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Zapisać adres na kartce z wyprawami', 'Write the address on the supply-run list'),
          ok: true,
          run: () => {
            const m = h.wskazowkaMiejsca(SKRYTKA, 'pawilon');
            h.mood(1, 0);
            h.hak('list.adres');
            h.log(
              tx(
                `Adres skrytki zapisany: ${m.pl}. Następna wyprawa tam będzie bezpieczniejsza i da więcej.`,
                `The lockbox address is written down: ${m.en}. The next run there will be safer and bring back more.`,
              ),
              true,
            );
          },
        },
        {
          label: tx('Spalić list w kozie (Drewno 1)', 'Burn the letter in the stove (Wood 1)'),
          ok: true,
          run: () => {
            h.addRes('opal', 1);
            h.mood(0, 1);
            h.hak('list.spalony');
            h.log(
              tx(
                'List płonął jasno i krótko. Zrobiło się cieplej, a w kozie zostało po nim więcej pytań niż popiołu.',
                'The letter burned bright and short. It got warmer, and the stove was left with more questions than ash.',
              ),
            );
          },
        },
      ],
    }),
  ],
};

// ---------------------------------------------------------------- 6. płuca (oba tryby)

/** 6. Mieszkanka choruje na płuca → leki potrzebne dwa razy → wdzięczność osiedla albo załamane zdrowie. Bohaterka to
    najstarsza mieszkanka z osobą z generatora (`najstarszaMieszkanka`); jej zdrowie i nastrój zmieniają się naprawdę
    (`needsOf`, `moodOf`), a zaufanie i nastrój osiedla razem z nimi. Zarząd nie ma skutku, który zabija mieszkańca, więc
    zły koniec nie kończy się zgonem na karcie: to zrobi dopiero symulacja i pogrzeb. */
const PLUCA: Lancuch = {
  id: 'pluca',
  tryby: OBA,
  lokatorzy: true,
  kroki: [
    krok('pluca', 1, {
      when: ['dzien', 'wieczor'],
      w: (h) => (najstarszaMieszkanka(h) ? 1 : 0),
      make: (h) => {
        const l = najstarszaMieszkanka(h);
        return l ? { lok: l.id, p: osobaKarty(l) } : null;
      },
      title: () => tx('Kaszel', 'A cough'),
      text: (h, d) => {
        const p: OsobaKarty = d.p;
        const skad = zKlatki(h);
        return tx(
          `${pan(p)} ${skad.pl} kaszle od tygodnia tak, że słychać przez ścianę. Mówi, że to od kurzu ${piwnica(h).z}. Chustka, w którą kaszle, jest w plamach, a ${plec(p, 'on', 'ona')} twierdzi, że to od buraków.`,
          `${p.name} ${skad.en} has been coughing for a week, loud enough to hear through the wall. ${on(p, 'He', 'She')} says it is the dust from the ${piwnica(h).en}. The handkerchief ${on(p, 'he', 'she')} coughs into is stained, and ${on(p, 'he', 'she')} says that is beetroot.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        return [
          {
            label: tx('Dać leki (Leki 1)', 'Give meds (Meds 1)'),
            ok: h.res.leki >= 1 && !!mieszkaniec(h, d.lok),
            run: () => {
              h.addRes('leki', -1);
              h.needsOf(d.lok, { health: 15 });
              h.moodOf(d.lok, 'Ktoś mi pomógł', 6, 24);
              h.hak('pluca.pierwsze', { lok: d.lok, p, opieka: 1 });
              h.log(
                tx(
                  `${p.first} ${plec(p, 'połknął', 'połknęła')} tabletkę, popił${plec(p, '', 'a')} herbatą i ${plec(p, 'zapewnił', 'zapewniła')}, że to na pewno placebo, bo działa za szybko.`,
                  `${p.first} swallowed the tablet with tea and insisted it must be a placebo, because it worked too fast.`,
                ),
              );
            },
          },
          {
            label: tx(
              'Posadzić przy kozie i nastawić herbatę',
              `Sit ${on(p, 'him', 'her')} by the stove and put the kettle on`,
            ),
            ok: !!mieszkaniec(h, d.lok),
            run: () => {
              h.needsOf(d.lok, { warm: 10, health: 3 });
              h.moodOf(d.lok, 'Posiedzieli ze mną', 3, 12);
              h.hak('pluca.pierwsze', { lok: d.lok, p, opieka: 0 });
            },
          },
          {
            label: tx('Kazać iść do przychodni', `Tell ${on(p, 'him', 'her')} to go to the clinic`),
            ok: !!mieszkaniec(h, d.lok),
            run: () => {
              h.needsOf(d.lok, { health: -5 });
              h.moodOf(d.lok, 'Nikt się mną nie przejął', -6, 24);
              h.hak('pluca.pierwsze', { lok: d.lok, p, opieka: 0 });
              h.log(
                tx(
                  `${p.first} wie, że przychodnia stoi zabita deskami, a na deskach wisi kartka o godzinach przyjęć z 2033 roku. Kiwa głową i kaszle dalej.`,
                  `${p.first} knows the clinic is boarded up, with a notice about opening hours from 2033 hanging on the boards. ${on(p, 'He', 'She')} nods and goes on coughing.`,
                ),
              );
            },
          },
        ];
      },
    }),
    krok('pluca', 2, {
      po: 20,
      hak: 'pluca.pierwsze',
      when: ['dzien', 'wieczor', 'noc'],
      w: (h) => (mieszkaniec(h, (h.hakDane('pluca.pierwsze')?.d as { lok?: string } | undefined)?.lok) ? 1 : 0),
      make: (h) => h.hakDane('pluca.pierwsze')?.d ?? null,
      title: () => tx('Kaszel wrócił', 'The cough is back'),
      text: (_h, d) => {
        const p: OsobaKarty = d.p;
        const wstep =
          d.opieka > 0
            ? tx(
                'Po tamtych lekach było lepiej do następnego dnia, a potem wróciło.',
                'The meds helped until the next day, and then it came back.',
              )
            : tx('Tamto nie pomogło, a teraz jest gorzej.', 'That did not help, and now it is worse.');
        return tx(
          `${wstep.pl} ${pan(p)} kaszle znowu, głębiej, i nie wychodzi już z pokoju. Bez leków się nie obejdzie.`,
          `${wstep.en} ${p.name} is coughing again, deeper now, and no longer leaves the room. It will not pass without meds.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        const jest = !!mieszkaniec(h, d.lok);
        return [
          {
            label: tx('Dać pełną dawkę (Leki 2)', 'Give a full course (Meds 2)'),
            ok: jest && h.res.leki >= 2,
            run: () => {
              h.pay({ leki: 2 });
              h.needsOf(d.lok, { health: 25 });
              h.moodOf(d.lok, 'Ktoś mi pomógł', 8, 48);
              h.hak('pluca.drugie', { lok: d.lok, p, opieka: d.opieka + 2, mialLeki: true });
            },
          },
          {
            label: tx('Dać pół dawki (Leki 1)', 'Give half a course (Meds 1)'),
            ok: jest && h.res.leki >= 1,
            run: () => {
              h.pay({ leki: 1 });
              h.needsOf(d.lok, { health: 10 });
              h.moodOf(d.lok, 'Ktoś mi pomógł', 4, 24);
              h.hak('pluca.drugie', { lok: d.lok, p, opieka: d.opieka + 1, mialLeki: true });
            },
          },
          {
            label: tx('Nie dawać', 'Give nothing'),
            ok: jest,
            run: () => {
              h.needsOf(d.lok, { health: -20 });
              h.moodOf(d.lok, 'Nikt się mną nie przejął', -8, 48);
              // czy zarząd miał czym pomóc: bez leków mieszkańcy nie mają mu czego zarzucić (trzeci krok mówi tylko to, co prawda)
              h.hak('pluca.drugie', { lok: d.lok, p, opieka: d.opieka, mialLeki: h.res.leki >= 1 });
            },
          },
        ];
      },
    }),
    krok('pluca', 3, {
      po: 14,
      hak: 'pluca.drugie',
      when: ['dzien'],
      w: (h) => (mieszkaniec(h, (h.hakDane('pluca.drugie')?.d as { lok?: string } | undefined)?.lok) ? 1 : 0),
      make: (h) => h.hakDane('pluca.drugie')?.d ?? null,
      title: (_h, d) =>
        d.opieka >= 2
          ? tx('Podziękowanie', 'Thanks')
          : d.opieka === 1
            ? tx('Ani lepiej, ani gorzej', 'No better, no worse')
            : tx('Leży i nie wstaje', 'Bedridden'),
      text: (h, d) => {
        const p: OsobaKarty = d.p;
        const s = h.words();
        const e = h.wordsEn();
        const wspolnota = dom(h) ? tx('Cała ulica', 'The whole street') : tx('Cała klatka', 'The whole stairwell');
        const ona = plec(p, 'niego', 'niej');
        if (d.opieka >= 2)
          return tx(
            `${pan(p)} siedzi rano na ławce ${dom(h) ? 'przed domem' : 'przed klatką'}, w szaliku, z kubkiem herbaty. ${plec(p, 'Przyniósł', 'Przyniosła')} do ${s.zarzad.dk} słoik ogórków ${piwnica(h).z} i zdanie, które zaczyna się od: „Wiecie, że pierwszy raz od lat ktoś mnie zapytał, jak się czuję?”. ${wspolnota.pl} już wie, ile dla ${ona} zrobiliście.`,
            `${p.name} is sitting on the bench ${dom(h) ? 'outside the house' : 'outside the entrance'} in the morning, in a scarf, with a mug of tea. ${on(p, 'He', 'She')} has brought ${e.krotko} a jar of pickles from the ${piwnica(h).en} and a sentence that begins: “Do you know it is the first time in years that someone has asked how I feel?” ${wspolnota.en} already knows how much you did for ${on(p, 'him', 'her')}.`,
          );
        if (d.opieka === 1)
          return tx(
            `${pan(p)} kaszle, ale nie gorzej. Siedzi przy kozie w trzech swetrach i twierdzi, że to wszystko wina pogody.`,
            `${p.name} is coughing, but no worse. ${on(p, 'He', 'She')} sits by the stove in three jumpers and maintains it is all the weather’s fault.`,
          );
        const winaPl = d.mialLeki
          ? `${wspolnota.pl} wie, że ${s.zarzad.m} miał leki, i patrzy w ziemię, kiedy was mija.`
          : `${wspolnota.pl} wie, że nie było czym pomóc, ale i tak milknie, kiedy was mija.`;
        const winaEn = d.mialLeki
          ? `${wspolnota.en} knows that ${e.krotko} had meds, and looks at the ground when you walk past.`
          : `${wspolnota.en} knows there was nothing to help with, and still goes quiet when you walk past.`;
        return tx(
          `${pan(p)} nie wstaje z tapczanu od wczoraj. ${winaPl} Kaszel ucichł, bo ${plec(p, 'zabrakło mu', 'zabrakło jej')} sił.`,
          `${p.name} has not got up from the bed since yesterday. ${winaEn} The coughing has died down, because ${on(p, 'he', 'she')} has no strength left for it.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        const jest = !!mieszkaniec(h, d.lok);
        if (d.opieka >= 2)
          return [
            {
              label: tx('Przyjąć ogórki', 'Accept the pickles'),
              ok: true,
              run: () => {
                h.later(
                  { supplies: 2 },
                  tx(
                    `Słoik ogórków, który ${plec(p, 'przyniósł', 'przyniosła')} ${p.first}, dołożył do zapasów dwie porcje jedzenia.`,
                    `The jar of pickles from ${p.first} added two portions of food to the stores.`,
                  ),
                );
                h.mood(2, 0);
                h.moodAll('Dbają o nas', 4, 24);
                h.hak('pluca.dobrze');
              },
            },
            {
              label: tx(
                `Poprosić, żeby ${plec(p, 'rozdał', 'rozdała')} sąsiadom`,
                `Ask ${on(p, 'him', 'her')} to hand them round to the neighbours`,
              ),
              ok: true,
              run: () => {
                h.mood(3, 0);
                h.moodAll('Dbają o nas', 4, 24);
                h.hak('pluca.dobrze');
              },
            },
          ];
        if (d.opieka === 1)
          return [
            {
              label: tx('Przenieść łóżko bliżej kozy', 'Move the bed closer to the stove'),
              ok: jest,
              run: () => {
                h.needsOf(d.lok, { warm: 15, health: 8 });
                h.hak('pluca.srednio');
              },
            },
            {
              label: tx('Zostawić, jak jest', 'Leave things as they are'),
              ok: true,
              run: () => h.hak('pluca.srednio'),
            },
          ];
        return [
          {
            label: tx(
              `Dyżurować przy ${plec(p, 'nim', 'niej')} (odpoczynek −15)`,
              `Sit up with ${on(p, 'him', 'her')} (Rest −15)`,
            ),
            ok: jest && !!h.doSprawdzenia(),
            run: () => {
              const kto = h.doSprawdzenia();
              if (kto) h.needsOf(kto.id, { rest: -15 });
              h.needsOf(d.lok, { health: 10 });
              h.moodOf(d.lok, 'Posiedzieli ze mną', 4, 24);
              h.hak('pluca.zle');
            },
          },
          {
            label: tx('Zostawić, jak jest', 'Leave things as they are'),
            ok: true,
            run: () => {
              h.mood(-2, 3);
              h.needsOf(d.lok, { health: -15 });
              h.hak('pluca.zle');
              h.log(
                tx(
                  `${p.first} leży ${plec(p, 'sam', 'sama')} w ${dom(h) ? 'pokoju' : 'mieszkaniu'}, a sąsiedzi omijają drzwi szerokim łukiem.`,
                  `${p.first} lies alone in ${dom(h) ? 'the room' : 'the flat'}, and the neighbours give the door a wide berth.`,
                ),
                true,
              );
            },
          },
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 7. ostrzeżenie przed napadem (zwykły tryb)

/** 7. Ochroniarz z zamkniętego osiedla ostrzega przed napadem tej nocy → noc z ostrzeżeniem albo bez → ten sam człowiek prosi o
    przyjęcie jako dezerter. Ostrzeżenie jest prawdziwe w grze: napad tej nocy staje się bardziej prawdopodobny i przychodzi
    przy bramie (`poscig`, jak za gościem wpuszczonym na noc), a uwierzenie mu podwaja wartę (`setAlertNight`). Drugi krok
    czyta wynik nocy z raportu (`napadNocy`), więc mówi to samo co raport rano: odparty, wtargnięcie albo cisza. */
const OSTRZEGA: Lancuch = {
  id: 'ostrzega',
  tryby: TYLKO_ZWYKLY,
  kroki: [
    krok('ostrzega', 1, {
      when: ['wieczor'],
      w: () => 1,
      make: (h) => ({
        osoby: [czlowiek(h, { f: h.rng() < 0.3, wiek: [22, 34], prof: 'Ochroniarz z galerii' })],
        noc: h.day(),
      }),
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'dezerter' }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Ostrzeżenie od ochrony', 'A warning from security'),
      text: (h, d) => {
        const [o] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        if (!o) return brakGosci(h);
        return tx(
          `${wielka(s.brama.pod)} stoi ${plec(o, 'młody ochroniarz', 'młoda ochroniarka')}, ${o.name}, w kurtce z napisem OCHRONA. ${plec(o, 'Pilnował', 'Pilnowała')} wjazdu do ${dom(h) ? 'zamkniętego kompleksu domów' : 'zamkniętego osiedla'} za obwodnicą, tego ze szlabanem i aplikacją do otwierania. Mówi cicho i szybko: koledzy ze zmiany szykują się dziś w nocy do was. Mają pałki i listę adresów z grupy na komunikatorze, który padł w 2034 roku, ale lista została na kartce.`,
          `A young security guard, ${o.name}, in a jacket marked SECURITY, is standing at ${e.brama}. ${on(o, 'He', 'She')} used to man the barrier of a ${dom(h) ? 'gated complex of houses' : 'gated estate'} beyond the ring road, the kind with an app for lifting it. ${on(o, 'He', 'She')} speaks quietly and quickly: ${on(o, 'his', 'her')} colleagues from the shift are planning to visit you tonight. They have batons and a list of addresses from a group chat on a messenger that went down in 2034, but the list survived on paper.`,
        );
      },
      choices: (h, d) => {
        const zapisz = (jak: string) => {
          h.hak('ostrzega.start', { ...pierwsza(h, d), jak, noc: d.noc });
        };
        return [
          {
            label: tx(
              'Podziękować, dać jedzenie i podwoić wartę (Jedzenie 1)',
              `Thank ${them(h, d)}, give food and double the watch (Food 1)`,
            ),
            ok: pod(h, d) && h.res.jedzenie >= 1,
            run: () => {
              zapisz('uwierzyli');
              h.nakarmGosci(1);
              h.setAlertNight();
              h.poscig();
              h.mood(1, 0);
              h.log(
                tx(
                  `Warta tej nocy jest podwojona. ${plec(pierwsza(h, d).p, 'Ochroniarz poszedł', 'Ochroniarka poszła')} z kromką w kieszeni i miną kogoś, kto zrobił coś głupiego.`,
                  'The watch is doubled for tonight. The guard left with a slice of bread in a pocket and the look of someone who has done something stupid.',
                ),
                true,
              );
            },
          },
          wpuscNaNoc(h, d, () => {
            zapisz('wpuscili');
            h.setAlertNight();
            h.poscig();
            h.log(
              tx(
                `${plec(pierwsza(h, d).p, 'Ochroniarz siedzi', 'Ochroniarka siedzi')} ${przyOgniu(h).pl} i co chwilę zerka w stronę ${brama(h).d}. Warta tej nocy jest podwojona.`,
                `The guard sits ${przyOgniu(h).en} and keeps glancing towards ${h.wordsEn().brama}. The watch is doubled tonight.`,
              ),
              true,
            );
          }),
          odprawic(h, d, () => {
            zapisz('zignorowali');
            h.poscig();
          }),
        ];
      },
    }),
    krok('ostrzega', 2, {
      po: 14,
      hak: 'ostrzega.start',
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: (h) => {
        const x = h.hakDane('ostrzega.start')?.d as
          | { p: Person; look?: number; zid: string; jak: string; noc: number }
          | undefined;
        return x
          ? { osoby: [x.p], looks: x.look !== undefined ? [x.look] : undefined, zid: x.zid, jak: x.jak, noc: x.noc }
          : null;
      },
      gosc: (_h, d) => ({
        osoby: d.osoby,
        kto: 'dezerter',
        chce: 'dolaczyc',
        wraca: d.zid,
        ...(d.looks ? { look: d.looks } : {}),
      }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: (h, d) =>
        tx(
          plec(ludzie(h, d)[0] ?? { f: false }, 'Dezerter prosi o miejsce', 'Dezerterka prosi o miejsce'),
          'A deserter asks for a place',
        ),
      text: (h, d) => {
        const [o] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        if (!o) return brakGosci(h);
        const ostrzezony = d.jak !== 'zignorowali';
        const wynik = h.napadNocy(d.noc);
        const mowil = plec(o, 'mówił', 'mówiła');
        const noc: Tx =
          wynik === 'odparty'
            ? ostrzezony
              ? tx(
                  `Tej nocy przyszli, tak jak ${mowil}. Warta była podwojona i odparliście ich.`,
                  'They came that night, just as warned. The watch was doubled and you drove them off.',
                )
              : tx(
                  `Tej nocy przyszli, tak jak ${mowil}. Odparliście ich, choć ostrzeżenie zlekceważyliście.`,
                  'They came that night, just as warned. You drove them off, though you had brushed the warning aside.',
                )
            : wynik === 'wtargnięcie'
              ? ostrzezony
                ? tx(
                    `Tej nocy przyszli, tak jak ${mowil}, i weszli na podwórko mimo podwojonej warty.`,
                    'They came that night, just as warned, and got into the yard in spite of the doubled watch.',
                  )
                : tx(
                    `Tej nocy przyszli, tak jak ${mowil}, i weszli na podwórko. Warty nie podwajaliście.`,
                    'They came that night, just as warned, and got into the yard. You had not doubled the watch.',
                  )
              : wynik === 'brak'
                ? ostrzezony
                  ? tx(
                      'Tej nocy nikt nie przyszedł. Może podwójna warta ich zniechęciła, a może kartka z adresami była stara.',
                      'Nobody came that night. Perhaps the doubled watch put them off, or perhaps the list of addresses was out of date.',
                    )
                  : tx(
                      'Tej nocy nikt nie przyszedł. Może koledzy się rozmyślili, a może kartka z adresami była stara.',
                      'Nobody came that night. Perhaps the colleagues changed their minds, or perhaps the list of addresses was out of date.',
                    )
                : tx('Noc minęła.', 'The night passed.');
        return tx(
          `${noc.pl} Teraz ${s.brama.pod} znów stoi ${o.name}, ${plec(o, 'sam', 'sama')}, bez kurtki z napisem. Szef ochrony dowiedział się, kto ostrzegł, i wyrzucił ${plec(o, 'go', 'ją')} z posady razem z mundurem. ${dom(h) ? 'Do zamkniętego kompleksu' : 'Do zamkniętego osiedla'} nie ma już po co wracać. Umie pilnować ${s.brama.d} i prosi o miejsce.`,
          `${noc.en} Now ${o.name} is back at ${e.brama}, alone, without the jacket. The head of security found out who had given the warning and threw ${on(o, 'him', 'her')} out of the job, uniform and all. There is no point going back to the ${dom(h) ? 'gated complex' : 'gated estate'}. ${on(o, 'He', 'She')} knows how to keep watch at ${e.brama} and asks for a place.`,
        );
      },
      choices: (h, d) => {
        const os = ludzie(h, d);
        const o = os[0];
        const n = os.length;
        const podloga = naPodlodze(h, n);
        const s = h.words();
        const e = h.wordsEn();
        const gdzie = tx(dom(h) ? 'w domu' : 'w spółdzielni', dom(h) ? 'in the house' : 'in the co-op');
        return [
          {
            label: tx(
              `Przyjąć do ${dom(h) ? 'domu' : 'spółdzielni'}${podloga > 0 ? ' (będzie spać na podłodze)' : ''}`,
              `Take ${on(o ?? { f: false }, 'him', 'her')} into ${dom(h) ? 'the house' : 'the co-op'}${podloga > 0 ? ' (will sleep on the floor)' : ''}`,
            ),
            ok: pod(h, d),
            run: () => {
              h.przyjmijGosci();
              h.mood(1, podloga > 0 ? 2 : 0);
              h.hak('ostrzega.przyjety');
              h.log(
                tx(
                  `${o?.name ?? 'Dezerter'} zostaje ${gdzie.pl}. ${plec(o ?? { f: false }, 'Powiedział', 'Powiedziała')}, że umie spać na stojąco, ale woli łóżko.`,
                  `${o?.name ?? 'The deserter'} stays ${gdzie.en}. ${on(o ?? { f: false }, 'He', 'She')} says ${on(o ?? { f: false }, 'he', 'she')} can sleep standing up, but prefers a bed.`,
                ),
                true,
              );
            },
          },
          {
            label: tx(`Przyjąć do ${s.zarzad.dk} (${o?.first ?? ''})`, `Take ${o?.first ?? ''} onto ${e.krotko}`),
            ok: pod(h, d),
            run: () => {
              h.przyjmijDoZarzadu();
              h.mood(1, 0);
              h.hak('ostrzega.zarzad');
              h.log(
                tx(
                  `${o?.name ?? 'Dezerter'} wchodzi do ${s.zarzad.dk}. Warta ma wreszcie kogoś, kto wie, jak się stoi ${s.brama.przy}.`,
                  `${o?.name ?? 'The deserter'} joins ${e.krotko}. The watch finally has someone who knows how to stand at ${e.brama}.`,
                ),
                true,
              );
            },
          },
          {
            label: tx(
              'Dać jedzenie i odprawić (Jedzenie 2)',
              `Give ${them(h, d)} food and send ${them(h, d)} away (Food 2)`,
            ),
            ok: pod(h, d) && h.res.jedzenie >= 2,
            run: () => {
              h.nakarmGosci(2);
              h.hak('ostrzega.jedzenie');
            },
          },
          odprawic(h, d, () => {
            h.mood(-1, 1);
            h.hak('ostrzega.nie');
          }),
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 8. dług u handlarza (zwykły tryb)

/** 8. Handlarz zostawia towar na kredyt → przy następnej wizycie prawdziwego handlarza (stoi pod bramą, `GovInput.handlarz`)
    upomina się o dług → lepsza oferta albo zła sława. Oba kroki są „pilne”: handlarz stoi pod bramą najwyżej trzy godziny gry,
    więc karta wypada, gdy tylko jest dojrzała. Towar z kredytu trafia do zapasów od razu, dług płaci się zapasami, a skutek
    dla handlarza (`handlarzEfekt`) zmienia jego ofertę w symulacji: lepsza oferta to dziś ¼ taniej i jedna wymiana więcej, zła
    sława to wyższe ceny i rzadsze wizyty. Karta czeka na odpowiedź dłużej, niż handlarz stoi, więc gdy odszedł, zamyka ją osobny
    wybór „Handlarz już poszedł” (zawsze dostępny jest dokładnie jeden z wyborów: trzy za handlarza, ten bez niego). */
const DLUG: Lancuch = {
  id: 'dlug',
  tryby: TYLKO_ZWYKLY,
  obcy: true,
  kroki: [
    krok('dlug', 1, {
      pilny: true,
      when: ['dzien'],
      w: (h) => (h.handlarz() ? 1 : 0),
      make: () => ({}),
      gdzie: (h) => h.handlarz()?.gdzie ?? null,
      title: () => tx('Handlarz na kredyt', 'The trader offers credit'),
      text: (h) => {
        const s = h.words();
        const e = h.wordsEn();
        return tx(
          `${wielka(s.brama.pod)} stoi handlarz z wózkiem i patrzy na wasze ręce, w których nic nie ma. Zostawia worek: trzy porcje jedzenia i paczkę leków. „Oddacie przy następnej wizycie”, mówi. „Cztery złomu. Albo komunikator, jeśli macie”. To żart: komunikatora nikt nie ma od 2034 roku, więc zostaje złom.`,
          `A trader with a cart is standing at ${e.brama}, looking at your empty hands. He leaves a sack: three portions of food and a pack of meds. “Pay me back on my next visit,” he says. “Four scrap. Or a messenger app, if you have one.” It is a joke: nobody has had a messenger app since 2034, so scrap it is.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Wziąć na kredyt (+Jedzenie 3, +Leki 1)', 'Take it on credit (+Food 3, +Meds 1)'),
          ok: !!h.handlarz(),
          run: () => {
            h.addRes('jedzenie', 3);
            h.addRes('leki', 1);
            h.mood(1, 0);
            h.hak('dlug.wziete', { cena: 4, dzien: h.day() });
            h.log(
              tx(
                'Worek stoi w kuchni. Na worku handlarz napisał kredą: 4 złomu.',
                'The sack stands in the kitchen. On the sack the trader has written in chalk: 4 scrap.',
              ),
              true,
            );
          },
        },
        {
          label: tx('Wziąć tylko jedzenie (+Jedzenie 3)', 'Take only the food (+Food 3)'),
          ok: !!h.handlarz(),
          run: () => {
            h.addRes('jedzenie', 3);
            h.hak('dlug.wziete', { cena: 3, dzien: h.day() });
            h.log(
              tx(
                'Trzy porcje poszły do spiżarni. Kredą na boku worka: 3 złomu.',
                'Three portions went into the larder. In chalk on the side of the sack: 3 scrap.',
              ),
              true,
            );
          },
        },
        {
          label: tx('Podziękować i nie brać', 'Thank him and take nothing'),
          ok: true,
          run: () => {
            h.hak('dlug.nie');
            h.log(tx('Handlarz wzruszył ramionami i zabrał worek.', 'The trader shrugged and took the sack back.'));
          },
        },
      ],
    }),
    krok('dlug', 2, {
      po: 24,
      hak: 'dlug.wziete',
      pilny: true,
      when: ['dzien'],
      w: (h) => (h.handlarz() ? 1 : 0),
      make: (h) => h.hakDane('dlug.wziete')?.d ?? { cena: 4 },
      gdzie: (h) => h.handlarz()?.gdzie ?? null,
      title: () => tx('Handlarz upomina się o dług', 'The trader comes to collect'),
      text: (_h, d) => {
        return tx(
          `Handlarz wrócił z tym samym wózkiem i tą samą miną. Nie przywitał się, tylko wyciągnął kartkę. Przy pozycji „należność” stoi ${d.cena} złomu. Pod spodem dopisał innym długopisem: „bez odsetek, z uprzejmości”.`,
          `The trader is back with the same cart and the same expression. He does not say hello, he just takes out a sheet of paper. Next to “amount due” it says ${d.cena} scrap. Underneath he has added in a different pen: “no interest, as a courtesy”.`,
        );
      },
      choices: (h, d) => [
        {
          label: tx(`Oddać złomem (Złom ${d.cena})`, `Pay in scrap (Scrap ${d.cena})`),
          ok: !!h.handlarz() && h.res.zlom >= d.cena,
          run: () => {
            h.pay({ zlom: d.cena });
            h.handlarzEfekt('oferta');
            h.mood(1, 0);
            h.hak('dlug.oddany');
            h.log(
              tx(
                'Handlarz przeliczył złom dwa razy, skinął głową i schował kartkę. Dziś jego oferty są o jedną czwartą tańsze i o jedną wymianę dłuższe.',
                'The trader counted the scrap twice, nodded and put the paper away. Today his offers are a quarter cheaper and run for one more exchange.',
              ),
              true,
            );
          },
        },
        {
          label: tx(`Oddać jedzeniem (Jedzenie ${d.cena + 1})`, `Pay in food (Food ${d.cena + 1})`),
          ok: !!h.handlarz() && h.res.jedzenie >= d.cena + 1,
          run: () => {
            h.pay({ jedzenie: d.cena + 1 });
            h.handlarzEfekt('oferta');
            h.mood(1, 0);
            h.hak('dlug.oddany');
            h.log(
              tx(
                'Handlarz wziął jedzenie i zrobił minę kogoś, komu zawsze chodziło o jedzenie. Dziś jego oferty są o jedną czwartą tańsze i o jedną wymianę dłuższe.',
                'The trader took the food with the face of someone who had always wanted food. Today his offers are a quarter cheaper and run for one more exchange.',
              ),
              true,
            );
          },
        },
        {
          label: tx('Nie oddawać', 'Refuse to pay'),
          ok: !!h.handlarz(),
          run: () => {
            h.handlarzEfekt('slawa');
            h.mood(-1, 2);
            h.hak('dlug.zla');
            h.log(
              tx(
                'Handlarz zapisał to w zeszycie, który czytają wszyscy handlarze w okolicy. Ceny pójdą w górę, a wizyty będą rzadsze.',
                'The trader wrote it down in a notebook that every trader in the area reads. Prices will go up and visits will be rarer.',
              ),
              true,
            );
          },
        },
        {
          // handlarz stoi pod bramą najwyżej trzy godziny, a karta czeka na odpowiedź dłużej: bez niego żaden z trzech wyborów
          // wyżej nie działa, więc tylko wtedy ten zamyka kartę (zawsze jest dostępny dokładnie jeden z nich)
          label: tx('Handlarz już poszedł: zostawić jak jest', 'The trader has already left: leave it be'),
          ok: !h.handlarz(),
          run: () => {
            h.mood(-1, 1);
            h.hak('dlug.zwloka');
            h.log(
              tx(
                'Handlarz zniknął za rogiem z wózkiem, zanim ktokolwiek zdążył coś powiedzieć. Dług został na jego kartce.',
                'The trader vanished round the corner with his cart before anyone could say a word. The debt stayed on his sheet of paper.',
              ),
            );
          },
        },
      ],
    }),
  ],
};

// ---------------------------------------------------------------- 9. aktywistka od kóz (zwykły tryb)

/** zimno: co najwyżej 5°C na dworze albo szósta doba gry (gra zaczyna się jesienią, więc zimy z kalendarza nie ma) */
const zimno = (h: GovHost): boolean => h.outdoor() <= 5 || h.day() >= 6;

/** 9. Aktywistka od kóz (nauczycielka fizyki, która protestowała przeciw dymowi z kozy) wraca, kiedy zrobiło się zimno → prosi o
    miejsce przy kozie → zostaje i uczy przy kozie; można ją wciągnąć do zarządu. Dwa pierwsze kroki to ta sama osoba pod
    bramą, trzeci to prawdziwa mieszkanka (po przyjęciu), znaleziona w `lokatorzy()` po imieniu; awans to `awansuj`. */
const AKTYWISTKA: Lancuch = {
  id: 'aktywistka',
  tryby: TYLKO_ZWYKLY,
  kroki: [
    krok('aktywistka', 1, {
      when: ['dzien'],
      w: () => 1,
      make: (h) => ({ osoby: [czlowiek(h, { f: true, wiek: [32, 48], prof: 'Nauczyciel fizyki' })] }),
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'aktywisci' }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Protest przeciw kozom', 'A protest against stoves'),
      text: (h, d) => {
        const [o] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        if (!o) return brakGosci(h);
        const z = zawod(o);
        return tx(
          `${wielka(s.brama.pod)} stoi samotna kobieta z tekturą na kiju: „KOZY ZABIJAJĄ KLIMAT”. To ${o.name}, ${z.pl}, z działek za obwodnicą. Megafon ma, ale bez baterii od lat, więc krzyczy sama: że sprawność kozy to piętnaście procent i że to zbrodnia przeciw termodynamice. Dym z waszego komina widać z jej działki.`,
          `A lone woman with a piece of cardboard on a stick, reading “STOVES KILL THE CLIMATE”, is standing at ${e.brama}. She is ${o.name}, ${z.enA}, from the allotments beyond the ring road. She has a megaphone, but it has had no batteries for years, so she shouts unaided that a stove is fifteen per cent efficient and that this is a crime against thermodynamics. The smoke from your chimney can be seen from her plot.`,
        );
      },
      choices: (h, d) => {
        const zapisz = (jak: string) => () => h.hak('aktywistka.start', { ...pierwsza(h, d), jak });
        return [
          wpuscNaNoc(h, d, () => {
            zapisz('ciepło')();
            h.log(
              tx(
                'Aktywistka siedzi przy kozie, której nie znosi, i przez pierwszą godzinę wygłasza przemówienie o jej sprawności. Przez drugą ogrzewa ręce.',
                'The activist sits by the stove she cannot stand and spends the first hour giving a speech on its efficiency. The second hour she spends warming her hands.',
              ),
            );
          }),
          {
            label: tx('Podać herbatę przez siatkę (Jedzenie 1)', 'Pass a cup of tea through the fence (Food 1)'),
            ok: pod(h, d) && h.res.jedzenie >= 1,
            run: () => {
              zapisz('herbata')();
              h.nakarmGosci(1);
              h.mood(1, 0);
            },
          },
          odprawic(h, d, () => {
            zapisz('odprawa')();
            h.mood(-1, 0);
          }),
        ];
      },
    }),
    krok('aktywistka', 2, {
      po: 20,
      hak: 'aktywistka.start',
      when: ['wieczor', 'noc'],
      w: (h) => (zimno(h) ? 1 : 0),
      make: (h) => {
        const x = h.hakDane('aktywistka.start')?.d as
          | { p: Person; look?: number; zid: string; jak: string }
          | undefined;
        return x ? { osoby: [x.p], looks: x.look !== undefined ? [x.look] : undefined, zid: x.zid, jak: x.jak } : null;
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'aktywisci', wraca: d.zid, ...(d.looks ? { look: d.looks } : {}) }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Wraca, kiedy zrobiło się zimno', 'She is back now that it has turned cold'),
      text: (h, d) => {
        const [o] = ludzie(h, d);
        if (!o) return brakGosci(h);
        const wspomnienie: Record<string, Tx> = {
          ciepło: tx('O tamtej nocy przy kozie nie wspomina.', 'She does not mention that night by the stove.'),
          herbata: tx(
            'Pamięta herbatę przez siatkę i nie mówi o niej nic.',
            'She remembers the tea through the fence and says nothing about it.',
          ),
          odprawa: tx(
            'Nie wspomina, jak ją wtedy odprawiliście. Wy też nie.',
            'She does not mention how you sent her away. Neither do you.',
          ),
        };
        const w = wspomnienie[d.jak] ?? wspomnienie.odprawa;
        return tx(
          `Wróciła ${o.name}, ta od protestu przeciw kozom. Zamiast tektury ma szalik, a nos czerwony jak latarnia. ${w.pl} Mówi, że na jej działce nie ma już czym palić, bo własne drewno spaliła w nocy. „Palenie jest złe”, mówi, „ale marznięcie jest gorsze”. Pyta, czy znajdzie się dla niej kąt przy kozie. Przy tej samej, o której mówiła, że zabija klimat.`,
          `${o.name} is back, the one from the protest against stoves. Instead of the cardboard she has a scarf, and her nose is red as a lamp. ${w.en} She says there is nothing left to burn on her plot, because she burned her own wood overnight. “Burning is bad,” she says, “but freezing is worse.” She asks whether there is a corner for her by the stove. The very stove she said was killing the climate.`,
        );
      },
      choices: (h, d) => {
        const { p } = pierwsza(h, d);
        const podloga = naPodlodze(h, 1);
        return [
          {
            label: tx(
              `Przyjąć na stałe${podloga > 0 ? ' (będzie spać na podłodze)' : ''}`,
              `Take her in for good${podloga > 0 ? ' (she will sleep on the floor)' : ''}`,
            ),
            ok: pod(h, d),
            run: () => {
              h.przyjmijGosci();
              h.mood(1, podloga > 0 ? 2 : 0);
              h.hak('aktywistka.przyjeta', { name: p.name });
              h.log(
                tx(
                  `${p.name} zostaje. Pierwsze, co robi, to ustawia swoje buty przy kozie, tyłem do dymu.`,
                  `${p.name} stays. The first thing she does is put her boots by the stove, heels to the smoke.`,
                ),
                true,
              );
            },
          },
          wpuscNaNoc(h, d, () => {
            h.hak('aktywistka.noc');
            h.log(
              tx(
                `${p.first} przesiedziała noc przy kozie. Rano wyszła ${brama(h).n} i nie powiedziała ani słowa o termodynamice.`,
                `${p.first} spent the night by the stove. In the morning she left by ${h.wordsEn().brama} and did not say a word about thermodynamics.`,
              ),
            );
          }),
          {
            label: tx('Dać drewno i odprawić (Drewno 2)', 'Give her wood and send her home (Wood 2)'),
            ok: pod(h, d) && h.res.opal >= 2,
            run: () => {
              h.addRes('opal', -2);
              h.odprawGosci();
              h.mood(1, 0);
              h.hak('aktywistka.drewno');
            },
          },
          odprawic(h, d, () => {
            h.mood(-2, 1);
            h.hak('aktywistka.nie');
          }),
        ];
      },
    }),
    krok('aktywistka', 3, {
      po: 24,
      hak: 'aktywistka.przyjeta',
      when: ['dzien', 'wieczor'],
      w: (h) => (aktywistkaMieszka(h) ? 1 : 0),
      make: (h) => {
        const l = aktywistkaMieszka(h);
        return l ? { lok: l.id, p: osobaKarty(l), dzieci: h.lokatorzy().filter((x) => x.age < 16).length } : null;
      },
      title: () => tx('Lekcja fizyki przy kozie', 'A physics lesson by the stove'),
      text: (h, d) => {
        const p: OsobaKarty = d.p;
        const skad = zKlatki(h);
        const uczniowie =
          d.dzieci > 0
            ? tx(
                `Dzieciaki ${skad.pl} przychodzą najchętniej, bo to jedyna lekcja, na której wolno podpalać.`,
                `The kids ${skad.en} come most willingly, because it is the only lesson where setting things on fire is allowed.`,
              )
            : tx(
                'Przychodzą dorośli, bo tu przynajmniej ktoś mówi do rzeczy.',
                'Adults turn up, because here at least somebody talks sense.',
              );
        return tx(
          `${p.first} nie wygłasza już przemówień. Zamiast tego prowadzi przy kozie lekcje fizyki dla każdego, kto chce. ${uczniowie.pl} Dziś ${plec(p, 'tłumaczył', 'tłumaczyła')}, czemu koza ma sprawność piętnaście procent i jak ją poprawić blachą za paleniskiem. Blachę obiecuje przynieść w tym tygodniu, a sprawność, jak twierdzi, wzrośnie wtedy do dwudziestu.`,
          `${p.first} no longer makes speeches. Instead ${on(p, 'he', 'she')} runs physics lessons by the stove for anyone who wants one. ${uczniowie.en} Today ${on(p, 'he', 'she')} explained why a stove is fifteen per cent efficient and how a metal plate behind the firebox could help. ${on(p, 'He', 'She')} promises to bring the plate this week, and the efficiency, ${on(p, 'he', 'she')} claims, will then rise to twenty.`,
        );
      },
      choices: (h, d) => {
        const p: OsobaKarty = d.p;
        const jest = !!mieszkaniec(h, d.lok);
        return [
          {
            label: tx(`Wciągnąć ją do ${h.words().zarzad.dk}`, `Bring her onto ${h.wordsEn().krotko}`),
            ok: jest,
            run: () => {
              h.awansuj(d.lok);
              h.mood(2, 0);
              h.hak('aktywistka.zarzad');
              h.log(
                tx(
                  `${p.name} wchodzi do ${h.words().zarzad.dk}. Od dziś każda decyzja o kozie przechodzi przez rachunek sprawności.`,
                  `${p.name} joins ${h.wordsEn().krotko}. From now on every decision about the stove goes through an efficiency calculation.`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Niech uczy dalej', 'Let her go on teaching'),
            ok: jest,
            run: () => {
              h.moodOf(d.lok, 'Ktoś mnie słucha', 6, 48);
              h.moodAll('Mamy nauczycielkę', 3, 24);
              h.mood(1, 0);
              h.hak('aktywistka.uczy');
            },
          },
        ];
      },
    }),
  ],
};

/** mieszkanka po przyjęciu: aktywistka z haka `aktywistka.przyjeta`, znaleziona w `lokatorzy()` po imieniu (symulacja nadaje
    przyjętym własne identyfikatory, imię i nazwisko zostają z planu wizyty) */
function aktywistkaMieszka(h: GovHost): GovLokator | null {
  const x = h.hakDane('aktywistka.przyjeta')?.d as { name: string } | undefined;
  return x ? (h.lokatorzy().find((l) => l.name === x.name) ?? null) : null;
}

// ---------------------------------------------------------------- 10. głos z dachu (tryb zombie)

/** grupa z archetypu goscie.ts (ocaleni, ktoś z ugryzionym bliskim); imiona inne niż w osiedlu */
function grupa(h: GovHost, kto: KtoId, ilu: number): Person[] {
  let n = 1;
  return osobyGrupy(h.rng, () => n++, kto, ilu, imionaZajete(h));
}

/** ugryziony członek grupy tak, jak widzi go karta (żywi w kolejności symulacji, indeks przesuwa się za nosicielem); bez wizyty
    osoba z danych kroku; null: nosiciel nie żyje albo nie ma ugryzionego */
function ugryziony(h: GovHost, d: D): Person | null {
  const k = d.gid ? h.gosc(d.gid) : null;
  if (!k) return d.osoby[d.ugryziony] ?? null;
  const g = widoczny(k.gosc, k.wpis);
  return g.ugryziony !== undefined ? (g.osoby[g.ugryziony] ?? null) : null;
}

/** co pokazało obejrzenie rąk (tryb zombie): ugryzienie u ugryzionego albo czyste ręce; imię bez odmiany */
const rekaOglad = (b: Person | null, v: 'ugryziony' | 'czysty'): Tx =>
  v === 'ugryziony' && b
    ? tx(
        `Obejrzeliście ręce: ${b.first} ma pod rękawem świeże ugryzienie.`,
        `You checked their hands: ${b.first} has a fresh bite under the sleeve.`,
      )
    : tx(
        'Obejrzeliście ręce: czyste, bez śladu zębów. Obrażona cisza trwa dłuższą chwilę.',
        'You checked their hands: clean, no sign of teeth. An offended silence hangs in the air.',
      );

/** 10. Ktoś woła z dachu sąsiedniego budynku → po nocy ciszej → ocaleni pod bramą z ukrytym ugryzieniem. Odpowiedź krzykiem robi
    prawdziwy hałas przy siatce (`halas`), a ostatnia karta to goście z ugryzionym w grupie (`GoscKarty.ugryziony`): wpuszczony
    albo przyjęty dostaje ugryzienie, „Obejrzeć ręce” je odsłania, a wybory są tymi samymi rozkazami co przy gościu z klocków
    (`wyboryGoscia`). */
const DACH: Lancuch = {
  id: 'dach',
  tryby: TYLKO_ZOMBIE,
  kroki: [
    krok('dach', 1, {
      // zajmuje miejsce karty „Światło w oknie naprzeciwko” (sygnal w tresc.ts), więc też pierwszej nocy
      first: true,
      when: ['wieczor', 'noc'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('Ktoś woła z dachu', 'Someone calls from a rooftop'),
      text: (h) => {
        const sas = sasiad(h);
        return tx(
          `Z dachu ${sas.d} ktoś woła i macha kijem z czerwonym kocem. Słów nie słychać, ale okrzyk wraca co jakiś czas, zawsze ten sam. Ulicą pod ${sas.n} coś szura, więc na dół chyba nikt nie schodzi.`,
          `Someone is calling from the roof of ${sas.en} and waving a stick with a red blanket on it. The words do not carry, but the shout comes back every so often, always the same. Something is shuffling along the street below ${sas.en}, so nobody up there is likely to come down.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Zawołać, że słyszycie', 'Shout back that you can hear'),
          ok: true,
          run: () => {
            const tile = h.kafelekPrzySiatce('blok');
            if (tile !== null) h.halas(tile, 12);
            h.needsAll({ safe: -2 });
            h.hak('dach.start', { jak: 'zawolali' });
            h.log(
              tx(
                'Krzyk poniósł się po ulicy, a razem z nim wiadomość dla każdego szwendacza w okolicy.',
                'The shout carried down the street, and with it a message for every shambler in earshot.',
              ),
              true,
            );
          },
        },
        {
          label: tx('Pomachać z okna kocem', 'Wave a blanket from the window'),
          ok: true,
          run: () => {
            h.hak('dach.start', { jak: 'koc' });
            h.log(
              tx(
                'Z okna zwisł koc, a potem drugi. Na dachu ktoś odmachał kijem z czerwoną szmatą.',
                'A blanket dropped from the window, then a second one. Somebody on the roof waved the stick with the red rag back.',
              ),
            );
          },
        },
        {
          label: tx('Zamknąć okiennice i nie reagować', 'Close the shutters and do nothing'),
          ok: true,
          run: () => {
            h.needsAll({ safe: -1 });
            h.hak('dach.start', { jak: 'nic' });
          },
        },
      ],
    }),
    krok('dach', 2, {
      po: 8,
      hak: 'dach.start',
      when: ['dzien'],
      w: () => 1,
      make: (h) => ({ jak: (h.hakDane('dach.start')?.d as { jak: string } | undefined)?.jak ?? 'nic' }),
      title: () => tx('Po nocy ciszej', 'Quieter after the night'),
      text: (h, d) => {
        const sas = sasiad(h);
        const noc: Record<string, Tx> = {
          zawolali: tx(
            'Od kiedy krzyknęliście, nie odezwał się nikt. Ani na dachu, ani pod nim.',
            'Since you shouted, nobody has called. Not on the roof, not below it.',
          ),
          koc: tx(
            'Czerwony koc na kiju zamachał jeszcze raz przed świtem, a potem zniknął.',
            'The red blanket on the stick waved once more before dawn, then vanished.',
          ),
          nic: tx(
            'Czerwony koc na kiju machał do rana, a potem zniknął.',
            'The red blanket on the stick waved until morning, then vanished.',
          ),
        };
        const w = noc[d.jak] ?? noc.nic;
        return tx(
          `Rano na dachu ${sas.d} nikogo nie widać. ${w.pl} Z dołu dochodzi szuranie, jakby szwendacze stali i czekali, aż ktoś zawoła jeszcze raz.`,
          `In the morning there is nobody to be seen on the roof of ${sas.en}. ${w.en} From below comes a shuffling, as if the shamblers were standing there waiting for somebody to call again.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Policzyć okna przez lornetkę', 'Count the windows through binoculars'),
          ok: !!h.doSprawdzenia() && h.kafelekPrzySiatce('blok') !== null,
          run: () => {
            const p = h.doSprawdzenia();
            const tile = h.kafelekPrzySiatce('blok');
            if (!p || tile === null) return;
            h.sprawdz(p.id, tile);
            h.needsOf(p.id, { rest: -8 });
            h.hak('dach.zajrzeli');
            h.log(
              tx(
                `${p.name} stoi przy siatce z lornetką i liczy okna. W jednym ktoś zawiesił prześcieradło, takie na znak.`,
                `${p.name} stands by the fence with binoculars, counting windows. In one of them somebody has hung a bedsheet as a sign.`,
              ),
            );
          },
        },
        {
          label: tx('Nie zajmować się tym', 'Leave it'),
          ok: true,
          run: () => h.hak('dach.nic'),
        },
      ],
    }),
    krok('dach', 3, {
      po: 5,
      when: ['dzien'],
      w: () => 1,
      make: (h) => ({ osoby: grupa(h, 'ocaleni', 3), ugryziony: 1 }),
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'ocaleni', chce: 'dolaczyc', ugryziony: d.ugryziony }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: (h) => tx(`Ocaleni ${h.words().brama.pod}`, `Survivors at ${h.wordsEn().brama}`),
      text: (h, d) => {
        const os = ludzie(h, d);
        const n = os.length;
        const s = h.words();
        const e = h.wordsEn();
        const sas = sasiad(h);
        const b = ugryziony(h, d);
        const k = d.gid ? h.gosc(d.gid) : null;
        const lista = os.map((o) => o.first);
        const imiona =
          lista.length > 1 ? `${lista.slice(0, -1).join(', ')} i ${lista[lista.length - 1]}` : (lista[0] ?? '');
        const imionaEn =
          lista.length > 1 ? `${lista.slice(0, -1).join(', ')} and ${lista[lista.length - 1]}` : (lista[0] ?? '');
        if (!n) return brakGosci(h);
        const reka = b
          ? tx(
              ` ${b.first} trzyma rękę w kieszeni i nie patrzy nikomu w oczy.`,
              ` ${b.first} keeps a hand in a pocket and does not look anyone in the eye.`,
            )
          : tx('', '');
        const po = k?.obejrzano ? rekaOglad(b, k.obejrzano) : tx('', '');
        const jeden = os[0];
        const wolali =
          n === 1
            ? tx(
                `Mówi, że ${plec(jeden, 'to on wołał', 'to ona wołała')} z dachu ${sas.d}: całą noc, zanim ${plec(jeden, 'zszedł', 'zeszła')} po rynnie.`,
                `${on(jeden, 'He', 'She')} says ${on(jeden, 'he', 'she')} was the one calling from the roof of ${sas.en}: all night, before ${on(jeden, 'he', 'she')} climbed down the drainpipe.`,
              )
            : tx(
                `Mówią, że to oni wołali z dachu ${sas.d}: całą noc, zanim zeszli po rynnie.`,
                `They say they were the ones calling from the roof of ${sas.en}: all night, before they climbed down the drainpipe.`,
              );
        return tx(
          `${wielka(s.brama.pod)} ${stoi(n)}: ${imiona}. Twarze szare ze zmęczenia, na kurtkach kurz z dachu. ${wolali.pl}${reka.pl}${po.pl ? ` ${po.pl}` : ''}`,
          `${wielka(ludzieEn(n))} ${standEn(n)} at ${e.brama}: ${imionaEn}. Faces grey with exhaustion, rooftop dust on the jackets. ${wolali.en}${reka.en}${po.en ? ` ${po.en}` : ''}`,
        );
      },
      choices: (h, d) => (d.gid ? wyboryGoscia(h, { id: d.gid }) : []),
    }),
  ],
};

// ---------------------------------------------------------------- 11. prośba o dobicie (tryb zombie)

/** 11. Matka z ugryzionym synem prosi o dobicie → zostaje u was albo odchodzi z nim; kto został po dobiciu, wraca sam. Dobicie to
    rozkaz `dobij` (osoba z dzidą bije przez siatkę, jak w karcie gościa z klocków), wpuszczenie to `zostan` z `ugryziony`
    (chłopiec naprawdę dostaje gorączkę i przemienia się znaną drogą), odesłanie to `odejdz`. */
const DOBICIE: Lancuch = {
  id: 'dobicie',
  tryby: TYLKO_ZOMBIE,
  kroki: [
    krok('dobicie', 1, {
      when: ['dzien', 'wieczor'],
      w: () => 1,
      make: (h) => {
        const matka = czlowiek(h, { f: true, wiek: [34, 48] });
        const syn = czlowiek(h, { f: false, wiek: [9, 15], nazwisko: nazwiskoOsoby(matka), unikaj: [matka.first] });
        return { osoby: [matka, syn], ugryziony: 1 };
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'z_ugryzionym', chce: 'dobic', ugryziony: d.ugryziony }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Matka prosi o dobicie', 'A mother asks for a mercy killing'),
      text: (h, d) => {
        const os = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        const matka = os[0];
        const b = ugryziony(h, d);
        if (!matka) return brakGosci(h);
        if (!b)
          return tx(
            `${wielka(s.brama.pod)} stoi ${matka.name}. Przyszła z synem, ale nie ma go już przy sobie.`,
            `${matka.name} is standing at ${e.brama}. She came with her son, but he is no longer at her side.`,
          );
        return tx(
          `${wielka(s.brama.pod)} stoi kobieta i trzyma za rękę chłopca. To ${b.first}: rękaw ma podwinięty do łokcia, a na przedramieniu szmatę. Matka, ${matka.name}, mówi spokojnie, bo nie ma już siły mówić inaczej: wie, czym się stanie. Prosi, żebyście zrobili to dzidą przez siatkę, zanim chłopiec zrozumie. Nie chce, żeby stał obok niej, kiedy się przemieni.`,
          `A woman is standing at ${e.brama}, holding a boy by the hand. His name is ${b.first}: one sleeve is rolled up to the elbow and a rag is tied round the forearm. The mother, ${matka.name}, speaks calmly, because she no longer has the strength to speak any other way: she knows what is going to happen to him. She asks you to do it with a spear through the fence, before the boy understands. She does not want him standing next to her when it happens.`,
        );
      },
      choices: (h, d) => {
        const os = ludzie(h, d);
        const matka = os[0];
        const b = ugryziony(h, d);
        const zapisz = (jak: string) => {
          h.hak('dobicie.start', { ...pierwsza(h, d), jak });
        };
        return [
          {
            label: tx('Dobić przez siatkę dzidą', 'Finish the boy off with a spear through the fence'),
            ok: pod(h, d) && !!h.zDzida() && !!b,
            run: () => {
              const kto = h.zDzida();
              if (!kto || !b) return;
              zapisz('dobity');
              h.goscRozkaz(d.gid, 'dobij');
              h.goscRozkaz(d.gid, 'odejdz', 'nakarmiony');
              h.moodOf(kto.id, 'Zabiłem człowieka', -6, 24);
              h.log(
                tx(
                  `${kto.name} ${plec(kto, 'wziął', 'wzięła')} dzidę i ${plec(kto, 'zrobił', 'zrobiła')} to przez siatkę. ${matka?.first ?? 'Matka'} nie ${plec(matka ?? { f: true }, 'powiedział', 'powiedziała')} ani słowa i ${plec(matka ?? { f: true }, 'odszedł', 'odeszła')}.`,
                  `${kto.name} took a spear and did it through the fence. ${matka?.first ?? 'The mother'} did not say a word and walked away.`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Wpuścić oboje, niech będą razem do końca', 'Let them both in, to be together until the end'),
            ok: pod(h, d),
            run: () => {
              zapisz('zostali');
              h.przyjmijGosci();
              h.goscRozkaz(d.gid, 'ugryziony');
              h.mood(0, 1);
              h.log(
                tx(
                  `${matka?.first ?? 'Matka'} i ${b?.first ?? 'chłopiec'} zostają. Matka siedzi przy chłopcu z zegarkiem, który nie chodzi, i czeka na gorączkę.`,
                  `${matka?.first ?? 'The mother'} and ${b?.first ?? 'the boy'} stay. The mother sits by the boy with a watch that does not run, waiting for the fever.`,
                ),
                true,
              );
            },
          },
          odprawic(h, d, () => {
            zapisz('odeszli');
            h.mood(-1, 1);
            h.log(
              tx(
                `${matka?.first ?? 'Matka'} wzięła chłopca za rękę i poszła ulicą. Nie oglądała się.`,
                `${matka?.first ?? 'The mother'} took the boy by the hand and went off down the street. She did not look back.`,
              ),
              true,
            );
          }),
        ];
      },
    }),
    krok('dobicie', 2, {
      po: 20,
      when: ['dzien', 'wieczor'],
      w: (h) => {
        const x = h.hakDane('dobicie.start')?.d as { jak?: string } | undefined;
        return x && x.jak !== 'zostali' ? 1 : 0;
      },
      make: (h) => {
        const x = h.hakDane('dobicie.start')?.d as { p: Person; look?: number; zid: string; jak: string } | undefined;
        return x ? { osoby: [x.p], looks: x.look !== undefined ? [x.look] : undefined, zid: x.zid, jak: x.jak } : null;
      },
      gosc: (_h, d) => ({ osoby: d.osoby, kto: 'wedrowiec', wraca: d.zid, ...(d.looks ? { look: d.looks } : {}) }),
      gdzie: (h, d) => gdzieGrupy(h, d),
      title: () => tx('Kobieta wraca sama', 'She comes back alone'),
      text: (h, d) => {
        const [o] = ludzie(h, d);
        const s = h.words();
        const e = h.wordsEn();
        if (!o) return brakGosci(h);
        return d.jak === 'dobity'
          ? tx(
              `Wróciła ${o.name}. Sama. Stoi ${s.brama.pod} i o nic nie prosi, tylko patrzy na to miejsce przy siatce. Mówi, że nie ma dokąd iść, a imię syna ma napisane długopisem na wewnętrznej stronie nadgarstka. Pyta, czy może posiedzieć przy ogniu. Nie obiecuje, że będzie rozmawiać.`,
              `${o.name} is back. Alone. She stands at ${e.brama} and asks for nothing, only looks at that spot by the fence. She says she has nowhere to go, and her son’s name is written in biro on the inside of her wrist. She asks whether she may sit by the fire. She does not promise to talk.`,
            )
          : tx(
              `Wróciła ${o.name}. Sama. Nie mówi, gdzie jest syn, i nikt nie pyta. Stoi ${s.brama.pod} z jedną ręką zaciśniętą w pięść, jakby wciąż kogoś trzymała. Mówi, że przy ogniu mogłaby posiedzieć, jeśli nikt nie będzie pytał.`,
              `${o.name} is back. Alone. She does not say where her son is, and nobody asks. She stands at ${e.brama} with one hand closed in a fist, as if still holding someone. She says she could sit by the fire, as long as nobody asks questions.`,
            );
      },
      choices: (h, d) => {
        const [o] = ludzie(h, d);
        const podloga = naPodlodze(h, 1);
        return [
          {
            label: tx(
              `Przyjąć do ${dom(h) ? 'domu' : 'spółdzielni'}${podloga > 0 ? ' (będzie spać na podłodze)' : ''}`,
              `Take her into ${dom(h) ? 'the house' : 'the co-op'}${podloga > 0 ? ' (she will sleep on the floor)' : ''}`,
            ),
            ok: pod(h, d),
            run: () => {
              h.przyjmijGosci();
              h.mood(1, podloga > 0 ? 2 : 0);
              h.hak('dobicie.przyjeta');
              h.log(
                tx(
                  `${o?.name ?? 'Kobieta'} zostaje. Siada przy kozie tyłem do wszystkich i nie rusza się do rana.`,
                  `${o?.name ?? 'The woman'} stays. She sits by the stove with her back to everyone and does not move until morning.`,
                ),
                true,
              );
            },
          },
          {
            label: tx(
              'Dać jedzenie i odprawić (Jedzenie 2)',
              `Give ${them(h, d)} food and send ${them(h, d)} away (Food 2)`,
            ),
            ok: pod(h, d) && h.res.jedzenie >= 2,
            run: () => {
              h.nakarmGosci(2);
              h.hak('dobicie.jedzenie');
            },
          },
          odprawic(h, d, () => {
            h.mood(-1, 0);
            h.hak('dobicie.nie');
          }),
        ];
      },
    }),
  ],
};

// ---------------------------------------------------------------- 12. głos z radia (tryb zombie)

/** miejsca, przy których według radia stał posterunek: urząd, hala, stacja, garaże */
const POSTERUNEK = ['urzad', 'hala', 'stacja', 'garaz'] as const;

/** 12. Radio łapie głos wojskowego → obietnica ewakuacji o świcie → nikt nie przychodzi (nastrój spada, tym mocniej, im
    bardziej ludzie czekali), a w okolicy zostaje opuszczony posterunek: wskazówka na miejsce z bronią (wyprawa tam wróci z
    rewolwerem albo strzelbą i amunicją, `GovState.wskazowki[..].bron`). */
const GLOS: Lancuch = {
  id: 'glos',
  tryby: TYLKO_ZOMBIE,
  kroki: [
    krok('glos', 1, {
      when: ['wieczor', 'noc'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('Głos w radiu', 'A voice on the radio'),
      text: (h) =>
        tx(
          `W ${dom(h) ? 'domu' : 'kuchni'} szumi radio na korbkę, które ktoś znalazł w ${piwnica(h).w} i które, co dziwne, działa: uzwojenie pod lakierem. Między szumem odezwał się głos: „Tu punkt ewakuacyjny. Zbieramy ocalałych. Wojsko”. Powtarza to raz za razem i brzmi trochę jak sekretarka z dawnych czasów, a trochę jak człowiek, który nie spał trzy noce.`,
          `The wind-up radio somebody found in the ${piwnica(h).en} is hissing in the ${dom(h) ? 'house' : 'kitchen'} and, strangely, works: the windings are under lacquer. A voice cuts through the static: “This is an evacuation point. We are collecting survivors. Military.” It says it over and over, and sounds partly like a secretary from another era and partly like a man who has not slept for three nights.`,
        ),
      choices: (h) => [
        {
          label: tx(
            'Posłuchać do rana (ktoś czuwa przy radiu)',
            'Listen until morning (someone stays up with the radio)',
          ),
          ok: !!h.doSprawdzenia(),
          run: () => {
            const p = h.doSprawdzenia();
            if (!p) return;
            h.needsOf(p.id, { rest: -10 });
            h.hak('glos.start', { jak: 'sluchali' });
            h.log(
              tx(
                `${p.name} ${plec(p, 'przesiedział', 'przesiedziała')} noc nad radiem i ${plec(p, 'zanotował', 'zanotowała')} częstotliwość na dłoni.`,
                `${p.name} sat up all night over the radio and wrote the frequency on the back of a hand.`,
              ),
            );
          },
        },
        {
          label: tx('Zapisać częstotliwość i iść spać', 'Write down the frequency and go to bed'),
          ok: true,
          run: () => h.hak('glos.start', { jak: 'sen' }),
        },
      ],
    }),
    krok('glos', 2, {
      po: 3,
      hak: 'glos.start',
      when: ['wieczor', 'noc'],
      w: () => 1,
      make: () => ({}),
      title: () => tx('Ewakuacja o świcie', 'Evacuation at dawn'),
      text: (h) => {
        const s = h.words();
        const e = h.wordsEn();
        return tx(
          `Głos w radiu się zmienił. Ten sam uprzejmy ton, ale z nową treścią: „Ewakuacja o świcie. Zbiórka ${s.brama.przy}. Bez bagażu, zabrać dzieci i leki”. Powtarza się co kwadrans, a po każdym powtórzeniu brzmi odrobinę mniej jak człowiek.`,
          `The voice on the radio has changed. The same polite tone, but with new content: “Evacuation at dawn. Assembly at ${e.brama}. No luggage, bring children and medicines.” It repeats every quarter of an hour, and after each repeat it sounds slightly less like a person.`,
        );
      },
      choices: (h) => [
        {
          label: tx('Przygotować ludzi do wyjścia o świcie', 'Get everyone ready to leave at dawn'),
          ok: true,
          run: () => {
            h.moodAll('Wojsko po nas przyjdzie', 6, 12);
            h.needsAll({ rest: -8 });
            h.hak('glos.plan', { jak: 'czekali' });
            h.log(
              tx(
                'Tobołki stoją przy drzwiach. Ktoś przepakowuje apteczkę po raz czwarty.',
                'Bundles stand by the door. Somebody is repacking the first-aid kit for the fourth time.',
              ),
            );
          },
        },
        {
          label: tx('Nie wierzyć i spać', 'Dismiss it and go to sleep'),
          ok: true,
          run: () => {
            h.needsAll({ safe: -2 });
            h.hak('glos.plan', { jak: 'nie' });
          },
        },
        {
          label: tx('Sprawdzić obwodnicę przez lornetkę', 'Check the ring road through binoculars'),
          ok: !!h.doSprawdzenia() && h.kafelekPrzySiatce('blok') !== null,
          run: () => {
            const p = h.doSprawdzenia();
            const tile = h.kafelekPrzySiatce('blok');
            if (!p || tile === null) return;
            h.sprawdz(p.id, tile);
            h.needsOf(p.id, { rest: -8 });
            h.moodAll('Wojsko po nas przyjdzie', 3, 12);
            h.hak('glos.plan', { jak: 'wypatrywali' });
            h.log(
              tx(
                `${p.name} stoi przy siatce z lornetką i patrzy w stronę obwodnicy. Ulica wygląda na pustą.`,
                `${p.name} stands by the fence with binoculars, looking towards the ring road. The street looks empty.`,
              ),
            );
          },
        },
      ],
    }),
    krok('glos', 3, {
      po: 6,
      hak: 'glos.plan',
      when: ['dzien'],
      w: () => 1,
      make: (h) => ({ jak: (h.hakDane('glos.plan')?.d as { jak: string } | undefined)?.jak ?? 'nie' }),
      title: () => tx('Nikt nie przyszedł', 'Nobody came'),
      text: (h, d) => {
        const s = h.words();
        const e = h.wordsEn();
        const ludzie_: Tx =
          d.jak === 'czekali'
            ? tx(
                'Ludzie z tobołkami siedzą przy drzwiach i udają, że nie czekali.',
                'People with their bundles sit by the door pretending they were not waiting.',
              )
            : d.jak === 'wypatrywali'
              ? tx(
                  'Ten, kto stał z lornetką przy siatce, schodzi i nikomu nie patrzy w oczy.',
                  'The one who stood by the fence with the binoculars comes down and meets nobody’s eye.',
                )
              : tx('Ci, co spali, mają minę, jakby wiedzieli.', 'Those who slept have the look of people who knew.');
        return tx(
          `Słońce wstało, a ${s.brama.pod} nie widać żadnego wojska. Radio zamilkło w środku zdania. ${ludzie_.pl} W szumie, zanim zgasł, można było jeszcze wyłowić nazwę miejsca: opuszczony posterunek, z którego głos nadawał.`,
          `The sun has come up, and there is no sign of any army at ${e.brama}. The radio fell silent in the middle of a sentence. ${ludzie_.en} In the static, before it died, you could still make out the name of a place: an abandoned checkpoint, the one the voice had been broadcasting from.`,
        );
      },
      choices: (h, d) => {
        const gorzej = d.jak === 'czekali';
        const rozczarowanie = () => {
          h.moodAll('Wojsko nie przyszło', gorzej ? -8 : -3, gorzej ? 24 : 12);
          h.mood(0, 1);
        };
        return [
          {
            label: tx('Zapisać, gdzie stał posterunek', 'Write down where the checkpoint was'),
            ok: true,
            run: () => {
              rozczarowanie();
              const m = h.wskazowkaMiejsca(POSTERUNEK, 'stacja', true);
              h.hak('glos.posterunek');
              h.log(
                tx(
                  `Radio wskazywało miejsce: ${m.pl}. Podobno został tam sprzęt. Następna wyprawa tam będzie bezpieczniejsza, da więcej i wróci z bronią.`,
                  `The radio pointed to a place: ${m.en}. Gear is said to have been left there. The next run will be safer, bring back more, and return with a weapon.`,
                ),
                true,
              );
            },
          },
          {
            label: tx('Wyłączyć radio i nie wracać do tego', 'Switch the radio off and leave it'),
            ok: true,
            run: () => {
              rozczarowanie();
              h.hak('glos.cisza');
              h.log(tx('Radio schowano do szafy, razem z korbką.', 'The radio went into a cupboard, crank and all.'));
            },
          },
        ];
      },
    }),
  ],
};

export const LANCUCHY_TRESC: readonly Lancuch[] = [
  SWIATLO,
  SZCZEKANIE,
  PUSZKI,
  WODA,
  LIST,
  PLUCA,
  OSTRZEGA,
  DLUG,
  AKTYWISTKA,
  DACH,
  DOBICIE,
  GLOS,
];
