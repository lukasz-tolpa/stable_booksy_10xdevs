import React, { useState } from "react";
import { CalendarCheck, Check, CircleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatClockHour } from "@/lib/format";
import type { InstructorListItem } from "@/lib/instructors/queries";
import type { SlotSeats } from "@/lib/schedule/queries";
import { seatFieldName } from "@/lib/schedule/schema";
import {
  fillAll,
  seatAt,
  seatKey,
  sheetRows,
  stepSeat,
  withoutInstructor,
  workingHours,
  type HourLoad,
  type SeatMap,
} from "@/lib/schedule/sheet";
import { cn } from "@/lib/utils";
import type { HorseListItem } from "@/lib/stables/queries";

/**
 * Wygląd wg `osrodek-grafik.html`: dwie kontrolki godzin w mono obok siebie, konie
 * i instruktorzy jako karty-checkboxy, po dwie w rzędzie na szerokim ekranie, a pod nimi
 * arkusz limitów miejsc: wiersz to godzina jazd, kolumna to instruktor pracujący tego dnia,
 * ostatnia kolumna „Koni zajętych” liczy sumę limitów na żywo (#45).
 *
 * Konie i instruktorzy zostają osobnymi polami `checkbox` o wspólnej nazwie (`horseIds`,
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
  serverError?: string | null;
}

const controlClass =
  "w-full min-h-[46px] rounded-md border border-border-2 bg-surface px-3.5 py-3 font-mono text-[15px] tabular-nums text-foreground transition-colors hover:border-faint focus:border-primary focus:ring-[3px] focus:ring-primary-soft focus:outline-none";

const stepButtonClass =
  "grid size-8 flex-none cursor-pointer place-items-center rounded-md text-[17px] text-foreground transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent";

const shortcutClass =
  "cursor-pointer rounded border border-border-2 bg-surface px-1.5 py-0.5 font-mono text-[11.5px] font-normal whitespace-nowrap transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary";

/** Skróty w nagłówku kolumny instruktora; „wyczyść” zeruje limity we wszystkich godzinach zakresu. */
const FILL_SHORTCUTS = [
  { value: 1, label: "wszędzie 1" },
  { value: 2, label: "wszędzie 2" },
  { value: 3, label: "wszędzie 3" },
  { value: 0, label: "wyczyść" },
];

/**
 * Komórka arkusza: −, pole liczbowe i +. Pole niesie nazwę limitu z kontraktu formularza
 * i etykietę „{instruktor}, {h}:00” (lokator e2e); przyciski mają własne opisy.
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
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border p-0.5 transition-colors",
        value > 0 ? "border-primary bg-primary-soft" : "border-border-2 bg-surface",
      )}
    >
      <button
        type="button"
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
        name={name}
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const typed = Math.trunc(Number(e.target.value));
          onChange(Number.isFinite(typed) && typed > 0 ? typed : 0);
        }}
        className={cn(
          "focus:border-primary focus:ring-primary-soft w-12 [appearance:textfield] rounded-md border border-transparent bg-transparent py-1 text-center font-mono text-[15px] tabular-nums focus:ring-[3px] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          value > 0 ? "text-foreground font-semibold" : "text-faint",
        )}
      />
      <button
        type="button"
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
function HourLoadCell({ total, horseCount, load }: { total: number; horseCount: number; load: HourLoad }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {load === "over" && (
        <span className="text-danger-ink inline-flex items-center gap-1 text-[12.5px] font-semibold">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          za mało koni
        </span>
      )}
      {load === "full" && (
        <span className="bg-success-soft text-success-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold">
          <Check className="size-3.5 shrink-0" aria-hidden="true" />
          pełna
        </span>
      )}
      <span
        className={cn(
          "font-mono text-[13px] tabular-nums",
          load === "over" ? "text-danger-ink font-semibold" : "text-muted-foreground",
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

/** Karty-checkboxy: wspólny kształt listy koni i listy instruktorów dnia. */
function ChoiceList({
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
    <ul className="grid list-none gap-2.5 p-0 sm:grid-cols-2">
      {choices.map((choice) => {
        const isOn = selected.includes(choice.id);
        const inputId = `${idPrefix}-${String(choice.id)}`;

        return (
          <li key={choice.id}>
            <label
              htmlFor={inputId}
              className={cn(
                "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md border px-3.5 transition-colors",
                "has-[input:focus-visible]:outline-primary has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2",
                isOn ? "border-primary bg-primary-soft" : "border-border-2 bg-surface hover:bg-surface-2",
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
                className="accent-primary size-[17px] flex-none"
              />
              <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {choice.name}
                {choice.note && (
                  <span className="text-muted-foreground ml-2 text-[12.5px] font-normal">{choice.note}</span>
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
  serverError,
}: Props) {
  const [openHour, setOpenHour] = useState(String(initialOpen));
  const [closeHour, setCloseHour] = useState(String(initialClose));
  const [selected, setSelected] = useState<number[]>(selectedHorseIds);
  const [selectedInstructors, setSelectedInstructors] = useState<number[]>(selectedInstructorIds);
  const [seats, setSeats] = useState<SeatMap>(() =>
    Object.fromEntries(initialSeats.map((slot) => [seatKey(slot.instructorId, slot.hour), slot.seats])),
  );
  const [error, setError] = useState<string | undefined>();

  function validate() {
    const open = Number(openHour);
    const close = Number(closeHour);

    // Komunikaty muszą brzmieć tak samo jak w `scheduleDaySchema`.
    if (openHour === "" || !Number.isInteger(open) || open < 0 || open > 23) {
      setError("Godzina otwarcia musi być z zakresu 0-23");
      return false;
    }

    if (closeHour === "" || !Number.isInteger(close) || close < 1 || close > 24) {
      setError("Godzina zamknięcia musi być z zakresu 1-24");
      return false;
    }

    if (close <= open) {
      setError("Godzina zamknięcia musi być późniejsza niż godzina otwarcia");
      return false;
    }

    setError(undefined);
    return true;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
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

  const open = Number(openHour);
  const close = Number(closeHour);
  // `Number("")` to 0, więc puste pole trzeba odsiać, zanim zakres trafi do `workingHours`.
  const hours = openHour === "" || closeHour === "" ? [] : workingHours(open, close);
  const workingInstructors = instructors.filter((instructor) => selectedInstructors.includes(instructor.id));
  const rows = sheetRows(
    hours,
    workingInstructors.map((instructor) => instructor.id),
    seats,
    selected.length,
  );

  const slotsHint =
    hours.length > 0
      ? `Jazdy od ${formatClockHour(open)} do ${formatClockHour(close - 1)} — każda godzina instruktora to osobny slot z własnym limitem.`
      : null;

  return (
    <form method="POST" action="/api/schedule/save" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="day" value={day} />

      <fieldset className="mb-6 min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Godziny pracy</legend>
        <div className="flex max-w-[340px] items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="openHour" className="text-foreground text-[13px] font-semibold">
              Od
            </label>
            <input
              id="openHour"
              name="openHour"
              type="number"
              min={0}
              max={23}
              value={openHour}
              onChange={(e) => {
                setOpenHour(e.target.value);
              }}
              className={controlClass}
            />
          </div>
          <span className="text-faint pb-3" aria-hidden="true">
            —
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="closeHour" className="text-foreground text-[13px] font-semibold">
              Do
            </label>
            <input
              id="closeHour"
              name="closeHour"
              type="number"
              min={1}
              max={24}
              value={closeHour}
              onChange={(e) => {
                setCloseHour(e.target.value);
              }}
              className={controlClass}
            />
          </div>
        </div>
        {slotsHint && <p className="text-muted-foreground mt-2.5 text-[13px]">{slotsHint}</p>}
        {error && (
          <p className="text-danger-ink mt-2.5 flex items-center gap-1.5 text-[12.5px] font-medium">
            <CircleAlert className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
      </fieldset>

      <fieldset className="mb-6 min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Konie pracujące tego dnia</legend>
        <ChoiceList
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
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Instruktorzy pracujący tego dnia</legend>
        {instructors.length === 0 ? (
          <p className="text-muted-foreground text-[13.5px]">
            Nie masz aktywnych instruktorów. <a href="/osrodek/instruktorzy">Dodaj instruktora</a>, żeby wystawić
            miejsca.
          </p>
        ) : (
          <ChoiceList
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

      {workingInstructors.length > 0 && hours.length > 0 && (
        <fieldset className="min-w-0">
          <legend className="text-foreground mb-1 text-[13px] font-semibold">Limity miejsc</legend>
          <p className="text-muted-foreground mb-3 text-[13px]">
            Limit miejsc to liczba jeźdźców, których instruktor przyjmie w danej godzinie; 0 — nie prowadzi jazdy.
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
                  const over = row.load === "over";
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
                        <HourLoadCell total={row.total} horseCount={selected.length} load={row.load} />
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
