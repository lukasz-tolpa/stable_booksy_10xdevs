// PROTOTYP — do wyrzucenia. Pływający przełącznik wariantów UI (`?variant=`), tylko w trybie dev.
import { useEffect } from "react";

interface Props {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function PrototypeSwitcher({ variants, current, onChange }: Props) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length];
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next.key);
    window.history.replaceState(null, "", url);
    onChange(next.key);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  if (!import.meta.env.DEV) return null;

  const btn = "grid size-8 place-items-center rounded-full hover:bg-white/15 cursor-pointer text-lg leading-none";

  return (
    <div
      style={{ background: "#16161a", color: "#fff", zIndex: 1000 }}
      className="fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-2 py-1.5 font-mono text-[13px] shadow-2xl ring-1 ring-white/20"
    >
      <button
        type="button"
        className={btn}
        onClick={() => {
          go(-1);
        }}
        aria-label="Poprzedni wariant"
      >
        ‹
      </button>
      <span className="px-2 whitespace-nowrap">
        {variants[index].key} ({variants[index].name}) · {index + 1}/{variants.length}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => {
          go(1);
        }}
        aria-label="Następny wariant"
      >
        ›
      </button>
    </div>
  );
}
