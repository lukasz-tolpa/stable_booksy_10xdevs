import type { DayBooking } from "@/lib/bookings/queries";
import { hasSlotStarted, unknownInstructorName } from "@/lib/bookings/slots";
import { cancelledByLabel } from "@/lib/bookings/status";

/**
 * Składanie listy zapisów dnia ośrodka (FR-005): aktywne (godzina, instruktor, jeździec, koń,
 * wybór konia, odwołanie) i pod nimi odwołane, z oznaczeniem, kto odwołał.
 *
 * Koń przy zapisie jest opcjonalny (ADR-0002) — przydziela go ośrodek. Nazwy koni dokłada się
 * z listy stada, bo `bookings` wskazuje konia przez przydział do dnia, nie wprost. `now` jest
 * wstrzykiwane parametrem, żeby testy nie zależały od zegara.
 */

/**
 * Fallback dla profilu bez imienia i nazwiska — rejestracja go nie wymusza. Jedyna
 * definicja: ten sam tekst pokazują lista zapisów dnia i statystyki ośrodka.
 */
export const UNNAMED_RIDER = "(bez nazwiska)";

/** Zapis jeszcze bez przydzielonego konia na liście dnia ośrodka. */
export const NO_HORSE = "bez konia";

/**
 * Nazwa zastępcza konia, którego nie ma na liście stada. Taki koń nie powinien wystąpić
 * (FK przez `schedule_day_horses`), ale wiersz z identyfikatorem jest lepszy niż
 * wywrócenie listy albo tabeli. Jedyna definicja dla listy zapisów dnia i statystyk.
 */
export function unknownHorseName(horseId: number): string {
  return `(koń #${String(horseId)})`;
}

/** Miniony zapis, którego jeździec usunął konto (jeździec zanonimizowany, ADR-0001). */
const ANONYMISED_RIDER = "Usunięty jeździec";

export interface HorseOption {
  id: number;
  name: string;
}

/** Aktywny zapis na liście dnia: z wyborem konia i informacją, czy da się go jeszcze odwołać. */
export interface ActiveBookingRow {
  id: number;
  hour: number;
  instructorName: string;
  riderName: string;
  /** Przydzielony koń; `null` — zapis bez konia (wiersz jest wyróżniony `NO_HORSE`). */
  horseId: number | null;
  /** Nazwa przydzielonego konia albo `NO_HORSE`. */
  horseName: string;
  /**
   * Konie do wyboru: pracujące tego dnia, bez koni przydzielonych do innego aktywnego zapisu
   * o tej samej godzinie (baza i tak odmówi — indeks `bookings_horse_hour_key`).
   */
  horseOptions: HorseOption[];
  /** Godzina się nie zaczęła (Europe/Warsaw) — ten sam próg co przy odwołaniu przez jeźdźca. */
  cancellable: boolean;
}

/** Zapis odwołany na liście dnia — bez konia (przydział znika przy odwołaniu). */
export interface CancelledBookingRow {
  id: number;
  hour: number;
  instructorName: string;
  riderName: string;
  /** „przez jeźdźca" albo „przez ośrodek". */
  cancelledByLabel: string;
}

export interface DayBookingSections {
  active: ActiveBookingRow[];
  /** Pod aktywnymi, osobno (US 85). */
  cancelled: CancelledBookingRow[];
}

export interface DayBookingSectionsInput {
  bookings: DayBooking[];
  /** Całe stado stadniny — źródło nazw, także koni nieaktywnych. */
  horses: HorseOption[];
  /** Konie pracujące tego dnia (`schedule_day_horses`). */
  dayHorseIds: number[];
  /** Dzień listy, ISO. */
  day: string;
  /** Chwila, względem której liczymy próg „slot już się zaczął" (`hasSlotStarted`). */
  now?: Date;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pl");

function byHourInstructorRider<T extends { hour: number; instructorName: string; riderName: string }>(a: T, b: T) {
  return (
    a.hour - b.hour ||
    a.instructorName.localeCompare(b.instructorName, "pl") ||
    a.riderName.localeCompare(b.riderName, "pl")
  );
}

function riderLabel(booking: DayBooking): string {
  return booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER);
}

export function composeDayBookingSections(input: DayBookingSectionsInput): DayBookingSections {
  const { bookings, horses, dayHorseIds, day, now = new Date() } = input;
  const horseNames = new Map(horses.map((horse) => [horse.id, horse.name]));
  const dayHorses = dayHorseIds.map((id) => ({ id, name: horseNames.get(id) ?? unknownHorseName(id) })).sort(byName);
  const activeBookings = bookings.filter((booking) => booking.status === "active");

  const active = activeBookings
    .map((booking): ActiveBookingRow => {
      const takenByOthers = new Set(
        activeBookings
          .filter((other) => other.id !== booking.id && other.hour === booking.hour && other.horseId !== null)
          .map((other) => other.horseId),
      );
      return {
        id: booking.id,
        hour: booking.hour,
        instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
        riderName: riderLabel(booking),
        horseId: booking.horseId,
        horseName:
          booking.horseId === null ? NO_HORSE : (horseNames.get(booking.horseId) ?? unknownHorseName(booking.horseId)),
        horseOptions: dayHorses.filter((horse) => !takenByOthers.has(horse.id)),
        cancellable: !hasSlotStarted(day, booking.hour, now),
      };
    })
    .sort(byHourInstructorRider);

  const cancelled = bookings
    .filter((booking) => booking.status === "cancelled")
    .map(
      (booking): CancelledBookingRow => ({
        id: booking.id,
        hour: booking.hour,
        instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
        riderName: riderLabel(booking),
        // CHECK spójności: odwołany zapis zawsze ma `cancelled_by`.
        cancelledByLabel: cancelledByLabel(booking.cancelledBy ?? "rider", "stable"),
      }),
    )
    .sort(byHourInstructorRider);

  return { active, cancelled };
}
