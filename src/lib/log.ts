/**
 * Jedyne miejsce w `src/`, które pisze do logu serwera (Workers observability,
 * `npx wrangler tail`). Każde miejsce, które dotąd gubiło wynik wywołania zależności
 * (endpointy auth, middleware, strony SSR), woła `logError(scope, error)`.
 *
 * Do wpisu trafiają wyłącznie pola pochodne: `name`, `code`, `status`, `message`.
 * Oryginalny obiekt nigdy nie jedzie dalej, więc e-mail z formularza ani token
 * z ciasteczka nie mogą wylądować w logu. Funkcja nigdy nie rzuca — logowanie
 * nie może zamienić obsłużonego błędu w nieobsłużony.
 */

import { errorCode, errorMessage } from "@/lib/db-errors";

export interface LogEntry {
  scope: string;
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

export type LogSink = (entry: LogEntry) => void;

function defaultSink(entry: LogEntry): void {
  // eslint-disable-next-line no-console -- jedyny kanał logów na Workers
  console.error(`[${entry.scope}]`, entry);
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function errorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

/** Zapisuje jeden wpis o błędzie; `sink` jest parametrem, żeby testy nie dotykały konsoli. */
export function logError(scope: string, error: unknown, sink: LogSink = defaultSink): void {
  const entry: LogEntry = { scope };
  const name = errorName(error);
  const code = errorCode(error);
  const status = errorStatus(error);
  const message = errorMessage(error);
  if (name !== undefined) entry.name = name;
  if (code !== undefined) entry.code = code;
  if (status !== undefined) entry.status = status;
  if (message !== undefined) entry.message = message;

  try {
    sink(entry);
  } catch {
    // Ujście logu padło - nie ma już gdzie tego zgłosić, a wołający ma własną obsługę błędu.
  }
}
