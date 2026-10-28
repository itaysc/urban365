/** Typed view of the client environment. Keep every `import.meta.env` read here. */
export const config = {
  /**
   * Empty in dev: requests go to /api and the Vite proxy forwards them to the
   * NestJS server. In production this is the deployed server origin.
   */
  apiUrl: import.meta.env.VITE_API_URL ?? '',
  /**
   * OpenFreeMap by default: OpenStreetMap vector tiles with no account and no API key,
   * which is why it is the default rather than Mapbox. Point this at a Mapbox or
   * MapTiler style URL (with the key in it) to switch providers — nothing else changes.
   */
  mapStyleUrl: import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
  isDev: import.meta.env.DEV,
} as const;
