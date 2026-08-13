import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getAllCallTasks } from "@/lib/db/calls";
import { requirePermission } from "@/lib/auth/session";
import { listCustomers } from "@/lib/db/customers";
import { CallList } from "./CallList";
import { NewCallButton } from "./NewCallButton";
import { todayKolkata } from "@/lib/dates";

export const metadata: Metadata = { title: "Call queue · Kalari" };

/**
 * The call queue.
 *
 * This is the replacement for unified WhatsApp: the system decides who needs
 * calling and why; a human calls and logs it. Nothing here depends on a
 * telecom regulator, a carrier, or a platform's approval.
 */
export default async function CallsPage() {
  await requirePermission("calls");

  const [tasks, customers] = await Promise.all([
    getAllCallTasks(),
    listCustomers({ limit: 300 }),
  ]);

  const today = todayKolkata();
  const due = tasks.filter((t) => (t.due_on ?? today) <= today);
  const later = tasks.filter((t) => (t.due_on ?? today) > today);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Follow-up"
        title="Call queue"
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
          />
        }
      />

      <CallList due={due} later={later} />
    </div>
  );
}
