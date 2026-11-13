import { describe, expect, it } from "vitest";
import { landingEntries } from "@/lib/auth/landing";

describe("landingEntries", () => {
  it("gościowi daje w każdej połowie rejestrację jej roli i linię o logowaniu", () => {
    expect(landingEntries(null)).toEqual({
      rider: { label: "Załóż konto jeźdźca", href: "/auth/signup?rola=jezdziec" },
      stable: { label: "Załóż konto ośrodka", href: "/auth/signup?rola=osrodek" },
      signInRoute: "/auth/signin",
    });
  });

  it("zalogowanemu jeźdźcowi daje „Mój panel” tylko w połowie jeźdźca, bez linii o logowaniu", () => {
    expect(landingEntries({ profileRole: "rider" })).toEqual({
      rider: { label: "Mój panel", href: "/jezdziec" },
      stable: null,
      signInRoute: null,
    });
  });

  it("zalogowanemu ośrodkowi daje „Mój panel” tylko w połowie ośrodka, bez linii o logowaniu", () => {
    expect(landingEntries({ profileRole: "stable" })).toEqual({
      rider: null,
      stable: { label: "Mój panel", href: "/osrodek" },
      signInRoute: null,
    });
  });

  it.each([null, undefined, "", "admin"])(
    "zalogowanemu bez rozpoznanej roli (%j) nie daje żadnego wejścia",
    (profileRole) => {
      expect(landingEntries({ profileRole })).toEqual({ rider: null, stable: null, signInRoute: null });
    },
  );
});
