import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { IntegrationCard } from "./IntegrationCard";

export const metadata: Metadata = { title: "Integrations · Kalari" };

/**
 * SOW §02.K — "the tabs are in scope, the integrations are not."
 *
 * Every card says so on the card. §5.11: "say it in the product, not just the
 * contract" — a Coming Soon chip that doesn't explain itself becomes an
 * expectation, and the expectation becomes an argument at handover.
 */
const INTEGRATIONS = [
  {
    key: "google_ads" as const,
    name: "Google Ads",
    what: "Match closed cases back to the ad click that produced them, so you can see which campaigns pay for themselves.",
    needs: "Offline conversion import needs the gclid captured on the original click — which this system already records.",
  },
  {
    key: "meta_ads" as const,
    name: "Meta Ads",
    what: "Push lead and conversion events back to Meta, and see cost per real customer rather than cost per form fill.",
    needs: "Uses the fbclid captured at intake.",
  },
  {
    key: "instagram" as const,
    name: "Instagram",
    what: "Pull enquiries from Instagram DMs and lead forms into the same pipeline as your website enquiries.",
    needs: "Requires a connected Instagram Business account.",
  },
];

export default async function IntegrationsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("integration_requests")
    .select("integration, status, requested_at");

  const requestedFor = new Set((requests ?? []).map((r) => r.integration));

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Admin"
        title="Integrations"
        subtitle="Available as separate modules — not included in the current build."
      />

      {/*
        SOW §02.K's real point, and the one thing here that is genuinely urgent:
        attribution is captured from day one whether or not ads ever run,
        because a click ID cannot be recovered retrospectively (§3.28).
      */}
      <div className="rounded-xl border border-accent/25 bg-accent-mist px-5 py-4">
        <p className="text-[13px] font-semibold text-ink">
          Your lead attribution is already being recorded.
        </p>
        <p className="mt-1 text-[12.5px] font-medium text-ink-soft">
          Every enquiry stores which campaign, channel and page it came from —
          including the Google and Meta click IDs. That costs nothing now, but it
          can't be recovered later. If you switch any of these on in a year, the
          history will already be there.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {INTEGRATIONS.map((i) => (
          <IntegrationCard
            key={i.key}
            integration={i.key}
            name={i.name}
            what={i.what}
            needs={i.needs}
            alreadyRequested={requestedFor.has(i.key)}
          />
        ))}
      </div>
    </div>
  );
}
