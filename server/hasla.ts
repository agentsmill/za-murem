/* Hasła i tokeny sesji serwera gry (docs/superpowers/specs/2026-10-18-multiplayer-design.md, sekcja
   „Bezpieczeństwo”). Tylko node:crypto.

   Hasło: scrypt z losową solą 16 bajtów, zapis „scrypt$logN$r$p$sól$skrót” (base64url), więc parametry da się
   kiedyś podnieść bez psucia starych kont. Porównanie w stałym czasie. Dla nieistniejącego nicku serwer i tak liczy
   scrypt na atrapie (atrapaHasla), żeby czas odpowiedzi nie zdradzał, które nicki są zajęte.
   Token sesji: 32 losowe bajty (base64url) w ciasteczku; w bazie tylko jego SHA-256, więc wyciek bazy nie daje
   cudzych sesji. Kod powrotu drużyny (nowyKod): 12 losowych znaków z KOD_ALFABET w postaci XXXX-XXXX-XXXX, w bazie
   tylko SHA-256 jego postaci znormalizowanej (normalizujKod z src/net/protokol.ts). */

import { createHash, randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import { KOD_ALFABET, KOD_DLUGOSC } from '../src/net/protokol.ts';

/** parametry scrypt: N = 2^logN; 2^15 i r = 8 to 32 MiB pamięci na jedno liczenie */
export interface ParametryHasla {
  logN: number;
  r: number;
  p: number;
}

export const DOMYSLNE_HASLO: ParametryHasla = { logN: 15, r: 8, p: 1 };
const DLUGOSC = 32;
const SOL = 16;

function liczScrypt(haslo: string, sol: Buffer, par: ParametryHasla): Promise<Buffer> {
  const N = 2 ** par.logN;
  // zapas pamięci: scrypt potrzebuje około 128 · N · r bajtów
  const opcje: ScryptOptions = { N, r: par.r, p: par.p, maxmem: 256 * N * par.r + 1024 * 1024 };
  return new Promise((ok, zle) => {
    scrypt(haslo.normalize('NFC'), sol, DLUGOSC, opcje, (e, klucz) => (e ? zle(e) : ok(klucz)));
  });
}

/** skrót hasła do zapisania w bazie */
export async function skrotHasla(haslo: string, par: ParametryHasla = DOMYSLNE_HASLO): Promise<string> {
  const sol = randomBytes(SOL);
  const klucz = await liczScrypt(haslo, sol, par);
  return ['scrypt', par.logN, par.r, par.p, sol.toString('base64url'), klucz.toString('base64url')].join('$');
}

/** czy hasło pasuje do zapisanego skrótu; zły format skrótu to po prostu „nie” */
export async function sprawdzHaslo(haslo: string, zapis: string): Promise<boolean> {
  const [rodzaj, logN, r, p, sol, klucz] = zapis.split('$');
  if (rodzaj !== 'scrypt' || !sol || !klucz) return false;
  const par = { logN: Number(logN), r: Number(r), p: Number(p) };
  if (![par.logN, par.r, par.p].every((v) => Number.isInteger(v) && v > 0) || par.logN > 20) return false;
  const oczekiwany = Buffer.from(klucz, 'base64url');
  const policzony = await liczScrypt(haslo, Buffer.from(sol, 'base64url'), par);
  return oczekiwany.length === policzony.length && timingSafeEqual(oczekiwany, policzony);
}

/** skrót losowego hasła: porównanie z nim trwa tyle co z prawdziwym, a nigdy się nie udaje */
export function atrapaHasla(par: ParametryHasla = DOMYSLNE_HASLO): Promise<string> {
  return skrotHasla(randomBytes(24).toString('base64url'), par);
}

/** nowy token sesji dla ciasteczka */
export const nowyToken = (): string => randomBytes(32).toString('base64url');

/** nowy kod powrotu: XXXX-XXXX-XXXX z KOD_ALFABET; alfabet ma 32 znaki, więc pięć młodszych bitów bajtu wybiera znak
    bez żadnego przekosu */
export function nowyKod(): string {
  const bajty = randomBytes(KOD_DLUGOSC);
  let znaki = '';
  for (const b of bajty) znaki += KOD_ALFABET[b & 31];
  return `${znaki.slice(0, 4)}-${znaki.slice(4, 8)}-${znaki.slice(8)}`;
}

/** skrót tokenu (albo znormalizowanego kodu powrotu) do bazy */
export const skrotTokenu = (token: string): string => createHash('sha256').update(token).digest('hex');
