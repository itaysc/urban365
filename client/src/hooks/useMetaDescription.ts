import { useLayoutEffect } from 'react';

/**
 * Sets `<meta name="description">`, and the same words on the share card.
 *
 * Null removes the tag. Leaving the previous page's sentence in place would make
 * `/mortgage` describe itself as the homepage the moment someone navigates.
 */
export function useMetaDescription(description: string | null): void {
  useLayoutEffect(() => {
    const current = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      current?.remove();
      return;
    }

    const meta = current ?? document.head.appendChild(document.createElement('meta'));
    meta.name = 'description';
    meta.content = description;

    document
      .querySelector<HTMLMetaElement>('meta[property="og:description"]')
      ?.setAttribute('content', description);
  }, [description]);
}
