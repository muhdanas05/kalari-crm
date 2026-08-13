"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "@/components/icons";

/**
 * Success criterion §8.1: any customer findable in under 5 seconds by name or
 * phone. Debounced URL state, so a search is shareable and survives a reload.
 */
export function CustomerSearch({
  initial,
  category,
}: {
  initial: string;
  category?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pending, startTransition] = useTransition();
  // The last value WE wrote to the URL. Comparing against this instead of
  // against `initial` is what breaks the loop below.
  const lastPushed = useRef(initial);

  /*
   * Adopt a URL change that came from outside — Back/Forward, or a link.
   *
   * The debounce effect used to depend on `initial`, so pressing Back was a
   * trap: the URL returned to /customers, `initial` became "" while `q` was
   * still "raj", the effect re-fired and replaced the URL straight back to
   * ?q=raj. You could not leave a search with the Back button.
   */
  useEffect(() => {
    if (initial !== lastPushed.current) {
      lastPushed.current = initial;
      setQ(initial);
    }
  }, [initial]);

  useEffect(() => {
    if (q === lastPushed.current) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (category) params.set("category", category);
      const s = params.toString();
      lastPushed.current = q;
      startTransition(() => {
        router.replace(s ? `/customers?${s}` : "/customers", { scroll: false });
      });
    }, 220);
    return () => clearTimeout(t);
  }, [q, category, router]);

  return (
    <div className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-accent">
      {pending ? (
        <Loader2 size={15} className="shrink-0 animate-spin text-ink-faint" />
      ) : (
        <Search size={15} className="shrink-0 text-ink-faint" />
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or phone — any format"
        aria-label="Search customers"
        className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-ghost"
      />
    </div>
  );
}
