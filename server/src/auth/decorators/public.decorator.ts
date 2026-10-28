import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * The global guard makes authentication the default. Anything reachable without a login
 * has to say so, which means a new route is private unless someone thought about it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
