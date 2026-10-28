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
    '%s has RLS enabled, forced, and at least one policy',
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
      // Without FORCE the table owner bypasses every policy, which is how an RLS
      // project passes all its tests and leaks anyway.
      expect(row.forced, `${table} does not FORCE row level security`).toBe(true);
      expect(Number(row.policies), `${table} has no policies`).toBeGreaterThan(0);
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
});
