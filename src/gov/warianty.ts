/* Nakładki zarządu na wydarzenia z 0.3 (src/content/events.ts zostaje bajt w bajt): pora dnia, flaga pierwszej nocy,
   waga z warunkami miejsca, teksty i napisy według miejsca (dom albo blok, jacy sąsiedzi), zwroty w kronice i własne
   wybory tam, gdzie skutek z 0.3 nie ma w M1 sensu (przyjęcia według wolnych miejsc, podwójne liczenie ludzi).
   Czego nakładka nie zmienia, idzie z 0.3: losowanie danych, skutki, liczby. „Opał” z 0.3 to w grze „Drewno”:
   tę zamianę robi wydarzenia.ts dla tytułów, tekstów, napisów i kroniki. Teksty: docs/superpowers/specs/
   2026-10-17-wydarzenia-z-miejsca-design.md, punkty 5 i 5a. */

import type { EventChoice } from '../content/events.ts';
import { g } from '../content/people.ts';
import { pick, ri } from '../core/rng.ts';
import type { GovHost, Pora } from './tresc.ts';

// biome-ignore lint/suspicious/noExplicitAny: dane wydarzeń z 0.3 mają różne kształty
type D = any;

export interface OldEvent {
  id: string;
  when: readonly Pora[];
  /** dozwolone pierwszego dnia po ciszy i pierwszej nocy */
  first?: boolean;
  /** waga w M1; base to waga z 0.3 na tym samym hoście */
  w?: (h: GovHost, base: number) => number;
  /** własne dane zamiast make z 0.3 */
  make?: (h: GovHost) => D | null;
  /** null: tytuł albo tekst z 0.3 */
  title?: (h: GovHost, d: D) => string | null;
  text?: (h: GovHost, d: D) => string | null;
  /** napisy na przyciskach po numerze wyboru (brak albo null: z 0.3); skutki zostają */
  labels?: (h: GovHost, d: D) => (string | null)[];
  /** własne wybory; base to wybory z 0.3 (napisy już z drewnem) */
  choices?: (h: GovHost, d: D, base: EventChoice[]) => EventChoice[];
  /** zwroty do podmiany w kronice z wyborów tego wydarzenia */
  log?: (h: GovHost) => Record<string, string> | null;
}

/** „Opał 5” z 0.3 to w grze „Drewno 5”, jak na pasku i w nowych wydarzeniach */
export const drewno = (s: string): string => s.replaceAll('Opał', 'Drewno');

/** waga wydarzeń z przyjęciem: rzadziej, kiedy jest ciasno */
export const admitWeight = (free: number): number => (free >= 4 ? 1 : free >= 1 ? 0.5 : 0.15);

/** „osoba”, „osoby”, „osób” do liczby */
export function osob(n: number): string {
  if (n === 1) return 'osoba';
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'osoby' : 'osób';
}

/** „4 osoby będą”, „7 osób będzie” (przed „spać na podłodze”) */
export const osobyNaPodlodze = (n: number): string => `${n} ${osob(n)} ${osob(n) === 'osoby' ? 'będą' : 'będzie'}`;

const dom = (h: GovHost) => h.place().kind === 'dom';
/** sąsiedzi to domy (albo w okolicy nikogo nie ma): teksty o domach obok zamiast o blokach */
const domyObok = (h: GovHost) => h.place().near !== 'bloki';
const wielka = (s: string) => s[0].toUpperCase() + s.slice(1);

/** skąd ktoś patrzy przez lornetkę: z najwyższego budynku w okolicy */
const TOWER: Record<string, string> = {
  wiezowiec: 'Z dachu wieżowca obok',
  blok: 'Z dachu bloku naprzeciwko',
  szkola: 'Z dachu szkoły',
  kosciol: 'Z wieży kościoła',
  hala: 'Z dachu hali',
  market: 'Z dachu marketu',
};

/** skąd przychodzą ludzie pod bramę: w bloku jak w 0.3, w domu rodzina */
const FROM_BLOK = [
  'z Wilanowa',
  'z zamkniętego osiedla z ochroną',
  'z bloku, w którym pękł pion',
  'ze wsi, gdzie skończyła się woda',
  'z kampusu dawnej korporacji',
  'z osiedla za obwodnicą',
];
const FROM_DOM = [
  'z miasta, gdzie pękł wodociąg',
  'ze wsi, gdzie skończyła się woda',
  'z domu, któremu zawalił się dach',
  'z osiedla za obwodnicą',
];

/** wydarzenia z 0.3, które pasują do pierwszych nocy, z porą dnia, warunkami miejsca i wariantami tekstów */
export const OLD_EVENTS: OldEvent[] = [
  {
    id: 'handlarz',
    when: ['dzien'],
    text: (h) => `${wielka(h.words().brama.pod)} stoi facet z wózkiem z marketu. Wymieni jedną rzecz i idzie dalej.`,
  },
  {
    id: 'dzieci',
    when: ['dzien'],
    text: (h) =>
      domyObok(h)
        ? 'Dzieciaki z sąsiednich domów przyciągnęły taczkę blach i rur z rozbiórki szopy. Chcą coś do jedzenia.'
        : null,
  },
  {
    id: 'lodowka',
    when: ['dzien'],
    text: (h) =>
      dom(h)
        ? 'W domu obok, u sąsiadów, którzy wyjechali w 2048 roku, stoi pełna lodówka. Zamknięta na amen, bo abonament wygasł razem z serwerem producenta.'
        : null,
  },
  {
    id: 'dron',
    when: ['dzien'],
    text: (h) =>
      dom(h)
        ? 'Nad ulicą od trzech lat krąży dron z zamówieniem, którego nikt nie odebrał. Ładuje się ze słońca i nie odpuszcza.'
        : null,
    log: (h) =>
      dom(h)
        ? {
            'maskotką osiedla': 'maskotką ulicy',
            ...(h.place().garages === null ? { 'spadł za garażami': 'spadł w ogrodzie sąsiadów' } : {}),
          }
        : null,
  },
  {
    id: 'automat',
    when: ['dzien'],
    // automat paczkowy stoi przy sklepie, więc tylko tam, gdzie sklep jest
    w: (h, base) => (h.place().shop === null ? 0 : base),
    text: (h) =>
      dom(h)
        ? 'Po trzech latach automat z paczkami przy sklepie otworzył wszystkie skrytki naraz. Zbiega się pół ulicy.'
        : null,
    labels: (h) => (dom(h) ? [null, 'Zabrać do szopy komitetu'] : []),
  },
  {
    id: 'auto',
    when: ['dzien'],
    text: (h) =>
      dom(h)
        ? 'Na podjeździe u sąsiadów stoi autonomiczne auto, które od 2048 roku czeka na aktualizację. Mruga światłami, kiedy ktoś przechodzi.'
        : null,
  },
  {
    id: 'czynsz',
    when: ['dzien', 'wieczor'],
    // w domu nie ma czynszu, jest rata kredytu; skutki te same
    title: (h) => (dom(h) ? 'Rata kredytu za 2047' : null),
    text: (h) =>
      dom(h)
        ? 'Ktoś przyniósł list z banku: zaległa rata kredytu za dom z 2047 roku plus odsetki i opłata za upomnienie. Sąsiedzi pytają, czy komitet ulicy też będzie zbierał składki.'
        : null,
    labels: (h) => [
      dom(h) ? 'Ogłosić, że komitet składek nie zbiera' : null,
      h.campfire() ? null : 'Spalić list w kozie',
    ],
  },
  {
    id: 'krypto',
    when: ['dzien'],
    text: (h) =>
      domyObok(h)
        ? 'Sąsiad zza płotu chce kupić od was Drewno 5. Płaci tokenami, które według niego zaraz odbiją.'
        : null,
  },
  {
    id: 'ksiazki',
    when: ['dzien'],
    title: (h) => (dom(h) ? 'Karton na strychu' : null),
    text: (h, d) => (dom(h) ? `Na strychu znalazł się karton z książkami. Na wierzchu leży „${d.name}”.` : null),
    labels: (h) => (dom(h) ? ['Na półkę przy kozie'] : []),
    log: (h) => (dom(h) ? { 'w świetlicy': 'na półce przy kozie' } : null),
  },
  {
    id: 'aktywisci',
    when: ['dzien'],
    text: (h) =>
      dom(h)
        ? 'Grupka aktywistów z sąsiedniej ulicy protestuje przeciw dymowi z waszego komina. Sami są zmarznięci na kość.'
        : null,
    // grzeją się do rana i odchodzą: bez dokwaterowania czterech osób (mniej źródeł przyjęć)
    choices: (h, _d, base) => [
      {
        ...base[0],
        run: () => {
          h.mood(1, 0);
          h.log('Aktywiści grzali się przy kozie do rana i poszli protestować gdzie indziej.');
        },
      },
      ...base.slice(1),
    ],
  },
  {
    id: 'influencer',
    when: ['dzien'],
    text: (h, d) =>
      dom(h)
        ? `Pod furtką nagrywa vloga ${d.p.name} z ring lightem na baterie. Mówi, że ma dwa miliony obserwujących. Internetu nie ma od trzech lat.`
        : null,
    // dołącza do rdzenia i nie liczy się drugi raz jako mieszkanka
    choices: (h, d, base) => [
      { ...base[0], label: dom(h) ? 'Przyjąć do domu' : base[0].label, run: () => h.joinPerson(d.p) },
      ...base.slice(1),
    ],
  },
  {
    id: 'uchodzcy',
    when: ['dzien'],
    // obcy pod bramą od drugiego dnia; rzadziej, kiedy jest ciasno
    w: (h) => (h.day() >= 2 ? 0.8 * admitWeight(h.free()) : 0),
    make: (h) => {
      const house = dom(h);
      return {
        n: house ? ri(2, 4, h.rng) : ri(4, 12, h.rng),
        from: pick(house ? FROM_DOM : FROM_BLOK, h.rng),
        spec: h.rng() < 0.3 ? h.makePerson() : null,
      };
    },
    title: (h) => (dom(h) ? 'Rodzina pod furtką' : 'Ludzie pod bramą'),
    text: (h, d) => {
      const free = h.free();
      const many = osob(d.n) === 'osoby';
      const spec = d.spec ? ` Wśród nich jest ${d.spec.prof.toLowerCase()}, ${d.spec.name}.` : '';
      if (dom(h))
        return `Pod furtką stoi rodzina, ${d.n} ${osob(d.n)}. Przyszli ${d.from} i proszą o miejsce. ${free ? `Wolnych łóżek w domu: ${free}.` : 'W domu nie ma wolnych łóżek, spaliby na podłodze w kuchni.'}${spec}`;
      return `Pod bramą ${many ? 'stoją' : 'stoi'} ${d.n} ${osob(d.n)} i ${many ? 'proszą' : 'prosi'} o miejsce. Przyszli ${d.from}. Wolnych miejsc w bloku: ${free}.${spec}`;
    },
    choices: (h, d) => {
      const free = h.free();
      const admit = (k: number) => () => {
        const joined = d.spec && k > 0 ? 1 : 0;
        if (joined) h.joinPerson(d.spec);
        h.addPeople(k - joined);
        h.mood(1, k > free ? 2 : 0);
        h.log(
          `Przyjęliście ${k} ${osob(k)} ${d.from}.${k > free ? ` ${osobyNaPodlodze(k - free)} spać na podłodze.` : ''}`,
          true,
        );
      };
      const out: EventChoice[] = [];
      if (free >= d.n) out.push({ label: 'Przyjąć wszystkich', ok: true, run: admit(d.n) });
      else if (free > 0) out.push({ label: `Przyjąć tylu, ilu się zmieści (${free})`, ok: true, run: admit(free) });
      out.push({
        label: 'Dać Jedzenie 3 na drogę',
        ok: h.res.jedzenie >= 3,
        run: () => {
          h.addRes('jedzenie', -3);
          h.mood(1, 0);
        },
      });
      if (free < d.n)
        out.push({
          label: `Przyjąć wszystkich (${osobyNaPodlodze(d.n - free)} spać na podłodze)`,
          ok: true,
          run: admit(d.n),
        });
      out.push({ label: 'Odprawić', ok: true, run: () => h.mood(-2, -1) });
      return out;
    },
  },
  {
    id: 'fachowiec',
    when: ['wieczor'],
    // w bloku to ktoś z mieszkańców, w domu sąsiad zza płotu; bez nich nie ma komu się przyznać
    w: (h, base) => (dom(h) ? (h.neighbour() ? base : 0) : h.residents() > 0 ? base : 0),
    text: (h, d) => {
      const p = d.p;
      const who = dom(h) ? `${p.name} ${h.neighbour() ?? 'zza płotu'}` : `${p.name} z budynku ${d.b}`;
      return `${who} ${g(p, 'przyznał', 'przyznała')} ${h.campfire() ? 'przy ognisku' : 'przy kozie'}, że ${g(p, 'był', 'była')} kiedyś: ${p.prof.toLowerCase()}. Do tej pory ${g(p, 'siedział', 'siedziała')} cicho, bo bał${g(p, '', 'a')} się, że każą ${g(p, 'mu', 'jej')} pracować.`;
    },
    // w bloku mieszkaniec przechodzi do zarządu (mieszkańców o jednego mniej), w domu sąsiad dołącza do domowników
    choices: (h, _d, base) => [
      {
        ...base[0],
        run: () => {
          base[0].run();
          if (!dom(h)) h.removeResident(0);
        },
      },
      ...base.slice(1),
    ],
  },
  {
    id: 'klotnia',
    when: ['wieczor'],
    text: (h, d) =>
      dom(h)
        ? `${h.spec(d.a)?.name} i ${h.spec(d.b)?.name} pokłócili się o grafik dyżurów przy kozie. Reszta domu słucha zza ściany.`
        : null,
    labels: (h) => (dom(h) ? ['Mediacja przy stole'] : []),
    log: (h) => (dom(h) ? { 'do innego osiedla': 'na inną ulicę' } : null),
  },
  {
    id: 'pozar',
    when: ['wieczor', 'noc'],
    first: true,
    text: (h) => (dom(h) ? 'Od źle postawionej kozy zajęła się podłoga w kuchni. Dym idzie na cały dom.' : null),
    labels: (h) => (dom(h) ? [null, 'Uciekać do ogrodu'] : []),
    log: (h) =>
      dom(h)
        ? {
            'Spłonął zapas opału z piwnicy.': 'Spłonęło drewno ułożone przy kozie.',
            [`Klatka w budynku ${h.buildingName(0)} spłonęła. Mniej miejsc do mieszkania.`]:
              'Ogień zjadł meble przy kozie. Dym wszedł do każdego pokoju.',
          }
        : null,
  },
  // złodziej z piwnicy to ktoś z mieszkańców: bez nich byłby nim ktoś z domowników
  { id: 'kradziez', when: ['noc'], first: true, w: (h, base) => (h.residents() > 0 ? base : 0) },
  // dwoje losowych z zarządu i „pierwszy od upadku” (upadek trwał 25 lat): wróci z parami z generatora mieszkańców
  { id: 'wesele', when: ['dzien', 'wieczor'], w: () => 0 },
  {
    id: 'odejscie',
    when: ['dzien', 'wieczor'],
    text: (h, d) => {
      const p = h.spec(d.p);
      return dom(h) && p ? `${p.name} mówi, że na sąsiedniej ulicy jest lepiej i chce się wyprowadzić.` : null;
    },
    // odchodzi z rdzenia; w M1 rdzeń nie jest liczony drugi raz wśród mieszkańców
    choices: (h, d, base) => [
      ...base.slice(0, 1),
      {
        ...base[1],
        run: () => {
          const p = h.spec(d.p);
          if (!p) return;
          h.personLeaves(p);
          h.log(`${p.name} ${g(p, 'odszedł', 'odeszła')} ${dom(h) ? 'z ulicy' : 'z osiedla'}.`, true);
        },
      },
    ],
  },
  {
    id: 'obserwacja',
    when: ['dzien'],
    // w 0.3 od piątego dnia; w M1 pierwsza noc jest o szabrownikach, więc już po południu pierwszego
    w: (h) => (h.hour() >= 13 ? 1.2 : 0),
    first: true,
    text: (h) => {
      const t = h.place().tower;
      const from = t ? TOWER[t] : dom(h) ? 'Zza krzaków na końcu ulicy' : 'Z dachu galerii handlowej';
      return `${from} ktoś patrzy przez lornetkę na ${dom(h) ? 'wasz dom' : 'wasz blok'}. Od rana.`;
    },
  },
];
