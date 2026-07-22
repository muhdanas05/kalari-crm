import { PageHeadSkeleton, StatRowSkeleton, ListSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <StatRowSkeleton count={2} />
      <ListSkeleton rows={6} />
    </div>
  );
}
