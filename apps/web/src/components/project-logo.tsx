import { useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Logos of the projects MorniHosting works with, loaded from where the projects publish them:
 * PaperMC asks to use its CDN and allows its logo in server selectors (https://docs.papermc.io/misc/assets/),
 * Geyser's and Simple Voice Chat's are the icons they show on Modrinth (as in the marketplace). Nothing is copied into this repository. Without internet (or in
 * the demo, which cannot load pictures from other sites) the given fallback is shown instead.
 */
const LOGOS = {
  paper: 'https://assets.papermc.io/brand/papermc_logo.min.svg',
  velocity: 'https://assets.papermc.io/brand/velocity_logo_blue.min.svg',
  geyser: 'https://cdn.modrinth.com/data/wKkoqHrH/6e8e781d5669ecef9e19a73b5c2eed060d6f73e7_96.webp',
  voicechat: 'https://cdn.modrinth.com/data/9eGKb6K1/icon.png',
} as const;
export type LogoProject = keyof typeof LOGOS;

const DEMO = import.meta.env.MODE === 'demo';

export function hasProjectLogo(id: string): id is LogoProject {
  return id in LOGOS;
}

export function ProjectLogo({
  project,
  fallback,
  className,
}: {
  project: LogoProject;
  fallback: ReactNode;
  className?: string;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  if (DEMO || failed) return <>{fallback}</>;
  return (
    <img
      src={LOGOS[project]}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('size-6 shrink-0 object-contain', className)}
    />
  );
}
