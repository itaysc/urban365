/**
 * Israel TM Grid (EPSG:2039) → WGS84.
 *
 * The cadastral parcels layer is published in ITM, not in degrees — its `.prj` reads
 * `PROJCS["Israel_TM_Grid" … PROJECTION["Transverse_Mercator"]]` with the constants
 * below. Everything else in this database is WGS84 (city boundaries, listing
 * coordinates), so parcels are converted once at import and one coordinate system
 * leaves the importer. Converting on read instead would mean every bounding box and
 * every grid cell lived in a second system that nothing else understands.
 *
 * Only the inverse is here. Nothing needs to go the other way: the query point
 * arrives in WGS84 from the geocoder and the stored geometry is already in WGS84.
 *
 * Taken from the `.prj` rather than from memory — the false easting and northing in
 * particular are the kind of number that is nearly right in a blog post and lands you
 * a few hundred metres into the sea.
 *
 * **Two steps, not one.** Un-projecting the grid gives coordinates on the Israel 1993
 * datum, which is not WGS84: the two differ by a translation of about ninety metres,
 * and skipping it lands every parcel some seventy metres from where it belongs. That
 * is not far enough to look wrong — the point is still in the right street — and far
 * enough to pick the wrong parcel every time, which is the worst kind of error this
 * code could make. It was caught by checking a converted parcel against GovMap's own
 * polygon for the same gush and chelka; the first version passed its origin test and
 * was out by 41 m north and 66 m east in Holon, and the three-parameter fix still
 * left 7 m of it.
 */

const A = 6_378_137.0;
const INVERSE_FLATTENING = 298.257_222_101;
const K0 = 1.000_0067;
const FALSE_EASTING = 219_529.584;
const FALSE_NORTHING = 626_907.39;
const LAT_ORIGIN = (31.734_393_611_111_11 * Math.PI) / 180;
const LON_ORIGIN = (35.204_516_944_444_45 * Math.PI) / 180;

const F = 1 / INVERSE_FLATTENING;
const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);

/** Meridional arc from the equator to `lat`. */
function meridian(lat: number): number {
  return (
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * lat -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * lat))
  );
}

const M0 = meridian(LAT_ORIGIN);

/**
 * Israel 1993 → WGS84: EPSG:9676, "Israel 1993 to WGS 84 (2)", position-vector
 * convention.
 *
 * Seven parameters, not three. EPSG also publishes a three-parameter version
 * (code 1073, −48/55/52) whose own remark says to contact the Survey of Israel for
 * anything more accurate — and it shows: with that one a Holon parcel converted
 * about 7 m north-east of where GovMap puts the same gush and chelka, which is a
 * systematic bias, and a systematic bias always picks the same wrong neighbour.
 * These parameters bring it inside a metre.
 */
const SHIFT = { x: 23.772, y: 17.49, z: 17.859 };
/** Rotations are published in arc-seconds. */
const ARCSEC = Math.PI / 180 / 3600;
const ROTATION = { x: -0.3132 * ARCSEC, y: -1.85274 * ARCSEC, z: 1.67299 * ARCSEC };
const SCALE = 1 + -5.4262e-6;

/** Both datums use GRS80's dimensions, so one ellipsoid serves for the round trip. */
function datumShift(lat: number, lon: number): { lat: number; lon: number } {
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = A / Math.sqrt(1 - E2 * sinLat ** 2);

  // Geodetic to geocentric, at height zero: the parcels are a flat cadastral layer,
  // and a height we do not have would add error rather than remove it.
  const x = n * cosLat * Math.cos(lon);
  const y = n * cosLat * Math.sin(lon);
  const z = n * (1 - E2) * sinLat;

  // Position vector: the rotations turn the point, not the frame. The two conventions
  // differ only in the sign of the three angles, which is a 10 m mistake here and
  // exactly why the convention is named in the comment above.
  const xs = SHIFT.x + SCALE * (x - ROTATION.z * y + ROTATION.y * z);
  const ys = SHIFT.y + SCALE * (ROTATION.z * x + y - ROTATION.x * z);
  const zs = SHIFT.z + SCALE * (-ROTATION.y * x + ROTATION.x * y + z);

  // And back, by the usual iteration — four passes is far past convergence here.
  const p = Math.hypot(xs, ys);
  let shifted = Math.atan2(zs, p * (1 - E2));
  for (let i = 0; i < 4; i += 1) {
    const sinShifted = Math.sin(shifted);
    const nn = A / Math.sqrt(1 - E2 * sinShifted ** 2);
    shifted = Math.atan2(zs + E2 * nn * sinShifted, p);
  }

  return { lat: shifted, lon: Math.atan2(ys, xs) };
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * The standard inverse transverse Mercator series (Snyder), to about a millimetre
 * over Israel — far below the metre or so by which the Israel 1993 datum and WGS84
 * differ, and far below the tens of metres a geocoded address is out by anyway.
 */
export function itmToWgs84(easting: number, northing: number): LatLng {
  const m = M0 + (northing - FALSE_NORTHING) / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));

  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const lat1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(lat1);
  const cos1 = Math.cos(lat1);
  const tan1 = Math.tan(lat1);

  const c1 = EP2 * cos1 ** 2;
  const t1 = tan1 ** 2;
  const n1 = A / Math.sqrt(1 - E2 * sin1 ** 2);
  const r1 = (A * (1 - E2)) / (1 - E2 * sin1 ** 2) ** 1.5;
  const d = (easting - FALSE_EASTING) / (n1 * K0);

  const lat =
    lat1 -
    ((n1 * tan1) / r1) *
      ((d ** 2) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720);

  const lon =
    LON_ORIGIN +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cos1;

  const wgs = datumShift(lat, lon);
  return { latitude: (wgs.lat * 180) / Math.PI, longitude: (wgs.lon * 180) / Math.PI };
}
