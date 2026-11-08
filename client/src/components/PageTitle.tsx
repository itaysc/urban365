import { useLocation } from 'react-router-dom';
import { useCanonical } from '@/hooks/useCanonical';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMetaDescription } from '@/hooks/useMetaDescription';
import { descriptionForPath } from '@/lib/metaDescription';
import { titleForPath } from '@/lib/pageTitle';

/**
 * Keeps the tab title in step with the route.
 *
 * Mounted once at the root rather than called from each page, so a page added later
 * gets a title by appearing in one table instead of by somebody remembering. The one
 * page whose title is not a function of its path — search — sets its own, and the
 * table returns null there so they do not overwrite each other.
 */
export function PageTitle() {
  const { pathname, search } = useLocation();
  useDocumentTitle(titleForPath(pathname));
  useMetaDescription(descriptionForPath(pathname));
  useCanonical(pathname, search);
  return null;
}
