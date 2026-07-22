import type { ReactNode } from "react";

type Row = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

export function EdList({ rows }: { rows: Row[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-4 py-2.5 border-b border-line last:border-b-0"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[1px] text-ink-faint shrink-0">
            {row.label}
          </dt>
          <dd
            className={
              row.mono
                ? "font-mono text-[12px] font-medium text-ink text-right"
                : "text-[13px] font-medium text-ink text-right"
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
