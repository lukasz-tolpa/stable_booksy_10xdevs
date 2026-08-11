import React, { useState } from "react";
import { CalendarCheck, CircleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { HorseListItem } from "@/lib/stables/queries";

interface Props {
  day: string;
  openHour: number | "";
  closeHour: number | "";
  selectedHorseIds: number[];
  horses: HorseListItem[];
  serverError?: string | null;
}

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
    <form method="POST" action="/api/schedule/save" className="space-y-6" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="day" value={day} />

      <fieldset>
        <legend className="mb-2 block text-sm text-blue-100/80">Godziny pracy</legend>
        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-blue-100/60">Od</span>
            <input
              name="openHour"
              type="number"
              min={0}
              max={23}
              value={openHour}
              onChange={(e) => {
                setOpenHour(e.target.value);
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
            />
          </label>
          <span className="pb-2 text-blue-100/40">—</span>
          <label className="flex-1">
            <span className="mb-1 block text-xs text-blue-100/60">Do</span>
            <input
              name="closeHour"
              type="number"
              min={1}
              max={24}
              value={closeHour}
              onChange={(e) => {
                setCloseHour(e.target.value);
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
            />
          </label>
        </div>
        {slotsHint && <p className="mt-2 text-xs text-blue-100/50">{slotsHint}</p>}
        {error && (
          <p className="mt-2 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {error}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 block text-sm text-blue-100/80">Konie pracujące tego dnia</legend>
        <div className="space-y-2">
          {horses.map((horse) => (
            <label
              key={horse.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
            >
              <input
                type="checkbox"
                name="horseIds"
                value={horse.id}
                checked={selected.includes(horse.id)}
                onChange={() => {
                  toggleHorse(horse.id);
                }}
                className="accent-purple-400"
              />
              <span className="text-sm text-white">
                {horse.name}
                {!horse.active && <span className="ml-2 text-xs text-blue-100/40">(wycofany ze służby)</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie..." icon={<CalendarCheck className="size-4" />}>
        Zapisz grafik
      </SubmitButton>
    </form>
  );
}
