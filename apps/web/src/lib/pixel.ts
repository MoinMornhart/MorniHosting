/** Small pixel-art pictures drawn on a canvas: block icons for servers, faces for players, icons for plugins. */

type Rng = () => number;

const MULBERRY_INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_A = 61;
const UINT32 = 4294967296;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const BLOCK_SIZE = 16;
const FACE_SIZE = 8;
const HALF_FACE = 4;
const EYE_ROW = 4;
const MOUTH_ROW = 6;
const HAIR_ROWS = 2;
const LONG_HAIR_UNTIL = 6;
const HAIR_CHANCE = 0.7;
const GRASS_DEPTH = 4;
const GRASS_JAGGED = 3;
const GRID_EVERY = 8;
const PLANK_ROW_A = 5;
const PLANK_ROW_B = 10;
const RIB_A = 4;
const RIB_B = 11;
const SYMMETRY_THRESHOLD = 0.45;
const SATURATION_BASE = 55;
const SATURATION_SPAN = 20;
const LIGHTNESS_BASE = 50;
const LIGHTNESS_SPAN = 18;
const LEFT_EYE_X = 1;
const LEFT_PUPIL_X = 2;
const RIGHT_PUPIL_X = 5;
const RIGHT_EYE_X = 6;
const MOUTH_LEFT = 3;
const MOUTH_RIGHT = 4;

function rng(seed: number): Rng {
  const state = { seed };
  return () => {
    state.seed = (state.seed + MULBERRY_INCREMENT) | 0;
    const a = Math.imul(state.seed ^ (state.seed >>> SHIFT_A), 1 | state.seed);
    const b = (a + Math.imul(a ^ (a >>> SHIFT_B), MIX_A | a)) ^ a;
    return ((b ^ (b >>> SHIFT_C)) >>> 0) / UINT32;
  };
}

export function hashString(s: string): number {
  return [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), FNV_PRIME), FNV_OFFSET) >>> 0;
}

const cache = new Map<string, string>();

function paint(
  key: string,
  size: number,
  draw: (px: (x: number, y: number, color: string) => void) => void,
): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return '';
  draw((x, y, color) => {
    g.fillStyle = color;
    g.fillRect(x, y, 1, 1);
  });
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

const grid = (size: number): readonly (readonly [number, number])[] =>
  Array.from({ length: size * size }, (_, i) => [i % size, Math.floor(i / size)] as const);

export const BLOCK_KINDS = [
  'grass',
  'diamond',
  'planks',
  'pumpkin',
  'nether',
  'stone',
  'sand',
  'ice',
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

interface BlockPalette {
  readonly all?: readonly string[];
  readonly top?: readonly string[];
  readonly body?: readonly string[];
  readonly grid?: string;
  readonly rib?: string;
}

const PALETTES: Readonly<Record<BlockKind, BlockPalette>> = {
  grass: {
    top: ['#5aa636', '#6bbd42', '#4c9230', '#78c94e'],
    body: ['#8a5a2c', '#7a4d24', '#9a6936', '#6e4520'],
  },
  diamond: { all: ['#7fe3dc', '#5fcfc7', '#a7f1ec', '#4bb7b0'] },
  planks: { all: ['#b0803f', '#9c6d31', '#c18f4c', '#8a5e29'], grid: '#6e4a1f' },
  pumpkin: { all: ['#e2902c', '#cf7d1e', '#f0a743', '#b96a14'], rib: '#a85c10' },
  nether: { all: ['#7d2b2b', '#923636', '#5f1f20', '#a8473f'] },
  stone: { all: ['#8b8b8b', '#7a7a7a', '#9d9d9d', '#6c6c6c'] },
  sand: { all: ['#e3d59b', '#d8c98a', '#ecdfab', '#cdbd7c'] },
  ice: { all: ['#9fc4f7', '#8ab6f2', '#b6d3fa', '#7aa7ea'] },
};

const pick = (r: Rng, list: readonly string[]): string =>
  list[Math.floor(r() * list.length)] ?? list[0] ?? '#000';

export function blockIcon(kind: BlockKind): string {
  return paint(`block:${kind}`, BLOCK_SIZE, (px) => {
    const r = rng(hashString(kind));
    const p = PALETTES[kind];
    grid(BLOCK_SIZE).forEach(([x, y]) => {
      const edge = GRASS_DEPTH + Math.floor(r() * GRASS_JAGGED) - (x % GRASS_JAGGED ? 0 : 1);
      const layered = y < edge ? p.top : p.body;
      const set = (p.top && p.body ? layered : p.all) ?? [];
      const base = pick(r, set);
      const withGrid =
        p.grid && (x % GRID_EVERY === 0 || y === PLANK_ROW_A || y === PLANK_ROW_B) ? p.grid : base;
      px(x, y, p.rib && (x === RIB_A || x === RIB_B) ? p.rib : withGrid);
    });
  });
}

/** A stable block for a server: chosen from its software and id, so it never changes between visits. */
export function blockForServer(software: string, id: string): BlockKind {
  const preferred: Readonly<Record<string, BlockKind>> = {
    paper: 'grass',
    purpur: 'diamond',
    vanilla: 'grass',
    fabric: 'sand',
    forge: 'planks',
    neoforge: 'planks',
    velocity: 'ice',
    bedrock: 'pumpkin',
    custom: 'stone',
  };
  const fallback = BLOCK_KINDS[hashString(id) % BLOCK_KINDS.length] ?? 'grass';
  return preferred[software] ?? fallback;
}

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];
const HAIR = ['#3b2414', '#6b3f1d', '#1f1a17', '#c9a24a', '#a8462a', '#4a4a52', '#e7d39a'];
const EYES = ['#2c5ea8', '#3f7d3a', '#5a3b22', '#2d2d2d'];

/** A made-up face for a player name, used while (or instead of) loading the real skin. */
export function playerFace(name: string): string {
  return paint(`face:${name}`, FACE_SIZE, (px) => {
    const r = rng(hashString(name));
    const skin = pick(r, SKIN);
    const hair = pick(r, HAIR);
    const eye = pick(r, EYES);
    const longHair = r() > HALF_FACE / FACE_SIZE;
    grid(FACE_SIZE).forEach(([x, y]) => {
      const side = x === 0 || x === FACE_SIZE - 1;
      const isHair =
        y < HAIR_ROWS ||
        (y === HAIR_ROWS && (side || r() > HAIR_CHANCE)) ||
        (longHair && side && y < LONG_HAIR_UNTIL);
      px(x, y, isHair ? hair : skin);
    });
    px(LEFT_EYE_X, EYE_ROW, '#ffffff');
    px(LEFT_PUPIL_X, EYE_ROW, eye);
    px(RIGHT_PUPIL_X, EYE_ROW, eye);
    px(RIGHT_EYE_X, EYE_ROW, '#ffffff');
    px(MOUTH_LEFT, MOUTH_ROW, '#7a3b2e');
    px(MOUTH_RIGHT, MOUTH_ROW, '#7a3b2e');
  });
}

/** A symmetric pixel emblem for a plugin without its own icon. */
export function emblem(name: string): string {
  return paint(`emblem:${name}`, FACE_SIZE, (px) => {
    const r = rng(hashString(name));
    const hue = hashString(name) % 360; // eslint-disable-line ts-patterns/no-magic-numbers -- degrees on the colour wheel
    grid(FACE_SIZE).forEach(([x, y]) => px(x, y, `hsl(${hue} 35% 22%)`));
    grid(FACE_SIZE)
      .filter(([x, y]) => x >= 1 && x < HALF_FACE && y >= 1 && y < FACE_SIZE - 1)
      .forEach(([x, y]) => {
        if (r() <= SYMMETRY_THRESHOLD) return;
        const color = `hsl(${hue} ${SATURATION_BASE + r() * SATURATION_SPAN}% ${LIGHTNESS_BASE + r() * LIGHTNESS_SPAN}%)`;
        px(x, y, color);
        px(FACE_SIZE - 1 - x, y, color);
      });
  });
}
