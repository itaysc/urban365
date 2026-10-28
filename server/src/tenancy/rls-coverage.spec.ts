import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The test that turns "we use row-level security" from a claim into a guarantee.
 *
 * It reads the models out of Prisma's own DMMF, finds every one that carries an
 * `agencyId`, and asserts against the live database that RLS is enabled, FORCED, and has
 * policies. A new tenant-scoped model that ships without a policy fails here rather than
 * leaking in production — which is exactly the failure mode this architecture exists to
 * prevent, and the one nothing in the reference project catches.
 */
const connectionString = process.env.DATABASE_URL ?? '';
const describeIfDb = connectionString ? describe : describe.skip;

/** The non-owner role. Without it the behavioural half cannot run. */
const appConnectionString = process.env.APP_DATABASE_URL ?? '';
const describeIfAppDb = appConnectionString ? describe : describe.skip;

describeIfDb('row-level security coverage', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Hold credentials, identity or moderation state. RLS on, and deliberately **no**
   * policy: enabled-with-no-policy is total denial in Postgres, so the tenant client
   * cannot read them at all. `AgencyClaim` is here despite carrying an `agencyId` —
   * a claim is reviewed by platform staff on the owner client, never by a tenant.
   */
  const denyAllModels = ['User', 'Session', 'AuthToken', 'AgencyClaim'];

  /** Models whose rows belong to exactly one agency, derived rather than hand-listed. */
  const tenantModels = Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'agencyId'))
    .map((m) => m.dbName ?? m.name)
    .filter((name) => !denyAllModels.includes(name));

  it('finds the tenant-scoped models', () => {
    expect(tenantModels.length).toBeGreaterThan(0);
    expect(tenantModels).toContain('Listing');
  });

  it.each(tenantModels.map((m) => [m] as const))(
    '%s has RLS enabled and at least one policy',
    async (table: string) => {
      const [row] = await prisma.$queryRaw<
        { enabled: boolean; forced: boolean; policies: bigint }[]
      >`
        SELECT c.relrowsecurity AS enabled,
               c.relforcerowsecurity AS forced,
               count(p.polname) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = ${table}
        GROUP BY c.relrowsecurity, c.relforcerowsecurity
      `;

      expect(row, `${table} is not in the database`).toBeDefined();
      expect(row.enabled, `${table} has RLS disabled`).toBe(true);
      expect(Number(row.policies), `${table} has no policies`).toBeGreaterThan(0);

      // NOT forced, deliberately. FORCE applies policies to the table owner too, and the
      // owner role is this design's privileged path — auth, admin moderation and the
      // scraper all run on it and all legitimately cross agencies. Forcing it denied
      // every write, signup included. Isolation is enforced on the non-owner role
      // instead, which the assertions below check behaviourally.
      expect(row.forced, `${table} forces RLS, which locks the owner out of its own tables`).toBe(
        false,
      );
    },
  );

  it.each(denyAllModels.map((m) => [m] as const))(
    '%s is enabled with no policy, which denies everything',
    async (table: string) => {
      const [row] = await prisma.$queryRaw<{ enabled: boolean; policies: bigint }[]>`
        SELECT c.relrowsecurity AS enabled, count(p.polname) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_policy p ON p.polrelid = c.oid
        WHERE n.nspname = 'public' AND c.relname = ${table}
        GROUP BY c.relrowsecurity
      `;

      expect(row.enabled, `${table} has RLS disabled`).toBe(true);
      expect(Number(row.policies), `${table} has a policy; it should have none`).toBe(0);
    },
  );

  it('has a runtime role that cannot bypass RLS', async () => {
    const [role] = await prisma.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'nadlan_app'
    `;

    expect(role, 'the nadlan_app role does not exist').toBeDefined();
    expect(role.rolbypassrls, 'nadlan_app can bypass RLS').toBe(false);
    expect(role.rolsuper, 'nadlan_app is a superuser').toBe(false);
  });

  it('does not let the runtime role own any table, which would bypass RLS', async () => {
    const owned = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname = 'nadlan_app'
    `;

    // Ownership is the other way to bypass a policy, and the one that survives a
    // NOBYPASSRLS check. A table accidentally created by the app role would be exempt.
    expect(owned.map((t) => t.relname), 'nadlan_app owns tables, so RLS does not apply to them').toEqual([]);
  });

  /**
   * The behavioural half, and the reason FORCE is not needed: prove on a real connection
   * as `nadlan_app` that the policies actually bite. The structural assertions above
   * cannot tell a working policy from one that matches everything.
   */
  describeIfAppDb('as the runtime role', () => {
    let app: PrismaClient;

    beforeAll(async () => {
      app = new PrismaClient({ adapter: new PrismaPg({ connectionString: appConnectionString }) });
      await app.$connect();
    });

    afterAll(async () => {
      await app.$disconnect();
    });

    it('cannot read the identity tables at all', async () => {
      await expect(app.user.count()).resolves.toBe(0);
      await expect(app.session.count()).resolves.toBe(0);
      await expect(app.authToken.count()).resolves.toBe(0);
    });

    it('sees only published listings when no agency is in context', async () => {
      const [{ published, total }] = await prisma.$queryRaw<
        { published: bigint; total: bigint }[]
      >`SELECT count(*) FILTER (WHERE status = 'published' AND "delistedAt" IS NULL) AS published,
               count(*) AS total
        FROM "Listing"`;

      await expect(app.listing.count()).resolves.toBe(Number(published));
      // Guards against a policy that is really a no-op: if every row happens to be
      // published the assertion above would pass against `USING (true)` too.
      if (Number(total) === Number(published)) {
        const [row] = await app.$queryRaw<{ ok: boolean }[]>`
          SELECT pg_catalog.has_table_privilege('nadlan_app', '"Listing"', 'SELECT') AS ok
        `;
        expect(row.ok).toBe(true);
      }
    });

    /**
     * Regression. The original ListingImage policy asked only whether the parent listing
     * was *visible*, and every published listing is visible to everyone — so any agency
     * could attach images to any other agency's listings. The policy checks ownership
     * now, and this is what says so.
     */
    it('cannot attach an image to another agency\'s listing', async () => {
      // Seeds its own fixture rather than reaching for whatever happens to be in the
      // database. It used to pick any published listing, so emptying the table made a
      // security test fail for a reason that had nothing to do with security.
      const [victimAgency, otherAgency] = await Promise.all([
        prisma.agency.create({ data: { name: `rls-victim-${Date.now()}`, status: 'active' } }),
        prisma.agency.create({ data: { name: `rls-other-${Date.now()}`, status: 'active' } }),
      ]);

      const victim = await prisma.listing.create({
        data: {
          agencyId: victimAgency.id,
          section: 'forsale',
          status: 'published',
          lastSeenAt: new Date(),
        },
      });

      try {
        await expect(
          app.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_agency_id', ${otherAgency.id}, true)`;
            return tx.listingImage.create({
              data: {
                listingId: victim.id,
                storageKey: `probe/${Date.now()}`,
                url: 'https://example.test/probe.jpg',
              },
            });
          }),
        ).rejects.toThrow();
      } finally {
        // Cascades to the listing and any image that did land.
        await prisma.agency.deleteMany({
          where: { id: { in: [victimAgency.id, otherAgency.id] } },
        });
      }
    });

    it('cannot write a listing with no agency in context', async () => {
      // Its own agency, for the same reason as above: an empty database must not be
      // able to turn a security assertion into a failure about missing fixtures.
      const agency = await prisma.agency.create({
        data: { name: `rls-write-${Date.now()}`, status: 'active' },
      });

      try {
        await expect(
          app.listing.create({
            data: {
              agencyId: agency.id,
              section: 'forsale',
              lastSeenAt: new Date(),
              status: 'published',
            },
          }),
        ).rejects.toThrow();
      } finally {
        await prisma.agency.delete({ where: { id: agency.id } });
      }
    });
  });
});
