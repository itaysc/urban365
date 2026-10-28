import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { fetchMyListings } from '@/services/agency';

interface Counts {
  published: number;
  draft: number;
  archived: number;
}

/**
 * Three counts, each from the listings endpoint with a status filter — a dedicated
 * stats route would be one more thing to keep in step for no gain at this size.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetchMyListings({ status: 'published', page: 1 }),
      fetchMyListings({ status: 'draft', page: 1 }),
      fetchMyListings({ status: 'archived', page: 1 }),
    ])
      .then(([published, draft, archived]) => {
        if (cancelled) return;
        setCounts({ published: published.total, draft: draft.total, archived: archived.total });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const cards: { label: string; value: number | null; to: string }[] = [
    { label: 'פורסמו', value: counts?.published ?? null, to: '/app/listings?status=published' },
    { label: 'טיוטות', value: counts?.draft ?? null, to: '/app/listings?status=draft' },
    { label: 'בארכיון', value: counts?.archived ?? null, to: '/app/listings?status=archived' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          שלום {user?.firstName}
        </h1>
        {user?.agency && <p className="text-sm text-slate-500">{user.agency.name}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-900"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {card.value === null ? '—' : card.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
