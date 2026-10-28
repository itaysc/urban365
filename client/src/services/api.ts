import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { config } from '@/config';

/**
 * The CSRF guard requires this header on every mutating request. A cross-site HTML form
 * cannot set it, which is what makes it a useful second line behind SameSite=Lax.
 */
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' } as const;

/**
 * The same base the axios client uses, for the places a link has to be followed by the
 * browser rather than fetched — the Google redirect, above all.
 */
export const apiBaseUrl = `${config.apiUrl}/api/v1`;

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

    /**
     * Only the calls that *establish* a session are excluded. Refreshing a failed
     * login or a failed refresh is how you get a loop.
     *
     * `/auth/me` is NOT one of them: it is an ordinary authenticated read, and the
     * blanket `/auth/` prefix used to exclude it. The effect was that once the access
     * token expired, reloading the page 401'd on /auth/me, no refresh was attempted,
     * and you were shown as logged out — with a valid refresh cookie sitting right
     * there. That is what "it doesn't remember me" was.
     */
    const SESSION_ROUTES = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/logout'];
    const isAuthCall = SESSION_ROUTES.some((route) => original?.url?.startsWith(route));

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
