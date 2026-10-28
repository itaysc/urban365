-- Replaces the ListingImage policy, which did not isolate anything.
--
-- It read:
--
--   USING      (EXISTS (SELECT 1 FROM "Listing" l WHERE l.id = "listingId"))
--   WITH CHECK (EXISTS (SELECT 1 FROM "Listing" l WHERE l.id = "listingId"))
--
-- The intent was "inherit isolation through the parent row". The effect was the
-- opposite: the subquery only asks whether the parent is *visible*, and `Listing` has a
-- `listing_public_read` policy making every published row visible to everybody. So any
-- agency could read — and insert — images on any other agency's published listings:
--
--   set_config('app.current_agency_id', '<agency A>')
--   INSERT INTO "ListingImage" (..., "listingId") SELECT ... FROM "Listing"  -- B's row
--   INSERT 0 1
--
-- Phase 6 is about to start writing images through this table, so it is fixed first.
--
-- The parent's *ownership* is now what is checked, not its visibility. Reads are split
-- in two the way `Listing` itself is: a public policy for images of published listings,
-- so a visitor can see the gallery, and a tenant policy for everything else.
DROP POLICY IF EXISTS listingimage_via_listing ON "ListingImage";

CREATE POLICY listingimage_public_read ON "ListingImage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId" AND l.status = 'published' AND l."delistedAt" IS NULL
    )
  );

CREATE POLICY listingimage_tenant_read ON "ListingImage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId"
        AND (l."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );

CREATE POLICY listingimage_tenant_insert ON "ListingImage"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId"
        AND (l."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );

CREATE POLICY listingimage_tenant_update ON "ListingImage"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId"
        AND (l."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId"
        AND (l."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );

CREATE POLICY listingimage_tenant_delete ON "ListingImage"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId"
        AND (l."agencyId" = app_agency_id() OR app_is_platform_admin())
    )
  );
