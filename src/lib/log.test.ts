import { describe, expect, it } from "vitest";
import { logError, type LogEntry } from "@/lib/log";

function capture() {
  const entries: LogEntry[] = [];
  return { entries, sink: (entry: LogEntry) => entries.push(entry) };
}

describe("logError", () => {
  it("wpis niesie zakres, kod i treść błędu dostawcy", () => {
    const { entries, sink } = capture();

    logError("auth:signout", { code: "23505", message: "duplicate key", status: 409 }, sink);

    expect(entries).toEqual([{ scope: "auth:signout", code: "23505", message: "duplicate key", status: 409 }]);
  });

  it("instancja Error daje nazwę i treść", () => {
    const { entries, sink } = capture();

    logError("page:jezdziec/zapisy", new TypeError("fetch failed"), sink);

    expect(entries[0]).toMatchObject({ scope: "page:jezdziec/zapisy", name: "TypeError", message: "fetch failed" });
  });

  // Kształty, które naprawdę trafiają do catch / do pola error: nic z nich nie może
  // wywrócić samego logowania ani zgubić zakresu.
  it.each([
    ["pusty obiekt", {}],
    ["null", null],
    ["undefined", undefined],
    ["goły napis", "x"],
    ["kod liczbowy", { code: 42 }],
    ["status jako napis", { status: "500" }],
  ])("%s nie rzuca i zostawia wpis z zakresem", (_label, value) => {
    const { entries, sink } = capture();

    expect(() => {
      logError("auth:signin", value, sink);
    }).not.toThrow();
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("auth:signin");
  });

  // Do logu Workers trafiają wyłącznie pola pochodne. Adres e-mail z formularza ani
  // token z ciasteczka nie mogą przejechać dalej, nawet gdy siedzą w obiekcie błędu.
  it("przekazuje tylko pola pochodne, bez e-maila i tokenu z obiektu błędu", () => {
    const { entries, sink } = capture();

    logError("auth:signin", { message: "m", code: "x", status: 400, email: "a@b.pl", access_token: "t" }, sink);

    expect(Object.keys(entries[0]).sort()).toEqual(["code", "message", "scope", "status"]);
    expect(JSON.stringify(entries[0])).not.toMatch(/a@b\.pl|access_token/);
  });

  it("awaria ujścia nie wycieka do wołającego", () => {
    expect(() => {
      logError("auth:signin", new Error("x"), () => {
        throw new Error("sink down");
      });
    }).not.toThrow();
  });
});
