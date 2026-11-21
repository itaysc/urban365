import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { PriceCheck } from '@/lib/price-check';

/**
 * The sale line for the cards on this page.
 *
 * Fetched after the results, so a slow comparison never holds the list back. A page
 * with no sales still renders; the line simply does not appear.
 */
export function usePriceChecks(ids: string[]): Map<string, PriceCheck> {
  const key = [...new Set(ids)].sort().join(',');
  const [checks, setChecks] = useState<Map<string, PriceCheck>>(new Map());

  useEffect(() => {
    if (key === '') {
      setChecks(new Map());
      return;
    }

    let cancelled = false;
    api
      .get<{ items: PriceCheck[] }>('/listings/price-checks', { params: { ids: key } })
      .then((response) => {
        if (cancelled) return;
        const next = new Map<string, PriceCheck>();
        for (const item of response.data.items ?? []) next.set(item.id, item);
        setChecks(next);
      })
      .catch(() => {
        if (!cancelled) setChecks(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return checks;
}
