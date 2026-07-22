import { PageHeadSkeleton, ListSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <ListSkeleton rows={5} />
    </div>
  );
}
