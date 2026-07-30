"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Pills over the free-text `customers.category`. Same shape as InvoiceFilter —
 * the options come from the data rather than a constant, because the column is
 * free text and anything Shafeek types is a real segment.
 */
export function CustomerCategoryFilter({
  categories,
  active,
  q,
}: {
  categories: string[];
  active: string;
  q?: string;
}) {
  const router = useRouter();
  if (categories.length === 0) return null;

  const href = (c: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (c !== "all") params.set("category", c);
    const s = params.toString();
    return s ? `/customers?${s}` : "/customers";
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {["all", ...categories].map((c) => (
        <button
          key={c}
          onClick={() => router.push(href(c), { scroll: false })}
          aria-pressed={active === c}
          className={cn(
            "h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
            active === c
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-mid hover:border-line-strong hover:text-ink",
          )}
        >
          {c === "all" ? "All" : c}
        </button>
      ))}
    </div>
  );
}
