import type { GameId } from '@mornihosting/shared';
import { useId, type ReactElement, type ReactNode } from 'react';
import logoUrl from '@/assets/logo.svg';
import { hashString } from '@/lib/pixel';
import { McBlock } from './mc-block';
import { cn } from '@/lib/utils';

/**
 * MorniHosting's own artwork, drawn as SVG: the logo, glossy app-style server badges with a glyph per
 * software, little scenes for the games, gems for the packages and monograms for people. Everything is
 * vector, so it stays sharp at every size and needs no files.
 */

/* ---------- Glyphs (24 × 24, white on a coloured badge) ---------- */

export type Glyph =
  | 'paper'
  | 'purpur'
  | 'vanilla'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'velocity'
  | 'bedrock'
  | 'custom'
  | 'all'
  | 'java'
  | 'crossplay'
  | `game-${GameId}`;

/** Outline of a filled shape. */
const STROKE = {
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;
/** A line without fill. */
const LINE = { fill: 'none', ...STROKE } as const;

const GLYPHS: Readonly<Record<Glyph, ReactNode>> = {
  // A conveyor belt between two machines on an alien planet's horizon (no game logo).
  'game-satisfactory': (
    <>
      <rect x="2.5" y="9" width="6" height="8" rx="1.2" fill="currentColor" fillOpacity="0.25" {...STROKE} />
      <rect
        x="15.5"
        y="6"
        width="6"
        height="11"
        rx="1.2"
        fill="currentColor"
        fillOpacity="0.25"
        {...STROKE}
      />
      <path d="M8.5 13.5h7M2 20.5h20M10 11.5l1.5 2-1.5 2M13 11.5l1.5 2-1.5 2" {...LINE} />
    </>
  ),
  // A wrench over a cube: building and tinkering sandbox (no game logo).
  'game-gmod': (
    <>
      <path
        d="M12 9.5 19 13.3v7.4l-7 3.8-7-3.8v-7.4l7-3.8Z"
        fill="currentColor"
        fillOpacity="0.25"
        transform="translate(0 -3)"
        {...STROKE}
      />
      <path d="M5 10.3 12 14.1l7-3.8M12 14.1v7.4" {...LINE} />
      <path d="M14.5 2.2a3.2 3.2 0 0 0-3.9 4.2L6.8 10.2" {...LINE} />
    </>
  ),
  // A crosshair: tactical shooter (no game logo).
  'game-cs2': (
    <>
      <circle cx="12" cy="12" r="7.5" fill="currentColor" fillOpacity="0.2" {...STROKE} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 1.8v5M12 17.2v5M1.8 12h5M17.2 12h5" {...LINE} />
    </>
  ),
  // Two meshing gears above a conveyor belt: building factories (no game logo).
  'game-factorio': (
    <>
      <circle cx="9" cy="9" r="4.2" fill="currentColor" fillOpacity="0.25" {...STROKE} />
      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
      <path
        d="M9 3V1.8M9 16.2V15M3 9H1.8M16.2 9H15M4.8 4.8l-.9-.9M14.1 14.1l-.9-.9M4.8 13.2l-.9.9M14.1 3.9l-.9.9"
        {...LINE}
      />
      <circle cx="17" cy="13.5" r="2.6" fill="currentColor" fillOpacity="0.25" {...STROKE} />
      <path d="M2.5 19.5h19M5 22h0M9.5 22h0M14 22h0M18.5 22h0" {...LINE} />
    </>
  ),
  // A paper plane.
  paper: (
    <>
      <path
        d="M3.2 11.3 20.6 3.4l-6.3 17.2-3.1-7-8-2.3Z"
        fill="currentColor"
        fillOpacity="0.25"
        {...STROKE}
      />
      <path d="m11.2 13.6 9.4-10.2" {...LINE} />
    </>
  ),
  // A flame.
  purpur: (
    <>
      <path
        d="M12 2.6c.9 3.3 5.1 5.4 5.1 10.2a5.1 5.1 0 0 1-10.2 0c0-2.1 1-3.6 2.3-4.8.2 1.6 1 2.7 2.2 3.1-.1-3.3-.4-6 .6-8.5Z"
        fill="currentColor"
        fillOpacity="0.25"
        {...STROKE}
      />
      <path d="M12 17.9a2 2 0 0 1-2-2c0-1.3 1.2-2 2-3.3.8 1.3 2 2 2 3.3a2 2 0 0 1-2 2Z" fill="currentColor" />
    </>
  ),
  // A plain cube: Minecraft as it comes.
  vanilla: (
    <>
      <path d="M12 2.9 20.4 7.6v8.8L12 21.1l-8.4-4.7V7.6L12 2.9Z" {...LINE} />
      <path d="M12 2.9 20.4 7.6 12 12.3 3.6 7.6 12 2.9Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M3.6 7.6 12 12.3l8.4-4.7M12 12.3v8.8" {...LINE} />
    </>
  ),
  // Woven threads.
  fabric: (
    <>
      <path d="M12 3 21 12l-9 9-9-9 9-9Z" fill="currentColor" fillOpacity="0.2" {...STROKE} />
      <path d="m7.5 7.5 9 9M16.5 7.5l-9 9M12 3v18M3 12h18" {...LINE} strokeOpacity="0.55" />
    </>
  ),
  // An anvil.
  forge: (
    <>
      <path
        d="M3.5 6.5h12a5 5 0 0 0 5 4.5h-4.3l-1.7 2.6V16h2.6v3.3H6.9V16h2.6v-2.4L6.6 10.2H3.5V6.5Z"
        fill="currentColor"
        fillOpacity="0.25"
        {...STROKE}
      />
    </>
  ),
  // An anvil with a spark.
  neoforge: (
    <>
      <path
        d="M3.5 8.5h10.5a4.5 4.5 0 0 0 4.5 4h-3.8l-1.5 2.3V17h2.3v2.8H6.6V17h2.3v-2.2L6.4 11.8H3.5V8.5Z"
        fill="currentColor"
        fillOpacity="0.25"
        {...STROKE}
      />
      <path d="m19 2.5.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" fill="currentColor" />
    </>
  ),
  // A lightning bolt: the fast proxy.
  velocity: (
    <path
      d="M13.2 2.5 4.6 13.6h6.3l-1 7.9 8.6-11.2h-6.3l1-7.8Z"
      fill="currentColor"
      fillOpacity="0.3"
      {...STROKE}
    />
  ),
  // A gamepad: phones, consoles, Windows.
  bedrock: (
    <>
      <path
        d="M7.2 7.5h9.6a4.2 4.2 0 0 1 4.2 4.2v1.6a3.6 3.6 0 0 1-6.5 2.1l-1-1.4h-3l-1 1.4A3.6 3.6 0 0 1 3 13.3v-1.6a4.2 4.2 0 0 1 4.2-4.2Z"
        fill="currentColor"
        fillOpacity="0.22"
        {...STROKE}
      />
      <path d="M8 10.3v3M6.5 11.8h3" {...LINE} />
      <circle cx="15.6" cy="10.9" r="1.1" fill="currentColor" />
      <circle cx="17.6" cy="12.9" r="1.1" fill="currentColor" />
    </>
  ),
  // A cog: an own server file.
  custom: (
    <>
      <circle cx="12" cy="12" r="3.2" {...LINE} />
      <path
        d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9"
        {...LINE}
      />
    </>
  ),
  // Stacked layers: all servers.
  all: (
    <>
      <path d="M12 3.2 21 8l-9 4.8L3 8l9-4.8Z" fill="currentColor" fillOpacity="0.3" {...STROKE} />
      <path d="m3 12.2 9 4.8 9-4.8M3 16.4l9 4.8 9-4.8" {...LINE} />
    </>
  ),
  // A cube with a sparkle: Java.
  java: (
    <>
      <path d="M11 4.4 18.6 8.7v8.6L11 21.6l-7.6-4.3V8.7L11 4.4Z" {...LINE} />
      <path d="M11 4.4 18.6 8.7 11 13 3.4 8.7 11 4.4Z" fill="currentColor" fillOpacity="0.45" />
      <path d="M3.4 8.7 11 13l7.6-4.3M11 13v8.6" {...LINE} />
      <path d="m19.6 1.8.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7Z" fill="currentColor" />
    </>
  ),
  // Two linked rings: Java and Bedrock together.
  crossplay: (
    <>
      <path d="M9.5 14.5 7.7 16.3a3.3 3.3 0 0 1-4.7-4.7l3.3-3.3a3.3 3.3 0 0 1 4.7 0" {...LINE} />
      <path d="m14.5 9.5 1.8-1.8a3.3 3.3 0 0 1 4.7 4.7l-3.3 3.3a3.3 3.3 0 0 1-4.7 0" {...LINE} />
      <path d="m9.2 14.8 5.6-5.6" {...LINE} />
    </>
  ),
};

/* ---------- Badges (app-icon style) ---------- */

/** Two colours per software, top-left to bottom-right. */
const TONES: Readonly<Record<Glyph, readonly [string, string]>> = {
  paper: ['#10b981', '#065f46'],
  purpur: ['#a855f7', '#4c1d95'],
  vanilla: ['#3b82f6', '#1e3a8a'],
  fabric: ['#f59e0b', '#9a3412'],
  forge: ['#f97316', '#991b1b'],
  neoforge: ['#ea580c', '#7c2d12'],
  velocity: ['#06b6d4', '#164e63'],
  bedrock: ['#ec4899', '#831843'],
  custom: ['#64748b', '#1e293b'],
  all: ['#10b981', '#064e3b'],
  java: ['#22c55e', '#14532d'],
  crossplay: ['#f59e0b', '#92400e'],
  'game-factorio': ['#f59e0b', '#7c2d12'],
  'game-cs2': ['#60a5fa', '#1e293b'],
  'game-gmod': ['#38bdf8', '#0c4a6e'],
  'game-satisfactory': ['#fb923c', '#9a3412'],
};

const GLYPH_NAMES = Object.keys(TONES) as Glyph[];
const MAX_INITIALS = 2;
// Where a name splits into words for its initials: "lena_baut" gives "LB", "Philip" stays one word.
// https://regex101.com/?flavor=javascript&regex=%5B%5Cs._-%5D%2B&flags=g&testString=lena_baut%0APhilip
const WORD_BREAK = /[\s._-]+/;

/** Where the soft light sits in a badge, picked from the server's id so every server looks a bit its own. */
const SHINES = [
  { cx: '38', cy: '6' },
  { cx: '6', cy: '40' },
  { cx: '40', cy: '38' },
  { cx: '4', cy: '6' },
] as const;

/**
 * A glossy badge like an app icon: gradient, a highlight on top, a soft light in one corner and the glyph.
 * `seed` (e.g. the server id) moves the light so two Paper servers still look different.
 */
export function Badge({
  glyph,
  seed = '',
  className,
}: {
  glyph: Glyph;
  seed?: string;
  className?: string;
}): ReactElement {
  const id = useId();
  const [from, to] = TONES[glyph];
  const shine = SHINES[hashString(seed || glyph) % SHINES.length] ?? SHINES[0];
  return (
    <svg viewBox="0 0 44 44" aria-hidden className={cn('size-11 shrink-0', className)}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <rect width="44" height="44" rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="44" height="44" fill={`url(#${id}g)`} />
        <circle {...shine} r="20" fill={`url(#${id}s)`} />
        <path d="M0 0h44v15C30 19 14 19 0 15Z" fill="#fff" fillOpacity="0.08" />
        <path d="M0 34C14 39 30 39 44 34v10H0Z" fill="#000" fillOpacity="0.14" />
        <rect
          x="0.75"
          y="0.75"
          width="42.5"
          height="42.5"
          rx="11.25"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.16"
          strokeWidth="1.5"
        />
      </g>
      <g
        transform="translate(9.2 9.2) scale(1.07)"
        color="#fff"
        style={{ filter: 'drop-shadow(0 1.2px 1.2px rgb(0 0 0 / 0.35))' }}
      >
        {GLYPHS[glyph]}
      </g>
    </svg>
  );
}

/** Initials on a gradient, for people without a picture. */
export function Monogram({ name, className }: { name: string; className?: string }): ReactElement {
  const id = useId();
  const tone = TONES[GLYPH_NAMES[hashString(name) % GLYPH_NAMES.length] ?? 'paper'];
  const letters = name
    .split(WORD_BREAK)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn('size-10 shrink-0', className)}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tone[0]} />
          <stop offset="1" stopColor={tone[1]} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id}g)`} />
      <path d="M0 0h40v14C27 18 13 18 0 14Z" fill="#fff" fillOpacity="0.08" />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily="var(--font-sans)"
        fontSize={letters.length > 1 ? '15' : '18'}
        fontWeight="800"
      >
        {letters || '?'}
      </text>
    </svg>
  );
}

/* ---------- Logo ---------- */

/** The MorniHosting mark: an emerald cube floating on a soft glow. */
/** The MorniHosting logo: a grass block with a pixel "M" on emerald (same picture as the browser tab icon). */
export function LogoMark({ className }: { className?: string }): ReactElement {
  return <img src={logoUrl} alt="" aria-hidden className={cn('size-8 shrink-0', className)} />;
}

/* ---------- Game scenes ---------- */

export type GameKind = 'java' | 'bedrock' | 'crossplay';

const HALF = 0.5;

function Sparkle({
  x,
  y,
  r,
  color = '#fff',
}: {
  x: number;
  y: number;
  r: number;
  color?: string;
}): ReactElement {
  const k = r * HALF * HALF;
  const d = `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
  return <path d={d} fill={color} />;
}

function Phone({ x, y, scale = 1 }: { x: number; y: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(-12)`}>
      <rect x="-14" y="-24" width="28" height="48" rx="6" fill="#1e1b4b" />
      <rect x="-11.5" y="-20" width="23" height="38" rx="3" fill="#f472b6" />
      <path d="M-11.5 -2 L11.5 -12 V18 H-11.5Z" fill="#db2777" />
      <rect x="-4" y="20" width="8" height="1.6" rx="0.8" fill="#fff" fillOpacity="0.5" />
      <path d="M-5 -8 0 -12.5 5 -8 0 -3.5Z" fill="#fff" fillOpacity="0.9" />
    </g>
  );
}

function Gamepad({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) rotate(10)`}>
      <path
        d="M-16 -8h32a9 9 0 0 1 9 9v3a7.5 7.5 0 0 1-13.6 4.4L9 5H-9l-2.4 3.4A7.5 7.5 0 0 1-25 4V1a9 9 0 0 1 9-9Z"
        fill="#38bdf8"
      />
      <path d="M-16 -8h32a9 9 0 0 1 9 9v1H-25V1a9 9 0 0 1 9-9Z" fill="#7dd3fc" />
      <path d="M-14 -2v6M-17 1h6" stroke="#0c4a6e" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="-1" r="2" fill="#0c4a6e" />
      <circle cx="16.5" cy="3" r="2" fill="#0c4a6e" />
    </g>
  );
}

/* eslint-disable ts-patterns/no-magic-numbers -- positions in the 160 × 80 scene drawings */
const SCENES: Readonly<
  Record<GameKind, { readonly sky: readonly [string, string]; readonly art: ReactNode }>
> = {
  java: {
    sky: ['#064e3b', '#022c22'],
    art: (
      <>
        <ellipse cx="80" cy="66" rx="30" ry="7" fill="#000" fillOpacity="0.3" />
        <McBlock kind="grass" at={{ x: 50, y: 4, size: 60 }} />
        <McBlock kind="diamond" at={{ x: 22, y: 20, size: 22 }} />
        <McBlock kind="purpur" at={{ x: 118, y: 10, size: 18 }} />
        <McBlock kind="magma" at={{ x: 124, y: 46, size: 15 }} />
        <Sparkle x={58} y={12} r={4} />
        <Sparkle x={108} y={8} r={2.6} />
        <Sparkle x={30} y={56} r={2.2} color="#6ee7b7" />
      </>
    ),
  },
  bedrock: {
    sky: ['#4c1d95', '#1e1b4b'],
    art: (
      <>
        <ellipse cx="80" cy="68" rx="34" ry="6" fill="#000" fillOpacity="0.3" />
        <McBlock kind="diamond" at={{ x: 14, y: 26, size: 30 }} />
        <Phone x={68} y={38} />
        <Gamepad x={106} y={50} />
        <Sparkle x={124} y={18} r={3.6} />
        <Sparkle x={38} y={16} r={2.4} color="#f9a8d4" />
        <Sparkle x={136} y={44} r={2} color="#7dd3fc" />
      </>
    ),
  },
  crossplay: {
    sky: ['#78350f', '#1c1917'],
    art: (
      <>
        <ellipse cx="80" cy="68" rx="40" ry="6" fill="#000" fillOpacity="0.3" />
        <path
          d="M58 30 Q80 2 104 28"
          fill="none"
          stroke="#fde68a"
          strokeWidth="2"
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
        <McBlock kind="grass" at={{ x: 26, y: 14, size: 50 }} />
        <Phone x={108} y={42} scale={0.8} />
        <Sparkle x={80} y={10} r={4} color="#fde68a" />
        <Sparkle x={30} y={20} r={2.2} />
        <Sparkle x={136} y={16} r={2.4} />
      </>
    ),
  },
};
/* eslint-enable ts-patterns/no-magic-numbers */

/** A little scene for a game card: a glowing cube for Java, phone and gamepad for Bedrock, both linked for crossplay. */
export function GameScene({ game, className }: { game: GameKind; className?: string }): ReactElement {
  const id = useId();
  const scene = SCENES[game];
  // The sky fills the whole card; the drawing keeps its proportions in the middle, so nothing is cut off.
  return (
    <div
      aria-hidden
      className={cn('relative h-28 w-full overflow-hidden', className)}
      style={{ background: `linear-gradient(160deg, ${scene.sky[0]}, ${scene.sky[1]})` }}
    >
      <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full">
        <defs>
          <radialGradient id={`${id}glow`} cx="0.5" cy="0.55" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="80" cy="40" r="46" fill={`url(#${id}glow)`} />
        <g className="art-float">{scene.art}</g>
      </svg>
    </div>
  );
}
