import {
  INSTRUCTOR_HOME_ROUTE,
  RIDER_BOOKINGS_ROUTE,
  STABLE_DAY_BOOKINGS_ROUTE,
  pendingBookingsRouteOf,
  stableViewerOf,
  type InstructorStanding,
  type StableViewer,
} from "@/lib/auth/roles";
import { UNKNOWN_RIDER } from "@/lib/bookings/pending";
import { slotStartsAt } from "@/lib/bookings/slots";
import { bookingStateAt } from "@/lib/bookings/status";
import { formatBadgeCount, formatCount, type PluralForms } from "@/lib/format";
import type { UserRole } from "@/types";

/**
 * Lista powiadomień (#129, GLOSSARY „Powiadomienie”): powiadomienia zapisane w bazie
 * (`get_my_notifications`) i — u jeźdźca — wyprowadzone wygaśnięcia: zapis oczekujący, którego slot się
 * zaczął (`bookingStateAt`), z czasem startu slotu. Najnowsze na górze. Nieprzeczytane = nowsze od
 * ostatniego otwarcia strony „Powiadomienia” (jedna data na użytkownika). `now` jest wstrzykiwane.
 */

/** Rodzaje zapisywane przez wyzwalacz `bookings_notifications`. */
export type StoredNotificationKind =
  | "booking_pending"
  | "booking_cancelled_by_rider"
  | "booking_accepted"
  | "booking_rejected"
  | "booking_cancelled_by_stable";

const STORED_KINDS: readonly StoredNotificationKind[] = [
  "booking_pending",
  "booking_cancelled_by_rider",
  "booking_accepted",
  "booking_rejected",
  "booking_cancelled_by_stable",
];

/** Zawężenie kolumny `kind` do unii; wartość spoza niej — schemat wie o rodzaju, którego aplikacja nie zna. */
export function toStoredNotificationKind(kind: string): StoredNotificationKind {
  const known = STORED_KINDS.find((entry) => entry === kind);
  if (known !== undefined) return known;
  throw new Error(`Nieznany rodzaj powiadomienia: ${kind}`);
}

/** Powiadomienie z `get_my_notifications` — ze slotem zapisu i jeźdźcem. */
export interface StoredNotification {
  id: number;
  kind: StoredNotificationKind;
  bookingId: number;
  /** Powód odrzucenia — tylko przy `booking_rejected`. */
  reason: string | null;
  createdAt: string;
  day: string;
  hour: number;
  instructorName: string;
  stableName: string;
  /** `null` — jeździec anonimizowany (ADR 0001). */
  riderName: string | null;
}

/** Zapis oczekujący jeźdźca — źródło wyprowadzanych powiadomień o wygaśnięciu. */
export interface PendingRiderBooking {
  id: number;
  day: string;
  hour: number;
  instructorName: string | null;
  stableName: string;
}

/** Kto ogląda listę: jeździec albo strona ośrodka (właściciel, instruktor z kontem — `StableViewer`). */
export type NotificationViewer = "rider" | StableViewer;

/**
 * Odbiorca powiadomień według konta, albo `null` — konto bez powiadomień (konto instruktora bez ośrodka,
 * zdezaktywowany instruktor, nieustalone powiązanie): bez dzwonka i bez strony. Stronę ośrodka rozstrzyga mapa
 * stanów konta (`stableViewerOf`).
 */
export function notificationViewerOf(role: UserRole, standing: InstructorStanding | null): NotificationViewer | null {
  return role === "rider" ? "rider" : stableViewerOf(standing);
}

const EMPTY_HINTS: Record<NotificationViewer, string> = {
  rider: "Gdy ośrodek przyjmie, odrzuci albo odwoła Twój zapis, zobaczysz to tutaj.",
  owner: "Gdy jeździec zapisze się na jazdę albo odwoła przyjęty zapis, zobaczysz to tutaj.",
  instructor: "Gdy jeździec zapisze się na Twój slot albo odwoła przyjęty zapis, zobaczysz to tutaj.",
};

/** Podpowiedź pustej listy „Powiadomień”: o czym oglądający dostaje powiadomienia. */
export function emptyNotificationsHint(viewer: NotificationViewer): string {
  return EMPTY_HINTS[viewer];
}

export interface NotificationsInput {
  viewer: NotificationViewer;
  stored: readonly StoredNotification[];
  pendingBookings: readonly PendingRiderBooking[];
  /** Ostatnie otwarcie strony „Powiadomienia”; `null` — jeszcze nie otwierana. */
  seenAt: string | null;
}

/** Rodzaj powiadomienia na liście: zapisany albo wyprowadzone wygaśnięcie. */
export type NotificationKind = StoredNotificationKind | "booking_expired";

export interface NotificationItem {
  key: string;
  kind: NotificationKind;
  at: Date;
  unread: boolean;
  title: string;
  /** Kogo dotyczy: ośrodkowi — jeździec, jeźdźcowi — ośrodek. */
  subject: string;
  /** Slot zapisu. */
  day: string;
  hour: number;
  instructorName: string | null;
  /** Powód odrzucenia; `null` przy innych rodzajach. */
  reason: string | null;
  /** Dokąd prowadzi: do zapisu, którego dotyczy. */
  href: string;
}

const TITLES: Record<NotificationKind, string> = {
  booking_pending: "Nowy zapis czeka na przyjęcie",
  booking_cancelled_by_rider: "Jeździec odwołał zapis",
  booking_accepted: "Ośrodek przyjął Twój zapis",
  booking_rejected: "Ośrodek odrzucił Twój zapis",
  booking_cancelled_by_stable: "Ośrodek odwołał Twój zapis",
  booking_expired: "Twój zapis wygasł",
};

/** Powiadomienia ośrodka o zapisie; pozostałe są jeźdźca. */
const STABLE_KINDS: readonly NotificationKind[] = ["booking_pending", "booking_cancelled_by_rider"];

/**
 * Dokąd prowadzi powiadomienie: jeździec — „Moje zapisy”; właściciel — „Zapisy do przyjęcia” (nowy zapis
 * oczekujący) albo zapisy dnia slotu (odwołanie); instruktor z kontem — swoje „Zapisy do przyjęcia” (#126) albo
 * „Moje sloty” (odwołanie).
 */
function hrefOf(kind: NotificationKind, day: string, viewer: NotificationViewer): string {
  if (viewer === "rider" || !STABLE_KINDS.includes(kind)) return RIDER_BOOKINGS_ROUTE;
  if (kind === "booking_pending") return pendingBookingsRouteOf(viewer);
  if (viewer === "instructor") return INSTRUCTOR_HOME_ROUTE;
  return `${STABLE_DAY_BOOKINGS_ROUTE}?${new URLSearchParams({ dzien: day }).toString()}`;
}

type DraftItem = Omit<NotificationItem, "unread">;

function storedItem(notification: StoredNotification, viewer: NotificationViewer): DraftItem {
  const forStable = STABLE_KINDS.includes(notification.kind);
  return {
    key: `n${String(notification.id)}`,
    kind: notification.kind,
    at: new Date(notification.createdAt),
    title: TITLES[notification.kind],
    subject: forStable ? (notification.riderName ?? UNKNOWN_RIDER) : notification.stableName,
    day: notification.day,
    hour: notification.hour,
    instructorName: notification.instructorName,
    reason: notification.kind === "booking_rejected" ? notification.reason : null,
    href: hrefOf(notification.kind, notification.day, viewer),
  };
}

function expiries(input: NotificationsInput, now: Date): DraftItem[] {
  if (input.viewer !== "rider") return [];
  return input.pendingBookings
    .filter((booking) => bookingStateAt({ status: "pending", day: booking.day, hour: booking.hour }, now) === "expired")
    .map((booking) => ({
      key: `e${String(booking.id)}`,
      kind: "booking_expired",
      at: slotStartsAt(booking.day, booking.hour),
      title: TITLES.booking_expired,
      subject: booking.stableName,
      day: booking.day,
      hour: booking.hour,
      instructorName: booking.instructorName,
      reason: null,
      href: hrefOf("booking_expired", booking.day, input.viewer),
    }));
}

export function composeNotifications(input: NotificationsInput, now: Date = new Date()): NotificationItem[] {
  const seenAt = input.seenAt === null ? null : new Date(input.seenAt).getTime();
  const items: DraftItem[] = [
    ...input.stored.map((notification) => storedItem(notification, input.viewer)),
    ...expiries(input, now),
  ];
  return items
    .map((item) => ({ ...item, unread: seenAt === null || item.at.getTime() > seenAt }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function countUnread(input: NotificationsInput, now: Date = new Date()): number {
  return composeNotifications(input, now).filter((item) => item.unread).length;
}

const UNREAD_FORMS: PluralForms = { one: "nieprzeczytane", few: "nieprzeczytane", many: "nieprzeczytanych" };

/**
 * Podpis dzwonka dla czytników ekranu, np. „Powiadomienia (3 nieprzeczytane)”. Liczba w nawiasie, żeby nazwa
 * linku nie wyglądała jak data „dzień liczba miesiąc” (e2e podsumowania miesiąca zbiera linki dat po tym wzorze).
 */
export function bellLabel(unread: number): string {
  return unread === 0 ? "Powiadomienia" : `Powiadomienia (${formatCount(unread, UNREAD_FORMS)})`;
}

/** Liczba na dzwonku; `null` — nic nieprzeczytanego (bez znaczka). */
export function bellBadge(unread: number): string | null {
  return unread === 0 ? null : formatBadgeCount(unread);
}
