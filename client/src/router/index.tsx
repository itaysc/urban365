import { createBrowserRouter } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';

export const router = createBrowserRouter([
  // The agency, the page and the open listing all live in the URL, so any view —
  // including an open listing modal — can be linked to and survives a reload.
  { path: '/', element: <HomePage /> },
  { path: '/agency/:agencyId', element: <HomePage /> },
  // Search filters live in the query string too, so a filtered search is shareable.
  { path: '/search', element: <SearchPage /> },
]);
