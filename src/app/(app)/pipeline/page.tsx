import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getPipelines, getBoardCases, type PipelineKey } from "@/lib/db/pipelines";
import { Board } from "@/components/board/Board";
import { CaseList } from "@/components/board/CaseList";
import { PipelineTabs } from "./PipelineTabs";

export const metadata: Metadata = { title: "Pipeline · Kalari" };

const VALID: PipelineKey[] = ["sales", "processing", "renewal"];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const key: PipelineKey = VALID.includes(sp.p as PipelineKey)
    ? (sp.p as PipelineKey)
    : "processing";
  const view = sp.view === "board" ? "board" : sp.view === "list" ? "list" : null;

  const [pipelines, cases] = await Promise.all([
    getPipelines(),
    getBoardCases(key),
  ]);

  const pipeline = pipelines.find((p) => p.key === key);
  const stages = pipeline?.stages ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Operations"
        title="Pipeline"
        subtitle="Every customer, at every stage."
      />

      <PipelineTabs
        pipelines={pipelines.map((p) => ({
          key: p.key,
          name: p.name,
          count: p.key === key ? cases.length : undefined,
        }))}
        active={key}
        view={view}
      />

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
