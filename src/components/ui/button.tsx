import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// UWAGA przy `npx shadcn add`: warianty przychodzą z klasami `dark:`. W tym projekcie
// nie ma trybu ciemnego (DESIGN.md, AGENTS.md → Design), a `global.css` nie definiuje
// już `@custom-variant dark`, więc Tailwind kompiluje `dark:` do zapytania o systemowy
// tryb ciemny. Każdą taką klasę trzeba usunąć, inaczej motyw wraca bocznymi drzwiami.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Pigułka z DESIGN.md §5 - jedyny wariant, który aplikacja renderuje.
        // Pozostałe warianty zostają nietknięte, żeby `npx shadcn add` dalej działał.
        default:
          "min-h-11 rounded-full bg-primary font-display text-[15px] font-semibold text-primary-foreground shadow-sm hover:bg-primary-strong",
        // Kasztanowa pigułka - wezwanie do działania na ekranie, który już ma
        // zielony gdzie indziej (DESIGN.md §7: kasztan najwyżej dwa razy na ekran).
        // Biały tekst na `--accent` to 4,84:1, czyli powyżej progu AA.
        accent:
          "min-h-11 rounded-full bg-chestnut font-display text-[15px] font-semibold text-white shadow-sm hover:bg-chestnut-ink focus-visible:outline-chestnut-ink",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
