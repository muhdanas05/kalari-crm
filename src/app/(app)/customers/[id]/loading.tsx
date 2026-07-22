import { PageHeadSkeleton, PanelSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PanelSkeleton />
        <PanelSkeleton className="lg:col-span-2" />
      </div>
    </div>
  );
}
