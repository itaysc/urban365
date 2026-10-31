import { api } from '@/services/api';

export interface DemoSummary {
  customers: number;
  listings: number;
  leads: number;
  meetings: number;
  suggestions?: number;
}

/**
 * Demo data, in development only.
 *
 * The server refuses these in production whatever the client thinks, so a stale build
 * or a hand-rolled request cannot reach them. The `import.meta.env.DEV` check in the
 * panel is there to keep the button off a production screen, not to protect the route.
 */
export async function fetchDemoStatus(): Promise<{ records: number }> {
  const { data } = await api.get<{ records: number }>('/my/demo-data');
  return data;
}

export async function seedDemoData(): Promise<DemoSummary> {
  const { data } = await api.post<DemoSummary>('/my/demo-data');
  return data;
}

export async function clearDemoData(): Promise<DemoSummary> {
  const { data } = await api.delete<DemoSummary>('/my/demo-data');
  return data;
}
