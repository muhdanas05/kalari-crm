import { PageHeadSkeleton, PanelSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <PanelSkeleton />
          <PanelSkeleton className="min-h-[240px]" />
        </div>
        <PanelSkeleton className="min-h-[320px]" />
      </div>
    </div>
  );
}
