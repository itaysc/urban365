import { describe, expect, it, vi } from 'vitest';
import { ClsService } from 'nestjs-cls';
import type { Principal } from '../auth/types/principal.js';
import { TENANT_TX } from './tenant-prisma.service.js';
import { TenantScope } from './tenant-scope.js';

describe('TenantScope', () => {
  const principal: Principal = {
    userId: 'user-1',
    email: 'a@b.co',
    agencyId: 'agency-1',
    role: 'owner',
    platformRole: 'admin',
    sessionEpoch: 1,
  };

  it('sets the four configs and turns the admin flag off for an agent call', async () => {
    const set = vi.fn();
    const configs: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        configs.push(`${strings.join('?')}|${values.join(',')}`);
      }),
    };
    const cls = {
      run: async (work: () => Promise<unknown>) => work(),
      set,
    } as unknown as ClsService;
    const prisma = {
      root: {
        $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      },
    };

    const scope = new TenantScope(cls, prisma as never);
    const result = await scope.run(principal, async () => 'ok', { asAgent: true });

    expect(result).toBe('ok');
    expect(set).toHaveBeenCalledWith('principal', principal);
    expect(set).toHaveBeenCalledWith('agencyId', 'agency-1');
    expect(set).toHaveBeenCalledWith(TENANT_TX, tx);
    expect(configs.some((row) => row.includes('app.is_platform_admin') && row.endsWith('|off'))).toBe(true);
    expect(configs.some((row) => row.includes('app.current_agency_id') && row.endsWith('|agency-1'))).toBe(true);
  });

  it('keeps the admin flag on for an ordinary request', async () => {
    const configs: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        configs.push(`${strings.join('?')}|${values.join(',')}`);
      }),
    };
    const cls = {
      run: async (work: () => Promise<unknown>) => work(),
      set: vi.fn(),
    } as unknown as ClsService;
    const prisma = {
      root: {
        $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      },
    };

    await new TenantScope(cls, prisma as never).run(principal, async () => undefined);

    expect(configs.some((row) => row.includes('app.is_platform_admin') && row.endsWith('|on'))).toBe(true);
  });
});
