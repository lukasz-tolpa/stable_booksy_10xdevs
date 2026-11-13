// PROTOTYP — do wyrzucenia. Wspólny stan szkicu grafiku dnia dla wariantów UI (bez zapisu do bazy).
import { useState } from "react";
import type { InstructorListItem } from "@/lib/instructors/queries";
import type { SlotSeats } from "@/lib/schedule/queries";
import type { HorseListItem } from "@/lib/stables/queries";

export interface DraftInit {
  day: string;
  openHour: number | "";
  closeHour: number | "";
  horseIds: number[];
  instructorIds: number[];
  seats: SlotSeats[];
  horses: HorseListItem[];
  instructors: InstructorListItem[];
  prefillFrom: string | null;
}

export interface Draft {
  open: number;
  close: number;
  horseIds: number[];
  instructorIds: number[];
  /** klucz `instructorId.hour` → limit miejsc */
  seats: Record<string, number>;
}

export const seatKey = (instructorId: number, hour: number) => `${String(instructorId)}.${String(hour)}`;

export function hoursOf(draft: Draft): number[] {
  return draft.close > draft.open ? Array.from({ length: draft.close - draft.open }, (_, i) => draft.open + i) : [];
}

export function seatAt(draft: Draft, instructorId: number, hour: number): number {
  return draft.seats[seatKey(instructorId, hour)] ?? 0;
}

export function hourTotal(draft: Draft, hour: number): number {
  return draft.instructorIds.reduce((sum, id) => sum + seatAt(draft, id, hour), 0);
}

export function hourLabel(hour: number) {
  return `${String(hour)}:00`;
}

export function useDraft(init: DraftInit) {
  const [draft, setDraft] = useState<Draft>(() => ({
    open: init.openHour === "" ? 10 : init.openHour,
    close: init.closeHour === "" ? 16 : init.closeHour,
    horseIds: init.horseIds,
    instructorIds: init.instructorIds,
    seats: Object.fromEntries(init.seats.map((s) => [seatKey(s.instructorId, s.hour), s.seats])),
  }));

  const actions = {
    setHours(open: number, close: number) {
      setDraft((d) => ({ ...d, open, close }));
    },
    toggleHorse(id: number) {
      setDraft((d) => ({
        ...d,
        horseIds: d.horseIds.includes(id) ? d.horseIds.filter((x) => x !== id) : [...d.horseIds, id],
      }));
    },
    toggleInstructor(id: number) {
      setDraft((d) => {
        if (d.instructorIds.includes(id)) return { ...d, instructorIds: d.instructorIds.filter((x) => x !== id) };
        const prefix = `${String(id)}.`;
        const seats = Object.fromEntries(Object.entries(d.seats).filter(([k]) => !k.startsWith(prefix)));
        return { ...d, instructorIds: [...d.instructorIds, id], seats };
      });
    },
    setSeat(instructorId: number, hour: number, value: number) {
      setDraft((d) => ({ ...d, seats: { ...d.seats, [seatKey(instructorId, hour)]: Math.max(0, value) } }));
    },
    setSeatsFor(instructorId: number, hours: number[], value: number) {
      setDraft((d) => ({
        ...d,
        seats: { ...d.seats, ...Object.fromEntries(hours.map((h) => [seatKey(instructorId, h), Math.max(0, value)])) },
      }));
    },
  };

  return { draft, actions };
}

export type DraftActions = ReturnType<typeof useDraft>["actions"];

export interface VariantProps {
  init: DraftInit;
  draft: Draft;
  actions: DraftActions;
  onSave: () => void;
}
