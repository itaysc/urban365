import { useLayoutEffect } from 'react';
import { canonicalHref, publicOrigin } from '@/lib/canonical';

/**
 * Puts `<link rel="canonical">` on the current route.
 *
 * The shell in `index.html` sets the same tag before React loads, from the address
 * the browser opened. This one runs on every navigation after that, because a
 * client-side move from `/search` to `/mortgage` does not reload the document and
 * would otherwise leave the previous page's canonical in place.
 */
export function useCanonical(pathname: string, search: string): void {
  useLayoutEffect(() => {
    const href = canonicalHref(pathname, search, publicOrigin(import.meta.env.VITE_APP_URL, window.location.origin));
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;
  }, [pathname, search]);
}
