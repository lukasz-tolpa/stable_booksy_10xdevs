import type { DayBooking } from "@/lib/bookings/queries";
import { hasSlotStarted, unknownInstructorName } from "@/lib/bookings/slots";
import { cancelledByLabel, isActiveBooking } from "@/lib/bookings/status";
import { horsesOnDay, type BoardingHorse } from "@/lib/boarding/month";
import { placeNamer, type PlaceName } from "@/lib/places/names";
import { SLOT_KIND, type SlotKind } from "@/lib/schedule/kind";
import type { SlotSeats } from "@/lib/schedule/queries";
import { seatKey } from "@/lib/schedule/sheet";

/**
 * Składanie listy zapisów dnia ośrodka (FR-005): aktywne (godzina, instruktor, jeździec, koń,
 * przydział konia, odwołanie) i pod nimi odwołane, z oznaczeniem, kto odwołał.
 *
 * Koń przy zapisie jest opcjonalny (ADR-0002) — przydziela go ośrodek. Nazwy koni dokłada się
 * z listy stada (także koni pensjonatowych). Przy slocie treningowym (#115) koniem jest koń pensjonatowy
 * zapisanego pensjonariusza z pobytem w dniu jazdy — tylko takie konie są do wyboru (regułę pilnuje baza,
 * `bookings_slot_rules`). `now` jest wstrzykiwane parametrem, żeby testy nie zależały od zegara.
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

/**
 * Miniony zapis, którego jeździec usunął konto (jeździec zanonimizowany, ADR-0001). Jedyna
 * definicja: lista zapisów dnia ośrodka i „Moje sloty” instruktora.
 */
export const ANONYMISED_RIDER = "Usunięty jeździec";

export interface HorseOption {
  id: number;
  name: string;
}

/** Aktywny zapis na liście dnia: z przydziałem konia i informacją, czy da się go jeszcze odwołać. */
export interface ActiveBookingRow {
  id: number;
  hour: number;
  instructorName: string;
  riderName: string;
  /** Plac slotu zapisu (#113); `null` — slotu nie ma w grafiku dnia (nie powinno się zdarzyć przy aktywnym). */
  placeName: string | null;
  /** Rodzaj slotu zapisu (#115); slotu spoza grafiku dnia — rekreacyjny, jak w bazie. */
  kind: SlotKind;
  /** Przydzielony koń; `null` — zapis bez konia (wiersz jest wyróżniony `NO_HORSE`). */
  horseId: number | null;
  /** Nazwa przydzielonego konia albo `NO_HORSE`. */
  horseName: string;
  /**
   * Konie do wyboru: przy slocie rekreacyjnym pracujące tego dnia, przy treningowym konie pensjonatowe
   * jeźdźca z pobytem w dniu jazdy — bez koni przydzielonych do innego aktywnego zapisu o tej samej godzinie
   * (baza i tak odmówi — indeks `bookings_horse_hour_key`).
   */
  horseOptions: HorseOption[];
  /**
   * Wybór „bez konia” (cofnięcie przydziału) — tylko przy slocie rekreacyjnym; zapis na slot treningowy zawsze
   * ma konia pensjonariusza (#112, odmowa bazy SB063).
   */
  noHorseChoice: boolean;
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

/** Koń pensjonatowy ośrodka z pensjonariuszem i pobytami — z `listBoardingHorses` (#114). */
export type DayBoardingHorse = Pick<BoardingHorse, "horseId" | "riderKey" | "stays">;

export interface DayBookingSectionsInput {
  bookings: DayBooking[];
  /** Całe stado stadniny — źródło nazw, także koni nieaktywnych. */
  horses: HorseOption[];
  /** Konie pracujące tego dnia (`schedule_day_horses`). */
  dayHorseIds: number[];
  /** Sloty dnia (`ScheduleDayData.seats`) — plac każdego slotu. */
  slots: SlotSeats[];
  /** Place ośrodka, także nieaktywne — źródło nazw. */
  places: PlaceName[];
  /** Konie pensjonatowe ośrodka z pobytami — konie do wyboru przy slotach treningowych (#115). */
  boardingHorses: readonly DayBoardingHorse[];
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

function placeOf(placeId: number | undefined, placeName: (placeId: number) => string): string | null {
  return placeId === undefined ? null : placeName(placeId);
}

function riderLabel(booking: DayBooking): string {
  return booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER);
}

export function composeDayBookingSections(input: DayBookingSectionsInput): DayBookingSections {
  const { bookings, horses, dayHorseIds, day, now = new Date() } = input;
  const placeName = placeNamer(input.places);
  const slotPlaces = new Map(input.slots.map((slot) => [seatKey(slot.instructorId, slot.hour), slot.placeId]));
  const slotKinds = new Map(input.slots.map((slot) => [seatKey(slot.instructorId, slot.hour), slot.kind]));
  const horseNames = new Map(horses.map((horse) => [horse.id, horse.name]));
  const named = (id: number): HorseOption => ({ id, name: horseNames.get(id) ?? unknownHorseName(id) });
  const dayHorses = dayHorseIds.map(named).sort(byName);
  // Konie pensjonatowe każdego pensjonariusza, których pobyt obejmuje dzień listy.
  const boarderHorses = new Map<string, HorseOption[]>();
  for (const horse of horsesOnDay(input.boardingHorses, day)) {
    if (horse.riderKey === null) continue;
    boarderHorses.set(horse.riderKey, [...(boarderHorses.get(horse.riderKey) ?? []), named(horse.horseId)]);
  }
  const activeBookings = bookings.filter(isActiveBooking);

  const active = activeBookings
    .map((booking): ActiveBookingRow => {
      const takenByOthers = new Set(
        activeBookings
          .filter((other) => other.id !== booking.id && other.hour === booking.hour && other.horseId !== null)
          .map((other) => other.horseId),
      );
      const kind = slotKinds.get(seatKey(booking.instructorId, booking.hour)) ?? SLOT_KIND.recreation;
      const candidates =
        kind === SLOT_KIND.training
          ? [...(booking.riderId === null ? [] : (boarderHorses.get(booking.riderId) ?? []))].sort(byName)
          : dayHorses;
      return {
        id: booking.id,
        hour: booking.hour,
        instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
        riderName: riderLabel(booking),
        placeName: placeOf(slotPlaces.get(seatKey(booking.instructorId, booking.hour)), placeName),
        kind,
        horseId: booking.horseId,
        horseName:
          booking.horseId === null ? NO_HORSE : (horseNames.get(booking.horseId) ?? unknownHorseName(booking.horseId)),
        horseOptions: candidates.filter((horse) => !takenByOthers.has(horse.id)),
        noHorseChoice: kind !== SLOT_KIND.training,
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
        cancelledByLabel: cancelledByLabel(booking.cancelledBy ?? "rider", "instructor"),
      }),
    )
    .sort(byHourInstructorRider);

  return { active, cancelled };
}
