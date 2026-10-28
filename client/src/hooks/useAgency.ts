import { useCallback, useRef, useState } from 'react';
import { ScrapeError, fetchAgency } from '@/services/yad2';
import type { AgencyResult, JobErrorCode, ScrapeProgress, Section } from '@/types/yad2';

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  result: AgencyResult | null;
  progress: ScrapeProgress | null;
  error: string | null;
  errorCode: JobErrorCode | null;
}

const IDLE: State = { status: 'idle', result: null, progress: null, error: null, errorCode: null };

export function useAgency() {
  const [state, setState] = useState<State>(IDLE);
  // Only the newest load may write to state, so a fast back/forward does not let an
  // older response overwrite a newer one.
  const runId = useRef(0);

  const load = useCallback(async (agencyId: string, section: Section, refresh = false) => {
    const id = ++runId.current;
    setState({ status: 'loading', result: null, progress: null, error: null, errorCode: null });

    try {
      const result = await fetchAgency(agencyId, {
        refresh,
        section,
        onProgress: (progress) =>
          setState((s) => (id === runId.current && s.status === 'loading' ? { ...s, progress } : s)),
      });
      if (id === runId.current) {
        setState({ status: 'done', result, progress: null, error: null, errorCode: null });
      }
    } catch (e) {
      if (id === runId.current) {
        setState({
          status: 'error',
          result: null,
          progress: null,
          error: e instanceof Error ? e.message : String(e),
          errorCode: e instanceof ScrapeError ? e.code : 'SCRAPE_FAILED',
        });
      }
    }
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setState(IDLE);
  }, []);

  return { ...state, load, reset };
}
