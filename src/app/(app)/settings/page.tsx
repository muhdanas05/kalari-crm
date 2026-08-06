import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { EdList } from "@/components/ui/EdList";
import { Tag } from "@/components/ui/Tag";
import { requireProfile, isAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listUsers } from "@/lib/db/users";
import { UsersSection } from "./UsersSection";

export const metadata: Metadata = { title: "Settings · Kalari" };

export default async function SettingsPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile);
  const supabase = await createClient();

  const [{ data: settings }, users] = await Promise.all([
    supabase.from("automation_settings").select("*").order("key"),
    admin ? listUsers() : Promise.resolve([]),
  ]);

  const emailOn = settings?.find((s) => s.key === "email.enabled")?.enabled;

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="Settings" title="Settings" />

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
          You
        </h2>
        <EdList
          rows={[
            { label: "Name", value: profile.name },
            { label: "Email", value: profile.email ?? "—", mono: true },
          ]}
        />
      </section>

      {admin && (
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-1 text-base font-bold tracking-[-0.2px] text-ink">
            Automations
          </h2>
          <p className="mb-4 text-[12px] font-medium text-ink-faint">
            Every automation is individually switchable. These are read-only for
            now — the toggles need a screen, the settings already exist.
          </p>

          {/*
            §4's design test made visible: with email off, everything still works
            because it degrades to the call queue. That's not a broken state, and
            the UI should not imply it is.
          */}
          {!emailOn && (
            <div className="mb-4 rounded-lg border border-accent/25 bg-accent-mist px-4 py-3">
              <p className="text-[12.5px] font-semibold text-ink">
                Email is off — and the system works anyway.
              </p>
              <p className="mt-1 text-[12px] font-medium text-ink-soft">
                Everything that would have been emailed becomes a call task
                instead. Email switches on once your domain's SPF, DKIM and DMARC
                records are verified, so invoices reach the inbox rather than
                spam.
              </p>
            </div>
          )}

          <ul className="flex flex-col">
            {(settings ?? []).map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
              >
                <span className="font-mono text-[12px] text-ink-soft">{s.key}</span>
                <Tag tone={s.enabled ? "ok" : "neutral"}>
                  {s.enabled ? "On" : "Off"}
                </Tag>
              </li>
            ))}
          </ul>
        </section>
      )}

      {admin && <UsersSection users={users} meId={profile.id} />}
    </div>
  );
}
