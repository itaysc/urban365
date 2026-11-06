import { Link } from 'react-router-dom';

interface Crumb {
  label: string;
  to?: string;
}

/**
 * בית / נדל״ן / מתווכי נדל״ן, and the agency when one is open.
 *
 * The last crumb is the page itself, so it is not a link.
 */
export function AgencyBreadcrumbs({
  current,
  onCover = false,
}: {
  /** The agency name, on its own page. Absent on the directory. */
  current?: string;
  /** White, over the cover photograph. */
  onCover?: boolean;
}) {
  const crumbs: Crumb[] = [
    { label: 'בית', to: '/' },
    { label: 'נדל״ן', to: '/search' },
    { label: 'מתווכי נדל״ן', to: current ? '/agencies' : undefined },
  ];
  if (current) crumbs.push({ label: current });

  const link = onCover
    ? 'text-white/90 transition hover:text-white'
    : 'text-slate-500 transition hover:text-slate-900';
  const here = onCover ? 'text-white' : 'font-medium text-slate-900';
  const slash = onCover ? 'text-white/50' : 'text-slate-300';

  return (
    <nav aria-label="מיקום בעמוד">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className={slash}>
                /
              </span>
            )}
            {crumb.to ? (
              <Link to={crumb.to} className={link}>
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className={`truncate ${here}`}>
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
