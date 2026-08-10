import { describe, expect, it } from "vitest";
import { homeRouteForRole, isLegacyHomeRoute, isStableSetupPath, isUserRole, routeGuardFor } from "@/lib/auth/roles";

describe("homeRouteForRole", () => {
  it("kieruje ośrodek do jego przestrzeni", () => {
    expect(homeRouteForRole("stable")).toBe("/osrodek");
  });

  it("kieruje jeźdźca do jego przestrzeni", () => {
    expect(homeRouteForRole("rider")).toBe("/jezdziec");
  });
});

describe("routeGuardFor", () => {
  it("chroni trasę dokładną", () => {
    expect(routeGuardFor("/osrodek")).toEqual({ prefix: "/osrodek", role: "stable" });
  });

  it("chroni trasę zagnieżdżoną", () => {
    expect(routeGuardFor("/osrodek/nowa-stadnina")).toEqual({ prefix: "/osrodek", role: "stable" });
  });

  it("chroni trasę zagnieżdżoną głęboko, której jeszcze nie ma", () => {
    expect(routeGuardFor("/jezdziec/osrodki/12/rezerwacja")).toEqual({ prefix: "/jezdziec", role: "rider" });
  });

  it("traktuje trasę z ukośnikiem na końcu jak tę samą przestrzeń", () => {
    expect(routeGuardFor("/osrodek/")).toEqual({ prefix: "/osrodek", role: "stable" });
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
    expect(isUserRole("stable")).toBe(true);
    expect(isUserRole("rider")).toBe(true);
  });

  it("odrzuca wartość, której aplikacja nie zna", () => {
    expect(isUserRole("admin")).toBe(false);
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
