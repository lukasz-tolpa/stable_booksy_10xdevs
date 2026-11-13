import { describe, expect, it } from "vitest";
import {
  fillAll,
  lastRideLabel,
  seatKey,
  sheetRows,
  stepSeat,
  withoutInstructor,
  workingHours,
  type SeatMap,
} from "@/lib/schedule/sheet";

const KAROL = 1;
const OLA = 2;

function seatMap(entries: [instructorId: number, hour: number, seats: number][]): SeatMap {
  return Object.fromEntries(entries.map(([instructorId, hour, seats]) => [seatKey(instructorId, hour), seats]));
}

describe("fillAll", () => {
  it("ustawia limit tylko w godzinach zakresu i tylko danemu instruktorowi", () => {
    const seats = seatMap([
      [KAROL, 9, 4],
      [KAROL, 10, 1],
      [OLA, 10, 1],
    ]);

    expect(fillAll(seats, KAROL, [10, 11], 2)).toEqual(
      seatMap([
        [KAROL, 9, 4],
        [KAROL, 10, 2],
        [KAROL, 11, 2],
        [OLA, 10, 1],
      ]),
    );
  });

  it("„wyczyść” zeruje limity instruktora w godzinach zakresu", () => {
    const seats = seatMap([
      [KAROL, 10, 2],
      [OLA, 10, 1],
    ]);

    expect(fillAll(seats, KAROL, [10], 0)).toEqual(
      seatMap([
        [KAROL, 10, 0],
        [OLA, 10, 1],
      ]),
    );
  });

  it("nie zmienia szkicu, z którego liczy", () => {
    const seats = seatMap([[KAROL, 10, 1]]);

    fillAll(seats, KAROL, [10], 3);

    expect(seats).toEqual(seatMap([[KAROL, 10, 1]]));
  });
});

describe("withoutInstructor", () => {
  it("usuwa wszystkie limity instruktora, także spoza zakresu, a innych nie rusza", () => {
    const seats = seatMap([
      [KAROL, 9, 4],
      [KAROL, 10, 1],
      [OLA, 10, 1],
      [11, 10, 2],
    ]);

    expect(withoutInstructor(seats, KAROL)).toEqual(
      seatMap([
        [OLA, 10, 1],
        [11, 10, 2],
      ]),
    );
  });
});

describe("sheetRows", () => {
  it("sumuje limity instruktorów w każdej godzinie; godzina z wolnymi końmi jest wolna", () => {
    const seats = seatMap([
      [KAROL, 10, 1],
      [OLA, 10, 1],
      [KAROL, 11, 2],
    ]);

    expect(sheetRows([10, 11], [KAROL, OLA], seats, 3)).toEqual([
      { hour: 10, total: 2, load: "free" },
      { hour: 11, total: 2, load: "free" },
    ]);
  });

  it("godzina, w której limity zajmują wszystkie konie, jest pełna, a o jednego więcej — przekroczona", () => {
    const seats = seatMap([
      [KAROL, 10, 2],
      [OLA, 10, 1],
      [KAROL, 11, 2],
      [OLA, 11, 2],
    ]);

    expect(sheetRows([10, 11], [KAROL, OLA], seats, 3).map((row) => row.load)).toEqual(["full", "over"]);
  });

  it("odznaczony instruktor nie wlicza się do sumy, choć szkic pamięta jego limity", () => {
    const seats = seatMap([
      [KAROL, 10, 1],
      [OLA, 10, 3],
    ]);

    expect(sheetRows([10], [KAROL], seats, 2)).toEqual([{ hour: 10, total: 1, load: "free" }]);
  });

  it("dzień bez koni: godzina bez miejsc jest wolna, a każde wystawione miejsce ją przekracza", () => {
    const seats = seatMap([[KAROL, 11, 1]]);

    expect(sheetRows([10, 11], [KAROL], seats, 0)).toEqual([
      { hour: 10, total: 0, load: "free" },
      { hour: 11, total: 1, load: "over" },
    ]);
  });
});

describe("stepSeat", () => {
  it("plus i minus zmieniają limit miejsc o jedno", () => {
    expect(stepSeat(1, 1)).toBe(2);
    expect(stepSeat(2, -1)).toBe(1);
  });

  it("minus przy zerze zostawia zero", () => {
    expect(stepSeat(0, -1)).toBe(0);
  });
});

describe("lastRideLabel", () => {
  it("zakres 10–16 mówi, że ostatnia jazda jest o 15:00", () => {
    expect(lastRideLabel("10", "16")).toBe("ostatnia jazda o 15:00");
  });

  it("pusty i odwrócony zakres nie mają ostatniej jazdy", () => {
    expect(lastRideLabel("12", "12")).toBeNull();
    expect(lastRideLabel("16", "10")).toBeNull();
  });

  it("niewybrana godzina nie ma ostatniej jazdy", () => {
    expect(lastRideLabel("", "16")).toBeNull();
  });
});

describe("workingHours", () => {
  it("zakres 10–16 daje godziny jazd od 10 do 15 (zamknięcie wyłącznie)", () => {
    expect(workingHours("10", "16")).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("pusty i odwrócony zakres nie dają żadnej godziny", () => {
    expect(workingHours("12", "12")).toEqual([]);
    expect(workingHours("16", "10")).toEqual([]);
  });

  it("niewybrana godzina otwarcia albo zamknięcia nie daje żadnej godziny (a nie zakresu od 0:00)", () => {
    expect(workingHours("", "3")).toEqual([]);
    expect(workingHours("10", "")).toEqual([]);
  });

  it("zakres poza dobą albo z ułamkiem godziny nie daje żadnej godziny", () => {
    expect(workingHours("-1", "3")).toEqual([]);
    expect(workingHours("22", "25")).toEqual([]);
    expect(workingHours("10.5", "12")).toEqual([]);
    expect(workingHours("abc", "12")).toEqual([]);
  });

  it("cała doba to godziny od 0 do 23", () => {
    expect(workingHours("0", "24")).toHaveLength(24);
  });
});
