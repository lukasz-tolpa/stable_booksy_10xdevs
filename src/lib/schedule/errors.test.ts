import { describe, expect, it } from "vitest";
import {
  FOREIGN_KEY_VIOLATION,
  HORSE_HAS_BOOKINGS,
  HORSE_NOT_IN_STABLE,
  INSTRUCTOR_HAS_BOOKINGS,
  INSTRUCTOR_INACTIVE,
  INSTRUCTOR_NOT_IN_STABLE,
  PLACE_CHANGE_HAS_BOOKINGS,
  PLACE_INACTIVE,
  PLACE_NOT_IN_STABLE,
  SCHEDULE_DATE_CONFLICT,
  SCHEDULE_DAY_PAST,
  SCHEDULE_HOURS_CONFLICT,
  SEATS_BELOW_BOOKINGS,
  SCHEDULE_PERMISSION_MISSING,
  SEATS_EXCEED_HORSES,
  isScheduleRefusal,
  parseRefusalDetail,
  pluralizeBookings,
  scheduleErrorMessage,
} from "@/lib/schedule/errors";

describe("isScheduleRefusal", () => {
  it.each([
    SCHEDULE_DATE_CONFLICT,
    SCHEDULE_HOURS_CONFLICT,
    FOREIGN_KEY_VIOLATION,
    HORSE_NOT_IN_STABLE,
    HORSE_HAS_BOOKINGS,
    INSTRUCTOR_NOT_IN_STABLE,
    INSTRUCTOR_INACTIVE,
    SEATS_EXCEED_HORSES,
    SCHEDULE_DAY_PAST,
    SEATS_BELOW_BOOKINGS,
    INSTRUCTOR_HAS_BOOKINGS,
    PLACE_NOT_IN_STABLE,
    PLACE_INACTIVE,
    PLACE_CHANGE_HAS_BOOKINGS,
  ])("kod %s to odmowa reguły grafiku", (code) => {
    expect(isScheduleRefusal(code)).toBe(true);
  });

  it.each([[undefined], [""], ["42501"], ["22023"], ["PGRST301"]])("kod %s to awaria warta logu", (code) => {
    expect(isScheduleRefusal(code)).toBe(false);
  });
});

describe("pluralizeBookings", () => {
  it("odmienia poprawnie", () => {
    expect(pluralizeBookings(1)).toBe("zapis");
    expect(pluralizeBookings(2)).toBe("zapisy");
    expect(pluralizeBookings(4)).toBe("zapisy");
    expect(pluralizeBookings(5)).toBe("zapisów");
    expect(pluralizeBookings(0)).toBe("zapisów");
  });

  it("obsługuje nastki, które łamią regułę końcówki", () => {
    expect(pluralizeBookings(12)).toBe("zapisów");
    expect(pluralizeBookings(13)).toBe("zapisów");
    expect(pluralizeBookings(14)).toBe("zapisów");
    expect(pluralizeBookings(22)).toBe("zapisy");
    expect(pluralizeBookings(25)).toBe("zapisów");
  });
});

describe("parseRefusalDetail", () => {
  // Kontrakt z migracją 20261116090000: liczby odmowy idą w DETAIL jako obiekt JSON.
  it("odczytuje liczby z pola DETAIL", () => {
    expect(parseRefusalDetail('{"hour": 13, "seats": 3, "horses": 2}')).toEqual({ hour: 13, seats: 3, horses: 2 });
    expect(parseRefusalDetail('{"bookings": 4}')).toEqual({ bookings: 4 });
  });

  it.each([[undefined], [""], ["nie json"], ["[1,2]"], ["null"], ["7"]])("pole %j daje pusty odczyt", (detail) => {
    expect(parseRefusalDetail(detail)).toEqual({});
  });

  it("pomija pola, które nie są nieujemnymi liczbami całkowitymi", () => {
    expect(parseRefusalDetail('{"hour": "13", "seats": -1, "horses": 1.5, "bookings": 2}')).toEqual({ bookings: 2 });
  });
});

describe("scheduleErrorMessage", () => {
  it("różnicuje konflikt godzin i konflikt daty", () => {
    const godziny = scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 2}');
    const data = scheduleErrorMessage(SCHEDULE_DATE_CONFLICT, '{"bookings": 2}');

    expect(godziny).not.toBe(data);
    expect(godziny).toContain("zawęzić godzin");
    expect(data).toBe("Nie można zmienić daty dnia, który ma 2 zapisy.");
  });

  it("podaje liczbę kolidujących zapisów we właściwej odmianie", () => {
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 1}')).toContain("1 zapis.");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 3}')).toContain("3 zapisy");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 7}')).toContain("7 zapisów");
  });

  it("dopasowuje zaimek do liczby zapisów", () => {
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 1}')).toContain("do jego odwołania");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 2}')).toContain("do ich odwołania");
  });

  // Regresja z przeglądu: liczby z treści `raise exception` nie są kontraktem.
  it("nie czyta liczb z treści komunikatu bazy", () => {
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "Nie mozna zawezic godzin: 3 aktywnych zapisow")).toBe(
      "Nie można zawęzić godzin pracy — poza nowym zakresem znalazłoby się aktywne zapisy. Najpierw doprowadź do ich odwołania.",
    );
  });

  it("odpięcie konia ma własny komunikat, inny niż konflikt godzin", () => {
    const kon = scheduleErrorMessage(FOREIGN_KEY_VIOLATION);
    expect(kon).toContain("konia");
    expect(kon).not.toBe(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, '{"bookings": 1}'));
  });

  it("cudzy koń i koń z zapisami mają różne komunikaty", () => {
    const cudzy = scheduleErrorMessage(HORSE_NOT_IN_STABLE);
    const zapisy = scheduleErrorMessage(HORSE_HAS_BOOKINGS);

    expect(cudzy).toContain("nie należy do Twojej stadniny");
    expect(zapisy).toContain("konia");
    expect(cudzy).not.toBe(zapisy);
  });

  it("koń przydzielony do zapisu: ten sam komunikat z kontroli funkcji i z FK", () => {
    // Oracle: ADR-0002 (#41) - konia przypina wyłącznie przydział aktywnego zapisu; odwołanie
    // zapisu albo zmiana przydziału zwalnia konia.
    const preCheck = scheduleErrorMessage(HORSE_HAS_BOOKINGS);

    expect(preCheck).toBe(scheduleErrorMessage(FOREIGN_KEY_VIOLATION));
    expect(preCheck).toContain("przydzielony do zapisu");
    expect(preCheck).not.toContain("także odwołane");
  });

  it("limit poniżej liczby zapisów wskazuje godzinę, limit i liczbę zapisów", () => {
    const msg = scheduleErrorMessage(SEATS_BELOW_BOOKINGS, '{"hour": 11, "seats": 0, "bookings": 2}');

    expect(msg).toBe(
      "O 11:00 limit miejsc (0) jest niższy niż liczba aktywnych zapisów w slocie (2). Podnieś limit albo najpierw doprowadź do odwołania zapisów.",
    );
  });

  it("limit poniżej liczby zapisów bez czytelnego komunikatu bazy nadal mówi, co poprawić", () => {
    expect(scheduleErrorMessage(SEATS_BELOW_BOOKINGS)).toBe(
      "W jednym ze slotów limit miejsc jest niższy niż liczba aktywnych zapisów. Podnieś limit albo najpierw doprowadź do odwołania zapisów.",
    );
  });

  it("instruktor z aktywnymi zapisami: liczba zapisów we właściwej odmianie", () => {
    expect(scheduleErrorMessage(INSTRUCTOR_HAS_BOOKINGS, '{"bookings": 1}')).toBe(
      "Nie można wypisać z dnia instruktora, który ma w nim 1 aktywny zapis. Najpierw doprowadź do jego odwołania.",
    );
    expect(scheduleErrorMessage(INSTRUCTOR_HAS_BOOKINGS, '{"bookings": 3}')).toBe(
      "Nie można wypisać z dnia instruktora, który ma w nim 3 aktywne zapisy. Najpierw doprowadź do ich odwołania.",
    );
    expect(scheduleErrorMessage(INSTRUCTOR_HAS_BOOKINGS)).toBe(
      "Nie można wypisać z dnia instruktora, który ma w nim aktywne zapisy. Najpierw doprowadź do ich odwołania.",
    );
  });

  it("suma limitów ponad liczbę koni wskazuje godzinę, sumę i liczbę koni", () => {
    const msg = scheduleErrorMessage(SEATS_EXCEED_HORSES, '{"hour": 13, "seats": 3, "horses": 2}');

    expect(msg).toBe(
      "O 13:00 suma limitów miejsc (3) przekracza liczbę koni pracujących tego dnia (2). Obniż limity w tej godzinie albo dodaj konia.",
    );
  });

  it("suma limitów bez czytelnego komunikatu bazy nadal mówi, co poprawić", () => {
    expect(scheduleErrorMessage(SEATS_EXCEED_HORSES)).toBe(
      "W jednej z godzin suma limitów miejsc przekracza liczbę koni pracujących tego dnia. Obniż limity albo dodaj konia.",
    );
  });

  it("instruktor spoza stadniny, nieaktywny instruktor i dzień miniony mają własne komunikaty", () => {
    expect(scheduleErrorMessage(INSTRUCTOR_NOT_IN_STABLE)).toBe("Wybrany instruktor nie należy do Twojego ośrodka.");
    expect(scheduleErrorMessage(INSTRUCTOR_INACTIVE)).toBe(
      "Nieaktywnego instruktora nie można dodać do dnia, w którym wcześniej nie pracował. Najpierw go aktywuj.",
    );
    expect(scheduleErrorMessage(SCHEDULE_DAY_PAST)).toBe("Nie można układać grafiku na przeszłe dni");
  });

  it("plac spoza ośrodka i nieaktywny plac mają własne komunikaty", () => {
    expect(scheduleErrorMessage(PLACE_NOT_IN_STABLE)).toBe("Wybrany plac nie należy do Twojego ośrodka.");
    expect(scheduleErrorMessage(PLACE_INACTIVE)).toBe(
      "Nieaktywnego placu nie można dodać do dnia, w którym wcześniej go nie było. Najpierw go aktywuj albo wybierz inny plac.",
    );
  });

  it("zmiana placu slotu z zapisami wskazuje godzinę i liczbę zapisów we właściwej odmianie", () => {
    expect(scheduleErrorMessage(PLACE_CHANGE_HAS_BOOKINGS, '{"hour": 11, "bookings": 1}')).toBe(
      "Nie można przenieść slotu o 11:00 na inny plac — ma 1 aktywny zapis. Zostaw slot na jego placu albo najpierw doprowadź do jego odwołania.",
    );
    expect(scheduleErrorMessage(PLACE_CHANGE_HAS_BOOKINGS, '{"hour": 9, "bookings": 3}')).toBe(
      "Nie można przenieść slotu o 9:00 na inny plac — ma 3 aktywne zapisy. Zostaw slot na jego placu albo najpierw doprowadź do ich odwołania.",
    );
    expect(scheduleErrorMessage(PLACE_CHANGE_HAS_BOOKINGS)).toBe(
      "Nie można przenieść na inny plac slotu, który ma aktywne zapisy. Zostaw slot na jego placu albo najpierw doprowadź do ich odwołania.",
    );
  });

  it("kody grafiku są rozróżnialne", () => {
    const codes = [
      SCHEDULE_DATE_CONFLICT,
      SCHEDULE_HOURS_CONFLICT,
      HORSE_NOT_IN_STABLE,
      HORSE_HAS_BOOKINGS,
      INSTRUCTOR_NOT_IN_STABLE,
      INSTRUCTOR_INACTIVE,
      SEATS_EXCEED_HORSES,
      SCHEDULE_DAY_PAST,
      SEATS_BELOW_BOOKINGS,
      INSTRUCTOR_HAS_BOOKINGS,
      PLACE_NOT_IN_STABLE,
      PLACE_INACTIVE,
      PLACE_CHANGE_HAS_BOOKINGS,
    ];

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("nierozpoznany kod daje wariant domyślny", () => {
    expect(scheduleErrorMessage("42P01", '{"bookings": 2}')).toBe("Nie udało się zapisać grafiku. Spróbuj ponownie.");
    expect(scheduleErrorMessage(undefined)).toBe("Nie udało się zapisać grafiku. Spróbuj ponownie.");
  });
});

describe("odmowy grafiku dla instruktora z uprawnieniem", () => {
  it("brak uprawnienia (42501) przy zapisie instruktora to „Nie masz już uprawnienia do układania grafiku”", () => {
    expect(scheduleErrorMessage(SCHEDULE_PERMISSION_MISSING, undefined, "instructor")).toBe(
      "Nie masz już uprawnienia do układania grafiku",
    );
  });

  it("u instruktora brak uprawnienia to odmowa, nie awaria warta logu", () => {
    expect(isScheduleRefusal(SCHEDULE_PERMISSION_MISSING, "instructor")).toBe(true);
  });

  it("u właściciela 42501 zostaje awarią z komunikatem domyślnym", () => {
    expect(isScheduleRefusal(SCHEDULE_PERMISSION_MISSING, "owner")).toBe(false);
    expect(scheduleErrorMessage(SCHEDULE_PERMISSION_MISSING, undefined, "owner")).toBe(
      "Nie udało się zapisać grafiku. Spróbuj ponownie.",
    );
  });

  it("reguła sumy limitów brzmi u instruktora tak samo jak u właściciela", () => {
    const detail = '{"hour": 15, "seats": 3, "horses": 2}';
    expect(scheduleErrorMessage(SEATS_EXCEED_HORSES, detail, "instructor")).toBe(
      scheduleErrorMessage(SEATS_EXCEED_HORSES, detail, "owner"),
    );
    expect(isScheduleRefusal(SEATS_EXCEED_HORSES, "instructor")).toBe(true);
  });
});

describe("dopisek o właścicielu przy odmowach, których instruktor nie rozwiąże", () => {
  const HINT = "Odwołać zapis albo zmienić przydział konia może właściciel.";

  it("limit poniżej liczby zapisów: instruktor widzi szczegóły odmowy i dopisek o właścicielu", () => {
    expect(scheduleErrorMessage(SEATS_BELOW_BOOKINGS, '{"hour": 15, "seats": 1, "bookings": 2}', "instructor")).toBe(
      "O 15:00 limit miejsc (1) jest niższy niż liczba aktywnych zapisów w slocie (2). Podnieś limit albo najpierw doprowadź do odwołania zapisów. Odwołać zapis albo zmienić przydział konia może właściciel.",
    );
  });

  it("kolidujące zapisy i przydziały koni: u instruktora komunikat właściciela z dopiskiem", () => {
    const cases: [string, string | undefined][] = [
      [SCHEDULE_DATE_CONFLICT, '{"bookings": 2}'],
      [SCHEDULE_HOURS_CONFLICT, '{"bookings": 1}'],
      [HORSE_HAS_BOOKINGS, undefined],
      [FOREIGN_KEY_VIOLATION, undefined],
      [SEATS_BELOW_BOOKINGS, undefined],
      [INSTRUCTOR_HAS_BOOKINGS, '{"bookings": 3}'],
      [PLACE_CHANGE_HAS_BOOKINGS, '{"hour": 11, "bookings": 1}'],
    ];
    for (const [code, detail] of cases) {
      const owner = scheduleErrorMessage(code, detail, "owner");
      expect(owner).not.toContain("może właściciel");
      expect(scheduleErrorMessage(code, detail, "instructor")).toBe(`${owner} ${HINT}`);
    }
  });

  it("odmowy, które instruktor rozwiąże sam, nie mają dopisku", () => {
    for (const code of [
      SEATS_EXCEED_HORSES,
      HORSE_NOT_IN_STABLE,
      INSTRUCTOR_INACTIVE,
      SCHEDULE_DAY_PAST,
      PLACE_NOT_IN_STABLE,
      PLACE_INACTIVE,
    ]) {
      expect(scheduleErrorMessage(code, undefined, "instructor")).not.toContain("może właściciel");
    }
  });
});
