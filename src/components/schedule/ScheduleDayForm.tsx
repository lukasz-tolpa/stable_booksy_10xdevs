import React, { useState } from "react";
import { CalendarCheck, Check, CircleAlert, Info, Plus } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatClockHour } from "@/lib/format";
import type { InstructorListItem } from "@/lib/instructors/queries";
import type { SlotSeats } from "@/lib/schedule/queries";
import { hoursError, seatFieldName } from "@/lib/schedule/schema";
import {
  fillAll,
  lastRideLabel,
  parseSeatInput,
  seatAt,
  seatKey,
  sheetRows,
  stepSeat,
  withoutInstructor,
  workingHours,
  type HourFill,
  type SeatMap,
} from "@/lib/schedule/sheet";
import { cn } from "@/lib/utils";
import type { HorseListItem } from "@/lib/stables/queries";

/**
 * Układ wg wariantu A z prototypu (#45): na górze baner szkicu z ostatnio ułożonego dnia, dwie listy
 * godzin pracy z podpisem „ostatnia jazda o …”, konie i instruktorzy jako chipy, a pod nimi
 * arkusz limitów miejsc: wiersz to godzina jazd, kolumna to instruktor pracujący tego dnia,
 * ostatnia kolumna „Koni zajętych” liczy sumę limitów na żywo (#45).
 *
 * Chipy koni i instruktorów to osobne pola `checkbox` o wspólnej nazwie (`horseIds`,
 * `instructorIds`): serwer czyta powtórzone wpisy z `FormData`. Limit miejsc to jedno pole
 * na instruktora i godzinę (`seatFieldName`); arkusz pokazuje wyłącznie godziny bieżącego
 * zakresu, więc godziny spoza niego nie są wysyłane. Wszystko, co arkusz liczy, pochodzi
 * z `@/lib/schedule/sheet`; przekroczenie liczby koni nie blokuje zapisu — strażnikiem jest
 * baza (SB007).
 */

interface Props {
  day: string;
  openHour: number | "";
  closeHour: number | "";
  selectedHorseIds: number[];
  horses: HorseListItem[];
  selectedInstructorIds: number[];
  instructors: InstructorListItem[];
  seats: SlotSeats[];
  /** Data dnia, z którego pochodzi szkic (`prefillSourceDay` z `@/lib/schedule/form`), albo `null`. */
  prefillFrom: string | null;
  serverError?: string | null;
}

const controlClass =
  "min-h-[46px] cursor-pointer rounded-md border border-border-2 bg-surface px-3.5 py-3 font-mono text-[15px] tabular-nums text-foreground transition-colors hover:border-faint focus:border-primary focus:ring-[3px] focus:ring-primary-soft focus:outline-none";

const stepButtonClass =
  "grid size-8 flex-none cursor-pointer place-items-center rounded-md text-[17px] text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";

const shortcutClass =
  "cursor-pointer rounded border border-border-2 bg-surface px-1.5 py-0.5 font-mono text-[11.5px] font-normal whitespace-nowrap transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary";

/** Listy godzin pracy: otwarcie 0:00–23:00, zamknięcie 1:00–24:00 (jak w `scheduleDaySchema`). */
const OPEN_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const CLOSE_HOURS = OPEN_HOURS.map((hour) => hour + 1);

/** Skróty w nagłówku kolumny instruktora; „wyczyść” zeruje limity we wszystkich godzinach zakresu. */
const FILL_SHORTCUTS = [
  { value: 1, label: "wszędzie 1" },
  { value: 2, label: "wszędzie 2" },
  { value: 3, label: "wszędzie 3" },
  { value: 0, label: "wyczyść" },
];

/**
 * Komórka arkusza: −, pole liczbowe i +. Pole ma etykietę „{instruktor}, {h}:00” (lokator e2e)
 * i podczas pisania może być chwilowo puste; przy opuszczeniu pokazuje limit z `parseSeatInput`.
 * Do serwera idzie zawsze ten limit — z ukrytego pola o nazwie z kontraktu formularza — także
 * przy zapisie Enterem prosto z pola. Przyciski −/+ są poza kolejnością Tab (pomoc dla myszy
 * i dotyku; z klawiatury limit zmienia się w polu, także strzałkami) i mają własne opisy.
 */
function SeatStepper({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border p-0.5 transition-colors",
        value > 0 ? "border-primary bg-primary-soft" : "border-border-2 bg-surface",
      )}
    >
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        tabIndex={-1}
        disabled={value === 0}
        onClick={() => {
          onChange(stepSeat(value, -1));
        }}
        aria-label={`${label}: mniej`}
        className={stepButtonClass}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={label}
        value={typing ?? value}
        onChange={(e) => {
          setTyping(e.target.value);
          onChange(parseSeatInput(e.target.value));
        }}
        onBlur={() => {
          setTyping(null);
        }}
        className={cn(
          "focus:border-primary focus:ring-primary-soft w-12 [appearance:textfield] rounded-md border border-transparent bg-transparent py-1 text-center font-mono text-[15px] tabular-nums focus:ring-[3px] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          value > 0 ? "text-foreground font-semibold" : "text-faint",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          onChange(stepSeat(value, 1));
        }}
        aria-label={`${label}: więcej`}
        className={stepButtonClass}
      >
        +
      </button>
    </div>
  );
}

/** Kolumna „Koni zajętych”: suma limitów na tle koni dnia; stan nigdy nie jest tylko kolorem. */
function HourFillCell({ total, horseCount, fill }: { total: number; horseCount: number; fill: HourFill }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {fill === "over" && (
        <span className="text-danger-ink inline-flex items-center gap-1 text-[12.5px] font-semibold">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          za mało koni
        </span>
      )}
      {fill === "full" && (
        <span className="bg-success-soft text-success-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold">
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
          pełna
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[13px] tabular-nums",
          fill === "over" ? "text-danger-ink font-semibold" : "text-muted-foreground",
        )}
      >
        {total} / {horseCount}
      </span>
    </span>
  );
}

interface Choice {
  id: number;
  name: string;
  note?: string;
}

/**
 * Chipy w jednym rzędzie: wspólny kształt koni i instruktorów dnia. Pod spodem prawdziwe pole
 * `checkbox` (nazwa i wartość z kontraktu formularza), którego dostępna nazwa to imię.
 */
function ChipList({
  name,
  idPrefix,
  choices,
  selected,
  onToggle,
}: {
  name: string;
  idPrefix: string;
  choices: Choice[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {choices.map((choice) => {
        const isOn = selected.includes(choice.id);
        const inputId = `${idPrefix}-${String(choice.id)}`;
        const Icon = isOn ? Check : Plus;

        return (
          <li key={choice.id} className="min-w-0">
            <label
              htmlFor={inputId}
              className={cn(
                "relative inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors",
                "has-[input:focus-visible]:outline-primary has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2",
                isOn
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border-2 bg-surface hover:bg-surface-2",
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                name={name}
                value={choice.id}
                checked={isOn}
                onChange={() => {
                  onToggle(choice.id);
                }}
                // Przezroczyste pole na całym chipie: klik (także Playwrighta) trafia w prawdziwy checkbox.
                className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0"
              />
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {choice.name}
                {choice.note && (
                  <span className={cn("ml-1.5 text-[12.5px] font-normal", !isOn && "text-muted-foreground")}>
                    {choice.note}
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default function ScheduleDayForm({
  day,
  openHour: initialOpen,
  closeHour: initialClose,
  selectedHorseIds,
  horses,
  selectedInstructorIds,
  instructors,
  seats: initialSeats,
  prefillFrom,
  serverError,
}: Props) {
  const [openHour, setOpenHour] = useState(String(initialOpen));
  const [closeHour, setCloseHour] = useState(String(initialClose));
  const [selected, setSelected] = useState<number[]>(selectedHorseIds);
  const [selectedInstructors, setSelectedInstructors] = useState<number[]>(selectedInstructorIds);
  const [seats, setSeats] = useState<SeatMap>(() =>
    Object.fromEntries(initialSeats.map((slot) => [seatKey(slot.instructorId, slot.hour), slot.seats])),
  );
  const [submitted, setSubmitted] = useState(false);

  // Zły zakres widać od razu, gdy obie godziny są wybrane; niewybraną godzinę — dopiero po próbie zapisu.
  const rangeError = hoursError(openHour, closeHour);
  const error = submitted || (openHour !== "" && closeHour !== "") ? rangeError : null;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (rangeError) {
      e.preventDefault();
      setSubmitted(true);
    }
  }

  function toggleHorse(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function toggleInstructor(id: number) {
    if (selectedInstructors.includes(id)) {
      setSelectedInstructors((prev) => prev.filter((value) => value !== id));
      return;
    }

    setSeats((prev) => withoutInstructor(prev, id));
    setSelectedInstructors((prev) => [...prev, id]);
  }

  const hours = workingHours(openHour, closeHour);
  const workingInstructors = instructors.filter((instructor) => selectedInstructors.includes(instructor.id));
  const rows = sheetRows(
    hours,
    workingInstructors.map((instructor) => instructor.id),
    seats,
    selected.length,
  );

  const lastRide = lastRideLabel(openHour, closeHour);

  return (
    <form method="POST" action="/api/schedule/save" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="day" value={day} />

      {prefillFrom && (
        <p className="bg-primary-soft text-foreground border-primary mb-6 flex items-start gap-2 rounded-md border-l-[3px] px-3.5 py-2.5 text-[13.5px]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Szkic z dnia <span className="font-mono tabular-nums">{prefillFrom}</span> — dopóki nie zapiszesz, jeźdźcy
            nic nie widzą.
          </span>
        </p>
      )}

      <fieldset className="mb-6 min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Godziny pracy</legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="openHour" className="text-foreground text-[13px] font-semibold">
              Od
            </label>
            <select
              id="openHour"
              name="openHour"
              value={openHour}
              onChange={(e) => {
                setOpenHour(e.target.value);
              }}
              className={controlClass}
            >
              {openHour === "" && <option value="">—</option>}
              {OPEN_HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {formatClockHour(hour)}
                </option>
              ))}
            </select>
          </div>
          <span className="text-faint pb-3" aria-hidden="true">
            —
          </span>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="closeHour" className="text-foreground text-[13px] font-semibold">
              Do
            </label>
            <select
              id="closeHour"
              name="closeHour"
              value={closeHour}
              onChange={(e) => {
                setCloseHour(e.target.value);
              }}
              className={controlClass}
            >
              {closeHour === "" && <option value="">—</option>}
              {CLOSE_HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {formatClockHour(hour)}
                </option>
              ))}
            </select>
          </div>
          {lastRide && <p className="text-muted-foreground m-0 pb-3 text-[13px]">{lastRide}</p>}
        </div>
        {error && (
          <p className="text-danger-ink mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium">
            <CircleAlert className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </fieldset>

      <fieldset className="mb-6 min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Konie ({selected.length})</legend>
        <ChipList
          name="horseIds"
          idPrefix="horse"
          choices={horses.map((horse) => ({
            id: horse.id,
            name: horse.name,
            note: horse.active ? undefined : "(wycofany ze służby)",
          }))}
          selected={selected}
          onToggle={toggleHorse}
        />
      </fieldset>

      <fieldset className="mb-6 min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Instruktorzy</legend>
        {instructors.length === 0 ? (
          <p className="text-muted-foreground text-[13.5px]">
            Nie masz aktywnych instruktorów. <a href="/osrodek/instruktorzy">Dodaj instruktora</a>, żeby wystawić
            miejsca.
          </p>
        ) : (
          <ChipList
            name="instructorIds"
            idPrefix="instructor"
            choices={instructors.map((instructor) => ({
              id: instructor.id,
              name: instructor.name,
              note: instructor.active ? undefined : "(nieaktywny)",
            }))}
            selected={selectedInstructors}
            onToggle={toggleInstructor}
          />
        )}
      </fieldset>

      {instructors.length > 0 && (workingInstructors.length === 0 || hours.length === 0) && (
        <p className="text-muted-foreground bg-surface-2 m-0 rounded-md p-4 text-center text-[13.5px]">
          {workingInstructors.length === 0
            ? "Wybierz instruktora, żeby rozpisać miejsca."
            : "Wybierz godziny pracy, żeby rozpisać miejsca."}
        </p>
      )}

      {workingInstructors.length > 0 && hours.length > 0 && (
        <fieldset className="min-w-0">
          <legend className="text-foreground mb-1 text-[13px] font-semibold">Limity miejsc</legend>
          <p className="text-muted-foreground mb-3 text-[13px]">
            Każda komórka to slot instruktora, a limit miejsc to liczba jeźdźców, których przyjmie w tej godzinie (0 —
            nie prowadzi jazdy).
          </p>
          <div className="border-border-2 overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-[14px]">
              <thead className="bg-surface-2">
                <tr>
                  <th
                    scope="col"
                    className="bg-surface-2 sticky left-0 z-10 px-3 py-2.5 text-left text-[12.5px] font-semibold"
                  >
                    Godzina
                  </th>
                  {workingInstructors.map((instructor) => (
                    <th key={instructor.id} scope="col" className="px-2 py-2.5 text-center align-top">
                      <span className="block text-[13px] font-semibold [overflow-wrap:anywhere]">
                        {instructor.name}
                      </span>
                      <span className="mt-1.5 flex flex-wrap justify-center gap-1">
                        {FILL_SHORTCUTS.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setSeats((prev) => fillAll(prev, instructor.id, hours, value));
                            }}
                            aria-label={`${instructor.name}: ${label}`}
                            className={shortcutClass}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right text-[12.5px] font-semibold whitespace-nowrap">
                    Koni zajętych
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const over = row.fill === "over";
                  const hourLabel = formatClockHour(row.hour);

                  return (
                    <tr key={row.hour} className={cn("border-border border-t", over && "bg-danger-soft")}>
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 px-3 py-2 text-left font-mono font-normal tabular-nums",
                          over ? "bg-danger-soft" : "bg-surface",
                        )}
                      >
                        {hourLabel}
                      </th>
                      {workingInstructors.map((instructor) => (
                        <td key={instructor.id} className="px-2 py-2 text-center">
                          <SeatStepper
                            name={seatFieldName(instructor.id, row.hour)}
                            label={`${instructor.name}, ${hourLabel}`}
                            value={seatAt(seats, instructor.id, row.hour)}
                            onChange={(value) => {
                              setSeats((prev) => ({ ...prev, [seatKey(instructor.id, row.hour)]: value }));
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <HourFillCell total={row.total} horseCount={selected.length} fill={row.fill} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}

      {serverError && (
        <div className="mt-6">
          <ServerError message={serverError} />
        </div>
      )}

      <div className="mt-6">
        <SubmitButton variant="accent" pendingText="Zapisywanie..." icon={<CalendarCheck className="size-4" />}>
          Zapisz grafik
        </SubmitButton>
      </div>
    </form>
  );
}
