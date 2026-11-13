import { computeSlotHours, type SlotHour } from "@/lib/bookings/slots";
import type { SlotSeats } from "@/lib/schedule/queries";
import { seatAt, seatKey, sheetRows, type HourRow, type SeatMap } from "@/lib/schedule/sheet";

/**
 * Dzień pokazany na ilustracjach strony głównej — jedyne źródło obu rysunków. Lista slotów
 * jeźdźca i arkusz limitów ośrodka liczą się z tych samych danych tymi samymi funkcjami
 * co prawdziwe widoki (`computeSlotHours`, `sheetRows`), więc nie mogą sobie przeczyć.
 */

const INSTRUCTORS = [
  { id: 1, name: "Joanna Wrona", sheetName: "Joanna" },
  { id: 2, name: "Karol Jasny", sheetName: "Karol" },
];

const OPEN_HOUR = 10;
const CLOSE_HOUR = 12;
const HORSE_COUNT = 3;

/**
 * Limity miejsc dnia; brak wpisu to limit 0. Instruktorzy jeżdżą na zmianę, bo jeździec
 * z zapisem o danej godzinie nie zapisze się w niej u drugiego instruktora - „Zapisz się”
 * i „Twój zapis” mogą stać obok siebie tylko w różnych godzinach.
 */
const SEATS: SlotSeats[] = [
  { instructorId: 1, hour: 10, seats: 3 },
  { instructorId: 2, hour: 11, seats: 2 },
];

/** Jedno miejsce zajęte u Joanny; u Karola komplet, w tym zapis oglądającego jeźdźca. */
const OCCUPANCY = [
  { instructorId: 1, hour: 10, taken: 1 },
  { instructorId: 2, hour: 11, taken: 2 },
];
const MY_BOOKINGS = [{ instructorId: 2, hour: 11 }];

/** Wiersz arkusza na ilustracji: limity w kolejności kolumn instruktorów i stan godziny. */
export interface LandingSheetRow extends HourRow {
  seats: number[];
}

export interface LandingDemo {
  /** Fragment listy slotów jeźdźca: godziny dnia z wystawionymi miejscami. */
  riderHours: SlotHour[];
  /** Fragment arkusza limitów ośrodka: wszystkie godziny dnia. */
  sheet: {
    /** Nagłówki kolumn — imiona instruktorów. */
    instructors: string[];
    horseCount: number;
    rows: LandingSheetRow[];
  };
}

export function landingDemo(): LandingDemo {
  const hours = Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, index) => OPEN_HOUR + index);
  const instructorIds = INSTRUCTORS.map((instructor) => instructor.id);
  const seatMap: SeatMap = Object.fromEntries(SEATS.map((slot) => [seatKey(slot.instructorId, slot.hour), slot.seats]));

  const riderHours = computeSlotHours({
    openHour: OPEN_HOUR,
    closeHour: CLOSE_HOUR,
    instructors: INSTRUCTORS,
    seats: SEATS,
    occupancy: OCCUPANCY,
    myBookings: MY_BOOKINGS,
    currentHour: null,
  });

  return {
    riderHours,
    sheet: {
      instructors: INSTRUCTORS.map((instructor) => instructor.sheetName),
      horseCount: HORSE_COUNT,
      rows: sheetRows(hours, instructorIds, seatMap, HORSE_COUNT).map((row) => ({
        ...row,
        seats: instructorIds.map((instructorId) => seatAt(seatMap, instructorId, row.hour)),
      })),
    },
  };
}
