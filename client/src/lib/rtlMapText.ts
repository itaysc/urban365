import maplibregl from 'maplibre-gl';
// Vite emits the file as an asset and hands back its URL. Served from our own origin
// rather than a CDN: it is a script MapLibre runs inside a worker, the privacy policy
// says we do not hand visitors to third parties we do not need, and a map whose labels
// depend on unpkg being up is a map that breaks for reasons nobody can see.
//
// Reached by file path rather than by package name because the package exports only its
// own entry point, and the file MapLibre wants is the built script beside it.
import rtlPluginUrl from '../../node_modules/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js?url';

/**
 * Teaches MapLibre to lay out Hebrew and Arabic labels.
 *
 * Without it, `ראשון לציון` is drawn in logical order — the order the characters are
 * typed — which on screen reads `ויצל ןושאר`. The plugin applies the bidirectional
 * algorithm and hands back visual order. Every place name on an Israeli map needs it.
 *
 * Registered eagerly rather than lazily. Lazy loading defers the download until RTL
 * text is first encountered, which here is the first frame, so all it buys is a flash
 * of backwards labels.
 */
export function enableRtlMapText(): void {
  // Calling this twice throws, and in development a hot reload re-runs module code. The
  // state is MapLibre's own, so it is the thing worth asking.
  const state = maplibregl.getRTLTextPluginStatus();
  if (state !== 'unavailable') return;

  void maplibregl.setRTLTextPlugin(rtlPluginUrl, false).catch(() => {
    // A map with backwards labels is still a usable map; a map that failed to load
    // because a text plugin did not is not. Nothing here should be fatal.
  });
}
