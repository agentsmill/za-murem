/* Tablica badań po angielsku (src/ui/badania.ts zostaje po polsku, pilnuje go tests/unit/badania-tablica.test.ts):
   napisy kartek, szczegółów, paska obsady i półki z książkami, po tych samych kluczach, pod którymi po polsku stoją
   w L(…) w badania.ts. Nazwy technologii, er i opisy działania są w src/sim/badania.en.ts, nazwy dziedzin w
   src/content/data.en.ts (DOM_EN), a zawody tłumaczy zawodEn. Słownik: docs/SLOWNICZEK-EN.md (zarząd to „the board”,
   pracownia to „the research room”, wy to „you”). Liczby przychodzą już jako napisy z src/ui/tekst.ts. */

/** zdanie z wielkiej litery (czas do końca stoi na początku zdania, a w środku jest małą literą) */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const EN = {
  tytul: 'Research board',
  stoi: 'Game paused',
  wroc: 'Back to the game',
  /** pieczątka na zbadanej kartce */
  zrobione: 'DONE',
  /** dopisek na kartce technologii, która odblokowuje budowlę */
  budowla: 'building',
  /** dopisek na kartce i w szczegółach technologii końcowej */
  cel: 'Goal',
  /** kartka „najpierw”: po dwukropku nazwy tego, co trzeba zbadać */
  najpierw: 'first: ',
  /** brak wiedzy na kartce: „Heating 2, you have 1” */
  brakWiedzy: (dom: string, trzeba: number, ma: string) => `${dom} ${trzeba}, you have ${ma}`,
  /** kartka badania, które stanęło bez wiedzy */
  stoiBrak: (opis: string) => `Stalled: ${opis}`,
  /** odwrócona kartka (ten sam napis co w src/sim/badania.en.ts) */
  prad: 'This needs power.',
  kliknij: 'Pick a note to see the details.',
  era: 'Era',
  wymaga: 'Needs',
  zbadaneKrotko: 'Done',
  doZbadania: 'To research',
  zbadane: (dzien: number | null) => (dzien === null ? 'Done.' : `Done on day ${dzien}.`),
  najpierwZbadajcie: 'Research first',
  /** „Nobody knows enough: Heating 2, you have 1. You need someone with the skill, or a book.” */
  nikt: 'Nobody knows enough',
  potrzebna: 'You need someone with the skill, or a book.',
  stoiOpis: 'Research is stalled: the knowledge dropped below the level. The progress stays.',
  badaneTeraz: 'Being researched now.',
  koszt: (koszt: string, postep: string) => `Cost ${koszt} points, progress ${postep}.`,
  czas: (kiedy: string) => `${cap(kiedy)} to go with the current crew.`,
  bezObsady: 'Nobody sits at the table, so there is no estimate.',
  /** czas do końca: godziny gry, od dwóch dób dni */
  godziny: (h: string) => `about ${h} h`,
  dni: (d: string) => `about ${d} days`,
  podGodzine: 'under an hour',
  wiedzaOsady: 'Estate knowledge',
  trzeba: 'needs',
  zna: 'Who knows it',
  nikogoNie: 'nobody on the estate',
  /** książki w dziedzinie: „books: 1” */
  ksiazki: (n: number) => `books: ${n}`,
  badaj: 'Research',
  zmien: 'Switch to this research',
  zmienPostep: 'The progress of the current research stays.',
  obsada: 'At the table',
  pusto: 'Nobody sits.',
  pustoPodpowiedz: 'Seat the board from the research room menu.',
  nicNieWybrano: 'No research chosen.',
  badamy: 'Researching',
  koniec: (kiedy: string) => `done in ${kiedy}`,
  stoiKrotko: 'stalled',
  /** podpowiedź po „Badać”, gdy zaznaczonych jest więcej osób niż wolnych miejsc przy stole */
  usiada: (ile: number, z: number) => `${ile} of ${z} will sit down, there are no more seats.`,
  polka: 'Shelf',
  /** karta „Odkrycie”: nagłówek, tytuł, co odblokowuje i przyciski */
  badania: 'Research',
  odkrycie: 'Discovery',
  odblokowuje: 'Unlocks',
  nastepne: 'Next research',
  dalej: 'Continue',
} as const;
