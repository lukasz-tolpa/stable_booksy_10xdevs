import { describe, expect, it } from "vitest";
import { composeInstructorList } from "@/lib/instructors/list";

/** 2030-05-14, 12:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2030-05-14T10:30:00Z");

const OWNER_ACCOUNT = "11111111-1111-1111-1111-111111111111";

const marek = { id: 4, name: "Marek Dębowski", active: true, account_id: OWNER_ACCOUNT };
const joanna = { id: 1, name: "Joanna Wrona", active: true, account_id: null };
const karol = { id: 2, name: "Karol Jasny", active: false, account_id: null };
const tomasz = { id: 3, name: "Tomasz Lis", active: false, account_id: null };

describe("composeInstructorList", () => {
  it("dzieli instruktorów na aktywnych i nieaktywnych, z zachowaniem kolejności listy", () => {
    const list = composeInstructorList([joanna, karol, tomasz], [], OWNER_ACCOUNT, NOW);

    expect(list.active.map((i) => i.name)).toEqual(["Joanna Wrona"]);
    expect(list.inactive.map((i) => i.name)).toEqual(["Karol Jasny", "Tomasz Lis"]);
  });

  it("oznacza właściciela — instruktora powiązanego z kontem właściciela ośrodka — i tylko jego", () => {
    const list = composeInstructorList([joanna, marek], [], OWNER_ACCOUNT, NOW);

    expect(list.active.map((i) => [i.name, i.owner])).toEqual([
      ["Joanna Wrona", false],
      ["Marek Dębowski", true],
    ]);
  });

  it("instruktor z kontem innym niż konto właściciela nie jest właścicielem", () => {
    const ewa = { id: 5, name: "Ewa Rzecka", active: true, account_id: "22222222-2222-2222-2222-222222222222" };

    expect(composeInstructorList([ewa], [], OWNER_ACCOUNT, NOW).active[0]?.owner).toBe(false);
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
      OWNER_ACCOUNT,
      NOW,
    );

    expect(list.inactive.map((i) => [i.name, i.note])).toEqual([
      ["Karol Jasny", "Nadal ma wystawione miejsca w 2 dniach — wyzeruj jego limity w grafiku."],
      ["Tomasz Lis", null],
    ]);
  });

  it("pusta lista daje dwie puste grupy", () => {
    expect(composeInstructorList([], [], OWNER_ACCOUNT, NOW)).toEqual({ active: [], inactive: [] });
  });
});
