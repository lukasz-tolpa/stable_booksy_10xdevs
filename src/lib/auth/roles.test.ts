import { describe, expect, it } from "vitest";
import {
  homeRouteForAccount,
  homeRouteForRole,
  instructorRedirect,
  instructorStandingOf,
  isLegacyHomeRoute,
  isStableSetupPath,
  isUserRole,
  roleBadgeLabel,
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
    expect(instructorStandingOf({ active: true, stableOwnerId: account }, account)).toBe("owner");
  });

  it("konto instruktora w cudzym ośrodku (albo bez wglądu w ośrodek) to instruktor", () => {
    expect(instructorStandingOf({ active: true, stableOwnerId: "11111111-1111-1111-1111-111111111111" }, account)).toBe(
      "instructor",
    );
    expect(instructorStandingOf({ active: true, stableOwnerId: null }, account)).toBe("instructor");
  });

  it("konto instruktora zdezaktywowanego przez właściciela jest nieaktywne", () => {
    expect(instructorStandingOf({ active: false, stableOwnerId: null }, account)).toBe("inactive");
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
