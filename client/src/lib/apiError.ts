import { AxiosError } from 'axios';

interface ApiErrorBody {
  message?: string | string[];
  code?: string;
  error?: string;
}

/** The server's machine-readable code, when it sent one. */
export function errorCodeOf(error: unknown): string | null {
  if (!(error instanceof AxiosError)) return null;
  return (error.response?.data as ApiErrorBody | undefined)?.code ?? null;
}

/** The HTTP status, when the request reached a server at all. */
export function statusOf(error: unknown): number | null {
  if (!(error instanceof AxiosError)) return null;
  return error.response?.status ?? null;
}

/**
 * class-validator returns `message` as an array of per-field strings; everything else
 * sends a single string.
 */
export function errorMessageOf(error: unknown, fallback: string): string {
  if (!(error instanceof AxiosError)) return fallback;

  const message = (error.response?.data as ApiErrorBody | undefined)?.message;
  if (Array.isArray(message)) return message.join('. ');
  return message || fallback;
}
