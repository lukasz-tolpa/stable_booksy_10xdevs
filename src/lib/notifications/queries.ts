import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import {
  toStoredNotificationKind,
  type NotificationsInput,
  type NotificationViewer,
  type PendingRiderBooking,
  type StoredNotification,
} from "@/lib/notifications/notifications";

type Client = SupabaseClient<Database>;

/**
 * Powiadomienia zalogowanego konta — przez RPC `get_my_notifications`, bo ośrodek nie czyta profilu jeźdźca
 * z samym zapisem oczekującym, a instruktor zapisów oczekujących. Funkcja oddaje tylko powiadomienia wołającego.
 */
export async function getMyNotifications(client: Client): Promise<StoredNotification[]> {
  const { data, error } = await client.rpc("get_my_notifications");

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    kind: toStoredNotificationKind(row.kind),
    bookingId: row.booking_id,
    // Powód i profil jeźdźca mogą być puste (złączenie zewnętrzne) — wygenerowane typy tego nie wiedzą.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    reason: row.reason ?? null,
    createdAt: row.created_at,
    day: row.day,
    hour: row.hour,
    instructorName: row.instructor_name,
    stableName: row.stable_name,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderName: row.rider_name ?? null,
  }));
}

/** Ostatnie otwarcie strony „Powiadomienia” przez konto; `null` — jeszcze nie otwierana. RLS: tylko własna. */
export async function getNotificationsSeenAt(client: Client, profileId: string): Promise<string | null> {
  const { data, error } = await client
    .from("notification_views")
    .select("seen_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.seen_at ?? null;
}

/** Zapisy oczekujące jeźdźca — źródło wyprowadzanych wygaśnięć. Wołać z sesji jeźdźca z jego własnym id. */
export async function getPendingRiderBookings(client: Client, riderId: string): Promise<PendingRiderBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select("id, hour, schedule_days(day, stables(name)), instructors(name)")
    .eq("rider_id", riderId)
    .eq("status", "pending");

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    hour: row.hour,
    // Jak w getRiderBookings: typy obiecują niepuste obiekty, w runtime RLS mógłby ukryć wiersz pośredni.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: row.schedule_days?.day ?? "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stableName: row.schedule_days?.stables?.name ?? "(ośrodek)",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    instructorName: row.instructors?.name ?? null,
  }));
}

/**
 * Wszystko, z czego składa się lista powiadomień konta (`composeNotifications`): zapisane powiadomienia,
 * data ostatniego otwarcia strony i — u jeźdźca — jego zapisy oczekujące. Odczyty idą równolegle.
 */
export async function loadNotificationsInput(
  client: Client,
  profileId: string,
  viewer: NotificationViewer,
): Promise<NotificationsInput> {
  const [stored, seenAt, pendingBookings] = await Promise.all([
    getMyNotifications(client),
    getNotificationsSeenAt(client, profileId),
    viewer === "rider" ? getPendingRiderBookings(client, profileId) : Promise.resolve([]),
  ]);
  return { viewer, stored, seenAt, pendingBookings };
}

/** Otwarcie strony „Powiadomienia”: data ostatniego otwarcia = teraz (RPC `mark_notifications_seen`). */
export async function markNotificationsSeen(client: Client): Promise<void> {
  const { error } = await client.rpc("mark_notifications_seen");

  if (error) {
    throw error;
  }
}
