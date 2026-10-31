import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { DemoController } from './demo.controller.js';
import type { DemoService } from './demo.service.js';
import type { RequestContextService } from '../tenancy/request-context.service.js';

const service = {
  seed: vi.fn().mockResolvedValue({}),
  clear: vi.fn().mockResolvedValue({}),
  status: vi.fn().mockResolvedValue({ records: 0 }),
} as unknown as DemoService;

const context = (role: string | null) =>
  ({
    requireAgencyId: () => 'agency-1',
    getPrincipal: () => ({ userId: 'u1', agencyId: 'agency-1', role, platformRole: null }),
  }) as unknown as RequestContextService;

const config = (nodeEnv: string) =>
  ({ get: () => nodeEnv }) as unknown as ConfigService;

const principal = { userId: 'u1' } as never;

describe('DemoController', () => {
  it('refuses everything in production', () => {
    const controller = new DemoController(service, context('owner'), config('production'));

    expect(() => controller.status()).toThrow(ForbiddenException);
    expect(() => controller.seed(principal)).toThrow(ForbiddenException);
    expect(() => controller.clear()).toThrow(ForbiddenException);
  });

  it('refuses an agent even in development, because the clear deletes rows', () => {
    const controller = new DemoController(service, context('agent'), config('development'));

    expect(() => controller.clear()).toThrow(ForbiddenException);
  });

  it('lets an owner through in development', async () => {
    const controller = new DemoController(service, context('owner'), config('development'));

    await expect(controller.seed(principal)).resolves.toBeDefined();
    await expect(controller.clear()).resolves.toBeDefined();
  });
});
