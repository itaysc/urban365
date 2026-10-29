import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config } from '@/config';
import { ListingPopupCard } from '@/components/map/ListingPopupCard';
import type { CityBoundary, MapPoint } from '@/services/search';

interface Props {
  points: MapPoint[];
  /** The searched area's outline, drawn beneath the pins. Null when none applies. */
  boundary?: CityBoundary | null;
  /** Called when a pin is clicked, so the page can open the same modal the cards do. */
  onSelect: (listingId: string) => void;
  /** Called when the user pans or zooms, so the page can refetch for the new viewport. */
  onViewportChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}

const SOURCE = 'listings';
const BOUNDARY_SOURCE = 'area';

/** Roughly Israel, for the first frame before any points arrive. */
const ISRAEL_CENTER: [number, number] = [34.85, 31.9];

/**
 * Prices are the label, so they have to be short: ₪1,625,000 does not fit in a pin.
 * 1.6M reads at a glance and is what a buyer is actually comparing.
 */
function shortPrice(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return String(value);
}

export function ListingsMap({ points, boundary, onSelect, onViewportChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  // Whether the sources and layers below exist yet. The data effects wait on this
  // rather than on `isStyleLoaded()`: that goes false again whenever the style has work
  // pending, and the obvious `once('load', …)` fallback never fires a second time, so a
  // boundary arriving after the first render was silently dropped.
  const [ready, setReady] = useState(false);

  // The pin whose card is open, held by id rather than by value so a refetch that
  // replaces every point object does not close it.
  const [activeId, setActiveId] = useState<string | null>(null);
  // MapLibre owns the positioning — anchoring, flipping near an edge and keeping the
  // card pinned to its coordinate through pan and zoom is work worth not redoing.
  const popup = useRef<Popup | null>(null);
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null);
  // Held in a ref so the map's own listeners always call the current one without the
  // map having to be rebuilt when the page re-renders.
  const handlers = useRef({ onSelect, onViewportChange });
  handlers.current = { onSelect, onViewportChange };

  // Built once. Points arrive through `setData` below, because tearing the map down on
  // every result change would reset the user's pan and zoom — which is the one thing a
  // map must not do while someone is reading it.
  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new maplibregl.Map({
      container: container.current,
      // OpenFreeMap: OpenStreetMap vector tiles, no account and no API key. Overridable
      // so a deployment can point at Mapbox or MapTiler with its own token instead.
      style: config.mapStyleUrl,
      center: ISRAEL_CENTER,
      zoom: 7,
      // The attribution is a licence condition of OSM data, not decoration.
      attributionControl: { compact: true },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    instance.on('load', () => {
      instance.addSource(SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        // Clustering in the browser: the server sends every pin once and MapLibre
        // regroups them as the user zooms, so panning costs no requests.
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 15,
      });

      instance.addSource(BOUNDARY_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // A wash and an outline, added before the pins so they sit on top of it. The
      // fill is faint on purpose: it should say which area is being searched without
      // competing with the listings for attention.
      instance.addLayer({
        id: 'area-fill',
        type: 'fill',
        source: BOUNDARY_SOURCE,
        paint: { 'fill-color': '#ea580c', 'fill-opacity': 0.1 },
      });

      instance.addLayer({
        id: 'area-line',
        type: 'line',
        source: BOUNDARY_SOURCE,
        paint: { 'line-color': '#ea580c', 'line-width': 2, 'line-opacity': 0.85 },
      });

      instance.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1.5,
          // Bigger groups get a bigger circle, so density reads without counting.
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
        },
      });

      instance.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['Noto Sans Bold'],
        },
        paint: { 'text-color': '#0f172a' },
      });

      instance.addLayer({
        id: 'points',
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ea580c',
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      instance.addLayer({
        id: 'point-price',
        type: 'symbol',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Noto Sans Bold'],
          'text-offset': [0, -1.4],
          // Rather than hiding a label that overlaps, which leaves a bare dot with no
          // price — the one thing the pin is for.
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // A card, not the full listing: clicking a pin on a map is a "what is this?",
      // and a modal over the map loses the place you were looking at. The card opens
      // the listing when it is clicked in turn.
      instance.on('click', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') setActiveId(id);
      });

      // Clicking the basemap dismisses it. Registered without a layer so it fires for
      // anything that is not a pin; the pin handler above runs first and sets the id
      // again, so clicking one pin while another's card is open just swaps them.
      instance.on('click', (e) => {
        const hits = instance.queryRenderedFeatures(e.point, { layers: ['points'] });
        if (hits.length === 0) setActiveId(null);
      });

      // Clicking a cluster zooms into it, which is what every map does and what people
      // therefore try first.
      instance.on('click', 'clusters', (e) => {
        const feature = e.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId === undefined) return;

        const source = instance.getSource(SOURCE) as GeoJSONSource;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          instance.easeTo({
            center: (feature!.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });
      });

      for (const layer of ['points', 'clusters']) {
        instance.on('mouseenter', layer, () => {
          instance.getCanvas().style.cursor = 'pointer';
        });
        instance.on('mouseleave', layer, () => {
          instance.getCanvas().style.cursor = '';
        });
      }

      instance.on('moveend', () => {
        const b = instance.getBounds();
        handlers.current.onViewportChange?.({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLng: b.getWest(),
          maxLng: b.getEast(),
        });
      });

      setReady(true);
    });

    map.current = instance;

    // MapLibre sizes its canvas once and does not watch the element. The map sits in a
    // responsive grid column, so anything that changes the column — a window resize,
    // the filter panel collapsing — left the canvas at its old size and the map blank
    // beside it until something else forced a redraw.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  // Points in, and the first batch frames the view — someone searching "חיפה" should
  // see Haifa, not the whole country.
  const framed = useRef(false);

  // The outline, which also takes over framing when there is one: the area asked for
  // is a better answer than the extent of whatever listings happen to be in it.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const source = instance.getSource(BOUNDARY_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;

    source.setData(
      boundary
        ? { type: 'Feature', geometry: boundary.geometry, properties: { name: boundary.name } }
        : { type: 'FeatureCollection', features: [] },
    );

    // With no area to frame by, hand framing back to the points: clearing the city
    // should refit to whatever is now on the map, not leave the last city's view.
    if (!boundary) {
      framed.current = false;
      return;
    }

    framed.current = true;
    instance.fitBounds(
      [
        [boundary.bounds.minLng, boundary.bounds.minLat],
        [boundary.bounds.maxLng, boundary.bounds.maxLat],
      ],
      { padding: 40, duration: 400 },
    );
  }, [boundary, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const source = instance.getSource(SOURCE) as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, label: shortPrice(p.price) },
      })),
    });

    if (framed.current || points.length === 0) return;
    framed.current = true;

    const bounds = points.reduce(
      (acc, p) => acc.extend([p.lng, p.lat]),
      new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]),
    );
    instance.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
  }, [points, ready]);

  const active = useMemo(() => points.find((p) => p.id === activeId) ?? null, [points, activeId]);

  // A point can vanish from under an open card — a filter change, or panning it out of
  // the viewport query. Closing is the honest response; leaving a card for a listing no
  // longer in the results is worse than losing your place.
  useEffect(() => {
    if (activeId && !active) setActiveId(null);
  }, [activeId, active]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    if (!active) {
      popup.current?.remove();
      popup.current = null;
      setPopupHost(null);
      return;
    }

    // React renders into this node through a portal, so the card keeps the router and
    // query context it needs — `setHTML` with a string would have neither.
    const host = document.createElement('div');

    const instancePopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      // The card draws its own surface; see `.listing-popup` in index.css, which strips
      // MapLibre's default padding, background and tip.
      className: 'listing-popup',
      maxWidth: 'none',
      offset: 14,
    })
      .setLngLat([active.lng, active.lat])
      .setDOMContent(host)
      .addTo(instance);

    popup.current = instancePopup;
    setPopupHost(host);

    return () => {
      instancePopup.remove();
      popup.current = null;
    };
  }, [active, ready]);

  return (
    // Short on a phone, where it sits above the list and should not take the whole
    // screen before a single card is visible; tall enough on a desktop to be worth
    // reading beside the results.
    <div className="relative h-[45vh] w-full overflow-hidden rounded-xl border border-slate-200 lg:h-[calc(100vh-2rem)]">
      <div ref={container} className="h-full w-full" />

      {active && popupHost && createPortal(
        <ListingPopupCard point={active} onOpen={(id) => handlers.current.onSelect(id)} />,
        popupHost,
      )}

      {points.length === 0 && (
        // A quiet line along the bottom rather than a card across the middle. With a city
        // chosen the map still has something to show — the outline — and covering it to
        // announce an empty result makes the map read as broken rather than as answered.
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <p className="rounded-full bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm ring-1 ring-slate-200">
            {boundary ? `אין כרגע נכסים ב${boundary.name}` : 'אין נכסים עם מיקום בתוצאות'}
          </p>
        </div>
      )}
    </div>
  );
}
