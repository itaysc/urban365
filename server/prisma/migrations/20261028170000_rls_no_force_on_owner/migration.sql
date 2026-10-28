-- Drops FORCE ROW LEVEL SECURITY from every table.
--
-- The previous migration applied FORCE everywhere on the reasoning that "table owners
-- bypass RLS, so force it". That is true, but it is the wrong lever for this design.
--
-- The architecture has two roles on purpose:
--
--   * nadlan      — owns the tables. Used by auth, the admin moderation queue and the
--                   yad2 scraper: the queries that MUST cross agencies, or that touch
--                   User / Session / AuthToken / AgencyClaim, which are deliberately
--                   enabled-with-no-policy (total denial).
--   * nadlan_app  — NOBYPASSRLS, owns nothing. Every tenant-facing query.
--
-- RLS already applies in full to nadlan_app, because it is not the owner. FORCE changes
-- only what happens to the OWNER — and under it the owner was denied everything, with
-- `app.current_agency_id` unset and no policy on the auth tables. The effect was that
-- signup, login and the scraper could not write a single row:
--
--   ERROR: new row violates row-level security policy for table "User"
--
-- Nothing surfaced earlier only because the existing listings were scraped before the
-- policies were applied.
--
-- The isolation boundary is unchanged: it is nadlan_app, and it never had FORCE to lose.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
