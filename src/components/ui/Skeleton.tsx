import { cn } from "@/lib/utils";

/**
 * Loading placeholder — a warm-grey rounded block with a subtle pulse
 * (Tailwind's built-in `animate-pulse`). Matches the paper-deep token so it
 * reads as "content is coming" rather than a hard grey box.
 *
 * Note: TRE HQ renders from synchronous in-memory mock state (no fetch), so
 * most lists have no real loading phase. Use Skeleton only where a surface is
 * genuinely deferred to the client (e.g. a chart that mounts after hydration),
 * or as the ready-made primitive for when the real backend lands. Don't bolt
 * it onto instantly-rendered SSR content — that would replace real content
 * with a fake load and worsen perceived performance.
 */
export function Skeleton({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-lg bg-paper-deep/80",
        className
      )}
      {...rest}
    />
  );
}

/** A run of text-line skeletons; the last line is shortened like real copy. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
