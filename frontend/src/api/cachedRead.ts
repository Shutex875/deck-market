const CACHE_TTL_MS = 15_000;

export function createCachedRead<T>(load: () => Promise<T>) {
  let current: { promise: Promise<T>; expiresAt: number | null } | undefined;

  return {
    read(fresh = false): Promise<T> {
      if (current && (current.expiresAt === null || (!fresh && Date.now() < current.expiresAt))) {
        return current.promise;
      }

      const entry = { promise: load(), expiresAt: null as number | null };
      current = entry;
      entry.promise.then(
        () => { entry.expiresAt = Date.now() + CACHE_TTL_MS; },
        () => { if (current === entry) current = undefined; },
      );
      return entry.promise;
    },
    invalidate() {
      current = undefined;
    },
  };
}
