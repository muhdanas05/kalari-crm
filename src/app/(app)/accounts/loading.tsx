import { PageHeadSkeleton, StatRowSkeleton, ListSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <StatRowSkeleton count={3} />
      <ListSkeleton rows={8} />
    </div>
  );
}
