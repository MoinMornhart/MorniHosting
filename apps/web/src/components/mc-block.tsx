import { useId, type ReactElement } from 'react';
import { hashString, rng, type Rng } from '@/lib/pixel';
import { cn } from '@/lib/utils';

/**
 * A Minecraft-style block in 3D (isometric), drawn here pixel by pixel: grass, stone, purpur, planks and so on.
 * The textures are our own 8 × 8 patterns in the spirit of the game, not Mojang's files.
 */

export type BlockKind =
  | 'grass'
  | 'purpur'
  | 'planks'
  | 'furnace'
  | 'magma'
  | 'prismarine'
  | 'diamond'
  | 'command'
  | 'stone'
  | 'copper'
  | 'iron'
  | 'gold'
  | 'emerald'
  | 'redstone'
  | 'amethyst'
  | 'netherite';

type Face = 'top' | 'side' | 'front';
type Painter = (x: number, y: number, r: Rng) => string;

const SIZE = 8;
const pick = (r: Rng, list: readonly string[]): string =>
  list[Math.floor(r() * list.length)] ?? list[0] ?? '#000';

/* eslint-disable ts-patterns/no-magic-numbers -- pixel positions and colours of the 8 × 8 textures */
const GREEN = ['#5fa83a', '#6bb842', '#4f9a2f', '#7cc24e', '#58a236'];
const DIRT = ['#8b5a2b', '#7a4e25', '#9c6a3a', '#6b4220'];
const STONE = ['#8f8f8f', '#7d7d7d', '#9d9d9d', '#727272'];
const PURPUR = ['#a97dc2', '#9a6db3', '#b78fd0', '#a072ba'];
const WOOD = ['#bd9862', '#ad8753', '#c7a46f', '#b48e5a'];
const PRISMARINE = ['#63b3a3', '#4f9b8c', '#78c6b6', '#46887b', '#5aa597'];
const MAGMA = ['#7a2a12', '#8f3a14', '#5e1f0e', '#9b4416'];
const COMMAND = ['#c98a4f', '#b9783f', '#d79a5d', '#a96c37'];
const DIAMOND_DOTS = new Set(['1,1', '2,1', '5,2', '6,3', '2,5', '3,5', '5,6', '6,6']);

const AMETHYST = ['#9a5cc6', '#8a4fb5', '#b07ad8', '#7b41a3', '#c69ae6'];
const DEBRIS = ['#5e4a44', '#6b5550', '#4d3c37', '#7a6159'];

/** An ore: stone with clusters of the mineral in its colours, on every face a little differently. */
function ore(spots: readonly string[]): Readonly<Record<Face, Painter>> {
  return {
    top: (x, y, r) => (DIAMOND_DOTS.has(`${x},${y}`) ? pick(r, spots) : pick(r, STONE)),
    side: (x, y, r) => (DIAMOND_DOTS.has(`${y},${x}`) ? pick(r, spots) : pick(r, STONE)),
    front: (x, y, r) => (DIAMOND_DOTS.has(`${7 - x},${y}`) ? pick(r, spots) : pick(r, STONE)),
  };
}

const PAINTERS: Readonly<Record<BlockKind, Readonly<Record<Face, Painter>>>> = {
  copper: ore(['#e0814a', '#c9693a', '#5fb89a']),
  iron: ore(['#e3c3a8', '#d2a98a', '#f0dccb']),
  gold: ore(['#ffe14d', '#f5c518', '#fff3a0']),
  emerald: ore(['#3ddc75', '#17b45a', '#9bf5b8']),
  redstone: ore(['#ff2b2b', '#c81414', '#ff7a7a']),
  amethyst: {
    top: (x, y, r) => ((x * 3 + y) % 5 === 0 ? '#e9c9ff' : pick(r, AMETHYST)),
    side: (x, y, r) => ((x + y * 3) % 5 === 0 ? '#e9c9ff' : pick(r, AMETHYST)),
    front: (x, y, r) => ((x * 2 + y * 3) % 5 === 0 ? '#e9c9ff' : pick(r, AMETHYST)),
  },
  netherite: {
    top: (x, y, r) => ((x + y) % 4 === 0 ? '#9c857c' : pick(r, DEBRIS)),
    side: (_x, y, r) => (y % 3 === 0 ? '#3f312d' : pick(r, DEBRIS)),
    front: (x, y, r) => {
      if (y % 3 === 0) return '#3f312d';
      return (x + y) % 5 === 0 ? '#9c857c' : pick(r, DEBRIS);
    },
  },
  grass: {
    top: (_x, _y, r) => pick(r, GREEN),
    side: (_x, y, r) => (y < 2 || (y === 2 && r() > 0.5) ? pick(r, GREEN) : pick(r, DIRT)),
    front: (_x, y, r) => (y < 2 || (y === 2 && r() > 0.5) ? pick(r, GREEN) : pick(r, DIRT)),
  },
  stone: {
    top: (_x, _y, r) => pick(r, STONE),
    side: (_x, _y, r) => pick(r, STONE),
    front: (_x, _y, r) => pick(r, STONE),
  },
  diamond: {
    top: (x, y, r) =>
      DIAMOND_DOTS.has(`${x},${y}`) ? pick(r, ['#62f0e8', '#2fd1c9', '#b5fff9']) : pick(r, STONE),
    side: (x, y, r) => (DIAMOND_DOTS.has(`${y},${x}`) ? pick(r, ['#62f0e8', '#2fd1c9']) : pick(r, STONE)),
    front: (x, y, r) =>
      DIAMOND_DOTS.has(`${x},${y}`) ? pick(r, ['#62f0e8', '#2fd1c9', '#b5fff9']) : pick(r, STONE),
  },
  purpur: {
    top: (x, y, r) => (x % 4 === 3 || y % 4 === 3 ? '#7b4f93' : pick(r, PURPUR)),
    side: (x, y, r) => (x % 4 === 3 || y % 4 === 3 ? '#7b4f93' : pick(r, PURPUR)),
    front: (x, y, r) => (x % 4 === 3 || y % 4 === 3 ? '#7b4f93' : pick(r, PURPUR)),
  },
  planks: {
    top: (x, y, r) => (y === 3 || y === 7 || (x === (y < 4 ? 5 : 2) && y !== 3) ? '#80612f' : pick(r, WOOD)),
    side: (x, y, r) => (y === 3 || y === 7 || (x === (y < 4 ? 2 : 6) && y !== 3) ? '#80612f' : pick(r, WOOD)),
    front: (x, y, r) =>
      y === 3 || y === 7 || (x === (y < 4 ? 5 : 1) && y !== 3) ? '#80612f' : pick(r, WOOD),
  },
  furnace: {
    top: (x, y, r) => (x === 0 || y === 0 || x === 7 || y === 7 ? '#5f5f5f' : pick(r, STONE)),
    side: (x, y, r) => (x === 0 || y === 0 || x === 7 || y === 7 ? '#5f5f5f' : pick(r, STONE)),
    front: (x, y, r) => {
      if (y >= 4 && y <= 6 && x >= 2 && x <= 5)
        return y === 6 ? pick(r, ['#ffb02e', '#ff7a1a']) : pick(r, ['#ff9d2e', '#ffd25a', '#ff6a1a']);
      if (y === 3 && x >= 2 && x <= 5) return '#2b2b2b';
      return x === 0 || y === 0 || x === 7 || y === 7 ? '#5f5f5f' : pick(r, STONE);
    },
  },
  magma: {
    top: (x, y, r) =>
      (x + y) % 3 === 0 && r() > 0.3 ? pick(r, ['#ff9a2e', '#ffc548', '#ff6f1f']) : pick(r, MAGMA),
    side: (x, y, r) =>
      (x + 2 * y) % 4 === 0 && r() > 0.3 ? pick(r, ['#ff9a2e', '#ffc548']) : pick(r, MAGMA),
    front: (x, y, r) =>
      (2 * x + y) % 4 === 0 && r() > 0.3 ? pick(r, ['#ff9a2e', '#ffc548']) : pick(r, MAGMA),
  },
  prismarine: {
    top: (_x, _y, r) => pick(r, PRISMARINE),
    side: (_x, _y, r) => pick(r, PRISMARINE),
    front: (_x, _y, r) => pick(r, PRISMARINE),
  },
  command: {
    top: (x, y, r) => (x === 0 || y === 0 || x === 7 || y === 7 ? '#8a5a2e' : pick(r, COMMAND)),
    side: (x, y, r) => (x === 0 || y === 0 || x === 7 || y === 7 ? '#8a5a2e' : pick(r, COMMAND)),
    front: (x, y, r) => {
      if (x >= 2 && x <= 5 && y >= 2 && y <= 5)
        return x === 2 || y === 2 || x === 5 || y === 5 ? '#e7c08d' : '#5a3a1e';
      return x === 0 || y === 0 || x === 7 || y === 7 ? '#8a5a2e' : pick(r, COMMAND);
    },
  },
};

/** Where the three faces sit in the 64 × 64 drawing: a matrix that turns texture pixels into the face. */
const FACES: readonly { readonly face: Face; readonly matrix: string; readonly shade: number }[] = [
  { face: 'top', matrix: 'matrix(3.5 -1.75 3.5 1.75 4 18)', shade: 0 },
  { face: 'side', matrix: 'matrix(3.5 1.75 0 3.75 4 18)', shade: 0.22 },
  { face: 'front', matrix: 'matrix(3.5 -1.75 0 3.75 32 32)', shade: 0.4 },
];
/* eslint-enable ts-patterns/no-magic-numbers */

const PIXELS = Array.from({ length: SIZE * SIZE }, (_, i) => [i % SIZE, Math.floor(i / SIZE)] as const);
/** A hair wider than one pixel, so no seams show between them. */
const PIXEL = '1.06';

/** Which block a server gets: from its software. */
export function blockOf(software: string): BlockKind {
  const kinds: Readonly<Record<string, BlockKind>> = {
    paper: 'grass',
    vanilla: 'grass',
    java: 'grass',
    purpur: 'purpur',
    fabric: 'planks',
    forge: 'furnace',
    neoforge: 'magma',
    velocity: 'prismarine',
    bedrock: 'diamond',
    custom: 'command',
    all: 'grass',
  };
  return kinds[software] ?? 'stone';
}

export function McBlock({
  kind,
  className,
  at,
}: {
  kind: BlockKind;
  className?: string;
  /** Inside another drawing: where the block sits and how big it is. */
  at?: { readonly x: number; readonly y: number; readonly size: number };
}): ReactElement {
  const id = useId();
  const painters = PAINTERS[kind];
  const placement = at ? { x: at.x, y: at.y, width: at.size, height: at.size } : {};
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn(!at && 'size-11 shrink-0', className)} {...placement}>
      <defs>
        <radialGradient id={`${id}s`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="60" rx="24" ry="4" fill={`url(#${id}s)`} />
      {FACES.map(({ face, matrix, shade }) => {
        const r = rng(hashString(`${kind}:${face}`));
        return (
          <g key={face} transform={matrix}>
            {PIXELS.map(([x, y]) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={PIXEL}
                height={PIXEL}
                fill={painters[face](x, y, r)}
              />
            ))}
            {shade ? <rect width={SIZE} height={SIZE} fill="#000" fillOpacity={shade} /> : null}
            <rect
              width={SIZE}
              height={SIZE}
              fill="none"
              stroke="#000"
              strokeOpacity="0.25"
              strokeWidth="0.12"
            />
          </g>
        );
      })}
    </svg>
  );
}
