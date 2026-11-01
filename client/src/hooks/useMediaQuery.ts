import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept in step as the window changes.
 *
 * For the handful of places where a breakpoint decides *which component* renders
 * rather than how one looks. CSS handles everything else and should: a class is
 * cheaper than a listener and cannot disagree with itself.
 *
 * `useSyncExternalStore` rather than an effect that sets state: the viewport is an
 * external store, which is exactly what this hook is for. The effect version renders
 * once with the wrong answer and then corrects itself, which is a flash of the other
 * layout on every mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  const get = useCallback(() => window.matchMedia(query).matches, [query]);

  // There is no server render here, but the API asks for the answer anyway. Narrow is
  // the safer default: a dialog on a wide screen is merely heavy, where an anchored
  // panel on a narrow one can hang off the edge.
  return useSyncExternalStore(subscribe, get, () => false);
}
