import { boardingFeeSchedule, type BoardingFeeChange } from "@/lib/boarding/fees";
import { BOARDING_PAGE_TEXTS } from "@/lib/boarding/texts";
import { BOARDING_OUTCOME, type BoardingOutcome } from "@/lib/boarding/redirect";
import { formatFromMonth, formatLongDayMonthYear, formatMoney } from "@/lib/format";
import { addDays } from "@/lib/schedule/dates";
import { rateChoices, type RateChoice } from "@/lib/settlements/settlements";

/**
 * Modele widoku stron „Pensjonariusze” (właściciel) i „Moje konie” (pensjonariusz), #114. Strony tylko
 * renderują: grupowanie, kolejność, opisy pobytów i granice formularzy dnia wyjazdu liczą się tutaj.
 * Granice dat formularzy (nie później niż dziś, nie wcześniej niż przyjazd) to podpowiedź dla
 * przeglądarki — regułę pilnuje `public.set_stay_departure`.
 */

/** Kto ostatnio ustawił dzień wyjazdu — `horse_stays.departure_set_by` (`account_deleted` — usunięcie konta, #120). */
export type DepartureSetBy = "stable" | "rider" | "account_deleted";

/**
 * Wiersz `public.get_stable_boarding_horses()` — jeden na pobyt; `rider_*` NULL — konto usunięte; `stay_*`
 * NULL — koń bez żadnego pobytu (#112: konto usunięte, zanim koń przyjechał).
 */
export interface StableBoardingRow {
  horse_id: number;
  horse_name: string;
  rider_id: string | null;
  rider_name: string | null;
  rider_email: string | null;
  stay_id: number | null;
  arrival_day: string | null;
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

/**
 * Opłata za pensjonat konia (#117) dziś — wzorem stawki ośrodka: kwota w bieżącym miesiącu, zaplanowana
 * zmiana i (tylko u właściciela) wybór „od tego / od następnego miesiąca” formularza nowej opłaty.
 */
export interface BoardingFeeView {
  /** Np. `1 500,00 zł`; `null` — koń bez opłaty. */
  currentText: string | null;
  /** Zmiana od następnego miesiąca: `od grudnia 2026: 1 700,00 zł` — u właściciela z „Usuń zaplanowaną zmianę”. */
  planned: { id: number; text: string } | null;
  /** Wybór miesiąca „od” formularza; `null` — pensjonariusz (opłatę ustawia tylko ośrodek). */
  choices: RateChoice[] | null;
}

export interface BoardingHorseView {
  id: number;
  name: string;
  fee: BoardingFeeView;
  /** Najnowszy pobyt trwa (bez dnia wyjazdu). */
  current: boolean;
  /** Pigułka przy imieniu: `w ośrodku`, `wyjechał`, a koń bez żadnego pobytu — `bez pobytu`. */
  statusText: string;
  stays: StayView[];
  /** `null` — koń jeszcze nie przyjechał (dzień wyjazdu nie może być przed przyjazdem) albo nie ma pobytu. */
  departureForm: DepartureForm | null;
  /** Tylko u właściciela, gdy ostatni pobyt się zakończył, a koń ma właściciela. */
  newStay: NewStayForm | null;
}

export interface BoarderView {
  /** Konto pensjonariusza. */
  riderId: string;
  name: string;
  email: string | null;
  horses: BoardingHorseView[];
}

export interface StableBoardersView {
  /** Pensjonariusze z końmi — po nazwisku. */
  boarders: BoarderView[];
  /**
   * Sekcja „Konie bez właściciela” (#112): konie pensjonatowe, których właściciel usunął konto — z pobytami,
   * także bez żadnego (pobyt, który się nie zaczął, znika z kontem). Pusta lista — strona sekcji nie pokazuje.
   */
  ownerless: { heading: string; horses: BoardingHorseView[] };
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
    case "account_deleted":
      return texts.setBy.accountDeleted;
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

/** Opłata konia dziś (miesiąc dnia `today`) — formularz tylko u właściciela ośrodka. */
function composeFee(
  fees: readonly BoardingFeeChange[],
  horseId: number,
  today: string,
  viewer: "stable" | "rider",
): BoardingFeeView {
  const month = today.slice(0, 7);
  const { current, planned } = boardingFeeSchedule(fees, horseId, month);
  return {
    currentText: current === null ? null : formatMoney(current),
    planned:
      planned === null
        ? null
        : { id: planned.id, text: `${formatFromMonth(planned.fromMonth)}: ${formatMoney(planned.amount)}` },
    choices: viewer === "stable" ? rateChoices(month) : null,
  };
}

/** Koń z pobytami (od najnowszego). `canAddStay` — właściciel ośrodka i koń z właścicielem. */
function composeHorse(
  id: number,
  name: string,
  stays: Stay[],
  today: string,
  viewer: "stable" | "rider",
  canAddStay: boolean,
  fees: readonly BoardingFeeChange[],
): BoardingHorseView {
  const sorted = [...stays].sort((a, b) => b.arrivalDay.localeCompare(a.arrivalDay));
  const latest = sorted.at(0);
  const current = latest?.departureDay === null;
  return {
    id,
    name,
    fee: composeFee(fees, id, today, viewer),
    current,
    statusText: latest === undefined ? texts.noStay : current ? texts.current : texts.ended,
    stays: sorted.map((stay) => ({ id: stay.id, periodText: periodText(stay), setByText: setByText(stay, viewer) })),
    // Koń bez pobytu (tylko bez właściciela, #112) nie ma formularzy.
    departureForm: latest === undefined ? null : departureForm(latest, today),
    newStay: canAddStay && latest !== undefined ? newStayForm(id, latest, today) : null,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pl");

/**
 * Strona „Pensjonariusze”: pensjonariusze po nazwisku, konie po imieniu, przy koniu opłata za pensjonat ze zmian
 * `fees` (#117); konie bez właściciela osobno (#112), także bez pobytu.
 */
export function composeStableBoarders(
  rows: readonly StableBoardingRow[],
  today: string,
  fees: readonly BoardingFeeChange[] = [],
): StableBoardersView {
  type HorseStays = Map<number, { name: string; stays: Stay[] }>;
  const boarders = new Map<string, { boarder: Omit<BoarderView, "horses">; horses: HorseStays }>();
  const ownerless: HorseStays = new Map();

  for (const row of rows) {
    let horses = ownerless;
    if (row.rider_id !== null) {
      let entry = boarders.get(row.rider_id);
      if (!entry) {
        entry = {
          boarder: { riderId: row.rider_id, name: row.rider_name ?? row.rider_email ?? "", email: row.rider_email },
          horses: new Map(),
        };
        boarders.set(row.rider_id, entry);
      }
      horses = entry.horses;
    }
    let horse = horses.get(row.horse_id);
    if (!horse) {
      horse = { name: row.horse_name, stays: [] };
      horses.set(row.horse_id, horse);
    }
    if (row.stay_id !== null && row.arrival_day !== null) {
      horse.stays.push({
        id: row.stay_id,
        arrivalDay: row.arrival_day,
        departureDay: row.departure_day,
        departureSetBy: row.departure_set_by,
      });
    }
  }

  const horseViews = (horses: HorseStays, canAddStay: boolean) =>
    [...horses.entries()]
      .map(([id, horse]) => composeHorse(id, horse.name, horse.stays, today, "stable", canAddStay, fees))
      .sort(byName);

  return {
    boarders: [...boarders.values()]
      .map(({ boarder, horses }) => ({ ...boarder, horses: horseViews(horses, true) }))
      .sort((a, b) => byName(a, b) || (a.email ?? "").localeCompare(b.email ?? "")),
    ownerless: { heading: texts.stable.ownerless, horses: horseViews(ownerless, false) },
  };
}

/** Koń pensjonatowy pensjonariusza z pobytami — wiersz `listMyBoardingHorses`. */
export interface MyBoardingHorseRow {
  horseId: number;
  horseName: string;
  stableName: string;
  stays: Stay[];
  /** Zmiany opłaty za pensjonat tego konia (#117). */
  fees: BoardingFeeChange[];
}

export interface MyBoardingHorseView extends BoardingHorseView {
  stableName: string;
}

/** Strona „Moje konie”: konie po ośrodku i imieniu; konie bez pobytu pomijane. */
export function composeMyBoardingHorses(rows: readonly MyBoardingHorseRow[], today: string): MyBoardingHorseView[] {
  return rows
    .filter((row) => row.stays.length > 0)
    .map((row) => ({
      ...composeHorse(row.horseId, row.horseName, row.stays, today, "rider", false, row.fees),
      stableName: row.stableName,
    }))
    .sort((a, b) => a.stableName.localeCompare(b.stableName, "pl") || byName(a, b));
}

const NOTICES: Record<BoardingOutcome, string> = {
  [BOARDING_OUTCOME.horse]: texts.stable.added,
  [BOARDING_OUTCOME.stay]: texts.stable.stayAdded,
  [BOARDING_OUTCOME.departure]: texts.departureSaved,
  [BOARDING_OUTCOME.fee]: texts.fee.saved,
  [BOARDING_OUTCOME.feeDeleted]: texts.fee.deleted,
};

/** Zdanie po udanej czynności z `?sukces=` (`SUCCESS_PARAM`); nieznana wartość — bez zdania. */
export function boardingNotice(raw: string | null): string | null {
  const outcome = Object.values(BOARDING_OUTCOME).find((value) => value === raw);
  return outcome ? NOTICES[outcome] : null;
}
