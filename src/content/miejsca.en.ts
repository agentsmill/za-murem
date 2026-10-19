/* Angielskie nazwy kategorii miejsc (mapa miasta i wyprawy, docs/superpowers/specs/2026-10-18-mapa-miasta-design.md).
   Obok POICAT z 0.3 (src/content/data.ts zostaje bajt w bajt, pilnuje go test zgodności): jedna nazwa na klucz POICAT,
   bez `mieszkania`, które nie jest miejscem z OSM, tylko celem z 0.3. Angielski brytyjski, słowa ze słowniczka
   docs/SLOWNICZEK-EN.md (the clinic, the pharmacy, the garages, warehouse dla hali jako budynku). Polską nazwę bierze
   `nazwaKategorii` z POICAT[kat].name, tu jest tylko druga strona. */

export const KAT_EN: Record<string, string> = {
  spozywczy: 'Food shop',
  apteka: 'Pharmacy',
  przychodnia: 'Clinic',
  budowlany: 'DIY shop',
  elektronika: 'Electronics shop',
  szkola: 'School',
  biblioteka: 'Library',
  bank: 'Bank',
  stacja: 'Petrol station',
  ubrania: 'Clothes shop',
  urzad: 'Council office',
  kosciol: 'Church',
  sklep: 'Shop',
  ogrodnik: 'Garden centre',
  garaz: 'Garages',
  hala: 'Warehouse',
};
