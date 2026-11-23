import { describe, expect, it } from "vitest";
import {
  horsesInMonth,
  horsesOf,
  horsesOnDay,
  isBoarderInMonth,
  isBoarderWith,
  stayCoversDay,
  stayOverlapsMonth,
  type BoardingStay,
} from "@/lib/boarding/month";

function stay(arrivalDay: string, departureDay: string | null): BoardingStay {
  return { arrivalDay, departureDay };
}

// Oracle: GLOSSARY „Pensjonariusz” i „Opłata za pensjonat”, AC #114 — jeździec jest pensjonariuszem
// w każdym miesiącu, w którym trwał pobyt choć jednego jego konia; pobyt liczy się w całości także
// w miesiącu przyjazdu i wyjazdu. Te same przypadki sprawdza w bazie supabase/tests/boarding_horses.sql.
describe("stayOverlapsMonth — pobyt zachodzi na miesiąc", () => {
  it("przyjazd w trakcie miesiąca: ten miesiąc się liczy, poprzedni nie", () => {
    const arrival = stay("2026-10-20", null);
    expect(stayOverlapsMonth(arrival, "2026-09")).toBe(false);
    expect(stayOverlapsMonth(arrival, "2026-10")).toBe(true);
  });

  it("pobyt bez dnia wyjazdu trwa we wszystkich kolejnych miesiącach", () => {
    expect(stayOverlapsMonth(stay("2026-10-20", null), "2027-03")).toBe(true);
  });

  it("wyjazd w trakcie miesiąca: ten miesiąc się liczy, następny nie", () => {
    const ended = stay("2026-08-01", "2026-11-03");
    expect(stayOverlapsMonth(ended, "2026-11")).toBe(true);
    expect(stayOverlapsMonth(ended, "2026-12")).toBe(false);
  });

  it("przyjazd i wyjazd w jednym miesiącu liczą tylko ten miesiąc", () => {
    const short = stay("2026-11-10", "2026-11-12");
    expect(stayOverlapsMonth(short, "2026-10")).toBe(false);
    expect(stayOverlapsMonth(short, "2026-11")).toBe(true);
    expect(stayOverlapsMonth(short, "2026-12")).toBe(false);
  });

  it("przyjazd ostatniego dnia i wyjazd pierwszego dnia miesiąca też się liczą", () => {
    expect(stayOverlapsMonth(stay("2026-11-30", null), "2026-11")).toBe(true);
    expect(stayOverlapsMonth(stay("2026-09-15", "2026-11-01"), "2026-11")).toBe(true);
  });
});

describe("isBoarderInMonth — pensjonariusz w miesiącu", () => {
  it("bez koni pensjonatowych jeździec nie jest pensjonariuszem", () => {
    expect(isBoarderInMonth([], "2026-11")).toBe(false);
  });

  it("kilka koni: wystarczy pobyt jednego z nich", () => {
    const stays = [stay("2026-03-01", "2026-05-31"), stay("2026-11-15", null)];
    expect(isBoarderInMonth(stays, "2026-04")).toBe(true);
    expect(isBoarderInMonth(stays, "2026-08")).toBe(false);
    expect(isBoarderInMonth(stays, "2026-11")).toBe(true);
  });

  it("wyjazd ostatniego konia: w miesiącu wyjazdu jeszcze pensjonariusz, od następnego już nie", () => {
    const stays = [stay("2026-01-10", "2026-09-30"), stay("2026-02-01", "2026-10-14")];
    expect(isBoarderInMonth(stays, "2026-10")).toBe(true);
    expect(isBoarderInMonth(stays, "2026-11")).toBe(false);
  });
});

// Bliźniak private.stay_covers_day (migracja 20261202090000, #115) — koń przy slocie treningowym. Te same
// przypadki sprawdza w bazie supabase/tests/training_slots.sql (krok 20).
describe("stayCoversDay — pobyt obejmuje dzień jazdy", () => {
  it("dzień przyjazdu i dzień wyjazdu należą do pobytu, dzień przed i po — nie", () => {
    const ended = stay("2026-11-10", "2026-11-12");
    expect(stayCoversDay(ended, "2026-11-09")).toBe(false);
    expect(stayCoversDay(ended, "2026-11-10")).toBe(true);
    expect(stayCoversDay(ended, "2026-11-12")).toBe(true);
    expect(stayCoversDay(ended, "2026-11-13")).toBe(false);
  });

  it("pobyt bez dnia wyjazdu obejmuje każdy dzień od przyjazdu", () => {
    expect(stayCoversDay(stay("2026-11-10", null), "2027-05-01")).toBe(true);
  });
});

// #112: jedno miejsce „konie jeźdźca → pobyty → reguła” dla rozliczeń, podsumowania, zapisów i zajętości placów.
describe("konie pensjonatowe jeźdźca wobec miesiąca i dnia", () => {
  const horses = [
    { horseId: 1, riderKey: "kasia", stays: [stay("2026-03-01", "2026-05-31")] },
    { horseId: 2, riderKey: "kasia", stays: [stay("2026-11-15", null)] },
    { horseId: 3, riderKey: "olek", stays: [stay("2026-01-01", null)] },
    { horseId: 4, riderKey: null, stays: [stay("2026-01-01", null)] },
  ];

  it("horsesOf — konie jednego pensjonariusza; koń bez właściciela nie należy do nikogo", () => {
    expect(horsesOf(horses, "kasia").map((horse) => horse.horseId)).toEqual([1, 2]);
    expect(horsesOf(horses, "anna")).toEqual([]);
  });

  it("isBoarderWith — pensjonariusz w miesiącu, gdy pobyt choć jednego z jego koni zachodzi na miesiąc", () => {
    const kasia = horsesOf(horses, "kasia");
    expect(isBoarderWith(kasia, "2026-04")).toBe(true);
    expect(isBoarderWith(kasia, "2026-08")).toBe(false);
    expect(isBoarderWith(kasia, "2026-11")).toBe(true);
    expect(isBoarderWith([], "2026-11")).toBe(false);
  });

  it("horsesInMonth — konie z pobytem w miesiącu (także przyjazd w ostatnim dniu)", () => {
    expect(horsesInMonth(horsesOf(horses, "kasia"), "2026-05").map((horse) => horse.horseId)).toEqual([1]);
    expect(horsesInMonth(horsesOf(horses, "kasia"), "2026-11").map((horse) => horse.horseId)).toEqual([2]);
  });

  it("horsesOnDay — konie, których pobyt obejmuje dzień; dzień przed przyjazdem w tym samym miesiącu — nie", () => {
    expect(horsesOnDay(horsesOf(horses, "kasia"), "2026-11-14")).toEqual([]);
    expect(horsesOnDay(horsesOf(horses, "kasia"), "2026-11-15").map((horse) => horse.horseId)).toEqual([2]);
  });
});
