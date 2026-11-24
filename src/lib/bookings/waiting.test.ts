import { describe, expect, it } from "vitest";
import { formatOthersWaiting, formatSlotWaiting, formatWaitingCount, navCounter } from "@/lib/bookings/waiting";

describe("formatWaitingCount", () => {
  it("odmienia liczbę czekających, zero to „nikt nie czeka”", () => {
    expect([0, 1, 2, 4, 5, 12, 22].map(formatWaitingCount)).toEqual([
      "nikt nie czeka",
      "1 czeka",
      "2 czekają",
      "4 czekają",
      "5 czeka",
      "12 czeka",
      "22 czekają",
    ]);
  });
});

describe("navCounter", () => {
  it("licznik w nawigacji: liczba czekających i pełny podpis dla czytnika ekranu", () => {
    expect(navCounter("Zapisy do przyjęcia", 3)).toEqual({ text: "3", label: "Zapisy do przyjęcia, 3 czekają" });
  });

  it("bez czekających albo bez odczytu — bez licznika", () => {
    expect(navCounter("Zapisy do przyjęcia", 0)).toBeNull();
    expect(navCounter("Zapisy do przyjęcia", null)).toBeNull();
  });

  it("ponad 99 — „99+”, podpis z dokładną liczbą", () => {
    expect(navCounter("Zapisy do przyjęcia", 120)).toEqual({ text: "99+", label: "Zapisy do przyjęcia, 120 czeka" });
  });
});

describe("formatOthersWaiting", () => {
  it("przy zapisie oczekującym — ilu innych czeka na ten slot; nikt inny — bez napisu (US 26)", () => {
    expect(formatOthersWaiting(2)).toBe("inni czekający na ten slot: 2");
    expect(formatOthersWaiting(0)).toBeNull();
  });
});

describe("formatSlotWaiting", () => {
  it("przy slocie u pensjonariusza — ilu czeka na przyjęcie, także nikt", () => {
    expect([0, 1, 3].map(formatSlotWaiting)).toEqual([
      "nikt nie czeka na przyjęcie",
      "1 czeka na przyjęcie",
      "3 czekają na przyjęcie",
    ]);
  });
});
