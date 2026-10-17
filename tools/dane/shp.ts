/* Czytnik shapefile'i bez zależności, dla granic statystycznych GUS (BREC 2021, EPSG:2180): geometria z .shp
   (tylko typ 5, Polygon), atrybuty z .dbf, kodowanie z .cpg. Pliki traktujemy jak dane z sieci: każdą długość
   sprawdzamy względem bufora, zanim po niej sięgniemy. Rekord i-ty w SHP odpowiada rekordowi i-temu w DBF.
   Do tego upraszczanie obrysów (Douglas–Peucker), żeby do gry szły małe kontury. */

const KOD_PLIKU = 9994;
const TYP_PUSTY = 0;
const TYP_WIELOKAT = 5;
const DLUGOSC_NAGLOWKA_SHP = 100;
const STALA_CZESC_WIELOKATA = 44; // typ, ramka (4 liczby), liczba części i punktów
const BAJT_USUNIETEGO = 0x2a;
const KONIEC_DESKRYPTOROW = 0x0d;

/** Wszystkie rekordy SHP typu Polygon: rekord → pierścienie → punkty `[x, y]` (x wschód, y północ, metry
    PUWG 1992 w BREC), kształt pusty jako `[]`. Kolejność jak w pliku, więc `wielokaty(shp)[i]` pasuje do
    `rekordyDbf(dbf)[i]`. Zewnętrzne pierścienie biegną zgodnie z ruchem wskazówek zegara, dziury przeciwnie,
    ale tu tego nie rozróżniamy. Cały BREC 2021 (16 mln punktów) mieści się w pamięci i czyta się w sekundę. */
export function wielokaty(shp: Buffer): number[][][][] {
  if (shp.length < DLUGOSC_NAGLOWKA_SHP) throw new Error('SHP: plik krótszy niż nagłówek (100 bajtów)');
  if (shp.readInt32BE(0) !== KOD_PLIKU) throw new Error('SHP: zły kod pliku, to nie shapefile');
  const typ = shp.readInt32LE(32);
  if (typ !== TYP_WIELOKAT) throw new Error(`SHP: typ kształtu ${typ}, obsługiwany jest tylko 5 (Polygon)`);
  const koniec = shp.readInt32BE(24) * 2;
  if (koniec < DLUGOSC_NAGLOWKA_SHP || koniec > shp.length) {
    throw new Error(`SHP: nagłówek mówi o ${koniec} bajtach, a plik ma ${shp.length} (obcięty albo uszkodzony)`);
  }
  const wynik: number[][][][] = [];
  let poz = DLUGOSC_NAGLOWKA_SHP;
  let numer = 0;
  while (poz < koniec) {
    numer++;
    if (poz + 8 > koniec) throw new Error(`SHP: rekord ${numer} ma obcięty nagłówek`);
    const dl = shp.readInt32BE(poz + 4) * 2;
    const start = poz + 8;
    if (dl < 4 || start + dl > koniec) throw new Error(`SHP: rekord ${numer} wychodzi poza plik`);
    poz = start + dl;
    const t = shp.readInt32LE(start);
    if (t === TYP_PUSTY) {
      wynik.push([]);
      continue;
    }
    if (t !== TYP_WIELOKAT) throw new Error(`SHP: rekord ${numer} ma typ ${t}, oczekiwano 5 (Polygon)`);
    if (dl < STALA_CZESC_WIELOKATA) throw new Error(`SHP: rekord ${numer} jest krótszy niż nagłówek wielokąta`);
    const czesci = shp.readInt32LE(start + 36);
    const punkty = shp.readInt32LE(start + 40);
    if (czesci < 0 || punkty < 0 || STALA_CZESC_WIELOKATA + 4 * czesci + 16 * punkty > dl) {
      throw new Error(`SHP: rekord ${numer} ma ${czesci} części i ${punkty} punktów, a tyle się w nim nie mieści`);
    }
    const poczatki = start + STALA_CZESC_WIELOKATA;
    const wspolrzedne = poczatki + 4 * czesci;
    const pierscienie: number[][][] = [];
    for (let c = 0; c < czesci; c++) {
      const od = shp.readInt32LE(poczatki + 4 * c);
      const sk = c + 1 < czesci ? shp.readInt32LE(poczatki + 4 * (c + 1)) : punkty;
      if (od < 0 || sk < od || sk > punkty) throw new Error(`SHP: rekord ${numer} ma zły podział na pierścienie`);
      const pierscien: number[][] = new Array(sk - od);
      for (let i = od; i < sk; i++) {
        const o = wspolrzedne + 16 * i;
        pierscien[i - od] = [shp.readDoubleLE(o), shp.readDoubleLE(o + 8)];
      }
      pierscienie.push(pierscien);
    }
    wynik.push(pierscienie);
  }
  return wynik;
}

/** Nazwa kodowania dla `TextDecoder` z zawartości pliku .cpg (brak albo pusty plik: UTF-8). Nazwy, których
    nie zna, zwraca bez zmian, a `rekordyDbf` zgłosi je jako nieznane kodowanie. */
export function kodowanieZCpg(cpg: Buffer | undefined): string {
  const nazwa = (cpg?.toString('latin1') ?? '').trim().toLowerCase();
  if (!nazwa || /^utf-?8$/.test(nazwa)) return 'utf-8';
  const windows = /^(?:cp|windows-?)?(125\d)$/.exec(nazwa);
  if (windows) return `windows-${windows[1]}`;
  const iso = /^(?:iso[-_]?)?8859[-_]?(\d+)$/.exec(nazwa);
  if (iso) return `iso-8859-${iso[1]}`;
  return nazwa;
}

/** Wartość pola bez spacji i znaków NUL na brzegach (tak dopełnia się pola stałej długości). */
function przytnij(s: string): string {
  return s.replace(/^[\s\0]+|[\s\0]+$/g, '');
}

/** Rekordy DBF (wersja 3, jak w shapefile'ach Esri) jako obiekty nazwa pola → tekst przycięty ze spacji. Liczby
    zostają tekstem, żeby kody z zerami z przodu (rejon „002193”) się nie zgubiły. Rekord oznaczony jako usunięty
    to błąd, bo bez niego numeracja względem pliku SHP przestałaby się zgadzać. */
export function rekordyDbf(dbf: Buffer, kodowanie = 'utf-8'): Record<string, string>[] {
  let dekoder: TextDecoder;
  try {
    dekoder = new TextDecoder(kodowanie);
  } catch {
    throw new Error(`DBF: nieznane kodowanie „${kodowanie}”`);
  }
  if (dbf.length < 33) throw new Error('DBF: plik krótszy niż nagłówek');
  const liczba = dbf.readUInt32LE(4);
  const dlNaglowka = dbf.readUInt16LE(8);
  const dlRekordu = dbf.readUInt16LE(10);
  if (dlNaglowka < 33 || dlNaglowka > dbf.length) throw new Error('DBF: zła długość nagłówka');
  const pola: { nazwa: string; dl: number }[] = [];
  let suma = 1; // bajt znacznika usunięcia
  for (let p = 32; p + 32 <= dlNaglowka && dbf[p] !== KONIEC_DESKRYPTOROW; p += 32) {
    let koniecNazwy = p;
    while (koniecNazwy < p + 11 && dbf[koniecNazwy] !== 0) koniecNazwy++;
    const dl = dbf[p + 16];
    pola.push({ nazwa: dekoder.decode(dbf.subarray(p, koniecNazwy)), dl });
    suma += dl;
  }
  if (suma > dlRekordu) throw new Error(`DBF: pola zajmują ${suma} bajtów, a rekord ma ${dlRekordu}`);
  if (dlNaglowka + liczba * dlRekordu > dbf.length) {
    throw new Error(`DBF: nagłówek mówi o ${liczba} rekordach, a plik jest za krótki (obcięty albo uszkodzony)`);
  }
  const wynik: Record<string, string>[] = new Array(liczba);
  for (let i = 0; i < liczba; i++) {
    let o = dlNaglowka + i * dlRekordu;
    if (dbf[o] === BAJT_USUNIETEGO) throw new Error(`DBF: rekord ${i + 1} jest oznaczony jako usunięty`);
    o++;
    wynik[i] = Object.fromEntries(
      pola.map((f) => {
        const wartosc = przytnij(dekoder.decode(dbf.subarray(o, o + f.dl)));
        o += f.dl;
        return [f.nazwa, wartosc];
      }),
    );
  }
  return wynik;
}

/** Kwadrat odległości punktu od odcinka a–b (od punktu a, gdy odcinek ma zerową długość). */
function odlegloscKw(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dl2 = dx * dx + dy * dy;
  const t = dl2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dl2));
  const ex = p[0] - (a[0] + t * dx);
  const ey = p[1] - (a[1] + t * dy);
  return ex * ex + ey * ey;
}

/** Upraszcza pierścień algorytmem Douglasa–Peuckera: żaden usunięty punkt nie leży dalej niż `tolerancjaM` od
    wyniku. Współrzędne muszą być metryczne (PUWG 1992, nie stopnie). W pierścieniu zamkniętym odcinek od
    pierwszego punktu do ostatniego ma zerową długość, więc pierwszy krok wybiera punkt najdalszy od początku
    i pierścień zostaje zamknięty oraz zaczyna się w tym samym miejscu. Wynik składa się z tych samych punktów
    co wejście. Gdy po uproszczeniu zostałyby mniej niż 4 punkty (kontur mniejszy od tolerancji), zwraca
    wejście bez zmian. */
export function uprosc(pierscien: [number, number][], tolerancjaM: number): [number, number][] {
  if (!(tolerancjaM >= 0)) throw new RangeError(`uprosc: tolerancja musi być liczbą nieujemną, jest ${tolerancjaM}`);
  const n = pierscien.length;
  if (n < 4) return pierscien.slice();
  const tol2 = tolerancjaM * tolerancjaM;
  const zostaw = new Uint8Array(n);
  zostaw[0] = zostaw[n - 1] = 1;
  const stos = [0, n - 1];
  while (stos.length > 0) {
    const b = stos.pop()!;
    const a = stos.pop()!;
    if (b - a < 2) continue;
    let maks = -1;
    let gdzie = -1;
    for (let i = a + 1; i < b; i++) {
      const d = odlegloscKw(pierscien[i], pierscien[a], pierscien[b]);
      if (d > maks) {
        maks = d;
        gdzie = i;
      }
    }
    if (maks > tol2) {
      zostaw[gdzie] = 1;
      stos.push(a, gdzie, gdzie, b);
    }
  }
  const wynik = pierscien.filter((_, i) => zostaw[i] === 1);
  return wynik.length < 4 ? pierscien.slice() : wynik;
}
