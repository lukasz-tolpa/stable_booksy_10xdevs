import React, { useState } from "react";
import { CalendarCheck, CircleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { cn } from "@/lib/utils";
import type { HorseListItem } from "@/lib/stables/queries";

/**
 * Wygląd wg `osrodek-grafik.html`: dwie kontrolki godzin w mono obok siebie i lista
 * koni jako karty-checkboxy, po dwie w rzędzie na szerokim ekranie.
 *
 * Konie zostają osobnymi polami `checkbox` o wspólnej nazwie `horseIds`, a nie listą
 * wielokrotnego wyboru: serwer czyta powtórzone wpisy z `FormData`, więc zamiana
 * kontrolki zmieniłaby kształt żądania.
 */

interface Props {
  day: string;
  openHour: number | "";
  closeHour: number | "";
  selectedHorseIds: number[];
  horses: HorseListItem[];
  serverError?: string | null;
}

const controlClass =
  "w-full min-h-[46px] rounded-md border border-border-2 bg-surface px-3.5 py-3 font-mono text-[15px] tabular-nums text-foreground transition-colors hover:border-faint focus:border-primary focus:ring-[3px] focus:ring-primary-soft focus:outline-none";

export default function ScheduleDayForm({
  day,
  openHour: initialOpen,
  closeHour: initialClose,
  selectedHorseIds,
  horses,
  serverError,
}: Props) {
  const [openHour, setOpenHour] = useState(String(initialOpen));
  const [closeHour, setCloseHour] = useState(String(initialClose));
  const [selected, setSelected] = useState<number[]>(selectedHorseIds);
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

  const slotsHint =
    openHour !== "" && closeHour !== "" && Number(closeHour) > Number(openHour)
      ? `Jazdy od ${openHour}:00 do ${String(Number(closeHour) - 1)}:00 — ${String(Number(closeHour) - Number(openHour))} slotów na konia.`
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

      <fieldset className="min-w-0">
        <legend className="text-foreground mb-2.5 text-[13px] font-semibold">Konie pracujące tego dnia</legend>
        <ul className="grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {horses.map((horse) => {
            const isOn = selected.includes(horse.id);

            return (
              <li key={horse.id}>
                <label
                  htmlFor={`horse-${String(horse.id)}`}
                  className={cn(
                    "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md border px-3.5 transition-colors",
                    "has-[input:focus-visible]:outline-primary has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2",
                    isOn ? "border-primary bg-primary-soft" : "border-border-2 bg-surface hover:bg-surface-2",
                  )}
                >
                  <input
                    id={`horse-${String(horse.id)}`}
                    type="checkbox"
                    name="horseIds"
                    value={horse.id}
                    checked={isOn}
                    onChange={() => {
                      toggleHorse(horse.id);
                    }}
                    className="accent-primary size-[17px] flex-none"
                  />
                  <span className="font-medium">
                    {horse.name}
                    {!horse.active && (
                      <span className="text-muted-foreground ml-2 text-[12.5px] font-normal">(wycofany ze służby)</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

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
