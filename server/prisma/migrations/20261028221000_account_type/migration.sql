-- Whether an account is a consumer or agency staff, stated rather than inferred.
--
-- "Has an AgencyMembership" happens to be equivalent today, but it is not the same
-- claim: an agency invites a colleague who already had a buyer account, and suddenly the
-- inference flips for someone whose intent never changed. It also cannot be indexed or
-- counted, which "how many buyers signed up this week" needs.
CREATE TYPE "AccountType" AS ENUM ('buyer', 'agency');

-- `buyer` is the default for new rows, but every account that exists right now arrived
-- through the agency signup, so they are backfilled as agency before the default applies.
ALTER TABLE "User" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'agency';
ALTER TABLE "User" ALTER COLUMN "accountType" SET DEFAULT 'buyer';

CREATE INDEX "User_accountType_idx" ON "User" ("accountType");
