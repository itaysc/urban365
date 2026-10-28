-- Row-level security.
--
-- This is the boundary for tenant isolation. A filter someone forgets in a handler, or
-- inside an `include`, or in raw SQL, cannot leak across agencies — the database refuses.
--
-- Three things have to be true or this silently does nothing:
--   1. The runtime role must NOT own the tables. Owners bypass RLS.
--   2. FORCE ROW LEVEL SECURITY, so policies apply even to the owner.
--   3. The app must connect as that role (APP_DATABASE_URL), not as the owner.

-- ── the runtime role ────────────────────────────────────────────────────────────
-- Created idempotently so this migration is safe to re-run and safe on a fresh database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nadlan_app') THEN
    CREATE ROLE nadlan_app LOGIN PASSWORD 'nadlan_app' NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO nadlan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nadlan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nadlan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nadlan_app;

-- ── context helpers ─────────────────────────────────────────────────────────────
-- `true` as the second argument to current_setting means "return NULL if unset" rather
-- than raising, so an unscoped connection reads as NULL and matches nothing.
CREATE OR REPLACE FUNCTION app_agency_id() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_agency_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.is_platform_admin', true), 'off') = 'on' $$;

-- ── tenant-scoped tables ────────────────────────────────────────────────────────
-- Each gets four separate policies rather than one FOR ALL: with a second permissive
-- SELECT policy in play (the public read below), FOR ALL makes the UPDATE/DELETE
-- visibility rules subtle, and this needs to be obvious.

-- Listing: published rows are readable by anyone; everything else is tenant-only.
ALTER TABLE "Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Listing" FORCE  ROW LEVEL SECURITY;

CREATE POLICY listing_public_read ON "Listing"
  FOR SELECT USING (status = 'published' AND "delistedAt" IS NULL);
CREATE POLICY listing_tenant_read ON "Listing"
  FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY listing_tenant_insert ON "Listing"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY listing_tenant_update ON "Listing"
  FOR UPDATE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin())
             WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY listing_tenant_delete ON "Listing"
  FOR DELETE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin());

-- Broker: the team strip is shown on the public agency page.
ALTER TABLE "Broker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Broker" FORCE  ROW LEVEL SECURITY;
CREATE POLICY broker_public_read ON "Broker" FOR SELECT USING (true);
CREATE POLICY broker_tenant_insert ON "Broker"
  FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY broker_tenant_update ON "Broker"
  FOR UPDATE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin())
             WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin());
CREATE POLICY broker_tenant_delete ON "Broker"
  FOR DELETE USING      ("agencyId" = app_agency_id() OR app_is_platform_admin());

-- ListingImage, Lead, Deal, AgencyMembership, AgencyInvite, ScrapeRun: tenant-only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ScrapeRun','AgencyMembership','AgencyInvite','Lead','Deal']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ("agencyId" = app_agency_id() OR app_is_platform_admin())',
      lower(t) || '_tenant_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin())',
      lower(t) || '_tenant_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING ("agencyId" = app_agency_id() OR app_is_platform_admin()) WITH CHECK ("agencyId" = app_agency_id() OR app_is_platform_admin())',
      lower(t) || '_tenant_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING ("agencyId" = app_agency_id() OR app_is_platform_admin())',
      lower(t) || '_tenant_delete', t);
  END LOOP;
END
$$;

-- ListingImage hangs off Listing rather than carrying its own agencyId, so it inherits
-- through the parent row — which is itself policed above.
ALTER TABLE "ListingImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingImage" FORCE  ROW LEVEL SECURITY;
CREATE POLICY listingimage_via_listing ON "ListingImage"
  USING (EXISTS (SELECT 1 FROM "Listing" l WHERE l.id = "listingId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "Listing" l WHERE l.id = "listingId"));

-- Agency: names are public data and the search joins them, so reads are open. Writes
-- are limited to your own agency.
ALTER TABLE "Agency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agency" FORCE  ROW LEVEL SECURITY;
CREATE POLICY agency_public_read ON "Agency" FOR SELECT USING (true);
CREATE POLICY agency_tenant_insert ON "Agency"
  FOR INSERT WITH CHECK (app_is_platform_admin());
CREATE POLICY agency_tenant_update ON "Agency"
  FOR UPDATE USING      (id = app_agency_id() OR app_is_platform_admin())
             WITH CHECK (id = app_agency_id() OR app_is_platform_admin());
CREATE POLICY agency_tenant_delete ON "Agency"
  FOR DELETE USING      (app_is_platform_admin());

-- ── tables the tenant client must never touch ───────────────────────────────────
-- RLS enabled with no permissive policy is total denial in Postgres. These hold
-- credentials and identity, and the tenant role has no business reading them at all.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Session','AuthToken','AgencyClaim']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
