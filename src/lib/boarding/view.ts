import { BOARDING_PAGE_TEXTS } from "@/lib/boarding/texts";
import { BOARDING_OUTCOME, type BoardingOutcome } from "@/lib/boarding/redirect";
import { formatLongDayMonthYear } from "@/lib/format";
import { addDays } from "@/lib/schedule/dates";

/**
 * Modele widoku stron „Pensjonariusze” (właściciel) i „Moje konie” (pensjonariusz), #114. Strony tylko
 * renderują: grupowanie, kolejność, opisy pobytów i granice formularzy dnia wyjazdu liczą się tutaj.
 * Granice dat formularzy (nie później niż dziś, nie wcześniej niż przyjazd) to podpowiedź dla
 * przeglądarki — regułę pilnuje `public.set_stay_departure`.
 */

/** Kto ostatnio ustawił dzień wyjazdu — `horse_stays.departure_set_by`. */
export type DepartureSetBy = "stable" | "rider";

/** Wiersz `public.get_stable_boarding_horses()` — jeden na pobyt; `rider_*` NULL — konto usunięte. */
export interface StableBoardingRow {
  horse_id: number;
  horse_name: string;
  rider_id: string | null;
  rider_name: string | null;
  rider_email: string | null;
  stay_id: number;
  arrival_day: string;
  departure_day: string | null;
  departure_set_by: string | null;
}

export interface StayView {
  id: number;
  /** `od 1 października 2026 — trwa` albo `1 marca 2026 – 30 czerwca 2026`. */
  periodText: string;
  /** Kto ostatnio ustawił dzień wyjazdu; `null` — pobyt trwa. */
  setByText: string | null;
}

/** Formularz dnia wyjazdu najnowszego pobytu: wartości pola `type="date"` i napis przycisku. */
export interface DepartureForm {
  stayId: number;
  action: string;
  value: string;
  min: string;
  max: string;
}

/** Formularz „Nowy pobyt” konia, którego ostatni pobyt się zakończył. */
export interface NewStayForm {
  horseId: number;
  min: string;
  value: string;
}

export interface BoardingHorseView {
  id: number;
  name: string;
  /** Najnowszy pobyt trwa (bez dnia wyjazdu). */
  current: boolean;
  stays: StayView[];
  /** `null` — koń jeszcze nie przyjechał (dzień wyjazdu nie może być przed przyjazdem). */
  departureForm: DepartureForm | null;
  /** Tylko u właściciela, gdy ostatni pobyt się zakończył, a koń ma właściciela. */
  newStay: NewStayForm | null;
}

export interface BoarderView {
  /** Konto pensjonariusza; `null` — konie bez właściciela (konta usunięte). */
  riderId: string | null;
  name: string;
  email: string | null;
  horses: BoardingHorseView[];
}

export interface StableBoardersView {
  boarders: BoarderView[];
}

interface Stay {
  id: number;
  arrivalDay: string;
  departureDay: string | null;
  departureSetBy: string | null;
}

const texts = BOARDING_PAGE_TEXTS;

function periodText(stay: Stay): string {
  const arrival = formatLongDayMonthYear(stay.arrivalDay);
  return stay.departureDay === null
    ? `${texts.since} ${arrival} — ${texts.ongoing}`
    : `${arrival} – ${formatLongDayMonthYear(stay.departureDay)}`;
}

function setByText(stay: Stay, viewer: "stable" | "rider"): string | null {
  switch (stay.departureSetBy) {
    case "stable":
      return texts.setBy.stable;
    case "rider":
      return viewer === "rider" ? texts.setBy.me : texts.setBy.rider;
    default:
      return null;
  }
}

function departureForm(latest: Stay, today: string): DepartureForm | null {
  if (latest.arrivalDay > today) {
    return null;
  }
  return {
    stayId: latest.id,
    action: latest.departureDay === null ? texts.endStay : texts.correctDeparture,
    value: latest.departureDay ?? today,
    min: latest.arrivalDay,
    max: today,
  };
}

function newStayForm(horseId: number, latest: Stay, today: string): NewStayForm | null {
  if (latest.departureDay === null) {
    return null;
  }
  const min = addDays(latest.departureDay, 1);
  return { horseId, min, value: min > today ? min : today };
}

/** Koń z pobytami (od najnowszego). `canAddStay` — właściciel ośrodka i koń z właścicielem. */
function composeHorse(
  id: number,
  name: string,
  stays: Stay[],
  today: string,
  viewer: "stable" | "rider",
  canAddStay: boolean,
): BoardingHorseView {
  const sorted = [...stays].sort((a, b) => b.arrivalDay.localeCompare(a.arrivalDay));
  const latest = sorted[0];
  return {
    id,
    name,
    current: latest.departureDay === null,
    stays: sorted.map((stay) => ({ id: stay.id, periodText: periodText(stay), setByText: setByText(stay, viewer) })),
    departureForm: departureForm(latest, today),
    newStay: canAddStay ? newStayForm(id, latest, today) : null,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pl");

/** Strona „Pensjonariusze”: pensjonariusze po nazwisku (konie bez właściciela na końcu), konie po imieniu. */
export function composeStableBoarders(rows: readonly StableBoardingRow[], today: string): StableBoardersView {
  const boarders = new Map<string, { boarder: BoarderView; horses: Map<number, { name: string; stays: Stay[] }> }>();

  for (const row of rows) {
    const key = row.rider_id ?? "";
    let entry = boarders.get(key);
    if (!entry) {
      entry = {
        boarder: {
          riderId: row.rider_id,
          name: row.rider_id === null ? texts.stable.ownerless : (row.rider_name ?? row.rider_email ?? ""),
          email: row.rider_id === null ? null : row.rider_email,
          horses: [],
        },
        horses: new Map(),
      };
      boarders.set(key, entry);
    }
    let horse = entry.horses.get(row.horse_id);
    if (!horse) {
      horse = { name: row.horse_name, stays: [] };
      entry.horses.set(row.horse_id, horse);
    }
    horse.stays.push({
      id: row.stay_id,
      arrivalDay: row.arrival_day,
      departureDay: row.departure_day,
      departureSetBy: row.departure_set_by,
    });
  }

  const list = [...boarders.values()].map(({ boarder, horses }) => ({
    ...boarder,
    horses: [...horses.entries()]
      .map(([id, horse]) => composeHorse(id, horse.name, horse.stays, today, "stable", boarder.riderId !== null))
      .sort(byName),
  }));

  return {
    boarders: list.sort((a, b) =>
      a.riderId === null ? 1 : b.riderId === null ? -1 : byName(a, b) || (a.email ?? "").localeCompare(b.email ?? ""),
    ),
  };
}

/** Koń pensjonatowy pensjonariusza z pobytami — wiersz `listMyBoardingHorses`. */
export interface MyBoardingHorseRow {
  horseId: number;
  horseName: string;
  stableName: string;
  stays: Stay[];
}

export interface MyBoardingHorseView extends BoardingHorseView {
  stableName: string;
}

/** Strona „Moje konie”: konie po ośrodku i imieniu; konie bez pobytu pomijane. */
export function composeMyBoardingHorses(rows: readonly MyBoardingHorseRow[], today: string): MyBoardingHorseView[] {
  return rows
    .filter((row) => row.stays.length > 0)
    .map((row) => ({
      ...composeHorse(row.horseId, row.horseName, row.stays, today, "rider", false),
      stableName: row.stableName,
    }))
    .sort((a, b) => a.stableName.localeCompare(b.stableName, "pl") || byName(a, b));
}

const NOTICES: Record<BoardingOutcome, string> = {
  [BOARDING_OUTCOME.horse]: texts.stable.added,
  [BOARDING_OUTCOME.stay]: texts.stable.stayAdded,
  [BOARDING_OUTCOME.departure]: texts.departureSaved,
};

/** Zdanie po udanej czynności z `?sukces=` (`SUCCESS_PARAM`); nieznana wartość — bez zdania. */
export function boardingNotice(raw: string | null): string | null {
  const outcome = Object.values(BOARDING_OUTCOME).find((value) => value === raw);
  return outcome ? NOTICES[outcome] : null;
}
