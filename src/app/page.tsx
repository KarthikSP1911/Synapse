import PracticeSetup from "@/components/practice-setup";

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
        <div className="container py-14 text-center sm:py-20">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-success" />
            Adaptive practice · spaced repetition
          </p>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Multiply faster. <span className="text-muted-foreground">Remember longer.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Pick the tables you want to master. The trainer tracks every answer and keeps bringing back the pairs you
            find hardest.
          </p>
        </div>
      </section>

      <div className="container py-10 sm:py-12">
        <PracticeSetup />
      </div>
    </>
  );
}
