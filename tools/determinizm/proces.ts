/* Procesy potomne nóg bramki determinizmu (Node w osobnym procesie, systemowy jsc): jedno miejsce, które uruchamia
   program z limitem czasu i zamienia jego porażkę w czytelny jednowierszowy komunikat. Błąd z execFile ma w `message`
   „Command failed: <całe polecenie>” i dopiero pod nim stderr, więc pierwsza linia wyjątku nic nie mówiła o przyczynie;
   `opisBleduProcesu` bierze z stderr linię z błędem (Error, TypeError, Exception z jsc) razem z kodem wyjścia, a przy
   zabiciu po limicie czasu pisze o limicie. */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pierwszaLinia } from './raport.ts';

const execFileP = promisify(execFile);
const MAX_BUFOR = 512 * 1024 * 1024;

/** linia stderr z błędem: „Error: …”, „TypeError: …”, „Exception: …” (jsc), ale nie wiersz kodu z `throw new Error(…)` */
const LINIA_BLEDU = /^(?:Uncaught\s+)?[\w.]*(?:Error|Exception)\b/;

export function opisBleduProcesu(e: unknown, limitMs?: number): string {
  const b = (typeof e === 'object' && e !== null ? e : {}) as {
    stderr?: unknown;
    code?: unknown;
    killed?: unknown;
    signal?: unknown;
  };
  // execFile zabija proces po limicie czasu (killed), ale tak samo po przepełnieniu bufora (kod ERR_…): tylko pierwsze to limit
  const przepelnienie = typeof b.code === 'string' && b.code.startsWith('ERR_');
  if (b.killed === true && !przepelnienie)
    return `proces przekroczył limit czasu${limitMs ? ` ${Math.round(limitMs / 1000)} s` : ''}${b.signal ? ` (${String(b.signal)})` : ''}`;
  const linie =
    typeof b.stderr === 'string'
      ? b.stderr
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  const przyczyna = linie.find((l) => LINIA_BLEDU.test(l)) ?? linie[0];
  if (przyczyna) return typeof b.code === 'number' ? `${przyczyna} (kod wyjścia ${b.code})` : przyczyna;
  return pierwszaLinia(e);
}

/** Uruchamia program i oddaje jego stdout; porażka (kod wyjścia, limit czasu, brak pliku) to wyjątek z `opisBleduProcesu`. */
export async function uruchomProces(plik: string, args: string[], limitMs: number): Promise<string> {
  try {
    return (await execFileP(plik, args, { maxBuffer: MAX_BUFOR, timeout: limitMs })).stdout;
  } catch (e) {
    throw new Error(opisBleduProcesu(e, limitMs));
  }
}
