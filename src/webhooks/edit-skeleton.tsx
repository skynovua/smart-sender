import { Skeleton } from '@/ui/skeleton';

export function WebhookEditSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Завантажуємо вебхук…</span>
      <div aria-hidden="true">
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-9 w-4/5 max-w-md sm:h-10" />
        <Skeleton className="mt-3 h-5 w-3/4 max-w-sm" />
        <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_220px]">
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-6 py-5 sm:px-8">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="mt-1.5 h-[18px] w-3/4" />
            </div>
            <div className="space-y-7 px-6 py-7 sm:px-8">
              <div>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="mt-2.5 h-[50px] w-full sm:h-[47px]" />
              </div>
              <div>
                <Skeleton className="h-5 w-12" />
                <Skeleton className="mt-2.5 h-[50px] w-full sm:h-[47px]" />
                <Skeleton className="mt-3 h-5 w-3/4" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4 sm:px-8">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
          <div className="border-l border-border py-1 pl-6">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-4 h-7 w-12" />
            <Skeleton className="mt-4 h-4 w-20" />
            <Skeleton className="mt-8 h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
