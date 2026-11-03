import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { config } from '@/config';
import { enableRtlMapText } from '@/lib/rtlMapText';

/**
 * Close enough to pick a building out, and no closer than we have earned.
 *
 * The town figure was 13 at one point, which shows about five kilometres across — far
 * enough out that a click lands on whichever field is nearest, and the estimate then
 * either refuses or answers about somewhere else. At 15 the streets are separate and
 * the pin means something. The centre it opens on is a median of recorded sales, so
 * it is already inside the built-up area and the fields around it are no loss.
 *
 * A street has earned another notch and a half: we know the road, so the only thing
 * left to find is the building, and at 16.5 the buildings are individually visible.
 * Not more than that — the point we get back is one node on a road that may run two
 * kilometres, so zooming to a doorstep would be showing a precision we do not have
 * and could easily be the wrong end of the street.
 */
const ZOOM = { town: 15, street: 16.5 } as const;

interface Props {
  /**
   * Where the marker sits — the town's centre, or the street, or wherever it was last
   * dragged to.
   */
  pin: { latitude: number; longitude: number };
  /**
   * What the pin is pinned *to*. The map re-centres when this changes and not
   * otherwise, so that choosing a town or a street moves the map while dragging the
   * marker leaves it alone — re-centring on every coordinate change would pull the
   * ground out from under the person dragging.
   *
   * It has to change in the same render as {@link Props.pin}, which is why the parent
   * derives both rather than storing either. An earlier version took the town's centre
   * in a separate prop and flew to *that*: the key changed as soon as the town
   * resolved, a render before an effect had moved the pin, so the map flew to the
   * previous town's point and then never fired again.
   */
  centreKey: string;
  /** How much is known about where the pin is, which decides how close to open. */
  precision: keyof typeof ZOOM;
  onMove: (latitude: number, longitude: number) => void;
}

/**
 * Where the flat is, placed by the person who lives in it.
 *
 * The estimate is built from sales near a point, so the point has to be right — a
 * pin two streets away is a different market in a city, and the comparables it finds
 * are the wrong ones. There is no honest way to get that from a town name.
 *
 * It is a dragged pin rather than a geocoded address for two reasons. We have no
 * street-level coordinates of our own: `Street` holds names, not points, and the only
 * geocoder available is Nominatim, whose terms cover geocoding when something is
 * saved rather than on every page view. And the person filling this in knows exactly
 * which building is theirs, which no geocoder does.
 *
 * Opens at the town's centre, taken from the median of recorded sales there.
 */
export function PinMap({ centreKey, pin, precision, onMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const latest = useRef(onMove);
  latest.current = onMove;

  useEffect(() => {
    if (!container.current || map.current) return;

    enableRtlMapText();

    const instance = new maplibregl.Map({
      container: container.current,
      style: config.mapStyleUrl,
      center: [pin.longitude, pin.latitude],
      zoom: ZOOM[precision],
      // Lets an ordinary wheel scroll pass through to the page, as the listing map does.
      cooperativeGestures: true,
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    const dot = new maplibregl.Marker({ draggable: true, color: '#0f172a' })
      .setLngLat([pin.longitude, pin.latitude])
      .addTo(instance);

    dot.on('dragend', () => {
      const at = dot.getLngLat();
      latest.current(at.lat, at.lng);
    });

    /*
     * Tapping is the main gesture on a phone, where dragging a pin precisely is
     * genuinely hard. Both move the same pin, so there is nothing to learn.
     */
    instance.on('click', (event) => {
      dot.setLngLat(event.lngLat);
      latest.current(event.lngLat.lat, event.lngLat.lng);
    });

    map.current = instance;
    marker.current = dot;

    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once; the town change below moves it rather than rebuilding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Fly when what the pin is pinned to changes, and only then. `pin` is read rather
   * than listed as a dependency on purpose: the render that changes the key is the
   * same render that recomputes the pin, so this reads the new one — and listing it
   * would re-centre the map on every drag, which is the one thing it must not do.
   */
  useEffect(() => {
    if (!map.current || !marker.current) return;

    map.current.flyTo({ center: [pin.longitude, pin.latitude], zoom: ZOOM[precision] });
    marker.current.setLngLat([pin.longitude, pin.latitude]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey]);

  return (
    <div className="flex flex-col gap-1.5">
      {/*
        Tall on a wide screen, where the map has a column to itself: at 256px the
        buildings around the pin were a strip, and placing a pin is the one thing on
        this page that needs room to see. On a phone it stays short enough that the
        form below it is still visible.
      */}
      <div
        ref={container}
        className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 lg:h-[30rem]"
        // The pin carries the meaning, so the map is described rather than read out.
        role="application"
        aria-label="מפה לבחירת מיקום הנכס"
      />
      <p className="text-xs text-slate-500">
        גררו את הסמן לבניין שלכם, או הקישו על המפה. ככל שהמיקום מדויק יותר, העסקאות
        שנבחרו להשוואה קרובות יותר.
      </p>
    </div>
  );
}
