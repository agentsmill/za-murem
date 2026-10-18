/* Historie osób z własnej drużyny zarządu (docs/superpowers/specs/2026-10-18-druzyna-design.md, sekcja „Historia”):
   dwa albo trzy zdania z gotowych kawałków. Pierwsze mówi, skąd osoba ma fach (zawód i pokolenie), dalej jedna rzecz
   z cechy i jeden szczegół satyryczny (technika, która stoi obok i nie działa, abonamenty, ESG). Historia jest tylko
   dla klimatu: idzie na kartę osoby, symulacji nie rusza.

   Pokolenia według wieku w 2051 roku, od roku zero (2026) i Wielkiego Wylogowania (2034, kiedy w kilka tygodni zgasły
   centra danych i padła chmura; docs/GDD.md, sekcja Lore):
   - młodzi, czyli dzieci Wylogowania, do 35 lat (urodzeni od 2016): w 2034 mieli najwyżej 18 lat, Wylogowanie znają
     najwyżej z dzieciństwa, fach mają z terminu u starszego sąsiada albo z książek z piwnicy;
   - środek, czyli pokolenie asystenta, 36–55 lat (urodzeni 1996–2015): szkoła, studia albo pierwsza praca przypadły na
     dekadę, w której wszystko robił za ludzi asystent AI, i Wylogowanie złapało ich w połowie drogi;
   - starsi, czyli pamiętający, od 56 lat (urodzeni do 1995): w roku zero mieli już zawód i robili go bez asystenta.

   Zapis kawałków jak w szablonach mieszkańców z adresu (src/mieszkancy/szablony.ts), żeby dało się je tam przenieść:
   `{g:męska|żeńska}` to forma według płci osoby, np. „nauczył{g:|a} się”. Zdania nie zawierają imienia (karta pokazuje
   je nad historią, a imię wpisane przez gracza nie ma odmiany), bez pauz jako znaków przestankowych, bez prawdziwych
   nazwisk, firm i miejsc. Tekst do przeczytania przez Mateusza; każde zdanie można zmienić bez ruszania logiki. */

import { pick, type Rng } from '../core/rng.ts';
import { g } from './people.ts';

export type Pokolenie = 'mlodzi' | 'srodek' | 'starsi';

/** pokolenie według wieku w 2051 roku (nagłówek pliku) */
export const pokolenie = (age: number): Pokolenie => (age <= 35 ? 'mlodzi' : age <= 55 ? 'srodek' : 'starsi');

/** Skąd osoba ma fach: zawód (męska nazwa z PROFS) i pokolenie. Każdy zawód ma zdania dla tych pokoleń, w które
    wchodzą jego widełki wieku z PROFS (emerytowany inżynier tylko starsi, student tylko młodzi). */
export const FACH: Readonly<Record<string, Partial<Record<Pokolenie, readonly string[]>>>> = {
  'Emerytowany inżynier': {
    starsi: [
      'Projektował{g:|a} kotłownie jeszcze przed asystentami AI i do dziś liczy na kartce, więc całe osiedle przychodzi do {g:niego|niej} z rysunkiem na odwrocie kalendarza.',
      'Emeryturę wypłaca {g:mu|jej} spółdzielnia w kaszy, więc pracuje dalej, bo jako jedyn{g:y|a} na osiedlu policzy strop bez programu.',
      'W dniu Wielkiego Wylogowania jako jedyn{g:y|a} w biurze {g:wiedział|wiedziała}, gdzie leży suwak logarytmiczny, i od tamtej pory nosi go przy sobie.',
    ],
  },
  Hydraulik: {
    mlodzi: [
      'Fachu {g:nauczył|nauczyła} się u starego hydraulika z sąsiedniej klatki, który powtarzał, że koza to też kaloryfer, tylko bez aplikacji.',
    ],
    srodek: [
      'W szkole zawodowej {g:uczył|uczyła} się w goglach do wirtualnej rzeczywistości, a prawdziwy klucz do rur {g:wziął|wzięła} do ręki dopiero przy pierwszym zamarzniętym pionie.',
    ],
    starsi: [
      'Rury kręcił{g:|a} jeszcze w dawnych czasach, więc dziś nikt na osiedlu nie śmie {g:go|jej} poganiać, nawet kiedy pion cieknie trzeci dzień.',
    ],
  },
  Elektryk: {
    mlodzi: [
      'Fach ma po starym elektryku z osiedla, który na odchodnym zostawił {g:mu|jej} lakier, taśmę i zeszyt z rysunkami instalacji w każdej klatce.',
    ],
    srodek: [
      'Przed upadkiem montował{g:|a} inteligentne gniazdka, a dziś łata krótkie odcinki kabla, które bakteria zjada od nowa, i nosi lakier i taśmę jak różaniec.',
    ],
    starsi: [
      'W roku zero naprawiał{g:|a} po trzy zwarcia dziennie i zwalał{g:|a} je na złodziei złomu, czego do dziś się wstydzi.',
    ],
  },
  'Lekarz rodzinny': {
    mlodzi: [
      'Medycynę {g:skończył|skończyła} na uczelni przeniesionej do piwnicy, z podręczników bez połowy kartek, i leczy tym, co akurat jest pod ręką.',
    ],
    srodek: [
      'Na studiach {g:miał|miała} asystenta, który stawiał diagnozy szybciej niż profesor, a od Wielkiego Wylogowania stawia je {g:sam|sama}, przy świeczce i z podręcznikiem na kolanach.',
    ],
    starsi: ['Leczy od trzydziestu lat i wciąż mówi „wypiszę e-receptę”, a nikt na osiedlu się już nie śmieje.'],
  },
  Pielęgniarz: {
    mlodzi: [
      'Fachu {g:nauczył|nauczyła} się na dyżurach w szkole zamienionej na szpital, gdzie całą aparaturą był termometr i spokojny głos.',
    ],
    srodek: [
      'Robi to samo co przed upadkiem, tylko bez aparatury, więc tętno liczy na zegarku, który trzeba nakręcać.',
    ],
    starsi: [
      'Przepracował{g:|a} trzydzieści lat na nocnych dyżurach i twierdzi, że upadek cywilizacji to po prostu bardzo długi dyżur.',
    ],
  },
  'Ratownik medyczny': {
    mlodzi: [
      'Ratownictwa {g:nauczył|nauczyła} się, kiedy karetki stały już na abonamencie, więc do chorych biega, a nosze robi z drzwi od szafy.',
    ],
    srodek: [
      'Jeździł{g:|a} karetką, dopóki karetka chciała jeździć, a od kiedy stoi, biega z torbą przez całe osiedle.',
    ],
  },
  Ogrodnik: {
    mlodzi: [
      'Ogrodnictwa {g:nauczył|nauczyła} się na trawniku przed blokiem, który przekopał{g:|a}, zanim ktokolwiek {g:mu|jej} pozwolił.',
    ],
    srodek: [
      'Zaczynał{g:|a} od aplikacji, która rozpoznawała chwasty ze zdjęcia, a skończył{g:|a} na rozpoznawaniu ich po smaku.',
    ],
    starsi: [
      'Przez trzydzieści lat {g:strzygł|strzygła} trawniki przed biurowcami, a teraz sadzi na nich ziemniaki i nikt już nie dzwoni ze skargą.',
    ],
  },
  Działkowiec: {
    srodek: [
      'Działkę {g:dostał|dostała} po dziadku i długo się jej wstydził{g:|a}, aż ogródki działkowe okazały się jedynym miejscem w mieście, które działało jak trzeba.',
    ],
    starsi: [
      'Przez pół życia {g:słyszał|słyszała}, że działka to przeżytek, a dziś cała spółdzielnia przychodzi do {g:niego|niej} po sadzonki i radę.',
    ],
  },
  'Nauczyciel fizyki': {
    mlodzi: [
      'Fizyki {g:uczył|uczyła} się z podręcznika znalezionego w piwnicy szkoły, a teraz {g:sam|sama} uczy dzieci na klatce schodowej, jak działa prądnica.',
    ],
    srodek: [
      'W szkole odrabiał{g:|a} fizykę z asystentem w telefonie, a od Wielkiego Wylogowania {g:sam|sama} jest takim asystentem, tylko na klatce schodowej i za kaszę.',
    ],
    starsi: [
      'Przez trzydzieści lat nikt {g:go|jej} nie słuchał na lekcjach o prądnicy, a dziś całe osiedle przychodzi na nie z własnym krzesłem.',
    ],
  },
  Programista: {
    mlodzi: [
      '{g:Programistą|Programistką} nazywają {g:go|ją}, bo na papierze rozpisuje, jak uruchomić sterownik w kotłowni, i czasem nawet się udaje.',
    ],
    srodek: [
      'Od pierwszej pracy pisał{g:|a} kod razem z modelem w chmurze, a po Wielkim Wylogowaniu przez tydzień nie {g:wiedział|wiedziała}, od której strony zacząć.',
    ],
  },
  'Prompt engineer': {
    mlodzi: [
      'Na osiedlu uchodzi za zaklinacz{g:a|kę}: godzinami przemawia do martwej lodówki na abonament, a raz na jakiś czas lodówka się otwiera.',
      'W dniu Wielkiego Wylogowania {g:był|była} dzieckiem i {g:zapamiętał|zapamiętała} tylko, że dorośli płakali nad telefonami, więc z ocalałym modelem z banku rozmawia tak grzecznie, jak z prezesem spółdzielni.',
    ],
    srodek: [
      'Jako dziecko pisał{g:|a} prompty szybciej niż wypracowania i do dziś zaczyna każdą prośbę od słów „działaj jako”.',
      'Od nastolatka pisał{g:|a} prompty za pieniądze, aż w 2034 roku {g:dostał|dostała} od modelu odpowiedź „Przepraszam, coś poszło nie tak, spróbuj ponownie później” i do dziś czeka, aż będzie później.',
    ],
  },
  'Mechanik samochodowy': {
    mlodzi: [
      'Samochody zna z wraków, w których bawił{g:|a} się jako dziecko, więc naprawia to, co jeszcze jeździ: rowery, wózki i taczki.',
    ],
    srodek: [
      '{g:Uczył|Uczyła} się na mechanika, kiedy auta aktualizowały się same przez noc, a dziś naprawia rowery i agregaty, bo auta stoją na abonamencie.',
    ],
    starsi: [
      'Naprawiał{g:|a} samochody, dopóki dało się do nich wsiąść bez aplikacji, a dziś składa agregaty z części, które kiedyś nazywał{g:|a} złomem.',
    ],
  },
  Kucharz: {
    mlodzi: [
      'Gotować {g:nauczył|nauczyła} się na ognisku, z tego, co akurat było, i do dziś nie rozumie, po co komu była kuchenka z ekranem.',
    ],
    srodek: [
      'W dawnych czasach {g:gotował|gotowała} z filmików, w których wszystko trwało trzydzieści sekund, a dziś gotuje z niczego, na ogniu i bez pośpiechu.',
    ],
    starsi: [
      'Przez dwadzieścia lat {g:prowadził|prowadziła} kuchnię w restauracji z ocenami w aplikacji, a dziś gotuje na kozie i twierdzi, że krytycy są tu surowsi.',
    ],
  },
  'Ochroniarz z galerii': {
    mlodzi: [
      'Pilnuje galerii, w której za {g:jego|jej} życia nigdy nie było sklepów, tylko targ i skład złomu, i traktuje to bardzo poważnie.',
    ],
    srodek: [
      'Zaczynał{g:|a} od pilnowania bramek przy wyjściu z galerii, a skończył{g:|a} na pilnowaniu, żeby nikt nie wyniósł reszty galerii.',
    ],
    starsi: [
      'Przez dwadzieścia lat stał{g:|a} przy bramkach w galerii i do dziś na jedno spojrzenie wie, kto wynosi coś pod kurtką.',
    ],
  },
  Kurier: {
    mlodzi: [
      'Biega z listami między osiedlami, bo łączności nie ma, a automaty paczkowe stoją pełne i zamknięte jak sejfy.',
    ],
    srodek: [
      'Rozwoził{g:|a} paczki z aplikacją, która liczyła {g:mu|jej} sekundy na każdym piętrze, a dziś biega z listami i nikt {g:go|jej} nie ocenia w gwiazdkach.',
    ],
  },
  'Doradca ds. ESG': {
    mlodzi: [
      'Segregator z napisem ESG {g:dostał|dostała} w spadku po ciotce i od tamtej pory liczy ślad węglowy każdego ogniska na osiedlu.',
    ],
    srodek: [
      'Przed upadkiem pisał{g:|a} raporty o neutralności klimatycznej, a dziś prowadzi rejestr opału i co kwartał oddaje raport, którego nikt nie czyta.',
    ],
  },
  'Influencer survivalowy': {
    mlodzi: [
      'Opowiada przy ognisku o przetrwaniu, jakby {g:nagrywał|nagrywała} odcinek, a na koniec zawsze prosi, żeby zostawić suba, chociaż nikt już nie wie, co to znaczy.',
      'Ma kanał, którego nikt nie ogląda, bo nie ma na czym, więc odcinki opowiada na żywo przy ognisku, z przerwami na reklamy.',
    ],
  },
  'Student biotechnologii': {
    mlodzi: [
      'Studiuje w piwnicznej pracowni u lekarki i robi posiewy z kabli, żeby wiedzieć, gdzie na osiedlu siedzi bakteria.',
      'Bakterię od miedzi hoduje na szalkach z kisielu i jako jedyn{g:y|a} na osiedlu mówi o niej z czułością.',
    ],
  },
  'Monter klimatyzacji': {
    mlodzi: [
      'Pompy ciepła zna tylko jako złom z wygasłą subskrypcją, więc stawia kozy i kominy, a na lato obiecuje wiatrak na korbkę.',
    ],
    srodek: [
      'Zaczynał{g:|a} od pomp ciepła na subskrypcję, a od kiedy subskrypcje wygasły, stawia kozy i wyprowadza kominy przez okna.',
    ],
    starsi: [
      'Przez trzydzieści lat {g:montował|montowała} klimatyzatory sterowane z telefonu, a dziś stawia kozy i mówi, że to ten sam fach, tylko uczciwszy.',
    ],
  },
  'Informatyk z urzędu': {
    mlodzi: [
      'Urząd wrócił do papieru, ale etat informatyka został, więc pilnuje szafy ze starymi drukami i restartuje to, co jeszcze świeci.',
    ],
    srodek: [
      'Przez lata {g:mówił|mówiła} urzędnikom, żeby wyłączyli i włączyli, a po Wielkim Wylogowaniu okazało się, że to działa też na ludzi.',
    ],
    starsi: [
      'Trzydzieści lat {g:resetował|resetowała} urzędowe komputery, a dziś wie, gdzie leżą stare druki i jak zrestartować to, co jeszcze zostało.',
    ],
  },
  Murarz: {
    mlodzi: [
      'Murować {g:nauczył|nauczyła} się na rozbiórkach i do dziś każdą cegłę z odzysku czyści z zaprawy, zanim jej użyje.',
    ],
    srodek: [
      'Kiedy {g:zaczynał|zaczynała}, ściany drukowało się z betonu, a cegłę {g:wziął|wzięła} do ręki dopiero wtedy, kiedy drukarki stanęły.',
    ],
    starsi: ['Muruje tak jak trzydzieści lat temu, tylko cegłę bierze z rozbiórki, a zaprawę kręci w starej wannie.'],
  },
  Weterynarz: {
    mlodzi: ['Leczy kozy, kury i psy, a kiedy lekarki nie ma, także ludzi, i mówi do nich tym samym spokojnym głosem.'],
    srodek: [
      'Studia {g:skończył|skończyła}, kiedy największym problemem w gabinecie były koty na diecie bezzbożowej, a dziś leczy kozy, kury i ludzi.',
    ],
    starsi: [
      'Przez trzydzieści lat {g:szczepił|szczepiła} psy z całego osiedla, a teraz szczepi, co się da, i w razie potrzeby zszywa także ludzi.',
    ],
  },
};

/** Jedna rzecz z cechy (klucze z TRAITS). */
export const Z_CECHY: Readonly<Record<string, readonly string[]>> = {
  pracowity: [
    'Wstaje przed wszystkimi i pierwsz{g:y|a} zauważa, że w nocy nikt nie dołożył do kozy.',
    'Nie umie usiedzieć bez roboty, więc w wolne dni przebiera gwoździe według rozmiaru.',
  ],
  leniwy: [
    'Ma talent do znikania, kiedy trzeba nosić drewno, za to zawsze wie, gdzie jest ostatnia paczka kawy.',
    'Twierdzi, że oszczędza siły na zimę, i robi to konsekwentnie od lipca.',
  ],
  lubiany: [
    'Zna z imienia wszystkich na osiedlu, łącznie z kotami, i nikt nie umie się na {g:niego|nią} długo gniewać.',
    'Na zebraniach ludzie przesuwają się na ławce, żeby {g:usiadł|usiadła} obok nich.',
  ],
  klotliwy: [
    'Na każdym zebraniu ma zdanie odrębne, także wtedy, kiedy {g:sam|sama} {g:zgłosił|zgłosiła} wniosek.',
    'Pokłócił{g:|a} się już z połową osiedla, a z drugą połową jeszcze nie {g:zdążył|zdążyła}.',
  ],
  odwazny: [
    'Pierwsz{g:y|a} schodzi do ciemnej piwnicy i ostatni{g:|a} z niej wychodzi.',
    'Kiedy za garażami coś hałasuje, nie pyta, co to, tylko bierze latarkę.',
  ],
  tchorz: [
    'Boi się ciemności, piwnic i gołębi, ale nikt lepiej nie słyszy, że ktoś majstruje przy bramie.',
    'Na wyprawy chodzi niechętnie i zawsze w środku grupy, bo tam podobno najmniej wieje.',
  ],
  optymista: [
    'Każdą zimę zapowiada jako ostatnią trudną i co roku mówi to z tym samym przekonaniem.',
    'Uważa, że skoro bakteria zjadła kable, to przynajmniej nikt już nie dzwoni z ofertami.',
  ],
  hipochondryk: [
    'W każdym kaszlu słyszy coś groźnego i zna na pamięć ulotki wszystkich leków ze spółdzielczej apteczki.',
    'Codziennie mierzy sobie temperaturę jedynym termometrem na osiedlu i zapisuje wynik w zeszycie.',
  ],
  gadula: [
    'Na zebraniach mówi najdłużej i zwykle o czymś innym niż porządek obrad.',
    'Każdą opowieść zaczyna od roku zero, nawet jeśli chodzi o zgubioną rękawiczkę.',
  ],
  excel: [
    'Zapasy spółdzielni ma rozpisane w zeszycie w kratkę, w tabelach tak równych, że zarząd podpisuje je bez czytania.',
    'Sumy z całych kolumn liczy w pamięci i tęskni tylko za jednym: za kolorowaniem komórek.',
  ],
  twardy: [
    'Zimą chodzi w samym swetrze i nikt nie pamięta, kiedy ostatnio {g:był chory|była chora}.',
    'Raz {g:spadł|spadła} z dachu garażu, {g:otrzepał|otrzepała} się i {g:poszedł|poszła} dokończyć robotę.',
  ],
};

/** Szczegół satyryczny w tonie lore: technika, która stoi obok i nie działa, abonamenty, ESG. Bez założeń o wieku,
    bo pasuje do każdego pokolenia. */
export const SATYRA: readonly string[] = [
  'W szufladzie trzyma telefon, który od lat czeka na aktualizację, i raz w tygodniu sprawdza, czy już.',
  'Ma certyfikat neutralności klimatycznej oprawiony w ramkę i zimą wiesza go najbliżej kozy.',
  'Zbiera ładowarki do wszystkiego, bo jest pewn{g:y|a}, że prąd wróci, a wtedy wszyscy przyjdą do {g:niego|niej}.',
  'Domofon w {g:jego|jej} klatce do dziś prosi o zalogowanie, więc wszyscy wchodzą przez okienko od piwnicy.',
  'Hasło do domowego Wi-Fi pamięta lepiej niż imiona sąsiadów i czasem powtarza je przez sen.',
  'Na balkonie ma panel słoneczny z dotacji, który przetrwał, bo nikt go nigdy nie podłączył.',
  'Nosi opaskę do liczenia kroków, która od lat pokazuje zero, i mówi, że to bardzo motywuje.',
  'Kredyty węglowe trzyma w puszce po herbacie i wierzy, że kiedyś znowu będą coś warte.',
  'W piwnicy trzyma hulajnogę elektryczną i raz w roku ją przeprasza.',
  'Ma w domu robota sprzątającego, który od lat stoi w kącie i służy kotu za podest.',
  'Samochód pod blokiem czeka na aktualizację, a {g:on|ona} razem z nim, bo w bagażniku zostały {g:jego|jej} kalosze.',
  'Pod łóżkiem trzyma pudło kabli od urządzeń, których już nie ma, i pilnuje go jak sejfu, bo w środku jest miedź.',
  'Każdy dzień zaczyna od sprawdzenia, czy telefon nie złapał zasięgu, i każdy dzień kończy tak samo.',
  'Wierzy, że prezydent Stanów Zjednoczonych w dziesiątej kadencji wszystko naprawi, tylko jeszcze nie zdążył.',
  'W szafie ma bluzę ekologicznego startupu od recyklingu i nosi ją na lewą stronę, żeby nikt nie zobaczył logo.',
  'Telewizor ma tak płaski, że zimą służy za deskę do krojenia.',
  'Ekspres do kawy z aplikacją stoi u {g:niego|niej} na honorowym miejscu, a herbatę z pokrzywy parzy obok, przez sitko.',
  'W portfelu nosi kartę płatniczą i czasem przykłada ją do drzwi, na szczęście.',
  'Na lodówce wisi kartka z ostatnią odpowiedzią asystenta sprzed Wielkiego Wylogowania, „Spróbuj ponownie później”, i co jakiś czas próbuje.',
];

/** Uzupełnia formy według płci: `{g:męska|żeńska}`. */
export const wypelnijPlec = (tekst: string, f: boolean): string =>
  tekst.replace(/\{g:([^|{}]*)\|([^|{}]*)\}/g, (_, m: string, k: string) => g({ f }, m, k));

/** Dane osoby, z których powstaje historia. */
export interface DoHistorii {
  f: boolean;
  age: number;
  /** zawód: męska nazwa z PROFS */
  prof: string;
  traits: readonly string[];
}

/** najdłuższa historia (pole tekstowe w panelu ma tyle samo) */
export const HISTORIA_MAX = 400;

/** Zdania o fachu dla osoby; gdy zawodu nie ma w tabeli albo nie ma zdań dla pokolenia, zdania z innych pokoleń. */
export function zdaniaFachu(prof: string, age: number): readonly string[] {
  const t = FACH[prof] ?? {};
  const own = t[pokolenie(age)];
  if (own?.length) return own;
  return Object.values(t).flatMap((x) => x ?? []);
}

/** Historia osoby: zdanie o fachu, potem jedno albo dwa z cechy i satyry, w losowej kolejności. Dwa albo trzy zdania,
    razem najwyżej HISTORIA_MAX znaków. Ten sam generator (to samo ziarno) i te same dane dają tę samą historię. */
export function losujHistorie(rnd: Rng, o: DoHistorii): string {
  const fach = zdaniaFachu(o.prof, o.age);
  const out: string[] = [];
  if (fach.length) out.push(pick(fach, rnd));
  const traits = o.traits.filter((t) => Z_CECHY[t]?.length);
  const trait = traits.length ? pick(Z_CECHY[pick(traits, rnd)], rnd) : null;
  const satire = pick(SATYRA, rnd);
  const rest = trait ? [trait, satire] : [satire];
  // dwa zdania albo trzy, pół na pół; przy dwóch odpada cecha albo satyra, przy trzech kolejność jest losowa
  if (rest.length === 2) {
    const r = rnd();
    if (r < 0.5) rest.splice(r < 0.25 ? 0 : 1, 1);
    else if (r >= 0.75) rest.reverse();
  }
  out.push(...rest);
  let text = out.map((s) => wypelnijPlec(s, o.f)).join(' ');
  while (text.length > HISTORIA_MAX && out.length > 2) {
    out.pop();
    text = out.map((s) => wypelnijPlec(s, o.f)).join(' ');
  }
  return text.slice(0, HISTORIA_MAX);
}
