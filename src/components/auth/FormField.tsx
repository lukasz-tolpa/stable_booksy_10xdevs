import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pole formularza wg DESIGN.md §5: etykieta 13 px nad kontrolką, ikona po lewej
 * w środku pola, pierścień ostrości `--primary` z poświatą `--primary-soft`.
 *
 * `id` jest tu nazwą pola POST (patrz `name={name ?? id}`), więc jego zmiana
 * przemianowałaby pole formularza po stronie serwera. Redesign go nie dotyka.
 */

const controlBase =
  "w-full min-h-[46px] rounded-md border bg-surface py-3 pr-3.5 pl-[42px] text-[15px] text-foreground transition-colors placeholder:text-faint focus:outline-none focus:ring-[3px]";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-foreground text-[13px] font-semibold">
        {label}
      </label>
      <div className="relative flex items-center">
        <span className="text-muted-foreground pointer-events-none absolute left-[13px] size-[18px]">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          className={cn(
            controlBase,
            error
              ? "border-danger focus:border-danger focus:ring-danger/15"
              : "border-border-2 hover:border-faint focus:border-primary focus:ring-primary-soft",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-danger-ink flex items-center gap-1.5 text-[12.5px] font-medium">
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
