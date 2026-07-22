"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, UserSquare2, FileText } from "@/components/icons";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

type CustomerHit = { id: string; name: string; phone: string; email: string | null };
type InvoiceHit = {
  id: string;
  number: string;
  total_paise: number;
  display_status: string | null;
};

type Hit =
  | { kind: "customer"; data: CustomerHit }
  | { kind: "invoice"; data: InvoiceHit };

/**
 * ⌘K search over customers and invoices. Results come from /api/search, which
 * runs as the signed-in user — so an employee never sees another's customer,
 * whatever they type.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // Debounced. AbortController so a slow early keystroke can't overwrite the
  // results of a later one.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        const next: Hit[] = [
          ...(json.customers ?? []).map((c: CustomerHit) => ({
            kind: "customer" as const,
            data: c,
          })),
          ...(json.invoices ?? []).map((i: InvoiceHit) => ({
            kind: "invoice" as const,
            data: i,
          })),
        ];
        setHits(next);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQ("");
    router.push(
      hit.kind === "customer"
        ? `/customers/${hit.data.id}`
        : `/invoices/${hit.data.id}`,
    );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active]);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex h-9 w-full items-center gap-2 rounded-full border border-line bg-paper px-3.5 transition-colors focus-within:border-accent focus-within:bg-surface">
        {loading ? (
          <Loader2 size={15} className="shrink-0 animate-spin text-ink-faint" />
        ) : (
          <Search size={15} className="shrink-0 text-ink-faint" />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search name, phone or invoice…"
          aria-label="Search customers and invoices"
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-ink-faint"
        />
        <kbd className="hidden shrink-0 font-mono text-[10px] text-ink-ghost lg:block">
          ⌘K
        </kbd>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="animate-modal-in absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-floating">
          {hits.length === 0 && !loading ? (
            <p className="px-4 py-5 text-center text-[12.5px] text-ink-faint">
              Nothing matches “{q}”.
            </p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto py-1.5">
              {hits.map((hit, i) => (
                <li key={`${hit.kind}-${hit.data.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(hit)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                      i === active ? "bg-accent-mist" : "hover:bg-paper",
                    )}
                  >
                    {hit.kind === "customer" ? (
                      <>
                        <UserSquare2 size={15} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                          {hit.data.name}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-mid">
                          {hit.data.phone}
                        </span>
                      </>
                    ) : (
                      <>
                        <FileText size={15} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-ink">
                          {hit.data.number}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-ink-mid">
                          {formatPaise(hit.data.total_paise)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
