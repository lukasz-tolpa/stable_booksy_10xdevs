import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { costReturn } from "@/lib/settlements/redirect";

const RIDER = "0b0f3a52-6c1e-4d8a-9f3b-2a7c5e1d4f60";

/** Kontekst punktu końcowego w zakresie, którego używa powrót: przekierowanie na adres. */
const context = {
  redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
} as unknown as APIContext;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

// Oracle: AC #106 — formularz kosztu dodatkowego zawsze wraca do rozliczenia jeźdźca tego samego
// miesiąca; powrotu na listę „Rozliczenia” już nie ma (formularz „Dopisz koszt” na liście zniknął).
describe("costReturn — powrót formularza kosztu dodatkowego", () => {
  it("sukces i błąd wracają do rozliczenia jeźdźca z pola `powrot`, w tym samym miesiącu", () => {
    const back = costReturn(context, form({ powrot: RIDER }), "2026-10");
    expect(back?.().headers.get("Location")).toBe(`/osrodek/rozliczenia/${RIDER}?miesiac=2026-10&sukces=1`);
    expect(back?.("Zła kwota").headers.get("Location")).toBe(
      `/osrodek/rozliczenia/${RIDER}?miesiac=2026-10&error=Z%C5%82a%20kwota`,
    );
  });

  // Spreparowany formularz: nie ma rozliczenia, do którego wrócić — punkt końcowy odmawia przed zapisem.
  it.each([[{}], [{ powrot: "" }], [{ powrot: "nie-konto" }]])(
    "bez jeźdźca w `powrot` (%j) nie ma powrotu",
    (fields) => {
      expect(costReturn(context, form(fields), "2026-10")).toBeNull();
    },
  );
});
