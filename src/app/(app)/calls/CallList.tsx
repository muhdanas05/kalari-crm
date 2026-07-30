"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { PhoneCall, ShieldOff, ChevronRight } from "@/components/icons";
import { REASON_LABEL, priorityTone, type CallTask } from "@/lib/calls/display";
import { LogCallSheet } from "./LogCallSheet";
import { cn } from "@/lib/utils";

export function CallList({
  due,
  later,
}: {
  due: CallTask[];
  later: CallTask[];
}) {
  const [active, setActive] = useState<CallTask | null>(null);

  return (
    <>
      <div className="flex flex-col gap-6">
        <Section
          title="Due now"
          tasks={due}
          onLog={setActive}
          empty="Nothing due. The queue is clear."
        />
        {later.length > 0 && (
          <Section title="Scheduled" tasks={later} onLog={setActive} muted />
        )}
      </div>

      <LogCallSheet task={active} onClose={() => setActive(null)} />
    </>
  );
}

function Section({
  title,
  tasks,
  onLog,
  empty,
  muted,
}: {
  title: string;
  tasks: CallTask[];
  onLog: (t: CallTask) => void;
  empty?: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-gold-deep">
        {title}
        <span className="ml-2 font-mono text-ink-faint">{tasks.length}</span>
      </h2>

      {tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-10 text-center text-[13px] font-medium text-ink-faint">
          {empty}
        </p>
      ) : (
        <ul className={cn("flex flex-col gap-2", muted && "opacity-70")}>
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/customers/${t.customer_id}`}
                      className="truncate text-[14px] font-bold text-ink hover:underline"
                    >
                      {t.customer_name}
                    </Link>
                    <Tag tone={priorityTone(t.priority)}>
                      {REASON_LABEL[t.reason!] ?? t.reason}
                    </Tag>
                    {(t.days_late ?? 0) > 0 && (
                      <Tag tone="alert">{t.days_late}d late</Tag>
                    )}
                    {t.phone_flagged && (
                      <Tag tone="alert" icon={ShieldOff}>
                        Number flagged
                      </Tag>
                    )}
                  </div>

                  {/*
                    The whole point of §5.7: the task already says WHY, with the
                    exact figure. Nobody should have to open three screens before
                    dialling.
                  */}
                  <p className="mt-1 text-[12.5px] font-medium text-ink-soft">
                    {t.context_line}
                  </p>

                  <p className="mt-1 font-mono text-[11px] text-ink-faint">
                    {t.customer_phone}
                    {(t.attempts ?? 0) > 0 &&
                      ` · attempt ${(t.attempts ?? 0) + 1} of 3`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {/* §5.7: "Tap to call — the number is a tel: link." */}
                  <a
                    href={`tel:${(t.customer_phone ?? "").replace(/\s/g, "")}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep"
                  >
                    <PhoneCall size={14} />
                    Call
                  </a>
                  <button
                    onClick={() => onLog(t)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[12px] font-semibold text-ink-mid transition-colors hover:border-line-strong hover:text-ink"
                  >
                    Log outcome
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
