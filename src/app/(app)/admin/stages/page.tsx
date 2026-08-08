import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { requirePermission } from "@/lib/auth/session";
import { listPipelineServices, getServiceStagePath, listAvailableStages } from "@/lib/db/stages";
import { ServicePicker } from "./ServicePicker";
import { StagePathEditor } from "./StagePathEditor";

export const metadata: Metadata = { title: "Pipeline stages · Kalari" };

/**
 * The stage editor. Fully custom stages, per service: add one, name it
 * anything, put it wherever it belongs in the path, and — for the ones that
 * are checkpoints — write the exact email that goes out and let entering the
 * stage raise a call task alongside it.
 *
 * Reuses the existing pipeline/stage/stage_applicability model rather than
 * inventing a parallel one: tg_case_stage_guard already enforces "only stages
 * in this service's declared path", which is precisely what makes ad-hoc
 * stage editing safe. Only pipeline-tracked services have a path worth
 * editing — a ticket sale has none.
 */
export default async function StagesPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  await requirePermission("admin_stages");
  const { service: serviceId } = await searchParams;

  const services = await listPipelineServices();
  const selected = serviceId && services.some((s) => s.id === serviceId)
    ? serviceId
    : services[0]?.id;

  const [path, available] = selected
    ? await Promise.all([getServiceStagePath(selected), listAvailableStages(selected)])
    : [[], []];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Admin"
        title="Pipeline stages"
        subtitle="Each service's own path — add a stage, reorder it, and mark any stage as a checkpoint that needs something from the customer."
      />

      <ServicePicker services={services} selected={selected} />

      {!selected ? (
        <p className="rounded-xl border border-dashed border-line py-10 text-center text-[13px] font-medium text-ink-faint">
          No service tracks a pipeline yet — mark one in the service
          catalogue first.
        </p>
      ) : (
        <StagePathEditor
          serviceId={selected}
          path={path}
          available={available}
        />
      )}
    </div>
  );
}
