/* Wydarzenia przeniesione z js/sim.js (0.3) bez zmiany liczb i tekstów.
   Wydarzenie nie zna stanu gry bezpośrednio: dostaje EventHost, który daje mu to,
   czego potrzebuje (zasoby, ludzie, budynki). W 0.3 robił to obiekt S, w nowej grze
   zrobi to nowa symulacja. Test tests/unit/events.test.ts uruchamia każde wydarzenie
   obok oryginału z 0.3 na tym samym stanie i porównuje wynik. */

import { pick, type Rng, ri } from '../core/rng.ts';
import { BOOKS, type Cost, costText, DOM, type Dom, PROFS, type Res, TECH_DOMS, type TechDom } from './data.ts';
import { g, type MakePersonOpts, type Person } from './people.ts';

export type BRef = number;

/** tasowanie przez gospodarza (gra 0.4: to samo w każdym silniku JS) albo jak w 0.3 (zgodność z oryginałem) */
const shuffled = <T>(h: EventHost, a: T[]): T[] => (h.shuffle ? h.shuffle(a) : a.sort(() => h.rng() - 0.5));

export interface EventHost {
  rng: Rng;
  /** tasowanie listy; bez niego jak w 0.3, czyli sort z losowym porównaniem, którego wynik zależy od silnika JS */
  shuffle?<T>(a: T[]): T[];
  readonly res: Readonly<Record<Res, number>>;
  readonly trust: number;
  /** czas gry w minutach */
  readonly t: number;
  day(): number;
  season(): number;
  law(id: string): boolean;
  tech(id: string): boolean;
  know(d: Dom): number;
  rule(id: 'kozy'): boolean;
  pop(): number;
  cap(): number;
  alive(): Person[];
  spec(id: string): Person | undefined;
  makePerson(opts?: MakePersonOpts): Person;
  joinPerson(p: Person): void;
  /** osoba odchodzi z rdzenia (gone + zwolnienie stanowiska) */
  personLeaves(p: Person): void;
  addPeople(n: number): void;
  addRes(k: Res, v: number): void;
  have(c: Cost): boolean;
  pay(c: Cost): void;
  gain(c: Cost): void;
  mood(dTrust: number, dAnger: number): void;
  /** chorzy: dodatnie n ogranicza do liczby mieszkańców, ujemne do zera */
  addSick(n: number): void;
  log(txt: string, big?: boolean): void;
  hqName(): string;
  buildingName(b: BRef): string;
  /** losowy nasz budynek: 'home' = mieszkalny z ludźmi, 'heated' = ogrzewany z ludźmi */
  pickBuilding(kind: 'home' | 'heated'): BRef | null;
  anyHeated(): boolean;
  removeResident(b: BRef): void;
  /** pożar klatki: mniej miejsc do mieszkania */
  burnStaircase(b: BRef): void;
  hasWorking(fac: string): boolean;
  bookCount(d: TechDom): number;
  addBook(d: TechDom, name: string): void;
  setAlertNight(): void;
  setRaidBoost(): void;
  setSmog(minutes: number): void;
}

export interface EventChoice {
  label: string;
  ok: boolean;
  ai?: boolean;
  run: () => void;
}

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzenia mają różne kształty
export interface EventDef<D = any> {
  id: string;
  once?: boolean;
  w: (h: EventHost) => number;
  make: (h: EventHost) => D | null;
  title: (h: EventHost, d: D) => string;
  text: (h: EventHost, d: D) => string;
  choices: (h: EventHost, d: D) => EventChoice[];
}

export interface ActiveEvent {
  id: string;
  // biome-ignore lint/suspicious/noExplicitAny: dane wydarzenia zapisują się jako JSON
  d: any;
}

const EV: EventDef[] = [];
export const EVENTS: readonly EventDef[] = EV;

EV.push({
  id: 'uchodzcy',
  w: (h) => (h.law('u_dokwaterowanie') ? 6 : 3),
  make: (h) => ({
    n: ri(4, 12, h.rng),
    from: pick(
      [
        'z Wilanowa',
        'z zamkniętego osiedla z ochroną',
        'z bloku, w którym pękł pion',
        'ze wsi, gdzie skończyła się woda',
        'z kampusu dawnej korporacji',
        'z osiedla za obwodnicą',
      ],
      h.rng,
    ),
    spec: h.rng() < 0.3 ? h.makePerson() : null,
  }),
  title: () => 'Ludzie pod szlabanem',
  text: (h, d) =>
    `${d.n} osób ${d.from} stoi pod szlabanem i prosi o miejsce. Wolnych miejsc w waszych blokach: ${Math.max(0, h.cap() - h.pop())}.${d.spec ? ` Wśród nich ${g(d.spec, 'jest', 'jest')} ${d.spec.prof.toLowerCase()}, ${d.spec.name}.` : ''}`,
  choices: (h, d) => [
    {
      label: 'Przyjąć wszystkich',
      ok: true,
      ai: true,
      run: () => {
        h.addPeople(d.n);
        h.mood(1, h.pop() > h.cap() ? 2 : 0);
        if (d.spec) h.joinPerson(d.spec);
        h.log(`Przyjęliście ${d.n} osób ${d.from}.`, true);
      },
    },
    {
      label: 'Dać Jedzenie 3 na drogę',
      ok: h.res.jedzenie >= 3,
      run: () => {
        h.addRes('jedzenie', -3);
        h.mood(1, 0);
      },
    },
    { label: 'Odprawić', ok: true, run: () => h.mood(-2, -1) },
  ],
});

EV.push({
  id: 'lodowka',
  w: () => 1.2,
  once: true,
  make: () => ({}),
  title: () => 'Lodówka na abonament',
  text: () =>
    'W mieszkaniu na trzecim piętrze stoi pełna lodówka. Zamknięta na amen, bo abonament wygasł w 2048 roku, a serwer producenta razem z nim.',
  choices: (h) => [
    {
      label: 'Złamać zabezpieczenie (Elektryka 2)',
      ok: h.know('elek') >= 2,
      ai: true,
      run: () => {
        h.addRes('jedzenie', 8);
        h.log('Lodówka otwarta. W środku słoiki i coś, co kiedyś było serem.');
      },
    },
    {
      label: 'Rozbić łomem',
      ok: true,
      run: () => {
        h.addRes('jedzenie', 4);
        h.addRes('zlom', 2);
      },
    },
  ],
});

EV.push({
  id: 'dron',
  w: () => 1,
  once: true,
  make: () => ({}),
  title: () => 'Dron dostawczy',
  text: () =>
    'Nad osiedlem od trzech lat krąży dron z zamówieniem, którego nikt nie odebrał. Ładuje się ze słońca i nie odpuszcza.',
  choices: (h) => [
    {
      label: 'Zestrzelić z procy',
      ok: true,
      ai: true,
      run: () => {
        h.addRes('czesci', 3);
        h.log('Dron spadł za garażami. W paczce zestaw sushi z 2048 roku, nikt nie spróbował.');
      },
    },
    {
      label: 'Zostawić, niech lata',
      ok: true,
      run: () => {
        h.mood(1, -1);
        h.log('Dron zostaje maskotką osiedla.');
      },
    },
  ],
});

EV.push({
  id: 'influencer',
  w: () => 0.8,
  once: true,
  make: (h) => ({ p: h.makePerson({ f: true, prof: PROFS.find((p) => p[0].startsWith('Influencer')) }) }),
  title: () => 'Influencerka survivalu',
  text: (_h, d) =>
    `Pod bramą nagrywa vloga ${d.p.name} z ring lightem na baterie. Mówi, że ma dwa miliony obserwujących. Internetu nie ma od trzech lat.`,
  choices: (h, d) => [
    {
      label: 'Przyjąć do spółdzielni',
      ok: true,
      run: () => {
        h.joinPerson(d.p);
        h.addPeople(1);
      },
    },
    { label: 'Niech nagrywa gdzie indziej', ok: true, ai: true, run: () => {} },
  ],
});

EV.push({
  id: 'kradziez',
  w: (h) => (h.res.jedzenie > 10 ? (h.law('u_godzina') ? 0.6 : 1.5) : 0),
  make: (h) => {
    const loss = Math.max(2, Math.round(h.res.jedzenie * 0.15));
    h.addRes('jedzenie', -loss);
    return { loss, b: h.hqName() };
  },
  title: () => 'Kradzież z piwnicy',
  text: (_h, d) =>
    `Ktoś wyniósł nocą z piwnicy w budynku ${d.b} Jedzenie ${d.loss}. Ślady prowadzą do mieszkania na parterze.`,
  choices: (h) => {
    const c: EventChoice[] = [];
    if (h.law('u_sad'))
      c.push({
        label: 'Sąd koleżeński',
        ok: true,
        ai: true,
        run: () => {
          h.mood(1, -2);
          h.log('Sąd koleżeński: sprawca odpracuje szkodę przy kuchni.');
        },
      });
    c.push({
      label: 'Wyrzucić sprawcę z osiedla',
      ok: true,
      ai: !h.law('u_sad'),
      run: () => {
        const b = h.pickBuilding('home');
        if (b !== null) h.removeResident(b);
        h.mood(-2, -2);
      },
    });
    c.push({ label: 'Przymknąć oko', ok: true, run: () => h.mood(0, 3) });
    return c;
  },
});

EV.push({
  id: 'klotnia',
  w: (h) => (h.alive().length >= 3 ? 1 : 0),
  make: (h) => {
    const a = shuffled(h, h.alive());
    return { a: a[0].id, b: a[1].id };
  },
  title: () => 'Kłótnia o grafik',
  text: (h, d) => {
    const A = h.spec(d.a)!;
    const B = h.spec(d.b)!;
    return `${A.name} i ${B.name} pokłócili się o grafik dyżurów przy kozie. Pół klatki stoi po jednej stronie, pół po drugiej.`;
  },
  choices: (h, d) => {
    const A = h.spec(d.a)!;
    const B = h.spec(d.b)!;
    const side = (_W: Person, L: Person) => () => {
      h.mood(0, 1);
      if (h.rng() < 0.3) {
        h.personLeaves(L);
        h.log(`${L.name} ${g(L, 'obraził się i wyprowadził', 'obraziła się i wyprowadziła')} do innego osiedla.`, true);
      }
    };
    return [
      { label: 'Mediacja w świetlicy', ok: true, ai: true, run: () => h.mood(1, -1) },
      { label: `Rację ma ${A.first}`, ok: true, run: side(A, B) },
      { label: `Rację ma ${B.first}`, ok: true, run: side(B, A) },
    ];
  },
});

EV.push({
  id: 'grypa',
  w: (h) => (h.season() <= 1 && h.pop() > 15 ? 1.4 : 0.3),
  make: (h) => {
    const b = h.pickBuilding('home');
    return b !== null ? { b } : null;
  },
  title: (h, d) => `Grypa w budynku ${h.buildingName(d.b)}`,
  text: () => 'Kaszle pół bloku. Jeśli nic nie zrobicie, za dwa dni będzie kaszleć pół osiedla.',
  choices: (h) => [
    {
      label: 'Kwarantanna bloku',
      ok: true,
      ai: true,
      run: () => {
        h.addSick(2);
        h.mood(0, 2);
      },
    },
    { label: 'Nic nie robić', ok: true, run: () => h.addSick(8) },
  ],
});

EV.push({
  id: 'pozar',
  w: (h) => (h.anyHeated() ? 1 : 0),
  make: (h) => {
    const b = h.pickBuilding('heated');
    return b !== null ? { b } : null;
  },
  title: () => 'Pożar od kozy',
  text: (h, d) =>
    `W budynku ${h.buildingName(d.b)} zapaliło się mieszkanie od źle postawionej kozy. Dym idzie na klatkę.`,
  choices: (h, d) => [
    {
      label: 'Gasić wszyscy razem',
      ok: true,
      ai: true,
      run: () => {
        h.addRes('opal', -3);
        h.addSick(1);
        h.mood(1, 0);
        h.log('Pożar ugaszony. Spłonął zapas opału z piwnicy.');
      },
    },
    {
      label: 'Ewakuować klatkę',
      ok: true,
      run: () => {
        h.burnStaircase(d.b);
        h.mood(0, 2);
        h.log(`Klatka w budynku ${h.buildingName(d.b)} spłonęła. Mniej miejsc do mieszkania.`);
      },
    },
  ],
});

EV.push({
  id: 'automat',
  w: () => 0.9,
  once: true,
  make: () => ({}),
  title: () => 'Automat paczkowy otworzył się sam',
  text: () =>
    'Po trzech latach automat z paczkami przy pawilonie otworzył wszystkie skrytki naraz. Pod spodem robi się tłum.',
  choices: (h) => [
    {
      label: 'Podzielić po równo',
      ok: true,
      ai: true,
      run: () => {
        h.mood(2, -1);
        h.addRes('czesci', 2);
        h.addRes('leki', 1);
      },
    },
    {
      label: 'Zabrać do magazynu spółdzielni',
      ok: true,
      run: () => {
        h.addRes('czesci', 4);
        h.addRes('leki', 2);
        h.addRes('opal', 2);
        h.mood(-1, 3);
      },
    },
  ],
});

EV.push({
  id: 'auto',
  w: () => 0.9,
  once: true,
  make: () => ({}),
  title: () => 'Samochód czeka na aktualizację',
  text: () =>
    'Na parkingu stoi autonomiczne auto, które od 2048 roku czeka na aktualizację. Mruga światłami, kiedy ktoś przechodzi.',
  choices: (h) => [
    {
      label: 'Rozebrać na akumulatory i części',
      ok: true,
      ai: true,
      run: () => {
        h.addRes('czesci', 4);
        h.addRes('zlom', 3);
      },
    },
    {
      label: 'Zrobić z niego kurnik',
      ok: true,
      run: () => {
        h.addRes('jedzenie', 5);
        h.mood(1, 0);
      },
    },
  ],
});

EV.push({
  id: 'radio_sos',
  w: (h) => (h.hasWorking('radio') ? 1.4 : 0),
  make: () => ({}),
  title: () => 'Wołanie przez radio',
  text: () => 'Osiedle z drugiej strony rzeki prosi o leki. Mają chore dzieci i części na wymianę.',
  choices: (h) => [
    {
      label: 'Wysłać Leki 3',
      ok: h.res.leki >= 3,
      ai: true,
      run: () => {
        h.addRes('leki', -3);
        h.addRes('czesci', 5);
        h.mood(3, 0);
      },
    },
    { label: 'Udawać, że nikt nie słyszał', ok: true, run: () => h.mood(-1, 0) },
  ],
});

interface Offer {
  give: Cost;
  take: Cost;
}
const OFFERS: Offer[] = [
  { give: { czesci: 3 }, take: { jedzenie: 5 } },
  { give: { zlom: 8 }, take: { opal: 4 } },
  { give: { leki: 2 }, take: { zlom: 5 } },
  { give: { jedzenie: 8 }, take: { czesci: 2, zlom: 2 } },
  { give: { opal: 8 }, take: { jedzenie: 4 } },
  { give: { zlom: 10 }, take: { jedzenie: 4, opal: 2 } },
];
const tradeEv = (id: string, title: string, text: string, w: (h: EventHost) => number): EventDef<{ o: Offer[] }> => ({
  id,
  w,
  make: (h) => {
    const o = shuffled(h, OFFERS.slice());
    return { o: [o[0], o[1]] };
  },
  title: () => title,
  text: () => text,
  choices: (h, d) =>
    d.o
      .map(
        (o): EventChoice => ({
          label: `Dostać ${costText(o.give)} za ${costText(o.take)}`,
          ok: h.have(o.take),
          run: () => {
            h.pay(o.take);
            h.gain(o.give);
            h.log(`Wymiana: ${costText(o.give)} za ${costText(o.take)}.`);
          },
        }),
      )
      .concat([{ label: 'Nic nie bierzemy', ok: true, run: () => {} }]),
});
EV.push(
  tradeEv(
    'handlarz',
    'Handlarz z wózkiem',
    'Pod szlabanem stoi facet z wózkiem z marketu. Wymieni jedną rzecz i idzie dalej.',
    () => 1.6,
  ),
);
EV.push(
  tradeEv('handel_radio', 'Handel przez radio', 'Osada spod lasu nadaje ofertę. Kurier przyjdzie jutro rano.', (h) =>
    h.hasWorking('radio') ? 2 : 0,
  ),
);

EV.push({
  id: 'dzieci',
  w: () => 1.4,
  make: () => ({}),
  title: () => 'Dzieciaki ze złomem',
  text: () =>
    'Dzieciaki z sąsiednich bloków przyciągnęły wózek blach i rur z rozbiórki pawilonu. Chcą coś do jedzenia.',
  choices: (h) => [
    {
      label: 'Złom 6 za Jedzenie 1',
      ok: h.res.jedzenie >= 1,
      ai: true,
      run: () => {
        h.addRes('jedzenie', -1);
        h.addRes('zlom', 6);
      },
    },
    {
      label: 'Złom 10 za Jedzenie 2',
      ok: h.res.jedzenie >= 2,
      run: () => {
        h.addRes('jedzenie', -2);
        h.addRes('zlom', 10);
      },
    },
    { label: 'Nie teraz', ok: true, run: () => {} },
  ],
});

EV.push({
  id: 'fachowiec',
  w: (h) => (h.alive().length < 14 ? 1.5 : 0),
  make: (h) => {
    const known = new Set(TECH_DOMS.filter((d) => h.know(d) >= 3));
    const opts = PROFS.filter((p) =>
      Object.keys(p[2]).some((d) => TECH_DOMS.includes(d as TechDom) && !known.has(d as TechDom)),
    );
    const b = h.pickBuilding('home');
    if (b === null) return null;
    return { p: h.makePerson({ prof: pick(opts.length ? opts : PROFS, h.rng), home: b }), b: h.buildingName(b) };
  },
  title: () => 'Ktoś się na czymś zna',
  text: (_h, d) =>
    `${d.p.name} z budynku ${d.b} ${g(d.p, 'przyznał', 'przyznała')} przy ognisku, że ${g(d.p, 'był', 'była')} kiedyś: ${d.p.prof.toLowerCase()}. Do tej pory ${g(d.p, 'siedział', 'siedziała')} cicho, bo bał${g(d.p, '', 'a')} się, że każą ${g(d.p, 'mu', 'jej')} pracować.`,
  choices: (h, d) => [
    {
      label: 'Wciągnąć do roboty',
      ok: true,
      ai: true,
      run: () => {
        h.joinPerson(d.p);
        h.mood(1, 0);
      },
    },
    { label: 'Niech odpoczywa', ok: true, run: () => {} },
  ],
});

EV.push({
  id: 'ksiazki',
  w: () => 1,
  make: (h) => {
    const d = pick(TECH_DOMS, h.rng);
    return { d, name: pick(BOOKS[d], h.rng) };
  },
  title: () => 'Karton w piwnicy',
  text: (_h, d) => `W piwnicy znalazł się karton z książkami. Na wierzchu leży „${d.name}”.`,
  choices: (h, d) => [
    {
      label: 'Do świetlicy',
      ok: true,
      ai: true,
      run: () => {
        if (h.bookCount(d.d) < 2) {
          h.addBook(d.d, d.name);
          h.log(`Nowa książka w świetlicy: „${d.name}” (${DOM[d.d as TechDom]} +1).`, true);
        } else h.addRes('opal', 1);
      },
    },
    { label: 'Na podpałkę', ok: true, run: () => h.addRes('opal', 3) },
  ],
});

EV.push({
  id: 'krypto',
  w: () => 0.7,
  once: true,
  make: () => ({}),
  title: () => 'Zapłata w tokenach',
  text: () => 'Sąsiad z bloku obok chce kupić od was Opał 5. Płaci tokenami, które według niego zaraz odbiją.',
  choices: (h) => [
    {
      label: 'Przyjąć tokeny',
      ok: h.res.opal >= 5,
      run: () => {
        h.addRes('opal', -5);
        h.log('Tokeny dalej czekają na odbicie.');
      },
    },
    { label: 'Wyśmiać', ok: true, ai: true, run: () => h.mood(0, -1) },
  ],
});

EV.push({
  id: 'czynsz',
  w: () => 0.8,
  once: true,
  make: () => ({}),
  title: () => 'Zaległy czynsz za 2047',
  text: () =>
    'Ktoś przyniósł list z dawnej spółdzielni: zaległość za 2047 rok plus odsetki. Ludzie pytają, czy nowy zarząd też będzie ściągał.',
  choices: (h) => [
    { label: 'Umorzyć wszystkim', ok: true, ai: true, run: () => h.mood(3, 0) },
    { label: 'Spalić list w ognisku', ok: true, run: () => h.mood(0, -2) },
  ],
});

EV.push({
  id: 'aktywisci',
  w: (h) => (h.season() <= 1 ? 0.8 : 0.2),
  once: true,
  make: () => ({}),
  title: () => 'Protest przeciw kozom',
  text: () =>
    'Grupka aktywistów z sąsiedniego osiedla protestuje przeciw dymowi z waszych kóz. Sami są zmarznięci na kość.',
  choices: (h) => [
    {
      label: 'Zaprosić do ciepła',
      ok: true,
      ai: true,
      run: () => {
        h.addPeople(4);
        h.mood(1, 0);
      },
    },
    { label: 'Umówić się na wspólne sadzenie drzew wiosną', ok: true, run: () => h.mood(1, -1) },
  ],
});

EV.push({
  id: 'smog',
  w: (h) => (h.season() === 1 && h.tech('t_kozy') && h.rule('kozy') ? 1 : 0),
  make: () => ({}),
  title: () => 'Smog nad osiedlem',
  text: () => 'Kozy w każdym mieszkaniu robią swoje. Nad blokami wisi szara zupa, dzieci kaszlą.',
  choices: (h) => [
    {
      label: 'Palić tylko w nocy',
      ok: true,
      run: () => {
        h.addSick(-2);
        h.mood(0, 1);
        h.setSmog(24 * 60);
      },
    },
    { label: 'Trudno, ciepło ważniejsze', ok: true, ai: true, run: () => h.addSick(4) },
  ],
});

EV.push({
  id: 'obserwacja',
  w: (h) => (h.day() > 4 ? 1 : 0),
  make: () => ({}),
  title: () => 'Ktoś was obserwuje',
  text: () => 'Z dachu galerii handlowej ktoś patrzy przez lornetkę na wasze bloki. Od rana.',
  choices: (h) => [
    {
      label: 'Podwójna warta tej nocy',
      ok: true,
      ai: true,
      run: () => {
        h.setAlertNight();
        h.mood(0, 1);
      },
    },
    { label: 'Udawać, że nic się nie dzieje', ok: true, run: () => h.setRaidBoost() },
  ],
});

EV.push({
  id: 'wesele',
  w: (h) => (h.trust > 40 && h.alive().length >= 2 ? 0.8 : 0),
  make: (h) => {
    const a = shuffled(h, h.alive());
    return { a: a[0].id, b: a[1].id };
  },
  title: () => 'Wesele na klatce',
  text: (h, d) => `${h.spec(d.a)!.name} i ${h.spec(d.b)!.name} chcą wziąć ślub w świetlicy. Pierwszy od upadku.`,
  choices: (h) => [
    {
      label: 'Wyprawić wesele (Jedzenie 6)',
      ok: h.res.jedzenie >= 6,
      ai: true,
      run: () => {
        h.addRes('jedzenie', -6);
        h.mood(4, -4);
        h.log('Wesele do rana. Ktoś grał na akordeonie.', true);
      },
    },
    { label: 'Skromnie, bez imprezy', ok: true, run: () => h.mood(1, 0) },
  ],
});

EV.push({
  id: 'odejscie',
  w: (h) => (h.trust < 35 && h.alive().length ? 2 : 0),
  make: (h) => {
    const p = pick(h.alive(), h.rng);
    return { p: p.id };
  },
  title: () => 'Ktoś chce odejść',
  text: (h, d) => {
    const p = h.spec(d.p)!;
    return `${p.name} mówi, że w osiedlu za torami jest lepiej i ${g(p, 'chce', 'chce')} się wyprowadzić.`;
  },
  choices: (h, d) => [
    {
      label: 'Przekonać (Jedzenie 4)',
      ok: h.res.jedzenie >= 4,
      ai: true,
      run: () => {
        h.addRes('jedzenie', -4);
        h.mood(1, 0);
      },
    },
    {
      label: 'Niech idzie',
      ok: true,
      run: () => {
        const p = h.spec(d.p)!;
        h.personLeaves(p);
        h.removeResident(p.home);
        h.log(`${p.name} ${g(p, 'odszedł', 'odeszła')} z osiedla.`, true);
      },
    },
  ],
});

EV.push({
  id: 'smartfon',
  w: () => 0.7,
  once: true,
  make: () => ({}),
  title: () => 'Ostatni działający smartfon',
  text: () =>
    'W czyjejś szufladzie znalazł się telefon z trzema procentami baterii. Pół osiedla ustawia się w kolejce, żeby zobaczyć zdjęcia sprzed upadku.',
  choices: (h) => [
    { label: 'Pokaz zdjęć w świetlicy', ok: true, ai: true, run: () => h.mood(2, -2) },
    {
      label: 'Rozebrać na części',
      ok: true,
      run: () => {
        h.addRes('czesci', 1);
        h.mood(0, 1);
      },
    },
  ],
});

export function eventDef(id: string): EventDef | undefined {
  return EV.find((e) => e.id === id);
}

export function eventView(h: EventHost, e: ActiveEvent) {
  const def = eventDef(e.id)!;
  return { title: def.title(h, e.d), text: def.text(h, e.d), choices: def.choices(h, e.d) };
}

/** Losowanie wydarzenia jak pickEvent w 0.3. Zwraca nowe wydarzenie albo null. */
export function pickEvent(h: EventHost, evDone: Record<string, boolean>): ActiveEvent | null {
  const pool = EV.filter((e) => !(e.once && evDone[e.id]))
    .map((e) => [e, e.w(h)] as const)
    .filter((x) => x[1] > 0);
  const tot = pool.reduce((a, x) => a + x[1], 0);
  if (!tot) return null;
  let r = h.rng() * tot;
  for (const [e, w] of pool) {
    r -= w;
    if (r <= 0) {
      const d = e.make(h);
      if (!d) return null;
      evDone[e.id] = true;
      return { id: e.id, d };
    }
  }
  return null;
}
