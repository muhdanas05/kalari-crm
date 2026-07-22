import { PageHeadSkeleton, BoardSkeleton } from "@/components/ui/PageSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeadSkeleton />
      <BoardSkeleton />
    </div>
  );
}
