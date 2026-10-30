import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES, isGameId, type GameId } from '@mornihosting/shared';
import { cn } from '@/lib/utils';
import { Badge, GameScene, type GameKind } from './art';
import { GameArt, ProjectLogo } from './project-logo';

/**
 * A game as a big picture card, like a hoster's game list: the scene fills the card, the name sits large on top
 * ("Minecraft" small, "Java Edition" big), price and button below. Used on the start page and when ordering.
 */
export function GameCard({ game, onStart }: { game: GameKind | GameId; onStart: () => void }): ReactElement {
  const { t } = useTranslation();
  const other = isGameId(game);
  return (
    <button
      type="button"
      onClick={onStart}
      style={{ color: 'inherit' }}
      className="group grid grid-rows-[auto_1fr] overflow-hidden rounded-[18px] border border-border bg-card text-left shadow-card transition hover:-translate-y-1 hover:border-primary hover:shadow-xl"
    >
      <span className="relative block h-48 overflow-hidden">
        <GameArt
          game={game}
          className={cn(
            'absolute inset-0 size-full transition-transform duration-500 group-hover:scale-105',
            // The GeyserMC logo is a cut-out: it sits on a night sky above the title.
            game === 'crossplay' &&
              'bg-[radial-gradient(ellipse_at_50%_30%,#1f5a6e,#0b1d2a_60%,#050b12)] object-contain px-6 pb-16 pt-4',
          )}
          fallback={
            other ? (
              <OtherGameScene game={game} />
            ) : (
              <GameScene game={game} className="absolute inset-0 h-full -translate-y-3 scale-110" />
            )
          }
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"
        />
        <span className="absolute inset-x-5 bottom-3.5 grid text-white">
          <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.24em] text-white/80">
            {other ? t(`games.${game}.kicker`) : 'Minecraft'}
            {game === 'crossplay' ? (
              <ProjectLogo
                project="geyser"
                className="size-5 rounded-[5px]"
                fallback={<Badge glyph="crossplay" className="size-5" />}
              />
            ) : null}
          </span>
          <span className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] drop-shadow-lg">
            {other ? GAMES[game].label : t(`landing.games.${game}.edition`)}
          </span>
        </span>
      </span>
      <span className="grid content-between gap-4 p-5">
        <span className="text-sm text-muted-foreground">
          {other ? t(`games.${game}.text`) : t(`landing.games.${game}.text`)}
        </span>
        <span className="flex items-center justify-between text-sm font-semibold">
          {t('landing.free')}
          <span className="rounded-[10px] bg-primary px-3.5 py-2 text-primary-foreground transition group-hover:brightness-110">
            {t('landing.start')}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Drawn stand-in when the game's picture cannot be loaded: its own colours and a few shapes, no logos. */
const SCENE_COLOURS: Readonly<Record<GameId, readonly [string, string]>> = {
  factorio: ['#7a4a12', '#1b1206'],
};

export function OtherGameScene({ game }: { game: GameId }): ReactElement {
  const [from, to] = SCENE_COLOURS[game];
  return (
    <span
      aria-hidden
      className="absolute inset-0 grid place-items-center"
      style={{ background: `radial-gradient(ellipse at 50% 35%, ${from}, ${to} 70%)` }}
    >
      <Badge glyph={`game-${game}`} className="size-20 -translate-y-6 opacity-90" />
    </span>
  );
}
