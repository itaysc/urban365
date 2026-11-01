import { useLocation } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
  const { pathname } = useLocation();
  useDocumentTitle(titleForPath(pathname));
  return null;
}
