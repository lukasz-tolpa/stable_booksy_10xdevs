import { describe, expect, it } from "vitest";
import { landingEntries } from "@/lib/auth/landing";

describe("landingEntries", () => {
  it("gościowi daje w każdej połowie rejestrację jej roli i linię o logowaniu", () => {
    expect(landingEntries(false, null)).toEqual({
      rider: { label: "Załóż konto jeźdźca", href: "/auth/signup?rola=jezdziec" },
      stable: { label: "Załóż konto ośrodka", href: "/auth/signup?rola=osrodek" },
      signInRoute: "/auth/signin",
    });
  });

  it("zalogowanemu jeźdźcowi daje „Mój panel” tylko w połowie jeźdźca, bez linii o logowaniu", () => {
    expect(landingEntries(true, "rider")).toEqual({
      rider: { label: "Mój panel", href: "/jezdziec" },
      stable: null,
      signInRoute: null,
    });
  });

  it("zalogowanemu ośrodkowi daje „Mój panel” tylko w połowie ośrodka, bez linii o logowaniu", () => {
    expect(landingEntries(true, "stable")).toEqual({
      rider: null,
      stable: { label: "Mój panel", href: "/osrodek" },
      signInRoute: null,
    });
  });

  it.each([null, undefined, "", "admin"])("zalogowanemu bez rozpoznanej roli (%j) nie daje żadnego wejścia", (role) => {
    expect(landingEntries(true, role)).toEqual({ rider: null, stable: null, signInRoute: null });
  });

  it("gościa nie traktuje jak zalogowanego, nawet gdy dostanie rolę", () => {
    expect(landingEntries(false, "stable").stable).toEqual({
      label: "Załóż konto ośrodka",
      href: "/auth/signup?rola=osrodek",
    });
  });
});
