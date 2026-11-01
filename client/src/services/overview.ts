import { api } from '@/services/api';

export interface Overview {
  today: {
    viewingsToday: number;
    viewingsThisWeek: number;
    awaitingFeedback: number;
    openLeads: number;
    openSuggestions: number;
    coBrokerageWaiting: number;
  };
  listings: { published: number; draft: number; archived: number };
  pipeline: {
    stages: { stage: string; count: number; value: number; commission: number }[];
    openCount: number;
    openValue: number;
    openCommission: number;
    wonCount: number;
    wonCommission: number;
  };
  /** The last twelve weeks, empty ones included. */
  leadsByWeek: { key: string; count: number }[];
  /** The last six months, split into won and lost. */
  dealsByMonth: { key: string; won: number; lost: number; commission: number }[];
}

export async function fetchOverview(): Promise<Overview> {
  const { data } = await api.get<Overview>('/my/overview');
  return data;
}
