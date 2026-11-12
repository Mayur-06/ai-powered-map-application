export interface SuggestionItem {
  id: string;
  name: string;
  address: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
}

export interface SuggestOptions {
  q: string;
  session_token: string;
  proximity?: string;
  country?: string;
  language?: string;
  limit?: number;
}

export interface RetrieveOptions {
  id: string;
  session_token: string;
}

export interface ReverseGeocodeOptions {
  lng: number;
  lat: number;
  country?: string;
  language?: string;
}

function getSecretToken(): string {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('MAPBOX_SECRET_TOKEN is not configured on the server');
  }
  return token;
}

/**
 * Call the Mapbox Search Box API suggest endpoint.
 * Returns lightweight suggestion items (id, name, address).
 */
export async function suggest({
  q,
  session_token,
  proximity,
  country = 'in',
  language = 'en',
  limit = 8,
}: SuggestOptions): Promise<SuggestionItem[]> {
  const token = getSecretToken();

  const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
  url.searchParams.set('q', q);
  url.searchParams.set('session_token', session_token);
  url.searchParams.set('access_token', token);
  url.searchParams.set('country', country);
  url.searchParams.set('language', language);
  url.searchParams.set('limit', String(limit));

  if (proximity) {
    url.searchParams.set('proximity', proximity);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Mapbox suggest error:', res.status, errorText);
    throw new Error(`Mapbox suggest request failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  return rawSuggestions.map((item: Record<string, unknown>) => {
    const id = String(item.mapbox_id || item.id || '');
    const name = String(item.name || '');
    const address = String(item.full_address || item.place_formatted || item.address || '');
    return { id, name, address };
  });
}

/**
 * Call the Mapbox Search Box API retrieve endpoint.
 * Returns a typed PlaceResult (id, name, address, lng, lat).
 */
export async function retrieve({
  id,
  session_token,
}: RetrieveOptions): Promise<PlaceResult | null> {
  const token = getSecretToken();

  const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(id)}`);
  url.searchParams.set('session_token', session_token);
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Mapbox retrieve error:', res.status, errorText);
    throw new Error(`Mapbox retrieve request failed with status ${res.status}`);
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  const coords = feature.geometry?.coordinates;
  const lng = typeof coords?.[0] === 'number' ? coords[0] : feature.properties?.coordinates?.longitude;
  const lat = typeof coords?.[1] === 'number' ? coords[1] : feature.properties?.coordinates?.latitude;

  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error('Retrieved feature does not contain valid coordinates');
  }

  const placeId = String(feature.properties?.mapbox_id || feature.id || id);
  const name = String(feature.properties?.name || '');
  const address = String(
    feature.properties?.full_address ||
      feature.properties?.place_formatted ||
      feature.properties?.address ||
      ''
  );

  return {
    id: placeId,
    name,
    address,
    lng,
    lat,
  };
}

/**
 * Call the Mapbox Geocoding API v6 reverse endpoint.
 * Returns a typed PlaceResult (id, name, address, lng, lat).
 */
export async function reverseGeocode({
  lng,
  lat,
  country,
  language = 'en',
}: ReverseGeocodeOptions): Promise<PlaceResult | null> {
  const token = getSecretToken();

  const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('access_token', token);
  url.searchParams.set('language', language);
  url.searchParams.set('limit', '1');

  if (country) {
    url.searchParams.set('country', country);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error('Mapbox reverse geocoding error:', res.status, errorText);
    throw new Error(`Mapbox reverse geocoding request failed with status ${res.status}`);
  }

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) {
    return null;
  }

  const coords = feature.geometry?.coordinates;
  const featureLng = typeof coords?.[0] === 'number' ? coords[0] : lng;
  const featureLat = typeof coords?.[1] === 'number' ? coords[1] : lat;

  const placeId = String(feature.properties?.mapbox_id || feature.id || `${featureLng},${featureLat}`);
  const name = String(
    feature.properties?.name ||
      feature.properties?.name_preferred ||
      feature.properties?.place_formatted ||
      'Selected Location'
  );
  const address = String(
    feature.properties?.full_address ||
      feature.properties?.place_formatted ||
      feature.properties?.address ||
      ''
  );

  return {
    id: placeId,
    name,
    address,
    lng: featureLng,
    lat: featureLat,
  };
}

