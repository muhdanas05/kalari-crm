import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getMyCallList, getAllCallTasks } from "@/lib/db/calls";
import { requireProfile, isAdmin } from "@/lib/auth/session";
import { listAssignableUsers, listCustomers } from "@/lib/db/customers";
import { CallList } from "./CallList";
import { NewCallButton } from "./NewCallButton";
import { todayKolkata } from "@/lib/dates";

export const metadata: Metadata = { title: "My Call List · Kalari" };

/**
 * The employee's home screen (§5.7) — not a sub-page.
 *
 * This is the replacement for unified WhatsApp: the system decides who needs
 * calling and why; a human calls and logs it. Nothing here depends on a telecom
 * regulator, a carrier, or a platform's approval.
 */
export default async function CallsPage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile);

  const [tasks, people, customers] = await Promise.all([
    admin ? getAllCallTasks() : getMyCallList(),
    admin ? listAssignableUsers() : Promise.resolve([]),
    listCustomers({ limit: 300 }),
  ]);

  const today = todayKolkata();
  const due = tasks.filter((t) => (t.due_on ?? today) <= today);
  const later = tasks.filter((t) => (t.due_on ?? today) > today);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Follow-up"
        title={profile.role === "admin" ? "Call queue" : "My Call List"}
        subtitle={
          due.length === 0
            ? "Nobody needs chasing right now."
            : `${due.length} to call today — highest priority first.`
        }
        actions={
          <NewCallButton
            customers={customers.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
            }))}
            people={people.map((p) => ({ id: p.id, name: p.name }))}
            canAssign={admin}
          />
        }
      />

      <CallList
        due={due}
        later={later}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        canAssign={admin}
      />
    </div>
  );
}
