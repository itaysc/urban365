import type { ListingStatus } from '@/services/agency';
import type { LeadStatus } from '@/services/crm';
import type { SearchFilters } from '@/types/search';

/**
 * Every query key in one place.
 *
 * Not a style preference: invalidation matches keys by prefix, so a key typed inline at
 * the call site is a key that can silently stop matching the one a mutation invalidates.
 * The failure is invisible — no error, just stale data — which is exactly the class of
 * bug this migration exists to remove.
 *
 * Keys are arrays ordered general → specific, so `invalidateQueries({ queryKey: qk.listings.all })`
 * reaches every list and detail beneath it.
 */
export const qk = {
  me: ['me'] as const,

  listings: {
    all: ['listings'] as const,
    mine: (status: ListingStatus, page: number) => ['listings', 'mine', status, page] as const,
    detail: (id: string) => ['listings', 'detail', id] as const,
    search: (filters: SearchFilters) => ['listings', 'search', filters] as const,
    suggest: (term: string, section: string | undefined) =>
      ['listings', 'suggest', term, section ?? 'any'] as const,
    public: (id: string) => ['listings', 'public', id] as const,
  },

  saved: {
    all: ['saved'] as const,
    list: ['saved', 'list'] as const,
    count: ['saved', 'count'] as const,
    among: (ids: string[]) => ['saved', 'among', [...ids].sort().join(',')] as const,
  },

  offices: {
    all: ['offices'] as const,
    list: ['offices', 'list'] as const,
  },

  mySale: {
    all: ['my-sale'] as const,
    list: ['my-sale', 'list'] as const,
    detail: (id: string) => ['my-sale', 'detail', id] as const,
    stats: ['my-sale', 'stats'] as const,
  },

  leads: {
    all: ['leads'] as const,
    list: (status: LeadStatus | undefined, page: number) => ['leads', 'list', status ?? 'any', page] as const,
    counts: ['leads', 'counts'] as const,
  },

  deals: {
    all: ['deals'] as const,
    board: ['deals', 'board'] as const,
  },

  team: {
    all: ['team'] as const,
    list: ['team', 'list'] as const,
  },

  agency: {
    all: ['agency'] as const,
    profile: ['agency', 'profile'] as const,
  },

  admin: {
    all: ['admin'] as const,
    moderation: ['admin', 'moderation'] as const,
  },

  invite: (token: string) => ['invite', token] as const,
} as const;
