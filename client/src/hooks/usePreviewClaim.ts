import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgencyLookupResult } from '@/services/auth';
import { claimFromPreview, fetchAgencyPreview } from '@/services/preview';

/**
 * `?claim=<token>` from an office's preview link, turned into that office already picked.
 *
 * Returns the token so the Google button can carry it through the redirect. An office
 * that is already approved, or already waiting, is not offered again.
 */
export function usePreviewClaim(onClaim: (agency: AgencyLookupResult) => void): string | null {
  const [params] = useSearchParams();
  const token = params.get('claim');
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!token || handled.current === token) return;
    handled.current = token;
    void fetchAgencyPreview(token)
      .then((preview) => {
        if (!preview.live && !preview.pending) onClaim(claimFromPreview(preview));
      })
      .catch(() => undefined);
  }, [token, onClaim]);

  return token;
}
