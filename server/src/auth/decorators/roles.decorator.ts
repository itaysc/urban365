import { SetMetadata } from '@nestjs/common';
import type { AgencyRole } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';
export const PLATFORM_ADMIN_KEY = 'auth:platformAdmin';

/** Agency-level roles. Requires an active membership. */
export const Roles = (...roles: AgencyRole[]) => SetMetadata(ROLES_KEY, roles);

/** Platform staff only — entirely separate from any agency role. */
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
