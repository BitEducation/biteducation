/** A tiny observable store: get, set(patch) and subscribe(selector, fn). */

export interface Store<S extends object> {
  get(): S;
  set(patch: Partial<S>): void;
  subscribe<T>(select: (s: S) => T, fn: (value: T, state: S) => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<{ select: (s: S) => unknown; last: unknown; fn: (v: unknown, s: S) => void }>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const sub of [...subs]) {
        const next = sub.select(state);
        if (!Object.is(next, sub.last)) {
          sub.last = next;
          sub.fn(next, state);
        }
      }
    },
    subscribe(select, fn) {
      const sub = {
        select: select as (s: S) => unknown,
        last: select(state) as unknown,
        fn: fn as (v: unknown, s: S) => void,
      };
      subs.add(sub);
      return () => subs.delete(sub);
    },
  };
}
