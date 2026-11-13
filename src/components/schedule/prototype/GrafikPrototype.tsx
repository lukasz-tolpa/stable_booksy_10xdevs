// PROTOTYP — do wyrzucenia. Trzy warianty formularza grafiku dnia na istniejącej trasze
// /osrodek/grafik, przełączane `?variant=` (0 = obecny formularz, A/B/C = propozycje).
// Warianty nie zapisują do bazy: „Zapisz grafik” pokazuje, co poszłoby do `save_schedule_day`.
import { useState } from "react";
import ScheduleDayForm from "@/components/schedule/ScheduleDayForm";
import PrototypeSwitcher from "@/components/ui/PrototypeSwitcher";
import { cn } from "@/lib/utils";
import { hourLabel, hourTotal, hoursOf, seatAt, useDraft, type DraftInit, type VariantProps } from "./draft";
import VariantA, { name as nameA } from "./VariantA";
import VariantB, { name as nameB } from "./VariantB";
import VariantC, { name as nameC } from "./VariantC";

const VARIANTS: { key: string; name: string; Component?: (p: VariantProps) => React.ReactNode }[] = [
  { key: "0", name: "obecny formularz" },
  { key: "A", name: nameA, Component: VariantA },
  { key: "B", name: nameB, Component: VariantB },
  { key: "C", name: nameC, Component: VariantC },
];

function Stage({ init, Component }: { init: DraftInit; Component: (p: VariantProps) => React.ReactNode }) {
  const { draft, actions } = useDraft(init);
  const [saved, setSaved] = useState<string | null>(null);
  const hours = hoursOf(draft);
  const capacity = draft.horseIds.length;
  const overHours = hours.filter((h) => hourTotal(draft, h) > capacity);

  function onSave() {
    const payload = {
      p_day: init.day,
      p_open_hour: draft.open,
      p_close_hour: draft.close,
      p_horse_ids: draft.horseIds,
      p_instructor_ids: draft.instructorIds,
      p_seats: draft.instructorIds.flatMap((id) =>
        hours.map((hour) => ({ instructor_id: id, hour, seats: seatAt(draft, id, hour) })),
      ),
    };
    setSaved(
      overHours.length > 0
        ? `Baza odmówiłaby (SB007): za mało koni o ${overHours.map(hourLabel).join(", ")}.\n\n${JSON.stringify(payload, null, 2)}`
        : JSON.stringify(payload, null, 2),
    );
  }

  return (
    <>
      <Component init={init} draft={draft} actions={actions} onSave={onSave} />
      <details className="border-warn bg-warn-soft mt-6 rounded-md border border-dashed p-3 text-[12.5px]" open>
        <summary className="cursor-pointer font-mono font-semibold">
          PROTOTYP · stan szkicu (nic nie zapisujemy)
        </summary>
        <p className={cn("my-2 font-mono", overHours.length > 0 && "text-danger-ink font-bold")}>
          {hours.length} godz. · {capacity} koni · {draft.instructorIds.length} instr. · miejsc łącznie{" "}
          {hours.reduce((s, h) => s + hourTotal(draft, h), 0)}
          {overHours.length > 0 && ` · PRZEKROCZENIE: ${overHours.map(hourLabel).join(", ")}`}
        </p>
        {saved && <pre className="bg-surface m-0 max-h-72 overflow-auto rounded p-2 text-[11.5px]">{saved}</pre>}
      </details>
    </>
  );
}

export default function GrafikPrototype({
  init,
  initialVariant,
  serverError,
}: {
  init: DraftInit;
  initialVariant: string | null;
  serverError?: string | null;
}) {
  const [variant, setVariant] = useState(VARIANTS.find((v) => v.key === initialVariant)?.key ?? "A");
  const current = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[1];

  return (
    <>
      {current.Component ? (
        <Stage key={current.key} init={init} Component={current.Component} />
      ) : (
        <ScheduleDayForm
          day={init.day}
          openHour={init.openHour}
          closeHour={init.closeHour}
          selectedHorseIds={init.horseIds}
          horses={init.horses}
          selectedInstructorIds={init.instructorIds}
          instructors={init.instructors}
          seats={init.seats}
          serverError={serverError}
        />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </>
  );
}
