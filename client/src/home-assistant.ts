/**
 * The assistant on the server-rendered front door.
 *
 * That page is not the app, so this is a second entry rather than the router.
 * Waiting here holds the page's load until the panel is mounted, and a failure
 * is written onto the mount instead of disappearing.
 */
const host = document.getElementById('u365-assistant');
if (host) {
  try {
    await import('./home-assistant-app.tsx');
  } catch (error) {
    host.dataset.error = error instanceof Error ? error.message : 'assistant failed';
  }
}
