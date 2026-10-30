import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { config } from '@/config';
import { enableRtlMapText } from '@/lib/rtlMapText';

interface Props {
  latitude: number;
  longitude: number;
  /** Shown under the map, and used to say how precise the pin is. */
  street: string | null;
  houseNumber: number | null;
  city: string | null;
}

/**
 * Where the listing is, on the listing itself.
 *
 * Not interactive. Someone reading a listing wants to know where it is, not to go
 * exploring — the search page is where panning belongs. Dragging is off so that a
 * scroll down the modal does not get swallowed by the map on the way past, which is the
 * usual complaint about an embedded one.
 *
 * Zoom follows precision rather than being fixed. An address with a house number is a
 * building; one with only a street is a street, and a pin dropped at street level and
 * shown at building zoom claims an accuracy nobody has.
 */
export function LocationMap({ latitude, longitude, street, houseNumber, city }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  const exact = houseNumber !== null;

  useEffect(() => {
    if (!container.current || map.current) return;

    enableRtlMapText();

    const instance = new maplibregl.Map({
      container: container.current,
      style: config.mapStyleUrl,
      center: [longitude, latitude],
      zoom: exact ? 16 : 14.5,
      interactive: false,
      attributionControl: { compact: true },
    });

    new maplibregl.Marker({ color: '#ea580c' })
      .setLngLat([longitude, latitude])
      .addTo(instance);

    map.current = instance;

    // Sized once, like any other map in a responsive column.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [latitude, longitude, exact]);

  const address = [[street, houseNumber].filter(Boolean).join(' '), city].filter(Boolean).join(', ');

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-slate-900">מיקום</h3>

      <div className="h-56 w-full overflow-hidden rounded-xl border border-slate-200">
        <div ref={container} className="h-full w-full" />
      </div>

      <p className="text-xs text-slate-500">
        {address}
        {!exact && ' · המיקום מוצג ברמת הרחוב'}
      </p>
    </section>
  );
}
