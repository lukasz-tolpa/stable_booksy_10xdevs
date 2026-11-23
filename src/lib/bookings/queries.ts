import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { PendingBooking } from "@/lib/bookings/pending";
import type { MySlot, SlotOccupancy } from "@/lib/bookings/slots";
import { toBookingStatus, toCancelledBy } from "@/lib/bookings/status";
import type { DateRange } from "@/lib/schedule/dates";
import { toSlotKind } from "@/lib/schedule/kind";
import type { BookingStatus, CancelledBy } from "@/types";

type Client = SupabaseClient<Database>;

/**
 * Zajętość slotów (instruktor × godzina) ośrodka na dany dzień — przez RPC
 * `get_slot_occupancy`, bo polityka SELECT na `bookings` pokazuje jeźdźcowi wyłącznie
 * jego własne zapisy. Funkcja zwraca same liczby — aktywnych zapisów i (komu wolno, #128) oczekujących — bez
 * tożsamości jeźdźców.
 */
export async function getSlotOccupancy(client: Client, stableId: number, day: string): Promise<SlotOccupancy[]> {
  const { data, error } = await client.rpc("get_slot_occupancy", { p_stable_id: stableId, p_day: day });

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    instructorId: row.instructor_id,
    hour: row.hour,
    taken: row.taken,
    // Funkcja zwraca NULL, gdy wołający liczby czekających nie widzi — wygenerowane typy tego nie wiedzą.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    waiting: row.waiting ?? null,
  }));
}

/**
 * Własne zapisy jeźdźca w danym dniu grafiku: aktywne i oczekujące (#124) — oba zajmują jeźdźcowi
 * godzinę (`bookings_rider_hour_key`), oczekujący dostaje „Czekasz na przyjęcie”.
 *
 * Filtr po `rider_id` jest jawny, a nie zostawiony RLS: polityka SELECT na
 * `bookings` to own-OR-my-stable, więc sesja OŚRODKA widziałaby tu zapisy
 * wszystkich jeźdźców swojego dnia i funkcja zgłosiłaby je jako „moje".
 */
export async function getMyBookings(client: Client, scheduleDayId: number, riderId: string): Promise<MySlot[]> {
  const { data, error } = await client
    .from("bookings")
    .select("instructor_id, hour, status")
    .eq("schedule_day_id", scheduleDayId)
    .eq("rider_id", riderId)
    .in("status", ["pending", "active"]);

  if (error) {
    throw error;
  }

  return data.map((row) => ({ instructorId: row.instructor_id, hour: row.hour, pending: row.status === "pending" }));
}

/** Zapis dnia z perspektywy ośrodka: slot, jeździec, przydzielony koń i stan (FR-005). */
export interface DayBooking {
  id: number;
  hour: number;
  instructorId: number;
  /** `null`, gdy RLS nie odda wiersza instruktora — nazwa zastępcza należy do `composeDayBookingSections`. */
  instructorName: string | null;
  /** Przydzielony koń; `null` — zapis jeszcze bez konia (odwołany nigdy go nie ma). */
  horseId: number | null;
  /** Konto jeźdźca; `null` — jeździec zanonimizowany. Konie pensjonariusza przy slocie treningowym (#115). */
  riderId: string | null;
  riderName: string | null;
  /** Zapis bez jeźdźca: konto usunięto, miniony zapis został w historii ośrodka (ADR-0001). */
  anonymised: boolean;
  status: BookingStatus;
  cancelledBy: CancelledBy | null;
  /** Zapis był przyjęty (`accepted_at`) — odwołany bez tego znacznika to wycofany zapis oczekujący. */
  wasAccepted: boolean;
}

/**
 * Wszystkie zapisy dnia grafiku (aktywne i odwołane) wraz z instruktorem i nazwiskiem
 * jeźdźca — widok ośrodka.
 *
 * Nazwisko dociąga embedded select przez FK `rider_id → profiles`; polityka RLS na
 * `profiles` (`is_rider_of_my_stable`) wpuszcza ośrodek do profili jeźdźców mających zapis
 * w jego stadninie. Instruktora — FK `instructor_id → instructors`. Nazwy koni dokłada
 * warstwa czysta z listy stada. `null` zostaje `null` — fallback tekstowy należy do
 * `composeDayBookingSections`, nie do zapytania.
 *
 * Wołać wyłącznie z sesji ośrodka dla jego własnego dnia — sesja jeźdźca
 * zobaczyłaby przez RLS tylko własne zapisy i po cichu zaniżyła listę.
 */
export async function getDayBookings(client: Client, scheduleDayId: number): Promise<DayBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, hour, instructor_id, horse_id, rider_id, status, cancelled_by, accepted_at, instructors(name), profiles(full_name)",
    )
    .eq("schedule_day_id", scheduleDayId);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    hour: row.hour,
    instructorId: row.instructor_id,
    // Wygenerowane typy obiecują niepusty obiekt (FK not-null), ale RLS mógłby ukryć wiersz.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    instructorName: row.instructors?.name ?? null,
    horseId: row.horse_id,
    riderId: row.rider_id,
    // `profiles` jest `null` dla zapisu bez jeźdźca, a także gdy RLS ukryje profil.
    riderName: row.profiles?.full_name ?? null,
    anonymised: row.rider_id === null,
    // Nieznana wartość rzuca — strona loguje ją i pokazuje stan awarii.
    status: toBookingStatus(row.status),
    cancelledBy: toCancelledBy(row.cancelled_by),
    wasAccepted: row.accepted_at !== null,
  }));
}

/** Zapis jeźdźca z kontekstem dnia, ośrodka, instruktora i konia — widok „Moje zapisy". */
export interface RiderBooking {
  id: number;
  hour: number;
  day: string;
  stableId: number;
  stableName: string;
  instructorId: number;
  instructorName: string | null;
  /** Przydzielony koń; `null` — jeszcze bez konia (zapis odwołany nigdy go nie ma). */
  horseName: string | null;
  status: BookingStatus;
  cancelledBy: CancelledBy | null;
  /** Powód odrzucenia (ręczny albo „Brak miejsc”, #125); `null` przy zapisie nieodrzuconym. */
  rejectionReason: string | null;
}

/**
 * Zapisy jeźdźca (każdy status) z dniem, ośrodkiem, instruktorem i koniem — wszystkie albo, z `days`,
 * tylko z dni grafiku `from…to` włącznie (Podsumowanie miesiąca).
 *
 * Dzień i ośrodek idą przez FK `bookings → schedule_days → stables`, instruktor przez
 * `instructor_id`, koń przez FK `bookings_horse_fkey` do katalogu koni (zapis bez konia daje `null`;
 * jeździec czyta katalog koni, także koni pensjonatowych — #115). Filtr po `rider_id` jest jawny
 * (lekcja S-04): polityka SELECT jest szersza niż intencja tej funkcji.
 */
export async function getRiderBookings(client: Client, riderId: string, days?: DateRange): Promise<RiderBooking[]> {
  // `!inner` pozwala zawęzić zapisy po dniu grafiku; jeździec czyta cały katalog (dni grafiku
  // każdego ośrodka), więc bez zakresu wynik jest ten sam co przy zwykłym złączeniu.
  let query = client
    .from("bookings")
    .select(
      "id, hour, status, cancelled_by, rejection_reason, instructor_id, schedule_days!inner(day, stable_id, stables(name)), instructors(name), horses(name)",
    )
    .eq("rider_id", riderId);
  if (days) {
    query = query.gte("schedule_days.day", days.from).lte("schedule_days.day", days.to);
  }
  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    hour: row.hour,
    status: toBookingStatus(row.status),
    cancelledBy: toCancelledBy(row.cancelled_by),
    rejectionReason: row.rejection_reason,
    instructorId: row.instructor_id,
    // Wygenerowane typy obiecują niepuste obiekty (FK not-null), ale w runtime RLS mógłby
    // ukryć wiersz pośredni - ochrona zostaje, jak w getDayBookings.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: row.schedule_days?.day ?? "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stableId: row.schedule_days?.stable_id ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stableName: row.schedule_days?.stables?.name ?? "(ośrodek)",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    instructorName: row.instructors?.name ?? null,
    horseName: row.horses?.name ?? null,
  }));
}

/** Stany zapisu, które jeździec odwołuje (wycofanie oczekującego też jest odwołaniem). */
export const RIDER_CANCELLABLE: readonly BookingStatus[] = ["pending", "active"];

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
 * Odwołanie własnego zapisu (aktywnego albo oczekującego, #124) przez jeźdźca: jeden UPDATE statusu,
 * czasu i „kto odwołał" — CHECK-i spójności wymuszają wszystkie trzy naraz, a wyzwalacz
 * `bookings_cancellation` pozwala jeźdźcowi wpisać wyłącznie siebie i czyści przydział konia. Filtr
 * stanu rozstrzyga wyścig dwóch odwołań (i odwołania z przyjęciem — oba stany wolno odwołać): drugi
 * UPDATE trafia w 0 wierszy i zwraca `false` zamiast błędu.
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
    .in("status", RIDER_CANCELLABLE)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}

/** Zapis z grafiku ośrodka: identyfikator i dzień grafiku, sprawdzony filtrem po stadninie. */
export interface StableBooking extends CancellableBooking {
  id: number;
  /** Dzień grafiku stadniny ośrodka — jawny filtr własności w UPDATE-ach ośrodka. */
  scheduleDayId: number;
}

/**
 * Pojedynczy zapis w grafiku stadniny ośrodka pod decyzję o przydziale konia albo odwołaniu:
 * dzień, godzina i status. Filtr po stadninie idzie jawnie przez `schedule_days!inner` —
 * polityka SELECT jest own-OR-my-stable, a ta funkcja ma znaleźć wyłącznie zapis ośrodka.
 * `null` = cudzy albo nieistniejący zapis (bez wyroczni istnienia).
 */
export async function getStableBooking(
  client: Client,
  bookingId: number,
  stableId: number,
): Promise<StableBooking | null> {
  const { data, error } = await client
    .from("bookings")
    .select("id, schedule_day_id, hour, status, schedule_days!inner(day, stable_id)")
    .eq("id", bookingId)
    .eq("schedule_days.stable_id", stableId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? {
        id: data.id,
        scheduleDayId: data.schedule_day_id,
        hour: data.hour,
        status: data.status,
        day: data.schedule_days.day,
      }
    : null;
}

/**
 * Przydział, zmiana albo cofnięcie (`horseId = null`) konia przez ośrodek — jeden UPDATE
 * `horse_id`. Własność dwa razy: jawny filtr po dniu grafiku stadniny (z `getStableBooking`)
 * i RLS. Odmowy podnosi baza: 23503 koń nie pracuje tego dnia, 23505 koń zajęty w tej
 * godzinie (`horseAssignmentErrorMessage`); jeźdźcowi odmawia wyzwalacz
 * `bookings_horse_assignment` (42501). Bez progu czasu — także po terminie.
 * Filtr `status = 'active'`: odwołany w międzyczasie zapis daje `false`, nie błąd.
 */
export async function assignHorse(client: Client, booking: StableBooking, horseId: number | null): Promise<boolean> {
  const { data, error } = await client
    .from("bookings")
    .update({ horse_id: horseId })
    .eq("id", booking.id)
    .eq("schedule_day_id", booking.scheduleDayId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
}

/**
 * Odwołanie zapisu przez ośrodek: status, czas i `cancelled_by = 'stable'` naraz (CHECK-i
 * spójności); wyzwalacz `bookings_cancellation` przepuszcza wyłącznie rolę ośrodka jako
 * odwołującego i czyści przydział konia. Filtr `status = 'active'` rozstrzyga wyścig z
 * odwołaniem przez jeźdźca — drugi UPDATE trafia w 0 wierszy i zwraca `false`.
 *
 * Własność dwa razy: jawny filtr po dniu grafiku stadniny — `booking` pochodzi z
 * `getStableBooking`, filtrowanego po stadninie (UPDATE przez PostgREST nie wyrazi filtra po
 * `schedule_days.stable_id` wprost) — i RLS.
 */
export async function cancelBookingAsStable(client: Client, booking: StableBooking): Promise<boolean> {
  const { data, error } = await client
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: "stable" })
    .eq("id", booking.id)
    .eq("schedule_day_id", booking.scheduleDayId)
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
  /**
   * Koń pensjonatowy wybrany przy zapisie na slot treningowy (#115); bez niego baza przydziela jedynego konia
   * pensjonariusza z pobytem w dniu jazdy (przy kilku — SB052). Czy koń jest jego, sprawdza baza (SB051).
   */
  horseId?: number;
}

/**
 * Zapis na miejsce u instruktora — pojedynczy INSERT pod RLS. Odmowy podnosi baza
 * (wyzwalacze `bookings_seat_limit` i `bookings_slot_rules`, indeks `bookings_rider_hour_key`): SB009 brak
 * miejsc, 23505 drugi zapis na tę godzinę, 23503 slot zniknął, 23514 poza godzinami, SB049–SB053 rodzaj slotu
 * i koń pensjonariusza (#115); wołający tłumaczy je przez `bookingErrorMessage`.
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
      ...(input.horseId === undefined ? {} : { horse_id: input.horseId }),
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return { id: data.id };
}

/**
 * „Zapisy do przyjęcia” właściciela (#124): zapisy oczekujące jego ośrodka od dziś — przez RPC
 * `get_pending_bookings`, bo jeździec z samym zapisem oczekującym nie jest „jeźdźcem ośrodka” i RLS profili
 * nie odda jego imienia ani adresu. Ośrodek bierze funkcja z sesji. Wygasłe odfiltrowuje `composePendingBookings`.
 */
export async function getPendingBookings(client: Client): Promise<PendingBooking[]> {
  const { data, error } = await client.rpc("get_pending_bookings");

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.booking_id,
    day: row.day,
    hour: row.hour,
    instructorId: row.instructor_id,
    instructorName: row.instructor_name,
    // Funkcja łączy plac i profil złączeniem zewnętrznym — wygenerowane typy tego nie wiedzą.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    placeName: row.place_name ?? null,
    kind: toSlotKind(row.kind),
    seats: row.seats,
    taken: row.taken,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderName: row.rider_name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderEmail: row.rider_email ?? null,
    createdAt: row.created_at,
    rejectedBefore: row.rejected_before,
  }));
}

/**
 * Przyjęcie zapisu oczekującego przez właściciela — RPC `accept_booking` (zapis staje się aktywny i zajmuje
 * miejsce). Odmowy podnosi baza: SB009 brak miejsc (także równoczesne przyjęcia), SB064 slot się zaczął,
 * SB065 zapis nie jest oczekujący, SB066 cudzy albo nieistniejący zapis, 23503 slotu nie ma w grafiku —
 * wołający tłumaczy je przez `acceptanceErrorMessage`.
 */
export async function acceptBooking(client: Client, bookingId: number): Promise<void> {
  const { error } = await client.rpc("accept_booking", { p_booking_id: bookingId });

  if (error) {
    throw error;
  }
}

/**
 * Odrzucenie zapisu oczekującego przez właściciela z powodem, który jeździec zobaczy — RPC `reject_booking`
 * (zapis staje się odrzucony, źródło „ośrodek ręcznie”). Odmowy podnosi baza: SB070 brak powodu, SB071 za długi
 * powód, SB064 slot się zaczął, SB065 zapis nie jest oczekujący, SB066 cudzy albo nieistniejący zapis —
 * wołający tłumaczy je przez `rejectionErrorMessage`.
 */
export async function rejectBooking(client: Client, bookingId: number, reason: string): Promise<void> {
  const { error } = await client.rpc("reject_booking", { p_booking_id: bookingId, p_reason: reason });

  if (error) {
    throw error;
  }
}

/**
 * Licznik zapisów do przyjęcia (#128) — RPC `count_pending_bookings`: właściciel liczy cały ośrodek, instruktor
 * z kontem swoje sloty, bez wygasłych. Zakres bierze baza z sesji.
 */
export async function countPendingBookings(client: Client): Promise<number> {
  const { data, error } = await client.rpc("count_pending_bookings");

  if (error) {
    throw error;
  }

  return data;
}
