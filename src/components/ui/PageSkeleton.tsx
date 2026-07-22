import { Skeleton } from "./Skeleton";

/**
 * Route-level loading skeletons.
 *
 * The database is ~600ms away, so a page's data will never be instant. Without a
 * loading.tsx, Next holds the OLD page on screen for the whole wait and the app
 * feels frozen — you click, nothing happens, then everything changes at once.
 * With one, the shell and the page frame paint immediately and only the data
 * streams in. The wait is the same; the app stops feeling broken.
 *
 * These mirror the real layouts closely enough that nothing jumps when the data
 * lands.
 */

export function PageHeadSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-32" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0"
        >
          <div className="flex-1">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-6 ${className ?? ""}`}>
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex w-[264px] shrink-0 flex-col rounded-xl border border-line bg-paper-deep/40"
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-5 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 px-2 pb-2">
            {Array.from({ length: 2 - (i % 2) }).map((_, j) => (
              <div key={j} className="rounded-lg border border-line bg-surface p-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
                <Skeleton className="mt-3 h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
