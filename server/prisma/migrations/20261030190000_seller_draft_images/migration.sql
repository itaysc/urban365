-- A private seller can see the photos on their own listing before it is published.
--
-- Images are served through the tenant client, where a private seller matches nothing:
-- `listingimage_public_read` wants a published listing and `listingimage_tenant_read`
-- compares an agency they do not have. Their own gallery therefore came back empty for
-- anything not yet live — which is exactly the state a listing is in while its photos
-- are still being uploaded.
--
-- Read only. Writing images still goes through the owner client in the seller service,
-- which scopes every call by `ownerUserId` itself.
CREATE POLICY listingimage_owner_read ON "ListingImage"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Listing" l
      WHERE l.id = "listingId" AND l."ownerUserId" = app_user_id()
    )
  );
