import type { AgencyRole, PlatformRole } from '@prisma/client';

/** Who is making the request, as carried in the access token. */
export interface Principal {
  userId: string;
  email: string;
  /** The active agency. Absent while a membership is still pending approval. */
  agencyId: string | null;
  role: AgencyRole | null;
  platformRole: PlatformRole | null;
  sessionEpoch: number;
  /** Present only while an admin is acting as this account. */
  isImpersonation?: boolean;
  /** The admin's own user id. The rest of the token is the account being used. */
  impersonatedBy?: string;
}

export interface AccessTokenClaims extends Principal {}
