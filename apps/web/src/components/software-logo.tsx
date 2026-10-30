import type { ReactElement } from 'react';
import type { SoftwareId } from '@mornihosting/shared';
import { cn } from '@/lib/utils';
import { blockOf, McBlock } from './mc-block';
import { hasProjectLogo, ProjectLogo } from './project-logo';

/** The software's own logo (Paper, Purpur, Fabric, Forge, NeoForge, Velocity); Vanilla and the rest keep their block. */
export function SoftwareLogo({ id, className }: { id: SoftwareId; className?: string }): ReactElement {
  const block = <McBlock kind={blockOf(id)} className="size-full" />;
  // Same box for every software, so logos and blocks line up.
  return (
    <span className={cn('grid size-6 shrink-0 place-items-center', className)}>
      {hasProjectLogo(id) ? (
        <ProjectLogo project={id} className="size-full rounded-[5px]" fallback={block} />
      ) : (
        block
      )}
    </span>
  );
}
