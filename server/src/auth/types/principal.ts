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
}

export interface AccessTokenClaims extends Principal {
  /** Reserved now so impersonation can ship later without re-cutting tokens. */
  isImpersonation?: boolean;
  impersonatedBy?: string;
}
