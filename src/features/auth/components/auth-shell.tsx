/**
 * Layout for the log-in and sign-up screens: the heading and form are centred in the space between the
 * site header and footer, sized to fit one screen without scrolling.
 *
 * The root layout stacks header + main + footer in a column that is at least `100dvh` tall. The two
 * constants below are the heights of that chrome for a signed-out visitor (header: 56px bar + 1px border
 * + the notch inset; footer: 93px on phones where its two lines stack, 73px from `sm` up; measured in
 * the browser and rounded up). Subtracting them makes this block fill `main`, so the page height is
 * `100dvh` and nothing scrolls. Update them if the header or footer markup changes.
 *
 * It is a minimum, not a fixed height: if a screen is too short for the content (a tiny landscape
 * window, large text size), the page grows and scrolls instead of clipping a field or the button.
 *
 * Compaction tiers (`@media (max-height)`), because width alone does not say how much room there is:
 * - under 40rem tall: tighter spacing and padding, and no description line;
 * - under 32rem tall and at least 40rem wide (a phone held sideways): heading on the left, form on the right.
 */
export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="container flex min-h-[calc(100dvh-150px-env(safe-area-inset-top))] items-center justify-center py-3 [@media(max-height:40rem)]:py-1 sm:min-h-[calc(100dvh-130px-env(safe-area-inset-top))]">
      <div className="grid w-full max-w-md gap-6 [@media(max-height:40rem)]:gap-4 [@media(max-height:32rem)_and_(min-width:40rem)]:max-w-3xl [@media(max-height:32rem)_and_(min-width:40rem)]:grid-cols-2 [@media(max-height:32rem)_and_(min-width:40rem)]:items-center [@media(max-height:32rem)_and_(min-width:40rem)]:gap-8">
        <header className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-balance text-sm text-muted-foreground sm:text-base [@media(max-height:40rem)]:hidden">{description}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
