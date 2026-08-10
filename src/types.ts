import type { Database } from "@/db/database.types";

/**
 * Wspoldzielone typy domenowe. Slice'y importuja stad, nie z pliku generowanego -
 * dzieki temu zmiana ksztaltu `database.types.ts` nie rozlewa sie po calym kodzie.
 */

type Tables = Database["public"]["Tables"];

/** Rola konta ustawiana przy rejestracji; zrodlem prawdy jest check constraint na public.profiles. */
export type UserRole = "stable" | "rider";

/** Cykl zycia zapisu. Odwolanie nie kasuje wiersza, tylko przestawia status. */
export type BookingStatus = "active" | "cancelled";

export type Profile = Tables["profiles"]["Row"];
export type Stable = Tables["stables"]["Row"];
export type Horse = Tables["horses"]["Row"];
export type ScheduleDay = Tables["schedule_days"]["Row"];
export type ScheduleDayHorse = Tables["schedule_day_horses"]["Row"];
export type Booking = Tables["bookings"]["Row"];

export type StableInsert = Tables["stables"]["Insert"];
export type HorseInsert = Tables["horses"]["Insert"];
export type ScheduleDayInsert = Tables["schedule_days"]["Insert"];
export type ScheduleDayHorseInsert = Tables["schedule_day_horses"]["Insert"];
export type BookingInsert = Tables["bookings"]["Insert"];
