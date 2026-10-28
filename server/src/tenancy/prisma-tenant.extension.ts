import { Prisma } from '@prisma/client';

/**
 * Models whose rows belong to exactly one agency.
 *
 * Reads are policed by row-level security in the database. This extension does one
 * narrow job — filling in `agencyId` on writes — so a handler can call
 * `listing.create({ data })` without repeating the tenant on every call and without
 * hitting an opaque "new row violates row-level security policy".
 *
 * It deliberately does **not** touch reads. A query extension never fires for nested
 * reads inside an `include`, so pretending it covers reads would be the dangerous kind
 * of half-measure. Reads are RLS's job, and only RLS's.
 */
export const TENANT_MODELS = new Set([
  'Listing',
  'Broker',
  'ScrapeRun',
  'AgencyMembership',
  'AgencyInvite',
  'ListingImage',
  'Lead',
  'Deal',
]);

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

const withAgency = (data: unknown, agencyId: string): unknown => {
  if (Array.isArray(data)) return data.map((d) => ({ agencyId, ...(d as object) }));
  return { agencyId, ...(data as object) };
};

export function tenantExtension(getAgencyId: () => string | undefined) {
  return Prisma.defineExtension({
    name: 'tenant-write-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model) || !WRITES.has(operation)) return query(args);

          const agencyId = getAgencyId();
          // No agency in context means a privileged path (the scraper, a seed). Those
          // use the owner client; if one reaches here, RLS will refuse the write rather
          // than letting it land under the wrong tenant.
          if (!agencyId) return query(args);

          const next = args as Record<string, unknown>;
          if (operation === 'upsert') {
            if (next.create) next.create = withAgency(next.create, agencyId);
          } else if (next.data) {
            next.data = withAgency(next.data, agencyId);
          }

          return query(next);
        },
      },
    },
  });
}
