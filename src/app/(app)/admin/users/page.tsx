import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Users } from "@/components/icons";

export const metadata: Metadata = { title: "Users · Kalari" };

export default async function UsersPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: cases }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("name"),
    supabase.from("cases_board_v").select("assigned_user_id, status"),
  ]);

  const load = new Map<string, number>();
  for (const c of cases ?? []) {
    if (c.status !== "open" || !c.assigned_user_id) continue;
    load.set(c.assigned_user_id, (load.get(c.assigned_user_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Admin"
        title="Users"
        subtitle="Who can sign in, and what they're carrying."
      />

      <ul className="overflow-hidden rounded-xl border border-line bg-surface">
        {(profiles ?? []).map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-mist text-[12px] font-bold text-accent">
              {p.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-bold text-ink">
                {p.name}
              </span>
              <span className="block truncate font-mono text-[11px] text-ink-mid">
                {p.email}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              <Tag tone={p.role === "admin" ? "accent" : "neutral"}>{p.role}</Tag>
              {!p.active && <Tag tone="alert">Deactivated</Tag>}
              {/*
                §3: in_assignment_pool is separate from active on purpose — you
                can take someone off rotation (holiday, training) without
                revoking their access.
              */}
              {p.active && !p.in_assignment_pool && (
                <Tag tone="warn">Off rotation</Tag>
              )}
              {p.role === "employee" && (
                <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-mid">
                  <Users size={12} />
                  {load.get(p.id) ?? 0}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-line bg-paper px-5 py-4">
        <p className="text-[12.5px] font-semibold text-ink">
          User management is not built yet
        </p>
        <p className="mt-1 text-[12px] font-medium text-ink-mid">
          Creating, deactivating and reassigning users runs through{" "}
          <code className="font-mono text-[11px] text-ink-soft">admin_set_user()</code>,
          which exists in the database but has no screen yet. There is deliberately
          no self-signup — accounts are created by you. Ask 7Gence to add or remove
          someone in the meantime.
        </p>
      </div>
    </div>
  );
}
