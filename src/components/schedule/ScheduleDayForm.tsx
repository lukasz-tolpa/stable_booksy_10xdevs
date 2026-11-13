import React, { useState } from "react";
import { CalendarCheck, CircleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatClockHour } from "@/lib/format";
import type { InstructorListItem } from "@/lib/instructors/queries";
import type { SlotSeats } from "@/lib/schedule/queries";
import { seatFieldName } from "@/lib/schedule/schema";
import { cn } from "@/lib/utils";
import type { HorseListItem } from "@/lib/stables/queries";

/**
 * Wygląd wg `osrodek-grafik.html`: dwie kontrolki godzin w mono obok siebie, konie
 * i instruktorzy jako karty-checkboxy, po dwie w rzędzie na szerokim ekranie, a pod nimi
 * siatka limitów miejsc instruktor × godzina.
 *
 * Konie i instruktorzy zostają osobnymi polami `checkbox` o wspólnej nazwie (`horseIds`,
 * `instructorIds`): serwer czyta powtórzone wpisy z `FormData`. Limit miejsc to jedno pole
 * na instruktora i godzinę (`seatFieldName`); siatka pokazuje wyłącznie godziny bieżącego
 * zakresu, więc godziny spoza niego nie są wysyłane.
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

const seatControlClass =
  "w-full min-h-[40px] rounded-md border border-border-2 bg-surface px-2 py-2 text-center font-mono text-[15px] tabular-nums text-foreground transition-colors hover:border-faint focus:border-primary focus:ring-[3px] focus:ring-primary-soft focus:outline-none";

const seatKey = (instructorId: number, hour: number) => `${String(instructorId)}.${String(hour)}`;

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
  const [seats, setSeats] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialSeats.map((slot) => [seatKey(slot.instructorId, slot.hour), String(slot.seats)])),
  );
  const [fillValues, setFillValues] = useState<Record<number, string>>({});
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

    // Nowo wskazany instruktor startuje od zera we wszystkich godzinach - także wtedy,
    // gdy wcześniej odznaczono go z wpisanymi limitami.
    const prefix = `${String(id)}.`;
    setSeats((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(prefix))));
    setSelectedInstructors((prev) => [...prev, id]);
  }

  const open = Number(openHour);
  const close = Number(closeHour);
  const hoursValid = openHour !== "" && closeHour !== "" && Number.isInteger(open) && Number.isInteger(close);
  const hours = hoursValid && close > open && open >= 0 && close <= 24 ? range(open, close) : [];

  function fillInstructor(instructorId: number) {
    const value = fillValues[instructorId] ?? "";
    setSeats((prev) => ({
      ...prev,
      ...Object.fromEntries(hours.map((hour) => [seatKey(instructorId, hour), value === "" ? "0" : value])),
    }));
  }

  const slotsHint =
    hours.length > 0
      ? `Jazdy od ${formatClockHour(open)} do ${formatClockHour(close - 1)} — każda godzina instruktora to osobny slot z własnym limitem.`
      : null;

  const workingInstructors = instructors.filter((instructor) => selectedInstructors.includes(instructor.id));

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
            Ilu jeźdźców instruktor przyjmie w danej godzinie; 0 — nie prowadzi jazdy. Suma limitów w jednej godzinie
            nie może przekroczyć liczby koni pracujących tego dnia ({selected.length}).
          </p>
          <div className="grid gap-4">
            {workingInstructors.map((instructor) => {
              const fillId = `fill-${String(instructor.id)}`;

              return (
                <section key={instructor.id} className="border-border-2 rounded-md border p-3.5">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <h3 className="m-0 min-w-0 text-[15px] font-semibold [overflow-wrap:anywhere]">
                      {instructor.name}
                    </h3>
                    <div className="flex items-end gap-2">
                      <div className="flex w-[72px] flex-col gap-1">
                        <label htmlFor={fillId} className="text-muted-foreground text-[12px] font-semibold">
                          Każda godzina
                        </label>
                        <input
                          id={fillId}
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={fillValues[instructor.id] ?? ""}
                          onChange={(e) => {
                            setFillValues((prev) => ({ ...prev, [instructor.id]: e.target.value }));
                          }}
                          className={seatControlClass}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          fillInstructor(instructor.id);
                        }}
                        aria-label={`Wypełnij wszystkie godziny: ${instructor.name}`}
                        className="border-border-2 bg-surface hover:bg-surface-2 focus-visible:outline-primary font-display min-h-[40px] rounded-full border px-3.5 text-[13.5px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        Wypełnij
                      </button>
                    </div>
                  </div>
                  <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 p-0">
                    {hours.map((hour) => {
                      const inputId = `seats-${String(instructor.id)}-${String(hour)}`;

                      return (
                        <li key={hour} className="flex flex-col gap-1">
                          <label htmlFor={inputId} className="text-muted-foreground font-mono text-[12px]">
                            <span className="sr-only">{instructor.name}, </span>
                            {formatClockHour(hour)}
                          </label>
                          <input
                            id={inputId}
                            name={seatFieldName(instructor.id, hour)}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={seats[seatKey(instructor.id, hour)] ?? "0"}
                            onChange={(e) => {
                              const value = e.target.value;
                              setSeats((prev) => ({ ...prev, [seatKey(instructor.id, hour)]: value }));
                            }}
                            className={seatControlClass}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
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

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, index) => from + index);
}
