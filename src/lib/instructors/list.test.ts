import { describe, expect, it } from "vitest";
import { composeInstructorList } from "@/lib/instructors/list";

/** 2030-05-14, 12:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2030-05-14T10:30:00Z");

const joanna = { id: 1, name: "Joanna Wrona", active: true };
const karol = { id: 2, name: "Karol Jasny", active: false };
const tomasz = { id: 3, name: "Tomasz Lis", active: false };

describe("composeInstructorList", () => {
  it("dzieli instruktorów na aktywnych i nieaktywnych, z zachowaniem kolejności listy", () => {
    const list = composeInstructorList([joanna, karol, tomasz], [], NOW);

    expect(list.active.map((i) => i.name)).toEqual(["Joanna Wrona"]);
    expect(list.inactive.map((i) => i.name)).toEqual(["Karol Jasny", "Tomasz Lis"]);
  });

  it("nieaktywny z wystawionymi miejscami dostaje notkę z liczbą dni, bez miejsc — żadnej", () => {
    const list = composeInstructorList(
      [joanna, karol, tomasz],
      [
        { instructorId: karol.id, day: "2030-05-15", hour: 10 },
        { instructorId: karol.id, day: "2030-05-16", hour: 10 },
        // Joanna jest aktywna — jej miejsca nie wymagają notki.
        { instructorId: joanna.id, day: "2030-05-15", hour: 10 },
      ],
      NOW,
    );

    expect(list.inactive).toEqual([
      { ...karol, note: "Nadal ma wystawione miejsca w 2 dniach — wyzeruj jego limity w grafiku." },
      { ...tomasz, note: null },
    ]);
  });

  it("pusta lista daje dwie puste grupy", () => {
    expect(composeInstructorList([], [], NOW)).toEqual({ active: [], inactive: [] });
  });
});
