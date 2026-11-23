import { describe, expect, it } from "vitest";
import {
  homeRouteForAccount,
  homeRouteForRole,
  instructorRedirect,
  instructorStandingOf,
  instructorTabs,
  currentSection,
  isLegacyHomeRoute,
  isStableSetupPath,
  isUserRole,
  roleBadgeLabel,
  scheduleCallerFor,
  stableSections,
  stableTabBarSections,
  scheduleRouteFor,
  routeGuardFor,
  signupRoleFromParam,
  signupRouteForRole,
} from "@/lib/auth/roles";

describe("signupRoleFromParam", () => {
  it("zamienia „jezdziec” na rolę jeźdźca", () => {
    expect(signupRoleFromParam("jezdziec")).toBe("rider");
  });

  it("zamienia „osrodek” na rolę instruktora (zakładającego ośrodek)", () => {
    expect(signupRoleFromParam("osrodek")).toBe("instructor");
  });

  it("nie zaznacza niczego bez parametru", () => {
    expect(signupRoleFromParam(null)).toBeNull();
    expect(signupRoleFromParam(undefined)).toBeNull();
  });

  it("nie zaznacza niczego przy pustej wartości", () => {
    expect(signupRoleFromParam("")).toBeNull();
  });

  it("nie zaznacza niczego przy nieznanej wartości", () => {
    expect(signupRoleFromParam("admin")).toBeNull();
    expect(signupRoleFromParam("rider")).toBeNull();
    expect(signupRoleFromParam("stable")).toBeNull();
    expect(signupRoleFromParam("instructor")).toBeNull();
    expect(signupRoleFromParam(" osrodek ")).toBeNull();
    expect(signupRoleFromParam("constructor")).toBeNull();
  });

  it("nie zaznacza niczego przy innej wielkości liter", () => {
    expect(signupRoleFromParam("Osrodek")).toBeNull();
    expect(signupRoleFromParam("JEZDZIEC")).toBeNull();
  });
});

describe("signupRouteForRole", () => {
  it("daje adres rejestracji z parametrem roli jeźdźca", () => {
    expect(signupRouteForRole("rider")).toBe("/auth/signup?rola=jezdziec");
  });

  it("daje adres rejestracji z parametrem „osrodek” dla roli instruktora", () => {
    expect(signupRouteForRole("instructor")).toBe("/auth/signup?rola=osrodek");
  });
});

describe("homeRouteForRole", () => {
  it("kieruje instruktora (właściciela) do przestrzeni ośrodka", () => {
    expect(homeRouteForRole("instructor")).toBe("/osrodek");
  });

  it("kieruje jeźdźca do jego przestrzeni", () => {
    expect(homeRouteForRole("rider")).toBe("/jezdziec");
  });
});

describe("routeGuardFor", () => {
  it("chroni trasę dokładną", () => {
    expect(routeGuardFor("/osrodek")).toEqual({ prefix: "/osrodek", role: "instructor" });
  });

  it("chroni trasę zagnieżdżoną", () => {
    expect(routeGuardFor("/osrodek/nowa-stadnina")).toEqual({ prefix: "/osrodek", role: "instructor" });
  });

  it("chroni trasę zagnieżdżoną głęboko, której jeszcze nie ma", () => {
    expect(routeGuardFor("/jezdziec/osrodki/12/rezerwacja")).toEqual({ prefix: "/jezdziec", role: "rider" });
  });

  it("traktuje trasę z ukośnikiem na końcu jak tę samą przestrzeń", () => {
    expect(routeGuardFor("/osrodek/")).toEqual({ prefix: "/osrodek", role: "instructor" });
  });

  it("NIE łapie ścieżki zaczynającej się tym samym ciągiem znaków", () => {
    expect(routeGuardFor("/osrodekxyz")).toBeNull();
    expect(routeGuardFor("/jezdziec-cennik")).toBeNull();
  });

  it("przepuszcza trasy publiczne", () => {
    expect(routeGuardFor("/")).toBeNull();
    expect(routeGuardFor("/auth/signin")).toBeNull();
    expect(routeGuardFor("/auth/signup")).toBeNull();
  });

  it("wymaga sesji bez konkretnej roli na starym adresie panelu", () => {
    expect(routeGuardFor("/dashboard")).toEqual({ prefix: "/dashboard", role: null });
  });
});

// Oracle: AC #102 — PDF rozliczenia jeźdźca to trasa właściciela: bez sesji logowanie (middleware przy
// każdej chronionej trasie), konto jeźdźca do własnej przestrzeni (inna rola), instruktor bez roli
// właściciela do „Moje sloty”; właściciel przechodzi.
describe("PDF rozliczenia jeźdźca — trasa właściciela", () => {
  const PDF = "/osrodek/rozliczenia/33333333-3333-3333-3333-333333333333/pdf";

  it("jest chroniony przestrzenią ośrodka (rola konta instruktora)", () => {
    expect(routeGuardFor(PDF)).toEqual({ prefix: "/osrodek", role: "instructor" });
  });

  it("instruktor bez roli właściciela trafia do „Moje sloty”, właściciel zostaje", () => {
    expect(instructorRedirect(PDF, "instructor")).toBe("/instruktor");
    expect(instructorRedirect(PDF, "owner")).toBeNull();
  });
});

describe("isLegacyHomeRoute", () => {
  it("rozpoznaje stary adres panelu", () => {
    expect(isLegacyHomeRoute("/dashboard")).toBe(true);
    expect(isLegacyHomeRoute("/dashboard/")).toBe(true);
  });

  it("nie łapie przestrzeni ról ani ścieżki o podobnej nazwie", () => {
    expect(isLegacyHomeRoute("/osrodek")).toBe(false);
    expect(isLegacyHomeRoute("/dashboards")).toBe(false);
  });
});

describe("isUserRole", () => {
  it("rozpoznaje obie znane role", () => {
    expect(isUserRole("instructor")).toBe(true);
    expect(isUserRole("rider")).toBe(true);
  });

  it("odrzuca wartość, której aplikacja nie zna", () => {
    expect(isUserRole("admin")).toBe(false);
    expect(isUserRole("stable")).toBe(false);
    expect(isUserRole("")).toBe(false);
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });
});

describe("isStableSetupPath", () => {
  it("obejmuje ekran zakładania stadniny", () => {
    expect(isStableSetupPath("/osrodek/nowa-stadnina")).toBe(true);
  });

  it("obejmuje endpoint przyjmujący formularz", () => {
    expect(isStableSetupPath("/api/stables/create")).toBe(true);
  });

  it("nie obejmuje reszty przestrzeni ośrodka", () => {
    expect(isStableSetupPath("/osrodek")).toBe(false);
    expect(isStableSetupPath("/osrodek/grafik")).toBe(false);
  });
});

describe("homeRouteForAccount", () => {
  it("kieruje właściciela do przestrzeni ośrodka", () => {
    expect(homeRouteForAccount("instructor", "owner")).toBe("/osrodek");
  });

  it("kieruje instruktora, który nie jest właścicielem, do „Moje sloty”", () => {
    expect(homeRouteForAccount("instructor", "instructor")).toBe("/instruktor");
  });

  it("kieruje konto instruktora bez ośrodka na zakładanie ośrodka", () => {
    expect(homeRouteForAccount("instructor", "none")).toBe("/osrodek/nowa-stadnina");
  });

  it("kieruje zdezaktywowanego instruktora na ekran nieaktywnego konta", () => {
    expect(homeRouteForAccount("instructor", "inactive")).toBe("/instruktor/konto-nieaktywne");
  });

  it("kieruje jeźdźca do jego przestrzeni niezależnie od powiązań", () => {
    expect(homeRouteForAccount("rider", null)).toBe("/jezdziec");
  });
});

describe("instructorRedirect", () => {
  it("przenosi instruktora z przestrzeni ośrodka do „Moje sloty”", () => {
    expect(instructorRedirect("/osrodek", "instructor")).toBe("/instruktor");
    expect(instructorRedirect("/osrodek/grafik", "instructor")).toBe("/instruktor");
    expect(instructorRedirect("/osrodek/statystyki", "instructor")).toBe("/instruktor");
  });

  it("nie wpuszcza instruktora z ośrodkiem na ekran zakładania ośrodka", () => {
    expect(instructorRedirect("/osrodek/nowa-stadnina", "instructor")).toBe("/instruktor");
    expect(instructorRedirect("/osrodek/nowa-stadnina", "owner")).toBe("/osrodek");
  });

  it("zostawia instruktora na „Moje sloty”", () => {
    expect(instructorRedirect("/instruktor", "instructor")).toBeNull();
  });

  it("zostawia właściciela w przestrzeni ośrodka, a z przestrzeni instruktora przenosi do niej", () => {
    expect(instructorRedirect("/osrodek", "owner")).toBeNull();
    expect(instructorRedirect("/osrodek/zapisy", "owner")).toBeNull();
    expect(instructorRedirect("/instruktor", "owner")).toBe("/osrodek");
  });

  it("trzyma konto bez ośrodka na ekranie zakładania ośrodka", () => {
    expect(instructorRedirect("/osrodek", "none")).toBe("/osrodek/nowa-stadnina");
    expect(instructorRedirect("/instruktor", "none")).toBe("/osrodek/nowa-stadnina");
    expect(instructorRedirect("/osrodek/nowa-stadnina", "none")).toBeNull();
  });
});

describe("instructorRedirect — zdezaktywowany instruktor", () => {
  it("z każdej trasy chronionej przenosi na ekran nieaktywnego konta", () => {
    for (const pathname of [
      "/instruktor",
      "/osrodek",
      "/osrodek/zapisy",
      "/osrodek/grafik",
      "/osrodek/nowa-stadnina",
      "/dashboard",
    ]) {
      expect(instructorRedirect(pathname, "inactive")).toBe("/instruktor/konto-nieaktywne");
    }
  });

  it("zostawia go na ekranie nieaktywnego konta", () => {
    expect(instructorRedirect("/instruktor/konto-nieaktywne", "inactive")).toBeNull();
  });

  it("nie trzyma aktywnego konta na ekranie nieaktywnego konta", () => {
    expect(instructorRedirect("/instruktor/konto-nieaktywne", "instructor")).toBe("/instruktor");
    expect(instructorRedirect("/instruktor/konto-nieaktywne", "owner")).toBe("/osrodek");
    expect(instructorRedirect("/instruktor/konto-nieaktywne", "none")).toBe("/osrodek/nowa-stadnina");
  });
});

describe("routeGuardFor — przestrzeń instruktora", () => {
  it("chroni „Moje sloty” rolą instruktora", () => {
    expect(routeGuardFor("/instruktor")).toEqual({ prefix: "/instruktor", role: "instructor" });
  });

  it("NIE łapie ścieżki zaczynającej się tym samym ciągiem znaków", () => {
    expect(routeGuardFor("/instruktorzy")).toBeNull();
  });
});

describe("instructorStandingOf", () => {
  const account = "99999999-9999-9999-9999-999999999999";

  it("konto bez powiązanego instruktora nie ma ośrodka", () => {
    expect(instructorStandingOf(null, account)).toBe("none");
  });

  it("konto zapisane jako właściciel ośrodka swojego instruktora to właściciel", () => {
    expect(instructorStandingOf({ active: true, stableOwnerId: account, arrangesSchedule: false }, account)).toBe(
      "owner",
    );
  });

  it("konto instruktora w cudzym ośrodku (albo bez wglądu w ośrodek) to instruktor", () => {
    expect(
      instructorStandingOf(
        { active: true, stableOwnerId: "11111111-1111-1111-1111-111111111111", arrangesSchedule: false },
        account,
      ),
    ).toBe("instructor");
    expect(instructorStandingOf({ active: true, stableOwnerId: null, arrangesSchedule: false }, account)).toBe(
      "instructor",
    );
  });

  it("konto instruktora zdezaktywowanego przez właściciela jest nieaktywne", () => {
    expect(instructorStandingOf({ active: false, stableOwnerId: null, arrangesSchedule: false }, account)).toBe(
      "inactive",
    );
  });
});

describe("roleBadgeLabel", () => {
  it("podpisuje instruktora, który nie jest właścicielem, jako „Instruktor”", () => {
    expect(roleBadgeLabel("instructor", "instructor")).toBe("Instruktor");
    expect(roleBadgeLabel("instructor", "inactive")).toBe("Instruktor");
  });

  it("zostawia etykiety ról dla właściciela i jeźdźca", () => {
    expect(roleBadgeLabel("instructor", "owner")).toBe("Ośrodek");
    expect(roleBadgeLabel("instructor", null)).toBe("Ośrodek");
    expect(roleBadgeLabel("rider", null)).toBe("Jeździec");
  });
});

describe("instruktor z uprawnieniem do układania grafiku", () => {
  const account = "99999999-9999-9999-9999-999999999999";
  const owner = "11111111-1111-1111-1111-111111111111";

  it("aktywny instruktor z uprawnieniem ma osobny stan konta", () => {
    expect(instructorStandingOf({ active: true, stableOwnerId: owner, arrangesSchedule: true }, account)).toBe(
      "arranging-instructor",
    );
    expect(instructorStandingOf({ active: true, stableOwnerId: owner, arrangesSchedule: false }, account)).toBe(
      "instructor",
    );
  });

  it("właściciel zostaje właścicielem, nieaktywny — nieaktywnym, niezależnie od znacznika", () => {
    expect(instructorStandingOf({ active: true, stableOwnerId: account, arrangesSchedule: true }, account)).toBe(
      "owner",
    );
    expect(instructorStandingOf({ active: false, stableOwnerId: null, arrangesSchedule: true }, account)).toBe(
      "inactive",
    );
  });

  it("strona startowa to nadal „Moje sloty”, a pigułka — „Instruktor”", () => {
    expect(homeRouteForAccount("instructor", "arranging-instructor")).toBe("/instruktor");
    expect(roleBadgeLabel("instructor", "arranging-instructor")).toBe("Instruktor");
  });

  it("wchodzi na stronę grafiku w swojej przestrzeni i na „Moje sloty”", () => {
    expect(instructorRedirect("/instruktor/grafik", "arranging-instructor")).toBeNull();
    expect(instructorRedirect("/instruktor", "arranging-instructor")).toBeNull();
  });

  it("instruktora bez uprawnienia strona grafiku przenosi do „Moje sloty”", () => {
    expect(instructorRedirect("/instruktor/grafik", "instructor")).toBe("/instruktor");
  });

  it("przestrzeń ośrodka — także jej grafik — zostaje przy właścicielu", () => {
    for (const pathname of [
      "/osrodek",
      "/osrodek/grafik",
      "/osrodek/konie",
      "/osrodek/zapisy",
      "/osrodek/statystyki",
      "/osrodek/instruktorzy",
    ]) {
      expect(instructorRedirect(pathname, "arranging-instructor")).toBe("/instruktor");
    }
    expect(instructorRedirect("/instruktor/grafik", "owner")).toBe("/osrodek");
  });

  it("zdezaktywowanego instruktora strona grafiku przenosi na ekran nieaktywnego konta", () => {
    expect(instructorRedirect("/instruktor/grafik", "inactive")).toBe("/instruktor/konto-nieaktywne");
  });
});

describe("instructorTabs", () => {
  it("instruktor z uprawnieniem ma zakładki „Moje sloty”, „Grafik” i „Podsumowanie miesiąca”", () => {
    expect(instructorTabs("arranging-instructor")).toEqual([
      { href: "/instruktor", label: "Moje sloty" },
      { href: "/instruktor/grafik", label: "Grafik" },
      { href: "/instruktor/podsumowanie", label: "Podsumowanie miesiąca" },
    ]);
  });

  it("instruktor bez uprawnienia ma zakładki „Moje sloty” i „Podsumowanie miesiąca”, bez „Grafik”", () => {
    expect(instructorTabs("instructor")).toEqual([
      { href: "/instruktor", label: "Moje sloty" },
      { href: "/instruktor/podsumowanie", label: "Podsumowanie miesiąca" },
    ]);
  });

  it("pozostałe stany nie mają zakładek instruktora", () => {
    expect(instructorTabs("owner")).toEqual([]);
    expect(instructorTabs("inactive")).toEqual([]);
    expect(instructorTabs("none")).toEqual([]);
    expect(instructorTabs(null)).toEqual([]);
  });
});

describe("instructorRedirect — Podsumowanie miesiąca instruktora", () => {
  it("wpuszcza instruktora z kontem, z uprawnieniem i bez", () => {
    expect(instructorRedirect("/instruktor/podsumowanie", "instructor")).toBeNull();
    expect(instructorRedirect("/instruktor/podsumowanie", "arranging-instructor")).toBeNull();
  });

  it("właściciela przenosi do przestrzeni ośrodka, zdezaktywowanego — na ekran nieaktywnego konta", () => {
    expect(instructorRedirect("/instruktor/podsumowanie", "owner")).toBe("/osrodek");
    expect(instructorRedirect("/instruktor/podsumowanie", "inactive")).toBe("/instruktor/konto-nieaktywne");
    expect(instructorRedirect("/instruktor/podsumowanie", "none")).toBe("/osrodek/nowa-stadnina");
  });

  it("strona wymaga konta instruktora — jeźdźca strażnik tras przenosi do jego przestrzeni", () => {
    expect(routeGuardFor("/instruktor/podsumowanie")).toEqual({ prefix: "/instruktor", role: "instructor" });
  });
});

describe("instructorRedirect — Rozliczenia (#94)", () => {
  it("wpuszcza tylko właściciela; instruktora z uprawnieniem do układania grafiku i bez przenosi do „Moje sloty”", () => {
    expect(instructorRedirect("/osrodek/rozliczenia", "owner")).toBeNull();
    expect(instructorRedirect("/osrodek/rozliczenia", "instructor")).toBe("/instruktor");
    expect(instructorRedirect("/osrodek/rozliczenia", "arranging-instructor")).toBe("/instruktor");
    expect(instructorRedirect("/osrodek/rozliczenia", "inactive")).toBe("/instruktor/konto-nieaktywne");
  });

  it("strona wymaga konta instruktora — jeźdźca strażnik tras przenosi do jego przestrzeni", () => {
    expect(routeGuardFor("/osrodek/rozliczenia")).toEqual({ prefix: "/osrodek", role: "instructor" });
  });
});

describe("scheduleRouteFor", () => {
  it("właściciel układa grafik w przestrzeni ośrodka, instruktor z uprawnieniem — w swojej", () => {
    expect(scheduleRouteFor("owner")).toBe("/osrodek/grafik");
    expect(scheduleRouteFor("arranging-instructor")).toBe("/instruktor/grafik");
  });

  it("pozostali nie mają strony grafiku", () => {
    expect(scheduleRouteFor("instructor")).toBeNull();
    expect(scheduleRouteFor("inactive")).toBeNull();
    expect(scheduleRouteFor("none")).toBeNull();
    expect(scheduleRouteFor(null)).toBeNull();
  });
});

describe("scheduleCallerFor", () => {
  it("instruktor — z uprawnieniem, po jego utracie albo zdezaktywowany — dostaje komunikaty grafiku instruktora", () => {
    expect(scheduleCallerFor("arranging-instructor")).toBe("instructor");
    expect(scheduleCallerFor("instructor")).toBe("instructor");
    expect(scheduleCallerFor("inactive")).toBe("instructor");
  });

  it("właściciel i pozostałe konta dostają komunikaty właściciela", () => {
    expect(scheduleCallerFor("owner")).toBe("owner");
    expect(scheduleCallerFor("none")).toBe("owner");
    expect(scheduleCallerFor(null)).toBe("owner");
  });
});

describe("stableSections", () => {
  it("właściciel ma panel i sześć sekcji ośrodka w kolejności nawigacji", () => {
    expect(stableSections("owner")).toEqual([
      { href: "/osrodek", label: "Panel" },
      { href: "/osrodek/grafik", label: "Grafik" },
      { href: "/osrodek/zapisy", label: "Zapisy" },
      // #124: zapisy oczekujące czekają na decyzję ośrodka; w dolnym pasku krótko.
      { href: "/osrodek/zapisy-do-przyjecia", label: "Zapisy do przyjęcia", shortLabel: "Przyjęcia" },
      { href: "/osrodek/konie", label: "Konie" },
      { href: "/osrodek/instruktorzy", label: "Instruktorzy" },
      { href: "/osrodek/statystyki", label: "Statystyki" },
    ]);
  });

  it("pozostałe konta nie mają sekcji ośrodka", () => {
    expect(stableSections("arranging-instructor")).toEqual([]);
    expect(stableSections("instructor")).toEqual([]);
    expect(stableSections("inactive")).toEqual([]);
    expect(stableSections("none")).toEqual([]);
    expect(stableSections(null)).toEqual([]);
  });
});

describe("currentSection", () => {
  const sections = stableSections("owner");

  it("na stronie sekcji bieżąca jest ta sekcja, także z ukośnikiem na końcu", () => {
    expect(currentSection("/osrodek/zapisy", sections)).toBe("/osrodek/zapisy");
    expect(currentSection("/osrodek/zapisy/", sections)).toBe("/osrodek/zapisy");
  });

  it("na panelu bieżący jest panel, a nie sekcja leżąca pod nim", () => {
    expect(currentSection("/osrodek", sections)).toBe("/osrodek");
    expect(currentSection("/osrodek/", sections)).toBe("/osrodek");
  });

  it("adres tylko podobny do sekcji zaznacza panel, nie sekcję", () => {
    expect(currentSection("/osrodek/zapisyx", sections)).toBe("/osrodek");
  });

  it("strona spoza sekcji nie zaznacza niczego", () => {
    expect(currentSection("/", sections)).toBeNull();
  });
});

describe("stableTabBarSections", () => {
  it("właściciel ma dolny pasek na panelu i stronach sekcji ośrodka", () => {
    expect(stableTabBarSections("owner", "/osrodek")).toHaveLength(7);
    expect(stableTabBarSections("owner", "/osrodek/konie")).toHaveLength(7);
  });

  it("na stronie „Zapisy do przyjęcia” pasek zaznacza tę sekcję, a nie „Zapisy”", () => {
    const sections = stableTabBarSections("owner", "/osrodek/zapisy-do-przyjecia");
    expect(currentSection("/osrodek/zapisy-do-przyjecia", sections)).toBe("/osrodek/zapisy-do-przyjecia");
  });

  it("na stronie głównej i innych stronach spoza ośrodka pasek się nie pokazuje", () => {
    expect(stableTabBarSections("owner", "/")).toEqual([]);
    expect(stableTabBarSections("owner", "/stadniny")).toEqual([]);
  });

  it("inne konta nie mają dolnego paska także w przestrzeni ośrodka", () => {
    expect(stableTabBarSections("instructor", "/osrodek")).toEqual([]);
    expect(stableTabBarSections(null, "/osrodek")).toEqual([]);
  });
});
