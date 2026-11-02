import { useQuery } from '@tanstack/react-query';
import { api, apiBaseUrl } from '@/services/api';

/** Google's mark, inline — one more CDN script for one logo is a poor trade. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Whether the server has Google credentials. Exported so a page can hide the "or"
 * divider along with the button — a separator with nothing on one side of it looks
 * like something failed to load.
 *
 * It used to make exactly one attempt. A request that landed while the API was
 * restarting took the only one-click sign-in off the dialog, with nothing on screen to
 * say so — "hidden" is precisely what a correctly-configured absence looks like here,
 * so the failure is invisible rather than merely unfortunate. Reopening the dialog did
 * ask again, but nobody closes a sign-in box and opens it a second time to see whether
 * a different button appears.
 *
 * Three attempts, so one blip is survived without the user doing anything.
 *
 * A success is still cached for the session: whether a server has credentials is not
 * something that changes while somebody is signing in.
 */
export function useGoogleAvailable(): boolean {
  const { data } = useQuery({
    queryKey: ['auth', 'google', 'available'],
    queryFn: async () => {
      const { data } = await api.get<{ available: boolean }>('/auth/google/available');
      return data;
    },
    staleTime: Infinity,
    retry: 2,
  });

  return data?.available ?? false;
}

/**
 * Starts the server-side redirect flow — a plain link, not a fetch, because the browser
 * has to follow Google's redirect itself. Nothing about the session differs from an
 * email login once it comes back.
 *
 * Hidden entirely when the server has no Google credentials, rather than shown and
 * failing: a dead sign-in option is worse than none.
 */
export function GoogleButton({
  returnTo,
  label,
  disabled = false,
}: {
  returnTo?: string;
  label?: string;
  /** Used on signup, where the terms have to be agreed before an account can exist. */
  disabled?: boolean;
}) {
  const available = useGoogleAvailable();
  if (!available) return null;

  const href = `${apiBaseUrl}/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  // An anchor has no disabled state, so a disabled one stops being a link at all —
  // rather than looking inert while a middle-click still follows it.
  if (disabled) {
    return (
      <span
        aria-disabled
        className="flex cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500"
      >
        {label ?? 'המשך עם Google'}
      </span>
    );
  }

  return (
    <a
      href={href}
      className="flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 transition hover:border-slate-900"
    >
      <GoogleMark />
      {label ?? 'המשך עם Google'}
    </a>
  );
}
