import { useState, type ReactElement, type ReactNode } from 'react';
import { PROJECT_LOGOS, type LogoProject } from '@mornihosting/shared';
import demoImages from 'virtual:demo-images';
import { cn } from '@/lib/utils';

const LOGOS = PROJECT_LOGOS;
export type { LogoProject };

const DEMO = import.meta.env.MODE === 'demo';
/** The demo cannot load pictures from other sites; its build embeds them (empty outside the demo). */
const EMBEDDED = demoImages;

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
  const src = DEMO ? EMBEDDED.logos[project] : LOGOS[project];
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('size-6 shrink-0 object-contain', className)}
    />
  );
}

/** Game card pictures: the panel fetches them once (see GAME_ART_SOURCES) and serves them from its data folder. */
const GAME_ART = {
  java: '/api/game-art/java',
  bedrock: '/api/game-art/bedrock',
  crossplay: '/api/game-art/crossplay',
} as const;

export function GameArt({
  game,
  fallback,
  className,
}: {
  game: keyof typeof GAME_ART;
  fallback: ReactNode;
  className?: string;
}): ReactElement {
  const [failed, setFailed] = useState(false);
  const src = DEMO ? EMBEDDED.gameArt[game] : GAME_ART[game];
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}
