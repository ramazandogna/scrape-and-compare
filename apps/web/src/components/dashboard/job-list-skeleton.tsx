import { Card, CardContent } from "@/components/ui/card";

interface JobListSkeletonProps {
  count?: number;
}

export function JobListSkeleton({ count = 3 }: JobListSkeletonProps) {
  return (
    <div className="animate-skeleton-in space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted/70" />
            </div>
            <div className="flex gap-3">
              <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-muted/70" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="flex gap-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                  <div className="h-3 w-14 animate-pulse rounded bg-muted/60" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-14 animate-pulse rounded-full bg-muted/70" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted/70" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-muted/70" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
