import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import {
  getPipelineByKey,
  getBoardCases,
  getBoardCasesForService,
} from "@/lib/db/pipelines";
import { listPipelineServices, getServiceStagePath } from "@/lib/db/stages";
import { Board } from "@/components/board/Board";
import { CaseList } from "@/components/board/CaseList";
import { PipelineSelector, LEADS_VALUE } from "./PipelineSelector";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Pipeline · Kalari" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; view?: string }>;
}) {
  await requirePermission("pipeline");
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : sp.view === "list" ? "list" : null;

  const services = await listPipelineServices();
  const selected =
    sp.service && (sp.service === LEADS_VALUE || services.some((s) => s.id === sp.service))
      ? sp.service
      : (services[0]?.id ?? LEADS_VALUE);

  const [stages, cases] =
    selected === LEADS_VALUE
      ? await (async () => {
          const pipeline = await getPipelineByKey("sales");
          return [pipeline?.stages ?? [], await getBoardCases("sales")] as const;
        })()
      : await Promise.all([
          getServiceStagePath(selected).then((path) =>
            path.map((r) => ({ id: r.stage_id, name: r.name, is_terminal: r.is_terminal })),
          ),
          getBoardCasesForService(selected),
        ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Operations"
        title="Pipeline"
        subtitle="Every customer, at every stage."
      />

      <PipelineSelector services={services} selected={selected} view={view} />

      {/*
        §5.3: "The board is unusable on a phone at 200 cases, and employees live
        on phones — the list is not a fallback, it's the primary view for most of
        the team." So the list is the default under sm, the board above it, and
        ?view= lets either be forced.
      */}
      <div className={view === "list" ? "hidden" : view === "board" ? "" : "hidden sm:block"}>
        <Board stages={stages} cases={cases} />
      </div>
      <div className={view === "board" ? "hidden" : view === "list" ? "" : "sm:hidden"}>
        <CaseList cases={cases} />
      </div>
    </div>
  );
}
