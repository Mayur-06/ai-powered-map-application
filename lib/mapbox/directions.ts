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

export interface RouteLeg {
  distance: number;
  duration: number;
  steps?: RouteStep[];
}

export interface RouteResult {
  geometry: RouteGeometry;
  distance: number;
  duration: number;
  mode: RouteMode;
  steps: RouteStep[];
  legs?: RouteLeg[];
}

export interface DirectionsOptions {
  origin: [number, number] | { lng: number; lat: number };
  destination: [number, number] | { lng: number; lat: number };
  mode?: RouteMode;
}

export interface MultiStopDirectionsOptions {
  waypoints: ([number, number] | { lng: number; lat: number })[];
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
 * Shared internal helper to route through an ordered list of 2 to 6 coordinates.
 */
async function fetchDirectionsRoute(
  coords: [number, number][],
  mode: RouteMode = 'drive'
): Promise<RouteResult | null> {
  if (coords.length < 2 || coords.length > 6) {
    return null;
  }

  const token = getSecretToken();
  const profile = PROFILE_MAP[mode] || PROFILE_MAP.drive;
  const coordinates = coords.map(([lng, lat]) => `${lng},${lat}`).join(';');

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
  const legs: RouteLeg[] = [];

  if (Array.isArray(primaryRoute.legs)) {
    for (const leg of primaryRoute.legs) {
      const legSteps: RouteStep[] = [];
      if (Array.isArray(leg.steps)) {
        for (const step of leg.steps) {
          const rawLoc = step.maneuver?.location;
          const maneuverLocation: [number, number] =
            Array.isArray(rawLoc) && rawLoc.length >= 2
              ? [Number(rawLoc[0]), Number(rawLoc[1])]
              : [0, 0];

          const routeStep: RouteStep = {
            instruction: step.maneuver?.instruction || step.name || '',
            distance: typeof step.distance === 'number' ? step.distance : 0,
            duration: typeof step.duration === 'number' ? step.duration : 0,
            name: step.name || undefined,
            maneuver: {
              type: step.maneuver?.type,
              modifier: step.maneuver?.modifier,
              location: maneuverLocation,
            },
          };
          steps.push(routeStep);
          legSteps.push(routeStep);
        }
      }
      legs.push({
        distance: typeof leg.distance === 'number' ? leg.distance : 0,
        duration: typeof leg.duration === 'number' ? leg.duration : 0,
        steps: legSteps,
      });
    }
  }

  return {
    geometry: primaryRoute.geometry as RouteGeometry,
    distance: typeof primaryRoute.distance === 'number' ? primaryRoute.distance : 0,
    duration: typeof primaryRoute.duration === 'number' ? primaryRoute.duration : 0,
    mode,
    steps,
    legs,
  };
}

/**
 * Server-side function to fetch directions between origin and destination from Mapbox Directions API.
 * Uses only MAPBOX_SECRET_TOKEN and returns a sanitized, typed RouteResult or null.
 */
export async function getDirections({
  origin,
  destination,
  mode = 'drive',
}: DirectionsOptions): Promise<RouteResult | null> {
  const orig = normalizeCoords(origin);
  const dest = normalizeCoords(destination);
  return fetchDirectionsRoute([orig, dest], mode);
}

/**
 * Server-side function to fetch directions through an ordered list of waypoints (start plus stops, up to 6 coordinates).
 * Returns the existing RouteResult shape plus per-leg distance and duration.
 */
export async function getMultiStopRoute({
  waypoints,
  mode = 'drive',
}: MultiStopDirectionsOptions): Promise<RouteResult | null> {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 6) {
    return null;
  }
  const normalized = waypoints.map(normalizeCoords);
  return fetchDirectionsRoute(normalized, mode);
}
