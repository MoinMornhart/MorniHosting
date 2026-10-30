import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, GameScene, type GameKind } from './art';
import { ProjectLogo } from './project-logo';

/**
 * A game as a big picture card, like a hoster's game list: the scene fills the card, the name sits large on top
 * ("Minecraft" small, "Java Edition" big), price and button below. Used on the start page and when ordering.
 */
export function GameCard({ game, onStart }: { game: GameKind; onStart: () => void }): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onStart}
      className="group grid grid-rows-[auto_1fr] overflow-hidden rounded-[18px] border border-border bg-card text-left shadow-card transition hover:-translate-y-1 hover:border-primary hover:shadow-xl"
    >
      <span className="relative block h-48 overflow-hidden">
        <GameScene game={game} className="absolute inset-0 h-full -translate-y-3 scale-110" />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent"
        />
        <span className="absolute inset-x-5 bottom-3.5 grid text-white">
          <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.24em] text-white/80">
            Minecraft
            {game === 'crossplay' ? (
              <ProjectLogo
                project="geyser"
                className="size-5 rounded-[5px]"
                fallback={<Badge glyph="crossplay" className="size-5" />}
              />
            ) : null}
          </span>
          <span className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] drop-shadow-lg">
            {t(`landing.games.${game}.edition`)}
          </span>
        </span>
      </span>
      <span className="grid content-between gap-4 p-5">
        <span className="text-sm text-muted-foreground">{t(`landing.games.${game}.text`)}</span>
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
