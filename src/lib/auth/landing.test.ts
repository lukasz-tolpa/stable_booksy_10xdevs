import { describe, expect, it } from "vitest";
import { landingEntries } from "@/lib/auth/landing";

describe("landingEntries", () => {
  it("gościowi daje w każdej połowie rejestrację jej roli, linię o logowaniu, oba przyciski w zamknięciu sekcji i „Zapisz się” prowadzące do logowania", () => {
    expect(landingEntries(null)).toEqual({
      rider: { label: "Załóż konto jeźdźca", href: "/auth/signup?rola=jezdziec" },
      stable: { label: "Załóż konto ośrodka", href: "/auth/signup?rola=osrodek" },
      signInRoute: "/auth/signin",
      closing: [
        { role: "rider", label: "Załóż konto jeźdźca", href: "/auth/signup?rola=jezdziec" },
        { role: "stable", label: "Załóż konto ośrodka", href: "/auth/signup?rola=osrodek" },
      ],
      bookRoute: "/auth/signin",
    });
  });

  it("zalogowanemu jeźdźcowi daje „Mój panel” w połowie jeźdźca i raz w zamknięciu sekcji, bez linii o logowaniu, a „Zapisz się” prowadzi do listy ośrodków", () => {
    expect(landingEntries({ profileRole: "rider" })).toEqual({
      rider: { label: "Mój panel", href: "/jezdziec" },
      stable: null,
      signInRoute: null,
      closing: [{ role: "rider", label: "Mój panel", href: "/jezdziec" }],
      bookRoute: "/jezdziec",
    });
  });

  it("zalogowanemu ośrodkowi daje „Mój panel” w połowie ośrodka i raz w zamknięciu sekcji, bez linii o logowaniu, a „Zapisz się” prowadzi do zapisów ośrodka", () => {
    expect(landingEntries({ profileRole: "stable" })).toEqual({
      rider: null,
      stable: { label: "Mój panel", href: "/osrodek" },
      signInRoute: null,
      closing: [{ role: "stable", label: "Mój panel", href: "/osrodek" }],
      bookRoute: "/osrodek/zapisy",
    });
  });

  it.each([null, undefined, "", "admin"])(
    "zalogowanemu bez rozpoznanej roli (%j) nie daje żadnego wejścia, przycisku w zamknięciu sekcji ani klikalnego „Zapisz się”",
    (profileRole) => {
      expect(landingEntries({ profileRole })).toEqual({
        rider: null,
        stable: null,
        signInRoute: null,
        closing: [],
        bookRoute: null,
      });
    },
  );
});
