// Runs of digits in a version name: "v5.5.71-bukkit" gives 5, 5, 71.
// https://regex101.com/?regex=%5Cd%2B&flags=g&testString=v5.5.71-bukkit
const DIGIT_RUNS = /\d+/g;

/** Version names compared by their numbers; only a really newer version counts as an update. */
export function compareVersionNames(a: string, b: string): number | null {
  const left = (a.match(DIGIT_RUNS) ?? []).map(Number);
  const right = (b.match(DIGIT_RUNS) ?? []).map(Number);
  if (!left.length || !right.length) return null;
  const length = Math.max(left.length, right.length);
  const diff = Array.from({ length }, (_, i) => (left[i] ?? 0) - (right[i] ?? 0)).find((d) => d !== 0);
  return diff ?? 0;
}
