/** Runs work for the same key one after another (e.g. all installs on one server), different keys in parallel. */
export function createKeyedLock(): <TResult>(key: string, fn: () => Promise<TResult>) => Promise<TResult> {
  const locks = new Map<string, Promise<unknown>>();
  return async <TResult>(key: string, fn: () => Promise<TResult>): Promise<TResult> => {
    const previous = locks.get(key) ?? Promise.resolve();
    const run = (async () => {
      try {
        await previous;
      } catch {
        // The earlier operation already reported its own failure to its caller.
      }
      return fn();
    })();
    locks.set(key, run);
    try {
      return await run;
    } finally {
      if (locks.get(key) === run) locks.delete(key);
    }
  };
}
