// Location helpers. Coordinates are snapped to a ~1 km grid before storage and are never sent to other
// users; other users only see county, a coarse distance, and whether you share a county.

export const snap = (n) => Math.round(Number(n) * 100) / 100;

export function distanceKm(a, b) {
  if (a.lat == null || b.lat == null) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Coarse buckets so distance can't be used to triangulate someone.
export function fuzzyKm(km) {
  if (km == null) return null;
  if (km < 2) return 1;
  if (km < 10) return Math.round(km);
  if (km < 50) return Math.round(km / 5) * 5;
  return Math.round(km / 10) * 10;
}

// Same coarse buckets, expressed in miles (what the app shows people).
export function fuzzyMi(km) {
  if (km == null) return null;
  const mi = km * 0.621371;
  if (mi < 1) return 1;
  if (mi < 10) return Math.round(mi);
  if (mi < 50) return Math.round(mi / 5) * 5;
  return Math.round(mi / 10) * 10;
}

// Reverse geocode lat/lng → { county, region, country }.
// Dev: OpenStreetMap Nominatim (free, 1 req/s, needs a User-Agent).
// Prod on AWS: swap for Amazon Location Service `ReverseGeocode` (geo-places), which returns
// SubRegion (county), Region (state) and Country in the same shape.
export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'down-dating-dev/0.1', 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Geocoding failed');
  const { address = {} } = await res.json();
  // City-states and independent cities (Berlin, Rosenheim, Vienna…) have no county, so fall back to the city.
  const county = address.county || address.city || address.town || address.municipality || address.state_district || address.state || '';
  return {
    county,
    // City-states (Berlin, Hamburg) come back without a state; they are their own state.
    region: address.state || county,
    country: (address.country_code || '').toUpperCase(),
  };
}
