import { Check } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerSummary, SoftwareId } from '@mornihosting/shared';
import { SoftwareLogo } from '@/components/software-logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Pieces both order pages share (Minecraft and the other games). */

const PORT_SEARCH_LIMIT = 200;

/**
 * Card-like buttons take the text colour of the card. Set inline, because some app viewers (the demo inside
 * the Claude app on iPhone) give buttons their own dark text colour that would otherwise win.
 */
export const OWN_TEXT_COLOUR = { color: 'inherit' } as const;
const ADJECTIVES = ['mutiger', 'flinker', 'goldener', 'wilder', 'schlauer', 'gruener', 'stolzer', 'leiser'];
const NOUNS = ['creeper', 'schleim', 'enderman', 'axolotl', 'golem', 'fuchs', 'panda', 'drache'];

/** A fun name to start with, like hosters prefill: "goldener-axolotl". */
export function suggestName(): string {
  const pick = (list: readonly string[]): string => list[Math.floor(Math.random() * list.length)] ?? '';
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

export function nextFreePort(base: number, servers: readonly ServerSummary[]): number {
  const used = new Set(servers.map((s) => s.port));
  const candidates = Array.from({ length: PORT_SEARCH_LIMIT }, (_, i) => base + i);
  return candidates.find((p) => !used.has(p)) ?? base;
}

export function Section({
  number,
  icon,
  title,
  text,
  children,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  text: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="grid gap-4 border-b border-border p-5 last:border-b-0 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-primary">
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-bold">
            {number}. {title}
          </h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Every add-on shows its picture in the same tile: the project's logo, or a symbol when it has none. */
export function AddOnTile({ children }: { children: ReactNode }): ReactElement {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-border bg-background shadow-sm">
      {children}
    </span>
  );
}

export function SoftwareIcon({ id }: { id: SoftwareId }): ReactElement {
  return <SoftwareLogo id={id} />;
}

export function AddOn({
  title,
  text,
  on,
  locked,
  recommended,
  icon,
  onChange,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  on: boolean;
  locked?: boolean;
  recommended?: boolean;
  onChange: (on: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-secondary/60 px-4 py-3',
        on && 'border-primary/60 bg-accent',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          {recommended ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              {t('order.recommended')}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <span className="text-sm font-semibold text-muted-foreground">{t('order.included')}</span>
      <Button
        type="button"
        size="sm"
        variant={on ? 'secondary' : 'default'}
        disabled={locked}
        onClick={() => onChange(!on)}
      >
        {on ? <Check /> : null}
        {on ? t('order.added') : t('order.add')}
      </Button>
    </div>
  );
}
