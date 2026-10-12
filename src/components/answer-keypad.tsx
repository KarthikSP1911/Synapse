"use client";

import { useSyncExternalStore } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerFormat } from "@/lib/skills/types";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia("(pointer: coarse)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** True on touch-first devices, where the OS keyboard would resize the page; false on the server and on desktop. */
export function useTouchKeypad() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false
  );
}

/** The keys beside 0 that a format needs; whole-number answers have none. */
function extraKeys(format: AnswerFormat): string[] {
  if (format.kind === "number") return [...(format.signed ? ["-"] : []), ".", ...(format.fractions ? ["/"] : [])];
  if (format.kind === "fraction") return ["/"];
  if (format.kind === "integer" && format.signed) return ["-"];
  return [];
}

interface AnswerKeypadProps {
  format: AnswerFormat;
  disabled?: boolean;
  onKey: (key: string) => void;
  onBackspace: () => void;
  /** Full-width row under the keys, used for Submit / Continue. */
  action?: React.ReactNode;
}

/**
 * Number pad docked under the answer. It replaces the OS keyboard on touch devices so the page keeps one
 * fixed height for the whole session instead of jumping every time a keyboard opens or closes.
 */
export function AnswerKeypad({ format, disabled, onKey, onBackspace, action }: AnswerKeypadProps) {
  const extras = extraKeys(format);
  // One extra key shares the bottom row with 0 and backspace; more get a row of their own so none is squeezed.
  const extra = extras.length === 1 ? extras[0] : null;
  const keyClass = cn(
    "grid h-11 [@media(max-height:700px)]:h-9 place-items-center rounded-lg border border-border bg-card font-mono text-2xl font-semibold shadow-card transition-[background-color,transform] duration-100",
    "select-none touch-manipulation active:scale-95 active:bg-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  );
  // Keeps focus on the answer field so a tap never blurs it.
  const keepFocus = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div
      role="group"
      aria-label="Number pad"
      className="grid grid-cols-3 gap-2 border-t border-border bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3"
    >
      {"123456789".split("").map((digit) => (
        <button key={digit} type="button" className={keyClass} disabled={disabled} onPointerDown={keepFocus} onClick={() => onKey(digit)}>
          {digit}
        </button>
      ))}
      {extras.length > 1 && (
        <div className="col-span-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${extras.length}, minmax(0, 1fr))` }}>
          {extras.map((key) => (
            <button
              key={key}
              type="button"
              className={keyClass}
              disabled={disabled}
              onPointerDown={keepFocus}
              onClick={() => onKey(key)}
              aria-label={key === "-" ? "Minus" : undefined}
            >
              {key === "-" ? "−" : key}
            </button>
          ))}
        </div>
      )}
      {extra ? (
        <button
          type="button"
          className={keyClass}
          disabled={disabled}
          onPointerDown={keepFocus}
          onClick={() => onKey(extra)}
          aria-label={extra === "-" ? "Minus" : undefined}
        >
          {extra === "-" ? "−" : extra}
        </button>
      ) : (
        <span aria-hidden />
      )}
      <button type="button" className={keyClass} disabled={disabled} onPointerDown={keepFocus} onClick={() => onKey("0")}>
        0
      </button>
      <button type="button" className={keyClass} disabled={disabled} onPointerDown={keepFocus} onClick={onBackspace} aria-label="Backspace">
        <Delete className="size-6" />
      </button>
      {action && <div className="col-span-3 pt-1">{action}</div>}
    </div>
  );
}
