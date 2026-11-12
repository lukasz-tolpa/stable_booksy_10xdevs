import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MySlot, SlotOccupancy } from "@/lib/bookings/slots";

type Client = SupabaseClient<Database>;

/** Kto odwołał zapis — wartości kolumny `bookings.cancelled_by` (CHECK w migracji #41). */
export type CancelledBy = "rider" | "stable";

function toCancelledBy(value: string | null): CancelledBy | null {
  return value === "rider" || value === "stable" ? value : null;
}

/**
 * Zajętość slotów (instruktor × godzina) ośrodka na dany dzień — przez RPC
 * `get_slot_occupancy`, bo polityka SELECT na `bookings` pokazuje jeźdźcowi wyłącznie
 * jego własne zapisy. Funkcja zwraca same liczby aktywnych zapisów, bez tożsamości jeźdźców.
 */
export async function getSlotOccupancy(client: Client, stableId: number, day: string): Promise<SlotOccupancy[]> {
  const { data, error } = await client.rpc("get_slot_occupancy", { p_stable_id: stableId, p_day: day });

  if (error) {
    throw error;
  }

  return data.map((row) => ({ instructorId: row.instructor_id, hour: row.hour, taken: row.taken }));
}

/**
 * Własne aktywne zapisy jeźdźca w danym dniu grafiku.
 *
 * Filtr po `rider_id` jest jawny, a nie zostawiony RLS: polityka SELECT na
 * `bookings` to own-OR-my-stable, więc sesja OŚRODKA widziałaby tu zapisy
 * wszystkich jeźdźców swojego dnia i funkcja zgłosiłaby je jako „moje".
 */
export async function getMyBookings(client: Client, scheduleDayId: number, riderId: string): Promise<MySlot[]> {
  const { data, error } = await client
    .from("bookings")
    .select("instructor_id, hour")
    .eq("schedule_day_id", scheduleDayId)
    .eq("rider_id", riderId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data.map((row) => ({ instructorId: row.instructor_id, hour: row.hour }));
}

/** Zapis dnia z perspektywy ośrodka: slot, jeździec i przydzielony koń (FR-005). */
export interface DayBooking {
  hour: number;
  instructorId: number;
  /** `null`, gdy RLS nie odda wiersza instruktora — nazwa zastępcza należy do `composeBookingRows`. */
  instructorName: string | null;
  /** Przydzielony koń; `null` — zapis jeszcze bez konia. */
  horseId: number | null;
  riderName: string | null;
  /** Zapis bez jeźdźca: konto usunięto, miniony zapis został w historii ośrodka (ADR-0001). */
  anonymised: boolean;
}

/**
 * Aktywne zapisy dnia grafiku wraz z instruktorem i nazwiskiem jeźdźca — widok ośrodka.
 *
 * Nazwisko dociąga embedded select przez FK `rider_id → profiles`; polityka RLS na
 * `profiles` (`is_rider_of_my_stable`) wpuszcza ośrodek do profili jeźdźców mających zapis
 * w jego stadninie. Instruktora — FK `instructor_id → instructors`. Nazwy koni dokłada
 * warstwa czysta z listy stada. `null` zostaje `null` — fallback tekstowy należy do
 * `composeBookingRows`, nie do zapytania.
 *
 * Wołać wyłącznie z sesji ośrodka dla jego własnego dnia — sesja jeźdźca
 * zobaczyłaby przez RLS tylko własne zapisy i po cichu zaniżyła listę.
 */
export async function getDayBookings(client: Client, scheduleDayId: number): Promise<DayBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select("hour, instructor_id, horse_id, rider_id, instructors(name), profiles(full_name)")
    .eq("schedule_day_id", scheduleDayId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    hour: row.hour,
    instructorId: row.instructor_id,
    // Wygenerowane typy obiecują niepusty obiekt (FK not-null), ale RLS mógłby ukryć wiersz.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    instructorName: row.instructors?.name ?? null,
    horseId: row.horse_id,
    // `profiles` jest `null` dla zapisu bez jeźdźca, a także gdy RLS ukryje profil.
    riderName: row.profiles?.full_name ?? null,
    anonymised: row.rider_id === null,
  }));
}

/** Zapis jeźdźca z kontekstem dnia, ośrodka, instruktora i konia — widok „Moje zapisy". */
export interface RiderBooking {
  id: number;
  hour: number;
  day: string;
  stableName: string;
  instructorId: number;
  instructorName: string | null;
  /** Przydzielony koń; `null` — jeszcze bez konia (zapis odwołany nigdy go nie ma). */
  horseName: string | null;
  status: string;
  cancelledBy: CancelledBy | null;
}

/**
 * Wszystkie zapisy jeźdźca (każdy status) z dniem, ośrodkiem, instruktorem i koniem.
 *
 * Dzień i ośrodek idą przez FK `bookings → schedule_days → stables`, instruktor przez
 * `instructor_id`, koń przez złożony FK `bookings_assigned_horse_fkey` do
 * `schedule_day_horses` (zapis bez konia daje `null`). Filtr po `rider_id` jest jawny
 * (lekcja S-04): polityka SELECT jest szersza niż intencja tej funkcji.
 */
export async function getRiderBookings(client: Client, riderId: string): Promise<RiderBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, hour, status, cancelled_by, instructor_id, schedule_days(day, stables(name)), instructors(name), schedule_day_horses!bookings_assigned_horse_fkey(horses(name))",
    )
    .eq("rider_id", riderId);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    hour: row.hour,
    status: row.status,
    cancelledBy: toCancelledBy(row.cancelled_by),
    instructorId: row.instructor_id,
    // Wygenerowane typy obiecują niepuste obiekty (FK not-null), ale w runtime RLS mógłby
    // ukryć wiersz pośredni - ochrona zostaje, jak w getDayBookings.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: row.schedule_days?.day ?? "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stableName: row.schedule_days?.stables?.name ?? "(ośrodek)",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    instructorName: row.instructors?.name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    horseName: row.schedule_day_horses?.horses?.name ?? null,
  }));
}

/** Dane potrzebne do decyzji o odwołaniu — celowany odczyt jednego zapisu. */
export interface CancellableBooking {
  day: string;
  hour: number;
  status: string;
}

/**
 * Pojedynczy zapis jeźdźca pod decyzję o odwołaniu: tylko dzień, godzina
 * i status. Wołać wyłącznie z sesji jeźdźca z jego własnym id (jak getRiderBookings).
 */
export async function getRiderBookingForCancel(
  client: Client,
  bookingId: number,
  riderId: string,
): Promise<CancellableBooking | null> {
  const { data, error } = await client
    .from("bookings")
    .select("hour, status, schedule_days(day)")
    .eq("id", bookingId)
    .eq("rider_id", riderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    hour: data.hour,
    status: data.status,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: data.schedule_days?.day ?? "",
  };
}

/**
 * Odwołanie własnego zapisu przez jeźdźca: jeden UPDATE statusu, czasu i „kto odwołał" —
 * CHECK-i spójności wymuszają wszystkie trzy naraz, a wyzwalacz `bookings_cancellation`
 * pozwala jeźdźcowi wpisać wyłącznie siebie i czyści przydział konia. Filtr
 * `status = 'active'` rozstrzyga wyścig dwóch odwołań: drugi UPDATE trafia w 0 wierszy
 * i zwraca `false` zamiast błędu.
 *
 * Wołać wyłącznie z sesji jeźdźca z jego własnym `riderId` — polityka UPDATE
 * jest own-OR-my-stable, więc sesja ośrodka z cudzym `riderId` też by przeszła
 * (i odmówiłby jej dopiero wyzwalacz, bo ośrodek nie jest jeźdźcem).
 */
export async function cancelBooking(client: Client, bookingId: number, riderId: string): Promise<boolean> {
  const { data, error } = await client
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "rider" })
    .eq("id", bookingId)
    .eq("rider_id", riderId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}

export interface CreateBookingInput {
  scheduleDayId: number;
  instructorId: number;
  hour: number;
  /** Zawsze z sesji, nigdy z formularza — wymusza to też polityka INSERT. */
  riderId: string;
}

/**
 * Zapis na miejsce u instruktora — pojedynczy INSERT pod RLS. Odmowy podnosi baza
 * (wyzwalacz `bookings_seat_limit`, indeks `bookings_rider_hour_key`): SB009 brak miejsc,
 * 23505 drugi zapis na tę godzinę, 23503 slot zniknął, 23514 poza godzinami; wołający
 * tłumaczy je przez `bookingErrorMessage`.
 *
 * Odczyt zwrotny (`select("id").single()`): sukces endpointu ma być niemożliwy bez
 * utrwalonego wiersza — przekierowanie samo w sobie niczego nie dowodzi (test-plan, ryzyko #3).
 * Postgres stosuje politykę SELECT do wierszy zwracanych przez `RETURNING`, więc gdyby ją
 * kiedyś zawęzić, cały INSERT padłby z 42501 i zapisy przestałyby działać. Każda zmiana RLS
 * na `bookings` wymaga więc ponownego przebiegu `npm run test:e2e`.
 */
export async function createBooking(client: Client, input: CreateBookingInput): Promise<{ id: number }> {
  const { data, error } = await client
    .from("bookings")
    .insert({
      schedule_day_id: input.scheduleDayId,
      instructor_id: input.instructorId,
      hour: input.hour,
      rider_id: input.riderId,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id };
}
