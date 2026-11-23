import { describe, expect, it } from "vitest";
import {
  bellBadge,
  bellLabel,
  composeNotifications,
  countUnread,
  notificationViewerOf,
  toStoredNotificationKind,
  type NotificationsInput,
  type PendingRiderBooking,
  type StoredNotification,
} from "@/lib/notifications/notifications";

/** 2026-11-24, 12:30 w Warszawie (czas zimowy, UTC+1). */
const NOW = new Date("2026-11-24T11:30:00Z");

function stored(overrides: Partial<StoredNotification>): StoredNotification {
  return {
    id: 1,
    kind: "booking_accepted",
    bookingId: 10,
    reason: null,
    createdAt: "2026-11-23T09:00:00+00:00",
    day: "2026-11-25",
    hour: 11,
    instructorName: "Joanna Wrona",
    stableName: "Stadnina Pod Dębem",
    riderName: "Anna Kowalska",
    ...overrides,
  };
}

function pendingBooking(overrides: Partial<PendingRiderBooking>): PendingRiderBooking {
  return {
    id: 20,
    day: "2026-11-24",
    hour: 11,
    instructorName: "Joanna Wrona",
    stableName: "Stadnina Pod Dębem",
    ...overrides,
  };
}

function input(overrides: Partial<NotificationsInput>): NotificationsInput {
  return { viewer: "rider", stored: [], pendingBookings: [], seenAt: null, ...overrides };
}

describe("composeNotifications", () => {
  it("najnowsze powiadomienie jest na górze", () => {
    const items = composeNotifications(
      input({
        stored: [
          stored({ id: 1, createdAt: "2026-11-22T09:00:00+00:00" }),
          stored({ id: 2, createdAt: "2026-11-23T09:00:00+00:00" }),
          stored({ id: 3, createdAt: "2026-11-21T09:00:00+00:00" }),
        ],
      }),
      NOW,
    );

    expect(items.map((item) => item.key)).toEqual(["n2", "n1", "n3"]);
  });

  it("bez otwarcia strony wszystkie są nieprzeczytane, po otwarciu — tylko nowsze od niego", () => {
    const notifications = [
      stored({ id: 1, createdAt: "2026-11-22T09:00:00+00:00" }),
      stored({ id: 2, createdAt: "2026-11-23T09:00:00+00:00" }),
    ];

    expect(composeNotifications(input({ stored: notifications }), NOW).map((item) => item.unread)).toEqual([
      true,
      true,
    ]);
    expect(
      composeNotifications(input({ stored: notifications, seenAt: "2026-11-22T12:00:00+00:00" }), NOW).map(
        (item) => item.unread,
      ),
    ).toEqual([true, false]);
  });
});

describe("countUnread", () => {
  it("liczy powiadomienia nowsze od ostatniego otwarcia strony", () => {
    const notifications = [
      stored({ id: 1, createdAt: "2026-11-22T09:00:00+00:00" }),
      stored({ id: 2, createdAt: "2026-11-23T09:00:00+00:00" }),
      stored({ id: 3, createdAt: "2026-11-23T10:00:00+00:00" }),
    ];

    expect(countUnread(input({ stored: notifications, seenAt: "2026-11-23T09:00:00+00:00" }), NOW)).toBe(1);
    expect(countUnread(input({ stored: notifications, seenAt: "2026-11-24T00:00:00+00:00" }), NOW)).toBe(0);
  });
});

describe("wygaśnięcie zapisu", () => {
  it("zapis oczekujący, którego slot się zaczął, daje powiadomienie o wygaśnięciu z czasem startu slotu", () => {
    const items = composeNotifications(
      input({
        pendingBookings: [
          pendingBooking({ id: 20, day: "2026-11-24", hour: 11 }),
          pendingBooking({ id: 21, day: "2026-11-24", hour: 13 }),
          pendingBooking({ id: 22, day: "2026-11-25", hour: 10 }),
        ],
      }),
      NOW,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "e20", kind: "booking_expired", at: new Date("2026-11-24T10:00:00Z") });
  });

  it("czas wygaśnięcia w czasie letnim to też start slotu w Warszawie", () => {
    const [item] = composeNotifications(
      input({ pendingBookings: [pendingBooking({ day: "2026-07-01", hour: 11 })] }),
      NOW,
    );

    expect(item.at).toEqual(new Date("2026-07-01T09:00:00Z"));
  });

  it("wygaśnięcie jest nieprzeczytane, gdy slot zaczął się po ostatnim otwarciu strony", () => {
    const pendingBookings = [pendingBooking({ day: "2026-11-24", hour: 11 })];

    expect(countUnread(input({ pendingBookings, seenAt: "2026-11-24T09:59:00Z" }), NOW)).toBe(1);
    expect(countUnread(input({ pendingBookings, seenAt: "2026-11-24T10:30:00Z" }), NOW)).toBe(0);
  });

  it("wygaśnięcia i powiadomienia zapisane układają się razem po czasie", () => {
    const items = composeNotifications(
      input({
        stored: [
          stored({ id: 1, createdAt: "2026-11-24T09:00:00Z" }),
          stored({ id: 2, createdAt: "2026-11-24T11:00:00Z" }),
        ],
        pendingBookings: [pendingBooking({ id: 20, day: "2026-11-24", hour: 11 })],
      }),
      NOW,
    );

    expect(items.map((item) => item.key)).toEqual(["n2", "e20", "n1"]);
  });

  it("ośrodek nie dostaje wygaśnięć", () => {
    const items = composeNotifications(
      input({ viewer: "owner", pendingBookings: [pendingBooking({ day: "2026-11-24", hour: 11 })] }),
      NOW,
    );

    expect(items).toEqual([]);
  });
});

describe("treść i cel powiadomienia", () => {
  it.each([
    ["booking_accepted", "Ośrodek przyjął Twój zapis", "/jezdziec/zapisy"],
    ["booking_rejected", "Ośrodek odrzucił Twój zapis", "/jezdziec/zapisy"],
    ["booking_cancelled_by_stable", "Ośrodek odwołał Twój zapis", "/jezdziec/zapisy"],
  ] as const)("jeździec: %s — „%s”, prowadzi do „Moich zapisów”", (kind, title, href) => {
    const [item] = composeNotifications(input({ stored: [stored({ kind })] }), NOW);

    expect(item).toMatchObject({
      title,
      subject: "Stadnina Pod Dębem",
      day: "2026-11-25",
      hour: 11,
      instructorName: "Joanna Wrona",
      href,
    });
  });

  it("odrzucenie niesie powód", () => {
    const [item] = composeNotifications(
      input({ stored: [stored({ kind: "booking_rejected", reason: "Brak miejsc" })] }),
      NOW,
    );

    expect(item.reason).toBe("Brak miejsc");
  });

  it("wygaśnięcie: „Zapis nie przyjęty w terminie”, prowadzi do „Moich zapisów”", () => {
    const [item] = composeNotifications(input({ pendingBookings: [pendingBooking({})] }), NOW);

    expect(item).toMatchObject({
      title: "Zapis nie przyjęty w terminie",
      subject: "Stadnina Pod Dębem",
      day: "2026-11-24",
      hour: 11,
      instructorName: "Joanna Wrona",
      reason: null,
      href: "/jezdziec/zapisy",
    });
  });

  it.each([
    ["owner", "booking_pending", "Nowy zapis czeka na przyjęcie", "/osrodek/zapisy-do-przyjecia"],
    ["owner", "booking_cancelled_by_rider", "Jeździec odwołał zapis", "/osrodek/zapisy?dzien=2026-11-25"],
    ["instructor", "booking_pending", "Nowy zapis czeka na przyjęcie", "/instruktor/zapisy-do-przyjecia"],
    ["instructor", "booking_cancelled_by_rider", "Jeździec odwołał zapis", "/instruktor"],
  ] as const)("%s: %s — „%s”, prowadzi do %s", (viewer, kind, title, href) => {
    const [item] = composeNotifications(input({ viewer, stored: [stored({ kind })] }), NOW);

    expect(item).toMatchObject({ title, subject: "Anna Kowalska", href });
  });

  it("jeździec anonimizowany w powiadomieniu ośrodka", () => {
    const [item] = composeNotifications(
      input({ viewer: "owner", stored: [stored({ kind: "booking_cancelled_by_rider", riderName: null })] }),
      NOW,
    );

    expect(item.subject).toBe("(jeździec)");
  });
});

describe("notificationViewerOf", () => {
  it.each([
    ["rider", null, "rider"],
    ["instructor", "owner", "owner"],
    ["instructor", "instructor", "instructor"],
    ["instructor", "arranging-instructor", "instructor"],
    ["instructor", "none", null],
    ["instructor", "inactive", null],
    ["instructor", null, null],
  ] as const)("konto %s (%s) — %s", (role, standing, viewer) => {
    expect(notificationViewerOf(role, standing)).toBe(viewer);
  });
});

describe("toStoredNotificationKind", () => {
  it("zna rodzaje zapisywane przez bazę i odrzuca nieznany", () => {
    expect(toStoredNotificationKind("booking_rejected")).toBe("booking_rejected");
    expect(() => toStoredNotificationKind("booking_expired")).toThrow("Nieznany rodzaj powiadomienia");
  });
});

describe("dzwonek", () => {
  it("podpis mówi, ile jest nieprzeczytanych", () => {
    expect(bellLabel(0)).toBe("Powiadomienia");
    expect(bellLabel(1)).toBe("Powiadomienia (1 nieprzeczytane)");
    expect(bellLabel(3)).toBe("Powiadomienia (3 nieprzeczytane)");
    expect(bellLabel(5)).toBe("Powiadomienia (5 nieprzeczytanych)");
  });

  it("liczba na dzwonku: brak przy zerze, powyżej 99 — „99+”", () => {
    expect(bellBadge(0)).toBeNull();
    expect(bellBadge(7)).toBe("7");
    expect(bellBadge(100)).toBe("99+");
  });
});
