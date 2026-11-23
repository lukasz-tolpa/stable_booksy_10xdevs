import { describe, expect, it } from "vitest";
import {
  columnKind,
  columnPlace,
  fillAll,
  fillKind,
  fillPlace,
  kindAt,
  lastRideLabel,
  parseSeatInput,
  placeAt,
  seatKey,
  sheetRows,
  stepSeat,
  withoutInstructor,
  workingHours,
  type KindMap,
  type PlaceMap,
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

  it("nie zmienia limitów, z których liczy", () => {
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
      { hour: 10, total: 2, fill: "free" },
      { hour: 11, total: 2, fill: "free" },
    ]);
  });

  it("godzina, w której limity zajmują wszystkie konie, jest pełna, a o jednego więcej — przekroczona", () => {
    const seats = seatMap([
      [KAROL, 10, 2],
      [OLA, 10, 1],
      [KAROL, 11, 2],
      [OLA, 11, 2],
    ]);

    expect(sheetRows([10, 11], [KAROL, OLA], seats, 3).map((row) => row.fill)).toEqual(["full", "over"]);
  });

  it("odznaczony instruktor nie wlicza się do sumy, choć formularz pamięta jego limity", () => {
    const seats = seatMap([
      [KAROL, 10, 1],
      [OLA, 10, 3],
    ]);

    expect(sheetRows([10], [KAROL], seats, 2)).toEqual([{ hour: 10, total: 1, fill: "free" }]);
  });

  it("godzina bez wystawionych miejsc przy koniach w dniu jest wolna, a nie pełna", () => {
    expect(sheetRows([10], [KAROL], {}, 2)).toEqual([{ hour: 10, total: 0, fill: "free" }]);
  });

  it("sloty treningowe nie zużywają koni ośrodka: liczą się tylko limity slotów rekreacyjnych", () => {
    const seats = seatMap([
      [KAROL, 10, 2],
      [OLA, 10, 3],
      [KAROL, 11, 1],
      [OLA, 11, 1],
    ]);
    const kinds: KindMap = { [seatKey(OLA, 10)]: "training", [seatKey(OLA, 11)]: "recreation" };

    expect(sheetRows([10, 11], [KAROL, OLA], seats, 2, kinds)).toEqual([
      { hour: 10, total: 2, fill: "full" },
      { hour: 11, total: 2, fill: "full" },
    ]);
  });

  it("rodzaj wiersza instruktora obejmuje jego godziny bez poprawki — cały wiersz treningowy nie liczy koni", () => {
    const seats = seatMap([
      [KAROL, 10, 4],
      [KAROL, 11, 4],
    ]);

    expect(sheetRows([10, 11], [KAROL], seats, 1, { [seatKey(KAROL, 10)]: "training" })).toEqual([
      { hour: 10, total: 0, fill: "free" },
      { hour: 11, total: 0, fill: "free" },
    ]);
  });

  it("dzień bez koni: godzina bez miejsc jest wolna, a każde wystawione miejsce ją przekracza", () => {
    const seats = seatMap([[KAROL, 11, 1]]);

    expect(sheetRows([10, 11], [KAROL], seats, 0)).toEqual([
      { hour: 10, total: 0, fill: "free" },
      { hour: 11, total: 1, fill: "over" },
    ]);
  });
});

describe("parseSeatInput", () => {
  it("liczba całkowita z pola to limit miejsc", () => {
    expect(parseSeatInput("3")).toBe(3);
    expect(parseSeatInput(" 12 ")).toBe(12);
  });

  it("puste pole, ujemna liczba albo tekst to limit 0", () => {
    expect(parseSeatInput("")).toBe(0);
    expect(parseSeatInput("-2")).toBe(0);
    expect(parseSeatInput("abc")).toBe(0);
  });

  it("ułamek obcina do całych miejsc", () => {
    expect(parseSeatInput("2.7")).toBe(2);
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

const HALA = 11;
const DUZY_PLAC = 12;

function placeMap(entries: [instructorId: number, hour: number, placeId: number][]): PlaceMap {
  return Object.fromEntries(entries.map(([instructorId, hour, placeId]) => [seatKey(instructorId, hour), placeId]));
}

describe("placeAt", () => {
  it("slot ma plac ustawiony dla swojej godziny", () => {
    const places = placeMap([
      [KAROL, 10, HALA],
      [KAROL, 11, DUZY_PLAC],
    ]);

    expect(placeAt(places, KAROL, 11, HALA)).toBe(DUZY_PLAC);
  });

  it("godzina bez placu dostaje plac wiersza instruktora — z jego najwcześniejszej godziny z placem", () => {
    const places = placeMap([
      [KAROL, 12, HALA],
      [KAROL, 11, DUZY_PLAC],
    ]);

    expect(placeAt(places, KAROL, 15, HALA)).toBe(DUZY_PLAC);
  });

  it("instruktor bez żadnego placu dostaje plac domyślny; bez placu domyślnego — brak placu", () => {
    const places = placeMap([[KAROL, 10, DUZY_PLAC]]);

    expect(placeAt(places, OLA, 10, HALA)).toBe(HALA);
    expect(placeAt(places, OLA, 10, null)).toBeNull();
  });
});

describe("columnPlace", () => {
  it("plac całego wiersza instruktora, gdy wszystkie jego godziny są na jednym placu", () => {
    const places = placeMap([
      [KAROL, 10, DUZY_PLAC],
      [KAROL, 11, DUZY_PLAC],
    ]);

    expect(columnPlace(places, KAROL, [10, 11, 12], HALA)).toBe(DUZY_PLAC);
  });

  it("godziny na różnych placach nie mają jednego placu wiersza", () => {
    const places = placeMap([
      [KAROL, 10, DUZY_PLAC],
      [KAROL, 11, HALA],
    ]);

    expect(columnPlace(places, KAROL, [10, 11], HALA)).toBeNull();
  });
});

describe("fillPlace", () => {
  it("ustawia plac całego wiersza w godzinach zakresu i tylko danemu instruktorowi; poprawka godziny zostaje możliwa", () => {
    const places = placeMap([
      [KAROL, 10, HALA],
      [OLA, 10, HALA],
    ]);

    const filled = fillPlace(places, KAROL, [10, 11], DUZY_PLAC);
    const corrected = { ...filled, [seatKey(KAROL, 11)]: HALA };

    expect(filled).toEqual(
      placeMap([
        [KAROL, 10, DUZY_PLAC],
        [KAROL, 11, DUZY_PLAC],
        [OLA, 10, HALA],
      ]),
    );
    expect(placeAt(corrected, KAROL, 11, HALA)).toBe(HALA);
    expect(columnPlace(corrected, KAROL, [10, 11], HALA)).toBeNull();
  });
});

describe("kindAt", () => {
  it("slot bez żadnego rodzaju w wierszu jest rekreacyjny — jak nowy slot w bazie", () => {
    expect(kindAt({}, KAROL, 10)).toBe("recreation");
  });

  it("godzina bez rodzaju dostaje rodzaj wiersza instruktora, a poprawka godziny wygrywa", () => {
    const kinds: KindMap = { [seatKey(KAROL, 10)]: "training", [seatKey(KAROL, 12)]: "recreation" };

    expect(kindAt(kinds, KAROL, 11)).toBe("training");
    expect(kindAt(kinds, KAROL, 12)).toBe("recreation");
    expect(kindAt(kinds, OLA, 11)).toBe("recreation");
  });
});

describe("columnKind i fillKind", () => {
  it("rodzaj całego wiersza ustawia się naraz, a różne rodzaje godzin nie mają jednego rodzaju wiersza", () => {
    const filled = fillKind({ [seatKey(OLA, 10)]: "training" }, KAROL, [10, 11], "training");

    expect(columnKind(filled, KAROL, [10, 11])).toBe("training");
    expect(kindAt(filled, OLA, 10)).toBe("training");
    expect(columnKind({ ...filled, [seatKey(KAROL, 11)]: "recreation" }, KAROL, [10, 11])).toBeNull();
  });
});
