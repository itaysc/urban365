/** Typed view of the client environment. Keep every `import.meta.env` read here. */
export const config = {
  /**
   * Empty in dev: requests go to /api and the Vite proxy forwards them to the
   * NestJS server. In production this is the deployed server origin.
   */
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  isDev: import.meta.env.DEV,
} as const;
