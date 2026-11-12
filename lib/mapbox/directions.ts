export type RouteMode = 'drive' | 'walk' | 'cycle';

export interface RouteManeuver {
  type?: string;
  modifier?: string;
  location: [number, number];
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name?: string;
  maneuver: RouteManeuver;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteResult {
  geometry: RouteGeometry;
  distance: number;
  duration: number;
  mode: RouteMode;
  steps: RouteStep[];
}

export interface DirectionsOptions {
  origin: [number, number] | { lng: number; lat: number };
  destination: [number, number] | { lng: number; lat: number };
  mode?: RouteMode;
}

const PROFILE_MAP: Record<RouteMode, string> = {
  drive: 'mapbox/driving-traffic',
  walk: 'mapbox/walking',
  cycle: 'mapbox/cycling',
};

function getSecretToken(): string {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('MAPBOX_SECRET_TOKEN is not configured on the server');
  }
  return token;
}

function normalizeCoords(coord: [number, number] | { lng: number; lat: number }): [number, number] {
  if (Array.isArray(coord)) {
    return [coord[0], coord[1]];
  }
  return [coord.lng, coord.lat];
}

/**
 * Server-side function to fetch directions from Mapbox Directions API.
 * Uses only MAPBOX_SECRET_TOKEN and returns a sanitized, typed RouteResult or null.
 */
export async function getDirections({
  origin,
  destination,
  mode = 'drive',
}: DirectionsOptions): Promise<RouteResult | null> {
  const token = getSecretToken();

  const [origLng, origLat] = normalizeCoords(origin);
  const [destLng, destLat] = normalizeCoords(destination);

  const profile = PROFILE_MAP[mode] || PROFILE_MAP.drive;
  const coordinates = `${origLng},${origLat};${destLng},${destLat}`;

  const url = new URL(`https://api.mapbox.com/directions/v5/${profile}/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('banner_instructions', 'true');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString());

  if (!res.ok) {
    if (res.status === 404 || res.status === 422) {
      return null;
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Directions API failed with status ${res.status}`);
  }

  const data = await res.json();

  if (data.code === 'NoRoute' || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }

  const primaryRoute = data.routes[0];

  const steps: RouteStep[] = [];
  if (Array.isArray(primaryRoute.legs)) {
    for (const leg of primaryRoute.legs) {
      if (Array.isArray(leg.steps)) {
        for (const step of leg.steps) {
          const rawLoc = step.maneuver?.location;
          const maneuverLocation: [number, number] =
            Array.isArray(rawLoc) && rawLoc.length >= 2
              ? [Number(rawLoc[0]), Number(rawLoc[1])]
              : [0, 0];

          steps.push({
            instruction: step.maneuver?.instruction || step.name || '',
            distance: typeof step.distance === 'number' ? step.distance : 0,
            duration: typeof step.duration === 'number' ? step.duration : 0,
            name: step.name || undefined,
            maneuver: {
              type: step.maneuver?.type,
              modifier: step.maneuver?.modifier,
              location: maneuverLocation,
            },
          });
        }
      }
    }
  }

  return {
    geometry: primaryRoute.geometry as RouteGeometry,
    distance: typeof primaryRoute.distance === 'number' ? primaryRoute.distance : 0,
    duration: typeof primaryRoute.duration === 'number' ? primaryRoute.duration : 0,
    mode,
    steps,
  };
}
