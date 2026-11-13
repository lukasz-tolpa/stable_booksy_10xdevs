import { describe, expect, it } from "vitest";
import { errorCode, errorDetails, errorMessage } from "@/lib/db-errors";

describe("errorCode", () => {
  it("zwraca kod, gdy rzucona wartość jest obiektem z napisem w polu code", () => {
    expect(errorCode({ code: "23505", message: "duplicate key value" })).toBe("23505");
  });

  // Kształty, które naprawdę trafiają do `catch`: pusty obiekt, brak obiektu, wyjątek
  // sieciowy (`TypeError: fetch failed` nie ma pola `code`), kod liczbowy, goły napis.
  // Każdy z nich ma dać `undefined`, a nie wartość, która po stringifikacji brzmi `{}`.
  it.each([
    ["pusty obiekt", {}],
    ["null", null],
    ["undefined", undefined],
    ["TypeError bez pola code", new TypeError("fetch failed")],
    ["kod liczbowy", { code: 23505 }],
    ["goły napis z kodem", "23505"],
    ["Error z polem code, ale nie napisem", Object.assign(new Error("x"), { code: 42 })],
  ])("%s daje undefined", (_label, value) => {
    expect(errorCode(value)).toBeUndefined();
  });

  it("pusty napis w polu code (odpowiedź PostgREST przy awarii sieci) zostaje pustym napisem", () => {
    expect(errorCode({ code: "", message: "TypeError: fetch failed", status: 0 })).toBe("");
  });
});

describe("errorMessage", () => {
  it("czyta treść z obiektu błędu i z instancji Error", () => {
    expect(errorMessage({ message: "violates check constraint" })).toBe("violates check constraint");
    expect(errorMessage(new Error("x"))).toBe("x");
  });

  it.each([
    ["pusty obiekt", {}],
    ["null", null],
    ["treść niebędąca napisem", { message: 1 }],
    ["goły napis", "x"],
  ])("%s daje undefined", (_label, value) => {
    expect(errorMessage(value)).toBeUndefined();
  });
});

describe("errorDetails", () => {
  it("czyta pole DETAIL (PostgREST: details) z obiektu błędu", () => {
    expect(errorDetails({ code: "SB007", message: "x", details: '{"hour": 13}' })).toBe('{"hour": 13}');
  });

  it.each([
    ["pusty obiekt", {}],
    ["null", null],
    ["details niebędące napisem", { details: { hour: 13 } }],
    ["TypeError", new TypeError("fetch failed")],
  ])("%s daje undefined", (_label, value) => {
    expect(errorDetails(value)).toBeUndefined();
  });
});
