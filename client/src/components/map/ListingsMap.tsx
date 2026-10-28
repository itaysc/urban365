import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config } from '@/config';
import { formatPrice } from '@/lib/format';
import type { MapPoint } from '@/services/search';

interface Props {
  points: MapPoint[];
  /** Called when a pin is clicked, so the page can open the same modal the cards do. */
  onSelect: (listingId: string) => void;
  /** Called when the user pans or zooms, so the page can refetch for the new viewport. */
  onViewportChange?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
}

const SOURCE = 'listings';

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

export function ListingsMap({ points, onSelect, onViewportChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
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

      instance.on('click', 'points', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === 'string') handlers.current.onSelect(id);
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
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // Points in, and the first batch frames the view — someone searching "חיפה" should
  // see Haifa, not the whole country.
  const framed = useRef(false);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
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
    };

    if (instance.isStyleLoaded()) apply();
    else instance.once('load', apply);
  }, [points]);

  return (
    // Short on a phone, where it sits above the list and should not take the whole
    // screen before a single card is visible; tall enough on a desktop to be worth
    // reading beside the results.
    <div className="relative h-[45vh] w-full overflow-hidden rounded-xl border border-slate-200 lg:h-[calc(100vh-2rem)]">
      <div ref={container} className="h-full w-full" />

      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-white/90 px-4 py-2 text-sm text-slate-600 shadow">
            אין נכסים עם מיקום באזור הזה.
          </p>
        </div>
      )}
    </div>
  );
}
