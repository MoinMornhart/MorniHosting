import type { ReactElement, ReactNode } from 'react';
import { BrandMark } from '@/components/server-visuals';

/** Centered card for sign-in and first-run setup. */
export function AuthLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-[460px] gap-6">
        <div className="flex items-center justify-center gap-2.5 text-xl font-extrabold tracking-[-0.01em]">
          <BrandMark className="size-9" />
          MorniHosting
        </div>
        <div className="rounded-[16px] border border-border bg-card p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  );
}
