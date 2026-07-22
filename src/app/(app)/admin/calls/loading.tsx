import { PageHeadSkeleton, StatRowSkeleton, PanelSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <StatRowSkeleton count={3} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    </div>
  );
}
