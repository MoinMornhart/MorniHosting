/** Small pixel-art faces for players, drawn on a canvas (Minecraft skins are pixel art, so they stay that way). */

type Rng = () => number;

const MULBERRY_INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_A = 61;
const UINT32 = 4294967296;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const FACE_SIZE = 8;
const HALF_FACE = 4;
const EYE_ROW = 4;
const MOUTH_ROW = 6;
const HAIR_ROWS = 2;
const LONG_HAIR_UNTIL = 6;
const HAIR_CHANCE = 0.7;
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

const pick = (r: Rng, list: readonly string[]): string =>
  list[Math.floor(r() * list.length)] ?? list[0] ?? '#000';

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
