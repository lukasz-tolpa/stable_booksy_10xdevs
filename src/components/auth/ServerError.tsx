import { CircleAlert } from "lucide-react";

/**
 * Odmowa z serwera nad przyciskiem wysyłki. Geometria jak w `Banner.astro`
 * wariant `error` (DESIGN.md §5): pasek 3 px z lewej, zaokrąglenie tylko po
 * prawej, miękkie tło `--danger-soft` i tekst `--danger-ink`.
 */

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="border-danger bg-danger-soft text-danger-ink flex items-start gap-2.5 rounded-e-md border-l-[3px] px-3.5 py-3 text-[14.5px]">
      <CircleAlert className="mt-0.5 size-[18px] shrink-0" />
      {message}
    </p>
  );
}
