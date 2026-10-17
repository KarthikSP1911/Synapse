"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/form/help-tip";
import { Chip } from "@/components/form/choice-controls";
import { BareSections } from "@/components/layout/section";

/**
 * The shared shape of every setup screen: a quiet "Quick start" card (a preset row and a big Start button, nothing else) and a
 * "Customize" disclosure that holds the detailed controls, closed unless the settings are already customised.
 *
 *   <SetupLayout quick={<PresetRow … />} customize={…controls…} customized={isCustom} summary="2-back, Position, 3×3 …" action={<StartButton … />} />
 */

interface CustomizeState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CustomizeContext = createContext<CustomizeState | null>(null);

/** Lets a preset row open the Customize section when "Custom" is picked. Does nothing outside a `SetupLayout`. */
export function useCustomize(): CustomizeState {
  return useContext(CustomizeContext) ?? { open: false, setOpen: () => {} };
}

export function SetupLayout({
  quick,
  customize,
  customized = false,
  summary,
  status,
  problems,
  action,
  mobileAction,
  asideTop,
  help,
  helpLabel = "this game",
  note,
  footer,
}: {
  /** The preset row (and nothing else that is needed to start). */
  quick: ReactNode;
  /** The detailed controls. Left out when a screen has nothing more to set. */
  customize?: ReactNode;
  /** The settings are already custom, so Customize opens by itself (until the player closes it). */
  customized?: boolean;
  /** The settings in one plain sentence, such as "2-back, Position + Color, 5×5, about 2 min, 15 coins". */
  summary: ReactNode;
  /** The "Using your last settings · Reset" line. */
  status?: ReactNode;
  /** Errors and warnings about the current settings. */
  problems?: ReactNode;
  /** The Start button (and anything that goes with it). */
  action: ReactNode;
  /** What the phone's sticky bar shows instead of `action`, when that has to differ. */
  mobileAction?: ReactNode;
  /** Cards above the summary on wide screens, such as an unfinished game to resume. */
  asideTop?: ReactNode;
  /** Longer explanation (the rules of a game), behind a "?" beside the session heading. */
  help?: ReactNode;
  /** What the help is about, for the button's name. */
  helpLabel?: string;
  /** One line about anything that changes the rules, such as "Game Over doesn't save". Always visible, so keep it to one. */
  note?: ReactNode;
  footer?: ReactNode;
}) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? customized;
  const regionId = useId();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {status}
        <CustomizeContext.Provider value={{ open, setOpen: setChosen }}>
          <section aria-label="Quick start" className="rounded-xl border border-border bg-card p-5 shadow-card">
            {quick}
          </section>

          {customize && (
            <section className="rounded-xl border border-border bg-card shadow-card">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() => setChosen(!open)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-5 py-3 text-left text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Customize
                <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
              </button>
              {open && (
                <div id={regionId} className="space-y-6 border-t border-border px-5 pb-5 pt-5">
                  <BareSections.Provider value>{customize}</BareSections.Provider>
                </div>
              )}
            </section>
          )}
        </CustomizeContext.Provider>
        {problems}
        {footer}
        {/* On phones the Start button stays on screen above the tab bar. */}
        <div className="sdk-start-bar -mx-5 border-t border-border bg-background/90 px-5 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">{mobileAction ?? action}</div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Session">
        {asideTop}
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-0.5">
            <h2 className="text-[15px] font-semibold tracking-tight">Your session</h2>
            {help && (
              <HelpTip label={helpLabel}>
                <div className="space-y-2">{help}</div>
              </HelpTip>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{summary}</p>
          <div className="mt-5 hidden lg:block">{action}</div>
          {note && <p className="mt-3 text-center text-xs text-muted-foreground">{note}</p>}
        </div>
      </aside>
    </div>
  );
}

export interface PresetOption<T extends string> {
  id: T;
  label: string;
  /** A short second line on the chip, such as a board size. */
  detail?: string;
  /** What it means; listed in the "?" next to the row's label. */
  description?: string;
}

const COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-3 sm:grid-cols-5",
  6: "grid-cols-3 sm:grid-cols-6",
};

/** The preset row of Quick start. Picking "custom" opens Customize; the other presets change the settings and leave it as it is. */
export function PresetRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly PresetOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const { setOpen } = useCustomize();
  const id = useId();
  const described = options.filter((o) => o.description);
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        {described.length > 0 && (
          <HelpTip label={label}>
            <dl className="space-y-1.5">
              {described.map((o) => (
                <div key={o.id}>
                  <dt className="font-medium">{o.label}</dt>
                  <dd className="text-muted-foreground">{o.description}</dd>
                </div>
              ))}
            </dl>
          </HelpTip>
        )}
      </div>
      <div role="group" aria-labelledby={id} className={cn("mt-2 grid gap-2", COLUMNS[options.length] ?? "grid-cols-2 sm:grid-cols-4")}>
        {options.map((o) => (
          <Chip
            key={o.id}
            active={value === o.id}
            onClick={() => {
              onChange(o.id);
              if (o.id === "custom") setOpen(true);
            }}
            className={cn("px-1 text-[13px]", o.detail && "h-auto min-h-11 flex-col gap-0 py-1.5 pointer-coarse:h-auto")}
          >
            {o.label}
            {o.detail && <span className="font-mono text-[11px] font-normal tabular-nums opacity-70">{o.detail}</span>}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * "Using your last settings · Reset to defaults", shown only while the settings differ from the defaults, so a page that
 * looks different from last time says why, and the way back is always one tap away.
 */
export function SettingsStatus({ changed, onReset }: { changed: boolean; onReset: () => void }) {
  if (!changed) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-muted-foreground" role="status">
      <span>Using your last settings</span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <RotateCcw aria-hidden className="size-3" />
        Reset to defaults
      </button>
    </p>
  );
}

/** The big Start button of a setup screen, with the busy state the screens share. */
export function StartButton({ label, busy = false, busyLabel = "Preparing…", disabled = false, onClick }: { label: string; busy?: boolean; busyLabel?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Button size="xl" className="w-full" disabled={disabled || busy} onClick={onClick}>
      {busy ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          {busyLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight />
        </>
      )}
    </Button>
  );
}
