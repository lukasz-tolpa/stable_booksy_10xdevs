import { SIGN_UP_ROUTE } from "@/lib/auth/roles";
import type { InstructorList } from "@/lib/instructors/list";

/**
 * Link zaproszenia instruktora do konta (#74) i jego jednorazowe pokazanie właścicielowi.
 *
 * Token (64 znaki [0-9a-f]) zwraca baza raz, przy wystawieniu — przechowuje tylko jego skrót.
 * Endpoint wystawienia odkłada go w krótkim ciasteczku (flash), strona Instruktorzy pokazuje
 * link jeden raz i ciasteczko kasuje. Zgubiony link zastępuje się nowym zaproszeniem.
 */

/** Parametr adresu rejestracji z tokenem zaproszenia — czyta go strona rejestracji (#75). */
export const INVITATION_PARAM = "zaproszenie";

/** Ciasteczko z linkiem do pokazania po wystawieniu (ścieżka strony Instruktorzy). */
export const INVITATION_FLASH_COOKIE = "zaproszenie_link";

/** Czas życia flasha w sekundach — tyle, ile trwa przekierowanie na stronę. */
export const INVITATION_FLASH_MAX_AGE = 120;

export interface InvitationFlash {
  instructorId: number;
  token: string;
}

const FLASH_PATTERN = /^([1-9]\d*)\.([0-9a-f]{64})$/;

/** Pełny adres linku: rejestracja z tokenem w parametrze `zaproszenie`. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}${SIGN_UP_ROUTE}?${INVITATION_PARAM}=${token}`;
}

export function encodeInvitationFlash(flash: InvitationFlash): string {
  return `${String(flash.instructorId)}.${flash.token}`;
}

/** Odczyt flasha; cokolwiek innego niż zapisał endpoint daje `null`. */
export function parseInvitationFlash(value: string | undefined): InvitationFlash | null {
  const match = value ? FLASH_PATTERN.exec(value) : null;
  return match?.[1] && match[2] ? { instructorId: Number(match[1]), token: match[2] } : null;
}

/** Karta z linkiem do skopiowania tuż po wystawieniu zaproszenia. */
export interface InvitationNotice {
  instructorName: string;
  email: string;
  expiresLabel: string;
  link: string;
}

/**
 * Link pokazujemy tylko instruktorowi, który na liście nadal ma żywe zaproszenie — flash ze
 * starego przekierowania (zaproszenie od tego czasu wycofane) nie wyświetli martwego linku.
 */
export function invitationNotice(
  list: InstructorList,
  flash: InvitationFlash | null,
  origin: string,
): InvitationNotice | null {
  if (!flash) {
    return null;
  }
  const instructor = list.active.find((item) => item.id === flash.instructorId);
  if (instructor?.account.kind !== "invited") {
    return null;
  }
  return {
    instructorName: instructor.name,
    email: instructor.account.email,
    expiresLabel: instructor.account.label,
    link: invitationLink(origin, flash.token),
  };
}
