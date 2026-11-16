import { point, lineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import along from '@turf/along';
import length from '@turf/length';
import type { RouteGeometry } from './directions';

export interface RerouteFix {
  lng: number;
  lat: number;
  accuracy?: number | null;
}

export interface OffRouteDetectorState {
  consecutiveOffRouteCount: number;
}

export interface OffRouteCheckResult {
  triggered: boolean;
  offRouteDistanceM: number;
  ignored: boolean;
  nextState: OffRouteDetectorState;
}

export interface RerouteTripState {
  rerouteCount: number;
  lastRerouteTimeMs: number | null;
}

export const OFF_ROUTE_THRESHOLD_M = 40;
export const MAX_ACCURACY_M = 50;
export const CONSECUTIVE_FIXES_REQUIRED = 3;
export const COOLDOWN_MS = 15000; // 15 seconds
export const MAX_REROUTES_PER_TRIP = 10;
export const MIN_TRAFFIC_SAVING_SECONDS = 180; // 3 minutes
export const MIN_TRAFFIC_SAVING_RATIO = 0.10; // 10 percent

/**
 * Computes off-route distance in meters from route geometry to fix position.
 * Reuses the same calculation as lib/mapbox/navigation.ts.
 */
export function computeOffRouteDistance(
  geometry: RouteGeometry,
  position: { lng: number; lat: number }
): number {
  if (!geometry?.coordinates || geometry.coordinates.length < 2) {
    return 0;
  }
  const routeLine = lineString(geometry.coordinates);
  const userPoint = point([position.lng, position.lat]);
  const snapped = nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
  return snapped.properties?.dist ?? 0;
}

/**
 * Pure off-route detector:
 * - A fix counts as off-route when offRouteDistanceM is above 40 m.
 * - Trigger after 3 consecutive off-route fixes.
 * - An on-route fix resets the counter.
 * - Ignore fixes whose accuracy is above 50 m when accuracy is available.
 */
export function checkOffRoute(
  fix: RerouteFix,
  geometry: RouteGeometry,
  state: OffRouteDetectorState = { consecutiveOffRouteCount: 0 }
): OffRouteCheckResult {
  // Ignore fixes whose accuracy is above 50 m when accuracy is available
  if (typeof fix.accuracy === 'number' && fix.accuracy > MAX_ACCURACY_M) {
    return {
      triggered: false,
      offRouteDistanceM: 0,
      ignored: true,
      nextState: { consecutiveOffRouteCount: state.consecutiveOffRouteCount },
    };
  }

  const offRouteDistanceM = computeOffRouteDistance(geometry, fix);

  if (offRouteDistanceM > OFF_ROUTE_THRESHOLD_M) {
    const newCount = state.consecutiveOffRouteCount + 1;
    if (newCount >= CONSECUTIVE_FIXES_REQUIRED) {
      return {
        triggered: true,
        offRouteDistanceM,
        ignored: false,
        nextState: { consecutiveOffRouteCount: 0 },
      };
    }
    return {
      triggered: false,
      offRouteDistanceM,
      ignored: false,
      nextState: { consecutiveOffRouteCount: newCount },
    };
  }

  // On-route fix resets the counter
  return {
    triggered: false,
    offRouteDistanceM,
    ignored: false,
    nextState: { consecutiveOffRouteCount: 0 },
  };
}

/**
 * Cooldown and per-trip cap checker:
 * - Cooldown: no reroute within 15 s of the last one.
 * - Cap: maximum 10 reroutes per trip.
 */
export function canTriggerReroute(
  tripState: RerouteTripState,
  nowMs: number = Date.now()
): { allowed: boolean; reason?: 'cooldown' | 'cap_exceeded' } {
  if (tripState.rerouteCount >= MAX_REROUTES_PER_TRIP) {
    return { allowed: false, reason: 'cap_exceeded' };
  }
  if (
    tripState.lastRerouteTimeMs !== null &&
    nowMs - tripState.lastRerouteTimeMs < COOLDOWN_MS
  ) {
    return { allowed: false, reason: 'cooldown' };
  }
  return { allowed: true };
}

/**
 * Checks if two route geometries differ in coordinate points.
 */
export function areGeometriesDifferent(
  geomA?: RouteGeometry | null,
  geomB?: RouteGeometry | null
): boolean {
  if (!geomA || !geomB) return true;
  const cA = geomA.coordinates;
  const cB = geomB.coordinates;
  if (!cA || !cB) return true;
  if (cA.length !== cB.length) return true;
  for (let i = 0; i < cA.length; i++) {
    if (
      Math.abs(cA[i][0] - cB[i][0]) > 0.00001 ||
      Math.abs(cA[i][1] - cB[i][1]) > 0.00001
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Pure traffic-improvement check:
 * Switch only when the new route's duration is at least 180 s and at least 10 percent
 * lower than the current route's remaining duration, and the new geometry differs from the current one.
 */
export function shouldTrafficReroute(
  currentRemainingDurationS: number,
  newRouteDurationS: number,
  currentGeometry?: RouteGeometry | null,
  newGeometry?: RouteGeometry | null
): boolean {
  if (currentRemainingDurationS <= 0) return false;
  const savedDurationS = currentRemainingDurationS - newRouteDurationS;
  if (savedDurationS < MIN_TRAFFIC_SAVING_SECONDS) return false;
  if (savedDurationS / currentRemainingDurationS < MIN_TRAFFIC_SAVING_RATIO) return false;
  if (!areGeometriesDifferent(currentGeometry, newGeometry)) return false;
  return true;
}

/**
 * Computes a coordinate offset approximately perpendicular (90 degrees counter-clockwise)
 * to the route polyline at a given distance along the route.
 */
export function calculatePerpendicularDivert(
  geometry: RouteGeometry,
  atDistanceM: number,
  offsetM: number = 100
): { lng: number; lat: number } {
  if (!geometry?.coordinates || geometry.coordinates.length < 2) {
    return { lng: 0, lat: 0 };
  }

  const line = lineString(geometry.coordinates);
  const totalDistM = length(line, { units: 'meters' });
  const clampedDist = Math.max(0, Math.min(atDistanceM, totalDistM));

  // Sample points near clampedDist to determine local tangent vector
  const pt1Dist = Math.max(0, clampedDist - 2);
  const pt2Dist = Math.min(totalDistM, clampedDist + 2);
  const pt1 = along(line, pt1Dist, { units: 'meters' }).geometry.coordinates;
  const pt2 = along(line, pt2Dist, { units: 'meters' }).geometry.coordinates;

  const latRef = pt1[1];
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((latRef * Math.PI) / 180);

  const dLng = pt2[0] - pt1[0];
  const dLat = pt2[1] - pt1[1];

  const dEast = dLng * metersPerDegLng;
  const dNorth = dLat * metersPerDegLat;
  const hyp = Math.sqrt(dEast * dEast + dNorth * dNorth);

  let perpEast: number;
  let perpNorth: number;

  if (hyp === 0) {
    perpEast = 1;
    perpNorth = 0;
  } else {
    // Normal vector perpendicular to tangent (-dNorth, dEast)
    perpEast = -dNorth / hyp;
    perpNorth = dEast / hyp;
  }

  const currPt = along(line, clampedDist, { units: 'meters' }).geometry.coordinates;

  // Candidate A: 90 deg counter-clockwise
  const candA = {
    lng: currPt[0] + (perpEast * offsetM) / metersPerDegLng,
    lat: currPt[1] + (perpNorth * offsetM) / metersPerDegLat,
  };

  // Candidate B: 90 deg clockwise
  const candB = {
    lng: currPt[0] - (perpEast * offsetM) / metersPerDegLng,
    lat: currPt[1] - (perpNorth * offsetM) / metersPerDegLat,
  };

  // Choose the candidate that is furthest off-route from the polyline (avoids looping roads/roundabouts)
  const distA = computeOffRouteDistance(geometry, candA);
  const distB = computeOffRouteDistance(geometry, candB);

  return distA >= distB ? candA : candB;
}

/**
 * Filter multi-stop waypoints to only those stops not yet passed:
 * uses each stop's projected distance along the current route line compared
 * to user's projected distance, minus 30 m.
 */
export function getRemainingWaypoints(
  currentRouteGeometry: RouteGeometry,
  userPosition: { lng: number; lat: number },
  stops: { lng: number; lat: number }[]
): { lng: number; lat: number }[] {
  if (!stops || stops.length === 0) {
    if (currentRouteGeometry?.coordinates && currentRouteGeometry.coordinates.length > 0) {
      const last = currentRouteGeometry.coordinates[currentRouteGeometry.coordinates.length - 1];
      return [{ lng: last[0], lat: last[1] }];
    }
    return [];
  }

  if (!currentRouteGeometry?.coordinates || currentRouteGeometry.coordinates.length < 2) {
    return stops;
  }

  const routeLine = lineString(currentRouteGeometry.coordinates);
  const snappedUser = nearestPointOnLine(
    routeLine,
    point([userPosition.lng, userPosition.lat]),
    { units: 'meters' }
  );
  const userDist = snappedUser.properties?.location ?? 0;

  // Keep stops whose projected distance along route line >= userDist - 30m
  const remaining = stops.filter((stop) => {
    const snappedStop = nearestPointOnLine(
      routeLine,
      point([stop.lng, stop.lat]),
      { units: 'meters' }
    );
    const stopDist = snappedStop.properties?.location ?? 0;
    return stopDist >= userDist - 30;
  });

  // If all were projected behind, retain the last destination stop
  if (remaining.length === 0 && stops.length > 0) {
    return [stops[stops.length - 1]];
  }

  return remaining;
}
