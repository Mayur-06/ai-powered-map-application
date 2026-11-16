import { z } from 'zod';

export type OptimizationMode = 'drive' | 'walk' | 'cycle';

export interface OptimizationOptions {
  start: [number, number] | { lng: number; lat: number };
  stops: ([number, number] | { lng: number; lat: number })[];
  mode?: OptimizationMode;
}

export interface OptimizationResult {
  order: number[]; // Visiting order as 0-based indexes into the input `stops` array
  distance: number; // Total distance in meters
  duration: number; // Total duration in seconds
}

export type OptimizationError =
  | 'invalid_stops_count'
  | 'no_route_found'
  | 'optimization_failed';

export type OptimizationResponse =
  | { success: true; data: OptimizationResult }
  | { success: false; error: OptimizationError; message?: string };

const PROFILE_MAP: Record<OptimizationMode, string> = {
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

function normalizeCoords(
  coord: [number, number] | { lng: number; lat: number }
): [number, number] {
  if (Array.isArray(coord)) {
    return [coord[0], coord[1]];
  }
  return [coord.lng, coord.lat];
}

const mapboxWaypointSchema = z.object({
  waypoint_index: z.number(),
  trips_index: z.number().optional(),
  name: z.string().optional(),
  location: z.tuple([z.number(), z.number()]),
});

const mapboxTripSchema = z.object({
  distance: z.number(),
  duration: z.number(),
});

const mapboxResponseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  waypoints: z.array(mapboxWaypointSchema).optional(),
  trips: z.array(mapboxTripSchema).optional(),
});

/**
 * Server-side function to calculate the optimal stop visit order using Mapbox Optimization API v1.
 * Validates inputs and API response with zod; returns a typed response object.
 */
export async function optimizeTrip({
  start,
  stops,
  mode = 'drive',
}: OptimizationOptions): Promise<OptimizationResponse> {
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 5) {
    return {
      success: false,
      error: 'invalid_stops_count',
      message: 'Optimization requires between 2 and 5 stops',
    };
  }

  const token = getSecretToken();
  const startCoord = normalizeCoords(start);
  const stopCoords = stops.map(normalizeCoords);

  const allCoords = [startCoord, ...stopCoords];
  const coordinatesParam = allCoords.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const profile = PROFILE_MAP[mode] || PROFILE_MAP.drive;

  const buildUrl = (destParam: 'any' | 'last') => {
    const u = new URL(`https://api.mapbox.com/optimized-trips/v1/${profile}/${coordinatesParam}`);
    u.searchParams.set('source', 'first');
    u.searchParams.set('destination', destParam);
    u.searchParams.set('roundtrip', 'false');
    u.searchParams.set('overview', 'false');
    u.searchParams.set('steps', 'false');
    u.searchParams.set('geometries', 'geojson');
    u.searchParams.set('access_token', token);
    return u;
  };

  try {
    // Attempt with destination=any first as specified
    let res = await fetch(buildUrl('any').toString());
    let rawData: unknown = await res.json().catch(() => ({}));

    let parsed = mapboxResponseSchema.safeParse(rawData);
    if (!parsed.success) {
      return {
        success: false,
        error: 'optimization_failed',
        message: 'Invalid response from optimization service',
      };
    }

    // Mapbox v1 endpoint returns 'NotImplemented' when roundtrip=false and destination=any,
    // requiring destination=last for open trips. Fallback if needed.
    if (parsed.data.code === 'NotImplemented') {
      res = await fetch(buildUrl('last').toString());
      rawData = await res.json().catch(() => ({}));
      parsed = mapboxResponseSchema.safeParse(rawData);
      if (!parsed.success) {
        return {
          success: false,
          error: 'optimization_failed',
          message: 'Invalid response from optimization service fallback',
        };
      }
    }

    if (
      parsed.data.code !== 'Ok' ||
      !Array.isArray(parsed.data.trips) ||
      parsed.data.trips.length === 0 ||
      !Array.isArray(parsed.data.waypoints) ||
      parsed.data.waypoints.length < allCoords.length
    ) {
      return {
        success: false,
        error: 'no_route_found',
        message: parsed.data.message || 'No route could be found for the given stops',
      };
    }

    const waypoints = parsed.data.waypoints;
    const primaryTrip = parsed.data.trips[0];

    // Compute the visiting order of the stops (excluding the start point at coord index 0).
    // waypoints[i] corresponds to allCoords[i].
    // waypoints[i].waypoint_index is the 0-based step number at which allCoords[i] is visited.
    // We sort the stop coordinates (i = 1 .. stops.length) by their waypoint_index ascending.
    const stopVisitList: { stopIndex: number; visitStep: number }[] = [];
    for (let i = 1; i < allCoords.length; i++) {
      const wp = waypoints[i];
      stopVisitList.push({
        stopIndex: i - 1, // index into input `stops`
        visitStep: wp.waypoint_index,
      });
    }

    stopVisitList.sort((a, b) => a.visitStep - b.visitStep);
    const order = stopVisitList.map((item) => item.stopIndex);

    return {
      success: true,
      data: {
        order,
        distance: Math.round(primaryTrip.distance),
        duration: Math.round(primaryTrip.duration),
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Optimization API request failed';
    return {
      success: false,
      error: 'optimization_failed',
      message: msg,
    };
  }
}
