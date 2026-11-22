import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { costFormEndpoint } from "@/lib/settlements/redirect";

const RIDER = "0b0f3a52-6c1e-4d8a-9f3b-2a7c5e1d4f60";

/** Wysłany formularz kosztu: punkt końcowy czyta pola z żądania i odpowiada przekierowaniem. */
function contextWith(fields: Record<string, string>): APIContext {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    body.set(name, value);
  }
  return {
    request: new Request("http://localhost/api/settlements/cost", { method: "POST", body }),
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

// Oracle: AC #106 — formularz kosztu dodatkowego zawsze wraca do rozliczenia jeźdźca tego samego
// miesiąca; powrotu na listę „Rozliczenia” już nie ma (formularz „Dopisz koszt” na liście zniknął).
// Przegląd #104 — formularz bez jeźdźca w `powrot` (spreparowany) odmawia przed zapisem w jednym miejscu,
// neutralnym komunikatem.
describe("costFormEndpoint — formularz kosztu dodatkowego i jego powrót", () => {
  it("sukces i błąd wracają do rozliczenia jeźdźca z pola `powrot`, w tym samym miesiącu", async () => {
    const endpoint = costFormEndpoint((_context, { form, month, back }) => {
      expect(form.get("name")).toBe("Wyjazd na zawody");
      expect(month).toBe("2026-10");
      return Promise.resolve(back());
    });
    const ok = await endpoint(contextWith({ powrot: RIDER, miesiac: "2026-10", name: "Wyjazd na zawody" }));
    expect(ok.headers.get("Location")).toBe(`/osrodek/rozliczenia/${RIDER}?miesiac=2026-10&sukces=1`);

    const failing = costFormEndpoint((_context, { back }) => Promise.resolve(back("Zła kwota")));
    const error = await failing(contextWith({ powrot: RIDER, miesiac: "2026-10" }));
    expect(error.headers.get("Location")).toBe(`/osrodek/rozliczenia/${RIDER}?miesiac=2026-10&error=Z%C5%82a%20kwota`);
  });

  // Spreparowany formularz: nie ma rozliczenia, do którego wrócić — nic się nie wykonuje, powrót na listę.
  it.each([[{}], [{ powrot: "" }], [{ powrot: "nie-konto" }]])(
    "bez jeźdźca w `powrot` (%j) odmawia przed zapisem i wraca na „Rozliczenia”",
    async (fields) => {
      let handled = false;
      const endpoint = costFormEndpoint((_context, { back }) => {
        handled = true;
        return Promise.resolve(back());
      });
      const response = await endpoint(contextWith({ ...fields, miesiac: "2026-10" }));
      expect(handled).toBe(false);
      expect(response.headers.get("Location")).toBe(
        `/osrodek/rozliczenia?miesiac=2026-10&error=${encodeURIComponent("Nie udało się przetworzyć formularza.")}`,
      );
    },
  );
});
