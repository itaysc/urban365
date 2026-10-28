import axios from 'axios';
import { api } from '@/services/api';
import type {
  AgencyResult,
  JobErrorCode,
  JobStatus,
  ScrapeProgress,
  ScrapeResponse,
  Section,
} from '@/types/yad2';

/** Carries the server's error code so the UI can offer the right next step. */
export class ScrapeError extends Error {
  // A constructor parameter property would not survive `erasableSyntaxOnly`.
  readonly code: JobErrorCode;

  constructor(message: string, code: JobErrorCode) {
    super(message);
    this.name = 'ScrapeError';
    this.code = code;
  }
}

export interface CachedAgency {
  agencyId: string;
  section: Section;
  name: string;
  total: number;
  scrapedAt: string;
}

export async function listCachedAgencies(): Promise<CachedAgency[]> {
  const { data } = await withRetry(() => api.get<CachedAgency[]>('/yad2/agencies'));
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * True for "the API is not answering yet" — no response at all, or a gateway status from
 * the dev proxy. A 4xx is a real answer and must not be retried.
 */
function isTransient(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (!error.response) return true; // connection refused / reset / timeout
  return [502, 503, 504].includes(error.response.status);
}

/**
 * `nest start --watch` restarts the API on every server edit, and it takes a few seconds
 * to listen again. Riding over that keeps a page that is already open from flashing an
 * error for something that fixes itself.
 */
async function withRetry<T>(call: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await call();
    } catch (e) {
      if (!isTransient(e)) throw e;
      lastError = e;
      await sleep(600 * (i + 1));
    }
  }
  throw lastError;
}

async function startScrape(input: string, section: Section | undefined, refresh: boolean): Promise<ScrapeResponse> {
  const { data } = await withRetry(() => api.post<ScrapeResponse>('/yad2/agency', { input, section, refresh }));
  return data;
}

async function getJob(jobId: string): Promise<JobStatus> {
  const { data } = await withRetry(() => api.get<JobStatus>(`/yad2/jobs/${jobId}`));
  return data;
}

/**
 * Returns a cached agency straight away, otherwise polls the scrape job until it
 * finishes, reporting progress as it goes.
 */
export async function fetchAgency(
  input: string,
  options: { refresh?: boolean; section?: Section; onProgress?: (p: ScrapeProgress) => void } = {},
): Promise<AgencyResult> {
  const started = await startScrape(input, options.section, options.refresh ?? false);
  if (started.status === 'done' && started.result) return started.result;
  if (!started.jobId) throw new Error('The server did not start a scrape job.');

  for (;;) {
    await sleep(1000);
    const job = await getJob(started.jobId);
    options.onProgress?.(job.progress);

    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'error') {
      throw new ScrapeError(job.error ?? 'The scrape failed.', job.errorCode ?? 'SCRAPE_FAILED');
    }
  }
}

export type CsvKind = 'assets' | 'team' | 'agency';

/** Direct link to the server's CSV download, usable as an <a href>. */
export const csvUrl = (agencyId: string, section: Section, kind: CsvKind): string =>
  `${api.defaults.baseURL}/yad2/agency/${agencyId}/csv/${kind}?section=${section}`;
