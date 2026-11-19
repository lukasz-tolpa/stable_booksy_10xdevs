import { describe, expect, it } from "vitest";
import { composeInstructorList } from "@/lib/instructors/list";

/** 2030-05-14, 12:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2030-05-14T10:30:00Z");

const marek = { id: 4, name: "Marek Dębowski", active: true };
const joanna = { id: 1, name: "Joanna Wrona", active: true };
const karol = { id: 2, name: "Karol Jasny", active: false };
const tomasz = { id: 3, name: "Tomasz Lis", active: false };
const ewa = { id: 5, name: "Ewa Rzecka", active: true };

/** Konta instruktorów ośrodka (`list_instructor_accounts`): Marek to właściciel, Ewa ma konto bez praw właściciela. */
const ACCOUNTS = [
  { instructor_id: marek.id, owner: true, arranges_schedule: false },
  { instructor_id: ewa.id, owner: false, arranges_schedule: false },
];

describe("composeInstructorList", () => {
  it("dzieli instruktorów na aktywnych i nieaktywnych, z zachowaniem kolejności listy", () => {
    const list = composeInstructorList([joanna, karol, tomasz], [], [], ACCOUNTS, NOW);

    expect(list.active.map((i) => i.name)).toEqual(["Joanna Wrona"]);
    expect(list.inactive.map((i) => i.name)).toEqual(["Karol Jasny", "Tomasz Lis"]);
  });

  it("oznacza właściciela — instruktora powiązanego z kontem właściciela ośrodka — i tylko jego", () => {
    const list = composeInstructorList([joanna, marek], [], [], ACCOUNTS, NOW);

    expect(list.active.map((i) => [i.name, i.owner])).toEqual([
      ["Joanna Wrona", false],
      ["Marek Dębowski", true],
    ]);
  });

  it("instruktor z kontem innym niż konto właściciela nie jest właścicielem", () => {
    expect(composeInstructorList([ewa], [], [], ACCOUNTS, NOW).active[0]?.owner).toBe(false);
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
      [],
      ACCOUNTS,
      NOW,
    );

    expect(list.inactive.map((i) => [i.name, i.note])).toEqual([
      ["Karol Jasny", "Nadal ma wystawione miejsca w 2 dniach — wyzeruj jego limity w grafiku."],
      ["Tomasz Lis", null],
    ]);
  });

  it("pusta lista daje dwie puste grupy", () => {
    expect(composeInstructorList([], [], [], [], NOW)).toEqual({ active: [], inactive: [] });
  });
});

describe("composeInstructorList — stan konta", () => {
  const karolActive = { ...karol, active: true };
  // Wygasa 21 maja o 0:30 czasu warszawskiego — w UTC to jeszcze 20 maja.
  const joannaInvitation = {
    instructor_id: joanna.id,
    email: "joanna@example.com",
    expires_at: "2030-05-20T22:30:00Z",
  };

  it("przy każdym aktywnym: z kontem, zaproszenie ważne do dnia (w Warszawie) z adresem albo bez konta", () => {
    const list = composeInstructorList([marek, ewa, joanna, karolActive], [], [joannaInvitation], ACCOUNTS, NOW);

    expect(list.active.map((i) => [i.name, i.account])).toEqual([
      ["Marek Dębowski", { kind: "account", label: "Z kontem" }],
      ["Ewa Rzecka", { kind: "account", label: "Z kontem" }],
      ["Joanna Wrona", { kind: "invited", label: "Zaproszenie ważne do 21 maja", email: "joanna@example.com" }],
      ["Karol Jasny", { kind: "none", label: "Bez konta" }],
    ]);
  });

  it("nieaktywny ma stan konta, ale nigdy zaproszenia — zaproszenie dostaje tylko aktywny", () => {
    const list = composeInstructorList(
      [karol],
      [],
      [{ instructor_id: karol.id, email: "karol@example.com", expires_at: "2030-05-20T10:00:00Z" }],
      ACCOUNTS,
      NOW,
    );

    expect(list.inactive[0]?.account).toEqual({ kind: "none", label: "Bez konta" });
  });

  it("instruktor z kontem jest „z kontem” nawet przy pozostałym zaproszeniu", () => {
    const list = composeInstructorList(
      [ewa],
      [],
      [{ instructor_id: ewa.id, email: "ewa@example.com", expires_at: "2030-05-20T10:00:00Z" }],
      ACCOUNTS,
      NOW,
    );

    expect(list.active[0]?.account.kind).toBe("account");
  });

  it("zaproszenie: „Zaproś” z pustym adresem bez konta, „Zaproś ponownie” z adresem poprzedniego, bez przycisku z kontem", () => {
    const list = composeInstructorList([marek, joanna, karolActive], [], [joannaInvitation], ACCOUNTS, NOW);

    expect(list.active.map((i) => [i.name, i.invite])).toEqual([
      ["Marek Dębowski", null],
      ["Joanna Wrona", { summary: "Zaproś ponownie", defaultEmail: "joanna@example.com" }],
      ["Karol Jasny", { summary: "Zaproś", defaultEmail: "" }],
    ]);
  });
});

describe("composeInstructorList — przełącznik „Układa grafik”", () => {
  const karolActive = { ...karol, active: true };
  const joannaInvitation = {
    instructor_id: joanna.id,
    email: "joanna@example.com",
    expires_at: "2030-05-20T22:30:00Z",
  };

  it("pokazuje przełącznik tylko aktywnemu instruktorowi z kontem, poza właścicielem", () => {
    const list = composeInstructorList([marek, ewa, joanna, karolActive], [], [joannaInvitation], ACCOUNTS, NOW);

    expect(list.active.map((i) => [i.name, i.schedulePermission])).toEqual([
      ["Marek Dębowski", null],
      ["Ewa Rzecka", { granted: false }],
      // Nieprzyjęte zaproszenie to jeszcze nie konto.
      ["Joanna Wrona", null],
      ["Karol Jasny", null],
    ]);
  });

  it("przełącznik pokazuje, czy instruktor ma uprawnienie", () => {
    const list = composeInstructorList(
      [ewa],
      [],
      [],
      [{ instructor_id: ewa.id, owner: false, arranges_schedule: true }],
      NOW,
    );

    expect(list.active[0]?.schedulePermission).toEqual({ granted: true });
  });

  it("nieaktywny z kontem nie ma przełącznika", () => {
    const list = composeInstructorList(
      [karol],
      [],
      [],
      [{ instructor_id: karol.id, owner: false, arranges_schedule: false }],
      NOW,
    );

    expect(list.inactive[0]).not.toHaveProperty("schedulePermission");
  });
});
