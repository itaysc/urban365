import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { config } from '@/config';

/**
 * The CSRF guard requires this header on every mutating request. A cross-site HTML form
 * cannot set it, which is what makes it a useful second line behind SameSite=Lax.
 */
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const;

export const api = axios.create({
  baseURL: `${config.apiUrl}/api/v1`,
  withCredentials: true,
  headers: CSRF_HEADER,
});

/**
 * A second instance for the refresh call itself, so a failing refresh cannot recurse
 * back through the interceptor below.
 */
const refreshClient = axios.create({
  baseURL: `${config.apiUrl}/api/v1`,
  withCredentials: true,
  headers: CSRF_HEADER,
});

/**
 * Single-flight: a page that fires six requests at once gets six 401s, and without this
 * they would each trigger their own rotation — which the server treats as token reuse
 * and answers by killing the whole session family.
 */
let refreshPromise: Promise<boolean> | null = null;

export function tryRefresh(): Promise<boolean> {
  refreshPromise ??= refreshClient
    .post('/auth/refresh')
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/** Set by the auth provider so a dead session can clear app state exactly once. */
let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (fn: (() => void) | null) => {
  onSessionLost = fn;
};

let notifying = false;

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Never try to refresh a failing auth call — that is how you get a loop.
    const isAuthCall = original?.url?.startsWith('/auth/');

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;

      if (await tryRefresh()) return api(original);

      if (!notifying) {
        notifying = true;
        onSessionLost?.();
        setTimeout(() => {
          notifying = false;
        }, 1000);
      }
    }

    return Promise.reject(error);
  },
);
