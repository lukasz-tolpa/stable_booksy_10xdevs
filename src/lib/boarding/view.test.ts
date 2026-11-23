import { describe, expect, it } from "vitest";
import {
  boardingNotice,
  composeMyBoardingHorses,
  composeStableBoarders,
  type MyBoardingHorseRow,
  type StableBoardingRow,
} from "@/lib/boarding/view";

const TODAY = "2026-11-22";

let nextStay = 1;
function row(overrides: Partial<StableBoardingRow>): StableBoardingRow {
  return {
    horse_id: 1,
    horse_name: "Hrabia",
    rider_id: "12121212-1212-1212-1212-121212121212",
    rider_name: "Katarzyna Zając",
    rider_email: "katarzyna.zajac@example.com",
    stay_id: nextStay++,
    arrival_day: "2026-08-24",
    departure_day: null,
    departure_set_by: null,
    ...overrides,
  };
}

// Oracle: AC #114 — lista „Pensjonariusze” z końmi i pobytami; zakończenie pobytu i jego poprawka;
// nowy pobyt konia, który wrócił; „Moje konie” z pobytami i tym, kto ostatnio ustawił dzień wyjazdu.
// Dzień wyjazdu nie później niż dziś i nie wcześniej niż przyjazd (GLOSSARY „Pobyt”).
describe("composeStableBoarders — strona „Pensjonariusze” właściciela", () => {
  it("bez koni pensjonatowych lista jest pusta", () => {
    expect(composeStableBoarders([], TODAY).boarders).toEqual([]);
  });

  it("grupuje konie po pensjonariuszu, a pobyty po koniu — najnowszy pobyt pierwszy", () => {
    const view = composeStableBoarders(
      [
        row({ horse_id: 1, horse_name: "Hrabia", stay_id: 11, arrival_day: "2026-10-01" }),
        row({
          horse_id: 1,
          horse_name: "Hrabia",
          stay_id: 10,
          arrival_day: "2026-03-01",
          departure_day: "2026-06-30",
          departure_set_by: "rider",
        }),
        row({ horse_id: 2, horse_name: "Dukat", stay_id: 12, arrival_day: "2026-11-01" }),
        row({
          horse_id: 3,
          horse_name: "Iskierka",
          rider_id: "44444444-4444-4444-4444-444444444444",
          rider_name: "Piotr Nowak",
          rider_email: "piotr.nowak@example.com",
          stay_id: 13,
        }),
      ],
      TODAY,
    );

    expect(view.boarders.map((boarder) => [boarder.name, boarder.email])).toEqual([
      ["Katarzyna Zając", "katarzyna.zajac@example.com"],
      ["Piotr Nowak", "piotr.nowak@example.com"],
    ]);
    const [katarzyna] = view.boarders;
    expect(katarzyna.horses.map((horse) => horse.name)).toEqual(["Dukat", "Hrabia"]);
    const hrabia = katarzyna.horses[1];
    expect(hrabia.stays.map((stay) => [stay.id, stay.periodText, stay.setByText])).toEqual([
      [11, "od 1 października 2026 — trwa", null],
      [10, "1 marca 2026 – 30 czerwca 2026", "dzień wyjazdu wpisany przez pensjonariusza"],
    ]);
  });

  it("trwający pobyt dostaje „Zakończ pobyt” z dziś jako domyślnym dniem, w granicach przyjazdu i dziś", () => {
    const [boarder] = composeStableBoarders([row({ stay_id: 5, arrival_day: "2026-08-24" })], TODAY).boarders;
    const [horse] = boarder.horses;
    expect(horse.current).toBe(true);
    expect(horse.departureForm).toEqual({
      stayId: 5,
      action: "Zakończ pobyt",
      value: TODAY,
      min: "2026-08-24",
      max: TODAY,
    });
    expect(horse.newStay).toBeNull();
  });

  it("zakończony pobyt: poprawka dnia wyjazdu i „Nowy pobyt” od dnia po wyjeździe", () => {
    const [boarder] = composeStableBoarders(
      [row({ stay_id: 6, departure_day: "2026-11-10", departure_set_by: "stable" })],
      TODAY,
    ).boarders;
    const [horse] = boarder.horses;
    expect(horse.current).toBe(false);
    expect(horse.stays[0].setByText).toBe("dzień wyjazdu wpisany przez ośrodek");
    expect(horse.departureForm).toMatchObject({ stayId: 6, action: "Popraw dzień wyjazdu", value: "2026-11-10" });
    expect(horse.newStay).toEqual({ horseId: 1, min: "2026-11-11", value: TODAY });
  });

  it("wyjazd dziś: nowy pobyt najwcześniej jutro, domyślnie jutro", () => {
    const [boarder] = composeStableBoarders([row({ departure_day: TODAY, departure_set_by: "rider" })], TODAY).boarders;
    expect(boarder.horses[0].newStay).toMatchObject({ min: "2026-11-23", value: "2026-11-23" });
  });

  it("koń, który jeszcze nie przyjechał, nie ma formularza dnia wyjazdu", () => {
    const [boarder] = composeStableBoarders([row({ arrival_day: "2026-11-25" })], TODAY).boarders;
    expect(boarder.horses[0].stays[0].periodText).toBe("od 25 listopada 2026 — trwa");
    expect(boarder.horses[0].departureForm).toBeNull();
  });

  // Oracle: spec #112 — „Ośrodek widzi konia bez właściciela z zakończonym pobytem”; po usunięciu konta koń,
  // który jeszcze nie przyjechał, nie ma pobytu (pobyt usunięty), a ośrodek dalej go widzi.
  it("konie bez właściciela (konto usunięte) są w osobnej sekcji, bez nowego pobytu", () => {
    const view = composeStableBoarders(
      [
        row({
          rider_id: null,
          rider_name: null,
          rider_email: null,
          departure_day: "2026-11-01",
          departure_set_by: "stable",
        }),
        row({ horse_id: 2, rider_name: "Zofia Adamska", rider_id: "a" }),
      ],
      TODAY,
    );
    expect(view.boarders.map((boarder) => [boarder.name, boarder.email])).toEqual([
      ["Zofia Adamska", "katarzyna.zajac@example.com"],
    ]);
    expect(view.ownerless.heading).toBe("Konie bez właściciela");
    expect(view.ownerless.horses.map((horse) => [horse.name, horse.statusText, horse.newStay])).toEqual([
      ["Hrabia", "wyjechał", null],
    ]);
  });

  it("koń bez właściciela bez żadnego pobytu też jest w sekcji — bez pobytów i bez formularzy", () => {
    const view = composeStableBoarders(
      [
        row({
          horse_id: 3,
          horse_name: "Wicher",
          rider_id: null,
          rider_name: null,
          rider_email: null,
          stay_id: null,
          arrival_day: null,
        }),
      ],
      TODAY,
    );
    expect(view.boarders).toEqual([]);
    const [wicher] = view.ownerless.horses;
    expect(wicher).toMatchObject({
      name: "Wicher",
      current: false,
      statusText: "bez pobytu",
      stays: [],
      departureForm: null,
      newStay: null,
    });
  });

  it("bez koni bez właściciela sekcja jest pusta", () => {
    expect(composeStableBoarders([row({})], TODAY).ownerless.horses).toEqual([]);
  });

  // Oracle: AC #120 — usunięcie konta pensjonariusza kończy pobyt w dniu usunięcia; ośrodek widzi konia
  // bez właściciela z zakończonym pobytem i wie, skąd wziął się dzień wyjazdu.
  it("pobyt zakończony usunięciem konta: ośrodek widzi, kto wpisał dzień wyjazdu", () => {
    const [horse] = composeStableBoarders(
      [
        row({
          rider_id: null,
          rider_name: null,
          rider_email: null,
          departure_day: TODAY,
          departure_set_by: "account_deleted",
        }),
      ],
      TODAY,
    ).ownerless.horses;
    expect(horse.current).toBe(false);
    expect(horse.stays[0].setByText).toBe("dzień wyjazdu wpisany przy usunięciu konta pensjonariusza");
  });

  it("pensjonariusz bez imienia w profilu występuje pod adresem e-mail", () => {
    const [boarder] = composeStableBoarders([row({ rider_name: null })], TODAY).boarders;
    expect(boarder.name).toBe("katarzyna.zajac@example.com");
  });
});

function myRow(overrides: Partial<MyBoardingHorseRow>): MyBoardingHorseRow {
  return {
    horseId: 1,
    horseName: "Hrabia",
    stableName: "Stadnina Pod Dębem",
    stays: [{ id: 1, arrivalDay: "2026-08-24", departureDay: null, departureSetBy: null }],
    fees: [],
    ...overrides,
  };
}

describe("composeMyBoardingHorses — „Moje konie” pensjonariusza", () => {
  it("konie po ośrodku i imieniu, z pobytami od najnowszego", () => {
    const horses = composeMyBoardingHorses(
      [
        myRow({ horseId: 2, horseName: "Dukat", stableName: "Stajnia Nad Rzeką" }),
        myRow({
          horseId: 1,
          stays: [
            { id: 1, arrivalDay: "2026-03-01", departureDay: "2026-06-30", departureSetBy: "stable" },
            { id: 2, arrivalDay: "2026-10-01", departureDay: null, departureSetBy: null },
          ],
        }),
      ],
      TODAY,
    );
    expect(horses.map((horse) => [horse.name, horse.stableName])).toEqual([
      ["Hrabia", "Stadnina Pod Dębem"],
      ["Dukat", "Stajnia Nad Rzeką"],
    ]);
    expect(horses[0].stays.map((stay) => [stay.id, stay.periodText, stay.setByText])).toEqual([
      [2, "od 1 października 2026 — trwa", null],
      [1, "1 marca 2026 – 30 czerwca 2026", "dzień wyjazdu wpisany przez ośrodek"],
    ]);
  });

  it("pensjonariusz widzi swój wpis jako „wpisany przez Ciebie” i może go poprawić", () => {
    const [horse] = composeMyBoardingHorses(
      [myRow({ stays: [{ id: 3, arrivalDay: "2026-08-24", departureDay: TODAY, departureSetBy: "rider" }] })],
      TODAY,
    );
    expect(horse.stays[0].setByText).toBe("dzień wyjazdu wpisany przez Ciebie");
    expect(horse.current).toBe(false);
    expect(horse.departureForm).toMatchObject({ stayId: 3, action: "Popraw dzień wyjazdu", value: TODAY, max: TODAY });
    expect(horse.newStay).toBeNull();
  });

  it("trwający pobyt: „Zakończ pobyt” z dziś jako domyślnym dniem", () => {
    const [horse] = composeMyBoardingHorses([myRow({})], TODAY);
    expect(horse.current).toBe(true);
    expect(horse.departureForm).toEqual({
      stayId: 1,
      action: "Zakończ pobyt",
      value: TODAY,
      min: "2026-08-24",
      max: TODAY,
    });
  });
});

/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

// Oracle: AC #117, GLOSSARY „Opłata za pensjonat” — opłatę ustawia właściciel przy koniu na stronie
// „Pensjonariusze” (od tego albo od następnego miesiąca, zaplanowaną zmianę można usunąć); pensjonariusz
// widzi swoją w „Moich koniach” bez formularza. Opłata obowiązuje w bieżącym miesiącu jak stawka.
describe("opłata za pensjonat przy koniu", () => {
  const fees = [
    { id: 1, horseId: 1, fromMonth: "2026-09", amount: 150000 },
    { id: 2, horseId: 1, fromMonth: "2026-12", amount: 170000 },
    { id: 3, horseId: 2, fromMonth: "2026-11", amount: 1 },
  ];

  it("właściciel: opłata dziś, zaplanowana zmiana do usunięcia i formularz „od tego / od następnego miesiąca”", () => {
    const [boarder] = composeStableBoarders([row({ horse_id: 1 })], TODAY, fees).boarders;
    expect(boarder.horses[0].fee).toEqual({
      currentText: zl("1 500,00 zł"),
      planned: { id: 2, text: `od grudnia 2026: ${zl("1 700,00 zł")}` },
      choices: [
        { value: "biezacy", label: "Od tego miesiąca (listopad 2026)", checked: true },
        { value: "nastepny", label: "Od następnego miesiąca (grudzień 2026)", checked: false },
      ],
    });
  });

  it("właściciel: koń bez opłaty — bez kwoty, z formularzem", () => {
    const [boarder] = composeStableBoarders([row({ horse_id: 5 })], TODAY, fees).boarders;
    expect(boarder.horses[0].fee).toMatchObject({ currentText: null, planned: null });
    expect(boarder.horses[0].fee.choices).toHaveLength(2);
  });

  it("pensjonariusz: swoja opłata i zaplanowana zmiana, bez formularza", () => {
    const [horse] = composeMyBoardingHorses([myRow({ fees: fees.filter((fee) => fee.horseId === 1) })], TODAY);
    expect(horse.fee).toEqual({
      currentText: zl("1 500,00 zł"),
      planned: { id: 2, text: `od grudnia 2026: ${zl("1 700,00 zł")}` },
      choices: null,
    });
  });
});

describe("boardingNotice — zdanie po udanej czynności", () => {
  it.each([
    ["kon", "Dodano konia pensjonatowego."],
    ["pobyt", "Dodano nowy pobyt."],
    ["wyjazd", "Zapisano dzień wyjazdu."],
    ["oplata", "Zapisano opłatę za pensjonat."],
    ["oplata-usunieta", "Usunięto zaplanowaną zmianę opłaty za pensjonat."],
  ])("?sukces=%s", (raw, text) => {
    expect(boardingNotice(raw)).toBe(text);
  });

  it.each([null, "", "1", "<script>"])("bez znanego wyniku (%s) — bez zdania", (raw) => {
    expect(boardingNotice(raw)).toBeNull();
  });
});
