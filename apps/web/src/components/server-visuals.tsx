import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerState } from '@mornihosting/shared';
import { blockForServer, blockIcon, playerFace } from '@/lib/pixel';
import { cn } from '@/lib/utils';
import { Pill, type PillTone } from './ui/pill';

const STATE_TONES: Readonly<Record<ServerState, PillTone>> = {
  installing: 'warn',
  starting: 'warn',
  running: 'ok',
  stopping: 'warn',
  stopped: 'neutral',
  crashed: 'bad',
};

export function StatePill({ state, className }: { state: ServerState; className?: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <Pill tone={STATE_TONES[state]} className={className}>
      {t(`states.${state}`)}
    </Pill>
  );
}

export interface ServerIconProps {
  readonly id: string;
  readonly software: string;
  readonly hasIcon: boolean;
  readonly className?: string;
}

/** The server's own server-icon.png if it has one, otherwise a block that fits its software. */
export function ServerIcon({ id, software, hasIcon, className }: ServerIconProps): ReactElement {
  const [failed, setFailed] = useState(false);
  const src = hasIcon && !failed ? `/api/servers/${id}/icon` : blockIcon(blockForServer(software, id));
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={cn('pixelated size-11 shrink-0 rounded-[10px] object-cover', className)}
    />
  );
}

/** A player's face from mc-heads.net; falls back to a drawn face offline or for Bedrock names. */
export function PlayerHead({ name, className }: { name: string; className?: string }): ReactElement {
  const [failed, setFailed] = useState(false);
  const usable = !failed && /^[A-Za-z0-9_]{3,16}$/.test(name); // eslint-disable-line ts-patterns/require-regex-example -- Java names: "Lena_Baut" has a skin, "Finn 2015" (Bedrock) does not
  return (
    <img
      src={usable ? `https://mc-heads.net/avatar/${encodeURIComponent(name)}/32` : playerFace(name)}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('pixelated size-6 shrink-0 rounded-[5px]', className)}
    />
  );
}

export function BrandMark({ className }: { className?: string }): ReactElement {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary', className)}>
      <img src={blockIcon('grass')} alt="" className="pixelated size-[18px]" />
    </span>
  );
}
