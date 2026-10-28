import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from '../types/principal.js';

/** The principal the guard attached, or undefined on a @Public() route. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<Request & { principal?: Principal }>().principal,
);
