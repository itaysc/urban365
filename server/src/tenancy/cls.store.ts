import type { ClsStore } from 'nestjs-cls';
import type { Principal } from '../auth/types/principal.js';

/** What travels with a request through AsyncLocalStorage. */
export interface TenantClsStore extends ClsStore {
  principal?: Principal;
  /** The agency every tenant query is scoped to. Absent on public routes. */
  agencyId?: string;
}
