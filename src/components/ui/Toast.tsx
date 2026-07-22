"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Check, Info, AlertTriangle, X } from "@/components/icons";
import { cn } from "@/lib/utils";

export type ToastTone = "info" | "ok" | "error";
type Toast = { id: number; message: string; tone: ToastTone };

type Ctx = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<Ctx | null>(null);

let nextId = 1;

const TONES: Record<
  ToastTone,
  { bg: string; fg: string; Icon: typeof Check; ms: number }
> = {
  ok: { bg: "bg-ok-pale", fg: "text-ok", Icon: Check, ms: 3200 },
  info: { bg: "bg-info-pale", fg: "text-info", Icon: Info, ms: 3200 },
  // An error is usually the database refusing something — the stage guard, an
  // overpayment, a total mismatch. Those messages are long and worth reading, so
  // they linger.
  error: { bg: "bg-alert-pale", fg: "text-alert", Icon: AlertTriangle, ms: 7000 },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      TONES[tone].ms,
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
        <div className="flex w-full max-w-sm flex-col gap-2">
          {toasts.map((t) => {
            const { bg, fg, Icon } = TONES[t.tone];
            return (
              <div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                className="animate-[fadeInUp_180ms_ease-out] pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-floating"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    bg,
                    fg,
                  )}
                >
                  <Icon size={14} strokeWidth={2.5} />
                </span>
                <p className="flex-1 text-[13px] font-medium text-ink-soft">
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  }
                  className="text-ink-faint transition-colors hover:text-ink-mid"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx.toast;
}
