export default function Loading() {
  return (
    <div className="container py-10 sm:py-14" role="status" aria-label="Loading">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-secondary" />
          <div className="h-9 w-64 rounded bg-secondary" />
          <div className="h-4 w-96 max-w-full rounded bg-secondary" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-border bg-card" />
      </div>
    </div>
  );
}
