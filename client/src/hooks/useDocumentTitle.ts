import { useEffect } from 'react';
import { documentTitle } from '@/lib/pageTitle';

/**
 * What the tab says while this component is mounted.
 *
 * An effect rather than a render-time assignment: setting `document.title` is a change
 * to something outside React, and doing it during render means it happens on a render
 * that gets thrown away too.
 *
 * Nothing is restored on unmount. Whatever mounts next sets its own, and a title that
 * reverted to the brand for a frame in between would flicker on every navigation.
 */
export function useDocumentTitle(pageTitle: string | null): void {
  useEffect(() => {
    document.title = documentTitle(pageTitle);
  }, [pageTitle]);
}
