import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  link: string;
}

type CopyState = "idle" | "copied" | "manual";

/**
 * Link zaproszenia do skopiowania jednym kliknięciem (#74, US 6). Bez schowka (stara
 * przeglądarka, brak zgody) zaznacza link w polu, żeby skopiować go skrótem.
 */
export default function CopyLink({ link }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      input.current?.select();
      setState("manual");
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor="invitation-link" className="text-foreground text-[13px] font-semibold">
        Link zaproszenia
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={input}
          id="invitation-link"
          readOnly
          value={link}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          className="border-border-2 bg-surface-2 text-foreground min-h-[46px] w-full min-w-0 rounded-md border px-3.5 font-mono text-[13px]"
        />
        <Button type="button" onClick={() => void copy()} className="sm:w-auto">
          {state === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
          {state === "copied" ? "Skopiowano" : "Kopiuj link"}
        </Button>
      </div>
      {state === "manual" && (
        <p className="text-muted-foreground text-[12.5px]" role="status">
          Link jest zaznaczony — skopiuj go skrótem Ctrl+C.
        </p>
      )}
    </div>
  );
}
