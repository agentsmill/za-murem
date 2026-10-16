/* Za Murem: treść gry przeniesiona z wersji 0.3 (js/data.js) bez zmiany liczb i tekstów.
   Test tests/unit/content.test.ts porównuje te wartości z oryginałem w public/v03/js/data.js. */

export type Res = 'opal' | 'jedzenie' | 'zlom' | 'czesci' | 'leki' | 'prad';
export type Cost = Partial<Record<Res, number>>;
export type TechDom = 'bud' | 'cieplo' | 'elek' | 'med' | 'uprawa' | 'it';
export type Dom = TechDom | 'obrona';
export type BuildingClass = 'blok' | 'dom' | 'sklep' | 'szkola' | 'przychodnia' | 'garaz' | 'hala' | 'kosciol' | 'inne';
export type LawPath = 'base' | 'porzadek' | 'wspolnota' | 'tech';
export type EndingId = 'twierdza' | 'wspolnota' | 'technokracja' | 'odwolanie' | 'exodus' | 'pustka';

export interface FacDef {
  name: string;
  kind: 'adapt' | 'yard' | 'roof';
  on?: string[];
  cost: Cost;
  slots?: number;
  dom?: Dom | null;
  build: number;
  icon: string;
  tech?: string;
  desc: string;
  w?: number;
  h?: number;
  max?: number;
  needTrees?: boolean;
  demol?: boolean;
}
export interface TechDef {
  name: string;
  era: number;
  dom: TechDom;
  lvl: number;
  cost: number;
  req: string[];
  item?: string;
  desc: string;
}
export interface LawDef {
  name: string;
  path: LawPath;
  req?: string[];
  tech?: string;
  final?: EndingId;
  desc: string;
}
export interface EndingDef {
  title: string;
  text: string;
}
export interface PoiCatDef {
  name: string;
  risk: number;
  loot: Partial<Record<Res, [number, number]>>;
  book: number;
  bdom?: TechDom[];
  item?: string;
}
/** [zawód męski, zawód żeński, umiejętności, [wiek od, wiek do]] */
export type Prof = [string, string, Partial<Record<Dom, number>>, [number, number]];
export interface TraitDef {
  name: string;
  desc: string;
}

export const RES: readonly Res[] = ['opal', 'jedzenie', 'zlom', 'czesci', 'leki', 'prad'];
export const RL: Record<Res, string> = {
  opal: 'Opał',
  jedzenie: 'Jedzenie',
  zlom: 'Złom',
  czesci: 'Części',
  leki: 'Leki',
  prad: 'Prąd',
};
export const costText = (o: Cost | null | undefined): string =>
  Object.entries(o || {})
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `${RL[k as Res]} ${v}`)
    .join(', ');

export const DOM: Record<Dom, string> = {
  bud: 'Budowa',
  cieplo: 'Ciepło',
  elek: 'Elektryka',
  med: 'Medycyna',
  uprawa: 'Uprawa',
  it: 'Informatyka',
  obrona: 'Obrona',
};
export const TECH_DOMS: readonly TechDom[] = ['bud', 'cieplo', 'elek', 'med', 'uprawa', 'it'];
export const SEASONS: readonly string[] = ['jesień', 'zima', 'wiosna', 'lato'];
export const SEASON_DAYS = 10;
export const CLS: Record<BuildingClass, string> = {
  blok: 'Blok',
  dom: 'Dom',
  sklep: 'Pawilon',
  szkola: 'Szkoła',
  przychodnia: 'Przychodnia',
  garaz: 'Garaże',
  hala: 'Hala',
  kosciol: 'Kościół',
  inne: 'Budynek',
};
export const RESIDENTIAL: ReadonlySet<string> = new Set<string>(['blok', 'dom']);

/* Obiekty: adaptacje budynków, rzeczy na podwórku, dach */
export const FAC: Record<string, FacDef> = {
  kuchnia: {
    name: 'Kuchnia społeczna',
    kind: 'adapt',
    on: ['blok', 'sklep', 'szkola', 'inne', 'hala'],
    cost: { zlom: 4, opal: 2 },
    slots: 6,
    dom: 'uprawa',
    build: 6,
    icon: 'pot',
    desc: 'Wspólne gotowanie. Przy pełnej obsadzie jedzenie starcza na 25% dłużej, a ludzie mniej się wkurzają.',
  },
  ambulatorium: {
    name: 'Ambulatorium',
    kind: 'adapt',
    on: ['blok', 'przychodnia', 'szkola', 'inne', 'sklep'],
    cost: { zlom: 3, leki: 2 },
    slots: 4,
    dom: 'med',
    build: 6,
    icon: 'cross',
    desc: 'Leczy chorych. Bez leków działa o połowę słabiej.',
  },
  swietlica: {
    name: 'Świetlica-pracownia',
    kind: 'adapt',
    on: ['blok', 'szkola', 'sklep', 'inne', 'hala', 'przychodnia'],
    cost: { zlom: 3 },
    slots: 6,
    dom: null,
    build: 5,
    icon: 'book',
    desc: 'Tu się bada technologie. Kierownik, który zna się na badanej dziedzinie, mocno przyspiesza.',
  },
  warsztat: {
    name: 'Warsztat',
    kind: 'adapt',
    on: ['garaz', 'hala', 'sklep', 'blok', 'inne'],
    cost: { zlom: 6, opal: 2 },
    slots: 6,
    dom: 'bud',
    build: 8,
    icon: 'wrench',
    desc: 'Przerabia Złom 2 na Części 1.',
  },
  wezel: {
    name: 'Węzeł cieplny',
    kind: 'adapt',
    on: ['hala', 'inne', 'garaz', 'blok', 'sklep'],
    cost: { zlom: 12, czesci: 4 },
    slots: 4,
    dom: 'cieplo',
    build: 16,
    icon: 'flame',
    tech: 't_wezel',
    desc: 'Palacze w kotłowni grzeją wszystkie wasze bloki w promieniu 100 m o 12°C. Pali Opał 1,5 na godzinę przez całą dobę.',
  },
  grzybiarnia: {
    name: 'Pieczarkarnia w piwnicy',
    kind: 'adapt',
    on: ['blok', 'hala', 'garaz'],
    cost: { zlom: 2, opal: 2 },
    slots: 6,
    dom: 'uprawa',
    build: 6,
    icon: 'shroom',
    tech: 't_grzyby',
    desc: 'Jedzenie przez cały rok, bez względu na pogodę.',
  },
  generator: {
    name: 'Gazogenerator',
    kind: 'adapt',
    on: ['garaz', 'hala', 'inne'],
    cost: { zlom: 8, czesci: 3 },
    slots: 2,
    dom: 'elek',
    build: 10,
    icon: 'bolt',
    tech: 't_gazo',
    desc: 'Zamienia Opał 1 na Prąd 2 co godzinę, kiedy ma obsadę.',
  },
  radio: {
    name: 'Radiowęzeł',
    kind: 'adapt',
    on: ['blok', 'szkola', 'inne', 'hala', 'sklep'],
    cost: { czesci: 4, zlom: 2 },
    slots: 2,
    dom: 'elek',
    build: 6,
    icon: 'antenna',
    tech: 't_radio',
    desc: 'Kontakt z innymi osadami: handel, prośby o pomoc, plotki o nowych miejscach.',
  },
  serwer: {
    name: 'Serwerownia',
    kind: 'adapt',
    on: ['blok', 'szkola', 'inne', 'hala', 'sklep'],
    cost: { czesci: 8, zlom: 2 },
    slots: 2,
    dom: 'it',
    build: 10,
    icon: 'rack',
    tech: 't_serwer',
    desc: 'Bierze Prąd 1 na godzinę. Prognozuje napady i doradza przy decyzjach.',
  },
  rozbiorka: {
    name: 'Rozbiórka',
    kind: 'adapt',
    on: ['blok', 'dom', 'sklep', 'szkola', 'garaz', 'hala', 'inne', 'kosciol', 'przychodnia'],
    cost: {},
    slots: 10,
    dom: 'bud',
    build: 0,
    icon: 'hammer',
    demol: true,
    desc: 'Rozbieracie budynek na opał i złom, aż zostanie ruina.',
  },
  ognisko: {
    name: 'Ognisko',
    kind: 'yard',
    w: 2,
    h: 2,
    cost: { opal: 1 },
    slots: 0,
    build: 1,
    icon: 'fire',
    max: 4,
    desc: 'Pali Opał 0,1 na godzinę od 6 do 22. Wkurzenie −0,4 dziennie.',
  },
  ogrodki: {
    name: 'Ogródki',
    kind: 'yard',
    w: 5,
    h: 4,
    cost: { zlom: 1 },
    slots: 6,
    dom: 'uprawa',
    build: 4,
    icon: 'sprout',
    desc: 'Jedzenie z grządek. Latem dużo, wiosną i jesienią mniej, zimą nic.',
  },
  wyrab: {
    name: 'Punkt wyrębu',
    kind: 'yard',
    w: 2,
    h: 2,
    cost: { zlom: 2 },
    slots: 8,
    dom: 'bud',
    build: 3,
    icon: 'axe',
    needTrees: true,
    desc: 'Ścina drzewa w promieniu 40 m na opał. Drzewa nie odrastają.',
  },
  szklarnia: {
    name: 'Szklarnia z folii',
    kind: 'yard',
    w: 6,
    h: 4,
    cost: { zlom: 4, opal: 2 },
    slots: 6,
    dom: 'uprawa',
    build: 8,
    icon: 'sprout',
    tech: 't_szklarnia',
    desc: 'Jedzenie przez cały rok, zimą trochę mniej.',
  },
  wieza: {
    name: 'Wieża strażnicza',
    kind: 'yard',
    w: 2,
    h: 2,
    cost: { zlom: 4, opal: 2 },
    slots: 3,
    dom: 'obrona',
    build: 6,
    icon: 'tower',
    tech: 't_wieza',
    desc: 'Każdy wartownik dodaje 1 do obrony nocą.',
  },
  wiatrak: {
    name: 'Wiatrak z alternatora',
    kind: 'yard',
    w: 1,
    h: 1,
    cost: { czesci: 3, zlom: 4 },
    slots: 0,
    build: 6,
    icon: 'wind',
    tech: 't_wiatrak',
    desc: 'Prąd 0,25 na godzinę przez całą dobę.',
  },
  pv: {
    name: 'Panele na dachu',
    kind: 'roof',
    on: ['blok', 'sklep', 'szkola', 'hala', 'inne', 'przychodnia'],
    cost: { czesci: 4, zlom: 2 },
    build: 6,
    icon: 'panel',
    tech: 't_panele',
    desc: 'Prąd 0,6 na godzinę od 8 do 17, zimą mniej. Nie zajmuje miejsca w budynku.',
  },
};

/* Drzewko technologii */
export const ERAS: readonly string[] = ['', 'Pierwsze tygodnie', 'Majsterkowanie', 'Prąd', 'Łączność', 'Krzem'];
export const TECH: Record<string, TechDef> = {
  t_kozy: {
    name: 'Kozy w mieszkaniach',
    era: 1,
    dom: 'cieplo',
    lvl: 1,
    cost: 14,
    req: [],
    desc: 'Piecyki z beczek w każdym bloku. +7°C w mieszkaniach, ale pali opał.',
  },
  t_okna: {
    name: 'Folia i koce w oknach',
    era: 1,
    dom: 'bud',
    lvl: 1,
    cost: 12,
    req: [],
    desc: '+3°C w każdym bloku, za darmo.',
  },
  t_konserwy: {
    name: 'Słoiki i suszarnie',
    era: 1,
    dom: 'uprawa',
    lvl: 1,
    cost: 12,
    req: [],
    desc: 'Cała produkcja jedzenia +20%.',
  },
  t_zielarstwo: {
    name: 'Zielarstwo z działek',
    era: 1,
    dom: 'med',
    lvl: 1,
    cost: 12,
    req: [],
    desc: 'Ambulatorium leczy 30% szybciej i samo robi trochę leków.',
  },
  t_wieza: {
    name: 'Wieże z rusztowań',
    era: 1,
    dom: 'bud',
    lvl: 1,
    cost: 15,
    req: [],
    desc: 'Odblokowuje wieżę strażniczą.',
  },
  t_spawanie: {
    name: 'Spawanie z akumulatorów',
    era: 2,
    dom: 'bud',
    lvl: 2,
    cost: 25,
    req: ['t_okna'],
    desc: 'Warsztat robi części 1,5× szybciej. Otwiera konstrukcje ze stali.',
  },
  t_barykady: {
    name: 'Barykady z wraków',
    era: 2,
    dom: 'bud',
    lvl: 2,
    cost: 22,
    req: ['t_wieza'],
    desc: 'Możecie podnosić barykady wokół osiedla. Każdy poziom to obrona +2.',
  },
  t_wezel: {
    name: 'Rozruch węzła cieplnego',
    era: 2,
    dom: 'cieplo',
    lvl: 2,
    cost: 35,
    req: ['t_kozy'],
    desc: 'Odblokowuje węzeł cieplny: jedna kotłownia grzeje wiele bloków.',
  },
  t_szklarnia: {
    name: 'Szklarnie z folii',
    era: 2,
    dom: 'uprawa',
    lvl: 2,
    cost: 30,
    req: ['t_konserwy'],
    desc: 'Odblokowuje szklarnię, która daje jedzenie także zimą.',
  },
  t_grzyby: {
    name: 'Pieczarki w piwnicach',
    era: 2,
    dom: 'uprawa',
    lvl: 2,
    cost: 25,
    req: ['t_konserwy'],
    desc: 'Odblokowuje pieczarkarnię w piwnicy bloku.',
  },
  t_ambu: {
    name: 'Ambulatorium polowe',
    era: 2,
    dom: 'med',
    lvl: 2,
    cost: 30,
    req: ['t_zielarstwo'],
    desc: 'Leczenie 1,6× szybsze, mniej zgonów wśród chorych.',
  },
  t_panele: {
    name: 'Panele z dachów galerii',
    era: 3,
    dom: 'elek',
    lvl: 2,
    cost: 40,
    req: ['t_spawanie'],
    desc: 'Odblokowuje panele słoneczne na dachach.',
  },
  t_akumulatory: {
    name: 'Akumulatory z elektrycznych SUV-ów',
    era: 3,
    dom: 'elek',
    lvl: 2,
    cost: 35,
    req: ['t_spawanie'],
    desc: 'Magazyn prądu rośnie z 20 do 150.',
  },
  t_wiatrak: {
    name: 'Wiatraki z alternatorów',
    era: 3,
    dom: 'elek',
    lvl: 2,
    cost: 35,
    req: ['t_spawanie'],
    desc: 'Odblokowuje wiatrak, który kręci się dzień i noc.',
  },
  t_gazo: {
    name: 'Gazogenerator na drewno',
    era: 3,
    dom: 'elek',
    lvl: 3,
    cost: 45,
    req: ['t_spawanie', 't_kozy'],
    desc: 'Odblokowuje generator, który zamienia opał na prąd.',
  },
  t_swiatlo: {
    name: 'LED-y na klatkach',
    era: 3,
    dom: 'elek',
    lvl: 2,
    cost: 30,
    req: ['t_akumulatory'],
    desc: 'Badania +20%, wkurzenie −0,3 dziennie. Bierze Prąd 0,3 na godzinę.',
  },
  t_radio: {
    name: 'Krótkofalówka',
    era: 4,
    dom: 'elek',
    lvl: 3,
    cost: 45,
    req: ['t_akumulatory'],
    desc: 'Odblokowuje radiowęzeł i kontakt z innymi osadami.',
  },
  t_mesh: {
    name: 'Osiedlowa sieć mesh',
    era: 4,
    dom: 'it',
    lvl: 2,
    cost: 50,
    req: ['t_radio'],
    desc: 'Badania +25%, ekipy rzadziej obrywają, trzy ekipy naraz.',
  },
  t_pompy: {
    name: 'Pompy ciepła z klimatyzatorów',
    era: 4,
    dom: 'cieplo',
    lvl: 3,
    cost: 65,
    req: ['t_wezel', 't_panele'],
    desc: 'Węzeł cieplny pali o połowę mniej opału, kiedy jest prąd.',
  },
  t_druk: {
    name: 'Drukarka 3D z butelek',
    era: 4,
    dom: 'bud',
    lvl: 3,
    cost: 60,
    req: ['t_spawanie', 't_panele'],
    desc: 'Warsztat robi części jeszcze 1,5× szybciej.',
  },
  t_hydro: {
    name: 'Hydroponika na dachach',
    era: 4,
    dom: 'uprawa',
    lvl: 3,
    cost: 70,
    req: ['t_szklarnia', 't_panele'],
    desc: 'Szklarnie dają 40% więcej jedzenia.',
  },
  t_drony: {
    name: 'Drony z dawnych dostaw',
    era: 5,
    dom: 'it',
    lvl: 3,
    cost: 70,
    req: ['t_mesh'],
    desc: 'Ekipy rzadziej obrywają i przynoszą 20% więcej.',
  },
  t_serwer: {
    name: 'Serwer z odzysku',
    era: 5,
    dom: 'it',
    lvl: 3,
    cost: 80,
    req: ['t_mesh'],
    desc: 'Odblokowuje serwerownię: prognozy napadów i rady przy decyzjach.',
  },
  t_model: {
    name: 'Lokalny model językowy',
    era: 5,
    dom: 'it',
    lvl: 4,
    cost: 110,
    req: ['t_serwer'],
    item: 'dyski',
    desc: 'Model z dysków banku. Badania +30%, wszystko idzie 10% sprawniej. Otwiera drogę technokracji.',
  },
};
export const ITEMS: Record<string, string> = { dyski: 'Dyski z modelem językowym (z banku)' };

/* Uchwały zarządu */
export const PATHS: Record<LawPath, string> = {
  base: 'Przetrwanie',
  porzadek: 'Porządek',
  wspolnota: 'Wspólnota',
  tech: 'Technokracja',
};
export const LAW_CD = 36 * 60;
export const LAW: Record<string, LawDef> = {
  u_racje: {
    name: 'Racje głodowe',
    path: 'base',
    desc: 'Jedzenie schodzi o 25% wolniej. Wkurzenie +0,4 dziennie i więcej chorych.',
  },
  u_zmiana: {
    name: 'Wydłużona zmiana',
    path: 'base',
    desc: 'Praca do 20:00 zamiast do 18:00. Wkurzenie +0,5 dziennie.',
  },
  u_seniorzy: {
    name: 'Praca dla emerytów',
    path: 'base',
    desc: 'Połowa starszych idzie do lekkiej pracy. Wkurzenie +3 od razu i trochę więcej chorych.',
  },
  u_dokwaterowanie: {
    name: 'Dokwaterowanie obcych',
    path: 'base',
    desc: 'Uchodźcy przychodzą częściej. Zaufanie +3 od razu.',
  },
  u_pochowek: {
    name: 'Pochówki na skwerze',
    path: 'base',
    desc: 'Każda śmierć wkurza ludzi o połowę mniej. Zaufanie +2 od razu.',
  },
  u_polityka: {
    name: 'Zakaz rozmów o polityce na klatkach',
    path: 'base',
    desc: 'Wkurzenie −0,3 dziennie. Zaufanie −2 od razu, bo to jednak cenzura.',
  },
  u_warty: {
    name: 'Warty na klatkach',
    path: 'porzadek',
    desc: 'Obrona +3 i mniej kradzieży. 4% dorosłych stoi na warcie zamiast pracować.',
  },
  u_godzina: {
    name: 'Godzina policyjna',
    path: 'porzadek',
    req: ['u_warty'],
    desc: 'Obrona +1, mniej kradzieży. Wkurzenie +0,2 dziennie.',
  },
  u_kartki: {
    name: 'Kartki według pracy',
    path: 'porzadek',
    req: ['u_warty'],
    desc: 'Jedzenie schodzi o 15% wolniej, praca +10%. Wkurzenie +0,2 dziennie.',
  },
  u_straz: {
    name: 'Straż osiedlowa',
    path: 'porzadek',
    req: ['u_godzina', 'u_kartki'],
    desc: 'Obrona +4. Wkurzenie −0,2 dziennie, zaufanie −0,2 dziennie.',
  },
  u_komisarz: {
    name: 'Zarząd komisaryczny',
    path: 'porzadek',
    req: ['u_straz'],
    final: 'twierdza',
    desc: 'Koniec z walnym. Wkurzenie rośnie wolniej, zaufanie już samo nie wraca. Zakończenie: Twierdza.',
  },
  u_zebrania: {
    name: 'Zebrania na klatkach',
    path: 'wspolnota',
    desc: 'Zaufanie +0,4 dziennie. Praca zaczyna się o 9:00.',
  },
  u_dzieci: {
    name: 'Świetlica dla dzieci',
    path: 'wspolnota',
    req: ['u_zebrania'],
    desc: 'Wkurzenie −0,3 dziennie, rodzice pracują spokojniej.',
  },
  u_sad: {
    name: 'Sąd koleżeński',
    path: 'wspolnota',
    req: ['u_zebrania'],
    desc: 'Kradzieże i kłótnie kończą się łagodniej. Zaufanie +0,2 dziennie.',
  },
  u_walne: {
    name: 'Walne co tydzień',
    path: 'wspolnota',
    req: ['u_dzieci', 'u_sad'],
    desc: 'Zaufanie +0,5 dziennie, wkurzenie −0,2 dziennie.',
  },
  u_samorzad: {
    name: 'Samorząd bloków',
    path: 'wspolnota',
    req: ['u_walne'],
    final: 'wspolnota',
    desc: 'Każdy blok rządzi się sam, praca +10%. Zakończenie: Wspólnota.',
  },
  u_doradca: {
    name: 'Rady z serwera',
    path: 'tech',
    tech: 't_serwer',
    desc: 'Przy każdej decyzji widać, co poleca serwer. Badania +10%.',
  },
  u_algorytm: {
    name: 'Algorytm przydziału racji',
    path: 'tech',
    req: ['u_doradca'],
    desc: 'Jedzenie schodzi o 15% wolniej bez wkurzania ludzi, ale zaufanie −0,2 dziennie.',
  },
  u_sekretarz: {
    name: 'Model sekretarzem zarządu',
    path: 'tech',
    req: ['u_algorytm'],
    tech: 't_model',
    desc: 'Uchwały można podpisywać dwa razy częściej.',
  },
  u_prezes: {
    name: 'AI prezesem spółdzielni',
    path: 'tech',
    req: ['u_sekretarz'],
    final: 'technokracja',
    desc: 'Model przejmuje zarząd. Zakończenie: Technokracja.',
  },
};

export const ENDINGS: Record<EndingId, EndingDef> = {
  twierdza: {
    title: 'Twierdza',
    text: 'Osiedle stało się twierdzą. Bramy zamykają się o dwudziestej, straż zna każdego z imienia i każdego ma na oku. Nikt nie głoduje i nikt już nie pyta, kiedy będzie walne. Za murem mówią o was z respektem, a w środku coraz ciszej.',
  },
  wspolnota: {
    title: 'Wspólnota',
    text: 'Każdy blok ma swój samorząd, swoje zebrania i swoją kłótnię o grafik dyżurów. Jest głośno, wolno i nieefektywnie, ale ludzie zostają, bo to ich miejsce. Inne osady przysyłają delegacje, żeby zobaczyć, jak to działa.',
  },
  technokracja: {
    title: 'Technokracja',
    text: 'Model z dysków banku został prezesem spółdzielni. Racje są sprawiedliwe co do grama, grafiki optymalne, a zebrania trwają cztery minuty. Nikt nie wie, kto go właściwie kontroluje. Na razie wszyscy są najedzeni.',
  },
  odwolanie: {
    title: 'Walne odwołało zarząd',
    text: 'Wkurzenie przelało się na klatki. Nadzwyczajne walne zebrało się w świetlicy i odwołało was przez aklamację. Nowy zarząd zaczął od wymiany zamków.',
  },
  exodus: {
    title: 'Osiedle opustoszało',
    text: 'Ludzie przestali wierzyć, że z wami przetrwają. Rodzina po rodzinie odchodzili do innych osiedli. Zostały puste klatki i rachunki za czynsz z 2047 roku.',
  },
  pustka: {
    title: 'Nikt nie przeżył',
    text: 'Ostatni mieszkaniec zgasił kozę. Osiedle stoi puste, a dron dostawczy dalej krąży nad dachem.',
  },
};

/* Kategorie miejsc do przeszukania */
export const POICAT: Record<string, PoiCatDef> = {
  spozywczy: { name: 'Sklep spożywczy', risk: 0.25, loot: { jedzenie: [6, 14] }, book: 0 },
  apteka: { name: 'Apteka', risk: 0.3, loot: { leki: [2, 5] }, book: 0.25, bdom: ['med'] },
  przychodnia: { name: 'Przychodnia', risk: 0.25, loot: { leki: [1, 4], czesci: [0, 1] }, book: 0.3, bdom: ['med'] },
  budowlany: {
    name: 'Sklep budowlany',
    risk: 0.2,
    loot: { zlom: [3, 8], czesci: [0, 2], opal: [0, 2] },
    book: 0.3,
    bdom: ['bud', 'cieplo'],
  },
  elektronika: { name: 'Sklep z elektroniką', risk: 0.25, loot: { czesci: [2, 5] }, book: 0.3, bdom: ['elek', 'it'] },
  szkola: {
    name: 'Szkoła',
    risk: 0.12,
    loot: { opal: [1, 3], zlom: [0, 2] },
    book: 0.6,
    bdom: ['elek', 'med', 'uprawa', 'bud', 'it'],
  },
  biblioteka: {
    name: 'Biblioteka',
    risk: 0.1,
    loot: { opal: [1, 2] },
    book: 0.9,
    bdom: ['elek', 'med', 'uprawa', 'bud', 'cieplo', 'it'],
  },
  bank: { name: 'Bank', risk: 0.35, loot: { czesci: [1, 3] }, book: 0.2, bdom: ['it'], item: 'dyski' },
  stacja: { name: 'Stacja paliw', risk: 0.3, loot: { opal: [3, 6], jedzenie: [0, 3] }, book: 0 },
  ubrania: { name: 'Sklep z ubraniami', risk: 0.15, loot: { opal: [2, 4] }, book: 0 },
  urzad: { name: 'Urząd', risk: 0.2, loot: { zlom: [1, 3], opal: [1, 2] }, book: 0.4, bdom: ['cieplo', 'bud'] },
  kosciol: { name: 'Kościół', risk: 0.08, loot: { opal: [1, 3] }, book: 0 },
  sklep: {
    name: 'Sklep',
    risk: 0.2,
    loot: { zlom: [1, 3], jedzenie: [0, 2], czesci: [0, 1] },
    book: 0.05,
    bdom: ['uprawa'],
  },
  ogrodnik: { name: 'Sklep ogrodniczy', risk: 0.15, loot: { jedzenie: [1, 3] }, book: 0.4, bdom: ['uprawa'] },
  garaz: { name: 'Garaże', risk: 0.1, loot: { zlom: [3, 6], opal: [0, 2], czesci: [0, 1] }, book: 0.05, bdom: ['bud'] },
  hala: { name: 'Hala', risk: 0.15, loot: { zlom: [2, 5], czesci: [0, 2] }, book: 0 },
};
export const FOODSHOP: ReadonlySet<string> = new Set<string>([
  'convenience',
  'supermarket',
  'bakery',
  'butcher',
  'greengrocer',
  'deli',
  'pastry',
  'kiosk',
  'alcohol',
  'beverages',
  'confectionery',
  'frozen_food',
  'seafood',
  'dairy',
  'farm',
  'general',
  'food',
  'coffee',
  'tea',
  'cheese',
  'health_food',
  'wine',
]);

export const BOOKS: Record<TechDom, string[]> = {
  bud: ['Poradnik budowlany z 1987 roku', 'Murowanie dla każdego', 'Spawanie. Teoria i praktyka'],
  cieplo: ['Hydraulika bez tajemnic', 'Kotły i piece, wydanie z PRL', 'Instrukcja obsługi węzła cieplnego'],
  elek: ['Elektronika dla opornych, wyd. 2031', 'Podręcznik fizyki dla liceum', 'Fotowoltaika krok po kroku'],
  med: ['Pierwsza pomoc. Podręcznik do EDB', 'Farmakologia dla pielęgniarek', 'Choroby wewnętrzne, tom 2'],
  uprawa: ['Ogród na balkonie', 'Atlas grzybów z dopiskiem „nie jeść”', 'Uprawa warzyw pod osłonami'],
  it: ['Python dla zaawansowanych, wyd. 7', 'Sieci komputerowe w praktyce', 'Linux. Biblia administratora'],
};

/* Ludzie */
export const NAMES: { m: string[]; f: string[] } = {
  m: [
    'Henryk',
    'Zbigniew',
    'Tomasz',
    'Krzysztof',
    'Marek',
    'Paweł',
    'Janusz',
    'Rafał',
    'Wojciech',
    'Dariusz',
    'Jakub',
    'Stanisław',
    'Grzegorz',
    'Adam',
    'Bogdan',
    'Kacper',
    'Michał',
    'Leszek',
    'Ryszard',
    'Igor',
  ],
  f: [
    'Halina',
    'Barbara',
    'Ewa',
    'Magdalena',
    'Małgorzata',
    'Joanna',
    'Renata',
    'Iwona',
    'Zofia',
    'Hanna',
    'Dorota',
    'Urszula',
    'Jolanta',
    'Agnieszka',
    'Krystyna',
    'Natalia',
    'Wiktoria',
    'Teresa',
    'Ola',
    'Kinga',
  ],
};
export const SURN: [string, string][] = [
  ['Kowalski', 'Kowalska'],
  ['Nowak', 'Nowak'],
  ['Wiśniewski', 'Wiśniewska'],
  ['Wójcik', 'Wójcik'],
  ['Kamiński', 'Kamińska'],
  ['Lewandowski', 'Lewandowska'],
  ['Szymański', 'Szymańska'],
  ['Dąbrowski', 'Dąbrowska'],
  ['Kozłowski', 'Kozłowska'],
  ['Mazur', 'Mazur'],
  ['Krawczyk', 'Krawczyk'],
  ['Piotrowski', 'Piotrowska'],
  ['Grabowski', 'Grabowska'],
  ['Pawlak', 'Pawlak'],
  ['Michalski', 'Michalska'],
  ['Król', 'Król'],
  ['Wieczorek', 'Wieczorek'],
  ['Jabłoński', 'Jabłońska'],
  ['Wróbel', 'Wróbel'],
  ['Sikora', 'Sikora'],
];
export const PROFS: Prof[] = [
  ['Emerytowany inżynier', 'Emerytowana inżynierka', { bud: 3, cieplo: 2 }, [60, 80]],
  ['Hydraulik', 'Hydrauliczka', { cieplo: 3 }, [28, 64]],
  ['Elektryk', 'Elektryczka', { elek: 3, bud: 1 }, [25, 62]],
  ['Lekarz rodzinny', 'Lekarka rodzinna', { med: 4 }, [34, 70]],
  ['Pielęgniarz', 'Pielęgniarka', { med: 3 }, [25, 63]],
  ['Ratownik medyczny', 'Ratowniczka medyczna', { med: 2, obrona: 1 }, [23, 55]],
  ['Ogrodnik', 'Ogrodniczka', { uprawa: 3 }, [30, 75]],
  ['Działkowiec', 'Działkowiczka', { uprawa: 2, bud: 1 }, [50, 80]],
  ['Nauczyciel fizyki', 'Nauczycielka fizyki', { elek: 2, it: 1 }, [30, 66]],
  ['Programista', 'Programistka', { it: 3 }, [23, 50]],
  ['Prompt engineer', 'Prompt engineerka', { it: 1 }, [22, 38]],
  ['Mechanik samochodowy', 'Mechaniczka samochodowa', { bud: 2, elek: 1 }, [24, 62]],
  ['Kucharz', 'Kucharka', { uprawa: 1 }, [22, 64]],
  ['Ochroniarz z galerii', 'Ochroniarka z galerii', { obrona: 3 }, [24, 58]],
  ['Kurier', 'Kurierka', { obrona: 1 }, [20, 45]],
  ['Doradca ds. ESG', 'Doradczyni ds. ESG', {}, [27, 45]],
  ['Influencer survivalowy', 'Influencerka survivalowa', { uprawa: 1, obrona: 1 }, [20, 35]],
  ['Student biotechnologii', 'Studentka biotechnologii', { uprawa: 2, med: 1 }, [20, 26]],
  ['Monter klimatyzacji', 'Monterka klimatyzacji', { cieplo: 2, elek: 1 }, [24, 58]],
  ['Informatyk z urzędu', 'Informatyczka z urzędu', { it: 2 }, [28, 60]],
  ['Murarz', 'Murarka', { bud: 3 }, [25, 63]],
  ['Weterynarz', 'Weterynarka', { med: 2, uprawa: 1 }, [28, 66]],
];
export const TRAITS: Record<string, TraitDef> = {
  pracowity: { name: 'Pracowity', desc: 'Jako kierownik daje +10% do pracy.' },
  leniwy: { name: 'Leniwy', desc: 'Jako kierownik −10%, ale zawsze wie, gdzie jest kawa.' },
  lubiany: { name: 'Lubiany', desc: 'Zaufanie +0,3 dziennie.' },
  klotliwy: { name: 'Kłótliwy', desc: 'Wkurzenie +0,3 dziennie.' },
  odwazny: { name: 'Odważny', desc: 'Ekipa z nim rzadziej obrywa.' },
  tchorz: { name: 'Tchórzliwy', desc: 'Ekipa z nim częściej obrywa.' },
  optymista: { name: 'Optymista', desc: 'Wkurzenie −0,2 dziennie.' },
  hipochondryk: { name: 'Hipochondryk', desc: 'Zjada Leki 0,1 dziennie, nawet zdrowy.' },
  gadula: { name: 'Gaduła', desc: 'Na zebraniach mówi najdłużej. Nic poza tym.' },
  excel: { name: 'Mistrz Excela', desc: 'Jako kierownik świetlicy badania +5%. Raporty piękne.' },
  twardy: { name: 'Twardy', desc: 'Rzadziej choruje i rzadziej ginie na wyprawach.' },
};
export const TRAIT_PAIRS: [string, string][] = [
  ['pracowity', 'leniwy'],
  ['odwazny', 'tchorz'],
  ['optymista', 'klotliwy'],
];

export const ADS: readonly string[] = [
  'Zamienię hulajnogę elektryczną na słoik ogórków.',
  'Kupię baterie AA. Płacę kaszą albo kredytami węglowymi.',
  'Oddam inteligentny dzwonek do drzwi. Nadal pyta o hasło do Wi-Fi.',
  'Korepetycje z obsługi siekiery. Dawniej coach mindfulness.',
  'Sprzedam NFT z kotem albo oddam za naręcze drewna.',
  'Szukam ładowarki do samochodu, który stoi od 2048 roku.',
  'Wymienię podręcznik do Pythona na rolkę papieru toaletowego.',
  'Dron dostawczy krąży nad blokiem od trzech lat. Kto złapie, ten ma.',
  'Lekcje gitary przy ognisku. Repertuar: wszystko, co pamiętamy.',
  'Zaginął rudy kot. Reaguje na imię Algorytm.',
  'Lodówka z abonamentem, zamknięta, pełna. Hasło mile widziane.',
  'Były doradca ds. ESG szuka pracy. Umie liczyć ślad węglowy ogniska.',
  'Przyjmę każdą ilość słoików. Zwrotne.',
  'Sprzedam pompę ciepła na subskrypcję. Subskrypcja wygasła.',
];

/* Celowo inne niż w 0.3: od 17.10.2026 upadek przez bakterię od miedzi (docs/GDD.md, sekcja Lore). */
export const LORE: string =
  'Rok 2051. Wszystko zaczęło się sypać, kiedy prezydent Stanów Zjednoczonych zaczął dziesiątą kadencję, a dolar przeszedł na abonament. Potem ekologiczny startup poprosił swój model AI o bakterię, która odzyska miedź z elektrośmieci. Model się postarał. Szczep uciekł z laboratorium i zjadł kable w ścianach, pod ziemią i na słupach. Razem z siecią padła chmura: lodówki, samochody i domofony do dziś czekają na aktualizację. Unia zakazała palenia drewnem dzień przed tym, jak zgasł prąd. Influencerzy przeszli na survival, a doradcy ds. ESG na kaszę. Przetrwało to, co szczelne, i jedna instytucja: spółdzielnia mieszkaniowa. Zarząd to teraz wy.';

/* Z js/sim.js (0.3): opuszczone mieszkania jako cel przeszukania */
POICAT.mieszkania = {
  name: 'Opuszczone mieszkania',
  risk: 0.1,
  loot: { jedzenie: [1, 3], opal: [1, 3], leki: [0, 1], zlom: [0, 2] },
  book: 0.12,
  bdom: ['bud', 'cieplo', 'elek', 'med', 'uprawa', 'it'],
};
