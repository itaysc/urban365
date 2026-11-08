import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/**
 * What an address that matches nothing shows.
 *
 * Without this route the router paints its own screen — English, left to right, and
 * addressed to the person who built the app. A wrong link should look like the rest
 * of the site and say where to go next.
 */
export function NotFoundPage() {
  useDocumentTitle('הדף לא נמצא');

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <p className="text-7xl font-extrabold tracking-tight text-blue-700 sm:text-8xl" aria-hidden>
            4<span className="text-blue-500">0</span>4
          </p>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">הדף לא נמצא</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            הקישור לא מוביל לעמוד באתר. יכול להיות שהוא השתנה, או שהכתובת נכתבה עם טעות.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              לדף הבית
            </Link>
            <Link
              to="/search"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-900"
            >
              לחיפוש נכסים
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
