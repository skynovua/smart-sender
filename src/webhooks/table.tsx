import type { ReactNode } from 'react';

import { Icon } from '@/ui/icon';
import { Skeleton } from '@/ui/skeleton';

export function WebhookTable({ children }: { children: ReactNode }) {
  // Reserve a full ten-row page so the footer stays in place on shorter pages.
  return (
    <div className="min-h-[618px] overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed text-left text-sm">
        <caption className="sr-only">Список вебхуків</caption>
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[40%]" />
          <col className="w-[20%]" />
        </colgroup>
        <thead className="border-b border-border bg-canvas/40 text-xs text-muted">
          <tr>
            {['Назва', 'URL', 'Статус'].map((label) => (
              <th key={label} scope="col" className="px-6 py-4 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

export function WebhookListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Завантажуємо вебхуки…</span>
      <div aria-hidden="true">
        <WebhookTable>
          <tbody className="divide-y divide-border/50">
            {Array.from({ length: 10 }, (_, index) => (
              <tr key={index}>
                <td className="px-6 py-3">
                  <div className="flex h-8 items-center gap-3">
                    <Skeleton className="size-8 shrink-0" />
                    <Skeleton className={index % 2 === 0 ? 'h-4 w-40' : 'h-4 w-32'} />
                  </div>
                </td>
                <td className="px-6 py-3">
                  <Skeleton className="h-3 w-4/5" />
                </td>
                <td className="px-6 py-3">
                  <Skeleton className="h-[26px] w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </WebhookTable>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-4">
          <Skeleton className="h-4 w-52" />
          <div className="flex flex-wrap gap-2">
            {(['Попередня', 'Наступна'] as const).map((label, index) => (
              <span
                key={label}
                className="button-secondary pointer-events-none relative overflow-hidden"
              >
                <Icon
                  name={index === 0 ? 'chevronLeft' : 'chevronRight'}
                  className="invisible size-4"
                />
                <span className="invisible">{label}</span>
                <Skeleton className="absolute inset-0" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
