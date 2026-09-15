/** Global route-transition skeleton. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 rounded bg-slate-200" />
      <div className="mt-4 h-8 w-64 max-w-full rounded bg-slate-200" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-100" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="mt-6 h-72 rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
